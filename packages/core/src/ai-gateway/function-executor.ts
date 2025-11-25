/**
 * AI-First API Gateway - Function Executor
 *
 * Executes AI function calls by connecting to actual domain services.
 * Uses dependency injection for testability and loose coupling.
 *
 * This is the "quantum leap" - making LLMs fully operational against
 * the medical CRM with type-safe, validated function calling.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-explicit-any */

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
// FUNCTION EXECUTOR IMPLEMENTATION
// ============================================================================

export class FunctionExecutor {
  constructor(private deps: FunctionExecutorDeps) {}

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
      // Get the appropriate handler
      const handler = this.getHandler(functionName);
      if (!handler) {
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

      // Validate input - schema may be undefined for dynamic function names
      const schema = FUNCTION_INPUT_SCHEMAS[functionName as keyof typeof FUNCTION_INPUT_SCHEMAS];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (schema) {
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
        args = validation.data;
      }

      // Execute the handler
      const result = await handler(args, context);

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
        // Note: In production, this would emit to monitoring/alerting systems
        console.warn('[AI Output Validation]', {
          functionName,
          traceId: context.traceId,
          correlationId: context.correlationId,
          errors: outputValidation.errors,
          warnings: outputValidation.warnings,
        });

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
   * Get handler for a function
   */
  private getHandler(
    functionName: string
  ): ((args: Record<string, unknown>, context: FunctionContext) => Promise<unknown>) | null {
    const handlers: Record<string, (args: any, context: FunctionContext) => Promise<unknown>> = {
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

    return handlers[functionName] ?? null;
  }

  // ============================================================================
  // LEAD FUNCTIONS
  // ============================================================================

  private async handleScoreLead(args: any, context: FunctionContext): Promise<unknown> {
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
        const reasoningValidation = validateAIReasoning((result.result as any).reasoning);
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
      messageHistory: args.messages?.map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      utm: args.utmParams,
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

  private async handleGetPatient(args: any, context: FunctionContext): Promise<unknown> {
    // Try HubSpot service first
    if (this.deps.hubspotService) {
      const contact = await this.deps.hubspotService.getContact({
        phone: args.phone,
        email: args.email,
        contactId: args.patientId,
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

  private async handleUpdatePatient(args: any, context: FunctionContext): Promise<unknown> {
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

  private async handleScheduleAppointment(args: any, context: FunctionContext): Promise<unknown> {
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
      preferredTimeSlot: args.preferredTimeSlot,
      duration: args.duration,
      notes: args.notes,
      urgency: args.urgency,
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

  private async handleGetAvailableSlots(args: any, context: FunctionContext): Promise<unknown> {
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
      doctorId: args.doctorId,
      serviceType: args.serviceType,
      duration: args.duration,
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

  private async handleCancelAppointment(args: any, context: FunctionContext): Promise<unknown> {
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
      reason: args.reason,
      notifyPatient: args.notifyPatient,
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

  private async handleSendWhatsApp(args: any, context: FunctionContext): Promise<unknown> {
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
      message: args.message,
      templateName: args.templateName,
      templateParams: args.templateParams,
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

  private async handleRecordConsent(args: any, context: FunctionContext): Promise<unknown> {
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
      ipAddress: args.ipAddress,
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

  private async handleCheckConsent(args: any, context: FunctionContext): Promise<unknown> {
    if (!this.deps.consentService) {
      const result = await this.deps.queryBus.query('CheckConsent', args, {
        correlationId: context.correlationId,
      });

      return result.data ?? { consents: [], message: 'Consent service not available' };
    }

    return this.deps.consentService.checkConsent({
      patientId: args.patientId,
      phone: args.phone,
      consentTypes: args.consentTypes,
    });
  }

  // ============================================================================
  // ANALYTICS FUNCTIONS
  // ============================================================================

  private async handleGetLeadAnalytics(args: any, context: FunctionContext): Promise<unknown> {
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

  private async handleTriggerWorkflow(args: any, context: FunctionContext): Promise<unknown> {
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
      priority: args.priority,
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

  private async handleGetWorkflowStatus(args: any, context: FunctionContext): Promise<unknown> {
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
