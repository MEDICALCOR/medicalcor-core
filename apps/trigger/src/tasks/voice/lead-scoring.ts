/**
 * Lead scoring and triage for voice calls
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-return */

import { logger } from '@trigger.dev/sdk/v3';
import type {
  ScoringClient,
  TriageClient,
  OpenAIClient,
  ScoreResult,
  TriageResult,
  AIScoringContext,
} from './types.js';

export interface ScoringAndTriageResult {
  scoreResult: ScoreResult;
  triageResult: TriageResult;
  sentiment?: string;
}

/**
 * Score voice lead and perform triage assessment
 */
export async function scoreVoiceLead(
  scoring: ScoringClient,
  triage: TriageClient,
  params: {
    normalizedPhone: string;
    hubspotContactId: string;
    transcript: string;
  },
  correlationId: string
): Promise<{ scoreResult: ScoreResult; triageResult: TriageResult }> {
  const { normalizedPhone, hubspotContactId, transcript } = params;

  const leadContext: AIScoringContext = {
    phone: normalizedPhone,
    channel: 'voice',
    firstTouchTimestamp: new Date().toISOString(),
    language: 'ro',
    messageHistory: [{ role: 'user', content: transcript, timestamp: new Date().toISOString() }],
    hubspotContactId,
  };

  const scoreResult = await scoring.scoreMessage(leadContext);
  logger.info('Voice lead scored', {
    score: scoreResult.score,
    classification: scoreResult.classification,
    correlationId,
  });

  const triageResult = await triage.assess({
    leadScore: scoreResult.classification,
    channel: 'voice',
    messageContent: transcript,
    procedureInterest: scoreResult.procedureInterest ?? [],
    hasExistingRelationship: false,
  });

  logger.info('Triage assessment completed', {
    urgencyLevel: triageResult.urgencyLevel,
    routing: triageResult.routingRecommendation,
    correlationId,
  });

  return { scoreResult, triageResult };
}

/**
 * Analyze sentiment using OpenAI
 */
export async function analyzeVoiceSentiment(
  openai: OpenAIClient | null,
  transcript: string,
  correlationId: string
): Promise<string | undefined> {
  if (!openai) {
    return undefined;
  }

  try {
    const sentimentResult = await openai.analyzeSentiment(transcript);
    logger.info('Sentiment analyzed', { sentiment: sentimentResult.sentiment, correlationId });
    return sentimentResult.sentiment;
  } catch (err) {
    logger.warn('Failed to analyze sentiment', { err, correlationId });
    return undefined;
  }
}
