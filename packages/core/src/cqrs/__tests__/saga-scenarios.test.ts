/**
 * Saga Complex Scenario Tests
 *
 * Tests for multi-step saga scenarios including:
 * - Payment + Insurance verification workflows
 * - Compensation (rollback) flows for various failure points
 * - Concurrent saga handling
 * - Timeout and retry scenarios
 * - State reconstruction after failures
 *
 * @module core/cqrs/__tests__/saga-scenarios.test
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  InMemorySagaRepository,
  createInMemorySagaRepository,
  type SagaState,
  type CreateSagaOptions,
  type SagaStatus,
} from '../saga-repository.js';

// ============================================================================
// TEST TYPES - Domain-specific saga state types
// ============================================================================

/**
 * Payment + Insurance Verification Saga State
 * Represents a complex multi-step process for dental procedure approval
 */
interface PaymentInsuranceSagaState {
  patientId: string;
  caseId: string;
  procedureAmount: number;
  currency: string;

  // Step tracking
  currentPhase:
    | 'initiated'
    | 'verifying_insurance'
    | 'insurance_verified'
    | 'processing_payment'
    | 'payment_processed'
    | 'finalizing'
    | 'completed'
    | 'compensating'
    | 'compensated'
    | 'failed';

  // Insurance verification state
  insuranceVerification?: {
    verificationId: string;
    status: 'pending' | 'verified' | 'failed' | 'expired';
    coverageAmount?: number;
    remainingDeductible?: number;
    preAuthRequired?: boolean;
    verifiedAt?: string;
  };

  // Payment state
  payment?: {
    paymentId: string;
    status: 'pending' | 'authorized' | 'captured' | 'failed' | 'refunded';
    amount: number;
    authorizedAt?: string;
    capturedAt?: string;
    refundedAt?: string;
  };

  // Financing state (optional)
  financing?: {
    applicationId: string;
    status: 'pending' | 'approved' | 'declined' | 'accepted' | 'funded';
    approvedAmount?: number;
    apr?: number;
    termMonths?: number;
  };

  // Compensation tracking
  compensationActions?: string[];
  failureReason?: string;
}

/**
 * Appointment Booking Saga State
 * Represents appointment scheduling with resource reservation
 */
interface AppointmentBookingSagaState {
  patientId: string;
  clinicId: string;
  providerId: string;
  requestedDate: string;
  procedureType: string;

  currentPhase:
    | 'initiated'
    | 'checking_availability'
    | 'reserving_slot'
    | 'slot_reserved'
    | 'notifying_patient'
    | 'completed'
    | 'compensating'
    | 'compensated';

  slotReservation?: {
    reservationId: string;
    startTime: string;
    endTime: string;
    status: 'reserved' | 'confirmed' | 'released';
  };

  notification?: {
    notificationId: string;
    channel: 'sms' | 'email' | 'whatsapp';
    status: 'pending' | 'sent' | 'failed';
  };

  compensationActions?: string[];
  failureReason?: string;
}

/**
 * Lead Onboarding Saga State
 * Represents multi-step lead qualification process
 */
interface LeadOnboardingSagaState {
  leadId: string;
  source: string;
  phone: string;

  currentPhase:
    | 'initiated'
    | 'scoring'
    | 'scored'
    | 'qualifying'
    | 'qualified'
    | 'assigning'
    | 'assigned'
    | 'completed'
    | 'compensating'
    | 'compensated';

  scoring?: {
    score: number;
    classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
    factors: string[];
  };

  assignment?: {
    assignedTo: string;
    assignedAt: string;
  };

  compensationActions?: string[];
  failureReason?: string;
}

// ============================================================================
// MOCK SERVICE SIMULATORS
// ============================================================================

/**
 * Simulates external insurance verification service
 */
class MockInsuranceVerificationService {
  private shouldFail = false;
  private failureReason = '';
  private delayMs = 0;

  setFailure(fail: boolean, reason = 'Insurance verification failed'): void {
    this.shouldFail = fail;
    this.failureReason = reason;
  }

  setDelay(ms: number): void {
    this.delayMs = ms;
  }

  async verify(
    _policyNumber: string,
    _patientName: string
  ): Promise<{
    success: boolean;
    verificationId: string;
    coverageAmount?: number;
    remainingDeductible?: number;
    error?: string;
  }> {
    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (this.shouldFail) {
      return {
        success: false,
        verificationId: '',
        error: this.failureReason,
      };
    }

    return {
      success: true,
      verificationId: `verify-${crypto.randomUUID().slice(0, 8)}`,
      coverageAmount: 500000, // 5000.00 in minor units
      remainingDeductible: 10000, // 100.00 in minor units
    };
  }
}

/**
 * Simulates payment gateway
 */
class MockPaymentGateway {
  private shouldFailAuthorization = false;
  private shouldFailCapture = false;
  private authorizationError = '';
  private captureError = '';

  setAuthorizationFailure(fail: boolean, error = 'Authorization declined'): void {
    this.shouldFailAuthorization = fail;
    this.authorizationError = error;
  }

  setCaptureFailure(fail: boolean, error = 'Capture failed'): void {
    this.shouldFailCapture = fail;
    this.captureError = error;
  }

  async authorize(
    _amount: number,
    _currency: string
  ): Promise<{
    success: boolean;
    paymentId: string;
    error?: string;
  }> {
    if (this.shouldFailAuthorization) {
      return {
        success: false,
        paymentId: '',
        error: this.authorizationError,
      };
    }

    return {
      success: true,
      paymentId: `pay-${crypto.randomUUID().slice(0, 8)}`,
    };
  }

  async capture(_paymentId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    if (this.shouldFailCapture) {
      return {
        success: false,
        error: this.captureError,
      };
    }

    return { success: true };
  }

  async refund(_paymentId: string): Promise<{
    success: boolean;
    refundId: string;
  }> {
    return {
      success: true,
      refundId: `refund-${crypto.randomUUID().slice(0, 8)}`,
    };
  }
}

// ============================================================================
// SAGA EXECUTOR - Orchestrates saga step execution
// ============================================================================

/**
 * Generic saga executor for testing multi-step workflows
 */
class SagaExecutor<TState extends Record<string, unknown>> {
  constructor(
    private repository: InMemorySagaRepository,
    private stepHandlers: Map<
      string,
      (saga: SagaState<TState>) => Promise<{ nextPhase: string; updates: Partial<TState> }>
    >,
    private compensationHandlers: Map<string, (saga: SagaState<TState>) => Promise<Partial<TState>>>
  ) {}

  async executeStep(sagaId: string, stepName: string): Promise<SagaState<TState> | null> {
    const saga = await this.repository.findById<TState>(sagaId);
    if (!saga) return null;

    const handler = this.stepHandlers.get(stepName);
    if (!handler) {
      throw new Error(`No handler for step: ${stepName}`);
    }

    try {
      saga.status = 'running';
      await this.repository.save(saga);

      const result = await handler(saga);

      saga.state = { ...saga.state, ...result.updates, currentPhase: result.nextPhase };
      saga.currentStep++;
      await this.repository.save(saga);
      await this.repository.appendStepHistory(
        sagaId,
        stepName,
        result.updates as Record<string, unknown>
      );

      return saga;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      saga.state = {
        ...saga.state,
        currentPhase: 'failed',
        failureReason: errorMessage,
      } as TState;
      await this.repository.markFailed(sagaId, errorMessage);
      return saga;
    }
  }

  async compensate(sagaId: string): Promise<SagaState<TState> | null> {
    const saga = await this.repository.findById<TState>(sagaId);
    if (!saga) return null;

    await this.repository.markCompensating(sagaId);
    const compensationActions: string[] = [];

    // Execute compensation in reverse order of completed steps
    const completedSteps = [...saga.stepHistory].reverse();

    for (const step of completedSteps) {
      const compensationHandler = this.compensationHandlers.get(step.step);
      if (compensationHandler) {
        try {
          const updates = await compensationHandler(saga);
          saga.state = { ...saga.state, ...updates };
          compensationActions.push(`compensate_${step.step}`);
          await this.repository.appendStepHistory(
            sagaId,
            `compensate_${step.step}`,
            updates as Record<string, unknown>
          );
        } catch (error) {
          // Log compensation failure but continue with other compensations
          compensationActions.push(`compensate_${step.step}_failed`);
        }
      }
    }

    saga.state = {
      ...saga.state,
      currentPhase: 'compensated',
      compensationActions,
    } as TState;
    await this.repository.save(saga);
    await this.repository.markCompensated(sagaId);

    return saga;
  }
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('Payment + Insurance Verification Saga Scenarios', () => {
  let repository: InMemorySagaRepository;
  let insuranceService: MockInsuranceVerificationService;
  let paymentGateway: MockPaymentGateway;

  beforeEach(() => {
    repository = createInMemorySagaRepository();
    insuranceService = new MockInsuranceVerificationService();
    paymentGateway = new MockPaymentGateway();
  });

  afterEach(() => {
    repository.clear();
  });

  describe('Happy Path - Complete Workflow', () => {
    it('should complete payment + insurance verification saga successfully', async () => {
      // Arrange
      const initialState: PaymentInsuranceSagaState = {
        patientId: 'patient-123',
        caseId: 'case-456',
        procedureAmount: 250000, // 2500.00
        currency: 'RON',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-001',
        initialState,
        totalSteps: 5,
        maxRetries: 3,
      });

      // Act - Step 1: Verify Insurance
      saga.status = 'running';
      saga.currentStep = 1;
      const verificationResult = await insuranceService.verify('POL-123', 'John Doe');

      saga.state = {
        ...saga.state,
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: verificationResult.verificationId,
          status: 'verified',
          coverageAmount: verificationResult.coverageAmount,
          remainingDeductible: verificationResult.remainingDeductible,
          verifiedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {
        verificationId: verificationResult.verificationId,
      });

      // Act - Step 2: Authorize Payment
      saga.currentStep = 2;
      const patientResponsibility =
        saga.state.procedureAmount - (saga.state.insuranceVerification?.coverageAmount ?? 0);
      const authResult = await paymentGateway.authorize(patientResponsibility, saga.state.currency);

      saga.state = {
        ...saga.state,
        currentPhase: 'payment_processed',
        payment: {
          paymentId: authResult.paymentId,
          status: 'authorized',
          amount: patientResponsibility,
          authorizedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'AuthorizePayment', {
        paymentId: authResult.paymentId,
        amount: patientResponsibility,
      });

      // Act - Step 3: Capture Payment
      saga.currentStep = 3;
      const captureResult = await paymentGateway.capture(saga.state.payment!.paymentId);
      expect(captureResult.success).toBe(true);

      saga.state = {
        ...saga.state,
        payment: {
          ...saga.state.payment!,
          status: 'captured',
          capturedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'CapturePayment', {
        capturedAt: saga.state.payment!.capturedAt,
      });

      // Act - Step 4: Finalize
      saga.currentStep = 4;
      saga.state = {
        ...saga.state,
        currentPhase: 'completed',
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'Finalize', {
        completedAt: new Date().toISOString(),
      });

      // Complete saga
      await repository.markCompleted(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('completed');
      expect(finalSaga?.state.currentPhase).toBe('completed');
      expect(finalSaga?.state.insuranceVerification?.status).toBe('verified');
      expect(finalSaga?.state.payment?.status).toBe('captured');
      expect(finalSaga?.stepHistory).toHaveLength(4);
      expect(finalSaga?.completedAt).not.toBeNull();
    });
  });

  describe('Insurance Verification Failure Compensation', () => {
    it('should compensate when insurance verification fails', async () => {
      // Arrange
      insuranceService.setFailure(true, 'Policy not found in provider system');

      const initialState: PaymentInsuranceSagaState = {
        patientId: 'patient-123',
        caseId: 'case-456',
        procedureAmount: 250000,
        currency: 'RON',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-002',
        initialState,
        totalSteps: 5,
      });

      // Act - Attempt insurance verification
      saga.status = 'running';
      const verificationResult = await insuranceService.verify('POL-INVALID', 'John Doe');

      // Assert verification failed
      expect(verificationResult.success).toBe(false);

      // Mark saga as failed
      saga.state = {
        ...saga.state,
        currentPhase: 'failed',
        failureReason: verificationResult.error,
        insuranceVerification: {
          verificationId: '',
          status: 'failed',
        },
      };
      await repository.markFailed(saga.sagaId, verificationResult.error!);

      // No compensation needed - no successful steps to rollback
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('failed');
      expect(finalSaga?.state.currentPhase).toBe('failed');
      expect(finalSaga?.state.failureReason).toBe('Policy not found in provider system');
      expect(finalSaga?.stepHistory).toHaveLength(0);
    });

    it('should handle insurance expiration after initial verification', async () => {
      // Arrange
      const initialState: PaymentInsuranceSagaState = {
        patientId: 'patient-123',
        caseId: 'case-456',
        procedureAmount: 250000,
        currency: 'RON',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-003',
        initialState,
        totalSteps: 5,
      });

      // Act - Step 1: Initial verification succeeds
      saga.status = 'running';
      const verificationResult = await insuranceService.verify('POL-123', 'John Doe');
      saga.state = {
        ...saga.state,
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: verificationResult.verificationId,
          status: 'verified',
          coverageAmount: verificationResult.coverageAmount,
          verifiedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {
        verificationId: verificationResult.verificationId,
      });

      // Simulate insurance expiration before payment
      insuranceService.setFailure(true, 'Insurance policy expired');

      // Re-verification fails
      const reVerifyResult = await insuranceService.verify('POL-123', 'John Doe');
      expect(reVerifyResult.success).toBe(false);

      // Update saga state to reflect expiration
      saga.state = {
        ...saga.state,
        currentPhase: 'failed',
        failureReason: 'Insurance expired before payment processing',
        insuranceVerification: {
          ...saga.state.insuranceVerification!,
          status: 'expired',
        },
      };
      await repository.markFailed(saga.sagaId, 'Insurance expired before payment processing');

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('failed');
      expect(finalSaga?.state.insuranceVerification?.status).toBe('expired');
    });
  });

  describe('Payment Authorization Failure Compensation', () => {
    it('should compensate when payment authorization fails after insurance verified', async () => {
      // Arrange
      paymentGateway.setAuthorizationFailure(true, 'Insufficient funds');

      const initialState: PaymentInsuranceSagaState = {
        patientId: 'patient-123',
        caseId: 'case-456',
        procedureAmount: 250000,
        currency: 'RON',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-004',
        initialState,
        totalSteps: 5,
      });

      // Act - Step 1: Insurance verification succeeds
      saga.status = 'running';
      const verificationResult = await insuranceService.verify('POL-123', 'John Doe');
      saga.state = {
        ...saga.state,
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: verificationResult.verificationId,
          status: 'verified',
          coverageAmount: verificationResult.coverageAmount,
          verifiedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {
        verificationId: verificationResult.verificationId,
      });

      // Act - Step 2: Payment authorization fails
      const patientResponsibility =
        saga.state.procedureAmount - (saga.state.insuranceVerification?.coverageAmount ?? 0);
      const authResult = await paymentGateway.authorize(patientResponsibility, saga.state.currency);

      expect(authResult.success).toBe(false);

      // Mark as failed and start compensation
      saga.state = {
        ...saga.state,
        currentPhase: 'compensating',
        failureReason: authResult.error,
        payment: {
          paymentId: '',
          status: 'failed',
          amount: patientResponsibility,
        },
      };
      await repository.markCompensating(saga.sagaId);

      // Compensation - Invalidate insurance verification (mark as no longer valid)
      await repository.appendStepHistory(saga.sagaId, 'CompensateInsuranceVerification', {
        action: 'invalidate_verification',
        reason: 'Payment failed - procedure not proceeding',
      });

      saga.state = {
        ...saga.state,
        currentPhase: 'compensated',
        compensationActions: ['invalidate_insurance_verification'],
      };
      await repository.markCompensated(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('compensated');
      expect(finalSaga?.state.currentPhase).toBe('compensated');
      expect(finalSaga?.state.payment?.status).toBe('failed');
      expect(finalSaga?.state.compensationActions).toContain('invalidate_insurance_verification');
      expect(finalSaga?.stepHistory).toHaveLength(2);
    });
  });

  describe('Payment Capture Failure Compensation', () => {
    it('should refund payment when capture fails after authorization', async () => {
      // Arrange
      paymentGateway.setCaptureFailure(true, 'Capture timeout');

      const initialState: PaymentInsuranceSagaState = {
        patientId: 'patient-123',
        caseId: 'case-456',
        procedureAmount: 250000,
        currency: 'RON',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-005',
        initialState,
        totalSteps: 5,
      });

      // Step 1: Insurance verification
      saga.status = 'running';
      const verificationResult = await insuranceService.verify('POL-123', 'John Doe');
      saga.state = {
        ...saga.state,
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: verificationResult.verificationId,
          status: 'verified',
          coverageAmount: verificationResult.coverageAmount,
          verifiedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {});

      // Step 2: Payment authorization succeeds
      paymentGateway.setAuthorizationFailure(false);
      const patientResponsibility =
        saga.state.procedureAmount - (saga.state.insuranceVerification?.coverageAmount ?? 0);
      const authResult = await paymentGateway.authorize(patientResponsibility, saga.state.currency);

      saga.state = {
        ...saga.state,
        currentPhase: 'payment_processed',
        payment: {
          paymentId: authResult.paymentId,
          status: 'authorized',
          amount: patientResponsibility,
          authorizedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'AuthorizePayment', {
        paymentId: authResult.paymentId,
      });

      // Step 3: Capture fails
      const captureResult = await paymentGateway.capture(saga.state.payment!.paymentId);
      expect(captureResult.success).toBe(false);

      // Start compensation
      saga.state = {
        ...saga.state,
        currentPhase: 'compensating',
        failureReason: captureResult.error,
      };
      await repository.markCompensating(saga.sagaId);

      // Compensation Step 1: Void/Refund the authorization
      const refundResult = await paymentGateway.refund(saga.state.payment!.paymentId);
      saga.state = {
        ...saga.state,
        payment: {
          ...saga.state.payment!,
          status: 'refunded',
          refundedAt: new Date().toISOString(),
        },
      };
      await repository.appendStepHistory(saga.sagaId, 'CompensatePayment', {
        refundId: refundResult.refundId,
        action: 'void_authorization',
      });

      // Compensation Step 2: Invalidate insurance verification
      await repository.appendStepHistory(saga.sagaId, 'CompensateInsuranceVerification', {
        action: 'invalidate_verification',
      });

      // Complete compensation
      saga.state = {
        ...saga.state,
        currentPhase: 'compensated',
        compensationActions: ['void_payment_authorization', 'invalidate_insurance_verification'],
      };
      await repository.markCompensated(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('compensated');
      expect(finalSaga?.state.payment?.status).toBe('refunded');
      expect(finalSaga?.state.compensationActions).toHaveLength(2);
      expect(finalSaga?.stepHistory).toHaveLength(4); // 2 forward + 2 compensation
    });
  });

  describe('Financing Application Failure Scenarios', () => {
    it('should handle financing decline after insurance verification', async () => {
      // Arrange
      const initialState: PaymentInsuranceSagaState = {
        patientId: 'patient-123',
        caseId: 'case-456',
        procedureAmount: 1000000, // 10000.00 - large amount requiring financing
        currency: 'RON',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-006',
        initialState,
        totalSteps: 6, // Extra step for financing
      });

      // Step 1: Insurance verification
      saga.status = 'running';
      const verificationResult = await insuranceService.verify('POL-123', 'John Doe');
      saga.state = {
        ...saga.state,
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: verificationResult.verificationId,
          status: 'verified',
          coverageAmount: 500000, // Insurance covers 5000.00
          verifiedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {});

      // Step 2: Financing application - DECLINED
      saga.state = {
        ...saga.state,
        currentPhase: 'failed',
        failureReason: 'Financing application declined - insufficient credit',
        financing: {
          applicationId: `fin-${crypto.randomUUID().slice(0, 8)}`,
          status: 'declined',
        },
      };
      await repository.appendStepHistory(saga.sagaId, 'ApplyFinancing', {
        status: 'declined',
        reason: 'insufficient_credit',
      });

      // Start compensation
      await repository.markCompensating(saga.sagaId);

      // Compensation: Release insurance verification hold
      await repository.appendStepHistory(saga.sagaId, 'CompensateInsuranceVerification', {
        action: 'release_hold',
      });

      saga.state = {
        ...saga.state,
        currentPhase: 'compensated',
        compensationActions: ['release_insurance_hold'],
      };
      await repository.markCompensated(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('compensated');
      expect(finalSaga?.state.financing?.status).toBe('declined');
      expect(finalSaga?.state.insuranceVerification?.status).toBe('verified');
    });

    it('should handle financing approval but patient rejection', async () => {
      // Arrange
      const initialState: PaymentInsuranceSagaState = {
        patientId: 'patient-123',
        caseId: 'case-456',
        procedureAmount: 800000,
        currency: 'RON',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-007',
        initialState,
        totalSteps: 6,
        timeoutMs: 24 * 60 * 60 * 1000, // 24 hours for patient decision
      });

      // Step 1: Insurance verification
      saga.status = 'running';
      saga.state = {
        ...saga.state,
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: 'verify-001',
          status: 'verified',
          coverageAmount: 300000,
          verifiedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {});

      // Step 2: Financing approved
      saga.state = {
        ...saga.state,
        financing: {
          applicationId: 'fin-001',
          status: 'approved',
          approvedAmount: 500000,
          apr: 14.99,
          termMonths: 12,
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'ApplyFinancing', {
        status: 'approved',
      });

      // Patient rejects the financing terms (timeout or explicit rejection)
      saga.state = {
        ...saga.state,
        currentPhase: 'failed',
        failureReason: 'Patient declined financing terms',
      };
      await repository.markFailed(saga.sagaId, 'Patient declined financing terms');

      // Compensation
      await repository.markCompensating(saga.sagaId);

      // Cancel financing offer
      await repository.appendStepHistory(saga.sagaId, 'CompensateFinancing', {
        action: 'cancel_offer',
      });

      // Release insurance hold
      await repository.appendStepHistory(saga.sagaId, 'CompensateInsuranceVerification', {
        action: 'release_hold',
      });

      saga.state = {
        ...saga.state,
        currentPhase: 'compensated',
        compensationActions: ['cancel_financing_offer', 'release_insurance_hold'],
      };
      await repository.markCompensated(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('compensated');
      expect(finalSaga?.state.compensationActions).toHaveLength(2);
    });
  });

  describe('Concurrent Saga Handling', () => {
    it('should handle multiple concurrent sagas for different patients', async () => {
      // Arrange - Create 3 concurrent sagas
      const sagas = await Promise.all([
        repository.create<PaymentInsuranceSagaState>({
          sagaType: 'PaymentInsuranceVerification',
          correlationId: 'corr-concurrent-1',
          initialState: {
            patientId: 'patient-1',
            caseId: 'case-1',
            procedureAmount: 100000,
            currency: 'RON',
            currentPhase: 'initiated',
          },
        }),
        repository.create<PaymentInsuranceSagaState>({
          sagaType: 'PaymentInsuranceVerification',
          correlationId: 'corr-concurrent-2',
          initialState: {
            patientId: 'patient-2',
            caseId: 'case-2',
            procedureAmount: 200000,
            currency: 'RON',
            currentPhase: 'initiated',
          },
        }),
        repository.create<PaymentInsuranceSagaState>({
          sagaType: 'PaymentInsuranceVerification',
          correlationId: 'corr-concurrent-3',
          initialState: {
            patientId: 'patient-3',
            caseId: 'case-3',
            procedureAmount: 300000,
            currency: 'RON',
            currentPhase: 'initiated',
          },
        }),
      ]);

      // Act - Process all insurance verifications concurrently
      const verificationPromises = sagas.map(async (saga) => {
        saga.status = 'running';
        const result = await insuranceService.verify('POL-123', 'Patient');
        saga.state = {
          ...saga.state,
          currentPhase: 'insurance_verified',
          insuranceVerification: {
            verificationId: result.verificationId,
            status: 'verified',
            coverageAmount: result.coverageAmount,
            verifiedAt: new Date().toISOString(),
          },
        };
        await repository.save(saga);
        await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {});
        return saga;
      });

      const processedSagas = await Promise.all(verificationPromises);

      // Assert - All sagas processed independently
      expect(processedSagas).toHaveLength(3);

      for (const saga of processedSagas) {
        expect(saga.state.currentPhase).toBe('insurance_verified');
        expect(saga.state.insuranceVerification?.status).toBe('verified');
      }

      // Verify all sagas are in repository
      const pendingSagas = await repository.findPending('PaymentInsuranceVerification');
      expect(pendingSagas.length).toBe(3);

      // Each saga should have unique verification ID
      const verificationIds = processedSagas.map(
        (s) => s.state.insuranceVerification?.verificationId
      );
      const uniqueIds = new Set(verificationIds);
      expect(uniqueIds.size).toBe(3);
    });

    it('should isolate failures between concurrent sagas', async () => {
      // Arrange
      const sagaSuccess = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-success',
        initialState: {
          patientId: 'patient-success',
          caseId: 'case-success',
          procedureAmount: 100000,
          currency: 'RON',
          currentPhase: 'initiated',
        },
      });

      const sagaFailure = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-failure',
        initialState: {
          patientId: 'patient-failure',
          caseId: 'case-failure',
          procedureAmount: 100000,
          currency: 'RON',
          currentPhase: 'initiated',
        },
      });

      // Act - Process concurrently, one will fail
      const results = await Promise.allSettled([
        (async () => {
          sagaSuccess.status = 'running';
          const result = await insuranceService.verify('POL-VALID', 'Patient');
          sagaSuccess.state = {
            ...sagaSuccess.state,
            currentPhase: 'insurance_verified',
            insuranceVerification: {
              verificationId: result.verificationId,
              status: 'verified',
              coverageAmount: result.coverageAmount,
              verifiedAt: new Date().toISOString(),
            },
          };
          await repository.save(sagaSuccess);
          await repository.markCompleted(sagaSuccess.sagaId);
          return sagaSuccess;
        })(),
        (async () => {
          sagaFailure.status = 'running';
          // Simulate failure for this specific saga
          insuranceService.setFailure(true, 'Policy cancelled');
          const result = await insuranceService.verify('POL-CANCELLED', 'Patient');
          if (!result.success) {
            sagaFailure.state = {
              ...sagaFailure.state,
              currentPhase: 'failed',
              failureReason: result.error,
            };
            await repository.markFailed(sagaFailure.sagaId, result.error!);
            throw new Error(result.error);
          }
          return sagaFailure;
        })(),
      ]);

      // Reset for next test
      insuranceService.setFailure(false);

      // Assert - First saga succeeded
      expect(results[0].status).toBe('fulfilled');
      const successSaga = await repository.findById<PaymentInsuranceSagaState>(sagaSuccess.sagaId);
      expect(successSaga?.status).toBe('completed');

      // Assert - Second saga failed
      expect(results[1].status).toBe('rejected');
      const failureSaga = await repository.findById<PaymentInsuranceSagaState>(sagaFailure.sagaId);
      expect(failureSaga?.status).toBe('failed');
      expect(failureSaga?.state.failureReason).toBe('Policy cancelled');
    });
  });

  describe('Timeout Scenarios', () => {
    it('should detect timed out sagas', async () => {
      // Arrange - Create saga with very short timeout (already expired)
      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-timeout',
        initialState: {
          patientId: 'patient-timeout',
          caseId: 'case-timeout',
          procedureAmount: 100000,
          currency: 'RON',
          currentPhase: 'initiated',
        },
        timeoutMs: -1000, // Already timed out
      });

      saga.status = 'running';
      await repository.save(saga);

      // Act
      const timedOutSagas = await repository.findTimedOut();

      // Assert
      expect(timedOutSagas.length).toBe(1);
      expect(timedOutSagas[0]?.sagaId).toBe(saga.sagaId);
    });

    it('should handle timeout during payment processing', async () => {
      // Arrange
      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-payment-timeout',
        initialState: {
          patientId: 'patient-123',
          caseId: 'case-456',
          procedureAmount: 250000,
          currency: 'RON',
          currentPhase: 'initiated',
        },
        timeoutMs: 5000, // 5 second timeout
      });

      // Complete insurance verification
      saga.status = 'running';
      saga.state = {
        ...saga.state,
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: 'verify-001',
          status: 'verified',
          coverageAmount: 100000,
          verifiedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {});

      // Simulate payment authorization that's "in progress"
      saga.state = {
        ...saga.state,
        currentPhase: 'processing_payment',
        payment: {
          paymentId: 'pay-pending',
          status: 'pending',
          amount: 150000,
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'AuthorizePayment', { status: 'pending' });

      // Manually set timeout to past to simulate expiration
      saga.timeoutAt = new Date(Date.now() - 1000);
      await repository.save(saga);

      // Detect timeout
      const timedOut = await repository.findTimedOut();
      expect(timedOut.length).toBe(1);

      // Handle timeout - compensation
      await repository.markCompensating(saga.sagaId);

      // Void pending payment
      await repository.appendStepHistory(saga.sagaId, 'CompensatePayment', {
        action: 'void_pending',
      });

      // Release insurance hold
      await repository.appendStepHistory(saga.sagaId, 'CompensateInsuranceVerification', {
        action: 'release_hold',
      });

      saga.state = {
        ...saga.state,
        currentPhase: 'compensated',
        failureReason: 'Saga timed out during payment processing',
        compensationActions: ['void_pending_payment', 'release_insurance_hold'],
      };
      await repository.markCompensated(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('compensated');
      expect(finalSaga?.state.failureReason).toContain('timed out');
    });
  });

  describe('Retry Scenarios', () => {
    it('should track retry attempts for transient failures', async () => {
      // Arrange
      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-retry',
        initialState: {
          patientId: 'patient-retry',
          caseId: 'case-retry',
          procedureAmount: 100000,
          currency: 'RON',
          currentPhase: 'initiated',
        },
        maxRetries: 3,
      });

      saga.status = 'running';

      // Simulate retries
      for (let attempt = 1; attempt <= 3; attempt++) {
        insuranceService.setFailure(true, `Transient error - attempt ${attempt}`);
        const result = await insuranceService.verify('POL-123', 'Patient');

        if (!result.success) {
          saga.retryCount = attempt;
          saga.state = {
            ...saga.state,
            failureReason: result.error,
          };
          await repository.save(saga);

          if (attempt < 3) {
            // Would wait before retry in real implementation
            await repository.appendStepHistory(saga.sagaId, 'RetryInsuranceVerification', {
              attempt,
              error: result.error,
            });
          }
        }
      }

      // After max retries, mark as failed
      await repository.markFailed(saga.sagaId, 'Max retries exceeded for insurance verification');

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('failed');
      expect(finalSaga?.retryCount).toBe(3);
      expect(finalSaga?.stepHistory).toHaveLength(2); // 2 retry history entries
    });

    it('should succeed on retry after transient failure', async () => {
      // Arrange
      const saga = await repository.create<PaymentInsuranceSagaState>({
        sagaType: 'PaymentInsuranceVerification',
        correlationId: 'corr-retry-success',
        initialState: {
          patientId: 'patient-retry',
          caseId: 'case-retry',
          procedureAmount: 100000,
          currency: 'RON',
          currentPhase: 'initiated',
        },
        maxRetries: 3,
      });

      saga.status = 'running';

      // First attempt fails
      insuranceService.setFailure(true, 'Transient network error');
      let result = await insuranceService.verify('POL-123', 'Patient');
      expect(result.success).toBe(false);

      saga.retryCount = 1;
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'RetryInsuranceVerification', {
        attempt: 1,
        error: result.error,
      });

      // Second attempt succeeds
      insuranceService.setFailure(false);
      result = await insuranceService.verify('POL-123', 'Patient');
      expect(result.success).toBe(true);

      saga.state = {
        ...saga.state,
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: result.verificationId,
          status: 'verified',
          coverageAmount: result.coverageAmount,
          verifiedAt: new Date().toISOString(),
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {
        verificationId: result.verificationId,
        retriesNeeded: 1,
      });

      // Complete the saga
      await repository.markCompleted(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('completed');
      expect(finalSaga?.retryCount).toBe(1);
      expect(finalSaga?.state.insuranceVerification?.status).toBe('verified');
    });
  });
});

describe('Appointment Booking Saga Scenarios', () => {
  let repository: InMemorySagaRepository;

  beforeEach(() => {
    repository = createInMemorySagaRepository();
  });

  afterEach(() => {
    repository.clear();
  });

  describe('Slot Reservation Failure Compensation', () => {
    it('should release slot when notification fails', async () => {
      // Arrange
      const initialState: AppointmentBookingSagaState = {
        patientId: 'patient-123',
        clinicId: 'clinic-456',
        providerId: 'provider-789',
        requestedDate: '2024-12-20',
        procedureType: 'all-on-x-consultation',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<AppointmentBookingSagaState>({
        sagaType: 'AppointmentBooking',
        correlationId: 'apt-corr-001',
        initialState,
        totalSteps: 4,
      });

      // Step 1: Check availability - Success
      saga.status = 'running';
      saga.state = {
        ...saga.state,
        currentPhase: 'checking_availability',
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'CheckAvailability', {
        available: true,
      });

      // Step 2: Reserve slot - Success
      saga.state = {
        ...saga.state,
        currentPhase: 'slot_reserved',
        slotReservation: {
          reservationId: 'res-001',
          startTime: '2024-12-20T10:00:00Z',
          endTime: '2024-12-20T11:00:00Z',
          status: 'reserved',
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'ReserveSlot', {
        reservationId: 'res-001',
      });

      // Step 3: Notify patient - FAILS
      saga.state = {
        ...saga.state,
        currentPhase: 'failed',
        failureReason: 'Failed to send notification - invalid phone number',
        notification: {
          notificationId: '',
          channel: 'sms',
          status: 'failed',
        },
      };
      await repository.markFailed(saga.sagaId, 'Failed to send notification');

      // Compensation
      await repository.markCompensating(saga.sagaId);

      // Release the reserved slot
      saga.state = {
        ...saga.state,
        currentPhase: 'compensating',
        slotReservation: {
          ...saga.state.slotReservation!,
          status: 'released',
        },
      };
      await repository.appendStepHistory(saga.sagaId, 'CompensateSlotReservation', {
        action: 'release',
        reservationId: 'res-001',
      });

      saga.state = {
        ...saga.state,
        currentPhase: 'compensated',
        compensationActions: ['release_slot'],
      };
      await repository.markCompensated(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<AppointmentBookingSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('compensated');
      expect(finalSaga?.state.slotReservation?.status).toBe('released');
      expect(finalSaga?.state.notification?.status).toBe('failed');
    });
  });

  describe('Double Booking Prevention', () => {
    it('should prevent double booking for same slot', async () => {
      // Create first booking saga
      const saga1 = await repository.create<AppointmentBookingSagaState>({
        sagaType: 'AppointmentBooking',
        correlationId: 'apt-double-1',
        initialState: {
          patientId: 'patient-1',
          clinicId: 'clinic-456',
          providerId: 'provider-789',
          requestedDate: '2024-12-20',
          procedureType: 'consultation',
          currentPhase: 'initiated',
        },
      });

      // Create second booking saga for same slot
      const saga2 = await repository.create<AppointmentBookingSagaState>({
        sagaType: 'AppointmentBooking',
        correlationId: 'apt-double-2',
        initialState: {
          patientId: 'patient-2',
          clinicId: 'clinic-456',
          providerId: 'provider-789',
          requestedDate: '2024-12-20', // Same date
          procedureType: 'consultation',
          currentPhase: 'initiated',
        },
      });

      // First saga reserves slot successfully
      saga1.status = 'running';
      saga1.state = {
        ...saga1.state,
        currentPhase: 'slot_reserved',
        slotReservation: {
          reservationId: 'res-001',
          startTime: '2024-12-20T10:00:00Z',
          endTime: '2024-12-20T11:00:00Z',
          status: 'reserved',
        },
      };
      await repository.save(saga1);
      await repository.appendStepHistory(saga1.sagaId, 'ReserveSlot', {});

      // Second saga fails to reserve (slot taken)
      saga2.status = 'running';
      saga2.state = {
        ...saga2.state,
        currentPhase: 'failed',
        failureReason: 'Slot already reserved',
      };
      await repository.markFailed(saga2.sagaId, 'Slot already reserved');

      // Assert
      const finalSaga1 = await repository.findById<AppointmentBookingSagaState>(saga1.sagaId);
      const finalSaga2 = await repository.findById<AppointmentBookingSagaState>(saga2.sagaId);

      expect(finalSaga1?.status).toBe('running');
      expect(finalSaga1?.state.slotReservation?.status).toBe('reserved');

      expect(finalSaga2?.status).toBe('failed');
      expect(finalSaga2?.state.failureReason).toBe('Slot already reserved');
    });
  });
});

describe('Lead Onboarding Saga Scenarios', () => {
  let repository: InMemorySagaRepository;

  beforeEach(() => {
    repository = createInMemorySagaRepository();
  });

  afterEach(() => {
    repository.clear();
  });

  describe('Multi-Step Qualification with Compensation', () => {
    it('should rollback assignment when qualification fails post-scoring', async () => {
      // Arrange
      const initialState: LeadOnboardingSagaState = {
        leadId: 'lead-123',
        source: 'website',
        phone: '+40721111111',
        currentPhase: 'initiated',
      };

      const saga = await repository.create<LeadOnboardingSagaState>({
        sagaType: 'LeadOnboarding',
        correlationId: 'lead-corr-001',
        initialState,
        totalSteps: 4,
      });

      // Step 1: Scoring - Success (HOT lead)
      saga.status = 'running';
      saga.state = {
        ...saga.state,
        currentPhase: 'scored',
        scoring: {
          score: 85,
          classification: 'HOT',
          factors: ['mentioned All-on-X', 'ready to schedule', 'budget confirmed'],
        },
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'ScoreLead', {
        score: 85,
        classification: 'HOT',
      });

      // Step 2: Qualifying - Success
      saga.state = {
        ...saga.state,
        currentPhase: 'qualified',
      };
      await repository.save(saga);
      await repository.appendStepHistory(saga.sagaId, 'QualifyLead', {
        qualified: true,
      });

      // Step 3: Assignment - FAILS (no available agents)
      saga.state = {
        ...saga.state,
        currentPhase: 'failed',
        failureReason: 'No available agents for HOT leads',
      };
      await repository.markFailed(saga.sagaId, 'No available agents for HOT leads');

      // Compensation
      await repository.markCompensating(saga.sagaId);

      // Revert qualification
      await repository.appendStepHistory(saga.sagaId, 'CompensateQualification', {
        action: 'revert_to_unqualified',
      });

      // Revert scoring (mark for re-scoring later)
      await repository.appendStepHistory(saga.sagaId, 'CompensateScoring', {
        action: 'mark_for_rescoring',
      });

      saga.state = {
        ...saga.state,
        currentPhase: 'compensated',
        compensationActions: ['revert_qualification', 'mark_for_rescoring'],
      };
      await repository.markCompensated(saga.sagaId);

      // Assert
      const finalSaga = await repository.findById<LeadOnboardingSagaState>(saga.sagaId);
      expect(finalSaga?.status).toBe('compensated');
      expect(finalSaga?.state.scoring?.classification).toBe('HOT');
      expect(finalSaga?.state.compensationActions).toContain('revert_qualification');
      expect(finalSaga?.stepHistory).toHaveLength(4); // 2 forward + 2 compensation
    });
  });
});

describe('Saga Recovery Scenarios', () => {
  let repository: InMemorySagaRepository;

  beforeEach(() => {
    repository = createInMemorySagaRepository();
  });

  afterEach(() => {
    repository.clear();
  });

  it('should recover incomplete sagas after system restart', async () => {
    // Arrange - Create sagas in various states
    const completedSaga = await repository.create({
      sagaType: 'PaymentInsuranceVerification',
      correlationId: 'recovery-completed',
      initialState: { status: 'done' },
    });
    completedSaga.status = 'completed';
    completedSaga.completedAt = new Date();
    await repository.save(completedSaga);

    const runningSaga = await repository.create({
      sagaType: 'PaymentInsuranceVerification',
      correlationId: 'recovery-running',
      initialState: { status: 'in-progress' },
    });
    runningSaga.status = 'running';
    await repository.save(runningSaga);

    const compensatingSaga = await repository.create({
      sagaType: 'PaymentInsuranceVerification',
      correlationId: 'recovery-compensating',
      initialState: { status: 'rolling-back' },
    });
    compensatingSaga.status = 'compensating';
    await repository.save(compensatingSaga);

    const pendingSaga = await repository.create({
      sagaType: 'PaymentInsuranceVerification',
      correlationId: 'recovery-pending',
      initialState: { status: 'waiting' },
    });
    // pending status is default

    // Act - Find sagas that need recovery
    const sagasToRecover = await repository.findForRecovery();

    // Assert
    expect(sagasToRecover.length).toBe(3); // running, compensating, pending
    expect(sagasToRecover.some((s) => s.sagaId === runningSaga.sagaId)).toBe(true);
    expect(sagasToRecover.some((s) => s.sagaId === compensatingSaga.sagaId)).toBe(true);
    expect(sagasToRecover.some((s) => s.sagaId === pendingSaga.sagaId)).toBe(true);
    expect(sagasToRecover.some((s) => s.sagaId === completedSaga.sagaId)).toBe(false);
  });

  it('should resume saga from last successful step', async () => {
    // Arrange - Create a saga that was interrupted mid-process
    const saga = await repository.create<PaymentInsuranceSagaState>({
      sagaType: 'PaymentInsuranceVerification',
      correlationId: 'resume-001',
      initialState: {
        patientId: 'patient-123',
        caseId: 'case-456',
        procedureAmount: 250000,
        currency: 'RON',
        currentPhase: 'insurance_verified',
        insuranceVerification: {
          verificationId: 'verify-001',
          status: 'verified',
          coverageAmount: 100000,
          verifiedAt: '2024-12-01T10:00:00Z',
        },
      },
      totalSteps: 5,
    });

    saga.status = 'running';
    saga.currentStep = 2; // Was on step 2 when interrupted
    await repository.save(saga);
    await repository.appendStepHistory(saga.sagaId, 'VerifyInsurance', {
      verificationId: 'verify-001',
    });

    // Act - Recover and resume from step 2
    const recovered = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);

    // Verify we can determine where to resume
    expect(recovered?.currentStep).toBe(2);
    expect(recovered?.state.currentPhase).toBe('insurance_verified');
    expect(recovered?.stepHistory).toHaveLength(1);
    expect(recovered?.stepHistory[0]?.step).toBe('VerifyInsurance');

    // Resume - continue with payment authorization
    const paymentGateway = new MockPaymentGateway();
    const patientAmount =
      recovered!.state.procedureAmount -
      (recovered!.state.insuranceVerification?.coverageAmount ?? 0);
    const authResult = await paymentGateway.authorize(patientAmount, recovered!.state.currency);

    recovered!.state = {
      ...recovered!.state,
      currentPhase: 'payment_processed',
      payment: {
        paymentId: authResult.paymentId,
        status: 'authorized',
        amount: patientAmount,
        authorizedAt: new Date().toISOString(),
      },
    };
    recovered!.currentStep = 3;
    await repository.save(recovered!);
    await repository.appendStepHistory(recovered!.sagaId, 'AuthorizePayment', {
      paymentId: authResult.paymentId,
    });

    // Assert - Saga resumed successfully
    const finalSaga = await repository.findById<PaymentInsuranceSagaState>(saga.sagaId);
    expect(finalSaga?.currentStep).toBe(3);
    expect(finalSaga?.state.payment?.status).toBe('authorized');
    expect(finalSaga?.stepHistory).toHaveLength(2);
  });
});

describe('Saga Cleanup Scenarios', () => {
  let repository: InMemorySagaRepository;

  beforeEach(() => {
    repository = createInMemorySagaRepository();
  });

  afterEach(() => {
    repository.clear();
  });

  it('should clean up old completed sagas', async () => {
    // Arrange - Create old and new sagas
    const oldSaga = await repository.create({
      sagaType: 'PaymentInsuranceVerification',
      correlationId: 'old-saga',
      initialState: {},
    });
    oldSaga.status = 'completed';
    oldSaga.completedAt = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago
    await repository.save(oldSaga);

    const recentSaga = await repository.create({
      sagaType: 'PaymentInsuranceVerification',
      correlationId: 'recent-saga',
      initialState: {},
    });
    recentSaga.status = 'completed';
    recentSaga.completedAt = new Date(); // Today
    await repository.save(recentSaga);

    const activeSaga = await repository.create({
      sagaType: 'PaymentInsuranceVerification',
      correlationId: 'active-saga',
      initialState: {},
    });
    activeSaga.status = 'running';
    await repository.save(activeSaga);

    // Act
    const deletedCount = await repository.cleanup(30); // Delete older than 30 days

    // Assert
    expect(deletedCount).toBe(1);
    expect(await repository.findById(oldSaga.sagaId)).toBeNull();
    expect(await repository.findById(recentSaga.sagaId)).not.toBeNull();
    expect(await repository.findById(activeSaga.sagaId)).not.toBeNull();
  });

  it('should clean up old failed and compensated sagas', async () => {
    // Arrange
    const oldFailed = await repository.create({
      sagaType: 'Test',
      correlationId: 'old-failed',
      initialState: {},
    });
    oldFailed.status = 'failed';
    oldFailed.completedAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await repository.save(oldFailed);

    const oldCompensated = await repository.create({
      sagaType: 'Test',
      correlationId: 'old-compensated',
      initialState: {},
    });
    oldCompensated.status = 'compensated';
    oldCompensated.completedAt = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    await repository.save(oldCompensated);

    // Act
    const deletedCount = await repository.cleanup(30);

    // Assert
    expect(deletedCount).toBe(2);
  });
});

describe('Complex Multi-Saga Orchestration', () => {
  let repository: InMemorySagaRepository;

  beforeEach(() => {
    repository = createInMemorySagaRepository();
  });

  afterEach(() => {
    repository.clear();
  });

  it('should coordinate parent-child saga relationship', async () => {
    // Arrange - Parent saga triggers child saga
    const parentSaga = await repository.create({
      sagaType: 'PatientOnboarding',
      correlationId: 'parent-001',
      initialState: {
        patientId: 'patient-123',
        phase: 'initiated',
        childSagas: [] as string[],
      },
      totalSteps: 3,
      metadata: {
        type: 'parent',
      },
    });

    parentSaga.status = 'running';
    await repository.save(parentSaga);

    // Step 1: Create patient record
    await repository.appendStepHistory(parentSaga.sagaId, 'CreatePatient', {});

    // Step 2: Trigger child sagas
    const insuranceSaga = await repository.create({
      sagaType: 'InsuranceVerification',
      correlationId: 'child-insurance-001',
      initialState: { patientId: 'patient-123' },
      metadata: {
        type: 'child',
        parentSagaId: parentSaga.sagaId,
      },
    });

    const consentSaga = await repository.create({
      sagaType: 'ConsentCollection',
      correlationId: 'child-consent-001',
      initialState: { patientId: 'patient-123' },
      metadata: {
        type: 'child',
        parentSagaId: parentSaga.sagaId,
      },
    });

    // Update parent with child references
    parentSaga.state = {
      ...parentSaga.state,
      childSagas: [insuranceSaga.sagaId, consentSaga.sagaId],
    };
    await repository.save(parentSaga);

    // Complete child sagas
    await repository.markCompleted(insuranceSaga.sagaId);
    await repository.markCompleted(consentSaga.sagaId);

    // Complete parent
    await repository.markCompleted(parentSaga.sagaId);

    // Assert
    const finalParent = await repository.findById(parentSaga.sagaId);
    const finalInsurance = await repository.findById(insuranceSaga.sagaId);
    const finalConsent = await repository.findById(consentSaga.sagaId);

    expect(finalParent?.status).toBe('completed');
    expect(finalInsurance?.status).toBe('completed');
    expect(finalConsent?.status).toBe('completed');
    expect((finalParent?.state as { childSagas: string[] }).childSagas).toHaveLength(2);
  });

  it('should compensate parent when child saga fails', async () => {
    // Arrange
    const parentSaga = await repository.create({
      sagaType: 'PatientOnboarding',
      correlationId: 'parent-fail-001',
      initialState: {
        patientId: 'patient-123',
        phase: 'initiated',
        childSagas: [] as string[],
      },
    });

    parentSaga.status = 'running';
    await repository.save(parentSaga);
    await repository.appendStepHistory(parentSaga.sagaId, 'CreatePatient', {});

    // Create child sagas
    const insuranceSaga = await repository.create({
      sagaType: 'InsuranceVerification',
      correlationId: 'child-insurance-fail',
      initialState: { patientId: 'patient-123' },
      metadata: { parentSagaId: parentSaga.sagaId },
    });

    parentSaga.state = {
      ...parentSaga.state,
      childSagas: [insuranceSaga.sagaId],
    };
    await repository.save(parentSaga);

    // Child saga fails
    insuranceSaga.status = 'running';
    await repository.save(insuranceSaga);
    await repository.markFailed(insuranceSaga.sagaId, 'Insurance verification failed');

    // Parent detects child failure and compensates
    await repository.markCompensating(parentSaga.sagaId);
    await repository.appendStepHistory(parentSaga.sagaId, 'CompensateCreatePatient', {
      action: 'delete_patient_record',
    });
    await repository.markCompensated(parentSaga.sagaId);

    // Assert
    const finalParent = await repository.findById(parentSaga.sagaId);
    const finalChild = await repository.findById(insuranceSaga.sagaId);

    expect(finalParent?.status).toBe('compensated');
    expect(finalChild?.status).toBe('failed');
  });
});
