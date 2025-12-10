/**
 * Tests for AITreatmentPlanningService
 *
 * Covers:
 * - Treatment plan prompt generation
 * - Restoration strategy analysis
 * - Success rate calculations
 * - Cost estimation
 * - Urgency assessment
 * - Patient-friendly summaries
 * - Treatment plan validation
 */

import { describe, it, expect } from 'vitest';
import {
  generateTreatmentPlanPrompt,
  analyzeRestorationStrategy,
  calculatePredictedSuccessRate,
  estimateTreatmentCost,
  assessUrgency,
  createPatientFriendlySummary,
  validateTreatmentPlan,
  type ClinicalAssessmentInput,
  type TreatmentOption,
  type AITreatmentPlan,
  type ProcedureRecommendation,
} from '../AITreatmentPlanningService.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createHealthyAssessment(
  overrides: Partial<ClinicalAssessmentInput> = {}
): ClinicalAssessmentInput {
  return {
    patientAge: 45,
    patientGender: 'FEMALE',
    missingTeeth: [],
    decayedTeeth: [],
    periodontalStatus: 'HEALTHY',
    existingRestorations: [],
    medicalConditions: [],
    medications: [],
    allergies: [],
    smokingStatus: 'NEVER',
    aestheticPriority: 'MEDIUM',
    functionalPriority: 'HIGH',
    ...overrides,
  };
}

function createHighRiskAssessment(): ClinicalAssessmentInput {
  return {
    patientAge: 70,
    patientGender: 'MALE',
    missingTeeth: [11, 12, 13, 21, 22, 23],
    decayedTeeth: [14, 15, 24, 25],
    periodontalStatus: 'SEVERE_PERIO',
    existingRestorations: [
      { tooth: 16, type: 'crown', condition: 'FAILING' },
      { tooth: 26, type: 'crown', condition: 'FAILING' },
    ],
    boneQuality: 'D4',
    sinusProximity: true,
    nerveProximity: true,
    medicalConditions: ['diabetes', 'hypertension'],
    medications: ['metformin', 'lisinopril'],
    allergies: ['penicillin'],
    smokingStatus: 'CURRENT',
    diabetesStatus: 'UNCONTROLLED',
    aestheticPriority: 'HIGH',
    functionalPriority: 'HIGH',
  };
}

function createTreatmentOption(overrides: Partial<TreatmentOption> = {}): TreatmentOption {
  return {
    id: 'option-1',
    name: 'Single Implant Restoration',
    description: 'Replace missing tooth with dental implant and crown',
    category: 'IMPLANT',
    complexity: 'MODERATE',
    phases: [
      {
        name: 'Implant Placement',
        description: 'Surgical placement of implant fixture',
        procedures: [],
        durationWeeks: 1,
        requiresHealing: true,
        healingWeeks: 12,
      },
      {
        name: 'Prosthetic Phase',
        description: 'Abutment and crown placement',
        procedures: [],
        durationWeeks: 2,
        requiresHealing: false,
      },
    ],
    totalProcedures: 3,
    predictedSuccessRate: 95,
    longevityYears: 15,
    functionalScore: 9,
    aestheticScore: 9,
    estimatedCost: { min: 4000, max: 6000, currency: 'RON' },
    estimatedDurationMonths: 4,
    appointmentsRequired: 4,
    risks: [{ type: 'Infection', severity: 'LOW', probability: 2, mitigation: 'Antibiotics' }],
    contraindications: [],
    aiConfidence: 90,
    reasoning: 'Best option for single tooth replacement',
    ...overrides,
  };
}

function createMockProcedures(): ProcedureRecommendation[] {
  return [
    {
      code: 'IMPLANT_PLACEMENT',
      name: 'Dental Implant Placement',
      description: 'Place titanium implant',
      teethInvolved: [11],
      estimatedCost: 3500,
      durationMinutes: 60,
      anesthesiaRequired: true,
    },
    {
      code: 'IMPLANT_CROWN',
      name: 'Implant Crown',
      description: 'Zirconia crown on implant',
      teethInvolved: [11],
      estimatedCost: 2000,
      durationMinutes: 30,
      anesthesiaRequired: false,
    },
  ];
}

// ============================================================================
// PROMPT GENERATION TESTS
// ============================================================================

describe('generateTreatmentPlanPrompt', () => {
  it('should generate prompt with patient demographics', () => {
    const assessment = createHealthyAssessment({ patientAge: 55 });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('55 years old');
    expect(prompt).toContain('FEMALE');
  });

  it('should include dental status in prompt', () => {
    const assessment = createHealthyAssessment({
      missingTeeth: [11, 21],
      decayedTeeth: [14, 24],
      periodontalStatus: 'GINGIVITIS',
    });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('11, 21');
    expect(prompt).toContain('14, 24');
    expect(prompt).toContain('GINGIVITIS');
  });

  it('should include medical history', () => {
    const assessment = createHealthyAssessment({
      medicalConditions: ['diabetes', 'hypertension'],
      medications: ['metformin'],
      allergies: ['penicillin'],
    });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('diabetes');
    expect(prompt).toContain('metformin');
    expect(prompt).toContain('penicillin');
  });

  it('should include smoking status', () => {
    const assessment = createHealthyAssessment({ smokingStatus: 'CURRENT' });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('CURRENT');
  });

  it('should include diabetes status when provided', () => {
    const assessment = createHealthyAssessment({ diabetesStatus: 'CONTROLLED' });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('CONTROLLED');
  });

  it('should include bone assessment when provided', () => {
    const assessment = createHealthyAssessment({
      boneQuality: 'D2',
      sinusProximity: true,
      nerveProximity: true,
    });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('D2');
    expect(prompt).toContain('Sinus proximity');
    expect(prompt).toContain('Nerve proximity');
  });

  it('should include budget when provided', () => {
    const assessment = createHealthyAssessment({
      budgetRange: { min: 5000, max: 15000, currency: 'EUR' },
    });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('5000');
    expect(prompt).toContain('15000');
    expect(prompt).toContain('EUR');
  });

  it('should include time constraints when provided', () => {
    const assessment = createHealthyAssessment({
      timeConstraints: { maxMonths: 6 },
    });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('6 months');
  });

  it('should handle empty medical history', () => {
    const assessment = createHealthyAssessment({
      medicalConditions: [],
      medications: [],
      allergies: [],
    });

    const prompt = generateTreatmentPlanPrompt(assessment);

    expect(prompt).toContain('None reported');
    expect(prompt).toContain('None known');
  });
});

// ============================================================================
// RESTORATION STRATEGY TESTS
// ============================================================================

describe('analyzeRestorationStrategy', () => {
  it('should recommend SINGLE_IMPLANTS for 1-2 missing teeth', () => {
    const result = analyzeRestorationStrategy([11, 21]);

    expect(result.strategy).toBe('SINGLE_IMPLANTS');
    expect(result.reasoning).toContain('Few missing teeth');
  });

  it('should recommend SINGLE_IMPLANTS for no missing teeth', () => {
    const result = analyzeRestorationStrategy([]);

    expect(result.strategy).toBe('SINGLE_IMPLANTS');
    expect(result.reasoning).toContain('No missing teeth');
  });

  it('should recommend IMPLANT_BRIDGE for adjacent missing teeth', () => {
    const result = analyzeRestorationStrategy([11, 12, 13]);

    expect(result.strategy).toBe('IMPLANT_BRIDGE');
    expect(result.reasoning).toContain('Adjacent');
  });

  it('should recommend ALL_ON_4 for edentulous maxilla with adequate bone', () => {
    // All upper teeth missing (FDI notation: 11-18, 21-28)
    const missingTeeth = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28];

    const result = analyzeRestorationStrategy(missingTeeth, 'D2');

    expect(result.strategy).toBe('ALL_ON_4');
    expect(result.reasoning).toContain('Full arch');
  });

  it('should recommend ALL_ON_6 for edentulous arch with poor bone', () => {
    const missingTeeth = [11, 12, 13, 14, 15, 16, 17, 18, 21, 22, 23, 24, 25, 26, 27, 28];

    const result = analyzeRestorationStrategy(missingTeeth, 'D4');

    expect(result.strategy).toBe('ALL_ON_6');
    expect(result.reasoning).toContain('better load distribution');
  });

  it('should recommend HYBRID for complex cases', () => {
    const result = analyzeRestorationStrategy([11, 14, 21, 24, 31, 34, 41]);

    expect(result.strategy).toBe('HYBRID');
    expect(result.reasoning).toContain('combination');
  });

  it('should recommend IMPLANT_BRIDGE for 5-6 missing teeth', () => {
    const result = analyzeRestorationStrategy([11, 12, 13, 14, 15, 16]);

    expect(result.strategy).toBe('IMPLANT_BRIDGE');
  });
});

// ============================================================================
// SUCCESS RATE CALCULATION TESTS
// ============================================================================

describe('calculatePredictedSuccessRate', () => {
  it('should return high rate for healthy patient', () => {
    const assessment = createHealthyAssessment();

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    expect(result.rate).toBeGreaterThan(90);
  });

  it('should reduce rate for smoker', () => {
    const assessment = createHealthyAssessment({ smokingStatus: 'CURRENT' });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    expect(result.rate).toBeLessThan(90);
    expect(result.factors.some((f) => f.factor.includes('smoker'))).toBe(true);
  });

  it('should significantly reduce rate for uncontrolled diabetes', () => {
    const assessment = createHealthyAssessment({ diabetesStatus: 'UNCONTROLLED' });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    const diabetesFactor = result.factors.find((f) => f.factor.includes('Uncontrolled diabetes'));
    expect(diabetesFactor).toBeDefined();
    expect(diabetesFactor!.impact).toBe(-15);
  });

  it('should reduce rate for severe periodontal disease', () => {
    const assessment = createHealthyAssessment({ periodontalStatus: 'SEVERE_PERIO' });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    expect(result.factors.some((f) => f.factor.includes('Severe periodontal'))).toBe(true);
  });

  it('should factor in bone quality for implants', () => {
    const assessment = createHealthyAssessment({ boneQuality: 'D4' });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    expect(result.factors.some((f) => f.factor.includes('bone quality'))).toBe(true);
  });

  it('should increase rate for excellent bone quality', () => {
    const assessment = createHealthyAssessment({ boneQuality: 'D1' });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    const boneFactor = result.factors.find((f) => f.factor.includes('D1'));
    expect(boneFactor).toBeDefined();
    expect(boneFactor!.impact).toBe(2);
  });

  it('should factor in sinus proximity', () => {
    const assessment = createHealthyAssessment({ sinusProximity: true });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    expect(result.factors.some((f) => f.factor.includes('Sinus'))).toBe(true);
  });

  it('should factor in nerve proximity', () => {
    const assessment = createHealthyAssessment({ nerveProximity: true });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    expect(result.factors.some((f) => f.factor.includes('Nerve'))).toBe(true);
  });

  it('should factor in high-risk medical conditions', () => {
    const assessment = createHealthyAssessment({
      medicalConditions: ['osteoporosis'],
    });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    expect(result.factors.some((f) => f.factor.includes('High-risk'))).toBe(true);
  });

  it('should factor in age over 70', () => {
    const assessment = createHealthyAssessment({ patientAge: 75 });

    const result = calculatePredictedSuccessRate(assessment, 'IMPLANT');

    expect(result.factors.some((f) => f.factor.includes('Age over 70'))).toBe(true);
  });

  it('should clamp rate between 50 and 99', () => {
    const highRisk = createHighRiskAssessment();

    const result = calculatePredictedSuccessRate(highRisk, 'IMPLANT');

    expect(result.rate).toBeGreaterThanOrEqual(50);
    expect(result.rate).toBeLessThanOrEqual(99);
  });
});

// ============================================================================
// COST ESTIMATION TESTS
// ============================================================================

describe('estimateTreatmentCost', () => {
  it('should estimate cost for procedures in RON', () => {
    const procedures = createMockProcedures();

    const result = estimateTreatmentCost(procedures, 'RON');

    expect(result.min).toBeGreaterThan(0);
    expect(result.max).toBeGreaterThan(result.min);
    expect(result.breakdown).toHaveLength(2);
  });

  it('should convert to EUR', () => {
    const procedures = createMockProcedures();

    const ronResult = estimateTreatmentCost(procedures, 'RON');
    const eurResult = estimateTreatmentCost(procedures, 'EUR');

    expect(eurResult.min).toBeLessThan(ronResult.min);
    expect(eurResult.max).toBeLessThan(ronResult.max);
  });

  it('should convert to USD', () => {
    const procedures = createMockProcedures();

    const usdResult = estimateTreatmentCost(procedures, 'USD');

    expect(usdResult.min).toBeGreaterThan(0);
  });

  it('should convert to GBP', () => {
    const procedures = createMockProcedures();

    const gbpResult = estimateTreatmentCost(procedures, 'GBP');

    expect(gbpResult.min).toBeGreaterThan(0);
  });

  it('should provide breakdown per procedure', () => {
    const procedures = createMockProcedures();

    const result = estimateTreatmentCost(procedures);

    expect(result.breakdown[0]!.procedure).toBe('Dental Implant Placement');
    expect(result.breakdown[0]!.cost).toBeGreaterThan(0);
  });

  it('should handle unknown procedure codes', () => {
    const procedures: ProcedureRecommendation[] = [
      {
        code: 'UNKNOWN_CODE',
        name: 'Unknown Procedure',
        description: 'Test',
        teethInvolved: [11],
        estimatedCost: 1000,
        durationMinutes: 30,
        anesthesiaRequired: false,
      },
    ];

    const result = estimateTreatmentCost(procedures);

    expect(result.min).toBeGreaterThan(0);
  });
});

// ============================================================================
// URGENCY ASSESSMENT TESTS
// ============================================================================

describe('assessUrgency', () => {
  it('should return ROUTINE for healthy patient', () => {
    const assessment = createHealthyAssessment();

    const result = assessUrgency(assessment);

    expect(result.level).toBe('ROUTINE');
    expect(result.recommendedTimeframe).toContain('6 months');
  });

  it('should return EMERGENCY for acute conditions', () => {
    const assessment = createHealthyAssessment({
      medicalConditions: ['dental abscess'],
    });

    const result = assessUrgency(assessment);

    expect(result.level).toBe('EMERGENCY');
    expect(result.recommendedTimeframe).toContain('24-48 hours');
  });

  it('should return URGENT for severe periodontal disease', () => {
    const assessment = createHealthyAssessment({
      periodontalStatus: 'SEVERE_PERIO',
    });

    const result = assessUrgency(assessment);

    expect(result.level).toBe('URGENT');
    expect(result.recommendedTimeframe).toContain('week');
  });

  it('should return URGENT for failing restorations', () => {
    const assessment = createHealthyAssessment({
      existingRestorations: [{ tooth: 11, type: 'crown', condition: 'FAILING' }],
    });

    const result = assessUrgency(assessment);

    expect(result.level).toBe('URGENT');
  });

  it('should return SOON for multiple decayed teeth', () => {
    const assessment = createHealthyAssessment({
      decayedTeeth: [11, 12, 13, 14],
    });

    const result = assessUrgency(assessment);

    expect(result.level).toBe('SOON');
    expect(result.recommendedTimeframe).toContain('month');
  });

  it('should return SOON for some missing teeth', () => {
    const assessment = createHealthyAssessment({
      missingTeeth: [11, 21, 31],
    });

    const result = assessUrgency(assessment);

    expect(result.level).toBe('SOON');
  });

  it('should detect trauma as emergency', () => {
    const assessment = createHealthyAssessment({
      medicalConditions: ['dental trauma'],
    });

    const result = assessUrgency(assessment);

    expect(result.level).toBe('EMERGENCY');
  });
});

// ============================================================================
// PATIENT-FRIENDLY SUMMARY TESTS
// ============================================================================

describe('createPatientFriendlySummary', () => {
  it('should create English summary', () => {
    const option = createTreatmentOption();

    const summary = createPatientFriendlySummary(option, 'en');

    expect(summary).toContain('Recommended Treatment');
    expect(summary).toContain('95%');
    expect(summary).toContain('4 months');
    expect(summary).toContain('4 appointments');
  });

  it('should create Romanian summary', () => {
    const option = createTreatmentOption();

    const summary = createPatientFriendlySummary(option, 'ro');

    expect(summary).toContain('Tratamentul Recomandat');
    expect(summary).toContain('Echipa noastră');
  });

  it('should create German summary', () => {
    const option = createTreatmentOption();

    const summary = createPatientFriendlySummary(option, 'de');

    expect(summary).toContain('Empfohlene Behandlung');
    expect(summary).toContain('Unser Team');
  });

  it('should include cost range', () => {
    const option = createTreatmentOption({
      estimatedCost: { min: 5000, max: 8000, currency: 'EUR' },
    });

    const summary = createPatientFriendlySummary(option, 'en');

    expect(summary).toContain('5,000');
    expect(summary).toContain('8,000');
    expect(summary).toContain('EUR');
  });

  it('should list treatment phases', () => {
    const option = createTreatmentOption();

    const summary = createPatientFriendlySummary(option, 'en');

    expect(summary).toContain('Implant Placement');
    expect(summary).toContain('Prosthetic Phase');
  });
});

// ============================================================================
// TREATMENT PLAN VALIDATION TESTS
// ============================================================================

describe('validateTreatmentPlan', () => {
  it('should validate a correct treatment plan', () => {
    const plan: AITreatmentPlan = {
      id: 'plan-1',
      generatedAt: new Date(),
      patientId: 'patient-1',
      assessmentSummary: 'Test summary',
      recommendedOption: createTreatmentOption(),
      alternativeOptions: [],
      comparisonMatrix: { criteria: [], scores: {} },
      clinicalInsights: ['Insight 1'],
      patientConsiderations: ['Consideration 1'],
      urgencyLevel: 'ROUTINE',
      urgencyReasoning: 'No urgent concerns',
      patientFriendlySummary: 'Summary for patient',
    };

    const result = validateTreatmentPlan(plan);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should warn about overly optimistic success rate', () => {
    const plan: AITreatmentPlan = {
      id: 'plan-1',
      generatedAt: new Date(),
      patientId: 'patient-1',
      assessmentSummary: 'Test',
      recommendedOption: createTreatmentOption({ predictedSuccessRate: 100 }),
      alternativeOptions: [],
      comparisonMatrix: { criteria: [], scores: {} },
      clinicalInsights: [],
      patientConsiderations: [],
      urgencyLevel: 'ROUTINE',
      urgencyReasoning: 'Test',
      patientFriendlySummary: 'Test',
    };

    const result = validateTreatmentPlan(plan);

    expect(result.warnings.some((w) => w.includes('optimistic'))).toBe(true);
  });

  it('should warn about low success rate', () => {
    const plan: AITreatmentPlan = {
      id: 'plan-1',
      generatedAt: new Date(),
      patientId: 'patient-1',
      assessmentSummary: 'Test',
      recommendedOption: createTreatmentOption({ predictedSuccessRate: 55 }),
      alternativeOptions: [],
      comparisonMatrix: { criteria: [], scores: {} },
      clinicalInsights: [],
      patientConsiderations: [],
      urgencyLevel: 'ROUTINE',
      urgencyReasoning: 'Test',
      patientFriendlySummary: 'Test',
    };

    const result = validateTreatmentPlan(plan);

    expect(result.warnings.some((w) => w.includes('Low predicted success'))).toBe(true);
  });

  it('should error on invalid cost', () => {
    const plan: AITreatmentPlan = {
      id: 'plan-1',
      generatedAt: new Date(),
      patientId: 'patient-1',
      assessmentSummary: 'Test',
      recommendedOption: createTreatmentOption({
        estimatedCost: { min: 0, max: 5000, currency: 'RON' },
      }),
      alternativeOptions: [],
      comparisonMatrix: { criteria: [], scores: {} },
      clinicalInsights: [],
      patientConsiderations: [],
      urgencyLevel: 'ROUTINE',
      urgencyReasoning: 'Test',
      patientFriendlySummary: 'Test',
    };

    const result = validateTreatmentPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('cost'))).toBe(true);
  });

  it('should error on missing healing time', () => {
    const plan: AITreatmentPlan = {
      id: 'plan-1',
      generatedAt: new Date(),
      patientId: 'patient-1',
      assessmentSummary: 'Test',
      recommendedOption: createTreatmentOption({
        phases: [
          {
            name: 'Surgery',
            description: 'Test',
            procedures: [],
            durationWeeks: 1,
            requiresHealing: true,
            // Missing healingWeeks
          },
        ],
      }),
      alternativeOptions: [],
      comparisonMatrix: { criteria: [], scores: {} },
      clinicalInsights: [],
      patientConsiderations: [],
      urgencyLevel: 'ROUTINE',
      urgencyReasoning: 'Test',
      patientFriendlySummary: 'Test',
    };

    const result = validateTreatmentPlan(plan);

    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.includes('Healing time'))).toBe(true);
  });

  it('should warn about contraindications', () => {
    const plan: AITreatmentPlan = {
      id: 'plan-1',
      generatedAt: new Date(),
      patientId: 'patient-1',
      assessmentSummary: 'Test',
      recommendedOption: createTreatmentOption({
        contraindications: ['Active infection', 'Uncontrolled diabetes'],
      }),
      alternativeOptions: [],
      comparisonMatrix: { criteria: [], scores: {} },
      clinicalInsights: [],
      patientConsiderations: [],
      urgencyLevel: 'ROUTINE',
      urgencyReasoning: 'Test',
      patientFriendlySummary: 'Test',
    };

    const result = validateTreatmentPlan(plan);

    expect(result.warnings.some((w) => w.includes('contraindication'))).toBe(true);
  });
});
