import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock @medicalcor/core
const mockEventStore = {
  emit: vi.fn(),
  subscribe: vi.fn(),
};

const mockInMemoryEventStore = {
  emit: vi.fn(),
  subscribe: vi.fn(),
};

vi.mock('@medicalcor/core', () => ({
  createEventStore: vi.fn(() => mockEventStore),
  createInMemoryEventStore: vi.fn(() => mockInMemoryEventStore),
}));

// Mock @medicalcor/integrations
const mockClients = {
  hubspot: { search: vi.fn() },
  whatsapp: { sendMessage: vi.fn() },
  scheduling: { getAppointments: vi.fn() },
};

vi.mock('@medicalcor/integrations', () => ({
  createIntegrationClients: vi.fn(() => mockClients),
}));

// Mock @supabase/supabase-js
const mockSupabaseClient = {
  from: vi.fn(),
  auth: { getUser: vi.fn() },
};

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseClient),
}));

import { getClients, getSupabaseClient } from '../clients.js';
import { createIntegrationClients } from '@medicalcor/integrations';
import { createInMemoryEventStore } from '@medicalcor/core';

describe('clients', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getClients', () => {
    it('should return integration clients', () => {
      const clients = getClients();

      expect(createIntegrationClients).toHaveBeenCalledWith({
        source: 'cron-jobs',
        includeScheduling: true,
      });
      expect(clients.hubspot).toBe(mockClients.hubspot);
      expect(clients.whatsapp).toBe(mockClients.whatsapp);
      expect(clients.scheduling).toBe(mockClients.scheduling);
    });

    it('should use in-memory event store when DATABASE_URL is not set', () => {
      // DATABASE_URL is not set in test environment
      const clients = getClients();

      expect(createInMemoryEventStore).toHaveBeenCalledWith('cron-jobs');
      expect(clients.eventStore).toBeDefined();
    });

    it('should return eventStore', () => {
      const clients = getClients();
      expect(clients.eventStore).toBeDefined();
    });
  });

  describe('getSupabaseClient', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
      // Reset env vars for each test
      delete process.env.SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;
      delete process.env.SUPABASE_ANON_KEY;
    });

    afterEach(() => {
      // Restore original env
      process.env = { ...originalEnv };
    });

    it('should return error when SUPABASE_URL is not configured', async () => {
      const result = await getSupabaseClient();

      expect(result.client).toBeNull();
      expect(result.error).toBe(
        'Supabase credentials not configured (SUPABASE_URL and SUPABASE_SERVICE_KEY required)'
      );
    });

    it('should return error when only SUPABASE_URL is configured', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';

      const result = await getSupabaseClient();

      expect(result.client).toBeNull();
      expect(result.error).toContain('not configured');
    });

    it('should create Supabase client when both URL and key are configured', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_SERVICE_KEY = 'service-key-123';
      const { createClient } = await import('@supabase/supabase-js');

      const result = await getSupabaseClient();

      expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'service-key-123');
      expect(result.client).toBe(mockSupabaseClient);
      expect(result.error).toBeNull();
    });

    it('should use NEXT_PUBLIC_SUPABASE_URL as fallback', async () => {
      process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://public.supabase.co';
      process.env.SUPABASE_SERVICE_KEY = 'service-key-123';
      const { createClient } = await import('@supabase/supabase-js');

      const result = await getSupabaseClient();

      expect(createClient).toHaveBeenCalledWith('https://public.supabase.co', 'service-key-123');
      expect(result.error).toBeNull();
    });

    it('should use SUPABASE_ANON_KEY as fallback', async () => {
      process.env.SUPABASE_URL = 'https://test.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'anon-key-456';
      const { createClient } = await import('@supabase/supabase-js');

      const result = await getSupabaseClient();

      expect(createClient).toHaveBeenCalledWith('https://test.supabase.co', 'anon-key-456');
      expect(result.error).toBeNull();
    });
  });
});
