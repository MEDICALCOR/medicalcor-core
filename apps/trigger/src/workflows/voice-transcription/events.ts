/**
 * Event emission for voice transcription
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

import { logger } from '@trigger.dev/sdk/v3';
import type { VapiCallSummary } from '@medicalcor/integrations';
import type { ScoringOutput } from '@medicalcor/types';
import type { TriageResult } from '@medicalcor/domain';
import type { AISummaryResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EventStoreClient = any;

/**
 * Emit voice transcript processed event
 */
export async function emitTranscriptProcessedEvent(
  eventStore: EventStoreClient,
  correlationId: string,
  payload: {
    callId: string;
    normalizedPhone: string;
    callType: 'inbound' | 'outbound';
    duration?: number;
    endedReason?: string;
    hubspotContactId?: string;
    scoreResult: ScoringOutput | null;
    sentiment: AISummaryResult['sentiment'];
    summary: VapiCallSummary | null;
    triageResult: TriageResult | null;
    hasTranscript: boolean;
  }
): Promise<void> {
  try {
    await eventStore.emit({
      type: 'voice.transcript.processed',
      correlationId,
      aggregateId: payload.normalizedPhone,
      aggregateType: 'lead',
      payload: {
        callId: payload.callId,
        from: payload.normalizedPhone,
        callType: payload.callType,
        duration: payload.duration,
        endedReason: payload.endedReason,
        hubspotContactId: payload.hubspotContactId,
        score: payload.scoreResult?.score,
        classification: payload.scoreResult?.classification,
        sentiment: payload.sentiment?.sentiment,
        procedureInterest:
          payload.scoreResult?.procedureInterest ?? payload.summary?.procedureInterest,
        urgencyLevel: payload.summary?.urgencyLevel ?? payload.triageResult?.urgencyLevel,
        hasTranscript: payload.hasTranscript,
      },
    });

    logger.info('Domain event emitted', {
      type: 'voice.transcript.processed',
      correlationId,
    });
  } catch (err) {
    logger.error('Failed to emit domain event', { err, correlationId });
  }
}
