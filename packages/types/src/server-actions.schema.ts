import { z } from 'zod';
import { LeadClassificationSchema, LeadSourceSchema } from './patient.schema.js';

/**
 * Server Actions Schemas
 *
 * Schemas for data structures used by Next.js Server Actions.
 * These types are shared between server and client components.
 */

// ============================================================================
// TRIAGE PAGE SCHEMAS
// ============================================================================

/**
 * Schema for a lead displayed in the Triage board
 */
export const TriageLeadSchema = z.object({
  id: z.string(),
  phone: z.string(),
  source: LeadSourceSchema,
  time: z.string(),
  message: z.string().optional(),
  score: z.number().optional(),
  confidence: z.number().optional(),
  reasoning: z.string().optional(),
  procedureInterest: z.array(z.string()).optional(),
  appointment: z.string().optional(),
});

/**
 * Schema for Triage board column IDs
 */
export const TriageColumnIdSchema = z.enum(['new', 'hot', 'warm', 'cold', 'scheduled']);

/**
 * Schema for a column in the Triage board
 */
export const TriageColumnSchema = z.object({
  id: TriageColumnIdSchema,
  title: z.string(),
  leads: z.array(TriageLeadSchema),
});

// ============================================================================
// CALENDAR PAGE SCHEMAS
// ============================================================================

/**
 * Schema for a calendar slot
 */
export const CalendarSlotSchema = z.object({
  id: z.string(),
  time: z.string(),
  duration: z.number(),
  available: z.boolean(),
  patient: z.string().optional(),
  procedure: z.string().optional(),
});

// ============================================================================
// ANALYTICS PAGE SCHEMAS
// ============================================================================

/**
 * Schema for analytics metrics summary
 */
export const AnalyticsMetricsSchema = z.object({
  totalLeads: z.number(),
  totalLeadsChange: z.number(),
  hotLeads: z.number(),
  hotLeadsChange: z.number(),
  appointmentsScheduled: z.number(),
  appointmentsChange: z.number(),
  conversionRate: z.number(),
  conversionRateChange: z.number(),
  avgResponseTime: z.number(),
  avgResponseTimeChange: z.number(),
  revenue: z.number(),
  revenueChange: z.number(),
});

/**
 * Schema for time series data point
 */
export const TimeSeriesPointSchema = z.object({
  date: z.string(),
  value: z.number(),
});

/**
 * Schema for leads grouped by source
 */
export const LeadsBySourceSchema = z.object({
  source: z.string(),
  count: z.number(),
  color: z.string(),
});

/**
 * Schema for conversion funnel step
 */
export const ConversionFunnelStepSchema = z.object({
  name: z.string(),
  count: z.number(),
  percentage: z.number(),
});

/**
 * Schema for top procedure
 */
export const TopProcedureSchema = z.object({
  procedure: z.string(),
  count: z.number(),
  revenue: z.number(),
});

/**
 * Schema for operator performance metrics
 */
export const OperatorPerformanceSchema = z.object({
  id: z.string(),
  name: z.string(),
  leadsHandled: z.number(),
  conversions: z.number(),
  conversionRate: z.number(),
  avgResponseTime: z.number(),
  satisfaction: z.number(),
});

/**
 * Schema for full analytics data response
 */
export const AnalyticsDataSchema = z.object({
  metrics: AnalyticsMetricsSchema,
  leadsOverTime: z.array(TimeSeriesPointSchema),
  appointmentsOverTime: z.array(TimeSeriesPointSchema),
  leadsBySource: z.array(LeadsBySourceSchema),
  conversionFunnel: z.array(ConversionFunnelStepSchema),
  topProcedures: z.array(TopProcedureSchema),
  operatorPerformance: z.array(OperatorPerformanceSchema),
});

// ============================================================================
// MESSAGES PAGE SCHEMAS
// ============================================================================

/**
 * Schema for conversation channel
 */
export const ConversationChannelSchema = z.enum(['whatsapp', 'sms', 'email']);

/**
 * Schema for conversation status
 */
export const ConversationStatusSchema = z.enum(['active', 'waiting', 'resolved', 'archived']);

/**
 * Schema for message direction
 */
export const MessageDirectionSchema = z.enum(['IN', 'OUT']);

/**
 * Schema for message delivery status
 */
export const MessageDeliveryStatusSchema = z.enum(['sent', 'delivered', 'read']);

/**
 * Schema for last message in a conversation
 */
export const LastMessageSchema = z.object({
  content: z.string(),
  direction: MessageDirectionSchema,
  timestamp: z.date(),
});

/**
 * Schema for a conversation
 */
export const ConversationSchema = z.object({
  id: z.string(),
  patientName: z.string(),
  phone: z.string(),
  channel: ConversationChannelSchema,
  status: ConversationStatusSchema,
  unreadCount: z.number(),
  lastMessage: LastMessageSchema,
  updatedAt: z.date(),
});

/**
 * Schema for a message
 */
export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  content: z.string(),
  direction: MessageDirectionSchema,
  status: MessageDeliveryStatusSchema,
  timestamp: z.date(),
  senderName: z.string().optional(),
});

// ============================================================================
// PATIENT DETAIL SCHEMAS
// ============================================================================

/**
 * Schema for patient detail data
 */
export const PatientDetailDataSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string(),
  email: z.string().optional(),
  lifecycleStage: z.string().optional(),
  leadScore: z.number().optional(),
  classification: LeadClassificationSchema,
  source: LeadSourceSchema,
  procedureInterest: z.array(z.string()).optional(),
  language: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  hubspotContactId: z.string(),
});

/**
 * Schema for patient timeline event
 */
export const PatientTimelineEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.string(),
  data: z.record(z.unknown()),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

// Triage types
export type TriageLead = z.infer<typeof TriageLeadSchema>;
export type TriageColumnId = z.infer<typeof TriageColumnIdSchema>;
export type TriageColumn = z.infer<typeof TriageColumnSchema>;

// Calendar types
export type CalendarSlot = z.infer<typeof CalendarSlotSchema>;

// Analytics types
export type AnalyticsMetrics = z.infer<typeof AnalyticsMetricsSchema>;
export type TimeSeriesPoint = z.infer<typeof TimeSeriesPointSchema>;
export type LeadsBySource = z.infer<typeof LeadsBySourceSchema>;
export type ConversionFunnelStep = z.infer<typeof ConversionFunnelStepSchema>;
export type TopProcedure = z.infer<typeof TopProcedureSchema>;
export type OperatorPerformance = z.infer<typeof OperatorPerformanceSchema>;
export type AnalyticsData = z.infer<typeof AnalyticsDataSchema>;

// Messages types
export type ConversationChannel = z.infer<typeof ConversationChannelSchema>;
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>;
export type MessageDirection = z.infer<typeof MessageDirectionSchema>;
export type MessageDeliveryStatus = z.infer<typeof MessageDeliveryStatusSchema>;
export type LastMessage = z.infer<typeof LastMessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type Message = z.infer<typeof MessageSchema>;

// Patient detail types
export type PatientDetailData = z.infer<typeof PatientDetailDataSchema>;
export type PatientTimelineEvent = z.infer<typeof PatientTimelineEventSchema>;
