/**
 * CQRS Commands - Domain Command Definitions and Handlers
 *
 * Complete set of commands for the medical CRM domain:
 * - Lead management (scoring, qualification, assignment)
 * - Patient management (CRUD operations)
 * - Appointment management (scheduling, cancellation)
 * - Messaging (WhatsApp)
 * - Consent management (GDPR)
 * - Workflow triggers
 */

import { z } from 'zod';
import { defineCommand, type CommandHandler } from './command-bus.js';
import { LeadAggregate, LeadRepository } from './aggregate.js';

// ============================================================================
// LEAD COMMANDS
// ============================================================================

export const CreateLeadCommand = defineCommand(
  'CreateLead',
  z.object({
    phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Phone must be E.164 format'),
    channel: z.enum(['whatsapp', 'voice', 'web', 'referral']),
    utmParams: z
      .object({
        source: z.string().optional(),
        medium: z.string().optional(),
        campaign: z.string().optional(),
      })
      .optional(),
    metadata: z.record(z.unknown()).optional(),
  })
);

export const ScoreLeadCommand = defineCommand(
  'ScoreLead',
  z.object({
    phone: z.string(),
    channel: z.enum(['whatsapp', 'voice', 'web', 'referral']),
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string(),
          timestamp: z.string().optional(),
        })
      )
      .optional(),
    utmParams: z.record(z.string()).optional(),
    useAI: z.boolean().default(true),
  })
);

export const QualifyLeadCommand = defineCommand(
  'QualifyLead',
  z.object({
    leadId: z.string(),
    classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
    reason: z.string().optional(),
  })
);

export const AssignLeadCommand = defineCommand(
  'AssignLead',
  z.object({
    leadId: z.string(),
    assigneeId: z.string(),
    assigneeEmail: z.string().email().optional(),
    priority: z.enum(['high', 'normal', 'low']).default('normal'),
  })
);

export const ConvertLeadCommand = defineCommand(
  'ConvertLead',
  z.object({
    leadId: z.string(),
    hubspotContactId: z.string(),
    appointmentId: z.string().optional(),
  })
);

export const MarkLeadLostCommand = defineCommand(
  'MarkLeadLost',
  z.object({
    leadId: z.string(),
    reason: z.string(),
    competitorMention: z.string().optional(),
  })
);

// ============================================================================
// PATIENT COMMANDS
// ============================================================================

export const CreatePatientCommand = defineCommand(
  'CreatePatient',
  z.object({
    phone: z.string(),
    email: z.string().email().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.string().optional(),
    source: z.enum(['whatsapp', 'voice', 'web', 'referral', 'hubspot']),
    hubspotContactId: z.string().optional(),
  })
);

export const UpdatePatientCommand = defineCommand(
  'UpdatePatient',
  z.object({
    patientId: z.string(),
    updates: z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      dateOfBirth: z.string().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string()).optional(),
    }),
  })
);

export const MergePatientCommand = defineCommand(
  'MergePatient',
  z.object({
    primaryPatientId: z.string(),
    secondaryPatientId: z.string(),
    mergeStrategy: z.enum(['keep_primary', 'keep_newest', 'merge_all']).default('merge_all'),
  })
);

// ============================================================================
// APPOINTMENT COMMANDS
// ============================================================================

export const ScheduleAppointmentCommand = defineCommand(
  'ScheduleAppointment',
  z.object({
    patientId: z.string(),
    doctorId: z.string().optional(),
    serviceType: z.string(),
    preferredDate: z.string(),
    preferredTimeSlot: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
    duration: z.number().min(15).max(180).default(30),
    notes: z.string().optional(),
    urgency: z.enum(['normal', 'urgent', 'emergency']).default('normal'),
  })
);

export const RescheduleAppointmentCommand = defineCommand(
  'RescheduleAppointment',
  z.object({
    appointmentId: z.string(),
    newDate: z.string(),
    newTimeSlot: z.enum(['morning', 'afternoon', 'evening', 'any']).optional(),
    reason: z.string().optional(),
    notifyPatient: z.boolean().default(true),
  })
);

export const CancelAppointmentCommand = defineCommand(
  'CancelAppointment',
  z.object({
    appointmentId: z.string(),
    reason: z.string().optional(),
    notifyPatient: z.boolean().default(true),
    initiatedBy: z.enum(['patient', 'clinic', 'system']).default('system'),
  })
);

export const CompleteAppointmentCommand = defineCommand(
  'CompleteAppointment',
  z.object({
    appointmentId: z.string(),
    outcome: z.enum(['completed', 'no_show', 'cancelled_late']),
    notes: z.string().optional(),
    followUpRequired: z.boolean().default(false),
    nextAppointmentDate: z.string().optional(),
  })
);

// ============================================================================
// MESSAGING COMMANDS
// ============================================================================

export const SendWhatsAppMessageCommand = defineCommand(
  'SendWhatsAppMessage',
  z.object({
    to: z.string().regex(/^\+[1-9]\d{1,14}$/),
    message: z.string().optional(),
    templateName: z.string().optional(),
    templateParams: z.record(z.string()).optional(),
    replyTo: z.string().optional(),
    priority: z.enum(['high', 'normal', 'low']).default('normal'),
  })
);

export const MarkMessageReadCommand = defineCommand(
  'MarkMessageRead',
  z.object({
    messageId: z.string(),
    readAt: z.string().optional(),
  })
);

// ============================================================================
// CONSENT COMMANDS
// ============================================================================

export const RecordConsentCommand = defineCommand(
  'RecordConsent',
  z.object({
    patientId: z.string(),
    phone: z.string(),
    consentType: z.enum([
      'data_processing',
      'marketing_whatsapp',
      'marketing_email',
      'marketing_sms',
      'appointment_reminders',
      'treatment_updates',
      'third_party_sharing',
    ]),
    status: z.enum(['granted', 'denied', 'withdrawn']),
    source: z.string(),
    ipAddress: z.string().optional(),
    consentText: z.string().optional(),
  })
);

export const WithdrawConsentCommand = defineCommand(
  'WithdrawConsent',
  z.object({
    patientId: z.string(),
    phone: z.string(),
    consentTypes: z.array(
      z.enum([
        'data_processing',
        'marketing_whatsapp',
        'marketing_email',
        'marketing_sms',
        'appointment_reminders',
        'treatment_updates',
        'third_party_sharing',
      ])
    ),
    reason: z.string().optional(),
  })
);

// ============================================================================
// WORKFLOW COMMANDS
// ============================================================================

export const TriggerWorkflowCommand = defineCommand(
  'TriggerWorkflow',
  z.object({
    workflow: z.enum(['lead-scoring', 'patient-journey', 'nurture-sequence', 'booking-agent']),
    payload: z.record(z.unknown()),
    priority: z.enum(['low', 'normal', 'high']).default('normal'),
    scheduledFor: z.string().optional(),
    idempotencyKey: z.string().optional(),
  })
);

// ============================================================================
// COMMAND HANDLERS
// ============================================================================

/**
 * Create Lead command handler
 */
export const createLeadHandler: CommandHandler<
  z.infer<typeof CreateLeadCommand.schema>,
  { leadId: string; status: string }
> = async (command, context) => {
  const { phone, channel, utmParams } = command.payload;

  // Check if lead already exists
  const leadRepo = new LeadRepository(context.eventStore, context.projectionClient);
  const existingLead = await leadRepo.findByPhone(phone);

  if (existingLead) {
    return {
      success: true,
      commandId: command.metadata.commandId,
      aggregateId: existingLead.id,
      result: {
        leadId: existingLead.id,
        status: 'already_exists',
      },
      executionTimeMs: 0,
    };
  }

  // Create new lead
  const leadId = phone; // Use phone as aggregate ID for easy lookup
  const lead = LeadAggregate.create(leadId, phone, channel, context.correlationId);

  // Save the aggregate
  await leadRepo.save(lead);

  // Emit additional event with UTM data if provided
  if (utmParams) {
    await context.eventStore.emit({
      type: 'LeadUtmTracked',
      correlationId: context.correlationId,
      aggregateId: leadId,
      aggregateType: 'Lead',
      payload: {
        phone,
        ...utmParams,
      },
    });
  }

  return {
    success: true,
    commandId: command.metadata.commandId,
    aggregateId: leadId,
    version: lead.version,
    result: {
      leadId,
      status: 'created',
    },
    executionTimeMs: 0,
  };
};

/**
 * Score Lead command handler
 */
export const scoreLeadHandler: CommandHandler<
  z.infer<typeof ScoreLeadCommand.schema>,
  {
    score: number;
    classification: string;
    confidence: number;
    reasoning: string;
  }
> = async (command, context) => {
  const { phone, channel, messages } = command.payload;

  // Get or create lead
  const leadRepo = new LeadRepository(context.eventStore, context.projectionClient);
  let lead = await leadRepo.findByPhone(phone);

  if (!lead) {
    // Create lead first
    lead = LeadAggregate.create(phone, phone, channel, context.correlationId);
    await leadRepo.save(lead);
  }

  // Simple rule-based scoring (in production, would call AI service)
  const allContent =
    messages
      ?.map((m) => m.content)
      .join(' ')
      .toLowerCase() ?? '';

  let score = 2;
  let classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED' = 'COLD';
  let reasoning = 'Default scoring';

  // Scoring rules
  if (
    allContent.includes('all-on-4') ||
    allContent.includes('all-on-x') ||
    allContent.includes('implant')
  ) {
    score = 4;
    classification = 'HOT';
    reasoning = 'High-value procedure interest detected';

    if (allContent.includes('pret') || allContent.includes('cost') || allContent.includes('euro')) {
      score = 5;
      reasoning = 'High-value procedure + budget discussion';
    }
  } else if (allContent.includes('programare') || allContent.includes('appointment')) {
    score = 4;
    classification = 'HOT';
    reasoning = 'Appointment request detected';
  } else if (allContent.includes('albire') || allContent.includes('cleaning')) {
    score = 3;
    classification = 'WARM';
    reasoning = 'Standard procedure interest';
  }

  // Apply scoring to aggregate
  lead.score(score, classification, context.correlationId);
  await leadRepo.save(lead);

  return {
    success: true,
    commandId: command.metadata.commandId,
    aggregateId: phone,
    version: lead.version,
    result: {
      score,
      classification,
      confidence: 0.85,
      reasoning,
    },
    executionTimeMs: 0,
  };
};

/**
 * Qualify Lead command handler
 */
export const qualifyLeadHandler: CommandHandler<
  z.infer<typeof QualifyLeadCommand.schema>,
  { qualified: boolean }
> = async (command, context) => {
  const { leadId, classification } = command.payload;

  const leadRepo = new LeadRepository(context.eventStore, context.projectionClient);
  const lead = await leadRepo.getById(leadId);

  if (!lead) {
    return {
      success: false,
      commandId: command.metadata.commandId,
      error: {
        code: 'LEAD_NOT_FOUND',
        message: `Lead ${leadId} not found`,
      },
      executionTimeMs: 0,
    };
  }

  lead.qualify(classification, context.correlationId);
  await leadRepo.save(lead);

  return {
    success: true,
    commandId: command.metadata.commandId,
    aggregateId: leadId,
    version: lead.version,
    result: { qualified: true },
    executionTimeMs: 0,
  };
};

/**
 * Assign Lead command handler
 */
export const assignLeadHandler: CommandHandler<
  z.infer<typeof AssignLeadCommand.schema>,
  { assigned: boolean }
> = async (command, context) => {
  const { leadId, assigneeId } = command.payload;

  const leadRepo = new LeadRepository(context.eventStore, context.projectionClient);
  const lead = await leadRepo.getById(leadId);

  if (!lead) {
    return {
      success: false,
      commandId: command.metadata.commandId,
      error: {
        code: 'LEAD_NOT_FOUND',
        message: `Lead ${leadId} not found`,
      },
      executionTimeMs: 0,
    };
  }

  lead.assign(assigneeId, context.correlationId);
  await leadRepo.save(lead);

  return {
    success: true,
    commandId: command.metadata.commandId,
    aggregateId: leadId,
    version: lead.version,
    result: { assigned: true },
    executionTimeMs: 0,
  };
};

/**
 * Convert Lead command handler
 */
export const convertLeadHandler: CommandHandler<
  z.infer<typeof ConvertLeadCommand.schema>,
  { converted: boolean; patientId: string }
> = async (command, context) => {
  const { leadId, hubspotContactId } = command.payload;

  const leadRepo = new LeadRepository(context.eventStore, context.projectionClient);
  const lead = await leadRepo.getById(leadId);

  if (!lead) {
    return {
      success: false,
      commandId: command.metadata.commandId,
      error: {
        code: 'LEAD_NOT_FOUND',
        message: `Lead ${leadId} not found`,
      },
      executionTimeMs: 0,
    };
  }

  lead.convert(hubspotContactId, context.correlationId);
  await leadRepo.save(lead);

  // Emit patient creation event
  await context.eventStore.emit({
    type: 'PatientCreatedFromLead',
    correlationId: context.correlationId,
    aggregateId: hubspotContactId,
    aggregateType: 'Patient',
    payload: {
      patientId: hubspotContactId,
      leadId,
      phone: lead.getState().phone,
      channel: lead.getState().channel,
    },
  });

  return {
    success: true,
    commandId: command.metadata.commandId,
    aggregateId: leadId,
    version: lead.version,
    result: {
      converted: true,
      patientId: hubspotContactId,
    },
    executionTimeMs: 0,
  };
};

/**
 * Schedule Appointment command handler
 */
export const scheduleAppointmentHandler: CommandHandler<
  z.infer<typeof ScheduleAppointmentCommand.schema>,
  { appointmentId: string; status: string; dateTime: string }
> = async (command, context) => {
  const { patientId, serviceType, preferredDate, preferredTimeSlot, duration, notes, urgency } =
    command.payload;

  const appointmentId = `apt-${crypto.randomUUID().slice(0, 8)}`;

  // In production, this would check availability and assign a slot
  const dateTime = `${preferredDate}T${preferredTimeSlot === 'morning' ? '10:00' : preferredTimeSlot === 'afternoon' ? '14:00' : '17:00'}:00Z`;

  // Emit event
  await context.eventStore.emit({
    type: 'AppointmentScheduled',
    correlationId: context.correlationId,
    aggregateId: appointmentId,
    aggregateType: 'Appointment',
    payload: {
      appointmentId,
      patientId,
      serviceType,
      dateTime,
      duration,
      notes,
      urgency,
      status: 'confirmed',
    },
  });

  return {
    success: true,
    commandId: command.metadata.commandId,
    aggregateId: appointmentId,
    result: {
      appointmentId,
      status: 'confirmed',
      dateTime,
    },
    executionTimeMs: 0,
  };
};

/**
 * Cancel Appointment command handler
 */
export const cancelAppointmentHandler: CommandHandler<
  z.infer<typeof CancelAppointmentCommand.schema>,
  { cancelled: boolean }
> = async (command, context) => {
  const { appointmentId, reason, notifyPatient, initiatedBy } = command.payload;

  // Emit cancellation event
  await context.eventStore.emit({
    type: 'AppointmentCancelled',
    correlationId: context.correlationId,
    aggregateId: appointmentId,
    aggregateType: 'Appointment',
    payload: {
      appointmentId,
      reason,
      initiatedBy,
      notifiedPatient: notifyPatient,
      cancelledAt: new Date().toISOString(),
    },
  });

  return {
    success: true,
    commandId: command.metadata.commandId,
    aggregateId: appointmentId,
    result: { cancelled: true },
    executionTimeMs: 0,
  };
};

/**
 * Record Consent command handler
 */
export const recordConsentHandler: CommandHandler<
  z.infer<typeof RecordConsentCommand.schema>,
  { consentId: string; recordedAt: string }
> = async (command, context) => {
  const { patientId, phone, consentType, status, source, ipAddress, consentText } = command.payload;

  const consentId = `cons-${crypto.randomUUID().slice(0, 8)}`;
  const recordedAt = new Date().toISOString();

  // Emit event for GDPR audit trail
  await context.eventStore.emit({
    type: 'ConsentRecorded',
    correlationId: context.correlationId,
    aggregateId: patientId,
    aggregateType: 'Consent',
    payload: {
      consentId,
      patientId,
      phone,
      consentType,
      status,
      source,
      ipAddress,
      consentText,
      recordedAt,
      version: 1,
    },
  });

  return {
    success: true,
    commandId: command.metadata.commandId,
    aggregateId: patientId,
    result: {
      consentId,
      recordedAt,
    },
    executionTimeMs: 0,
  };
};

/**
 * Send WhatsApp Message command handler
 */
export const sendWhatsAppMessageHandler: CommandHandler<
  z.infer<typeof SendWhatsAppMessageCommand.schema>,
  { messageId: string; status: string }
> = async (command, context) => {
  const { to, message, templateName, templateParams } = command.payload;

  const messageId = `msg-${crypto.randomUUID().slice(0, 8)}`;

  // Emit event (in production, would integrate with WhatsApp API)
  await context.eventStore.emit({
    type: 'WhatsAppMessageSent',
    correlationId: context.correlationId,
    aggregateId: to,
    payload: {
      messageId,
      to,
      message,
      templateName,
      templateParams,
      sentAt: new Date().toISOString(),
      status: 'sent',
    },
  });

  return {
    success: true,
    commandId: command.metadata.commandId,
    result: {
      messageId,
      status: 'sent',
    },
    executionTimeMs: 0,
  };
};

/**
 * Trigger Workflow command handler
 */
export const triggerWorkflowHandler: CommandHandler<
  z.infer<typeof TriggerWorkflowCommand.schema>,
  { taskId: string; status: string }
> = async (command, context) => {
  const { workflow, payload, priority } = command.payload;

  const taskId = `task-${crypto.randomUUID().slice(0, 8)}`;

  // Emit event (in production, would trigger Trigger.dev workflow)
  await context.eventStore.emit({
    type: 'WorkflowTriggered',
    correlationId: context.correlationId,
    payload: {
      taskId,
      workflow,
      workflowPayload: payload,
      priority,
      triggeredAt: new Date().toISOString(),
    },
  });

  return {
    success: true,
    commandId: command.metadata.commandId,
    result: {
      taskId,
      status: 'queued',
    },
    executionTimeMs: 0,
  };
};

// ============================================================================
// HANDLER REGISTRATION
// ============================================================================

export interface CommandHandlerRegistry {
  handlers: Map<string, CommandHandler<unknown, unknown>>;
  schemas: Map<string, z.ZodSchema>;
}

/**
 * Get all command handlers for registration
 */
export function getCommandHandlers(): CommandHandlerRegistry {
  return {
    handlers: new Map<string, CommandHandler<unknown, unknown>>([
      ['CreateLead', createLeadHandler as CommandHandler<unknown, unknown>],
      ['ScoreLead', scoreLeadHandler as CommandHandler<unknown, unknown>],
      ['QualifyLead', qualifyLeadHandler as CommandHandler<unknown, unknown>],
      ['AssignLead', assignLeadHandler as CommandHandler<unknown, unknown>],
      ['ConvertLead', convertLeadHandler as CommandHandler<unknown, unknown>],
      ['ScheduleAppointment', scheduleAppointmentHandler as CommandHandler<unknown, unknown>],
      ['CancelAppointment', cancelAppointmentHandler as CommandHandler<unknown, unknown>],
      ['RecordConsent', recordConsentHandler as CommandHandler<unknown, unknown>],
      ['SendWhatsAppMessage', sendWhatsAppMessageHandler as CommandHandler<unknown, unknown>],
      ['TriggerWorkflow', triggerWorkflowHandler as CommandHandler<unknown, unknown>],
    ]),
    schemas: new Map<string, z.ZodSchema>([
      ['CreateLead', CreateLeadCommand.schema],
      ['ScoreLead', ScoreLeadCommand.schema],
      ['QualifyLead', QualifyLeadCommand.schema],
      ['AssignLead', AssignLeadCommand.schema],
      ['ConvertLead', ConvertLeadCommand.schema],
      ['ScheduleAppointment', ScheduleAppointmentCommand.schema],
      ['CancelAppointment', CancelAppointmentCommand.schema],
      ['RecordConsent', RecordConsentCommand.schema],
      ['SendWhatsAppMessage', SendWhatsAppMessageCommand.schema],
      ['TriggerWorkflow', TriggerWorkflowCommand.schema],
    ]),
  };
}
