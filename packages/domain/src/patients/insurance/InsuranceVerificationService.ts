/**
 * @fileoverview Insurance Verification Domain Service
 *
 * Pure domain service for insurance verification business logic.
 * Contains rules for eligibility verification, coverage assessment,
 * and verification status transitions.
 *
 * @module domain/patients/insurance/InsuranceVerificationService
 *
 * DESIGN PRINCIPLES:
 * 1. PURE FUNCTIONS - No side effects, no I/O
 * 2. DOMAIN LOGIC ONLY - No infrastructure concerns
 * 3. HIPAA COMPLIANT - PHI handling awareness
 * 4. TESTABILITY - All functions are independently testable
 */

import type { InsuranceInfo } from '../entities/Patient.js';
import type { InsuranceStatus } from '../events/patient-events.js';

// ============================================================================
// VERIFICATION TYPES
// ============================================================================

/**
 * Insurance verification request (domain representation)
 */
export interface InsuranceVerificationInput {
  /** Current insurance info from patient aggregate */
  readonly insuranceInfo: InsuranceInfo;

  /** Patient's first name for verification match */
  readonly patientFirstName: string;

  /** Patient's last name for verification match */
  readonly patientLastName: string;

  /** Patient's date of birth for verification match */
  readonly patientDateOfBirth?: Date;

  /** Whether patient has valid consent for verification */
  readonly hasVerificationConsent: boolean;
}

/**
 * Verification result from external provider
 */
export interface ExternalVerificationResult {
  /** Verification status from provider */
  readonly status: 'active' | 'inactive' | 'expired' | 'invalid' | 'not_found';

  /** Coverage details */
  readonly coverageDetails?: CoverageDetails;

  /** Whether name matched */
  readonly nameMatch?: boolean;

  /** Whether DOB matched */
  readonly dobMatch?: boolean;

  /** External reference ID */
  readonly externalReferenceId?: string;

  /** Verification timestamp */
  readonly verifiedAt: Date;
}

/**
 * Coverage details from verification
 */
export interface CoverageDetails {
  /** Annual deductible in cents */
  readonly deductible?: number;

  /** Remaining deductible in cents */
  readonly remainingDeductible?: number;

  /** Annual maximum in cents */
  readonly annualMaximum?: number;

  /** Remaining annual maximum in cents */
  readonly remainingMaximum?: number;

  /** Copay percentage (0-100) */
  readonly copayPercentage?: number;

  /** Covered procedures */
  readonly coveredProcedures?: readonly string[];

  /** Whether pre-authorization is required */
  readonly preAuthRequired?: boolean;

  /** Coverage type (may be updated from verification) */
  readonly coverageType?: 'full' | 'partial' | 'dental_only';

  /** Policy effective date (may differ from patient record) */
  readonly effectiveFrom?: Date;

  /** Policy expiration date */
  readonly effectiveUntil?: Date;
}

/**
 * Verification outcome from domain logic
 */
export interface VerificationOutcome {
  /** Whether verification was successful */
  readonly success: boolean;

  /** New insurance status */
  readonly newStatus: InsuranceStatus;

  /** Coverage details to update */
  readonly coverageDetails?: CoverageDetails;

  /** Verification notes */
  readonly notes: readonly string[];

  /** Whether manual review is recommended */
  readonly requiresManualReview: boolean;

  /** Reason for manual review if applicable */
  readonly manualReviewReason?: string;

  /** Days until re-verification is recommended */
  readonly reVerificationDays?: number;
}

/**
 * Pre-verification check result
 */
export interface PreVerificationCheck {
  /** Whether verification can proceed */
  readonly canProceed: boolean;

  /** Reason if cannot proceed */
  readonly reason?: string;

  /** Error code if applicable */
  readonly errorCode?: PreVerificationErrorCode;

  /** Warnings to log but not block */
  readonly warnings: readonly string[];
}

export type PreVerificationErrorCode =
  | 'NO_CONSENT'
  | 'INSURANCE_NOT_FOUND'
  | 'ALREADY_VERIFIED_RECENTLY'
  | 'MISSING_PATIENT_INFO'
  | 'POLICY_EXPIRED';

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Verification service configuration
 */
export interface InsuranceVerificationConfig {
  /** Minimum days between re-verification attempts */
  readonly minDaysBetweenVerifications: number;

  /** Days before scheduled procedure to re-verify */
  readonly reVerifyBeforeProcedureDays: number;

  /** Whether to require DOB match */
  readonly requireDobMatch: boolean;

  /** Whether to require name match */
  readonly requireNameMatch: boolean;

  /** Cache duration for verification results (days) */
  readonly verificationCacheDays: number;
}

/**
 * Default configuration
 */
export const DEFAULT_VERIFICATION_CONFIG: InsuranceVerificationConfig = {
  minDaysBetweenVerifications: 7,
  reVerifyBeforeProcedureDays: 3,
  requireDobMatch: false, // Some providers don't return DOB match
  requireNameMatch: true,
  verificationCacheDays: 30,
};

// ============================================================================
// CORE SERVICE FUNCTIONS
// ============================================================================

/**
 * Perform pre-verification checks before calling external API
 *
 * @param input - Verification input data
 * @param config - Service configuration
 * @returns Pre-verification check result
 */
export function performPreVerificationChecks(
  input: InsuranceVerificationInput,
  config: InsuranceVerificationConfig = DEFAULT_VERIFICATION_CONFIG
): PreVerificationCheck {
  const warnings: string[] = [];

  // Check consent
  if (!input.hasVerificationConsent) {
    return {
      canProceed: false,
      reason: 'Patient has not provided consent for insurance verification',
      errorCode: 'NO_CONSENT',
      warnings: [],
    };
  }

  // Check if policy is already expired based on stored dates
  const now = new Date();
  if (input.insuranceInfo.effectiveUntil && input.insuranceInfo.effectiveUntil < now) {
    return {
      canProceed: false,
      reason: 'Insurance policy has expired according to stored dates',
      errorCode: 'POLICY_EXPIRED',
      warnings: [],
    };
  }

  // Check if recently verified
  if (input.insuranceInfo.verifiedAt) {
    const daysSinceVerification = Math.floor(
      (now.getTime() - input.insuranceInfo.verifiedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceVerification < config.minDaysBetweenVerifications) {
      return {
        canProceed: false,
        reason: `Insurance was verified ${daysSinceVerification} days ago. Minimum ${config.minDaysBetweenVerifications} days required.`,
        errorCode: 'ALREADY_VERIFIED_RECENTLY',
        warnings: [],
      };
    }

    if (daysSinceVerification < config.verificationCacheDays) {
      warnings.push(
        `Last verification was ${daysSinceVerification} days ago. Consider if re-verification is necessary.`
      );
    }
  }

  // Check patient info completeness
  if (!input.patientFirstName || !input.patientLastName) {
    return {
      canProceed: false,
      reason: 'Patient name is required for verification',
      errorCode: 'MISSING_PATIENT_INFO',
      warnings: [],
    };
  }

  // Warn if DOB is missing (some providers require it)
  if (!input.patientDateOfBirth) {
    warnings.push('Patient date of birth not provided. Some insurers may reject verification.');
  }

  return {
    canProceed: true,
    warnings,
  };
}

/**
 * Process verification result from external provider
 *
 * @param input - Original verification input
 * @param result - Result from external provider
 * @param config - Service configuration
 * @returns Verification outcome with domain decisions
 */
export function processVerificationResult(
  input: InsuranceVerificationInput,
  result: ExternalVerificationResult,
  config: InsuranceVerificationConfig = DEFAULT_VERIFICATION_CONFIG
): VerificationOutcome {
  const notes: string[] = [];
  let requiresManualReview = false;
  let manualReviewReason: string | undefined;

  // Determine new status based on external result
  let newStatus: InsuranceStatus;

  switch (result.status) {
    case 'active':
      newStatus = 'verified';
      notes.push('Insurance verified as active');
      break;

    case 'expired':
      newStatus = 'expired';
      notes.push('Insurance policy has expired');
      break;

    case 'inactive':
      newStatus = 'expired';
      notes.push('Insurance policy is inactive');
      requiresManualReview = true;
      manualReviewReason = 'Policy marked as inactive - patient may need to update insurance';
      break;

    case 'invalid':
      newStatus = 'none';
      notes.push('Insurance information could not be validated');
      requiresManualReview = true;
      manualReviewReason = 'Invalid policy information - verify with patient';
      break;

    case 'not_found':
      newStatus = 'pending';
      notes.push('Insurance information not found in provider system');
      requiresManualReview = true;
      manualReviewReason = 'Policy not found - may need manual verification or updated information';
      break;
  }

  // Check name match if required
  if (config.requireNameMatch && result.nameMatch === false) {
    requiresManualReview = true;
    manualReviewReason = 'Name on policy does not match patient name';
    notes.push('WARNING: Patient name does not match policy holder name');
  }

  // Check DOB match if required and provided
  if (config.requireDobMatch && result.dobMatch === false) {
    requiresManualReview = true;
    manualReviewReason = 'Date of birth does not match policy records';
    notes.push('WARNING: Date of birth mismatch');
  }

  // Add coverage details notes
  if (result.coverageDetails) {
    const details = result.coverageDetails;

    if (details.deductible !== undefined && details.remainingDeductible !== undefined) {
      notes.push(
        `Deductible: $${(details.deductible / 100).toFixed(2)} (Remaining: $${(details.remainingDeductible / 100).toFixed(2)})`
      );

      if (details.remainingDeductible === 0) {
        notes.push('Deductible has been met for this period');
      }
    }

    if (details.annualMaximum !== undefined && details.remainingMaximum !== undefined) {
      notes.push(
        `Annual Maximum: $${(details.annualMaximum / 100).toFixed(2)} (Remaining: $${(details.remainingMaximum / 100).toFixed(2)})`
      );

      // Warn if low remaining maximum
      if (details.remainingMaximum < 50000) {
        // Less than $500
        notes.push('WARNING: Low remaining annual maximum');
      }
    }

    if (details.preAuthRequired) {
      notes.push('Pre-authorization required for major procedures');
    }
  }

  // Calculate re-verification date
  let reVerificationDays: number | undefined;
  if (newStatus === 'verified') {
    reVerificationDays = config.verificationCacheDays;

    // If policy has expiration, re-verify before that
    if (result.coverageDetails?.effectiveUntil) {
      const daysUntilExpiration = Math.floor(
        (result.coverageDetails.effectiveUntil.getTime() - new Date().getTime()) /
          (1000 * 60 * 60 * 24)
      );
      if (daysUntilExpiration < reVerificationDays) {
        reVerificationDays = Math.max(1, daysUntilExpiration - 7); // Re-verify 7 days before expiration
      }
    }
  }

  return {
    success: result.status === 'active',
    newStatus,
    coverageDetails: result.coverageDetails,
    notes: Object.freeze(notes),
    requiresManualReview,
    manualReviewReason,
    reVerificationDays,
  };
}

/**
 * Determine if re-verification is needed based on current state and upcoming events
 *
 * @param insuranceInfo - Current insurance info
 * @param upcomingProcedureDate - Optional date of upcoming procedure
 * @param config - Service configuration
 * @returns Whether re-verification is recommended
 */
export function shouldReVerify(
  insuranceInfo: InsuranceInfo | undefined,
  upcomingProcedureDate?: Date,
  config: InsuranceVerificationConfig = DEFAULT_VERIFICATION_CONFIG
): {
  shouldVerify: boolean;
  reason?: string;
  urgency: 'low' | 'medium' | 'high';
} {
  // No insurance info - verification needed
  if (!insuranceInfo) {
    return {
      shouldVerify: true,
      reason: 'No insurance information on file',
      urgency: 'high',
    };
  }

  // Not yet verified - verification needed
  if (insuranceInfo.status === 'pending') {
    return {
      shouldVerify: true,
      reason: 'Insurance has not been verified',
      urgency: 'high',
    };
  }

  // Already expired - may still want to verify for updated status
  if (insuranceInfo.status === 'expired') {
    return {
      shouldVerify: true,
      reason: 'Insurance is marked as expired - patient may have new coverage',
      urgency: 'medium',
    };
  }

  // Check if verification is stale
  const now = new Date();
  if (insuranceInfo.verifiedAt) {
    const daysSinceVerification = Math.floor(
      (now.getTime() - insuranceInfo.verifiedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceVerification >= config.verificationCacheDays) {
      return {
        shouldVerify: true,
        reason: `Last verification was ${daysSinceVerification} days ago`,
        urgency: 'medium',
      };
    }

    // Check if upcoming procedure requires fresh verification
    if (upcomingProcedureDate) {
      const daysUntilProcedure = Math.floor(
        (upcomingProcedureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (
        daysUntilProcedure <= config.reVerifyBeforeProcedureDays &&
        daysSinceVerification >= config.minDaysBetweenVerifications
      ) {
        return {
          shouldVerify: true,
          reason: `Procedure scheduled in ${daysUntilProcedure} days - verification recommended`,
          urgency: 'high',
        };
      }
    }
  }

  // Check if policy expiration is approaching
  if (insuranceInfo.effectiveUntil) {
    const daysUntilExpiration = Math.floor(
      (insuranceInfo.effectiveUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysUntilExpiration <= 30 && daysUntilExpiration > 0) {
      return {
        shouldVerify: true,
        reason: `Policy expires in ${daysUntilExpiration} days`,
        urgency: daysUntilExpiration <= 7 ? 'high' : 'medium',
      };
    }
  }

  return {
    shouldVerify: false,
    urgency: 'low',
  };
}

/**
 * Calculate coverage estimate for a procedure
 *
 * @param procedureCost - Total procedure cost in cents
 * @param coverageDetails - Coverage details from verification
 * @returns Coverage estimate
 */
export function calculateCoverageEstimate(
  procedureCost: number,
  coverageDetails?: CoverageDetails
): {
  estimatedCoverage: number;
  estimatedPatientResponsibility: number;
  coverageBreakdown: readonly string[];
  isEstimate: boolean;
} {
  const breakdown: string[] = [];

  if (!coverageDetails) {
    return {
      estimatedCoverage: 0,
      estimatedPatientResponsibility: procedureCost,
      coverageBreakdown: ['No coverage details available'],
      isEstimate: true,
    };
  }

  let patientResponsibility = procedureCost;

  // Apply remaining deductible first
  if (
    coverageDetails.remainingDeductible !== undefined &&
    coverageDetails.remainingDeductible > 0
  ) {
    const deductibleApplied = Math.min(coverageDetails.remainingDeductible, procedureCost);
    patientResponsibility = procedureCost - deductibleApplied + deductibleApplied; // Patient pays deductible
    breakdown.push(`Deductible: $${(deductibleApplied / 100).toFixed(2)}`);
  }

  // Calculate coverage after deductible
  const afterDeductible =
    procedureCost - Math.min(coverageDetails.remainingDeductible ?? 0, procedureCost);

  if (coverageDetails.copayPercentage !== undefined) {
    const insurancePayPercent = (100 - coverageDetails.copayPercentage) / 100;
    const insurancePays = Math.floor(afterDeductible * insurancePayPercent);

    // Cap at remaining annual maximum
    const cappedInsurancePays = coverageDetails.remainingMaximum
      ? Math.min(insurancePays, coverageDetails.remainingMaximum)
      : insurancePays;

    patientResponsibility = procedureCost - cappedInsurancePays;

    breakdown.push(
      `Insurance covers ${100 - coverageDetails.copayPercentage}%: $${(cappedInsurancePays / 100).toFixed(2)}`
    );
    breakdown.push(
      `Patient copay (${coverageDetails.copayPercentage}%): Included in responsibility`
    );

    if (
      coverageDetails.remainingMaximum !== undefined &&
      insurancePays > coverageDetails.remainingMaximum
    ) {
      breakdown.push(
        `Annual maximum reached - excess: $${((insurancePays - coverageDetails.remainingMaximum) / 100).toFixed(2)}`
      );
    }
  }

  const estimatedCoverage = procedureCost - patientResponsibility;

  return {
    estimatedCoverage,
    estimatedPatientResponsibility: patientResponsibility,
    coverageBreakdown: Object.freeze(breakdown),
    isEstimate: true,
  };
}

/**
 * Validate policy number format (basic validation)
 */
export function isValidPolicyNumber(policyNumber: string): boolean {
  // Policy numbers should be alphanumeric, at least 5 characters
  const trimmed = policyNumber.trim();
  if (trimmed.length < 5) return false;
  if (trimmed.length > 30) return false;

  // Allow alphanumeric and common separators (dash, underscore)
  return /^[A-Za-z0-9\-_]+$/.test(trimmed);
}

/**
 * Validate group number format (basic validation)
 */
export function isValidGroupNumber(groupNumber: string | undefined): boolean {
  if (!groupNumber) return true; // Group number is optional

  const trimmed = groupNumber.trim();
  if (trimmed.length < 3) return false;
  if (trimmed.length > 20) return false;

  return /^[A-Za-z0-9\-_]+$/.test(trimmed);
}

/**
 * Normalize policy number for comparison
 */
export function normalizePolicyNumber(policyNumber: string): string {
  return policyNumber.toUpperCase().replace(/[\s\-_]/g, '');
}
