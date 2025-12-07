/**
 * @fileoverview Stripe Financing Integration Client
 *
 * L2 Feature: Third-party financing integration with Stripe Partners.
 * Provides payment plan capabilities through Stripe's financing ecosystem
 * including Affirm, Afterpay, Klarna, and Stripe Capital.
 *
 * @module integrations/stripe-financing
 *
 * ## Features
 * - Pre-qualification/eligibility checks (soft pull)
 * - Full financing application submission
 * - Offer management and acceptance
 * - Webhook signature verification
 * - HIPAA-compliant data handling
 *
 * ## Supported Providers
 * - Stripe Capital/Financing
 * - Affirm (via Stripe Connect)
 * - Afterpay (via Stripe Connect)
 * - Klarna (via Stripe Connect)
 */

import * as crypto from 'crypto';
import { z } from 'zod';
import {
  withRetry,
  ExternalServiceError,
  RateLimitError,
  WebhookSignatureError,
  createLogger,
} from '@medicalcor/core';
import type {
  FinancingApplicationStatus,
  FinancingApplication,
  FinancingOffer,
  FinancingEligibilityResult,
  CreateFinancingApplication,
  AcceptFinancingOffer,
  FinancingAcceptanceResult,
  FinancingEligibilityCheck,
  FinancingDecisionCode,
  FinancingPlanType,
  FinancingTerm,
  FinancingProvider,
} from '@medicalcor/types';

// ============================================================================
// CONFIGURATION
// ============================================================================

const logger = createLogger({ name: 'stripe-financing' });

/** Default timeout for Stripe API requests (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30000;

/** Stripe Financing API version */
const API_VERSION = '2024-11-20';

/**
 * Stripe Financing Client Configuration Schema
 */
export const StripeFinancingClientConfigSchema = z.object({
  /** Stripe secret key */
  secretKey: z.string().min(1),
  /** Webhook secret for signature verification */
  webhookSecret: z.string().optional(),
  /** Connected account ID (for Stripe Connect) */
  connectedAccountId: z.string().optional(),
  /** Request timeout in milliseconds */
  timeoutMs: z.number().positive().optional().default(DEFAULT_TIMEOUT_MS),
  /** Retry configuration */
  retryConfig: z
    .object({
      maxRetries: z.number().int().min(0).max(10).default(3),
      baseDelayMs: z.number().int().positive().default(1000),
    })
    .optional(),
  /** Base URL override (for testing) */
  baseUrl: z.string().url().optional(),
  /** Financing-specific configuration */
  financing: z
    .object({
      /** Default provider to use */
      defaultProvider: z
        .enum(['stripe_financing', 'affirm', 'afterpay', 'klarna'])
        .default('stripe_financing'),
      /** Minimum financing amount (minor units) */
      minAmount: z.number().int().positive().default(50000), // 500 RON
      /** Maximum financing amount (minor units) */
      maxAmount: z.number().int().positive().default(10000000), // 100,000 RON
      /** Default currency */
      defaultCurrency: z.string().length(3).default('RON'),
      /** Available terms (months) */
      availableTerms: z.array(z.string()).default(['6', '12', '18', '24']),
    })
    .optional(),
});

export type StripeFinancingClientConfig = z.infer<typeof StripeFinancingClientConfigSchema>;

// ============================================================================
// STRIPE API RESPONSE TYPES
// ============================================================================

interface StripeFinancingApplicationResponse {
  id: string;
  object: 'financing.application';
  status: string;
  decision_code?: string;
  decision_message?: string;
  requested_amount: number;
  currency: string;
  offers?: StripeFinancingOfferResponse[];
  accepted_offer_id?: string;
  applicant: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    date_of_birth?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country: string;
    };
  };
  metadata?: Record<string, string>;
  created: number;
  updated: number;
  submitted_at?: number;
  decided_at?: number;
  accepted_at?: number;
  funded_at?: number;
  expires_at?: number;
  livemode: boolean;
}

interface StripeFinancingOfferResponse {
  id: string;
  object: 'financing.offer';
  plan_type: string;
  approved_amount: number;
  currency: string;
  apr: number;
  term_months: number;
  monthly_payment: number;
  total_repayment: number;
  finance_charge: number;
  down_payment: number;
  promotional_period?: number;
  promotional_apr?: number;
  valid_until: number;
  requires_acceptance: boolean;
  terms_url?: string;
}

interface StripeEligibilityResponse {
  id: string;
  object: 'financing.eligibility';
  eligible: boolean;
  pre_qualified_amount_min?: number;
  pre_qualified_amount_max?: number;
  estimated_apr_min?: number;
  estimated_apr_max?: number;
  available_terms?: string[];
  available_plan_types?: string[];
  ineligible_reason?: string;
  valid_until: number;
}

// ============================================================================
// STRIPE FINANCING CLIENT
// ============================================================================

/**
 * Stripe Financing Client
 *
 * Integrates with Stripe Partners for third-party financing/payment plans.
 *
 * @example
 * ```typescript
 * const client = createStripeFinancingClient({
 *   secretKey: process.env.STRIPE_SECRET_KEY,
 *   webhookSecret: process.env.STRIPE_FINANCING_WEBHOOK_SECRET,
 * });
 *
 * // Check eligibility
 * const eligibility = await client.checkEligibility({
 *   leadId: 'lead-123',
 *   clinicId: 'clinic-456',
 *   requestedAmountMin: 100000,
 *   requestedAmountMax: 500000,
 *   applicant: { firstName: 'John', lastName: 'Doe', ... },
 *   correlationId: 'corr-789',
 * });
 *
 * // Create application
 * const application = await client.createApplication({
 *   caseId: 'case-123',
 *   clinicId: 'clinic-456',
 *   applicant: { ... },
 *   requestedAmount: 250000,
 *   correlationId: 'corr-789',
 * });
 * ```
 */
export class StripeFinancingClient {
  private config: StripeFinancingClientConfig;
  private baseUrl: string;

  constructor(config: StripeFinancingClientConfig) {
    this.config = StripeFinancingClientConfigSchema.parse(config);
    this.baseUrl = config.baseUrl ?? 'https://api.stripe.com/v1';
  }

  // ==========================================================================
  // ELIGIBILITY CHECK
  // ==========================================================================

  /**
   * Check financing eligibility (soft credit pull)
   *
   * Performs a pre-qualification check without affecting credit score.
   *
   * @param input - Eligibility check input
   * @returns Eligibility result with estimated terms
   */
  async checkEligibility(input: FinancingEligibilityCheck): Promise<FinancingEligibilityResult> {
    const requestLogger = logger.child({ correlationId: input.correlationId });
    requestLogger.info({ leadId: input.leadId }, 'Checking financing eligibility');

    const body = new URLSearchParams({
      'applicant[first_name]': input.applicant.firstName,
      'applicant[last_name]': input.applicant.lastName,
      'applicant[email]': input.applicant.email,
      'applicant[phone]': input.applicant.phone,
      currency: input.currency,
      amount_min: input.requestedAmountMin.toString(),
      amount_max: input.requestedAmountMax.toString(),
      'metadata[lead_id]': input.leadId,
      'metadata[clinic_id]': input.clinicId,
      'metadata[correlation_id]': input.correlationId,
    });

    if (input.applicant.dateOfBirth) {
      const dateStr = input.applicant.dateOfBirth.toISOString().split('T')[0];
      if (dateStr) body.set('applicant[date_of_birth]', dateStr);
    }
    if (input.applicant.postalCode) {
      body.set('applicant[address][postal_code]', input.applicant.postalCode);
    }
    if (input.applicant.country) {
      body.set('applicant[address][country]', input.applicant.country);
    }

    const response = await this.request<StripeEligibilityResponse>(
      '/financing/eligibility_checks',
      {
        method: 'POST',
        body: body.toString(),
      }
    );

    const result: FinancingEligibilityResult = {
      eligible: response.eligible,
      preQualifiedAmountMin: response.pre_qualified_amount_min ?? null,
      preQualifiedAmountMax: response.pre_qualified_amount_max ?? null,
      estimatedAprMin: response.estimated_apr_min ?? null,
      estimatedAprMax: response.estimated_apr_max ?? null,
      availableTerms: (response.available_terms ?? []) as FinancingTerm[],
      availablePlanTypes: (response.available_plan_types ?? []) as FinancingPlanType[],
      ineligibleReason: response.ineligible_reason ?? null,
      checkId: response.id,
      validUntil: new Date(response.valid_until * 1000),
    };

    requestLogger.info(
      { eligible: result.eligible, checkId: result.checkId },
      'Eligibility check completed'
    );

    return result;
  }

  // ==========================================================================
  // APPLICATION MANAGEMENT
  // ==========================================================================

  /**
   * Create a financing application
   *
   * Submits a full financing application for credit decision.
   *
   * @param input - Application creation input
   * @returns Created application with status
   */
  async createApplication(input: CreateFinancingApplication): Promise<FinancingApplication> {
    const requestLogger = logger.child({ correlationId: input.correlationId });
    requestLogger.info(
      { caseId: input.caseId, requestedAmount: input.requestedAmount },
      'Creating financing application'
    );

    const body = new URLSearchParams({
      'applicant[first_name]': input.applicant.firstName,
      'applicant[last_name]': input.applicant.lastName,
      'applicant[email]': input.applicant.email,
      'applicant[phone]': input.applicant.phone,
      currency: input.currency,
      amount: input.requestedAmount.toString(),
      'metadata[case_id]': input.caseId,
      'metadata[clinic_id]': input.clinicId,
      'metadata[lead_id]': input.applicant.leadId,
      'metadata[correlation_id]': input.correlationId,
    });

    // Add optional applicant fields
    if (input.applicant.dateOfBirth) {
      const dateStr = input.applicant.dateOfBirth.toISOString().split('T')[0];
      if (dateStr) body.set('applicant[date_of_birth]', dateStr);
    }
    if (input.applicant.addressLine1) {
      body.set('applicant[address][line1]', input.applicant.addressLine1);
    }
    if (input.applicant.addressLine2) {
      body.set('applicant[address][line2]', input.applicant.addressLine2);
    }
    if (input.applicant.city) {
      body.set('applicant[address][city]', input.applicant.city);
    }
    if (input.applicant.state) {
      body.set('applicant[address][state]', input.applicant.state);
    }
    if (input.applicant.postalCode) {
      body.set('applicant[address][postal_code]', input.applicant.postalCode);
    }
    if (input.applicant.country) {
      body.set('applicant[address][country]', input.applicant.country);
    }

    // Add optional treatment info
    if (input.treatmentDescription) {
      body.set('metadata[treatment_description]', input.treatmentDescription);
    }
    if (input.treatmentCategory) {
      body.set('metadata[treatment_category]', input.treatmentCategory);
    }
    if (input.preferredPlanType) {
      body.set('preferred_plan_type', input.preferredPlanType);
    }
    if (input.preferredTerm) {
      body.set('preferred_term', input.preferredTerm);
    }

    // Add custom metadata
    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        body.set(`metadata[${key}]`, value);
      }
    }

    const response = await this.request<StripeFinancingApplicationResponse>(
      '/financing/applications',
      {
        method: 'POST',
        body: body.toString(),
      }
    );

    const application = this.mapStripeApplicationToInternal(
      response,
      input.caseId,
      input.clinicId,
      input.applicant.leadId
    );

    requestLogger.info(
      { applicationId: application.id, status: application.status },
      'Financing application created'
    );

    return application;
  }

  /**
   * Get a financing application by ID
   *
   * @param applicationId - Internal application ID
   * @param externalId - External Stripe application ID
   * @param correlationId - Correlation ID for tracing
   * @returns Application details
   */
  async getApplication(
    externalId: string,
    metadata: { caseId: string; clinicId: string; leadId: string },
    correlationId: string
  ): Promise<FinancingApplication> {
    const requestLogger = logger.child({ correlationId });
    requestLogger.info({ externalId }, 'Fetching financing application');

    const response = await this.request<StripeFinancingApplicationResponse>(
      `/financing/applications/${externalId}`
    );

    return this.mapStripeApplicationToInternal(
      response,
      metadata.caseId,
      metadata.clinicId,
      metadata.leadId
    );
  }

  /**
   * List financing applications for a clinic
   *
   * @param clinicId - Clinic ID
   * @param options - Listing options
   * @returns List of applications
   */
  async listApplications(
    clinicId: string,
    options: {
      status?: FinancingApplicationStatus;
      limit?: number;
      startingAfter?: string;
      correlationId: string;
    }
  ): Promise<{ applications: FinancingApplication[]; hasMore: boolean }> {
    const requestLogger = logger.child({ correlationId: options.correlationId });
    requestLogger.info({ clinicId }, 'Listing financing applications');

    const params = new URLSearchParams({
      'metadata[clinic_id]': clinicId,
      limit: (options.limit ?? 10).toString(),
    });

    if (options.status) {
      params.set('status', options.status);
    }
    if (options.startingAfter) {
      params.set('starting_after', options.startingAfter);
    }

    const response = await this.request<{
      object: 'list';
      data: StripeFinancingApplicationResponse[];
      has_more: boolean;
    }>(`/financing/applications?${params.toString()}`);

    const applications = response.data.map((app) =>
      this.mapStripeApplicationToInternal(
        app,
        app.metadata?.case_id ?? '',
        clinicId,
        app.metadata?.lead_id ?? ''
      )
    );

    return {
      applications,
      hasMore: response.has_more,
    };
  }

  // ==========================================================================
  // OFFER ACCEPTANCE
  // ==========================================================================

  /**
   * Accept a financing offer
   *
   * @param input - Offer acceptance input
   * @returns Acceptance result
   */
  async acceptOffer(input: AcceptFinancingOffer): Promise<FinancingAcceptanceResult> {
    const requestLogger = logger.child({ correlationId: input.correlationId });
    requestLogger.info(
      { applicationId: input.applicationId, offerId: input.offerId },
      'Accepting financing offer'
    );

    const body = new URLSearchParams({
      offer_id: input.offerId,
      signature_consent: input.signatureConsent.toString(),
    });

    if (input.ipAddress) {
      body.set('ip_address', input.ipAddress);
    }

    try {
      // First get the application to get the external ID
      const response = await this.request<StripeFinancingApplicationResponse>(
        `/financing/applications/${input.applicationId}/accept`,
        {
          method: 'POST',
          body: body.toString(),
        }
      );

      const application = this.mapStripeApplicationToInternal(
        response,
        response.metadata?.case_id ?? '',
        response.metadata?.clinic_id ?? '',
        response.metadata?.lead_id ?? ''
      );

      requestLogger.info(
        { applicationId: application.id, status: application.status },
        'Financing offer accepted'
      );

      return {
        success: true,
        application,
        contractUrl: null, // Would be returned in response if available
        expectedFundingDate: application.fundedAt
          ? null
          : new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days estimate
        error: null,
      };
    } catch (error) {
      requestLogger.error({ error }, 'Failed to accept financing offer');

      return {
        success: false,
        application: null as unknown as FinancingApplication, // Will throw if accessed
        contractUrl: null,
        expectedFundingDate: null,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ==========================================================================
  // WEBHOOK HANDLING
  // ==========================================================================

  /**
   * Verify Stripe webhook signature
   *
   * @param payload - Raw webhook payload
   * @param signatureHeader - Stripe-Signature header value
   * @returns Whether signature is valid
   */
  verifyWebhookSignature(payload: string, signatureHeader: string): boolean {
    if (!this.config.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    // Parse signature header: t=<timestamp>,v1=<signature>
    const signatureParts = signatureHeader.split(',');
    let timestamp = '';
    let signature = '';

    for (const part of signatureParts) {
      const [key, value] = part.split('=');
      if (key === 't') {
        timestamp = value ?? '';
      } else if (key === 'v1') {
        signature = value ?? '';
      }
    }

    if (!timestamp || !signature) {
      return false;
    }

    // Check timestamp is within 5 minutes
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);
    const TOLERANCE_SECONDS = 300;

    if (Math.abs(currentTime - webhookTime) > TOLERANCE_SECONDS) {
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    try {
      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /**
   * Validate webhook and throw if invalid
   *
   * @param payload - Raw webhook payload
   * @param signatureHeader - Stripe-Signature header value
   */
  validateWebhook(payload: string, signatureHeader: string): void {
    if (!this.verifyWebhookSignature(payload, signatureHeader)) {
      throw new WebhookSignatureError('Invalid Stripe financing webhook signature');
    }
  }

  // ==========================================================================
  // PRIVATE HELPERS
  // ==========================================================================

  /**
   * Make authenticated request to Stripe API
   */
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = this.config.timeoutMs;

    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const headers: Record<string, string> = {
          Authorization: `Bearer ${this.config.secretKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Stripe-Version': API_VERSION,
        };

        if (this.config.connectedAccountId) {
          headers['Stripe-Account'] = this.config.connectedAccountId;
        }

        const existingHeaders = (options.headers as Record<string, string> | undefined) ?? {};

        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            ...headers,
            ...existingHeaders,
          },
        });

        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          throw new RateLimitError(parseInt(retryAfter ?? '60', 10));
        }

        if (!response.ok) {
          // Consume response body for proper cleanup
          await response.text();
          // Log error but don't expose PII
          logger.error({ status: response.status, path }, 'Stripe Financing API request failed');
          throw new ExternalServiceError(
            'StripeFinancing',
            `Request failed with status ${response.status}`
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('StripeFinancing', `Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof RateLimitError) return true;
        if (error instanceof ExternalServiceError) {
          if (error.message.includes('502')) return true;
          if (error.message.includes('503')) return true;
          if (error.message.includes('timeout')) return true;
        }
        return false;
      },
    });
  }

  /**
   * Get the default financing provider
   */
  private getDefaultProvider(): FinancingProvider {
    return this.config.financing?.defaultProvider ?? 'stripe_financing';
  }

  /**
   * Map Stripe offer to internal format
   */
  private mapStripeOfferToInternal(offer: StripeFinancingOfferResponse): FinancingOffer {
    return {
      offerId: offer.id,
      provider: this.getDefaultProvider(),
      planType: offer.plan_type as FinancingPlanType,
      approvedAmount: offer.approved_amount,
      currency: offer.currency,
      apr: offer.apr,
      termMonths: offer.term_months,
      monthlyPayment: offer.monthly_payment,
      totalRepayment: offer.total_repayment,
      financeCharge: offer.finance_charge,
      downPayment: offer.down_payment,
      promotionalPeriod: offer.promotional_period,
      promotionalApr: offer.promotional_apr,
      validUntil: new Date(offer.valid_until * 1000),
      requiresAcceptance: offer.requires_acceptance,
      termsUrl: offer.terms_url,
    };
  }

  /**
   * Map Stripe applicant to internal format
   */
  private mapStripeApplicantToInternal(
    applicant: StripeFinancingApplicationResponse['applicant'],
    leadId: string
  ): FinancingApplication['applicant'] {
    return {
      leadId,
      firstName: applicant.first_name,
      lastName: applicant.last_name,
      email: applicant.email,
      phone: applicant.phone,
      dateOfBirth: applicant.date_of_birth ? new Date(applicant.date_of_birth) : undefined,
      addressLine1: applicant.address?.line1,
      addressLine2: applicant.address?.line2,
      city: applicant.address?.city,
      state: applicant.address?.state,
      postalCode: applicant.address?.postal_code,
      country: applicant.address?.country ?? 'RO',
    };
  }

  /**
   * Map Stripe API response to internal application format
   */
  private mapStripeApplicationToInternal(
    response: StripeFinancingApplicationResponse,
    caseId: string,
    clinicId: string,
    leadId: string
  ): FinancingApplication {
    const offers = (response.offers ?? []).map((offer) => this.mapStripeOfferToInternal(offer));
    const decisionCode = response.decision_code as FinancingDecisionCode | undefined;

    return {
      id: crypto.randomUUID(),
      externalId: response.id,
      provider: this.getDefaultProvider(),
      caseId,
      clinicId,
      leadId,
      status: response.status as FinancingApplicationStatus,
      decisionCode: decisionCode ?? null,
      decisionMessage: response.decision_message ?? null,
      requestedAmount: response.requested_amount,
      currency: response.currency,
      offers,
      acceptedOfferId: response.accepted_offer_id ?? null,
      applicant: this.mapStripeApplicantToInternal(response.applicant, leadId),
      treatmentDescription: response.metadata?.treatment_description ?? null,
      treatmentCategory: response.metadata?.treatment_category ?? null,
      createdAt: new Date(response.created * 1000),
      updatedAt: new Date(response.updated * 1000),
      submittedAt: response.submitted_at ? new Date(response.submitted_at * 1000) : null,
      decidedAt: response.decided_at ? new Date(response.decided_at * 1000) : null,
      acceptedAt: response.accepted_at ? new Date(response.accepted_at * 1000) : null,
      fundedAt: response.funded_at ? new Date(response.funded_at * 1000) : null,
      expiresAt: response.expires_at ? new Date(response.expires_at * 1000) : null,
      metadata: response.metadata,
    };
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a configured Stripe Financing client
 */
export function createStripeFinancingClient(
  config: StripeFinancingClientConfig
): StripeFinancingClient {
  return new StripeFinancingClient(config);
}

// ============================================================================
// MOCK CLIENT FOR TESTING
// ============================================================================

/**
 * Mock Stripe Financing Client for development/testing
 *
 * Provides deterministic responses for testing financing flows.
 */
export class MockStripeFinancingClient {
  private applications = new Map<string, FinancingApplication>();
  private checkCounter = 0;

  /**
   * Check financing eligibility (always eligible in mock)
   */
  checkEligibility(input: FinancingEligibilityCheck): Promise<FinancingEligibilityResult> {
    this.checkCounter++;

    // Simulate varying eligibility based on amount
    const eligible = input.requestedAmountMax <= 5000000; // Max 50,000 RON

    return Promise.resolve({
      eligible,
      preQualifiedAmountMin: eligible ? input.requestedAmountMin : null,
      preQualifiedAmountMax: eligible ? Math.min(input.requestedAmountMax, 5000000) : null,
      estimatedAprMin: eligible ? 9.99 : null,
      estimatedAprMax: eligible ? 24.99 : null,
      availableTerms: eligible ? (['6', '12', '18', '24'] as FinancingTerm[]) : [],
      availablePlanTypes: eligible ? (['installment', 'deferred'] as FinancingPlanType[]) : [],
      ineligibleReason: eligible ? null : 'Amount exceeds maximum financing limit',
      checkId: `mock_check_${this.checkCounter}`,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });
  }

  /**
   * Create a mock financing application
   */
  createApplication(input: CreateFinancingApplication): Promise<FinancingApplication> {
    const applicationId = crypto.randomUUID();
    const externalId = `mock_app_${Date.now()}`;

    // Calculate mock offer
    const apr = 14.99;
    const termMonths = parseInt(input.preferredTerm ?? '12', 10);
    const monthlyRate = apr / 100 / 12;
    const monthlyPayment = Math.round(
      (monthlyRate * input.requestedAmount) / (1 - Math.pow(1 + monthlyRate, -termMonths))
    );
    const totalRepayment = monthlyPayment * termMonths;

    const planType: FinancingPlanType = input.preferredPlanType ?? 'installment';

    const offer: FinancingOffer = {
      offerId: `mock_offer_${Date.now()}`,
      provider: 'stripe_financing',
      planType,
      approvedAmount: input.requestedAmount,
      currency: input.currency,
      apr,
      termMonths,
      monthlyPayment,
      totalRepayment,
      financeCharge: totalRepayment - input.requestedAmount,
      downPayment: 0,
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      requiresAcceptance: true,
    };

    const application: FinancingApplication = {
      id: applicationId,
      externalId,
      provider: 'stripe_financing',
      caseId: input.caseId,
      clinicId: input.clinicId,
      leadId: input.applicant.leadId,
      status: 'approved', // Mock always approves
      decisionCode: 'approved',
      decisionMessage: 'Application approved',
      requestedAmount: input.requestedAmount,
      currency: input.currency,
      offers: [offer],
      acceptedOfferId: null,
      applicant: input.applicant,
      treatmentDescription: input.treatmentDescription ?? null,
      treatmentCategory: input.treatmentCategory ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      submittedAt: new Date(),
      decidedAt: new Date(),
      acceptedAt: null,
      fundedAt: null,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      metadata: input.metadata,
    };

    this.applications.set(applicationId, application);
    this.applications.set(externalId, application);

    return Promise.resolve(application);
  }

  /**
   * Get a mock application
   */
  getApplication(
    externalId: string,
    _metadata: { caseId: string; clinicId: string; leadId: string },
    _correlationId: string
  ): Promise<FinancingApplication> {
    const application = this.applications.get(externalId);
    if (!application) {
      return Promise.reject(new ExternalServiceError('StripeFinancing', 'Application not found'));
    }
    return Promise.resolve(application);
  }

  /**
   * Accept a mock offer
   */
  acceptOffer(input: AcceptFinancingOffer): Promise<FinancingAcceptanceResult> {
    const application = this.applications.get(input.applicationId);
    if (!application) {
      return Promise.resolve({
        success: false,
        application: null as unknown as FinancingApplication,
        contractUrl: null,
        expectedFundingDate: null,
        error: 'Application not found',
      });
    }

    // Update application status
    application.status = 'accepted';
    application.acceptedOfferId = input.offerId;
    application.acceptedAt = new Date();
    application.updatedAt = new Date();

    return Promise.resolve({
      success: true,
      application,
      contractUrl: 'https://example.com/contract.pdf',
      expectedFundingDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      error: null,
    });
  }

  /**
   * Verify webhook signature (always valid in mock)
   */
  verifyWebhookSignature(_payload: string, _signatureHeader: string): boolean {
    return true;
  }

  /**
   * Validate webhook (no-op in mock)
   */
  validateWebhook(_payload: string, _signatureHeader: string): void {
    // No-op for mock
  }

  /**
   * Clear all stored applications (for test cleanup)
   */
  clear(): void {
    this.applications.clear();
    this.checkCounter = 0;
  }
}

/**
 * Create mock Stripe Financing client for development
 */
export function createMockStripeFinancingClient(): MockStripeFinancingClient {
  return new MockStripeFinancingClient();
}

// ============================================================================
// CREDENTIAL HELPERS
// ============================================================================

/**
 * Get Stripe Financing credentials from environment
 */
export function getStripeFinancingCredentials(): {
  secretKey: string;
  webhookSecret?: string;
  connectedAccountId?: string;
} {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY environment variable is required');
  }

  return {
    secretKey,
    webhookSecret: process.env.STRIPE_FINANCING_WEBHOOK_SECRET,
    connectedAccountId: process.env.STRIPE_CONNECTED_ACCOUNT_ID,
  };
}
