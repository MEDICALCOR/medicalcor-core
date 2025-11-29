/**
 * Mock CRM Adapter
 *
 * State-of-the-art mock implementation for testing and development.
 * Provides configurable behavior, realistic data generation, and
 * comprehensive health check capabilities.
 *
 * Features:
 * - Full ICRMProvider interface implementation
 * - Configurable scenarios (success, partial, error)
 * - Latency simulation for realistic testing
 * - Error injection for resilience testing
 * - In-memory state for integration tests
 * - Health check API compatibility
 * - Zod-validated configuration
 *
 * Usage:
 * ```typescript
 * const mock = new MockCrmAdapter({ scenario: 'success' });
 * const lead = mock.parseContactWebhook(payload);
 * ```
 */

import { z } from 'zod';
import type { ICRMProvider, LeadDTO, TreatmentPlanDTO } from '@medicalcor/types';
import { createLogger, type Logger } from '@medicalcor/core';

// =============================================================================
// Configuration Schema
// =============================================================================

/**
 * Mock CRM scenario types
 */
export const MockCrmScenarioSchema = z.enum([
  'success', // All operations succeed
  'partial', // Some operations fail randomly
  'error', // All operations fail
  'slow', // Operations succeed but with latency
  'flaky', // Intermittent failures (50% chance)
]);

export type MockCrmScenario = z.infer<typeof MockCrmScenarioSchema>;

/**
 * Mock CRM configuration
 */
export const MockCrmConfigSchema = z.object({
  /** Scenario to simulate */
  scenario: MockCrmScenarioSchema.default('success'),

  /** Base latency in milliseconds (0 for instant) */
  baseLatencyMs: z.number().int().min(0).max(10000).default(0),

  /** Latency variance (+/- this value) */
  latencyVarianceMs: z.number().int().min(0).max(5000).default(0),

  /** Error rate for 'partial' scenario (0.0 to 1.0) */
  errorRate: z.number().min(0).max(1).default(0.2),

  /** Seed for deterministic random behavior (optional) */
  seed: z.number().int().optional(),

  /** Enable verbose logging */
  verbose: z.boolean().default(false),

  /** Custom source name override */
  sourceName: z.string().min(1).default('mock'),

  /** Simulate specific error types */
  errorType: z.enum(['network', 'auth', 'validation', 'rate_limit', 'server']).optional(),
});

export type MockCrmConfig = z.infer<typeof MockCrmConfigSchema>;

// =============================================================================
// Error Types
// =============================================================================

/**
 * Mock CRM error for testing error handling
 */
export class MockCrmError extends Error {
  public readonly code: string;
  public readonly isRetryable: boolean;
  public readonly statusCode: number;

  constructor(message: string, code: string, statusCode: number, isRetryable: boolean) {
    super(message);
    this.name = 'MockCrmError';
    this.code = code;
    this.statusCode = statusCode;
    this.isRetryable = isRetryable;
    Error.captureStackTrace(this, this.constructor);
  }
}

// =============================================================================
// Health Check Types
// =============================================================================

/**
 * CRM health check result
 */
export interface CrmHealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latencyMs: number;
  message?: string;
  details: {
    scenario: MockCrmScenario;
    connectionStatus: 'connected' | 'disconnected' | 'degraded';
    apiVersion?: string;
    rateLimitRemaining?: number;
    lastSuccessfulCall?: Date;
  };
}

// =============================================================================
// In-Memory Store for Integration Tests
// =============================================================================

interface MockDataStore {
  leads: Map<string, LeadDTO>;
  treatmentPlans: Map<string, TreatmentPlanDTO>;
  webhooksReceived: { timestamp: Date; type: string; payload: unknown }[];
  lastHealthCheck?: Date;
}

// =============================================================================
// Mock CRM Adapter Implementation
// =============================================================================

/**
 * Mock CRM Adapter
 *
 * Implements ICRMProvider for testing and development.
 * Supports multiple scenarios for comprehensive testing.
 */
export class MockCrmAdapter implements ICRMProvider {
  public readonly sourceName: string;

  private readonly config: MockCrmConfig;
  private readonly logger: Logger;
  private readonly store: MockDataStore;
  private callCount = 0;
  private lastCallTime?: Date;

  constructor(config: Partial<MockCrmConfig> = {}) {
    // Validate and merge config with defaults
    const parsed = MockCrmConfigSchema.parse(config);
    this.config = parsed;
    this.sourceName = parsed.sourceName;

    this.logger = createLogger({
      name: 'mock-crm-adapter',
      level: parsed.verbose ? 'debug' : 'info',
    });

    // Initialize in-memory store
    this.store = {
      leads: new Map(),
      treatmentPlans: new Map(),
      webhooksReceived: [],
    };

    this.logger.info(
      { scenario: this.config.scenario, sourceName: this.sourceName },
      'MockCrmAdapter initialized'
    );
  }

  // ===========================================================================
  // ICRMProvider Interface Implementation
  // ===========================================================================

  /**
   * Parse a contact webhook payload into a LeadDTO
   */
  parseContactWebhook(payload: unknown): LeadDTO | null {
    this.callCount++;
    this.lastCallTime = new Date();

    // Record webhook for testing
    this.store.webhooksReceived.push({
      timestamp: new Date(),
      type: 'contact',
      payload,
    });

    // Apply scenario behavior
    if (this.shouldFail()) {
      this.logger.warn({ scenario: this.config.scenario }, 'Simulating failure');
      this.throwScenarioError();
    }

    // Simulate latency
    this.simulateLatency();

    // Validate payload structure
    if (!payload || typeof payload !== 'object') {
      this.logger.debug('Invalid payload: not an object');
      return null;
    }

    const data = this.extractPayloadData(payload);
    if (!data) {
      this.logger.debug('Could not extract payload data');
      return null;
    }

    // Extract contact ID
    const contactId = this.extractId(data);
    if (!contactId) {
      this.logger.debug('No contact ID found in payload');
      return null;
    }

    // Extract phone (required)
    const phone = this.extractPhone(data);
    if (!phone) {
      this.logger.debug({ contactId }, 'No phone found in payload');
      return null;
    }

    // Build LeadDTO
    const lead: LeadDTO = {
      externalSource: this.sourceName,
      externalContactId: contactId,
      externalUrl: `https://mock-crm.example.com/contacts/${contactId}`,

      fullName: this.extractString(data, ['name', 'full_name', 'fullName']),
      phone,
      email: this.extractString(data, ['email', 'email_address']),

      language: this.extractString(data, ['language', 'lang', 'locale']) ?? 'ro',
      source: this.extractString(data, ['source', 'lead_source', 'utm_source']) ?? 'mock_webhook',
      acquisitionChannel: this.extractString(data, ['channel', 'acquisition_channel']),
      adCampaignId: this.extractString(data, ['campaign_id', 'ad_campaign_id', 'gclid']),

      gdprConsent: this.extractBoolean(data, ['gdpr_consent', 'consent', 'marketing_consent']),
      gdprConsentAt: this.extractBoolean(data, ['gdpr_consent']) ? new Date() : undefined,
      gdprConsentSource: this.extractBoolean(data, ['gdpr_consent']) ? 'mock_crm_sync' : undefined,

      status: 'new',

      metadata: {
        mock_source: 'webhook',
        processed_at: new Date().toISOString(),
      },
    };

    // Store for later retrieval
    this.store.leads.set(contactId, lead);

    this.logger.debug({ contactId, phone }, 'Parsed contact webhook');

    return lead;
  }

  /**
   * Parse a deal webhook payload into a TreatmentPlanDTO
   */
  parseDealWebhook(payload: unknown): TreatmentPlanDTO | null {
    this.callCount++;
    this.lastCallTime = new Date();

    // Record webhook for testing
    this.store.webhooksReceived.push({
      timestamp: new Date(),
      type: 'deal',
      payload,
    });

    // Apply scenario behavior
    if (this.shouldFail()) {
      this.logger.warn({ scenario: this.config.scenario }, 'Simulating failure');
      this.throwScenarioError();
    }

    // Simulate latency
    this.simulateLatency();

    // Validate payload structure
    if (!payload || typeof payload !== 'object') {
      this.logger.debug('Invalid payload: not an object');
      return null;
    }

    const data = this.extractPayloadData(payload);
    if (!data) {
      this.logger.debug('Could not extract payload data');
      return null;
    }

    // Extract deal ID
    const dealId = this.extractId(data);
    if (!dealId) {
      this.logger.debug('No deal ID found in payload');
      return null;
    }

    // Extract person/contact ID (required for linking)
    const personId = this.extractString(data, ['person_id', 'contact_id', 'lead_id']);
    if (!personId) {
      this.logger.debug({ dealId }, 'No person ID found in deal payload');
      return null;
    }

    // Determine deal status
    const statusStr = this.extractString(data, ['status', 'deal_status']);
    const isWon = statusStr === 'won';
    const isLost = statusStr === 'lost';

    // Build TreatmentPlanDTO
    const plan: TreatmentPlanDTO = {
      externalSource: this.sourceName,
      externalDealId: dealId,
      leadExternalId: personId,
      doctorExternalUserId: this.extractString(data, ['user_id', 'owner_id', 'doctor_id']),

      name: this.extractString(data, ['title', 'name', 'deal_name']),
      totalValue: this.extractNumber(data, ['value', 'amount', 'total_value']) ?? 0,
      currency: this.extractString(data, ['currency']) ?? 'EUR',

      stage: this.extractString(data, ['stage', 'stage_id', 'pipeline_stage']) ?? 'unknown',
      probability:
        this.extractNumber(data, ['probability', 'win_probability']) ?? (isWon ? 100 : 0),

      isAccepted: isWon,
      acceptedAt: isWon ? new Date() : null,
      rejectedReason: isLost ? this.extractString(data, ['lost_reason', 'rejection_reason']) : null,

      notes: `Mock CRM Deal: ${dealId}`,
    };

    // Store for later retrieval
    this.store.treatmentPlans.set(dealId, plan);

    this.logger.debug({ dealId, personId }, 'Parsed deal webhook');

    return plan;
  }

  // ===========================================================================
  // Health Check API
  // ===========================================================================

  /**
   * Check CRM health status
   */
  async checkHealth(): Promise<CrmHealthCheckResult> {
    const startTime = Date.now();
    this.store.lastHealthCheck = new Date();

    // Simulate latency
    await this.simulateLatencyAsync();

    const latencyMs = Date.now() - startTime;

    // Determine health based on scenario
    switch (this.config.scenario) {
      case 'error':
        return {
          status: 'unhealthy',
          latencyMs,
          message: 'CRM is in error simulation mode',
          details: {
            scenario: this.config.scenario,
            connectionStatus: 'disconnected',
            apiVersion: '1.0.0-mock',
          },
        };

      case 'slow': {
        const slowDetails: CrmHealthCheckResult['details'] = {
          scenario: this.config.scenario,
          connectionStatus: latencyMs > 5000 ? 'degraded' : 'connected',
          apiVersion: '1.0.0-mock',
        };
        if (this.lastCallTime !== undefined) {
          slowDetails.lastSuccessfulCall = this.lastCallTime;
        }
        const slowResult: CrmHealthCheckResult = {
          status: latencyMs > 3000 ? 'degraded' : 'healthy',
          latencyMs,
          details: slowDetails,
        };
        if (latencyMs > 3000) {
          slowResult.message = 'High latency detected';
        }
        return slowResult;
      }

      case 'flaky': {
        const isUp = Math.random() > 0.3; // 70% chance of being healthy
        const flakyDetails: CrmHealthCheckResult['details'] = {
          scenario: this.config.scenario,
          connectionStatus: isUp ? 'connected' : 'degraded',
          apiVersion: '1.0.0-mock',
          rateLimitRemaining: Math.floor(Math.random() * 1000),
        };
        if (this.lastCallTime !== undefined) {
          flakyDetails.lastSuccessfulCall = this.lastCallTime;
        }
        const flakyResult: CrmHealthCheckResult = {
          status: isUp ? 'healthy' : 'degraded',
          latencyMs,
          details: flakyDetails,
        };
        if (!isUp) {
          flakyResult.message = 'Intermittent connectivity issues';
        }
        return flakyResult;
      }

      case 'partial': {
        const partialDetails: CrmHealthCheckResult['details'] = {
          scenario: this.config.scenario,
          connectionStatus: 'degraded',
          apiVersion: '1.0.0-mock',
          rateLimitRemaining: 500,
        };
        if (this.lastCallTime !== undefined) {
          partialDetails.lastSuccessfulCall = this.lastCallTime;
        }
        return {
          status: 'degraded',
          latencyMs,
          message: 'Some CRM features may be unavailable',
          details: partialDetails,
        };
      }

      case 'success':
      default: {
        const successDetails: CrmHealthCheckResult['details'] = {
          scenario: this.config.scenario,
          connectionStatus: 'connected',
          apiVersion: '1.0.0-mock',
          rateLimitRemaining: 1000,
        };
        if (this.lastCallTime !== undefined) {
          successDetails.lastSuccessfulCall = this.lastCallTime;
        }
        return {
          status: 'healthy',
          latencyMs,
          details: successDetails,
        };
      }
    }
  }

  // ===========================================================================
  // Test Utilities
  // ===========================================================================

  /**
   * Get all stored leads (for testing)
   */
  getStoredLeads(): LeadDTO[] {
    return Array.from(this.store.leads.values());
  }

  /**
   * Get all stored treatment plans (for testing)
   */
  getStoredTreatmentPlans(): TreatmentPlanDTO[] {
    return Array.from(this.store.treatmentPlans.values());
  }

  /**
   * Get webhook history (for testing)
   */
  getWebhookHistory(): { timestamp: Date; type: string; payload: unknown }[] {
    return [...this.store.webhooksReceived];
  }

  /**
   * Get call statistics
   */
  getStats(): {
    callCount: number;
    lastCallTime?: Date;
    storedLeads: number;
    storedPlans: number;
  } {
    const stats: {
      callCount: number;
      lastCallTime?: Date;
      storedLeads: number;
      storedPlans: number;
    } = {
      callCount: this.callCount,
      storedLeads: this.store.leads.size,
      storedPlans: this.store.treatmentPlans.size,
    };
    if (this.lastCallTime !== undefined) {
      stats.lastCallTime = this.lastCallTime;
    }
    return stats;
  }

  /**
   * Reset adapter state (for testing)
   */
  reset(): void {
    this.store.leads.clear();
    this.store.treatmentPlans.clear();
    this.store.webhooksReceived.length = 0;
    this.callCount = 0;
    // Cast through unknown to reset the optional property
    (this as unknown as { lastCallTime: Date | undefined }).lastCallTime = undefined;
    this.logger.debug('MockCrmAdapter state reset');
  }

  /**
   * Create a sample contact webhook payload (for testing)
   */
  static createSampleContactPayload(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return {
      id: `mock_${Date.now()}`,
      name: 'Test Contact',
      phone: [{ value: '+40712345678', primary: true }],
      email: [{ value: 'test@example.com', primary: true }],
      language: 'ro',
      source: 'website',
      gdpr_consent: true,
      ...overrides,
    };
  }

  /**
   * Create a sample deal webhook payload (for testing)
   */
  static createSampleDealPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: `deal_${Date.now()}`,
      title: 'Test Treatment Plan',
      person_id: `mock_${Date.now()}`,
      value: 1500,
      currency: 'EUR',
      status: 'open',
      stage: 'consultation',
      probability: 50,
      ...overrides,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  /**
   * Check if this call should fail based on scenario
   */
  private shouldFail(): boolean {
    switch (this.config.scenario) {
      case 'error':
        return true;
      case 'partial':
        return Math.random() < this.config.errorRate;
      case 'flaky':
        return Math.random() < 0.5;
      case 'success':
      case 'slow':
        return false;
      default:
        // Exhaustive check - this should never be reached
        return false;
    }
  }

  /**
   * Throw an error based on configured error type
   */
  private throwScenarioError(): never {
    const errorType = this.config.errorType ?? 'server';

    switch (errorType) {
      case 'network':
        throw new MockCrmError('Network timeout', 'NETWORK_ERROR', 0, true);
      case 'auth':
        throw new MockCrmError('Invalid API credentials', 'AUTH_ERROR', 401, false);
      case 'validation':
        throw new MockCrmError('Invalid request payload', 'VALIDATION_ERROR', 400, false);
      case 'rate_limit':
        throw new MockCrmError('Rate limit exceeded', 'RATE_LIMIT_ERROR', 429, true);
      case 'server':
      default:
        throw new MockCrmError('Internal server error', 'SERVER_ERROR', 500, true);
    }
  }

  /**
   * Simulate latency (sync version)
   */
  private simulateLatency(): void {
    if (this.config.baseLatencyMs === 0 && this.config.scenario !== 'slow') {
      return;
    }

    const baseLatency = this.config.scenario === 'slow' ? 1000 : this.config.baseLatencyMs;
    const variance = this.config.latencyVarianceMs;
    const jitter = variance > 0 ? Math.random() * variance * 2 - variance : 0;
    const totalLatency = Math.max(0, baseLatency + jitter);

    // Use blocking sleep for sync methods
    const start = Date.now();
    while (Date.now() - start < totalLatency) {
      // Busy wait (not ideal but necessary for sync)
    }
  }

  /**
   * Simulate latency (async version)
   */
  private async simulateLatencyAsync(): Promise<void> {
    if (this.config.baseLatencyMs === 0 && this.config.scenario !== 'slow') {
      return;
    }

    const baseLatency = this.config.scenario === 'slow' ? 1000 : this.config.baseLatencyMs;
    const variance = this.config.latencyVarianceMs;
    const jitter = variance > 0 ? Math.random() * variance * 2 - variance : 0;
    const totalLatency = Math.max(0, baseLatency + jitter);

    await new Promise((resolve) => setTimeout(resolve, totalLatency));
  }

  /**
   * Extract data from webhook payload (handles various formats)
   */
  private extractPayloadData(payload: unknown): Record<string, unknown> | null {
    if (!payload || typeof payload !== 'object') return null;

    const p = payload as Record<string, unknown>;

    // Handle 'current' wrapper (Pipedrive style)
    if (p.current && typeof p.current === 'object') {
      return p.current as Record<string, unknown>;
    }

    // Handle 'data' wrapper
    if (p.data && typeof p.data === 'object') {
      return p.data as Record<string, unknown>;
    }

    return p;
  }

  /**
   * Extract ID from payload
   */
  private extractId(data: Record<string, unknown>): string | null {
    const id = data.id ?? data._id ?? data.contact_id ?? data.deal_id;
    if (id === null || id === undefined) return null;
    // Handle string and number types safely
    if (typeof id === 'string') return id;
    if (typeof id === 'number') return String(id);
    return null; // Objects and other types are not valid IDs
  }

  /**
   * Extract phone number from payload
   */
  private extractPhone(data: Record<string, unknown>): string | null {
    const phoneField = data.phone ?? data.phone_number ?? data.mobile;

    // Handle array format
    if (Array.isArray(phoneField) && phoneField.length > 0) {
      const first: unknown = phoneField[0];
      if (first && typeof first === 'object') {
        const phoneObj = first as Record<string, unknown>;
        const value = phoneObj.value ?? phoneObj.phone ?? phoneObj.number;
        if (value && typeof value === 'string') {
          return value.trim();
        }
      }
      if (typeof first === 'string') {
        return first.trim();
      }
    }

    // Handle string format
    if (typeof phoneField === 'string' && phoneField.trim()) {
      return phoneField.trim();
    }

    return null;
  }

  /**
   * Extract string value from multiple possible keys
   */
  private extractString(data: Record<string, unknown>, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = data[key];

      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }

      // Handle object with label/value
      if (value && typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        if (typeof obj.label === 'string') return obj.label;
        if (typeof obj.value === 'string') return obj.value;
      }
    }

    return undefined;
  }

  /**
   * Extract number value from multiple possible keys
   */
  private extractNumber(data: Record<string, unknown>, keys: string[]): number | undefined {
    for (const key of keys) {
      const value = data[key];

      if (typeof value === 'number') {
        return value;
      }

      if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed)) {
          return parsed;
        }
      }
    }

    return undefined;
  }

  /**
   * Extract boolean value from multiple possible keys
   */
  private extractBoolean(data: Record<string, unknown>, keys: string[]): boolean {
    for (const key of keys) {
      const value = data[key];

      if (typeof value === 'boolean') {
        return value;
      }

      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true' || lower === 'yes' || lower === '1' || lower === 'da') {
          return true;
        }
      }

      if (typeof value === 'number') {
        return value === 1;
      }
    }

    return false;
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Create a mock CRM adapter with configuration
 */
export function createMockCrmAdapter(config: Partial<MockCrmConfig> = {}): MockCrmAdapter {
  return new MockCrmAdapter(config);
}

/**
 * Create a mock CRM adapter for success scenarios
 */
export function createSuccessMockCrm(): MockCrmAdapter {
  return new MockCrmAdapter({ scenario: 'success' });
}

/**
 * Create a mock CRM adapter for error scenarios
 */
export function createErrorMockCrm(errorType?: MockCrmConfig['errorType']): MockCrmAdapter {
  return new MockCrmAdapter({ scenario: 'error', errorType });
}

/**
 * Create a mock CRM adapter for flaky/resilience testing
 */
export function createFlakyMockCrm(errorRate = 0.3): MockCrmAdapter {
  return new MockCrmAdapter({ scenario: 'flaky', errorRate });
}

/**
 * Create a mock CRM adapter for latency testing
 */
export function createSlowMockCrm(baseLatencyMs = 2000): MockCrmAdapter {
  return new MockCrmAdapter({ scenario: 'slow', baseLatencyMs });
}
