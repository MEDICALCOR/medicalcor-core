/**
 * @fileoverview Secondary Port - Insurance Verification Gateway
 *
 * Defines what the application needs for insurance verification (driven side).
 * This is a hexagonal architecture SECONDARY PORT for insurance eligibility verification.
 *
 * @module application/ports/secondary/external/InsuranceVerificationGateway
 *
 * HIPAA COMPLIANCE:
 * All insurance verification requests contain PHI and must be logged and secured.
 * Verification results should be cached to minimize external API calls.
 */

/**
 * Result type for insurance verification operations
 */
export type InsuranceResult<T, E> =
  | { readonly _tag: 'Ok'; readonly value: T }
  | { readonly _tag: 'Err'; readonly error: E };

/**
 * Insurance verification request
 */
export interface InsuranceVerificationRequest {
  /** Patient ID for audit trail */
  readonly patientId: string;

  /** Insurance provider ID */
  readonly providerId: string;

  /** Insurance provider name for display */
  readonly providerName: string;

  /** Policy/member number */
  readonly policyNumber: string;

  /** Group number (optional) */
  readonly groupNumber?: string;

  /** Patient's first name (for verification match) */
  readonly patientFirstName: string;

  /** Patient's last name (for verification match) */
  readonly patientLastName: string;

  /** Patient's date of birth (for verification match) */
  readonly patientDateOfBirth?: Date;

  /** Correlation ID for request tracing */
  readonly correlationId: string;
}

/**
 * Verification status returned from the insurance API
 */
export type VerificationStatus = 'active' | 'inactive' | 'expired' | 'invalid' | 'not_found';

/**
 * Coverage details from insurance verification
 */
export interface CoverageDetails {
  /** Coverage type */
  readonly coverageType: 'full' | 'partial' | 'dental_only';

  /** Policy effective date */
  readonly effectiveFrom: Date;

  /** Policy expiration date (if applicable) */
  readonly effectiveUntil?: Date;

  /** Annual deductible amount in cents */
  readonly deductible?: number;

  /** Remaining deductible for the year in cents */
  readonly remainingDeductible?: number;

  /** Annual maximum coverage in cents */
  readonly annualMaximum?: number;

  /** Remaining annual maximum in cents */
  readonly remainingMaximum?: number;

  /** Copay percentage (0-100) */
  readonly copayPercentage?: number;

  /** Covered procedure types */
  readonly coveredProcedures?: readonly string[];

  /** Waiting period in days for major procedures */
  readonly waitingPeriodDays?: number;

  /** Whether pre-authorization is required */
  readonly preAuthRequired?: boolean;
}

/**
 * Insurance verification result
 */
export interface InsuranceVerificationResult {
  /** Verification status */
  readonly status: VerificationStatus;

  /** Coverage details (present if status is 'active') */
  readonly coverageDetails?: CoverageDetails;

  /** Verification timestamp */
  readonly verifiedAt: Date;

  /** External reference ID from insurance API */
  readonly externalReferenceId?: string;

  /** Human-readable status message */
  readonly message?: string;

  /** Whether the policy holder name matches the patient */
  readonly nameMatch?: boolean;

  /** Whether the date of birth matches */
  readonly dobMatch?: boolean;
}

/**
 * Pre-authorization request for specific procedures
 */
export interface PreAuthorizationRequest {
  /** Patient ID */
  readonly patientId: string;

  /** Policy number */
  readonly policyNumber: string;

  /** Provider ID */
  readonly providerId: string;

  /** Procedure codes (CDT or CPT) */
  readonly procedureCodes: readonly string[];

  /** Estimated cost in cents */
  readonly estimatedCost?: number;

  /** Treating provider NPI */
  readonly treatingProviderNPI?: string;

  /** Correlation ID */
  readonly correlationId: string;
}

/**
 * Pre-authorization result
 */
export interface PreAuthorizationResult {
  /** Whether pre-authorization is approved */
  readonly approved: boolean;

  /** Pre-authorization reference number */
  readonly authorizationNumber?: string;

  /** Approved procedures */
  readonly approvedProcedures?: readonly string[];

  /** Denied procedures with reasons */
  readonly deniedProcedures?: readonly {
    readonly code: string;
    readonly reason: string;
  }[];

  /** Authorization expiration date */
  readonly expiresAt?: Date;

  /** Maximum approved amount in cents */
  readonly approvedAmount?: number;

  /** Additional notes or requirements */
  readonly notes?: string;
}

/**
 * Insurance verification error types
 */
export type InsuranceVerificationErrorCode =
  | 'PROVIDER_NOT_SUPPORTED'
  | 'INVALID_POLICY_NUMBER'
  | 'VERIFICATION_TIMEOUT'
  | 'API_ERROR'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION_FAILED'
  | 'INVALID_REQUEST'
  | 'SERVICE_UNAVAILABLE';

/**
 * Insurance verification error
 */
export interface InsuranceVerificationError {
  readonly code: InsuranceVerificationErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
}

/**
 * SECONDARY PORT: Insurance Verification Gateway
 *
 * This interface defines how the application verifies insurance eligibility
 * through external insurance verification APIs.
 *
 * Implementations:
 * - Real: Calls external APIs (Availity, Change Healthcare, Dental Xchange)
 * - Mock: Returns predefined responses for testing
 *
 * @example
 * ```typescript
 * // Adapter implementing this port
 * class AvailityInsuranceAdapter implements InsuranceVerificationGateway {
 *   async verifyEligibility(request: InsuranceVerificationRequest) {
 *     const response = await this.availityClient.verify(request);
 *     return this.mapToResult(response);
 *   }
 * }
 * ```
 */
export interface InsuranceVerificationGateway {
  /**
   * Verify insurance eligibility for a patient
   *
   * This is the primary verification method. It checks:
   * - Policy validity and status
   * - Coverage details (deductible, maximum, copay)
   * - Name and DOB matching
   *
   * @param request - Verification request with patient and insurance details
   * @returns Result with verification details or error
   */
  verifyEligibility(
    request: InsuranceVerificationRequest
  ): Promise<InsuranceResult<InsuranceVerificationResult, InsuranceVerificationError>>;

  /**
   * Request pre-authorization for specific procedures
   *
   * Some insurance plans require pre-authorization for major procedures.
   * This method submits a pre-auth request and returns the result.
   *
   * @param request - Pre-authorization request with procedure details
   * @returns Result with authorization details or error
   */
  requestPreAuthorization(
    request: PreAuthorizationRequest
  ): Promise<InsuranceResult<PreAuthorizationResult, InsuranceVerificationError>>;

  /**
   * Check if an insurance provider is supported
   *
   * @param providerId - Insurance provider identifier
   * @returns true if the provider is supported
   */
  isProviderSupported(providerId: string): Promise<boolean>;

  /**
   * Get list of supported insurance providers
   *
   * @returns Array of supported provider IDs and names
   */
  getSupportedProviders(): Promise<
    readonly {
      readonly id: string;
      readonly name: string;
    }[]
  >;

  /**
   * Health check for the insurance verification service
   *
   * @returns true if the service is available
   */
  healthCheck(): Promise<boolean>;
}

/**
 * Factory function to create a result for successful verification
 */
export function createVerificationSuccess(
  result: InsuranceVerificationResult
): InsuranceResult<InsuranceVerificationResult, InsuranceVerificationError> {
  return { _tag: 'Ok', value: result };
}

/**
 * Factory function to create a result for verification failure
 */
export function createVerificationError(
  error: InsuranceVerificationError
): InsuranceResult<InsuranceVerificationResult, InsuranceVerificationError> {
  return { _tag: 'Err', error };
}

/**
 * Check if an error is retryable
 */
export function isRetryableError(error: InsuranceVerificationError): boolean {
  return error.retryable;
}

/**
 * Common insurance provider IDs
 */
export const INSURANCE_PROVIDERS = {
  DELTA_DENTAL: 'delta_dental',
  METLIFE: 'metlife',
  CIGNA: 'cigna',
  AETNA: 'aetna',
  UNITED_HEALTHCARE: 'united_healthcare',
  GUARDIAN: 'guardian',
  HUMANA: 'humana',
  BCBS: 'bcbs',
  PRINCIPAL: 'principal',
  SUN_LIFE: 'sun_life',
} as const;

export type InsuranceProviderId = (typeof INSURANCE_PROVIDERS)[keyof typeof INSURANCE_PROVIDERS];
