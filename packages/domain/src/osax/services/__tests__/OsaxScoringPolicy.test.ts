/**
 * @fileoverview OsaxScoringPolicy Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OsaxScoringPolicy, InvalidOsaxFactorsError } from '../OsaxScoringPolicy.js';
import type { OsaxScoringFactors } from '../../types.js';

describe('OsaxScoringPolicy', () => {
  let policy: OsaxScoringPolicy;

  beforeEach(() => {
    policy = OsaxScoringPolicy.create();
  });

  describe('scoreFromFactors', () => {
    it('should return GREEN for ideal case', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 1,
        softTissueHealth: 'excellent',
        systemicRisks: ['none'],
        urgency: 'routine',
        financialReadiness: 'ready',
      };

      const result = policy.scoreFromFactors(factors);

      expect(result.globalScore).toBeGreaterThanOrEqual(70);
      expect(result.riskClass).toBe('GREEN');
      expect(result.riskFactors).toHaveLength(0);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should return YELLOW for moderate risk case', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 3,
        softTissueHealth: 'fair',
        systemicRisks: ['diabetes_controlled'],
        urgency: 'soon',
        financialReadiness: 'financing_needed',
      };

      const result = policy.scoreFromFactors(factors);

      expect(result.globalScore).toBeGreaterThanOrEqual(40);
      expect(result.globalScore).toBeLessThan(70);
      expect(result.riskClass).toBe('YELLOW');
      expect(result.riskFactors.length).toBeGreaterThan(0);
    });

    it('should return RED for high risk case', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 4,
        softTissueHealth: 'poor',
        systemicRisks: ['smoking_heavy', 'diabetes_uncontrolled'],
        urgency: 'routine',
        financialReadiness: 'not_ready',
      };

      const result = policy.scoreFromFactors(factors);

      expect(result.globalScore).toBeLessThan(40);
      expect(result.riskClass).toBe('RED');
      expect(result.riskFactors).toContain('poor_bone_density');
      expect(result.riskFactors).toContain('heavy_smoking_risk');
    });

    it('should include all component scores', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 2,
        softTissueHealth: 'good',
        systemicRisks: ['none'],
        urgency: 'soon',
        financialReadiness: 'ready',
      };

      const result = policy.scoreFromFactors(factors);

      expect(result.componentScores).toHaveLength(5);
      const scorerNames = result.componentScores.map((c) => c.scorer);
      expect(scorerNames).toContain('bone_quality');
      expect(scorerNames).toContain('soft_tissue');
      expect(scorerNames).toContain('systemic_risk');
      expect(scorerNames).toContain('urgency');
      expect(scorerNames).toContain('financial');
    });

    it('should calculate weighted scores correctly', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 2,
        softTissueHealth: 'good',
        systemicRisks: ['none'],
        urgency: 'routine',
        financialReadiness: 'ready',
      };

      const result = policy.scoreFromFactors(factors);

      // Sum of weighted scores should approximately equal global score
      const sumWeighted = result.componentScores.reduce((sum, c) => sum + c.weightedScore, 0);
      const sumWeights = result.componentScores.reduce((sum, c) => sum + c.weight, 0);
      const expectedGlobal = sumWeighted / sumWeights;

      expect(Math.abs(result.globalScore - expectedGlobal)).toBeLessThan(0.5);
    });

    it('should throw for invalid bone quality', () => {
      const factors = {
        boneQuality: 5 as 1,
        softTissueHealth: 'good',
        systemicRisks: [],
        urgency: 'routine',
        financialReadiness: 'ready',
      } as OsaxScoringFactors;

      expect(() => policy.scoreFromFactors(factors)).toThrow(InvalidOsaxFactorsError);
    });

    it('should reduce confidence when optional data is missing', () => {
      const withOptional: OsaxScoringFactors = {
        boneQuality: 2,
        softTissueHealth: 'good',
        systemicRisks: [],
        urgency: 'routine',
        financialReadiness: 'ready',
        patientAge: 55,
        asaClassification: 2,
      };

      const withoutOptional: OsaxScoringFactors = {
        boneQuality: 2,
        softTissueHealth: 'good',
        systemicRisks: [],
        urgency: 'routine',
        financialReadiness: 'ready',
      };

      const resultWith = policy.scoreFromFactors(withOptional);
      const resultWithout = policy.scoreFromFactors(withoutOptional);

      expect(resultWith.confidence).toBeGreaterThan(resultWithout.confidence);
    });
  });

  describe('getSuggestedAction', () => {
    it('should return appropriate action for GREEN', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 1,
        softTissueHealth: 'excellent',
        systemicRisks: [],
        urgency: 'routine',
        financialReadiness: 'ready',
      };

      const result = policy.scoreFromFactors(factors);
      const action = policy.getSuggestedAction(result);

      expect(action).toContain('standard');
    });

    it('should return appropriate action for RED', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 4,
        softTissueHealth: 'poor',
        systemicRisks: ['smoking_heavy', 'immunocompromised'],
        urgency: 'routine',
        financialReadiness: 'not_ready',
      };

      const result = policy.scoreFromFactors(factors);
      const action = policy.getSuggestedAction(result);

      expect(action).toContain('evaluation');
    });
  });

  describe('requiresImmediateAttention', () => {
    it('should return true for RED cases', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 4,
        softTissueHealth: 'poor',
        systemicRisks: ['smoking_heavy'],
        urgency: 'routine',
        financialReadiness: 'not_ready',
      };

      const result = policy.scoreFromFactors(factors);

      expect(policy.requiresImmediateAttention(result)).toBe(true);
    });

    it('should return true for emergency cases', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 1,
        softTissueHealth: 'excellent',
        systemicRisks: [],
        urgency: 'emergency',
        financialReadiness: 'ready',
      };

      const result = policy.scoreFromFactors(factors);

      expect(policy.requiresImmediateAttention(result)).toBe(true);
    });

    it('should return false for GREEN routine cases', () => {
      const factors: OsaxScoringFactors = {
        boneQuality: 1,
        softTissueHealth: 'excellent',
        systemicRisks: [],
        urgency: 'routine',
        financialReadiness: 'ready',
      };

      const result = policy.scoreFromFactors(factors);

      expect(policy.requiresImmediateAttention(result)).toBe(false);
    });
  });
});
