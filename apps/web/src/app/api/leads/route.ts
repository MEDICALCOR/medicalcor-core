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
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();

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

    // Log error without exposing PII
    console.error('[/api/leads] Error:', {
      error: errorMessage,
      duration: `${duration}ms`,
    });

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
 * Get allowed CORS origins from environment
 * SECURITY: Restricts API access to trusted domains only
 */
function getAllowedOrigins(): string[] {
  const envOrigins = process.env.ALLOWED_CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map((origin) => origin.trim());
  }
  // Default allowed origins for production
  // SECURITY: Always explicitly list allowed domains - never use '*' in production
  return [
    'https://medicalcor.ro',
    'https://www.medicalcor.ro',
    'https://app.medicalcor.ro',
    // Development origins (only in dev mode)
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://localhost:3001'] : []),
  ];
}

/**
 * Validate origin against allowed list
 * SECURITY: Prevents unauthorized cross-origin requests
 */
function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  const allowedOrigins = getAllowedOrigins();
  return allowedOrigins.includes(origin);
}

/**
 * OPTIONS /api/leads
 *
 * Handle CORS preflight requests
 * SECURITY: Only allows requests from trusted origins
 */
export async function OPTIONS(req: NextRequest): Promise<NextResponse> {
  const origin = req.headers.get('origin');
  const allowedOrigin = isOriginAllowed(origin) ? origin : null;

  // If origin is not allowed, return 403
  if (!allowedOrigin) {
    return new NextResponse(null, {
      status: 403,
      statusText: 'Origin not allowed',
    });
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
