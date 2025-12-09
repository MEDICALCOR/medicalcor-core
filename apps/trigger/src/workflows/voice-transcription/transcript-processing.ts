/**
 * Transcript fetching and processing for voice transcription
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import type { TranscriptAnalysisResult, AISummaryResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VapiClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OpenAIClient = any;

/**
 * Fetch and analyze transcript from Vapi
 */
export async function fetchAndAnalyzeTranscript(
  vapi: VapiClient | null,
  callId: string,
  correlationId: string
): Promise<TranscriptAnalysisResult> {
  const result: TranscriptAnalysisResult = {
    transcript: null,
    analysis: null,
    summary: null,
  };

  if (!vapi) {
    logger.warn('Vapi client not configured, skipping transcript fetch', { correlationId });
    return result;
  }

  try {
    result.transcript = await vapi.getTranscript(callId);
    result.analysis = vapi.analyzeTranscript(result.transcript);
    result.summary = vapi.generateCallSummary(result.transcript, result.analysis);

    logger.info('Transcript fetched and analyzed', {
      callId,
      messageCount: result.transcript?.messages?.length ?? 0,
      procedureMentions: result.analysis?.procedureMentions,
      urgencyLevel: result.summary?.urgencyLevel,
      correlationId,
    });
  } catch (err) {
    logger.error('Failed to fetch transcript from Vapi', { err, callId, correlationId });
  }

  return result;
}

/**
 * Generate AI summary and sentiment analysis
 */
export async function generateAISummary(
  openai: OpenAIClient | null,
  fullTranscript: string | null,
  callId: string,
  correlationId: string
): Promise<AISummaryResult> {
  const result: AISummaryResult = {
    aiSummary: null,
    sentiment: null,
  };

  if (!openai || !fullTranscript) {
    return result;
  }

  try {
    // Generate summary
    result.aiSummary = await openai.summarize(fullTranscript, 'ro');
    logger.info('AI summary generated', { callId, correlationId });

    // Analyze sentiment
    result.sentiment = await openai.analyzeSentiment(fullTranscript);
    logger.info('Sentiment analyzed', { sentiment: result.sentiment?.sentiment, correlationId });
  } catch (err) {
    logger.error('Failed to generate AI summary', { err, callId, correlationId });
  }

  return result;
}
