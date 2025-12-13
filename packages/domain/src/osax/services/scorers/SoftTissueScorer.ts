/**
 * @fileoverview Soft Tissue Health Scorer
 *
 * Scores soft tissue health status.
 * Uses map-based lookup for O(1) scoring without conditionals.
 *
 * @module domain/osax/services/scorers/SoftTissueScorer
 */

import type { IOsaxScorer, OsaxScoringFactors, SoftTissueLevel } from '../../types.js';

/** Score lookup by soft tissue health level */
const SOFT_TISSUE_SCORES: Record<SoftTissueLevel, number> = {
  excellent: 100,
  good: 80,
  fair: 55,
  poor: 25,
};

/** Risk factors by soft tissue health level */
const SOFT_TISSUE_RISKS: Record<SoftTissueLevel, string[]> = {
  excellent: [],
  good: [],
  fair: ['periodontal_concerns'],
  poor: ['periodontal_disease', 'healing_compromise_risk'],
};

/**
 * Soft Tissue Health Scorer
 *
 * Evaluates soft tissue and periodontal health.
 * Better tissue health = higher score for healing success.
 */
export class SoftTissueScorer implements IOsaxScorer {
  readonly name = 'soft_tissue';
  readonly weight = 0.15; // 15% of composite score

  score(factors: OsaxScoringFactors): { rawScore: number; riskFactors: string[] } {
    const level = factors.softTissueHealth;
    return {
      rawScore: SOFT_TISSUE_SCORES[level],
      riskFactors: [...SOFT_TISSUE_RISKS[level]],
    };
  }
}
