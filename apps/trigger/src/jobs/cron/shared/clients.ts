/**
 * Client initialization for cron jobs
 */

import { createEventStore, createInMemoryEventStore } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import type { SupabaseClientResult } from './types.js';

/**
 * Get integration clients for cron jobs
 */
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
