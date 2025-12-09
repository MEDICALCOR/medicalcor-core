/**
 * Shared types for cron jobs
 */

import type { SupabaseClient } from '@supabase/supabase-js';

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

/**
 * Event store interface for emitting job events
 */
export interface EventStoreEmitter {
  emit: (input: {
    type: string;
    correlationId: string;
    payload: Record<string, unknown>;
    aggregateType?: string;
  }) => Promise<unknown>;
}
