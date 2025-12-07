/**
 * @fileoverview Financing Service Port Interface (Secondary Port)
 *
 * Defines the interface for third-party financing/payment plan services.
 * This port enables integration with lenders like Stripe Partners (Affirm,
 * Afterpay, Klarna) for patient financing options.
 *
 * @module application/ports/secondary/external/FinancingService
 *
 * ## Hexagonal Architecture
 *
 * This is a **SECONDARY PORT** (driven port) that defines what the
 * application needs from the infrastructure layer for financing services.
 *
 * ## L2 Feature: Payment Plan Integration
 *
 * Enables:
 * - Pre-qualification checks (soft credit pull)
 * - Full financing applications
 * - Offer management and acceptance
 * - Funding status tracking
 *
 * @example
 * ```typescript
 * // Check if patient qualifies for financing
 * const eligibility = await financingService.checkEligibility({
 *   leadId: 'lead-123',
 *   clinicId: 'clinic-456',
 *   requestedAmountMin: 100000,
 *   requestedAmountMax: 500000,
 *   applicant: { firstName: 'John', ... },
 *   correlationId: 'corr-789',
 * });
 *
 * if (eligibility.eligible) {
 *   // Create full application
 *   const application = await financingService.createApplication({
 *     caseId: 'case-123',
 *     clinicId: 'clinic-456',
 *     applicant: { ... },
 *     requestedAmount: 250000,
 *     correlationId: 'corr-789',
 *   });
 * }
 * ```
 */

import type {
  FinancingApplication,
  FinancingApplicationStatus,
  FinancingEligibilityResult,
  FinancingAcceptanceResult,
  CreateFinancingApplication,
  AcceptFinancingOffer,
  FinancingEligibilityCheck,
  FinancingSummary,
  FinancingProvider,
} from '@medicalcor/types';

// =============================================================================
// QUERY TYPES
// =============================================================================

/**
 * Options for listing financing applications
 */
export interface ListFinancingApplicationsOptions {
  /** Filter by clinic ID */
  clinicId: string;
  /** Filter by lead/patient ID */
  leadId?: string;
  /** Filter by case ID */
  caseId?: string;
  /** Filter by application status */
  status?: FinancingApplicationStatus;
  /** Filter by provider */
  provider?: FinancingProvider;
  /** Maximum results to return */
  limit?: number;
  /** Pagination cursor */
  startingAfter?: string;
  /** Correlation ID for tracing */
  correlationId: string;
}

/**
 * Result of listing financing applications
 */
export interface ListFinancingApplicationsResult {
  /** Applications matching the query */
  applications: FinancingApplication[];
  /** Whether there are more results */
  hasMore: boolean;
  /** Total count (if available) */
  totalCount?: number;
}

/**
 * Options for getting financing summary
 */
export interface GetFinancingSummaryOptions {
  /** Clinic ID to summarize */
  clinicId: string;
  /** Optional lead ID to summarize for specific patient */
  leadId?: string;
  /** Optional case ID to summarize for specific case */
  caseId?: string;
  /** Date range start */
  fromDate?: Date;
  /** Date range end */
  toDate?: Date;
  /** Correlation ID for tracing */
  correlationId: string;
}

// =============================================================================
// HEALTH CHECK
// =============================================================================

/**
 * Financing service health status
 */
export interface FinancingServiceHealth {
  /** Overall service availability */
  healthy: boolean;
  /** Provider-specific status */
  providers: Record<
    FinancingProvider,
    {
      available: boolean;
      latencyMs?: number;
      lastError?: string;
      lastCheckedAt: Date;
    }
  >;
  /** Service message */
  message: string;
}

// =============================================================================
// FINANCING SERVICE PORT
// =============================================================================

/**
 * Financing Service Port Interface
 *
 * Defines the contract for third-party financing integrations.
 * Implementations may integrate with Stripe Partners, direct lender APIs,
 * or other financing providers.
 *
 * @example
 * ```typescript
 * class StripeFinancingAdapter implements IFinancingService {
 *   async checkEligibility(input) {
 *     // Call Stripe Financing API
 *   }
 *
 *   async createApplication(input) {
 *     // Submit application to Stripe
 *   }
 * }
 * ```
 */
export interface IFinancingService {
  // ===========================================================================
  // ELIGIBILITY
  // ===========================================================================

  /**
   * Check financing eligibility (soft credit pull)
   *
   * Performs a pre-qualification check without affecting the patient's
   * credit score. Returns estimated terms and amount ranges.
   *
   * @param input - Eligibility check input
   * @returns Eligibility result with estimated terms
   *
   * @example
   * ```typescript
   * const result = await financingService.checkEligibility({
   *   leadId: 'lead-123',
   *   clinicId: 'clinic-456',
   *   requestedAmountMin: 100000, // 1000 RON
   *   requestedAmountMax: 500000, // 5000 RON
   *   applicant: {
   *     firstName: 'Maria',
   *     lastName: 'Popescu',
   *     email: 'maria@example.com',
   *     phone: '+40712345678',
   *   },
   *   correlationId: 'corr-789',
   * });
   *
   * if (result.eligible) {
   *   console.log(`Pre-qualified for ${result.preQualifiedAmountMax} at ${result.estimatedAprMin}% APR`);
   * }
   * ```
   */
  checkEligibility(input: FinancingEligibilityCheck): Promise<FinancingEligibilityResult>;

  // ===========================================================================
  // APPLICATION MANAGEMENT
  // ===========================================================================

  /**
   * Create a financing application
   *
   * Submits a full financing application for credit decision.
   * May trigger a hard credit pull depending on the provider.
   *
   * @param input - Application creation input
   * @returns Created application with initial status
   *
   * @example
   * ```typescript
   * const application = await financingService.createApplication({
   *   caseId: 'case-123',
   *   clinicId: 'clinic-456',
   *   applicant: {
   *     leadId: 'lead-789',
   *     firstName: 'Maria',
   *     lastName: 'Popescu',
   *     email: 'maria@example.com',
   *     phone: '+40712345678',
   *     dateOfBirth: new Date('1985-03-15'),
   *     addressLine1: 'Str. Exemplu 123',
   *     city: 'Bucuresti',
   *     postalCode: '010101',
   *     country: 'RO',
   *   },
   *   requestedAmount: 350000, // 3500 RON
   *   currency: 'RON',
   *   treatmentDescription: 'All-on-X dental implants',
   *   treatmentCategory: 'all_on_x',
   *   correlationId: 'corr-abc',
   * });
   * ```
   */
  createApplication(input: CreateFinancingApplication): Promise<FinancingApplication>;

  /**
   * Get a financing application by ID
   *
   * Retrieves the current state of a financing application.
   *
   * @param applicationId - Internal application ID or external provider ID
   * @param correlationId - Correlation ID for tracing
   * @returns Application details or null if not found
   */
  getApplication(
    applicationId: string,
    correlationId: string
  ): Promise<FinancingApplication | null>;

  /**
   * List financing applications
   *
   * Retrieves financing applications matching the specified criteria.
   *
   * @param options - Query options
   * @returns Paginated list of applications
   */
  listApplications(
    options: ListFinancingApplicationsOptions
  ): Promise<ListFinancingApplicationsResult>;

  /**
   * Cancel a financing application
   *
   * Cancels a pending or approved (but not accepted) application.
   *
   * @param applicationId - Application ID to cancel
   * @param reason - Cancellation reason
   * @param correlationId - Correlation ID for tracing
   * @returns Updated application with cancelled status
   */
  cancelApplication(
    applicationId: string,
    reason: string,
    correlationId: string
  ): Promise<FinancingApplication>;

  // ===========================================================================
  // OFFER MANAGEMENT
  // ===========================================================================

  /**
   * Accept a financing offer
   *
   * Accepts a specific financing offer from an approved application.
   * Requires patient consent/e-signature.
   *
   * @param input - Offer acceptance input
   * @returns Acceptance result with updated application
   *
   * @example
   * ```typescript
   * const result = await financingService.acceptOffer({
   *   applicationId: 'app-123',
   *   offerId: 'offer-456',
   *   signatureConsent: true,
   *   ipAddress: '192.168.1.1',
   *   correlationId: 'corr-xyz',
   * });
   *
   * if (result.success) {
   *   console.log(`Financing accepted! Expected funding: ${result.expectedFundingDate}`);
   * }
   * ```
   */
  acceptOffer(input: AcceptFinancingOffer): Promise<FinancingAcceptanceResult>;

  /**
   * Decline a financing offer
   *
   * Declines a specific offer (patient chose not to proceed).
   *
   * @param applicationId - Application ID
   * @param offerId - Offer ID to decline
   * @param reason - Decline reason (optional)
   * @param correlationId - Correlation ID for tracing
   */
  declineOffer(
    applicationId: string,
    offerId: string,
    reason: string | undefined,
    correlationId: string
  ): Promise<void>;

  // ===========================================================================
  // ANALYTICS & REPORTING
  // ===========================================================================

  /**
   * Get financing summary statistics
   *
   * Returns aggregated financing metrics for dashboard display.
   *
   * @param options - Summary query options
   * @returns Financing summary statistics
   */
  getSummary(options: GetFinancingSummaryOptions): Promise<FinancingSummary>;

  // ===========================================================================
  // WEBHOOK HANDLING
  // ===========================================================================

  /**
   * Verify webhook signature
   *
   * Verifies the authenticity of incoming webhooks from the provider.
   *
   * @param payload - Raw webhook payload
   * @param signatureHeader - Provider signature header
   * @returns Whether signature is valid
   */
  verifyWebhookSignature(payload: string, signatureHeader: string): boolean;

  /**
   * Validate webhook and throw if invalid
   *
   * @param payload - Raw webhook payload
   * @param signatureHeader - Provider signature header
   * @throws WebhookSignatureError if signature is invalid
   */
  validateWebhook(payload: string, signatureHeader: string): void;

  // ===========================================================================
  // HEALTH & DIAGNOSTICS
  // ===========================================================================

  /**
   * Get service health status
   *
   * Checks connectivity and availability of financing providers.
   *
   * @returns Health status for all configured providers
   */
  getHealth(): Promise<FinancingServiceHealth>;
}
