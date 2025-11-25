/**
 * Central export point for all domain schemas
 *
 * This is the Single Source of Truth for Zod schemas in the MedicalCor platform.
 * All schema imports should reference this file or its sub-modules.
 */

// =============================================================================
// Common/Validation Schemas
// =============================================================================
export {
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
} from "./common.js";

// =============================================================================
// Lead/Patient Schemas
// =============================================================================
export {
  // Lead source/channel
  LeadSourceSchema,
  LeadChannelSchema, // @deprecated - use LeadSourceSchema
  // Lead status and priority
  LeadStatusSchema,
  LeadPrioritySchema,
  // AI scoring
  LeadScoreSchema,
  LeadClassificationSchema,
  UTMParamsSchema,
  AIScoringContextSchema,
  ScoringOutputSchema,
  // Patient data
  PatientDemographicsSchema,
  MedicalContextSchema,
  ConversationEntrySchema,
  // Full domain model
  LeadContextSchema,
  CreateLeadContextSchema,
  UpdateLeadContextSchema,
  // Types
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
} from "./lead.js";

// =============================================================================
// Voice/Telephony Schemas
// =============================================================================
export {
  // Enums
  CallDirectionSchema,
  CallStatusSchema,
  VoiceEventTypeSchema,
  // Event data
  TranscriptSegmentSchema,
  RecordingMetadataSchema,
  VoiceEventSchema,
  // Twilio webhooks
  TwilioBaseSchema,
  VoiceWebhookSchema,
  CallStatusCallbackSchema,
  TwilioStatusCallbackSchema,
  // Operations
  InitiateCallSchema,
  CallSummarySchema,
  // Types
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
} from "./voice.js";

// =============================================================================
// WhatsApp Schemas
// =============================================================================
export {
  // Message types
  WhatsAppMessageTypeSchema,
  WhatsAppTextSchema,
  WhatsAppMediaSchema,
  WhatsAppLocationSchema,
  WhatsAppInteractiveSchema,
  WhatsAppContactSchema,
  WhatsAppMessageSchema,
  WhatsAppStatusSchema,
  WhatsAppMetadataSchema,
  // Webhook structures
  WhatsAppValueSchema,
  WhatsAppChangeSchema,
  WhatsAppEntrySchema,
  WhatsAppWebhookSchema,
  // Outbound operations
  WhatsAppSendMessageSchema,
  NormalizedWhatsAppMessageSchema,
  // Types
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
} from "./whatsapp.js";

// =============================================================================
// Advanced Scoring Schemas
// =============================================================================
export {
  ScoringDimensionSchema,
  RecommendedActionSchema,
  AdvancedScoringOutputSchema,
  ScoringRequestSchema,
  type ScoringDimension,
  type RecommendedAction,
  type AdvancedScoringOutput,
  type ScoringRequest,
} from "./scoring.js";
