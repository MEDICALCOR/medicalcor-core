/**
 * Voice/Twilio Webhook Schemas
 *
 * @deprecated Import from '@medicalcor/types' or './schemas/voice.js' instead.
 * This file re-exports from the consolidated schema for backward compatibility.
 */

// Re-export all voice schemas from the Single Source of Truth
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
} from './schemas/voice.js';
