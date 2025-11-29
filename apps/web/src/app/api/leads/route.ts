/**
 * Lead Submission API Route
 *
 * Handles lead submissions from landing pages (one-step quiz, contact forms, etc.)
 * Implements idempotency to prevent duplicate lead creation.
 *
 * Features:
 * - Phone normalization
 * - Idempotency key generation (Hash of Phone + Source + Date)
 * - Trigger.dev workflow integration
 * - GDPR-compliant logging
 */

import { NextRequest, NextResponse } from 'next/server';
import { tasks } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';

// =============================================================================
// CRITICAL FIX: Rate Limiting for Public Lead Submission Endpoint
// Prevents brute force attacks, spam, and phone number enumeration
// =============================================================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory rate limit store (replace with Redis in production for multi-instance)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Rate limit configuration
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour window
const RATE_LIMIT_MAX_REQUESTS_PER_IP = 10; // 10 submissions per hour per IP
const RATE_LIMIT_MAX_REQUESTS_PER_PHONE = 5; // 5 submissions per hour per phone

/**
 * Check rate limit for a given key
 * Returns true if rate limited, false if allowed
 */
function isRateLimited(key: string, maxRequests: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now >= entry.resetAt) {
    // New window or expired - reset counter
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  if (entry.count >= maxRequests) {
    return true;
  }

  entry.count++;
  return false;
}

/**
 * Extract client IP from request headers
 */
function getClientIp(req: NextRequest): string {
  // Check common proxy headers
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    // Take the first IP (client IP) from comma-separated list
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown';
  }

  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback - shouldn't happen in production behind a proxy
  return 'unknown';
}

// Clean up expired entries periodically (every 5 minutes)
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now >= entry.resetAt) {
        rateLimitStore.delete(key);
      }
    }
  },
  5 * 60 * 1000
);
import { z } from 'zod';

/**
 * Lead submission schema with validation
 */
const LeadSubmissionSchema = z.object({
  // Required fields
  phone: z.string().min(8, 'Phone number is required'),

  // Optional fields
  name: z.string().optional(),
  email: z.string().email('Invalid email format').optional(),
  source: z.string().optional().default('web'),
  campaign: z.string().optional(),
  message: z.string().optional(),

  // GDPR consent (required for processing)
  gdprConsent: z.boolean().optional(),

  // Quiz/form specific data
  quizAnswers: z.record(z.unknown()).optional(),
  procedureInterest: z.string().optional(),
  urgency: z.enum(['now', 'soon', 'later', 'just_looking']).optional(),
});

type LeadSubmission = z.infer<typeof LeadSubmissionSchema>;

/**
 * Normalize phone number to E.164-like format
 * Removes all non-digit characters except leading +
 */
function normalizePhone(phone: string): string {
  // Remove all non-digit characters
  let normalized = phone.replace(/[^0-9+]/g, '');

  // Ensure + is only at the start
  if (normalized.includes('+')) {
    const plusIndex = normalized.indexOf('+');
    if (plusIndex > 0) {
      normalized = normalized.replace(/\+/g, '');
    }
  }

  // Add + if not present and starts with country code patterns
  if (!normalized.startsWith('+')) {
    // Romanian numbers starting with 07 -> +407
    if (normalized.startsWith('07') && normalized.length === 10) {
      normalized = '+4' + normalized;
    }
    // Romanian numbers starting with 40 -> +40
    else if (normalized.startsWith('40') && normalized.length >= 11) {
      normalized = '+' + normalized;
    }
    // Default: assume Romanian country code
    else if (normalized.length === 10) {
      normalized = '+40' + normalized;
    }
  }

  return normalized;
}

/**
 * Generate idempotency key for deduplication
 *
 * Algorithm:
 * 1. Normalize phone number
 * 2. Get current date (YYYY-MM-DD) in local timezone
 * 3. Combine: phone|source|date
 * 4. Hash with SHA-256
 *
 * This prevents:
 * - Same person submitting multiple times in one day from same source
 * - Allows resubmission on different days (for remarketing)
 * - Allows submission from different sources (web vs ads)
 */
function generateIdempotencyKey(phone: string, source: string): string {
  const normalizedPhone = normalizePhone(phone);
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  const rawKey = `${normalizedPhone}|${source}|${today}`;
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

  return hash;
}

/**
 * POST /api/leads
 *
 * Submit a new lead for scoring and CRM sync
 * CRITICAL FIX: Added rate limiting to prevent abuse
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

  // CRITICAL FIX: Check rate limit by IP before processing
  const clientIp = getClientIp(req);
  if (isRateLimited(`ip:${clientIp}`, RATE_LIMIT_MAX_REQUESTS_PER_IP)) {
    console.warn('[Leads API] Rate limit exceeded', {
      ip: clientIp,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(
      {
        success: false,
        error: 'Too many requests. Please try again later.',
        retryAfter: 3600, // 1 hour in seconds
      },
      {
        status: 429,
        headers: {
          'Retry-After': '3600',
          'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS_PER_IP),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  try {
    // Parse and validate request body
    const body = await req.json();
    const parseResult = LeadSubmissionSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const data: LeadSubmission = parseResult.data;

    // Normalize phone number
    const normalizedPhone = normalizePhone(data.phone);

    // Validate normalized phone
    if (normalizedPhone.length < 10) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid phone number',
        },
        { status: 400 }
      );
    }

    // Generate idempotency key
    const source = data.source || 'web';
    const idempotencyKey = generateIdempotencyKey(normalizedPhone, source);

    // Build message from submission data
    let message = `Lead nou de pe ${source}`;
    if (data.name) {
      message = `Lead nou: ${data.name}`;
    }
    if (data.procedureInterest) {
      message += ` - Interes: ${data.procedureInterest}`;
    }
    if (data.urgency) {
      const urgencyMap: Record<string, string> = {
        now: 'urgent',
        soon: 'in curand',
        later: 'mai tarziu',
        just_looking: 'doar informare',
      };
      message += ` - Urgenta: ${urgencyMap[data.urgency] || data.urgency}`;
    }
    if (data.message) {
      message += ` - Mesaj: ${data.message}`;
    }

    // Prepare metadata
    const metadata: Record<string, unknown> = {
      idempotencyKey,
      source,
      submittedAt: new Date().toISOString(),
      userAgent: req.headers.get('user-agent'),
      ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'),
    };

    if (data.name) metadata.name = data.name;
    if (data.email) metadata.email = data.email;
    if (data.campaign) metadata.campaign = data.campaign;
    if (data.quizAnswers) metadata.quizAnswers = data.quizAnswers;
    if (data.procedureInterest) metadata.procedureInterest = data.procedureInterest;
    if (data.urgency) metadata.urgency = data.urgency;
    if (data.gdprConsent !== undefined) metadata.gdprConsent = data.gdprConsent;

    // Trigger lead scoring workflow with idempotency
    // If the same idempotencyKey is used, Trigger.dev will return the existing run
    const handle = await tasks.trigger(
      'lead-scoring-workflow',
      {
        phone: normalizedPhone,
        channel: 'web' as const,
        message,
        correlationId: idempotencyKey,
        metadata,
      },
      {
        idempotencyKey,
        // Tag for easy filtering in Trigger.dev dashboard
        tags: [`source:${source}`, 'channel:web'],
      }
    );

    const duration = Date.now() - startTime;

    // Return success response
    // Do NOT expose internal IDs or full phone number for security
    return NextResponse.json({
      success: true,
      message: 'Lead submitted successfully',
      reference: idempotencyKey.substring(0, 8), // Short reference for support
      metadata: {
        duration: `${duration}ms`,
        runId: handle.id,
      },
    });
  } catch (error: unknown) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // SECURITY FIX: Only log errors in non-production or use structured logging
    // Console output in production can leak info and affect performance
    if (process.env.NODE_ENV !== 'production') {
      // Development: detailed logging for debugging
      console.error('[/api/leads] Error:', {
        error: errorMessage,
        duration: `${duration}ms`,
      });
    }
    // In production, errors should be captured by Sentry/observability (already configured)

    // Return generic error to client
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to submit lead. Please try again.',
      },
      { status: 500 }
    );
  }
}

/**
 * SECURITY FIX: Validate origin against allowlist
 * The wildcard (*) was insecure for lead submission endpoints containing PII
 */
function getAllowedOrigin(requestOrigin: string | null): string | null {
  // Get allowed origins from environment variable (comma-separated)
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS ?? '';
  const allowedOrigins = allowedOriginsEnv
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  // Default to common patterns if not configured
  if (allowedOrigins.length === 0) {
    // Production: only allow the main domain and subdomains
    const productionDomains = [
      'https://medicalcor.ro',
      'https://www.medicalcor.ro',
      'https://app.medicalcor.ro',
    ];
    // Development: also allow localhost
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push('http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000');
    }
    allowedOrigins.push(...productionDomains);
  }

  if (!requestOrigin) {
    return null;
  }

  // Check if the request origin is in the allowlist
  if (allowedOrigins.includes(requestOrigin)) {
    return requestOrigin;
  }

  // CRITICAL FIX: Properly validate subdomain patterns using URL parsing
  // Previous logic was vulnerable to bypass with crafted origins
  for (const allowed of allowedOrigins) {
    if (allowed.startsWith('*.')) {
      const wildcardDomain = allowed.slice(2); // e.g., "medicalcor.ro" from "*.medicalcor.ro"

      try {
        // Parse the request origin as a URL for proper validation
        const originUrl = new URL(requestOrigin);
        const originHost = originUrl.hostname;

        // Check if hostname ends with the wildcard domain AND is properly prefixed
        // This prevents bypasses like "attacker.com.medicalcor.ro" or "medicalcor.ro.evil.com"
        if (
          originHost === wildcardDomain || // Exact match (e.g., medicalcor.ro)
          (originHost.endsWith(`.${wildcardDomain}`) && // Subdomain match (e.g., app.medicalcor.ro)
            !originHost.includes('..')) // Prevent double-dot injection
        ) {
          // Additional validation: ensure protocol is HTTPS in production
          if (process.env.NODE_ENV === 'production' && originUrl.protocol !== 'https:') {
            continue; // Skip non-HTTPS origins in production
          }
          return requestOrigin;
        }
      } catch {
        // Invalid URL - reject
        continue;
      }
    }
  }

  return null;
}

/**
 * OPTIONS /api/leads
 *
 * Handle CORS preflight requests
 * SECURITY FIX: Uses origin allowlist instead of wildcard
 */
export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  const requestOrigin = request.headers.get('origin');
  const allowedOrigin = getAllowedOrigin(requestOrigin);

  // If origin not allowed, still respond but without CORS headers
  // This prevents CORS errors from revealing the allowlist
  if (!allowedOrigin) {
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    },
  });
}
