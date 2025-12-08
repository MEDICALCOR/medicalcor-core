import { z } from 'zod';
import { LeadSourceSchema, LeadScoreSchema } from './schemas/lead.js';
import { CallDirectionSchema } from './schemas/voice.js';

// Use LeadSourceSchema as the canonical source for channels
const LeadChannelSchema = LeadSourceSchema;

/**
 * Domain Event Schemas
 * Event sourcing for audit trail and replay capability
 */

// Base event schema
export const EventBaseSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  correlationId: z.string(),
  idempotencyKey: z.string(),
  version: z.number().default(1),
});

// WhatsApp events
export const WhatsAppMessageReceivedEventSchema = EventBaseSchema.extend({
  type: z.literal('whatsapp.message.received'),
  payload: z.object({
    messageId: z.string(),
    from: z.string(),
    phoneNumberId: z.string(),
    messageType: z.string(),
    content: z.string().optional(),
    timestamp: z.string(),
  }),
});

export const WhatsAppMessageSentEventSchema = EventBaseSchema.extend({
  type: z.literal('whatsapp.message.sent'),
  payload: z.object({
    messageId: z.string(),
    to: z.string(),
    templateName: z.string().optional(),
    content: z.string().optional(),
  }),
});

export const WhatsAppStatusUpdateEventSchema = EventBaseSchema.extend({
  type: z.literal('whatsapp.status.updated'),
  payload: z.object({
    messageId: z.string(),
    status: z.enum(['sent', 'delivered', 'read', 'failed']),
    recipientId: z.string(),
  }),
});

// Voice events
export const VoiceCallInitiatedEventSchema = EventBaseSchema.extend({
  type: z.literal('voice.call.initiated'),
  payload: z.object({
    callSid: z.string(),
    from: z.string(),
    to: z.string(),
    direction: CallDirectionSchema,
  }),
});

export const VoiceCallCompletedEventSchema = EventBaseSchema.extend({
  type: z.literal('voice.call.completed'),
  payload: z.object({
    callSid: z.string(),
    duration: z.number(),
    status: z.string(),
    recordingUrl: z.string().optional(),
  }),
});

export const VoiceTranscriptReadyEventSchema = EventBaseSchema.extend({
  type: z.literal('voice.transcript.ready'),
  payload: z.object({
    callSid: z.string(),
    transcript: z.string(),
    language: z.string().optional(),
    sentiment: z.string().optional(),
  }),
});

// Lead events
export const LeadCreatedEventSchema = EventBaseSchema.extend({
  type: z.literal('lead.created'),
  payload: z.object({
    phone: z.string(),
    channel: LeadChannelSchema,
    hubspotContactId: z.string().optional(),
    source: z.string().optional(),
  }),
});

export const LeadScoredEventSchema = EventBaseSchema.extend({
  type: z.literal('lead.scored'),
  payload: z.object({
    phone: z.string(),
    hubspotContactId: z.string().optional(),
    score: z.number().min(1).max(5),
    classification: LeadScoreSchema,
    confidence: z.number(),
    reasoning: z.string(),
    previousScore: z.number().optional(),
  }),
});

export const LeadQualifiedEventSchema = EventBaseSchema.extend({
  type: z.literal('lead.qualified'),
  payload: z.object({
    phone: z.string(),
    hubspotContactId: z.string(),
    qualificationCriteria: z.array(z.string()),
  }),
});

export const LeadAssignedEventSchema = EventBaseSchema.extend({
  type: z.literal('lead.assigned'),
  payload: z.object({
    phone: z.string(),
    hubspotContactId: z.string(),
    assignedTo: z.string(),
    assignmentReason: z.string(),
  }),
});

// Payment events
export const PaymentReceivedEventSchema = EventBaseSchema.extend({
  type: z.literal('payment.received'),
  payload: z.object({
    stripePaymentId: z.string(),
    hubspotContactId: z.string().optional(),
    amount: z.number(),
    currency: z.string(),
    description: z.string().optional(),
  }),
});

export const PaymentFailedEventSchema = EventBaseSchema.extend({
  type: z.literal('payment.failed'),
  payload: z.object({
    stripePaymentId: z.string(),
    hubspotContactId: z.string().optional(),
    amount: z.number(),
    currency: z.string(),
    failureReason: z.string(),
  }),
});

// Appointment events
export const AppointmentScheduledEventSchema = EventBaseSchema.extend({
  type: z.literal('appointment.scheduled'),
  payload: z.object({
    appointmentId: z.string(),
    hubspotContactId: z.string(),
    scheduledAt: z.string().datetime(),
    procedureType: z.string(),
    clinicLocation: z.string().optional(),
  }),
});

export const AppointmentReminderSentEventSchema = EventBaseSchema.extend({
  type: z.literal('appointment.reminder.sent'),
  payload: z.object({
    appointmentId: z.string(),
    hubspotContactId: z.string(),
    channel: LeadChannelSchema,
    reminderType: z.enum(['24h', '2h', '1h']),
  }),
});

// Consent events
export const ConsentRecordedEventSchema = EventBaseSchema.extend({
  type: z.literal('consent.recorded'),
  payload: z.object({
    phone: z.string(),
    hubspotContactId: z.string().optional(),
    consentType: z.enum(['marketing', 'medical_data', 'communication']),
    granted: z.boolean(),
    consentText: z.string(),
    ipAddress: z.string().optional(),
  }),
});

// Queue breach events
const QueueBreachTypeEnum = z.enum([
  'wait_time_exceeded',
  'queue_size_exceeded',
  'abandon_rate_exceeded',
  'agent_availability_low',
  'service_level_missed',
]);

const QueueBreachSeverityEnum = z.enum(['warning', 'critical']);

export const QueueBreachDetectedEventSchema = EventBaseSchema.extend({
  type: z.literal('queue.breach.detected'),
  payload: z.object({
    breachId: z.string().uuid(),
    queueSid: z.string(),
    queueName: z.string(),
    breachType: QueueBreachTypeEnum,
    severity: QueueBreachSeverityEnum,
    thresholdValue: z.number(),
    currentValue: z.number(),
    affectedCalls: z.number().int().min(0).optional(),
    detectedAt: z.string().datetime(),
  }),
});

export const QueueBreachResolvedEventSchema = EventBaseSchema.extend({
  type: z.literal('queue.breach.resolved'),
  payload: z.object({
    breachId: z.string().uuid(),
    queueSid: z.string(),
    queueName: z.string().optional(),
    breachType: QueueBreachTypeEnum,
    durationSeconds: z.number().int().min(0),
    resolvedAt: z.string().datetime(),
    resolvedBy: z.string().optional(),
    resolutionNotes: z.string().optional(),
  }),
});

export const QueueBreachEscalatedEventSchema = EventBaseSchema.extend({
  type: z.literal('queue.breach.escalated'),
  payload: z.object({
    breachId: z.string().uuid(),
    queueSid: z.string(),
    escalationLevel: z.enum(['supervisor', 'manager', 'admin']),
    escalatedBy: z.string().optional(),
    reason: z.string(),
    notifyChannels: z.array(z.enum(['email', 'slack', 'sms', 'dashboard'])),
  }),
});

export const QueueBreachAcknowledgedEventSchema = EventBaseSchema.extend({
  type: z.literal('queue.breach.acknowledged'),
  payload: z.object({
    breachId: z.string().uuid(),
    queueSid: z.string(),
    acknowledgedBy: z.string(),
    acknowledgedAt: z.string().datetime(),
    notes: z.string().optional(),
  }),
});

export const QueueBreachAlertSentEventSchema = EventBaseSchema.extend({
  type: z.literal('queue.breach.alert_sent'),
  payload: z.object({
    breachId: z.string().uuid(),
    queueSid: z.string(),
    queueName: z.string(),
    breachType: QueueBreachTypeEnum,
    severity: QueueBreachSeverityEnum,
    channels: z.array(z.enum(['email', 'slack', 'sms', 'dashboard'])),
    recipientCount: z.number().int().min(0),
    sentAt: z.string().datetime(),
  }),
});

// Union of all domain events
export const DomainEventSchema = z.discriminatedUnion('type', [
  WhatsAppMessageReceivedEventSchema,
  WhatsAppMessageSentEventSchema,
  WhatsAppStatusUpdateEventSchema,
  VoiceCallInitiatedEventSchema,
  VoiceCallCompletedEventSchema,
  VoiceTranscriptReadyEventSchema,
  LeadCreatedEventSchema,
  LeadScoredEventSchema,
  LeadQualifiedEventSchema,
  LeadAssignedEventSchema,
  PaymentReceivedEventSchema,
  PaymentFailedEventSchema,
  AppointmentScheduledEventSchema,
  AppointmentReminderSentEventSchema,
  ConsentRecordedEventSchema,
  QueueBreachDetectedEventSchema,
  QueueBreachResolvedEventSchema,
  QueueBreachEscalatedEventSchema,
  QueueBreachAcknowledgedEventSchema,
  QueueBreachAlertSentEventSchema,
]);

// Inferred types
export type EventBase = z.infer<typeof EventBaseSchema>;
export type WhatsAppMessageReceivedEvent = z.infer<typeof WhatsAppMessageReceivedEventSchema>;
export type WhatsAppMessageSentEvent = z.infer<typeof WhatsAppMessageSentEventSchema>;
export type WhatsAppStatusUpdateEvent = z.infer<typeof WhatsAppStatusUpdateEventSchema>;
export type VoiceCallInitiatedEvent = z.infer<typeof VoiceCallInitiatedEventSchema>;
export type VoiceCallCompletedEvent = z.infer<typeof VoiceCallCompletedEventSchema>;
export type VoiceTranscriptReadyEvent = z.infer<typeof VoiceTranscriptReadyEventSchema>;
export type LeadCreatedEvent = z.infer<typeof LeadCreatedEventSchema>;
export type LeadScoredEvent = z.infer<typeof LeadScoredEventSchema>;
export type LeadQualifiedEvent = z.infer<typeof LeadQualifiedEventSchema>;
export type LeadAssignedEvent = z.infer<typeof LeadAssignedEventSchema>;
export type PaymentReceivedEvent = z.infer<typeof PaymentReceivedEventSchema>;
export type PaymentFailedEvent = z.infer<typeof PaymentFailedEventSchema>;
export type AppointmentScheduledEvent = z.infer<typeof AppointmentScheduledEventSchema>;
export type AppointmentReminderSentEvent = z.infer<typeof AppointmentReminderSentEventSchema>;
export type ConsentRecordedEvent = z.infer<typeof ConsentRecordedEventSchema>;
export type QueueBreachDetectedEvent = z.infer<typeof QueueBreachDetectedEventSchema>;
export type QueueBreachResolvedEvent = z.infer<typeof QueueBreachResolvedEventSchema>;
export type QueueBreachEscalatedEvent = z.infer<typeof QueueBreachEscalatedEventSchema>;
export type QueueBreachAcknowledgedEvent = z.infer<typeof QueueBreachAcknowledgedEventSchema>;
export type QueueBreachAlertSentEvent = z.infer<typeof QueueBreachAlertSentEventSchema>;
export type DomainEvent = z.infer<typeof DomainEventSchema>;
