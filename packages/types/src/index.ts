/**
 * MedicalCor Types Package
 *
 * Central type definitions and Zod schemas for the MedicalCor platform.
 * All schemas are consolidated in the schemas/ directory as the Single Source of Truth.
 */

// =============================================================================
// Consolidated Schemas (Single Source of Truth)
// =============================================================================
export {
  // Common/Validation
  PhoneNumberSchema,
  E164PhoneSchema,
  EmailSchema,
  UUIDSchema,
  TimestampSchema,
  CorrelationIdSchema,
  PaginationSchema,
  CursorPaginationSchema,
  PaginatedResponseSchema,
  type PhoneNumber,
  type E164Phone,
  type Email,
  type UUID,
  type Timestamp,
  type CorrelationId,
  type Pagination,
  type CursorPagination,
  type PaginatedResponse,

  // Lead/Patient
  LeadSourceSchema,
  LeadChannelSchema,
  LeadStatusSchema,
  LeadPrioritySchema,
  LeadScoreSchema,
  LeadClassificationSchema,
  UTMParamsSchema,
  AIScoringContextSchema,
  ScoringOutputSchema,
  PatientDemographicsSchema,
  MedicalContextSchema,
  ConversationEntrySchema,
  LeadContextSchema,
  CreateLeadContextSchema,
  UpdateLeadContextSchema,
  type LeadSource,
  type LeadChannel,
  type LeadStatus,
  type LeadPriority,
  type LeadScore,
  type LeadClassification,
  type UTMParams,
  type AIScoringContext,
  type ScoringOutput,
  type PatientDemographics,
  type MedicalContext,
  type ConversationEntry,
  type LeadContext,
  type CreateLeadContext,
  type UpdateLeadContext,

  // Voice/Telephony
  CallDirectionSchema,
  CallStatusSchema,
  VoiceEventTypeSchema,
  TranscriptSegmentSchema,
  RecordingMetadataSchema,
  VoiceEventSchema,
  TwilioBaseSchema,
  VoiceWebhookSchema,
  CallStatusCallbackSchema,
  TwilioStatusCallbackSchema,
  InitiateCallSchema,
  CallSummarySchema,
  type CallDirection,
  type CallStatus,
  type VoiceEventType,
  type TranscriptSegment,
  type RecordingMetadata,
  type VoiceEvent,
  type TwilioBase,
  type VoiceWebhook,
  type CallStatusCallback,
  type TwilioStatusCallback,
  type InitiateCall,
  type CallSummary,

  // WhatsApp
  WhatsAppMessageTypeSchema,
  WhatsAppTextSchema,
  WhatsAppMediaSchema,
  WhatsAppLocationSchema,
  WhatsAppInteractiveSchema,
  WhatsAppContactSchema,
  WhatsAppMessageSchema,
  WhatsAppStatusSchema,
  WhatsAppMetadataSchema,
  WhatsAppValueSchema,
  WhatsAppChangeSchema,
  WhatsAppEntrySchema,
  WhatsAppWebhookSchema,
  WhatsAppSendMessageSchema,
  NormalizedWhatsAppMessageSchema,
  type WhatsAppMessageType,
  type WhatsAppText,
  type WhatsAppMedia,
  type WhatsAppLocation,
  type WhatsAppInteractive,
  type WhatsAppContact,
  type WhatsAppMessage,
  type WhatsAppStatus,
  type WhatsAppMetadata,
  type WhatsAppValue,
  type WhatsAppChange,
  type WhatsAppEntry,
  type WhatsAppWebhook,
  type WhatsAppSendMessage,
  type NormalizedWhatsAppMessage,

  // Advanced Scoring
  ScoringDimensionSchema,
  RecommendedActionSchema,
  AdvancedScoringOutputSchema,
  ScoringRequestSchema,
  type ScoringDimension,
  type RecommendedAction,
  type AdvancedScoringOutput,
  type ScoringRequest,
} from './schemas/index.js';

// =============================================================================
// Stripe Schemas
// =============================================================================
export {
  StripeEventTypeSchema,
  PaymentIntentSchema,
  ChargeSchema,
  StripeCustomerSchema,
  InvoiceSchema,
  CheckoutSessionSchema,
  StripeWebhookEventSchema,
  PaymentEventSchema,
  type StripeEventType,
  type PaymentIntent,
  type Charge,
  type StripeCustomer,
  type Invoice,
  type CheckoutSession,
  type StripeWebhookEvent,
  type PaymentEvent,
} from './stripe.schema.js';

// =============================================================================
// HubSpot Schemas
// =============================================================================
export {
  HubSpotContactPropertiesSchema,
  HubSpotContactSchema,
  HubSpotContactInputSchema,
  HubSpotFilterSchema,
  HubSpotFilterGroupSchema,
  HubSpotSearchRequestSchema,
  HubSpotSearchResponseSchema,
  HubSpotTimelineEventSchema,
  HubSpotTaskSchema,
  type HubSpotContactProperties,
  type HubSpotContact,
  type HubSpotContactInput,
  type HubSpotFilter,
  type HubSpotFilterGroup,
  type HubSpotSearchRequest,
  type HubSpotSearchResponse,
  type HubSpotTimelineEvent,
  type HubSpotTask,
} from './hubspot.schema.js';

// =============================================================================
// Patient/Dashboard Schemas
// =============================================================================
export {
  PatientStatusSchema,
  PatientListItemSchema,
  RecentLeadSchema,
  DashboardStatsSchema,
  type PatientStatus,
  type PatientListItem,
  type RecentLead,
  type DashboardStats,
} from './patient.schema.js';

// =============================================================================
// Domain Events Schemas
// =============================================================================
export {
  EventBaseSchema,
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
  DomainEventSchema,
  type EventBase,
  type WhatsAppMessageReceivedEvent,
  type WhatsAppMessageSentEvent,
  type WhatsAppStatusUpdateEvent,
  type VoiceCallInitiatedEvent,
  type VoiceCallCompletedEvent,
  type VoiceTranscriptReadyEvent,
  type LeadCreatedEvent,
  type LeadScoredEvent,
  type LeadQualifiedEvent,
  type LeadAssignedEvent,
  type PaymentReceivedEvent,
  type PaymentFailedEvent,
  type AppointmentScheduledEvent,
  type AppointmentReminderSentEvent,
  type ConsentRecordedEvent,
  type DomainEvent,
} from './events.schema.js';

// =============================================================================
// Server Actions Schemas (Triage, Calendar, Analytics, Messages, Patient Detail)
// =============================================================================
export {
  // Triage schemas
  TriageLeadSchema,
  TriageColumnIdSchema,
  TriageColumnSchema,
  type TriageLead,
  type TriageColumnId,
  type TriageColumn,
  // Calendar schemas
  CalendarSlotSchema,
  type CalendarSlot,
  // Analytics schemas
  AnalyticsMetricsSchema,
  TimeSeriesPointSchema,
  LeadsBySourceSchema,
  ConversionFunnelStepSchema,
  TopProcedureSchema,
  OperatorPerformanceSchema,
  AnalyticsDataSchema,
  type AnalyticsMetrics,
  type TimeSeriesPoint,
  type LeadsBySource,
  type ConversionFunnelStep,
  type TopProcedure,
  type OperatorPerformance,
  type AnalyticsData,
  // Messages schemas
  ConversationChannelSchema,
  ConversationStatusSchema,
  MessageDirectionSchema,
  MessageDeliveryStatusSchema,
  LastMessageSchema,
  ConversationSchema,
  MessageSchema,
  type ConversationChannel,
  type ConversationStatus,
  type MessageDirection,
  type MessageDeliveryStatus,
  type LastMessage,
  type Conversation,
  type Message,
  // Patient detail schemas
  PatientDetailDataSchema,
  PatientTimelineEventSchema,
  type PatientDetailData,
  type PatientTimelineEvent,
} from './server-actions.schema.js';
