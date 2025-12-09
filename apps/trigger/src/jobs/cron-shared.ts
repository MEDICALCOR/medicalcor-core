import { logger } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';
import { createEventStore, createInMemoryEventStore } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared utilities for cron jobs
 * Extracted from cron-jobs.ts to reduce file size and improve maintainability
 */

// ============================================
// Types
// ============================================

/**
 * HubSpot contact search result type
 */
export interface HubSpotContactResult {
  id: string;
  properties: Record<string, string | undefined>;
}

/**
 * Consent types supported by the system
 */
export type ConsentType =
  | 'marketing'
  | 'appointment_reminders'
  | 'treatment_updates'
  | 'data_processing';

/**
 * Supabase client configuration result
 * Uses any types intentionally because we don't have a generated schema for cron jobs
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseClientAny = SupabaseClient<any, any, any>;

export interface SupabaseClientResult {
  client: SupabaseClientAny | null;
  error: string | null;
}

// ============================================
// Client Initialization
// ============================================

export function getClients() {
  const databaseUrl = process.env.DATABASE_URL;

  // Use shared client factory
  const clients = createIntegrationClients({
    source: 'cron-jobs',
    includeScheduling: true,
  });

  const eventStore = databaseUrl
    ? createEventStore({ source: 'cron-jobs', connectionString: databaseUrl })
    : createInMemoryEventStore('cron-jobs');

  return {
    hubspot: clients.hubspot,
    whatsapp: clients.whatsapp,
    scheduling: clients.scheduling,
    eventStore,
  };
}

// ============================================
// Supabase Client Factory
// ============================================

/**
 * Get or create a Supabase client for cron jobs
 *
 * Centralized factory to avoid duplicating Supabase client initialization
 * across multiple cron job functions. Handles environment variable resolution
 * and validation.
 *
 * @returns Supabase client or error message if not configured
 */
export async function getSupabaseClient(): Promise<SupabaseClientResult> {
  const { createClient } = await import('@supabase/supabase-js');

  // Resolve Supabase URL (check both standard and Next.js public env vars)
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

  // Use service key for server-side operations, fallback to anon key
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      client: null,
      error: 'Supabase credentials not configured (SUPABASE_URL and SUPABASE_SERVICE_KEY required)',
    };
  }

  const client = createClient(supabaseUrl, supabaseKey);
  return { client, error: null };
}

// ============================================
// GDPR Consent Verification
// ============================================

/**
 * CRITICAL GDPR FIX: Helper function to verify contact has valid consent
 * Returns true only if the contact has explicitly consented to the specified type
 *
 * @param contact - HubSpot contact with properties
 * @param consentType - Type of consent to check
 * @returns true if contact has valid consent, false otherwise
 */
export function hasValidConsent(contact: HubSpotContactResult, consentType: ConsentType): boolean {
  const props = contact.properties;

  // Check specific consent property first
  const specificConsentProp = `consent_${consentType}`;
  if (props[specificConsentProp] === 'true') {
    return true;
  }

  // For appointment_reminders, also accept treatment_updates consent
  if (consentType === 'appointment_reminders' && props.consent_treatment_updates === 'true') {
    return true;
  }

  // Do NOT fall back to general marketing consent for medical communications
  // This would violate GDPR's principle of specific consent

  return false;
}

/**
 * Log consent check failure for audit trail
 */
export function logConsentDenied(
  contactId: string,
  consentType: ConsentType,
  correlationId: string
): void {
  logger.info('Message not sent - consent not granted', {
    contactId,
    consentType,
    correlationId,
    reason: 'GDPR_CONSENT_MISSING',
  });
}

// ============================================
// Batch Processing Constants
// ============================================

/**
 * Batch size for parallel API calls
 * Prevents overwhelming external services while improving throughput
 */
export const BATCH_SIZE = 10;

/**
 * Retry configuration for batch item processing
 */
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

/**
 * Execute a function with exponential backoff retry
 * @param fn - Async function to execute
 * @param maxRetries - Maximum retry attempts
 * @param baseDelayMs - Initial delay in milliseconds
 * @param maxDelayMs - Maximum delay cap in milliseconds
 * @returns Result of the function
 */
export async function withExponentialRetry<T>(
  fn: () => Promise<T>,
  maxRetries = RETRY_CONFIG.maxRetries,
  baseDelayMs = RETRY_CONFIG.baseDelayMs,
  maxDelayMs = RETRY_CONFIG.maxDelayMs
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      if (!isRetryable) {
        break;
      }

      // SECURITY: Use crypto-secure randomness for jitter calculation
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt);
      const randomBytes = new Uint32Array(1);
      crypto.getRandomValues(randomBytes);
      const jitter = (randomBytes[0]! / 0xffffffff) * 0.3 * exponentialDelay; // 30% jitter
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    // Retry on network errors, rate limits, and server errors
    if (message.includes('rate_limit') || message.includes('429')) return true;
    if (message.includes('timeout')) return true;
    if (message.includes('502') || message.includes('503') || message.includes('504')) return true;
    if (message.includes('network') || message.includes('econnreset')) return true;
    if (message.includes('socket hang up')) return true;
  }
  return false;
}

/**
 * Process items in batches using Promise.allSettled for resilience
 * CRITICAL FIX: Now includes exponential backoff retry for individual items
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param loggerInstance - Logger for batch progress
 * @param options - Processing options
 * @returns Object with success count and errors array
 */
export async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  loggerInstance: { info: (msg: string, meta?: Record<string, unknown>) => void },
  options: {
    enableRetry?: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
  } = {}
): Promise<{ successes: number; errors: { item: T; error: unknown }[] }> {
  const {
    enableRetry = true,
    maxRetries = RETRY_CONFIG.maxRetries,
    baseDelayMs = RETRY_CONFIG.baseDelayMs,
  } = options;

  let successes = 0;
  const errors: { item: T; error: unknown }[] = [];

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(items.length / BATCH_SIZE);

    loggerInstance.info(`Processing batch ${batchNum}/${totalBatches}`, {
      batchSize: batch.length,
    });

    // Wrap processor with retry logic if enabled
    const processWithRetry = enableRetry
      ? (item: T) => withExponentialRetry(() => processor(item), maxRetries, baseDelayMs)
      : processor;

    const results = await Promise.allSettled(batch.map(processWithRetry));

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result?.status === 'fulfilled') {
        successes++;
      } else if (result?.status === 'rejected') {
        errors.push({ item: batch[j] as T, error: result.reason });
      }
    }
  }

  return { successes, errors };
}

// ============================================
// Date Helper Functions
// ============================================

export function generateCorrelationId(): string {
  return `cron_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export function sixMonthsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 6);
  return date.getTime().toString();
}

export function sevenDaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.getTime().toString();
}

export function ninetyDaysAgo(): string {
  const date = new Date();
  date.setDate(date.getDate() - 90);
  return date.getTime().toString();
}

export function almostTwoYearsAgo(): string {
  const date = new Date();
  date.setMonth(date.getMonth() - 23); // 23 months = almost 2 years
  return date.getTime().toString();
}

export function isIn24Hours(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours > 23 && diffHours <= 25; // 23-25 hours window
}

export function isIn2Hours(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  const diffHours = (date.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diffHours > 1.5 && diffHours <= 2.5; // 1.5-2.5 hours window
}

export function formatDate(dateStr: string, language: 'ro' | 'en' | 'de' = 'ro'): string {
  const date = new Date(dateStr);
  const formatters: Record<string, Intl.DateTimeFormat> = {
    ro: new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' }),
    en: new Intl.DateTimeFormat('en-US', { weekday: 'long', day: 'numeric', month: 'long' }),
    de: new Intl.DateTimeFormat('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
  return formatters[language]?.format(date) ?? date.toLocaleDateString();
}

export function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}

// ============================================
// Event Emission
// ============================================

/**
 * Event store interface for job events
 */
export interface EventStoreEmitter {
  emit: (input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateType?: string;
  }) => Promise<unknown>;
}

/**
 * Emit job completion or failure event
 */
export async function emitJobEvent(
  eventStore: EventStoreEmitter,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || generateCorrelationId();
  try {
    await eventStore.emit({
      type,
      correlationId,
      payload,
      aggregateType: 'cron',
    });
  } catch (error) {
    logger.warn('Failed to emit job event', { type, error });
  }
}

// ============================================
// Report Formatting
// ============================================

/**
 * Format weekly report for notifications
 */
export function formatWeeklyReport(metrics: {
  newLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  conversions: number;
  period: string;
  generatedAt: string;
}): string {
  return `
📊 Weekly Analytics Report
Period: ${metrics.period}
Generated: ${new Date(metrics.generatedAt).toLocaleString('ro-RO')}

📈 Lead Activity:
• New leads: ${metrics.newLeads}
• Hot leads: ${metrics.hotLeads}
• Warm leads: ${metrics.warmLeads}
• Cold leads: ${metrics.coldLeads}

🎯 Conversions: ${metrics.conversions}

💡 Conversion Rate: ${metrics.newLeads > 0 ? ((metrics.conversions / metrics.newLeads) * 100).toFixed(1) : 0}%
  `.trim();
}
