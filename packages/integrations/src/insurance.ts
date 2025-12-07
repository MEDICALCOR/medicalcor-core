/**
 * @fileoverview Insurance Verification Client
 *
 * HTTP client for external insurance verification APIs.
 * Supports multiple insurance verification providers with a unified interface.
 *
 * @module integrations/insurance
 *
 * SUPPORTED PROVIDERS:
 * - Mock (for development/testing)
 * - Custom clearing house integrations
 *
 * SECURITY:
 * - All requests contain PHI and are logged accordingly
 * - SSRF prevention for API endpoints
 * - Token validation and secure credential handling
 */

import { z } from 'zod';
import { createLogger } from '@medicalcor/core';
import type { Result } from './lib/result.js';
import { ok, err } from './lib/result.js';

const logger = createLogger({ name: 'insurance-client' });

// ============================================================================
// SCHEMAS
// ============================================================================

export const InsuranceVerificationRequestSchema = z.object({
  providerId: z.string().min(1),
  providerName: z.string().min(1),
  policyNumber: z.string().min(5).max(30),
  groupNumber: z.string().min(3).max(20).optional(),
  subscriberFirstName: z.string().min(1),
  subscriberLastName: z.string().min(1),
  subscriberDateOfBirth: z.string().optional(), // ISO 8601
  patientRelationship: z.enum(['self', 'spouse', 'child', 'other']).default('self'),
  serviceType: z.enum(['dental', 'medical', 'vision']).default('dental'),
});

export const InsuranceVerificationResponseSchema = z.object({
  status: z.enum(['active', 'inactive', 'expired', 'invalid', 'not_found']),
  policyNumber: z.string(),
  subscriberName: z.string().optional(),
  coverageType: z.enum(['full', 'partial', 'dental_only']).optional(),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().optional(),
  deductible: z.number().optional(),
  remainingDeductible: z.number().optional(),
  annualMaximum: z.number().optional(),
  remainingMaximum: z.number().optional(),
  copayPercentage: z.number().min(0).max(100).optional(),
  coveredProcedures: z.array(z.string()).optional(),
  preAuthRequired: z.boolean().optional(),
  nameMatch: z.boolean().optional(),
  dobMatch: z.boolean().optional(),
  externalReferenceId: z.string().optional(),
  verifiedAt: z.string(),
  message: z.string().optional(),
});

export type InsuranceVerificationRequest = z.infer<typeof InsuranceVerificationRequestSchema>;
export type InsuranceVerificationResponse = z.infer<typeof InsuranceVerificationResponseSchema>;

// ============================================================================
// CLIENT CONFIGURATION
// ============================================================================

/**
 * Insurance client configuration
 */
export interface InsuranceClientConfig {
  /** API base URL */
  readonly apiUrl: string;

  /** API key or token */
  readonly apiKey: string;

  /** Timeout in milliseconds */
  readonly timeoutMs?: number;

  /** Retry configuration */
  readonly retryConfig?: {
    readonly maxRetries: number;
    readonly baseDelayMs: number;
  };

  /** Provider-specific configuration */
  readonly providerConfig?: Record<string, unknown>;
}

/**
 * Insurance verification error
 */
export interface InsuranceClientError {
  readonly code:
    | 'PROVIDER_NOT_SUPPORTED'
    | 'INVALID_POLICY_NUMBER'
    | 'VERIFICATION_TIMEOUT'
    | 'API_ERROR'
    | 'RATE_LIMITED'
    | 'AUTHENTICATION_FAILED'
    | 'INVALID_REQUEST'
    | 'SERVICE_UNAVAILABLE'
    | 'NETWORK_ERROR';
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly originalError?: Error;
}

/**
 * Supported insurance providers
 */
export const SUPPORTED_PROVIDERS = [
  { id: 'delta_dental', name: 'Delta Dental' },
  { id: 'metlife', name: 'MetLife' },
  { id: 'cigna', name: 'Cigna' },
  { id: 'aetna', name: 'Aetna' },
  { id: 'united_healthcare', name: 'UnitedHealthcare' },
  { id: 'guardian', name: 'Guardian' },
  { id: 'humana', name: 'Humana' },
  { id: 'bcbs', name: 'Blue Cross Blue Shield' },
  { id: 'principal', name: 'Principal' },
  { id: 'sun_life', name: 'Sun Life' },
] as const;

// ============================================================================
// INSURANCE CLIENT CLASS
// ============================================================================

/**
 * Insurance verification client
 *
 * Provides methods to verify insurance eligibility through external APIs.
 *
 * @example
 * ```typescript
 * const client = createInsuranceClient({
 *   apiUrl: process.env.INSURANCE_API_URL,
 *   apiKey: process.env.INSURANCE_API_KEY,
 * });
 *
 * const result = await client.verifyEligibility({
 *   providerId: 'delta_dental',
 *   policyNumber: 'ABC123456',
 *   subscriberFirstName: 'John',
 *   subscriberLastName: 'Doe',
 * });
 * ```
 */
export class InsuranceClient {
  private readonly config: InsuranceClientConfig;

  constructor(config: InsuranceClientConfig) {
    this.config = {
      timeoutMs: 30000,
      retryConfig: {
        maxRetries: 3,
        baseDelayMs: 1000,
      },
      ...config,
    };

    // Validate API URL (SSRF prevention)
    this.validateApiUrl(config.apiUrl);
  }

  /**
   * Verify insurance eligibility
   */
  async verifyEligibility(
    request: InsuranceVerificationRequest,
    correlationId: string
  ): Promise<Result<InsuranceVerificationResponse, InsuranceClientError>> {
    logger.info(
      { providerId: request.providerId, correlationId },
      'Starting insurance verification'
    );

    // Validate request
    const parseResult = InsuranceVerificationRequestSchema.safeParse(request);
    if (!parseResult.success) {
      return err({
        code: 'INVALID_REQUEST',
        message: `Invalid request: ${parseResult.error.message}`,
        retryable: false,
      });
    }

    // Check provider support
    if (!this.isProviderSupported(request.providerId)) {
      return err({
        code: 'PROVIDER_NOT_SUPPORTED',
        message: `Provider ${request.providerId} is not supported`,
        retryable: false,
      });
    }

    // Make API call with retries
    return this.executeWithRetry(
      () => this.callVerificationApi(request, correlationId),
      correlationId
    );
  }

  /**
   * Check if a provider is supported
   */
  isProviderSupported(providerId: string): boolean {
    return SUPPORTED_PROVIDERS.some((p) => p.id === providerId);
  }

  /**
   * Get list of supported providers
   */
  getSupportedProviders(): typeof SUPPORTED_PROVIDERS {
    return SUPPORTED_PROVIDERS;
  }

  /**
   * Health check for the verification service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(`${this.config.apiUrl}/health`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private validateApiUrl(url: string): void {
    try {
      const parsed = new URL(url);

      // SSRF prevention: block private/local addresses
      const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
      if (blockedHosts.includes(parsed.hostname)) {
        throw new Error('API URL cannot point to localhost');
      }

      // Block private IP ranges
      const ipPattern = /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|fc00:|fe80:)/;
      if (ipPattern.test(parsed.hostname)) {
        throw new Error('API URL cannot point to private IP addresses');
      }

      // Ensure HTTPS in production
      if (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
        throw new Error('API URL must use HTTPS in production');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Invalid API URL: ${error.message}`);
      }
      throw new Error('Invalid API URL');
    }
  }

  private async callVerificationApi(
    request: InsuranceVerificationRequest,
    correlationId: string
  ): Promise<Result<InsuranceVerificationResponse, InsuranceClientError>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(`${this.config.apiUrl}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
          'X-Correlation-ID': correlationId,
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return this.handleApiError(response);
      }

      const data: unknown = await response.json();
      const parsed = InsuranceVerificationResponseSchema.safeParse(data);

      if (!parsed.success) {
        logger.error({ error: parsed.error, correlationId }, 'Invalid API response format');
        return err({
          code: 'API_ERROR',
          message: 'Invalid response format from verification API',
          retryable: false,
        });
      }

      logger.info(
        { status: parsed.data.status, correlationId },
        'Insurance verification completed'
      );

      return ok(parsed.data);
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        return err({
          code: 'VERIFICATION_TIMEOUT',
          message: 'Verification request timed out',
          retryable: true,
          retryAfterMs: 5000,
        });
      }

      return err({
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network error',
        retryable: true,
        retryAfterMs: 2000,
        originalError: error instanceof Error ? error : undefined,
      });
    }
  }

  private handleApiError(
    response: Response
  ): Result<InsuranceVerificationResponse, InsuranceClientError> {
    const status = response.status;

    if (status === 401 || status === 403) {
      return err({
        code: 'AUTHENTICATION_FAILED',
        message: 'Authentication failed',
        retryable: false,
      });
    }

    if (status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      return err({
        code: 'RATE_LIMITED',
        message: 'Rate limited',
        retryable: true,
        retryAfterMs: retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000,
      });
    }

    if (status >= 500) {
      return err({
        code: 'SERVICE_UNAVAILABLE',
        message: `Service unavailable: ${status}`,
        retryable: true,
        retryAfterMs: 5000,
      });
    }

    return err({
      code: 'API_ERROR',
      message: `API error: ${status}`,
      retryable: false,
    });
  }

  private async executeWithRetry<T>(
    operation: () => Promise<Result<T, InsuranceClientError>>,
    correlationId: string
  ): Promise<Result<T, InsuranceClientError>> {
    const retryConfig = this.config.retryConfig ?? { maxRetries: 3, baseDelayMs: 1000 };
    const { maxRetries, baseDelayMs } = retryConfig;
    let lastError: InsuranceClientError = {
      code: 'API_ERROR',
      message: 'Verification failed after retries',
      retryable: false,
    };

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const result = await operation();

      if (result._tag === 'Ok') {
        return result;
      }

      lastError = result.error;

      if (!result.error.retryable || attempt === maxRetries) {
        return result;
      }

      const delayMs = result.error.retryAfterMs ?? baseDelayMs * Math.pow(2, attempt);
      logger.warn(
        { attempt, delayMs, correlationId, errorCode: result.error.code },
        'Retrying insurance verification'
      );
      await this.delay(delayMs);
    }

    return err(lastError);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// MOCK CLIENT FOR DEVELOPMENT
// ============================================================================

/**
 * Mock insurance client for development and testing
 */
export class MockInsuranceClient {
  private readonly scenarios = new Map<string, InsuranceVerificationResponse>();

  constructor() {
    // Setup default scenarios
    this.scenarios.set('active', {
      status: 'active',
      policyNumber: 'MOCK123456',
      subscriberName: 'Test User',
      coverageType: 'full',
      effectiveFrom: '2024-01-01',
      effectiveUntil: '2024-12-31',
      deductible: 50000, // $500
      remainingDeductible: 25000, // $250
      annualMaximum: 200000, // $2000
      remainingMaximum: 150000, // $1500
      copayPercentage: 20,
      preAuthRequired: true,
      nameMatch: true,
      dobMatch: true,
      verifiedAt: new Date().toISOString(),
    });

    this.scenarios.set('expired', {
      status: 'expired',
      policyNumber: 'MOCK123456',
      verifiedAt: new Date().toISOString(),
      message: 'Policy expired on 2023-12-31',
    });

    this.scenarios.set('invalid', {
      status: 'invalid',
      policyNumber: 'MOCK123456',
      verifiedAt: new Date().toISOString(),
      message: 'Policy number not found',
    });
  }

  async verifyEligibility(
    request: InsuranceVerificationRequest,
    correlationId: string
  ): Promise<Result<InsuranceVerificationResponse, InsuranceClientError>> {
    logger.info({ providerId: request.providerId, correlationId }, 'Mock insurance verification');

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Determine scenario based on policy number
    const expiredScenario = this.scenarios.get('expired');
    if (request.policyNumber.includes('EXPIRED') && expiredScenario) {
      return ok(expiredScenario);
    }

    const invalidScenario = this.scenarios.get('invalid');
    if (request.policyNumber.includes('INVALID') && invalidScenario) {
      return ok(invalidScenario);
    }

    if (request.policyNumber.includes('ERROR')) {
      return err({
        code: 'API_ERROR',
        message: 'Simulated API error',
        retryable: false,
      });
    }

    // Default to active
    const activeScenario = this.scenarios.get('active');
    if (!activeScenario) {
      return err({
        code: 'API_ERROR',
        message: 'Mock scenario not configured',
        retryable: false,
      });
    }

    const response = {
      ...activeScenario,
      policyNumber: request.policyNumber,
      subscriberName: `${request.subscriberFirstName} ${request.subscriberLastName}`,
      verifiedAt: new Date().toISOString(),
    };

    return ok(response);
  }

  isProviderSupported(providerId: string): boolean {
    return SUPPORTED_PROVIDERS.some((p) => p.id === providerId);
  }

  getSupportedProviders(): typeof SUPPORTED_PROVIDERS {
    return SUPPORTED_PROVIDERS;
  }

  healthCheck(): Promise<boolean> {
    return Promise.resolve(true);
  }

  /**
   * Add custom scenario for testing
   */
  addScenario(name: string, response: InsuranceVerificationResponse): void {
    this.scenarios.set(name, response);
  }
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create insurance verification client
 */
export function createInsuranceClient(config: InsuranceClientConfig): InsuranceClient {
  return new InsuranceClient(config);
}

/**
 * Create mock insurance client for development/testing
 */
export function createMockInsuranceClient(): MockInsuranceClient {
  return new MockInsuranceClient();
}

/**
 * Get insurance client credentials from environment
 */
export function getInsuranceCredentials(): {
  apiUrl: string | undefined;
  apiKey: string | undefined;
} {
  return {
    apiUrl: process.env.INSURANCE_API_URL,
    apiKey: process.env.INSURANCE_API_KEY,
  };
}
