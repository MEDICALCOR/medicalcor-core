/**
 * AI-First API Gateway - Function Executor
 *
 * Executes AI function calls by connecting to actual domain services.
 * Uses dependency injection for testability and loose coupling.
 *
 * This is the "quantum leap" - making LLMs fully operational against
 * the medical CRM with type-safe, validated function calling.
 *
 * REFACTORED: Removed all `any` types. Uses discriminated unions and
 * branded types for maximum type safety.
 */

import type { EventStore } from '../event-store.js';
import type { CommandBus } from '../cqrs/command-bus.js';
import type { QueryBus } from '../cqrs/query-bus.js';
import type { ProjectionManager } from '../cqrs/projections.js';
import type { FunctionContext, AIFunctionResult } from './function-registry.js';
import type { ZodSchema } from 'zod';
import {
  FUNCTION_INPUT_SCHEMAS,
  FUNCTION_OUTPUT_SCHEMAS,
  validateAndSanitizeAIOutput,
  validateAIReasoning,
} from './medical-functions.js';
// ============================================================================
// TYPED FUNCTION ARGUMENTS
// ============================================================================

/**
 * Score lead function arguments
 */
interface ScoreLeadArgs {
  phone: string;
  channel: 'whatsapp' | 'voice' | 'web' | 'referral';
  messages?: {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string;
  }[];
  utmParams?: {
    source?: string;
    medium?: string;
    campaign?: string;
    content?: string;
    term?: string;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Get patient function arguments
 */
interface GetPatientArgs {
  patientId?: string;
  phone?: string;
  email?: string;
}

/**
 * Update patient function arguments
 */
interface UpdatePatientArgs {
  patientId: string;
  updates: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    dateOfBirth?: string;
    notes?: string;
    tags?: string[];
  };
}

/**
 * Schedule appointment function arguments
 */
interface ScheduleAppointmentArgs {
  patientId: string;
  phone?: string;
  doctorId?: string;
  serviceType: string;
  preferredDate: string;
  preferredTimeSlot?: 'morning' | 'afternoon' | 'evening' | 'any';
  duration?: number;
  notes?: string;
  urgency?: 'normal' | 'urgent' | 'emergency';
}

/**
 * Get available slots function arguments
 */
interface GetAvailableSlotsArgs {
  startDate: string;
  endDate: string;
  doctorId?: string;
  serviceType?: string;
  duration?: number;
}

/**
 * Cancel appointment function arguments
 */
interface CancelAppointmentArgs {
  appointmentId: string;
  reason?: string;
  notifyPatient?: boolean;
}

/**
 * Send WhatsApp function arguments
 */
interface SendWhatsAppArgs {
  to: string;
  message?: string;
  templateName?: string;
  templateParams?: Record<string, string>;
}

/**
 * Record consent function arguments
 */
interface RecordConsentArgs {
  patientId: string;
  phone: string;
  consentType:
    | 'data_processing'
    | 'marketing_whatsapp'
    | 'marketing_email'
    | 'marketing_sms'
    | 'appointment_reminders'
    | 'treatment_updates'
    | 'third_party_sharing';
  status: 'granted' | 'denied' | 'withdrawn';
  source: string;
  ipAddress?: string;
}

/**
 * Check consent function arguments
 */
interface CheckConsentArgs {
  patientId?: string;
  phone?: string;
  consentTypes?: string[];
}

/**
 * Get lead analytics function arguments
 */
interface GetLeadAnalyticsArgs {
  startDate: string;
  endDate: string;
  groupBy?: 'day' | 'week' | 'month' | 'channel' | 'classification';
  channel?: 'whatsapp' | 'voice' | 'web' | 'referral';
}

/**
 * Trigger workflow function arguments
 */
interface TriggerWorkflowArgs {
  workflow: 'lead-scoring' | 'patient-journey' | 'nurture-sequence' | 'booking-agent';
  payload: Record<string, unknown>;
  priority?: 'low' | 'normal' | 'high';
}

/**
 * Get workflow status function arguments
 */
interface GetWorkflowStatusArgs {
  taskId: string;
}

/**
 * Get function args type by function name
 */
interface FunctionArgsMap {
  score_lead: ScoreLeadArgs;
  get_patient: GetPatientArgs;
  update_patient: UpdatePatientArgs;
  schedule_appointment: ScheduleAppointmentArgs;
  get_available_slots: GetAvailableSlotsArgs;
  cancel_appointment: CancelAppointmentArgs;
  send_whatsapp: SendWhatsAppArgs;
  record_consent: RecordConsentArgs;
  check_consent: CheckConsentArgs;
  get_lead_analytics: GetLeadAnalyticsArgs;
  trigger_workflow: TriggerWorkflowArgs;
  get_workflow_status: GetWorkflowStatusArgs;
}

type FunctionName = keyof FunctionArgsMap;

// ============================================================================
// DEPENDENCY INTERFACES
// ============================================================================

/**
 * Scoring service interface for lead scoring operations
 */
export interface ScoringServicePort {
  scoreMessage(context: {
    phone: string;
    channel: string;
    messageHistory?: { role: string; content: string }[];
    language?: string;
    utm?: Record<string, string>;
  }): Promise<{
    score: number;
    classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
    confidence: number;
    reasoning: string;
    suggestedAction: string;
    detectedIntent?: string;
    urgencyIndicators?: string[];
    budgetMentioned?: boolean;
    procedureInterest?: string[];
  }>;
}

/**
 * HubSpot CRM service interface
 */
export interface HubSpotServicePort {
  getContact(params: { phone?: string; email?: string; contactId?: string }): Promise<{
    id: string;
    properties: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
  } | null>;

  updateContact(contactId: string, properties: Record<string, unknown>): Promise<void>;

  createContact(properties: Record<string, unknown>): Promise<{ id: string }>;
}

/**
 * WhatsApp messaging service interface
 */
export interface WhatsAppServicePort {
  sendMessage(params: {
    to: string;
    message?: string;
    templateName?: string;
    templateParams?: Record<string, string>;
  }): Promise<{
    messageId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: string;
  }>;
}

/**
 * Scheduling service interface
 */
export interface SchedulingServicePort {
  getAvailableSlots(params: {
    startDate: string;
    endDate: string;
    doctorId?: string;
    serviceType?: string;
    duration?: number;
  }): Promise<
    {
      slotId: string;
      startTime: string;
      endTime: string;
      doctorId: string;
      doctorName: string;
      available: boolean;
    }[]
  >;

  scheduleAppointment(params: {
    patientId: string;
    slotId?: string;
    serviceType: string;
    preferredDate: string;
    preferredTimeSlot?: string;
    duration?: number;
    notes?: string;
    urgency?: string;
  }): Promise<{
    appointmentId: string;
    status: 'confirmed' | 'pending' | 'waitlist';
    dateTime: string;
    doctor: { id: string; name: string };
    location: string;
  }>;

  cancelAppointment(params: {
    appointmentId: string;
    reason?: string;
    notifyPatient?: boolean;
  }): Promise<{
    success: boolean;
    refundAmount?: number;
  }>;
}

/**
 * Consent service interface for GDPR compliance
 */
export interface ConsentServicePort {
  recordConsent(params: {
    patientId: string;
    phone: string;
    consentType: string;
    status: 'granted' | 'denied' | 'withdrawn';
    source: string;
    ipAddress?: string;
  }): Promise<{
    consentId: string;
    recordedAt: string;
  }>;

  checkConsent(params: { patientId?: string; phone?: string; consentTypes?: string[] }): Promise<{
    consents: {
      type: string;
      status: 'granted' | 'denied' | 'withdrawn';
      recordedAt: string;
      source: string;
    }[];
  }>;
}

/**
 * Workflow trigger service interface (Trigger.dev)
 */
export interface WorkflowServicePort {
  triggerWorkflow(params: {
    workflow: string;
    payload: Record<string, unknown>;
    priority?: string;
  }): Promise<{
    taskId: string;
    status: 'queued' | 'running';
    estimatedCompletionMs?: number;
  }>;

  getWorkflowStatus(taskId: string): Promise<{
    taskId: string;
    status: 'queued' | 'running' | 'completed' | 'failed';
    result?: unknown;
    error?: string;
    startedAt?: string;
    completedAt?: string;
  }>;
}

// ============================================================================
// FUNCTION EXECUTOR DEPENDENCIES
// ============================================================================

export interface FunctionExecutorDeps {
  // Core infrastructure
  eventStore: EventStore;
  commandBus: CommandBus;
  queryBus: QueryBus;
  projectionManager: ProjectionManager;

  // Domain services (optional - graceful degradation)
  scoringService?: ScoringServicePort;
  hubspotService?: HubSpotServicePort;
  whatsappService?: WhatsAppServicePort;
  schedulingService?: SchedulingServicePort;
  consentService?: ConsentServicePort;
  workflowService?: WorkflowServicePort;
}

// ============================================================================
// HANDLER TYPE
// ============================================================================

/**
 * Type-safe handler signature for each function
 */
type FunctionHandler<T extends FunctionName> = (
  args: FunctionArgsMap[T],
  context: FunctionContext
) => Promise<unknown>;

/**
 * Handler map type - ensures all handlers have correct signatures
 */
type HandlerMap = {
  [K in FunctionName]: FunctionHandler<K>;
};

// ============================================================================
// FUNCTION EXECUTOR IMPLEMENTATION
// ============================================================================

export class FunctionExecutor {
  private readonly handlers: HandlerMap;

  constructor(private deps: FunctionExecutorDeps) {
    // Initialize handlers with proper type binding
    this.handlers = {
      score_lead: this.handleScoreLead.bind(this),
      get_patient: this.handleGetPatient.bind(this),
      update_patient: this.handleUpdatePatient.bind(this),
      schedule_appointment: this.handleScheduleAppointment.bind(this),
      get_available_slots: this.handleGetAvailableSlots.bind(this),
      cancel_appointment: this.handleCancelAppointment.bind(this),
      send_whatsapp: this.handleSendWhatsApp.bind(this),
      record_consent: this.handleRecordConsent.bind(this),
      check_consent: this.handleCheckConsent.bind(this),
      get_lead_analytics: this.handleGetLeadAnalytics.bind(this),
      trigger_workflow: this.handleTriggerWorkflow.bind(this),
      get_workflow_status: this.handleGetWorkflowStatus.bind(this),
    };
  }

  /**
   * Execute a function by name with validated arguments
   */
  async execute(
    functionName: string,
    args: Record<string, unknown>,
    context: FunctionContext
  ): Promise<AIFunctionResult> {
    const startTime = Date.now();

    try {
      // Check if function name is valid
      if (!this.isFunctionName(functionName)) {
        return {
          function: functionName,
          success: false,
          error: {
            code: 'FUNCTION_NOT_IMPLEMENTED',
            message: `Function '${functionName}' handler is not implemented`,
          },
          executionTimeMs: Date.now() - startTime,
          traceId: context.traceId,
        };
      }

      // Validate input
      const schema = FUNCTION_INPUT_SCHEMAS[functionName] as
        | (typeof FUNCTION_INPUT_SCHEMAS)[keyof typeof FUNCTION_INPUT_SCHEMAS]
        | undefined;
      let validatedArgs = args;

       
      if (schema !== null && schema !== undefined) {
        const validation = schema.safeParse(args);
        if (!validation.success) {
          return {
            function: functionName,
            success: false,
            error: {
              code: 'INVALID_ARGUMENTS',
              message: 'Function arguments validation failed',
              details: validation.error.flatten(),
            },
            executionTimeMs: Date.now() - startTime,
            traceId: context.traceId,
          };
        }
        validatedArgs = validation.data as Record<string, unknown>;
      }

      // Execute the handler with proper typing
      const handler = this.handlers[functionName] as (
        args: Record<string, unknown>,
        ctx: FunctionContext
      ) => Promise<unknown>;
      const result = await handler(validatedArgs, context);

      // =========================================================================
      // CRITICAL: Validate AI output before showing to medical staff
      // This prevents hallucinated data, dangerous recommendations, and
      // unverified medical claims from being shown to doctors
      // =========================================================================
      const outputSchema = FUNCTION_OUTPUT_SCHEMAS[
        functionName as keyof typeof FUNCTION_OUTPUT_SCHEMAS
      ] as ZodSchema | undefined;
      const outputValidation = validateAndSanitizeAIOutput(functionName, result, outputSchema);

      // Log any validation issues for monitoring and audit
      if (outputValidation.errors.length > 0 || outputValidation.warnings.length > 0) {
        // Emit audit event for AI output validation issues
        await this.deps.eventStore.emit({
          type: 'AIOutputValidationIssue',
          correlationId: context.correlationId,
          payload: {
            functionName,
            traceId: context.traceId,
            errors: outputValidation.errors,
            warnings: outputValidation.warnings,
            severity: outputValidation.errors.length > 0 ? 'error' : 'warning',
            timestamp: new Date().toISOString(),
          },
        });
      }

      // If critical validation errors, return error instead of potentially dangerous output
      if (!outputValidation.valid) {
        return {
          function: functionName,
          success: false,
          error: {
            code: 'AI_OUTPUT_VALIDATION_FAILED',
            message: 'AI output failed safety validation and cannot be shown to medical staff',
            details: {
              errors: outputValidation.errors,
              warnings: outputValidation.warnings,
            },
          },
          executionTimeMs: Date.now() - startTime,
          traceId: context.traceId,
        };
      }

      // Include validation metadata in the result for transparency
      const validatedResult = outputValidation.sanitized as Record<string, unknown> | null;
      if (validatedResult && typeof validatedResult === 'object') {
        validatedResult._outputValidated = true;
        if (outputValidation.warnings.length > 0) {
          validatedResult._validationWarnings = outputValidation.warnings;
        }
      }

      return {
        function: functionName,
        success: true,
        // Return sanitized output, not raw result
        result: validatedResult,
        executionTimeMs: Date.now() - startTime,
        traceId: context.traceId,
      };
    } catch (error) {
      return {
        function: functionName,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        executionTimeMs: Date.now() - startTime,
        traceId: context.traceId,
      };
    }
  }

  /**
   * Type guard to check if a string is a valid function name
   */
  private isFunctionName(name: string): name is FunctionName {
    return name in this.handlers;
  }

  // ============================================================================
  // LEAD FUNCTIONS
  // ============================================================================

  private async handleScoreLead(args: ScoreLeadArgs, context: FunctionContext): Promise<unknown> {
    if (!this.deps.scoringService) {
      // Use command bus as fallback
      const result = await this.deps.commandBus.send('ScoreLead', args, {
        correlationId: context.correlationId,
        userId: context.userId,
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to score lead');
      }

      // Validate command bus result reasoning before returning
      if (result.result && typeof result.result === 'object' && 'reasoning' in result.result) {
        const resultWithReasoning = result.result as { reasoning: unknown };
        if (typeof resultWithReasoning.reasoning !== 'string') {
          throw new Error('AI reasoning must be a string');
        }
        const reasoningValidation = validateAIReasoning(resultWithReasoning.reasoning);
        if (!reasoningValidation.valid) {
          // Log critical validation failure
          await this.deps.eventStore.emit({
            type: 'AIReasoningValidationFailed',
            correlationId: context.correlationId,
            payload: {
              function: 'score_lead',
              issues: reasoningValidation.issues,
              severity: reasoningValidation.severity,
              source: 'command_bus',
            },
          });
          throw new Error('AI reasoning failed medical safety validation');
        }
        // Return with sanitized reasoning
        return {
          ...result.result,
          reasoning: reasoningValidation.sanitizedReasoning,
          _reasoningValidated: true,
        };
      }

      return result.result;
    }

    // Use scoring service directly
    const scoringResult = await this.deps.scoringService.scoreMessage({
      phone: args.phone,
      channel: args.channel,
      ...(args.messages && {
        messageHistory: args.messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      }),
      ...(args.utmParams && { utm: args.utmParams as Record<string, string> }),
    });

    // =========================================================================
    // CRITICAL: Validate AI reasoning before it's shown to doctors
    // This prevents hallucinated diagnoses, medication recommendations,
    // and other dangerous medical content from reaching staff
    // =========================================================================
    const reasoningValidation = validateAIReasoning(scoringResult.reasoning);

    if (!reasoningValidation.valid) {
      // Log critical validation failure for security monitoring
      await this.deps.eventStore.emit({
        type: 'AIReasoningValidationFailed',
        correlationId: context.correlationId,
        aggregateId: args.phone,
        aggregateType: 'Lead',
        payload: {
          phone: args.phone,
          channel: args.channel,
          issues: reasoningValidation.issues,
          severity: reasoningValidation.severity,
          originalReasoning: scoringResult.reasoning,
          source: 'scoring_service',
        },
      });

      // Return error - do not expose potentially dangerous AI reasoning
      throw new Error(
        'AI reasoning failed medical safety validation. ' +
          `Issues detected: ${reasoningValidation.issues.join('; ')}`
      );
    }

    // Use sanitized reasoning (may have warnings attached)
    const sanitizedReasoning = reasoningValidation.sanitizedReasoning;

    // Emit event for audit trail with sanitized reasoning
    await this.deps.eventStore.emit({
      type: 'LeadScored',
      correlationId: context.correlationId,
      aggregateId: args.phone,
      aggregateType: 'Lead',
      payload: {
        phone: args.phone,
        channel: args.channel,
        score: scoringResult.score,
        classification: scoringResult.classification,
        confidence: scoringResult.confidence,
        reasoning: sanitizedReasoning,
        reasoningValidated: true,
        reasoningWarnings:
          reasoningValidation.issues.length > 0 ? reasoningValidation.issues : undefined,
        source: 'ai-gateway',
      },
    });

    return {
      ...scoringResult,
      reasoning: sanitizedReasoning,
      leadId: args.phone,
      timestamp: new Date().toISOString(),
      _reasoningValidated: true,
      _reasoningWarnings:
        reasoningValidation.issues.length > 0 ? reasoningValidation.issues : undefined,
    };
  }

  // ============================================================================
  // PATIENT FUNCTIONS
  // ============================================================================

  private async handleGetPatient(args: GetPatientArgs, context: FunctionContext): Promise<unknown> {
    // Try HubSpot service first
    if (this.deps.hubspotService) {
      const contact = await this.deps.hubspotService.getContact({
        ...(args.phone && { phone: args.phone }),
        ...(args.email && { email: args.email }),
        ...(args.patientId && { contactId: args.patientId }),
      });

      if (contact) {
        return {
          patientId: contact.id,
          ...contact.properties,
          source: 'hubspot',
          retrievedAt: new Date().toISOString(),
        };
      }
    }

    // Fallback to query bus
    const result = await this.deps.queryBus.query('GetPatient', args, {
      correlationId: context.correlationId,
      userId: context.userId,
    });

    if (!result.success) {
      return {
        found: false,
        searchCriteria: args,
        message: 'Patient not found',
      };
    }

    return result.data;
  }

  private async handleUpdatePatient(
    args: UpdatePatientArgs,
    context: FunctionContext
  ): Promise<unknown> {
    // Use command bus for updates
    const result = await this.deps.commandBus.send(
      'UpdatePatient',
      {
        patientId: args.patientId,
        updates: args.updates,
      },
      {
        correlationId: context.correlationId,
        userId: context.userId,
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message ?? 'Failed to update patient');
    }

    // Also update HubSpot if available
    if (this.deps.hubspotService) {
      await this.deps.hubspotService.updateContact(args.patientId, args.updates);
    }

    return {
      patientId: args.patientId,
      updated: true,
      fields: Object.keys(args.updates),
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================================
  // APPOINTMENT FUNCTIONS
  // ============================================================================

  /**
   * CRITICAL: Validates patient has required consent before scheduling
   * Medical appointments REQUIRE data_processing consent for GDPR compliance
   */
  private async validateAppointmentConsent(
    patientId: string,
    phone: string | undefined,
    context: FunctionContext
  ): Promise<{ valid: boolean; missing: string[]; error?: string }> {
    // Required consent types for medical appointments
    const requiredConsents = ['data_processing'];

    if (!this.deps.consentService) {
      // Fallback to query bus
      const result = await this.deps.queryBus.query(
        'CheckConsent',
        { patientId, phone, consentTypes: requiredConsents },
        { correlationId: context.correlationId }
      );

      if (!result.success || !result.data) {
        // CRITICAL: If we cannot verify consent, we must NOT proceed
        // This is a fail-safe for GDPR compliance
        return {
          valid: false,
          missing: requiredConsents,
          error:
            'Unable to verify consent status. Cannot schedule appointment without consent verification.',
        };
      }

      const consents = (result.data as { consents: { type: string; status: string }[] }).consents;
      const grantedTypes = consents.filter((c) => c.status === 'granted').map((c) => c.type);

      const missing = requiredConsents.filter((t) => !grantedTypes.includes(t));
      return { valid: missing.length === 0, missing };
    }

    // Use consent service directly
    const consentResult = await this.deps.consentService.checkConsent({
      patientId,
      ...(phone ? { phone } : {}),
      consentTypes: requiredConsents,
    });

    const grantedTypes = consentResult.consents
      .filter((c) => c.status === 'granted')
      .map((c) => c.type);

    const missing = requiredConsents.filter((t) => !grantedTypes.includes(t));
    return { valid: missing.length === 0, missing };
  }

  private async handleScheduleAppointment(
    args: ScheduleAppointmentArgs,
    context: FunctionContext
  ): Promise<unknown> {
    // =========================================================================
    // CRITICAL GDPR CHECK: Validate consent BEFORE scheduling any appointment
    // Medical appointments cannot be scheduled without explicit data processing consent
    // This is non-negotiable for healthcare GDPR compliance
    // =========================================================================
    const consentCheck = await this.validateAppointmentConsent(args.patientId, args.phone, context);

    if (!consentCheck.valid) {
      // Emit consent violation event for audit trail
      await this.deps.eventStore.emit({
        type: 'AppointmentConsentViolation',
        correlationId: context.correlationId,
        aggregateId: args.patientId,
        aggregateType: 'Consent',
        payload: {
          patientId: args.patientId,
          phone: args.phone,
          missingConsents: consentCheck.missing,
          attemptedAction: 'schedule_appointment',
          serviceType: args.serviceType,
          source: 'ai-gateway',
          blockedAt: new Date().toISOString(),
        },
      });

      // Return structured error for the AI to communicate to the patient
      return {
        success: false,
        blocked: true,
        reason: 'CONSENT_REQUIRED',
        message:
          `Cannot schedule appointment: Patient has not provided required consent for data processing. ` +
          `Missing consents: ${consentCheck.missing.join(', ')}`,
        missingConsents: consentCheck.missing,
        action: 'request_consent',
        consentPrompt:
          'Before scheduling your appointment, we need your consent to process your personal and medical data. ' +
          'This is required by GDPR regulations. Would you like to provide consent now?',
      };
    }

    if (!this.deps.schedulingService) {
      // Use command bus as fallback
      const result = await this.deps.commandBus.send('ScheduleAppointment', args, {
        correlationId: context.correlationId,
        userId: context.userId,
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to schedule appointment');
      }

      return result.result;
    }

    const appointment = await this.deps.schedulingService.scheduleAppointment({
      patientId: args.patientId,
      serviceType: args.serviceType,
      preferredDate: args.preferredDate,
      ...(args.preferredTimeSlot && { preferredTimeSlot: args.preferredTimeSlot }),
      ...(args.duration !== undefined && { duration: args.duration }),
      ...(args.notes && { notes: args.notes }),
      ...(args.urgency && { urgency: args.urgency }),
    });

    // Emit event with consent verification metadata
    await this.deps.eventStore.emit({
      type: 'AppointmentScheduled',
      correlationId: context.correlationId,
      aggregateId: appointment.appointmentId,
      aggregateType: 'Appointment',
      payload: {
        appointmentId: appointment.appointmentId,
        patientId: args.patientId,
        serviceType: args.serviceType,
        dateTime: appointment.dateTime,
        doctor: appointment.doctor,
        location: appointment.location,
        source: 'ai-gateway',
        consentVerified: true,
        consentVerifiedAt: new Date().toISOString(),
      },
    });

    return appointment;
  }

  private async handleGetAvailableSlots(
    args: GetAvailableSlotsArgs,
    context: FunctionContext
  ): Promise<unknown> {
    if (!this.deps.schedulingService) {
      // Use query bus as fallback
      const result = await this.deps.queryBus.query('GetAvailableSlots', args, {
        correlationId: context.correlationId,
      });

      return result.data ?? { slots: [], message: 'Scheduling service not available' };
    }

    const slots = await this.deps.schedulingService.getAvailableSlots({
      startDate: args.startDate,
      endDate: args.endDate,
      ...(args.doctorId && { doctorId: args.doctorId }),
      ...(args.serviceType && { serviceType: args.serviceType }),
      ...(args.duration !== undefined && { duration: args.duration }),
    });

    return {
      slots,
      totalAvailable: slots.filter((s) => s.available).length,
      dateRange: {
        start: args.startDate,
        end: args.endDate,
      },
    };
  }

  private async handleCancelAppointment(
    args: CancelAppointmentArgs,
    context: FunctionContext
  ): Promise<unknown> {
    if (!this.deps.schedulingService) {
      const result = await this.deps.commandBus.send('CancelAppointment', args, {
        correlationId: context.correlationId,
        userId: context.userId,
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to cancel appointment');
      }

      return result.result;
    }

    const cancellation = await this.deps.schedulingService.cancelAppointment({
      appointmentId: args.appointmentId,
      ...(args.reason && { reason: args.reason }),
      ...(args.notifyPatient !== undefined && { notifyPatient: args.notifyPatient }),
    });

    // Emit event
    await this.deps.eventStore.emit({
      type: 'AppointmentCancelled',
      correlationId: context.correlationId,
      aggregateId: args.appointmentId,
      aggregateType: 'Appointment',
      payload: {
        appointmentId: args.appointmentId,
        reason: args.reason,
        notifiedPatient: args.notifyPatient,
        source: 'ai-gateway',
      },
    });

    return {
      appointmentId: args.appointmentId,
      cancelled: cancellation.success,
      refundAmount: cancellation.refundAmount,
      timestamp: new Date().toISOString(),
    };
  }

  // ============================================================================
  // MESSAGING FUNCTIONS
  // ============================================================================

  private async handleSendWhatsApp(
    args: SendWhatsAppArgs,
    context: FunctionContext
  ): Promise<unknown> {
    if (!this.deps.whatsappService) {
      // Use command bus as fallback
      const result = await this.deps.commandBus.send('SendWhatsAppMessage', args, {
        correlationId: context.correlationId,
        userId: context.userId,
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to send WhatsApp message');
      }

      return result.result;
    }

    const messageResult = await this.deps.whatsappService.sendMessage({
      to: args.to,
      ...(args.message && { message: args.message }),
      ...(args.templateName && { templateName: args.templateName }),
      ...(args.templateParams && { templateParams: args.templateParams }),
    });

    // Emit event
    await this.deps.eventStore.emit({
      type: 'WhatsAppMessageSent',
      correlationId: context.correlationId,
      aggregateId: args.to,
      payload: {
        to: args.to,
        messageId: messageResult.messageId,
        templateName: args.templateName,
        status: messageResult.status,
        source: 'ai-gateway',
      },
    });

    return messageResult;
  }

  // ============================================================================
  // CONSENT FUNCTIONS
  // ============================================================================

  private async handleRecordConsent(
    args: RecordConsentArgs,
    context: FunctionContext
  ): Promise<unknown> {
    if (!this.deps.consentService) {
      const result = await this.deps.commandBus.send('RecordConsent', args, {
        correlationId: context.correlationId,
        userId: context.userId,
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to record consent');
      }

      return result.result;
    }

    const consentResult = await this.deps.consentService.recordConsent({
      patientId: args.patientId,
      phone: args.phone,
      consentType: args.consentType,
      status: args.status,
      source: args.source,
      ...(args.ipAddress && { ipAddress: args.ipAddress }),
    });

    // Emit event for GDPR audit trail
    await this.deps.eventStore.emit({
      type: 'ConsentRecorded',
      correlationId: context.correlationId,
      aggregateId: args.patientId,
      aggregateType: 'Consent',
      payload: {
        patientId: args.patientId,
        phone: args.phone,
        consentType: args.consentType,
        status: args.status,
        source: args.source,
        consentId: consentResult.consentId,
        recordedAt: consentResult.recordedAt,
      },
    });

    return {
      ...consentResult,
      gdprCompliant: true,
    };
  }

  private async handleCheckConsent(
    args: CheckConsentArgs,
    context: FunctionContext
  ): Promise<unknown> {
    if (!this.deps.consentService) {
      const result = await this.deps.queryBus.query('CheckConsent', args, {
        correlationId: context.correlationId,
      });

      return result.data ?? { consents: [], message: 'Consent service not available' };
    }

    return this.deps.consentService.checkConsent({
      ...(args.patientId && { patientId: args.patientId }),
      ...(args.phone && { phone: args.phone }),
      ...(args.consentTypes && { consentTypes: args.consentTypes }),
    });
  }

  // ============================================================================
  // ANALYTICS FUNCTIONS
  // ============================================================================

  private async handleGetLeadAnalytics(
    args: GetLeadAnalyticsArgs,
    context: FunctionContext
  ): Promise<unknown> {
    // Get analytics from projection manager
    const leadStats = this.deps.projectionManager.get('lead-stats');
    const dailyMetrics = this.deps.projectionManager.get('daily-metrics');

    if (!leadStats || !dailyMetrics) {
      // Fallback to query bus
      const result = await this.deps.queryBus.query('GetLeadAnalytics', args, {
        correlationId: context.correlationId,
        cacheKey: `analytics:${args.startDate}:${args.endDate}:${args.groupBy ?? 'day'}`,
        cacheTtlMs: 300000, // 5 minutes
      });

      return result.data;
    }

    // Build analytics from projections
    const stats = leadStats.state as {
      totalLeads: number;
      leadsByChannel: Record<string, number>;
      leadsByClassification: Record<string, number>;
      averageScore: number;
      conversionRate: number;
    };

    return {
      summary: {
        totalLeads: stats.totalLeads,
        averageScore: stats.averageScore,
        conversionRate: stats.conversionRate,
      },
      byChannel: stats.leadsByChannel,
      byClassification: stats.leadsByClassification,
      dateRange: {
        start: args.startDate,
        end: args.endDate,
      },
      groupBy: args.groupBy ?? 'day',
      generatedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // WORKFLOW FUNCTIONS
  // ============================================================================

  private async handleTriggerWorkflow(
    args: TriggerWorkflowArgs,
    context: FunctionContext
  ): Promise<unknown> {
    if (!this.deps.workflowService) {
      const result = await this.deps.commandBus.send('TriggerWorkflow', args, {
        correlationId: context.correlationId,
        userId: context.userId,
      });

      if (!result.success) {
        throw new Error(result.error?.message ?? 'Failed to trigger workflow');
      }

      return result.result;
    }

    const workflowResult = await this.deps.workflowService.triggerWorkflow({
      workflow: args.workflow,
      payload: args.payload,
      ...(args.priority && { priority: args.priority }),
    });

    // Emit event
    await this.deps.eventStore.emit({
      type: 'WorkflowTriggered',
      correlationId: context.correlationId,
      payload: {
        workflow: args.workflow,
        taskId: workflowResult.taskId,
        priority: args.priority,
        source: 'ai-gateway',
      },
    });

    return workflowResult;
  }

  private async handleGetWorkflowStatus(
    args: GetWorkflowStatusArgs,
    context: FunctionContext
  ): Promise<unknown> {
    if (!this.deps.workflowService) {
      const result = await this.deps.queryBus.query(
        'GetWorkflowStatus',
        { taskId: args.taskId },
        {
          correlationId: context.correlationId,
        }
      );

      return result.data ?? { taskId: args.taskId, status: 'unknown' };
    }

    return this.deps.workflowService.getWorkflowStatus(args.taskId);
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createFunctionExecutor(deps: FunctionExecutorDeps): FunctionExecutor {
  return new FunctionExecutor(deps);
}
