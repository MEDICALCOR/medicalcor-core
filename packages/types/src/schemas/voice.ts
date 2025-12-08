/**
 * Voice/Telephony event schemas (Twilio/Vapi compatible)
 */
import { z } from 'zod';

import { E164PhoneSchema, TimestampSchema, UUIDSchema } from './common.js';

/**
 * Voice call direction (Twilio-compatible values)
 * - inbound: Incoming call to the Twilio number
 * - outbound: Generic outbound call
 * - outbound-api: Outbound call initiated via REST API
 * - outbound-dial: Outbound call initiated via TwiML <Dial>
 */
export const CallDirectionSchema = z.enum(['inbound', 'outbound', 'outbound-api', 'outbound-dial']);

/**
 * Voice call status
 */
export const CallStatusSchema = z.enum([
  'queued',
  'ringing',
  'in-progress',
  'completed',
  'busy',
  'failed',
  'no-answer',
  'canceled',
]);

/**
 * Voice event types
 */
export const VoiceEventTypeSchema = z.enum([
  'call.initiated',
  'call.ringing',
  'call.answered',
  'call.completed',
  'call.failed',
  'transcript.partial',
  'transcript.final',
  'speech.started',
  'speech.ended',
  'dtmf.received',
  'recording.available',
  'voicemail.detected',
]);

/**
 * Transcription segment
 */
export const TranscriptSegmentSchema = z.object({
  id: UUIDSchema,
  speaker: z.enum(['patient', 'assistant', 'agent']),
  text: z.string(),
  confidence: z.number().min(0).max(1),
  startTime: z.number(),
  endTime: z.number(),
  isFinal: z.boolean(),
});

/**
 * Call recording metadata
 */
export const RecordingMetadataSchema = z.object({
  recordingId: z.string(),
  recordingUrl: z.string().url(),
  duration: z.number().positive(),
  format: z.enum(['mp3', 'wav']),
  size: z.number().positive(),
});

/**
 * Core Voice Event schema
 */
export const VoiceEventSchema = z.object({
  id: UUIDSchema,
  callSid: z.string(),
  eventType: VoiceEventTypeSchema,
  timestamp: TimestampSchema,

  // Call participants
  from: E164PhoneSchema,
  to: E164PhoneSchema,
  direction: CallDirectionSchema,

  // Call state
  status: CallStatusSchema.optional(),
  duration: z.number().optional(),

  // Transcription (for transcript events)
  transcript: TranscriptSegmentSchema.optional(),

  // Recording (for recording events)
  recording: RecordingMetadataSchema.optional(),

  // DTMF (for dtmf events)
  dtmfDigits: z.string().optional(),

  // Error info (for failed events)
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),

  // Raw provider payload
  raw: z.record(z.unknown()).optional(),
});

// =============================================================================
// Twilio Webhook Schemas
// =============================================================================

/**
 * Base Twilio webhook parameters (present in all webhooks)
 */
export const TwilioBaseSchema = z.object({
  AccountSid: z.string(),
  ApiVersion: z.string(),
});

/**
 * Full Twilio Voice webhook (incoming call)
 * Contains all geo-location fields from Twilio
 */
export const VoiceWebhookSchema = TwilioBaseSchema.extend({
  CallSid: z.string(),
  CallStatus: CallStatusSchema,
  Called: z.string(),
  CalledCity: z.string().optional(),
  CalledCountry: z.string().optional(),
  CalledState: z.string().optional(),
  CalledZip: z.string().optional(),
  Caller: z.string(),
  CallerCity: z.string().optional(),
  CallerCountry: z.string().optional(),
  CallerState: z.string().optional(),
  CallerZip: z.string().optional(),
  Direction: CallDirectionSchema,
  From: z.string(),
  FromCity: z.string().optional(),
  FromCountry: z.string().optional(),
  FromState: z.string().optional(),
  FromZip: z.string().optional(),
  To: z.string(),
  ToCity: z.string().optional(),
  ToCountry: z.string().optional(),
  ToState: z.string().optional(),
  ToZip: z.string().optional(),
});

/**
 * Twilio status callback webhook (call progress updates)
 */
export const CallStatusCallbackSchema = VoiceWebhookSchema.extend({
  CallDuration: z.string().optional(),
  Duration: z.string().optional(),
  Timestamp: z.string().optional(),
  CallbackSource: z.string().optional(),
  SequenceNumber: z.string().optional(),
  RecordingUrl: z.string().optional(),
  RecordingSid: z.string().optional(),
  RecordingDuration: z.string().optional(),
});

/**
 * Simple Twilio status callback (subset for quick parsing)
 */
export const TwilioStatusCallbackSchema = z.object({
  AccountSid: z.string(),
  ApiVersion: z.string(),
  CallSid: z.string(),
  CallStatus: z.string(),
  Called: z.string(),
  Caller: z.string(),
  Direction: z.string(),
  From: z.string(),
  To: z.string(),
  CallDuration: z.string().optional(),
  RecordingUrl: z.string().optional(),
  RecordingSid: z.string().optional(),
  RecordingDuration: z.string().optional(),
});

/**
 * Outbound call request
 */
export const InitiateCallSchema = z.object({
  to: E164PhoneSchema,
  from: E164PhoneSchema.optional(),
  leadId: UUIDSchema,
  assistantConfig: z
    .object({
      voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).default('nova'),
      language: z.string().default('ro-RO'),
      systemPrompt: z.string().optional(),
    })
    .optional(),
  recordCall: z.boolean().default(true),
  timeout: z.number().int().min(10).max(120).default(30),
});

/**
 * Call summary generated after call completion
 */
export const CallSummarySchema = z.object({
  callId: UUIDSchema,
  leadId: UUIDSchema,
  duration: z.number(),
  direction: CallDirectionSchema,
  status: CallStatusSchema,

  // Full transcript
  transcript: z.array(TranscriptSegmentSchema),

  // AI-generated summary
  summary: z.string(),
  keyPoints: z.array(z.string()),
  sentiment: z.enum(['positive', 'neutral', 'negative']),

  // Next steps identified
  followUpRequired: z.boolean(),
  followUpReason: z.string().optional(),
  scheduledCallback: TimestampSchema.optional(),

  // Recording
  recording: RecordingMetadataSchema.optional(),

  // Timestamps
  startedAt: TimestampSchema,
  endedAt: TimestampSchema,
});

export type CallDirection = z.infer<typeof CallDirectionSchema>;
export type CallStatus = z.infer<typeof CallStatusSchema>;
export type VoiceEventType = z.infer<typeof VoiceEventTypeSchema>;
export type TranscriptSegment = z.infer<typeof TranscriptSegmentSchema>;
export type RecordingMetadata = z.infer<typeof RecordingMetadataSchema>;
export type VoiceEvent = z.infer<typeof VoiceEventSchema>;
export type TwilioBase = z.infer<typeof TwilioBaseSchema>;
export type VoiceWebhook = z.infer<typeof VoiceWebhookSchema>;
export type CallStatusCallback = z.infer<typeof CallStatusCallbackSchema>;
export type TwilioStatusCallback = z.infer<typeof TwilioStatusCallbackSchema>;
export type InitiateCall = z.infer<typeof InitiateCallSchema>;
export type CallSummary = z.infer<typeof CallSummarySchema>;
