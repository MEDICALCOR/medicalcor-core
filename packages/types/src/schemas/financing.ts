/**
 * @fileoverview Financing & Payment Plan Schemas
 *
 * L2 Feature: Third-party financing integration with Stripe Partners.
 * Enables patients to apply for financing/payment plans for dental procedures.
 *
 * @module types/schemas/financing
 */

import { z } from 'zod';

// ============================================================================
// FINANCING APPLICATION STATUS
// ============================================================================

/**
 * Status of a financing application
 */
export const FinancingApplicationStatusSchema = z.enum([
  'draft', // Application started but not submitted
  'pending', // Submitted, awaiting lender review
  'approved', // Approved by lender
  'declined', // Declined by lender
  'expired', // Offer expired (not accepted in time)
  'cancelled', // Cancelled by patient or clinic
  'accepted', // Patient accepted the financing offer
  'funded', // Funds disbursed to clinic
]);

export type FinancingApplicationStatus = z.infer<typeof FinancingApplicationStatusSchema>;

// ============================================================================
// FINANCING PLAN TYPES
// ============================================================================

/**
 * Type of financing plan/product
 */
export const FinancingPlanTypeSchema = z.enum([
  'installment', // Fixed installment plan (6, 12, 18, 24 months)
  'deferred', // Deferred interest (0% APR if paid in full)
  'revolving', // Revolving credit line
  'promotional', // Promotional rate (limited time)
]);

export type FinancingPlanType = z.infer<typeof FinancingPlanTypeSchema>;

/**
 * Financing term options (months)
 */
export const FinancingTermSchema = z.enum(['3', '6', '12', '18', '24', '36', '48', '60']);

export type FinancingTerm = z.infer<typeof FinancingTermSchema>;

/**
 * Decision codes from lender
 */
export const FinancingDecisionCodeSchema = z.enum([
  'approved', // Full approval
  'approved_with_conditions', // Approved with modified terms
  'declined_credit', // Declined due to credit score
  'declined_income', // Declined due to insufficient income
  'declined_fraud', // Declined due to fraud risk
  'declined_other', // Declined for other reasons
  'pending_review', // Manual review required
  'pending_documents', // Additional documents needed
]);

export type FinancingDecisionCode = z.infer<typeof FinancingDecisionCodeSchema>;

// ============================================================================
// FINANCING PROVIDER CONFIG
// ============================================================================

/**
 * Supported financing providers
 */
export const FinancingProviderSchema = z.enum([
  'stripe_financing', // Stripe Capital/Financing
  'affirm', // Affirm integration via Stripe
  'afterpay', // Afterpay integration via Stripe
  'klarna', // Klarna integration via Stripe
]);

export type FinancingProvider = z.infer<typeof FinancingProviderSchema>;

// ============================================================================
// FINANCING APPLICATION REQUEST
// ============================================================================

/**
 * Applicant information for financing application
 */
export const FinancingApplicantSchema = z.object({
  /** Lead/Patient ID in our system */
  leadId: z.string().uuid(),
  /** First name */
  firstName: z.string().min(1).max(100),
  /** Last name */
  lastName: z.string().min(1).max(100),
  /** Email address */
  email: z.string().email(),
  /** Phone number (E.164 format) */
  phone: z.string().min(10).max(20),
  /** Date of birth */
  dateOfBirth: z.coerce.date().optional(),
  /** Address line 1 */
  addressLine1: z.string().min(1).max(200).optional(),
  /** Address line 2 */
  addressLine2: z.string().max(200).optional(),
  /** City */
  city: z.string().max(100).optional(),
  /** State/Province */
  state: z.string().max(100).optional(),
  /** Postal code */
  postalCode: z.string().max(20).optional(),
  /** Country code (ISO 3166-1 alpha-2) */
  country: z.string().length(2).default('RO'),
  /** Social security number (last 4 digits only for soft pull) */
  ssnLast4: z.string().length(4).optional(),
});

export type FinancingApplicant = z.infer<typeof FinancingApplicantSchema>;

/**
 * Create financing application request
 */
export const CreateFinancingApplicationSchema = z.object({
  /** Case ID associated with this financing */
  caseId: z.string().uuid(),
  /** Clinic ID */
  clinicId: z.string().uuid(),
  /** Applicant information */
  applicant: FinancingApplicantSchema,
  /** Requested financing amount (in minor currency units) */
  requestedAmount: z.number().int().positive(),
  /** Currency code (ISO 4217) */
  currency: z.string().length(3).default('RON'),
  /** Preferred plan type */
  preferredPlanType: FinancingPlanTypeSchema.optional(),
  /** Preferred term in months */
  preferredTerm: FinancingTermSchema.optional(),
  /** Treatment description */
  treatmentDescription: z.string().max(500).optional(),
  /** Treatment category */
  treatmentCategory: z
    .enum(['implants', 'all_on_x', 'orthodontics', 'cosmetic', 'general', 'other'])
    .optional(),
  /** Metadata for tracking */
  metadata: z.record(z.string()).optional(),
  /** Correlation ID for tracing */
  correlationId: z.string(),
});

export type CreateFinancingApplication = z.infer<typeof CreateFinancingApplicationSchema>;

// ============================================================================
// FINANCING OFFER
// ============================================================================

/**
 * Financing offer details from lender
 */
export const FinancingOfferSchema = z.object({
  /** Offer ID from provider */
  offerId: z.string(),
  /** Provider that made the offer */
  provider: FinancingProviderSchema,
  /** Plan type offered */
  planType: FinancingPlanTypeSchema,
  /** Approved amount (minor currency units) */
  approvedAmount: z.number().int().positive(),
  /** Currency */
  currency: z.string().length(3),
  /** Annual percentage rate (APR) */
  apr: z.number().min(0).max(100),
  /** Term in months */
  termMonths: z.number().int().positive(),
  /** Monthly payment amount (minor currency units) */
  monthlyPayment: z.number().int().positive(),
  /** Total repayment amount (minor currency units) */
  totalRepayment: z.number().int().positive(),
  /** Finance charge/interest (minor currency units) */
  financeCharge: z.number().int().min(0),
  /** Down payment required (minor currency units) */
  downPayment: z.number().int().min(0).default(0),
  /** Promotional period (months, if applicable) */
  promotionalPeriod: z.number().int().min(0).optional(),
  /** Promotional APR (if different during promo period) */
  promotionalApr: z.number().min(0).max(100).optional(),
  /** Offer valid until */
  validUntil: z.coerce.date(),
  /** Whether this offer requires acceptance */
  requiresAcceptance: z.boolean().default(true),
  /** Terms and conditions URL */
  termsUrl: z.string().url().optional(),
});

export type FinancingOffer = z.infer<typeof FinancingOfferSchema>;

// ============================================================================
// FINANCING APPLICATION RESPONSE
// ============================================================================

/**
 * Complete financing application record
 */
export const FinancingApplicationSchema = z.object({
  /** Application ID */
  id: z.string().uuid(),
  /** External application ID from provider */
  externalId: z.string(),
  /** Financing provider */
  provider: FinancingProviderSchema,
  /** Case ID */
  caseId: z.string().uuid(),
  /** Clinic ID */
  clinicId: z.string().uuid(),
  /** Lead/Patient ID */
  leadId: z.string().uuid(),
  /** Application status */
  status: FinancingApplicationStatusSchema,
  /** Decision code if decided */
  decisionCode: FinancingDecisionCodeSchema.nullable(),
  /** Decision message/reason */
  decisionMessage: z.string().nullable(),
  /** Requested amount (minor currency units) */
  requestedAmount: z.number().int().positive(),
  /** Currency */
  currency: z.string().length(3),
  /** Approved offers (may have multiple) */
  offers: z.array(FinancingOfferSchema).default([]),
  /** Selected/accepted offer ID */
  acceptedOfferId: z.string().nullable(),
  /** Applicant snapshot */
  applicant: FinancingApplicantSchema,
  /** Treatment details */
  treatmentDescription: z.string().nullable(),
  treatmentCategory: z.string().nullable(),
  /** Timestamps */
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  submittedAt: z.coerce.date().nullable(),
  decidedAt: z.coerce.date().nullable(),
  acceptedAt: z.coerce.date().nullable(),
  fundedAt: z.coerce.date().nullable(),
  expiresAt: z.coerce.date().nullable(),
  /** Metadata */
  metadata: z.record(z.string()).optional(),
});

export type FinancingApplication = z.infer<typeof FinancingApplicationSchema>;

// ============================================================================
// FINANCING ACCEPTANCE
// ============================================================================

/**
 * Accept financing offer request
 */
export const AcceptFinancingOfferSchema = z.object({
  /** Application ID */
  applicationId: z.string().uuid(),
  /** Offer ID to accept */
  offerId: z.string(),
  /** E-signature consent */
  signatureConsent: z.boolean(),
  /** IP address of acceptance */
  ipAddress: z.string().ip().optional(),
  /** Correlation ID */
  correlationId: z.string(),
});

export type AcceptFinancingOffer = z.infer<typeof AcceptFinancingOfferSchema>;

/**
 * Acceptance result
 */
export const FinancingAcceptanceResultSchema = z.object({
  /** Whether acceptance was successful */
  success: z.boolean(),
  /** Updated application */
  application: FinancingApplicationSchema,
  /** Contract/agreement URL if available */
  contractUrl: z.string().url().nullable(),
  /** Expected funding date */
  expectedFundingDate: z.coerce.date().nullable(),
  /** Error message if failed */
  error: z.string().nullable(),
});

export type FinancingAcceptanceResult = z.infer<typeof FinancingAcceptanceResultSchema>;

// ============================================================================
// FINANCING ELIGIBILITY CHECK
// ============================================================================

/**
 * Pre-qualification/eligibility check request (soft pull)
 */
export const FinancingEligibilityCheckSchema = z.object({
  /** Lead/Patient ID */
  leadId: z.string().uuid(),
  /** Clinic ID */
  clinicId: z.string().uuid(),
  /** Requested amount range (minor currency units) */
  requestedAmountMin: z.number().int().positive(),
  requestedAmountMax: z.number().int().positive(),
  /** Currency */
  currency: z.string().length(3).default('RON'),
  /** Applicant basic info */
  applicant: FinancingApplicantSchema.pick({
    firstName: true,
    lastName: true,
    email: true,
    phone: true,
    dateOfBirth: true,
    postalCode: true,
    country: true,
  }),
  /** Correlation ID */
  correlationId: z.string(),
});

export type FinancingEligibilityCheck = z.infer<typeof FinancingEligibilityCheckSchema>;

/**
 * Eligibility check result
 */
export const FinancingEligibilityResultSchema = z.object({
  /** Whether patient is likely eligible */
  eligible: z.boolean(),
  /** Pre-qualified amount range (minor currency units) */
  preQualifiedAmountMin: z.number().int().min(0).nullable(),
  preQualifiedAmountMax: z.number().int().min(0).nullable(),
  /** Estimated APR range */
  estimatedAprMin: z.number().min(0).nullable(),
  estimatedAprMax: z.number().min(0).nullable(),
  /** Available term options */
  availableTerms: z.array(FinancingTermSchema).default([]),
  /** Available plan types */
  availablePlanTypes: z.array(FinancingPlanTypeSchema).default([]),
  /** Reason if not eligible */
  ineligibleReason: z.string().nullable(),
  /** Soft pull ID for tracking */
  checkId: z.string(),
  /** Valid until */
  validUntil: z.coerce.date(),
});

export type FinancingEligibilityResult = z.infer<typeof FinancingEligibilityResultSchema>;

// ============================================================================
// FINANCING WEBHOOK EVENTS
// ============================================================================

/**
 * Base financing event
 */
const FinancingEventBaseSchema = z.object({
  /** Event ID */
  id: z.string(),
  /** Event timestamp */
  timestamp: z.coerce.date(),
  /** Application ID */
  applicationId: z.string().uuid(),
  /** External application ID */
  externalApplicationId: z.string(),
  /** Provider */
  provider: FinancingProviderSchema,
  /** Clinic ID */
  clinicId: z.string().uuid(),
  /** Correlation ID */
  correlationId: z.string(),
});

/**
 * Application submitted event
 */
export const FinancingApplicationSubmittedEventSchema = FinancingEventBaseSchema.extend({
  type: z.literal('financing.application.submitted'),
  leadId: z.string().uuid(),
  requestedAmount: z.number().int().positive(),
  currency: z.string().length(3),
});

export type FinancingApplicationSubmittedEvent = z.infer<
  typeof FinancingApplicationSubmittedEventSchema
>;

/**
 * Application approved event
 */
export const FinancingApplicationApprovedEventSchema = FinancingEventBaseSchema.extend({
  type: z.literal('financing.application.approved'),
  leadId: z.string().uuid(),
  decisionCode: FinancingDecisionCodeSchema,
  offers: z.array(FinancingOfferSchema),
  expiresAt: z.coerce.date(),
});

export type FinancingApplicationApprovedEvent = z.infer<
  typeof FinancingApplicationApprovedEventSchema
>;

/**
 * Application declined event
 */
export const FinancingApplicationDeclinedEventSchema = FinancingEventBaseSchema.extend({
  type: z.literal('financing.application.declined'),
  leadId: z.string().uuid(),
  decisionCode: FinancingDecisionCodeSchema,
  decisionMessage: z.string().nullable(),
});

export type FinancingApplicationDeclinedEvent = z.infer<
  typeof FinancingApplicationDeclinedEventSchema
>;

/**
 * Offer accepted event
 */
export const FinancingOfferAcceptedEventSchema = FinancingEventBaseSchema.extend({
  type: z.literal('financing.offer.accepted'),
  leadId: z.string().uuid(),
  offerId: z.string(),
  approvedAmount: z.number().int().positive(),
  termMonths: z.number().int().positive(),
  apr: z.number().min(0),
  monthlyPayment: z.number().int().positive(),
});

export type FinancingOfferAcceptedEvent = z.infer<typeof FinancingOfferAcceptedEventSchema>;

/**
 * Funds disbursed event
 */
export const FinancingFundsDisbursedEventSchema = FinancingEventBaseSchema.extend({
  type: z.literal('financing.funds.disbursed'),
  leadId: z.string().uuid(),
  caseId: z.string().uuid(),
  fundedAmount: z.number().int().positive(),
  currency: z.string().length(3),
  disbursementId: z.string(),
  fundedAt: z.coerce.date(),
});

export type FinancingFundsDisbursedEvent = z.infer<typeof FinancingFundsDisbursedEventSchema>;

/**
 * Application expired event
 */
export const FinancingApplicationExpiredEventSchema = FinancingEventBaseSchema.extend({
  type: z.literal('financing.application.expired'),
  leadId: z.string().uuid(),
  expiredAt: z.coerce.date(),
});

export type FinancingApplicationExpiredEvent = z.infer<
  typeof FinancingApplicationExpiredEventSchema
>;

/**
 * Union of all financing events
 */
export const FinancingEventSchema = z.discriminatedUnion('type', [
  FinancingApplicationSubmittedEventSchema,
  FinancingApplicationApprovedEventSchema,
  FinancingApplicationDeclinedEventSchema,
  FinancingOfferAcceptedEventSchema,
  FinancingFundsDisbursedEventSchema,
  FinancingApplicationExpiredEventSchema,
]);

export type FinancingEvent = z.infer<typeof FinancingEventSchema>;

// ============================================================================
// FINANCING SUMMARY FOR DASHBOARD
// ============================================================================

/**
 * Financing summary for patient/case dashboard
 */
export const FinancingSummarySchema = z.object({
  /** Total applications */
  totalApplications: z.number().int().min(0),
  /** Pending applications */
  pendingApplications: z.number().int().min(0),
  /** Approved applications */
  approvedApplications: z.number().int().min(0),
  /** Funded applications */
  fundedApplications: z.number().int().min(0),
  /** Total funded amount (minor currency units) */
  totalFundedAmount: z.number().int().min(0),
  /** Currency */
  currency: z.string().length(3),
  /** Average APR of funded applications */
  averageApr: z.number().min(0).nullable(),
  /** Average term of funded applications */
  averageTermMonths: z.number().min(0).nullable(),
  /** Approval rate percentage */
  approvalRate: z.number().min(0).max(100).nullable(),
});

export type FinancingSummary = z.infer<typeof FinancingSummarySchema>;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert amount from minor units to major units (e.g., bani to RON)
 */
export function toMajorCurrencyUnits(amountMinor: number): number {
  return Math.round(amountMinor) / 100;
}

/**
 * Convert amount from major units to minor units (e.g., RON to bani)
 */
export function toMinorCurrencyUnits(amountMajor: number): number {
  return Math.round(amountMajor * 100);
}

/**
 * Format financing amount for display
 */
export function formatFinancingAmount(
  amountMinor: number,
  currency: string,
  locale = 'ro-RO'
): string {
  const majorUnits = toMajorCurrencyUnits(amountMinor);
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(majorUnits);
}

/**
 * Calculate monthly payment for a loan
 * Uses standard amortization formula: P = (r * PV) / (1 - (1 + r)^-n)
 */
export function calculateMonthlyPayment(
  principalMinor: number,
  annualRate: number,
  termMonths: number
): number {
  if (annualRate === 0) {
    return Math.round(principalMinor / termMonths);
  }

  const monthlyRate = annualRate / 100 / 12;
  const payment = (monthlyRate * principalMinor) / (1 - Math.pow(1 + monthlyRate, -termMonths));

  return Math.round(payment);
}

/**
 * Calculate total repayment amount
 */
export function calculateTotalRepayment(
  monthlyPayment: number,
  termMonths: number,
  downPayment = 0
): number {
  return monthlyPayment * termMonths + downPayment;
}

/**
 * Calculate finance charge (total interest)
 */
export function calculateFinanceCharge(
  principalMinor: number,
  totalRepayment: number,
  downPayment = 0
): number {
  return Math.max(0, totalRepayment - principalMinor - downPayment);
}

/**
 * Check if an application is actionable (can be updated by user)
 */
export function isApplicationActionable(status: FinancingApplicationStatus): boolean {
  return ['draft', 'approved'].includes(status);
}

/**
 * Check if an application has expired
 */
export function isApplicationExpired(
  status: FinancingApplicationStatus,
  expiresAt: Date | null
): boolean {
  if (status === 'expired') return true;
  if (!expiresAt) return false;
  return new Date() > expiresAt;
}

/**
 * Status labels by locale
 */
const STATUS_LABELS_EN: Record<FinancingApplicationStatus, string> = {
  draft: 'Draft',
  pending: 'Under Review',
  approved: 'Approved',
  declined: 'Declined',
  expired: 'Expired',
  cancelled: 'Cancelled',
  accepted: 'Accepted',
  funded: 'Funded',
};

const STATUS_LABELS_RO: Record<FinancingApplicationStatus, string> = {
  draft: 'Ciornă',
  pending: 'În analiză',
  approved: 'Aprobat',
  declined: 'Respins',
  expired: 'Expirat',
  cancelled: 'Anulat',
  accepted: 'Acceptat',
  funded: 'Finanțat',
};

const STATUS_LABELS: Record<string, Record<FinancingApplicationStatus, string>> = {
  en: STATUS_LABELS_EN,
  ro: STATUS_LABELS_RO,
};

/**
 * Get status display label
 */
export function getFinancingStatusLabel(status: FinancingApplicationStatus, locale = 'en'): string {
  const localeLabels = STATUS_LABELS[locale];
  if (localeLabels) {
    return localeLabels[status];
  }
  // Fallback to English - always defined
  return STATUS_LABELS_EN[status];
}
