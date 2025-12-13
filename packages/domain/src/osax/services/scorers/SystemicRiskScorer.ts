/**
 * @fileoverview Systemic Risk Scorer
 *
 * Scores systemic medical risk factors.
 * Uses map-based lookup for O(1) penalty calculation without conditionals.
 *
 * @module domain/osax/services/scorers/SystemicRiskScorer
 */

import type { IOsaxScorer, OsaxScoringFactors, SystemicRiskCategory } from '../../types.js';

/** Penalty points by systemic risk category */
const RISK_PENALTIES: Record<SystemicRiskCategory, number> = {
  none: 0,
  diabetes_controlled: 10,
  diabetes_uncontrolled: 30,
  smoking_light: 15,
  smoking_heavy: 35,
  bisphosphonates: 25,
  immunocompromised: 30,
  cardiovascular: 20,
};

/** Risk factor labels by category */
const RISK_LABELS: Record<SystemicRiskCategory, string | null> = {
  none: null,
  diabetes_controlled: 'diabetes_controlled',
  diabetes_uncontrolled: 'diabetes_uncontrolled',
  smoking_light: 'smoking_risk',
  smoking_heavy: 'heavy_smoking_risk',
  bisphosphonates: 'mronj_risk',
  immunocompromised: 'immunocompromised',
  cardiovascular: 'cardiovascular_risk',
};

/**
 * Systemic Risk Scorer
 *
 * Evaluates systemic medical conditions affecting implant success.
 * Multiple risks are cumulative (score decreases with each risk).
 */
export class SystemicRiskScorer implements IOsaxScorer {
  readonly name = 'systemic_risk';
  readonly weight = 0.25; // 25% of composite score

  score(factors: OsaxScoringFactors): { rawScore: number; riskFactors: string[] } {
    const risks = factors.systemicRisks;
    const riskFactors: string[] = [];

    // Sum all penalty points
    let totalPenalty = 0;
    for (const risk of risks) {
      totalPenalty += RISK_PENALTIES[risk];
      const label = RISK_LABELS[risk];
      if (label !== null) {
        riskFactors.push(label);
      }
    }

    // Score is 100 minus penalties (clamped to 0)
    const rawScore = Math.max(0, 100 - totalPenalty);

    return { rawScore, riskFactors };
  }
}
