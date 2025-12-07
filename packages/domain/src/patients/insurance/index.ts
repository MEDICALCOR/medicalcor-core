/**
 * @fileoverview Insurance Verification Exports
 *
 * @module domain/patients/insurance
 */

export {
  // Types
  type InsuranceVerificationInput,
  type ExternalVerificationResult,
  type CoverageDetails,
  type VerificationOutcome,
  type PreVerificationCheck,
  type PreVerificationErrorCode,
  type InsuranceVerificationConfig,
  // Constants
  DEFAULT_VERIFICATION_CONFIG,
  // Functions
  performPreVerificationChecks,
  processVerificationResult,
  shouldReVerify,
  calculateCoverageEstimate,
  isValidPolicyNumber,
  isValidGroupNumber,
  normalizePolicyNumber,
} from './InsuranceVerificationService.js';
