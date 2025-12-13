/**
 * @fileoverview Financial Readiness Scorer
 *
 * Scores patient financial readiness for treatment.
 * Uses map-based lookup for O(1) scoring without conditionals.
 *
 * @module domain/osax/services/scorers/FinancialScorer
 */

import type { IOsaxScorer, OsaxScoringFactors, FinancialReadiness } from '../../types.js';

/** Score lookup by financial readiness level */
const FINANCIAL_SCORES: Record<FinancialReadiness, number> = {
  ready: 100,
  financing_needed: 75,
  uncertain: 50,
  not_ready: 20,
};

/** Risk factors by financial readiness */
const FINANCIAL_RISKS: Record<FinancialReadiness, string[]> = {
  ready: [],
  financing_needed: ['financing_arrangement_needed'],
  uncertain: ['financial_uncertainty'],
  not_ready: ['financial_barrier'],
};

/**
 * Financial Readiness Scorer
 *
 * Evaluates patient financial readiness for treatment planning.
 * Higher readiness = smoother treatment progression.
 */
export class FinancialScorer implements IOsaxScorer {
  readonly name = 'financial';
  readonly weight = 0.15; // 15% of composite score

  score(factors: OsaxScoringFactors): { rawScore: number; riskFactors: string[] } {
    const level = factors.financialReadiness;
    return {
      rawScore: FINANCIAL_SCORES[level],
      riskFactors: [...FINANCIAL_RISKS[level]],
    };
  }
}
