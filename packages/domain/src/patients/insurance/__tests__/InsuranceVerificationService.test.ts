import { describe, it, expect, beforeEach } from 'vitest';
import {
  performPreVerificationChecks,
  processVerificationResult,
  shouldReVerify,
  calculateCoverageEstimate,
  isValidPolicyNumber,
  isValidGroupNumber,
  normalizePolicyNumber,
  DEFAULT_VERIFICATION_CONFIG,
  type InsuranceVerificationInput,
  type ExternalVerificationResult,
} from '../InsuranceVerificationService.js';
import type { InsuranceInfo } from '../../entities/Patient.js';

describe('InsuranceVerificationService', () => {
  // ============================================================================
  // PRE-VERIFICATION CHECKS
  // ============================================================================

  describe('performPreVerificationChecks', () => {
    const validInsuranceInfo: InsuranceInfo = {
      id: 'ins-123',
      providerId: 'delta_dental',
      providerName: 'Delta Dental',
      policyNumber: 'ABC123456',
      coverageType: 'full',
      effectiveFrom: new Date('2024-01-01'),
      status: 'pending',
    };

    const baseInput: InsuranceVerificationInput = {
      insuranceInfo: validInsuranceInfo,
      patientFirstName: 'John',
      patientLastName: 'Doe',
      patientDateOfBirth: new Date('1980-01-15'),
      hasVerificationConsent: true,
    };

    it('should allow verification with valid input', () => {
      const result = performPreVerificationChecks(baseInput);

      expect(result.canProceed).toBe(true);
      expect(result.errorCode).toBeUndefined();
    });

    it('should block verification without consent', () => {
      const input: InsuranceVerificationInput = {
        ...baseInput,
        hasVerificationConsent: false,
      };

      const result = performPreVerificationChecks(input);

      expect(result.canProceed).toBe(false);
      expect(result.errorCode).toBe('NO_CONSENT');
      expect(result.reason).toContain('consent');
    });

    it('should block verification with expired policy', () => {
      const input: InsuranceVerificationInput = {
        ...baseInput,
        insuranceInfo: {
          ...validInsuranceInfo,
          effectiveUntil: new Date('2023-01-01'), // Expired
        },
      };

      const result = performPreVerificationChecks(input);

      expect(result.canProceed).toBe(false);
      expect(result.errorCode).toBe('POLICY_EXPIRED');
    });

    it('should block verification if recently verified', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3); // 3 days ago

      const input: InsuranceVerificationInput = {
        ...baseInput,
        insuranceInfo: {
          ...validInsuranceInfo,
          verifiedAt: recentDate,
        },
      };

      const result = performPreVerificationChecks(input);

      expect(result.canProceed).toBe(false);
      expect(result.errorCode).toBe('ALREADY_VERIFIED_RECENTLY');
    });

    it('should block verification without patient name', () => {
      const input: InsuranceVerificationInput = {
        ...baseInput,
        patientFirstName: '',
      };

      const result = performPreVerificationChecks(input);

      expect(result.canProceed).toBe(false);
      expect(result.errorCode).toBe('MISSING_PATIENT_INFO');
    });

    it('should warn if DOB is missing', () => {
      const input: InsuranceVerificationInput = {
        ...baseInput,
        patientDateOfBirth: undefined,
      };

      const result = performPreVerificationChecks(input);

      expect(result.canProceed).toBe(true);
      expect(result.warnings).toContain(
        'Patient date of birth not provided. Some insurers may reject verification.'
      );
    });

    it('should warn if verification is within cache period', () => {
      const withinCacheDate = new Date();
      withinCacheDate.setDate(withinCacheDate.getDate() - 15); // 15 days ago

      const input: InsuranceVerificationInput = {
        ...baseInput,
        insuranceInfo: {
          ...validInsuranceInfo,
          verifiedAt: withinCacheDate,
        },
      };

      const result = performPreVerificationChecks(input);

      expect(result.canProceed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('15 days ago');
    });
  });

  // ============================================================================
  // PROCESS VERIFICATION RESULT
  // ============================================================================

  describe('processVerificationResult', () => {
    const baseInput: InsuranceVerificationInput = {
      insuranceInfo: {
        id: 'ins-123',
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        coverageType: 'full',
        effectiveFrom: new Date('2024-01-01'),
        status: 'pending',
      },
      patientFirstName: 'John',
      patientLastName: 'Doe',
      hasVerificationConsent: true,
    };

    it('should mark as verified for active status', () => {
      const result: ExternalVerificationResult = {
        status: 'active',
        verifiedAt: new Date(),
        nameMatch: true,
        dobMatch: true,
      };

      const outcome = processVerificationResult(baseInput, result);

      expect(outcome.success).toBe(true);
      expect(outcome.newStatus).toBe('verified');
      expect(outcome.requiresManualReview).toBe(false);
    });

    it('should mark as expired for expired status', () => {
      const result: ExternalVerificationResult = {
        status: 'expired',
        verifiedAt: new Date(),
      };

      const outcome = processVerificationResult(baseInput, result);

      expect(outcome.success).toBe(false);
      expect(outcome.newStatus).toBe('expired');
    });

    it('should mark as expired for inactive status with manual review', () => {
      const result: ExternalVerificationResult = {
        status: 'inactive',
        verifiedAt: new Date(),
      };

      const outcome = processVerificationResult(baseInput, result);

      expect(outcome.success).toBe(false);
      expect(outcome.newStatus).toBe('expired');
      expect(outcome.requiresManualReview).toBe(true);
      expect(outcome.manualReviewReason).toContain('inactive');
    });

    it('should mark as none for invalid status', () => {
      const result: ExternalVerificationResult = {
        status: 'invalid',
        verifiedAt: new Date(),
      };

      const outcome = processVerificationResult(baseInput, result);

      expect(outcome.success).toBe(false);
      expect(outcome.newStatus).toBe('none');
      expect(outcome.requiresManualReview).toBe(true);
    });

    it('should require manual review for name mismatch', () => {
      const result: ExternalVerificationResult = {
        status: 'active',
        verifiedAt: new Date(),
        nameMatch: false,
        dobMatch: true,
      };

      const outcome = processVerificationResult(baseInput, result);

      expect(outcome.requiresManualReview).toBe(true);
      expect(outcome.manualReviewReason).toContain('name');
      expect(outcome.notes).toContain('WARNING: Patient name does not match policy holder name');
    });

    it('should include coverage details in notes', () => {
      const result: ExternalVerificationResult = {
        status: 'active',
        verifiedAt: new Date(),
        nameMatch: true,
        coverageDetails: {
          deductible: 50000, // $500
          remainingDeductible: 0,
          annualMaximum: 200000, // $2000
          remainingMaximum: 40000, // $400 (low)
          preAuthRequired: true,
        },
      };

      const outcome = processVerificationResult(baseInput, result);

      expect(outcome.notes).toContain('Deductible has been met for this period');
      expect(outcome.notes).toContain('Pre-authorization required for major procedures');
      expect(outcome.notes.some((n) => n.includes('WARNING: Low remaining annual maximum'))).toBe(
        true
      );
    });

    it('should calculate re-verification days', () => {
      const result: ExternalVerificationResult = {
        status: 'active',
        verifiedAt: new Date(),
      };

      const outcome = processVerificationResult(baseInput, result);

      expect(outcome.reVerificationDays).toBe(DEFAULT_VERIFICATION_CONFIG.verificationCacheDays);
    });
  });

  // ============================================================================
  // SHOULD RE-VERIFY
  // ============================================================================

  describe('shouldReVerify', () => {
    it('should return true if no insurance info', () => {
      const result = shouldReVerify(undefined);

      expect(result.shouldVerify).toBe(true);
      expect(result.urgency).toBe('high');
    });

    it('should return true if status is pending', () => {
      const insuranceInfo: InsuranceInfo = {
        id: 'ins-123',
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        coverageType: 'full',
        effectiveFrom: new Date('2024-01-01'),
        status: 'pending',
      };

      const result = shouldReVerify(insuranceInfo);

      expect(result.shouldVerify).toBe(true);
      expect(result.urgency).toBe('high');
    });

    it('should return true if verification is stale', () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 45); // 45 days ago

      const insuranceInfo: InsuranceInfo = {
        id: 'ins-123',
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        coverageType: 'full',
        effectiveFrom: new Date('2024-01-01'),
        status: 'verified',
        verifiedAt: staleDate,
      };

      const result = shouldReVerify(insuranceInfo);

      expect(result.shouldVerify).toBe(true);
      expect(result.urgency).toBe('medium');
    });

    it('should return true if procedure is upcoming and verification needed', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 10);

      const upcomingProcedure = new Date();
      upcomingProcedure.setDate(upcomingProcedure.getDate() + 2);

      const insuranceInfo: InsuranceInfo = {
        id: 'ins-123',
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        coverageType: 'full',
        effectiveFrom: new Date('2024-01-01'),
        status: 'verified',
        verifiedAt: recentDate,
      };

      const result = shouldReVerify(insuranceInfo, upcomingProcedure);

      expect(result.shouldVerify).toBe(true);
      expect(result.urgency).toBe('high');
    });

    it('should return false if recently verified and no procedure upcoming', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 5);

      const insuranceInfo: InsuranceInfo = {
        id: 'ins-123',
        providerId: 'delta_dental',
        providerName: 'Delta Dental',
        policyNumber: 'ABC123456',
        coverageType: 'full',
        effectiveFrom: new Date('2024-01-01'),
        status: 'verified',
        verifiedAt: recentDate,
      };

      const result = shouldReVerify(insuranceInfo);

      expect(result.shouldVerify).toBe(false);
      expect(result.urgency).toBe('low');
    });
  });

  // ============================================================================
  // CALCULATE COVERAGE ESTIMATE
  // ============================================================================

  describe('calculateCoverageEstimate', () => {
    it('should return full patient responsibility without coverage details', () => {
      const result = calculateCoverageEstimate(100000); // $1000

      expect(result.estimatedCoverage).toBe(0);
      expect(result.estimatedPatientResponsibility).toBe(100000);
      expect(result.isEstimate).toBe(true);
    });

    it('should calculate coverage with deductible and copay', () => {
      const result = calculateCoverageEstimate(100000, {
        deductible: 50000, // $500
        remainingDeductible: 25000, // $250 remaining
        copayPercentage: 20, // Patient pays 20%
        annualMaximum: 200000, // $2000
        remainingMaximum: 200000, // Full maximum available
      });

      expect(result.isEstimate).toBe(true);
      expect(result.coverageBreakdown.length).toBeGreaterThan(0);
      // Deductible: $250 + 20% of remaining ($750) = $250 + $150 = $400
      // Insurance pays 80% of $750 = $600
    });

    it('should cap coverage at annual maximum', () => {
      const result = calculateCoverageEstimate(500000, {
        // $5000 procedure
        deductible: 50000, // $500
        remainingDeductible: 0, // Met
        copayPercentage: 20,
        annualMaximum: 200000, // $2000
        remainingMaximum: 100000, // Only $1000 remaining
      });

      // Insurance should only pay up to remaining max
      expect(result.coverageBreakdown.some((b) => b.includes('maximum reached'))).toBe(true);
    });
  });

  // ============================================================================
  // VALIDATION FUNCTIONS
  // ============================================================================

  describe('isValidPolicyNumber', () => {
    it('should accept valid policy numbers', () => {
      expect(isValidPolicyNumber('ABC123456')).toBe(true);
      expect(isValidPolicyNumber('12345')).toBe(true);
      expect(isValidPolicyNumber('POL-123-456')).toBe(true);
      expect(isValidPolicyNumber('POL_123_456')).toBe(true);
    });

    it('should reject invalid policy numbers', () => {
      expect(isValidPolicyNumber('')).toBe(false);
      expect(isValidPolicyNumber('1234')).toBe(false); // Too short
      expect(isValidPolicyNumber('ABC!@#')).toBe(false); // Invalid characters
      expect(isValidPolicyNumber('A'.repeat(35))).toBe(false); // Too long
    });
  });

  describe('isValidGroupNumber', () => {
    it('should accept valid group numbers', () => {
      expect(isValidGroupNumber('GRP123')).toBe(true);
      expect(isValidGroupNumber('12345')).toBe(true);
      expect(isValidGroupNumber(undefined)).toBe(true); // Optional
    });

    it('should reject invalid group numbers', () => {
      expect(isValidGroupNumber('12')).toBe(false); // Too short
      expect(isValidGroupNumber('A'.repeat(25))).toBe(false); // Too long
    });
  });

  describe('normalizePolicyNumber', () => {
    it('should normalize policy numbers for comparison', () => {
      expect(normalizePolicyNumber('abc-123')).toBe('ABC123');
      expect(normalizePolicyNumber('ABC 123')).toBe('ABC123');
      expect(normalizePolicyNumber('ABC_123')).toBe('ABC123');
      expect(normalizePolicyNumber('  abc123  ')).toBe('ABC123');
    });
  });
});
