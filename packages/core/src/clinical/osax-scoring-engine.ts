/**
 * @fileoverview OSAX Scoring Engine
 *
 * Orchestration layer for OSAX clinical scoring.
 * Combines domain scoring policy with infrastructure concerns.
 *
 * @module core/clinical/osax-scoring-engine
 */

import {
  OsaxClinicalScore,
  calculateScore,
  determineTreatmentEligibility,
  type OsaxClinicalIndicators,
  type OsaxScoringResult,
  type TreatmentEligibilityResult,
  type IOsaxCaseRepository,
  type OsaxCase,
  createOsaxEventMetadata,
  createOsaxCaseScoredEvent,
  type OsaxCaseScoredEvent,
} from '@medicalcor/domain';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Scoring engine dependencies
 */
export interface OsaxScoringEngineDeps {
  readonly caseRepository: IOsaxCaseRepository;
  readonly eventPublisher?: EventPublisher;
  readonly metricsCollector?: MetricsCollector;
  readonly auditLogger?: AuditLogger;
}

/**
 * Event publisher interface
 */
export interface EventPublisher {
  publish(event: OsaxCaseScoredEvent): Promise<void>;
}

/**
 * Metrics collector interface
 */
export interface MetricsCollector {
  recordScoring(result: OsaxScoringResult, durationMs: number): void;
  recordSeverityDistribution(severity: string): void;
}

/**
 * Audit logger interface
 */
export interface AuditLogger {
  logScoringEvent(
    caseId: string,
    score: OsaxClinicalScore,
    method: 'SYSTEM' | 'PHYSICIAN'
  ): Promise<void>;
}

/**
 * Score case input
 */
export interface ScoreCaseInput {
  readonly caseId: string;
  readonly indicators: OsaxClinicalIndicators;
  readonly patientAge?: number;
  readonly hasSymptoms?: boolean;
  readonly correlationId: string;
  readonly actor?: string;
}

/**
 * Score case result
 */
export interface ScoreCaseResult {
  readonly success: boolean;
  readonly score?: OsaxClinicalScore;
  readonly scoringResult?: OsaxScoringResult;
  readonly treatmentEligibility?: TreatmentEligibilityResult;
  readonly updatedCase?: OsaxCase;
  readonly event?: OsaxCaseScoredEvent;
  readonly error?: string;
}

/**
 * Batch scoring input
 */
export interface BatchScoreInput {
  readonly cases: Array<{
    readonly caseId: string;
    readonly indicators: OsaxClinicalIndicators;
  }>;
  readonly correlationId: string;
}

/**
 * Batch scoring result
 */
export interface BatchScoreResult {
  readonly successCount: number;
  readonly failureCount: number;
  readonly results: Array<{
    readonly caseId: string;
    readonly success: boolean;
    readonly score?: OsaxClinicalScore;
    readonly error?: string;
  }>;
}

// ============================================================================
// SCORING ENGINE
// ============================================================================

/**
 * OsaxScoringEngine
 *
 * Orchestrates clinical scoring operations with:
 * - Domain scoring policy execution
 * - Case repository updates
 * - Event emission
 * - Metrics collection
 * - Audit logging
 */
export class OsaxScoringEngine {
  private readonly deps: OsaxScoringEngineDeps;

  constructor(deps: OsaxScoringEngineDeps) {
    this.deps = deps;
  }

  /**
   * Score a single case
   */
  async scoreCase(input: ScoreCaseInput): Promise<ScoreCaseResult> {
    const startTime = Date.now();

    try {
      // 1. Fetch the case
      const caseResult = await this.deps.caseRepository.findById(input.caseId);
      if (!caseResult.success) {
        return { success: false, error: caseResult.error.message };
      }
      if (!caseResult.value) {
        return { success: false, error: 'Case not found' };
      }

      const osaxCase = caseResult.value;

      // 2. Calculate score using domain policy
      const scoringResult = calculateScore(input.indicators, undefined, input.patientAge);
      const score = scoringResult.clinicalScore;

      // 3. Determine treatment eligibility
      const treatmentEligibility = determineTreatmentEligibility(
        score,
        input.indicators,
        input.hasSymptoms ?? true
      );

      // 4. Update case in repository
      const updateResult = await this.deps.caseRepository.recordClinicalScore(
        input.caseId,
        score,
        'SYSTEM',
        `Automated scoring: ${scoringResult.clinicalNotes.join('; ')}`
      );

      if (!updateResult.success) {
        return { success: false, error: updateResult.error.message };
      }

      // 5. Create and publish domain event
      const metadata = createOsaxEventMetadata(
        input.correlationId,
        'osax-scoring-engine',
        undefined,
        input.actor
      );

      const event = createOsaxCaseScoredEvent(input.caseId, {
        caseNumber: osaxCase.caseNumber,
        severity: score.severity,
        indicators: {
          ahi: input.indicators.ahi,
          odi: input.indicators.odi,
          spo2Nadir: input.indicators.spo2Nadir,
          essScore: input.indicators.essScore,
        },
        compositeScore: score.compositeScore,
        confidence: score.confidence,
        scoringMethod: 'SYSTEM',
        treatmentRecommendation: score.treatmentRecommendation,
        cardiovascularRisk: score.cardiovascularRisk,
        riskFlags: scoringResult.riskFlags,
        previousSeverity: osaxCase.clinicalScore?.severity,
        previousCompositeScore: osaxCase.clinicalScore?.compositeScore,
      }, metadata);

      if (this.deps.eventPublisher) {
        await this.deps.eventPublisher.publish(event);
      }

      // 6. Record metrics
      const durationMs = Date.now() - startTime;
      if (this.deps.metricsCollector) {
        this.deps.metricsCollector.recordScoring(scoringResult, durationMs);
        this.deps.metricsCollector.recordSeverityDistribution(score.severity);
      }

      // 7. Log audit entry
      if (this.deps.auditLogger) {
        await this.deps.auditLogger.logScoringEvent(input.caseId, score, 'SYSTEM');
      }

      return {
        success: true,
        score,
        scoringResult,
        treatmentEligibility,
        updatedCase: updateResult.value,
        event,
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      return { success: false, error };
    }
  }

  /**
   * Score from raw study data
   */
  async scoreFromStudyData(
    caseId: string,
    studyData: RawStudyData,
    correlationId: string
  ): Promise<ScoreCaseResult> {
    // Extract indicators from raw study data
    const indicators = this.extractIndicators(studyData);

    return this.scoreCase({
      caseId,
      indicators,
      patientAge: studyData.patientAge,
      hasSymptoms: studyData.reportedSymptoms,
      correlationId,
    });
  }

  /**
   * Batch score multiple cases
   */
  async batchScore(input: BatchScoreInput): Promise<BatchScoreResult> {
    const results: BatchScoreResult['results'] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const caseInput of input.cases) {
      const result = await this.scoreCase({
        caseId: caseInput.caseId,
        indicators: caseInput.indicators,
        correlationId: `${input.correlationId}_${caseInput.caseId}`,
      });

      if (result.success) {
        successCount++;
        results.push({
          caseId: caseInput.caseId,
          success: true,
          score: result.score,
        });
      } else {
        failureCount++;
        results.push({
          caseId: caseInput.caseId,
          success: false,
          error: result.error,
        });
      }
    }

    return {
      successCount,
      failureCount,
      results,
    };
  }

  /**
   * Rescore case with updated indicators
   */
  async rescoreCase(
    caseId: string,
    updatedIndicators: Partial<OsaxClinicalIndicators>,
    correlationId: string,
    reason: string
  ): Promise<ScoreCaseResult> {
    // Fetch current case
    const caseResult = await this.deps.caseRepository.findById(caseId);
    if (!caseResult.success || !caseResult.value) {
      return { success: false, error: 'Case not found' };
    }

    const osaxCase = caseResult.value;

    // Get current indicators and merge with updates
    const currentIndicators = osaxCase.clinicalScore?.indicators;
    if (!currentIndicators) {
      return { success: false, error: 'No existing score to update' };
    }

    const mergedIndicators: OsaxClinicalIndicators = {
      ...currentIndicators,
      ...updatedIndicators,
    };

    return this.scoreCase({
      caseId,
      indicators: mergedIndicators,
      correlationId,
    });
  }

  /**
   * Get scoring summary for a case
   */
  async getScoringSummary(caseId: string): Promise<ScoringSummary | null> {
    const caseResult = await this.deps.caseRepository.findById(caseId);
    if (!caseResult.success || !caseResult.value) {
      return null;
    }

    const osaxCase = caseResult.value;

    if (!osaxCase.clinicalScore) {
      return {
        hasScore: false,
        scoreHistory: osaxCase.scoreHistory.map((h) => ({
          scoredAt: h.scoredAt,
          severity: h.score.severity,
          compositeScore: h.score.compositeScore,
          scoredBy: h.scoredBy,
        })),
      };
    }

    const score = osaxCase.clinicalScore;
    const treatmentEligibility = determineTreatmentEligibility(
      score,
      score.indicators,
      true
    );

    return {
      hasScore: true,
      currentScore: {
        severity: score.severity,
        compositeScore: score.compositeScore,
        ahi: score.indicators.ahi,
        cardiovascularRisk: score.cardiovascularRisk,
        treatmentRecommendation: score.treatmentRecommendation,
      },
      treatmentEligibility: {
        isEligible: treatmentEligibility.isEligible,
        primaryRecommendation: treatmentEligibility.primaryRecommendation,
        medicareEligible: treatmentEligibility.insuranceCriteriaMet.medicareEligible,
      },
      scoreHistory: osaxCase.scoreHistory.map((h) => ({
        scoredAt: h.scoredAt,
        severity: h.score.severity,
        compositeScore: h.score.compositeScore,
        scoredBy: h.scoredBy,
      })),
    };
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private extractIndicators(studyData: RawStudyData): OsaxClinicalIndicators {
    return {
      ahi: studyData.ahi,
      odi: studyData.odi,
      spo2Nadir: studyData.spo2Nadir,
      spo2Average: studyData.spo2Average,
      sleepEfficiency: studyData.sleepEfficiency,
      essScore: studyData.essScore,
      bmi: studyData.bmi,
      neckCircumference: studyData.neckCircumference,
      totalSleepTime: studyData.totalSleepTimeMinutes,
      remAhi: studyData.remAhi,
      supineAhi: studyData.supineAhi,
    };
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Raw study data from polysomnography
 */
export interface RawStudyData {
  readonly ahi: number;
  readonly odi: number;
  readonly spo2Nadir: number;
  readonly spo2Average: number;
  readonly sleepEfficiency: number;
  readonly essScore: number;
  readonly bmi?: number;
  readonly neckCircumference?: number;
  readonly totalSleepTimeMinutes?: number;
  readonly remAhi?: number;
  readonly supineAhi?: number;
  readonly patientAge?: number;
  readonly reportedSymptoms?: boolean;
}

/**
 * Scoring summary for display
 */
export interface ScoringSummary {
  readonly hasScore: boolean;
  readonly currentScore?: {
    readonly severity: string;
    readonly compositeScore: number;
    readonly ahi: number;
    readonly cardiovascularRisk: string;
    readonly treatmentRecommendation: string;
  };
  readonly treatmentEligibility?: {
    readonly isEligible: boolean;
    readonly primaryRecommendation: string;
    readonly medicareEligible: boolean;
  };
  readonly scoreHistory: Array<{
    readonly scoredAt: Date;
    readonly severity: string;
    readonly compositeScore: number;
    readonly scoredBy: string;
  }>;
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create scoring engine instance
 */
export function createOsaxScoringEngine(deps: OsaxScoringEngineDeps): OsaxScoringEngine {
  return new OsaxScoringEngine(deps);
}
