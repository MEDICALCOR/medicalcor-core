import { z } from 'zod';

/**
 * Voice/Twilio Webhook Schemas
 * Based on Twilio Voice webhooks
 */

// Call direction enum
export const CallDirectionSchema = z.enum(['inbound', 'outbound-api', 'outbound-dial']);

// Call status enum
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

// Base Twilio webhook parameters
export const TwilioBaseSchema = z.object({
  AccountSid: z.string(),
  ApiVersion: z.string(),
});

// Voice webhook (incoming call)
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

// Call status callback
export const CallStatusCallbackSchema = VoiceWebhookSchema.extend({
  CallDuration: z.string().optional(),
  Duration: z.string().optional(),
  Timestamp: z.string().optional(),
  CallbackSource: z.string().optional(),
  SequenceNumber: z.string().optional(),
});

// Voice event (internal representation)
export const VoiceEventSchema = z.object({
  eventType: z.enum(['call_initiated', 'call_ringing', 'call_answered', 'call_completed', 'call_failed']),
  callSid: z.string(),
  from: z.string(),
  to: z.string(),
  direction: CallDirectionSchema,
  status: CallStatusSchema,
  duration: z.number().optional(),
  timestamp: z.string(),
});

// Inferred types
export type CallDirection = z.infer<typeof CallDirectionSchema>;
export type CallStatus = z.infer<typeof CallStatusSchema>;
export type VoiceWebhook = z.infer<typeof VoiceWebhookSchema>;
export type CallStatusCallback = z.infer<typeof CallStatusCallbackSchema>;
export type VoiceEvent = z.infer<typeof VoiceEventSchema>;
