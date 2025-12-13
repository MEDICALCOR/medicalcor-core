/**
 * @fileoverview Bone Quality Scorer
 *
 * Scores bone quality using Misch Classification (D1-D4).
 * Uses map-based lookup for O(1) scoring without conditionals.
 *
 * @module domain/osax/services/scorers/BoneQualityScorer
 */

import type { IOsaxScorer, OsaxScoringFactors, BoneQualityLevel } from '../../types.js';

/** Score lookup by bone quality level */
const BONE_QUALITY_SCORES: Record<BoneQualityLevel, number> = {
  1: 100, // D1: Dense cortical - ideal
  2: 85, // D2: Dense porous cortical - good
  3: 60, // D3: Thin porous cortical - fair
  4: 30, // D4: Fine trabecular only - poor
};

/** Risk factors by bone quality level */
const BONE_QUALITY_RISKS: Record<BoneQualityLevel, string[]> = {
  1: [],
  2: [],
  3: ['moderate_bone_density'],
  4: ['poor_bone_density', 'implant_stability_risk'],
};

/**
 * Bone Quality Scorer
 *
 * Evaluates bone quality based on Misch Classification.
 * Higher bone density (D1) = better score for implant success.
 */
export class BoneQualityScorer implements IOsaxScorer {
  readonly name = 'bone_quality';
  readonly weight = 0.3; // 30% of composite score

  score(factors: OsaxScoringFactors): { rawScore: number; riskFactors: string[] } {
    const level = factors.boneQuality;
    return {
      rawScore: BONE_QUALITY_SCORES[level],
      riskFactors: [...BONE_QUALITY_RISKS[level]],
    };
  }
}
