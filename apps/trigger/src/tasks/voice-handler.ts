import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';

/**
 * Voice Call Handler Task
 * Processes incoming voice calls and call status updates
 */

const VoiceCallPayloadSchema = z.object({
  callSid: z.string(),
  from: z.string(),
  to: z.string(),
  direction: z.enum(['inbound', 'outbound-api', 'outbound-dial']),
  status: z.string(),
  duration: z.string().optional(),
  correlationId: z.string(),
});

export const handleVoiceCall = task({
  id: 'voice-call-handler',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof VoiceCallPayloadSchema>) => {
    const { callSid, from, to, direction, status, duration, correlationId } = payload;

    logger.info('Processing voice call', {
      callSid,
      from,
      direction,
      status,
      correlationId,
    });

    // Step 1: Normalize phone number
    const normalizedPhone = normalizePhone(from);

    // Step 2: Upsert contact in HubSpot
    // const hubspotContact = await hubspotClient.syncContact({
    //   phone: normalizedPhone,
    //   channel: 'voice',
    // });

    // Step 3: If call completed, get transcript
    // if (status === 'completed' && duration) {
    //   const transcript = await vapiClient.getCallTranscript(callSid);
    //
    //   // Log to HubSpot timeline
    //   await hubspotClient.logCallToTimeline({
    //     contactId: hubspotContact.id,
    //     callSid,
    //     duration: parseInt(duration),
    //     transcript: transcript.text,
    //     sentiment: transcript.sentiment,
    //   });
    //
    //   // AI scoring on transcript
    //   const scoreResult = await aiScoringService.scoreTranscript({
    //     phone: normalizedPhone,
    //     transcript: transcript.text,
    //   });
    //
    //   // Update contact score
    //   await hubspotClient.updateContact(hubspotContact.id, {
    //     lead_score: scoreResult.score.toString(),
    //     lead_status: scoreResult.classification,
    //   });
    // }

    // Step 4: Emit domain event
    // await eventStore.emit({
    //   type: status === 'completed' ? 'voice.call.completed' : 'voice.call.initiated',
    //   correlationId,
    //   payload: {
    //     callSid,
    //     from: normalizedPhone,
    //     to,
    //     direction,
    //     status,
    //     duration: duration ? parseInt(duration) : undefined,
    //   },
    // });

    return {
      success: true,
      callSid,
      normalizedPhone,
      status,
    };
  },
});

const CallCompletedPayloadSchema = z.object({
  callSid: z.string(),
  from: z.string(),
  duration: z.number(),
  recordingUrl: z.string().optional(),
  correlationId: z.string(),
});

export const handleCallCompleted = task({
  id: 'voice-call-completed-handler',
  retry: {
    maxAttempts: 3,
  },
  run: async (payload: z.infer<typeof CallCompletedPayloadSchema>) => {
    const { callSid, from, duration, recordingUrl, correlationId } = payload;

    logger.info('Processing completed call', {
      callSid,
      duration,
      hasRecording: !!recordingUrl,
      correlationId,
    });

    // Process transcript, scoring, and CRM updates
    // Similar to above but focused on post-call processing

    return {
      success: true,
      callSid,
      duration,
    };
  },
});

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('40')) return `+${cleaned}`;
  if (cleaned.startsWith('0')) return `+40${cleaned.substring(1)}`;
  return `+${cleaned}`;
}
