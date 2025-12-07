import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import crypto from 'crypto';
import {
  createInsuranceClient,
  createMockInsuranceClient,
  getInsuranceCredentials,
  type InsuranceClient,
  type MockInsuranceClient,
  type InsuranceVerificationResponse,
} from '@medicalcor/integrations';
import {
  performPreVerificationChecks,
  processVerificationResult,
  DEFAULT_VERIFICATION_CONFIG,
} from '@medicalcor/domain';

// Local type definitions to avoid cross-package type resolution issues at lint time
type PreVerificationErrorCode =
  | 'NO_CONSENT'
  | 'INSURANCE_NOT_FOUND'
  | 'ALREADY_VERIFIED_RECENTLY'
  | 'MISSING_PATIENT_INFO'
  | 'POLICY_EXPIRED';

interface LocalPreVerificationCheck {
  readonly canProceed: boolean;
  readonly reason?: string;
  readonly errorCode?: PreVerificationErrorCode;
  readonly warnings: readonly string[];
}

type InsuranceStatus = 'verified' | 'expired' | 'pending' | 'none';

interface LocalCoverageDetails {
  readonly deductible?: number;
  readonly remainingDeductible?: number;
  readonly annualMaximum?: number;
  readonly remainingMaximum?: number;
  readonly copayPercentage?: number;
  readonly coveredProcedures?: readonly string[];
  readonly preAuthRequired?: boolean;
  readonly coverageType?: 'full' | 'partial' | 'dental_only';
  readonly effectiveFrom?: Date;
  readonly effectiveUntil?: Date;
}

interface LocalVerificationOutcome {
  readonly success: boolean;
  readonly newStatus: InsuranceStatus;
  readonly coverageDetails?: LocalCoverageDetails;
  readonly notes: readonly string[];
  readonly requiresManualReview: boolean;
  readonly manualReviewReason?: string;
  readonly reVerificationDays?: number;
}
import { createEventStore, createInMemoryEventStore } from '@medicalcor/core';

/**
 * Insurance Verification Workflow
 *
 * Handles async insurance eligibility verification through external APIs.
 * Updates patient insurance status based on verification results.
 */

// ============================================================================
// PAYLOAD SCHEMA
// ============================================================================

export const InsuranceVerificationPayloadSchema = z.object({
  patientId: z.string(),
  insuranceId: z.string(),
  providerId: z.string(),
  providerName: z.string(),
  policyNumber: z.string(),
  groupNumber: z.string().optional(),
  patientFirstName: z.string(),
  patientLastName: z.string(),
  patientDateOfBirth: z.string().optional(),
  hasVerificationConsent: z.boolean().default(true),
  hubspotContactId: z.string().optional(),
  correlationId: z.string(),
  source: z
    .enum(['manual', 'scheduled', 'appointment_booking', 'patient_update'])
    .default('manual'),
});

export type InsuranceVerificationPayload = z.infer<typeof InsuranceVerificationPayloadSchema>;

// ============================================================================
// WORKFLOW RESULT TYPES
// ============================================================================

interface VerificationSuccessResult {
  success: true;
  status: 'verified' | 'expired' | 'pending' | 'none';
  verificationStatus: InsuranceVerificationResponse['status'];
  coverageDetails?: {
    deductible?: number;
    remainingDeductible?: number;
    annualMaximum?: number;
    remainingMaximum?: number;
  };
  notes: readonly string[];
  requiresManualReview: boolean;
  manualReviewReason?: string;
  reVerificationDays?: number;
}

interface VerificationFailureResult {
  success: false;
  status: 'pre_check_failed' | 'api_error';
  reason: string;
  errorCode?: string;
}

type VerificationResult = VerificationSuccessResult | VerificationFailureResult;

// ============================================================================
// CLIENT INITIALIZATION
// ============================================================================

interface WorkflowClients {
  insurance: InsuranceClient | MockInsuranceClient;
  eventStore: ReturnType<typeof createEventStore>;
}

function getClients(): WorkflowClients {
  const credentials = getInsuranceCredentials();
  const databaseUrl = process.env.DATABASE_URL;

  const insurance =
    credentials.apiUrl && credentials.apiKey
      ? createInsuranceClient({
          apiUrl: credentials.apiUrl,
          apiKey: credentials.apiKey,
          timeoutMs: 30000,
          retryConfig: { maxRetries: 2, baseDelayMs: 1000 },
        })
      : createMockInsuranceClient();

  const eventStore = databaseUrl
    ? createEventStore({ source: 'insurance-verification', connectionString: databaseUrl })
    : createInMemoryEventStore('insurance-verification');

  return { insurance, eventStore };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function mapStatusToEventStatus(
  status: InsuranceVerificationResponse['status']
): 'active' | 'expired' | 'invalid' {
  switch (status) {
    case 'active':
      return 'active';
    case 'expired':
    case 'inactive':
      return 'expired';
    case 'invalid':
    case 'not_found':
    default:
      return 'invalid';
  }
}

async function emitEvent(
  eventStore: WorkflowClients['eventStore'],
  type: string,
  aggregateId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const correlationId = (payload.correlationId as string) || crypto.randomUUID();
  const aggregateType = type.split('.')[0];

  await eventStore.emit({
    type,
    correlationId,
    payload,
    aggregateId,
    aggregateType,
  });
}

// ============================================================================
// WORKFLOW TASK
// ============================================================================

export const verifyInsuranceWorkflow = task({
  id: 'verify-insurance-workflow',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 2000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: InsuranceVerificationPayload): Promise<VerificationResult> => {
    const { insurance, eventStore } = getClients();

    logger.info('Starting insurance verification workflow', {
      patientId: payload.patientId,
      insuranceId: payload.insuranceId,
      providerId: payload.providerId,
      correlationId: payload.correlationId,
      source: payload.source,
    });

    // Step 1: Pre-verification checks
    const preCheckResult = runPreVerificationChecks(payload);
    if (!preCheckResult.canProceed) {
      await emitEvent(eventStore, 'insurance.verification_failed', payload.patientId, {
        insuranceId: payload.insuranceId,
        reason: preCheckResult.reason,
        errorCode: preCheckResult.errorCode,
        correlationId: payload.correlationId,
      });

      return {
        success: false,
        status: 'pre_check_failed',
        reason: preCheckResult.reason ?? 'Pre-check failed',
        errorCode: preCheckResult.errorCode,
      };
    }

    // Step 2: Call external verification API
    const apiResult = await callVerificationApi(insurance, payload);
    if (!apiResult.success) {
      await emitEvent(eventStore, 'insurance.verification_failed', payload.patientId, {
        insuranceId: payload.insuranceId,
        reason: apiResult.error.message,
        errorCode: apiResult.error.code,
        retryable: apiResult.error.retryable,
        correlationId: payload.correlationId,
      });

      if (apiResult.error.retryable) {
        throw new Error(`Retryable error: ${apiResult.error.message}`);
      }

      return {
        success: false,
        status: 'api_error',
        reason: apiResult.error.message,
        errorCode: apiResult.error.code,
      };
    }

    // Step 3: Process verification result
    const outcome = processApiResult(payload, apiResult.data);

    logger.info('Insurance verification completed', {
      status: outcome.newStatus,
      success: outcome.success,
      requiresManualReview: outcome.requiresManualReview,
      correlationId: payload.correlationId,
    });

    // Step 4: Emit domain event
    await emitEvent(eventStore, 'insurance.verified', payload.patientId, {
      insuranceId: payload.insuranceId,
      verificationStatus: mapStatusToEventStatus(apiResult.data.status),
      newInsuranceStatus: outcome.newStatus,
      coverageDetails: outcome.coverageDetails,
      notes: outcome.notes,
      requiresManualReview: outcome.requiresManualReview,
      manualReviewReason: outcome.manualReviewReason,
      externalReferenceId: apiResult.data.externalReferenceId,
      source: payload.source,
      correlationId: payload.correlationId,
    });

    // Step 5: Notify if manual review required
    if (outcome.requiresManualReview) {
      await emitEvent(eventStore, 'insurance.manual_review_required', payload.patientId, {
        insuranceId: payload.insuranceId,
        reason: outcome.manualReviewReason,
        notes: outcome.notes,
        correlationId: payload.correlationId,
      });
    }

    return {
      success: outcome.success,
      status: outcome.newStatus,
      verificationStatus: apiResult.data.status,
      coverageDetails: outcome.coverageDetails,
      notes: outcome.notes,
      requiresManualReview: outcome.requiresManualReview,
      manualReviewReason: outcome.manualReviewReason,
      reVerificationDays: outcome.reVerificationDays,
    };
  },
});

// ============================================================================
// STEP FUNCTIONS
// ============================================================================

interface PreCheckResult {
  canProceed: boolean;
  reason?: string;
  errorCode?: string;
}

function runPreVerificationChecks(payload: InsuranceVerificationPayload): PreCheckResult {
  const input = {
    insuranceInfo: {
      id: payload.insuranceId,
      providerId: payload.providerId,
      providerName: payload.providerName,
      policyNumber: payload.policyNumber,
      groupNumber: payload.groupNumber,
      coverageType: 'full' as const,
      effectiveFrom: new Date(),
      status: 'pending' as const,
    },
    patientFirstName: payload.patientFirstName,
    patientLastName: payload.patientLastName,
    patientDateOfBirth: payload.patientDateOfBirth
      ? new Date(payload.patientDateOfBirth)
      : undefined,
    hasVerificationConsent: payload.hasVerificationConsent,
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- domain package type resolution issue
  const result = performPreVerificationChecks(input) as LocalPreVerificationCheck;

  if (result.warnings.length > 0) {
    logger.info('Pre-verification warnings', {
      warnings: [...result.warnings],
      correlationId: payload.correlationId,
    });
  }

  return {
    canProceed: result.canProceed,
    reason: result.reason,
    errorCode: result.errorCode,
  };
}

interface ApiCallSuccess {
  success: true;
  data: InsuranceVerificationResponse;
}

interface ApiCallError {
  success: false;
  error: { code: string; message: string; retryable: boolean };
}

async function callVerificationApi(
  insurance: InsuranceClient | MockInsuranceClient,
  payload: InsuranceVerificationPayload
): Promise<ApiCallSuccess | ApiCallError> {
  logger.info('Calling insurance verification API', {
    providerId: payload.providerId,
    correlationId: payload.correlationId,
  });

  const apiResult = await insurance.verifyEligibility(
    {
      providerId: payload.providerId,
      providerName: payload.providerName,
      policyNumber: payload.policyNumber,
      groupNumber: payload.groupNumber,
      subscriberFirstName: payload.patientFirstName,
      subscriberLastName: payload.patientLastName,
      subscriberDateOfBirth: payload.patientDateOfBirth,
      patientRelationship: 'self',
      serviceType: 'dental',
    },
    payload.correlationId
  );

  if (apiResult._tag === 'Err') {
    logger.error('Insurance verification API error', {
      errorCode: apiResult.error.code,
      message: apiResult.error.message,
      correlationId: payload.correlationId,
    });

    return {
      success: false,
      error: {
        code: apiResult.error.code,
        message: apiResult.error.message,
        retryable: apiResult.error.retryable,
      },
    };
  }

  return { success: true, data: apiResult.value };
}

interface ProcessedOutcome {
  success: boolean;
  newStatus: 'verified' | 'expired' | 'pending' | 'none';
  coverageDetails?: {
    deductible?: number;
    remainingDeductible?: number;
    annualMaximum?: number;
    remainingMaximum?: number;
  };
  notes: readonly string[];
  requiresManualReview: boolean;
  manualReviewReason?: string;
  reVerificationDays?: number;
}

function processApiResult(
  payload: InsuranceVerificationPayload,
  response: InsuranceVerificationResponse
): ProcessedOutcome {
  const input = {
    insuranceInfo: {
      id: payload.insuranceId,
      providerId: payload.providerId,
      providerName: payload.providerName,
      policyNumber: payload.policyNumber,
      groupNumber: payload.groupNumber,
      coverageType: 'full' as const,
      effectiveFrom: new Date(),
      status: 'pending' as const,
    },
    patientFirstName: payload.patientFirstName,
    patientLastName: payload.patientLastName,
    patientDateOfBirth: payload.patientDateOfBirth
      ? new Date(payload.patientDateOfBirth)
      : undefined,
    hasVerificationConsent: payload.hasVerificationConsent,
  };

  const externalResult = {
    status: response.status,
    verifiedAt: new Date(response.verifiedAt),
    nameMatch: response.nameMatch,
    dobMatch: response.dobMatch,
    externalReferenceId: response.externalReferenceId,
    coverageDetails:
      response.status === 'active'
        ? {
            deductible: response.deductible,
            remainingDeductible: response.remainingDeductible,
            annualMaximum: response.annualMaximum,
            remainingMaximum: response.remainingMaximum,
            copayPercentage: response.copayPercentage,
            coveredProcedures: response.coveredProcedures,
            preAuthRequired: response.preAuthRequired,
            coverageType: response.coverageType,
            effectiveFrom: response.effectiveFrom ? new Date(response.effectiveFrom) : undefined,
            effectiveUntil: response.effectiveUntil ? new Date(response.effectiveUntil) : undefined,
          }
        : undefined,
  };

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call -- domain package type resolution issue
  const outcome = processVerificationResult(
    input,
    externalResult,
    DEFAULT_VERIFICATION_CONFIG
  ) as LocalVerificationOutcome;

  return {
    success: outcome.success,
    newStatus: outcome.newStatus,
    coverageDetails: outcome.coverageDetails
      ? {
          deductible: outcome.coverageDetails.deductible,
          remainingDeductible: outcome.coverageDetails.remainingDeductible,
          annualMaximum: outcome.coverageDetails.annualMaximum,
          remainingMaximum: outcome.coverageDetails.remainingMaximum,
        }
      : undefined,
    notes: outcome.notes,
    requiresManualReview: outcome.requiresManualReview,
    manualReviewReason: outcome.manualReviewReason,
    reVerificationDays: outcome.reVerificationDays,
  };
}

// ============================================================================
// BATCH VERIFICATION TASK
// ============================================================================

export const BatchVerificationPayloadSchema = z.object({
  patients: z.array(
    z.object({
      patientId: z.string(),
      insuranceId: z.string(),
      providerId: z.string(),
      providerName: z.string(),
      policyNumber: z.string(),
      groupNumber: z.string().optional(),
      patientFirstName: z.string(),
      patientLastName: z.string(),
      patientDateOfBirth: z.string().optional(),
    })
  ),
  batchCorrelationId: z.string(),
});

export const batchVerifyInsuranceWorkflow = task({
  id: 'batch-verify-insurance-workflow',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof BatchVerificationPayloadSchema>) => {
    const { patients, batchCorrelationId } = payload;

    logger.info('Starting batch insurance verification', {
      patientCount: patients.length,
      batchCorrelationId,
    });

    const results: {
      patientId: string;
      success: boolean;
      status: string;
      error?: string;
    }[] = [];

    for (const patient of patients) {
      const correlationId = `${batchCorrelationId}-${patient.patientId}`;

      try {
        const result = (await verifyInsuranceWorkflow.triggerAndWait({
          ...patient,
          hasVerificationConsent: true,
          correlationId,
          source: 'scheduled',
        })) as VerificationResult;

        results.push({
          patientId: patient.patientId,
          success: result.success,
          status: result.status,
        });
      } catch (error) {
        logger.error('Batch verification failed for patient', {
          patientId: patient.patientId,
          error: error instanceof Error ? error.message : 'Unknown error',
          batchCorrelationId,
        });

        results.push({
          patientId: patient.patientId,
          success: false,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;

    logger.info('Batch insurance verification completed', {
      total: patients.length,
      success: successCount,
      failures: failureCount,
      batchCorrelationId,
    });

    return {
      total: patients.length,
      success: successCount,
      failures: failureCount,
      results,
    };
  },
});
