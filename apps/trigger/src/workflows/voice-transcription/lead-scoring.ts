/**
 * Lead scoring for voice transcription
 */
/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-redundant-type-constituents */

import { logger } from '@trigger.dev/sdk/v3';
import { extractLeadQualification } from '@medicalcor/integrations';
import type { AIScoringContext } from '@medicalcor/types';
import type { LeadScoringResult, TranscriptAnalysisResult } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ScoringClient = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TriageClient = any;

/**
 * Score lead from transcript analysis
 */
export async function scoreLeadFromTranscript(
  scoring: ScoringClient | null,
  triage: TriageClient | null,
  analysisResult: TranscriptAnalysisResult,
  normalizedPhone: string,
  callId: string,
  correlationId: string
): Promise<LeadScoringResult> {
  const result: LeadScoringResult = {
    scoreResult: null,
    triageResult: null,
  };

  const { analysis, transcript, summary } = analysisResult;

  if (!analysis) {
    return result;
  }

  if (!scoring) {
    logger.warn('Scoring service not available', { correlationId });
    return result;
  }

  try {
    // Build lead context from transcript
    const leadContext: AIScoringContext = {
      phone: normalizedPhone,
      channel: 'voice',
      firstTouchTimestamp: transcript?.startedAt ?? new Date().toISOString(),
      language: 'ro',
      messageHistory: analysis.customerMessages.map((content) => ({
        role: 'user' as const,
        content,
        timestamp: new Date().toISOString(),
      })),
      hubspotContactId: undefined,
    };

    // AI scoring
    let scoreResult = await scoring.scoreMessage(leadContext);

    // Use rule-based extraction as fallback if score is low confidence
    if (scoreResult.confidence < 0.5 && summary) {
      const qualification = extractLeadQualification(summary);
      scoreResult = {
        score: qualification.score,
        classification: qualification.classification,
        confidence: 0.7,
        reasoning: qualification.reason,
        suggestedAction:
          qualification.classification === 'HOT' ? 'Immediate callback' : 'Add to nurture',
        procedureInterest: summary.procedureInterest,
      };
    }

    result.scoreResult = scoreResult;

    logger.info('Lead scored from transcript', {
      score: scoreResult.score,
      classification: scoreResult.classification,
      correlationId,
    });

    // Triage assessment
    if (triage) {
      const triageResult = await triage.assess({
        leadScore: scoreResult.classification,
        channel: 'voice',
        messageContent: analysis.fullTranscript,
        procedureInterest: scoreResult.procedureInterest ?? [],
        hasExistingRelationship: false,
      });

      result.triageResult = triageResult;

      logger.info('Triage completed', {
        urgencyLevel: triageResult.urgencyLevel,
        routing: triageResult.routingRecommendation,
        correlationId,
      });
    } else {
      logger.warn('Triage service not available', { correlationId });
    }
  } catch (err) {
    logger.error('Failed to score lead', { err, callId, correlationId });
  }

  return result;
}
