/**
 * @fileoverview Urgency Scorer
 *
 * Scores treatment urgency level.
 * Uses map-based lookup for O(1) scoring without conditionals.
 *
 * @module domain/osax/services/scorers/UrgencyScorer
 */

import type { IOsaxScorer, OsaxScoringFactors, UrgencyLevel } from '../../types.js';

/** Score lookup by urgency level (higher urgency = higher priority) */
const URGENCY_SCORES: Record<UrgencyLevel, number> = {
  routine: 70,
  soon: 80,
  urgent: 90,
  emergency: 100,
};

/** Risk factors by urgency level */
const URGENCY_RISKS: Record<UrgencyLevel, string[]> = {
  routine: [],
  soon: [],
  urgent: ['time_sensitive_treatment'],
  emergency: ['emergency_treatment_required'],
};

/**
 * Urgency Scorer
 *
 * Evaluates treatment urgency for prioritization.
 * Higher urgency = higher score (for prioritization purposes).
 */
export class UrgencyScorer implements IOsaxScorer {
  readonly name = 'urgency';
  readonly weight = 0.15; // 15% of composite score

  score(factors: OsaxScoringFactors): { rawScore: number; riskFactors: string[] } {
    const level = factors.urgency;
    return {
      rawScore: URGENCY_SCORES[level],
      riskFactors: [...URGENCY_RISKS[level]],
    };
  }
}
