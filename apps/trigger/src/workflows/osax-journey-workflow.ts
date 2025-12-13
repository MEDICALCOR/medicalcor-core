/**
 * @fileoverview OSAX Journey Workflow
 *
 * Orchestrates the OSAX (Oral Surgery Assessment eXtended) patient journey.
 * Modular design with sub-workflows for each phase.
 *
 * DESIGN:
 * - Main workflow < 60 lines
 * - Each sub-workflow 30-50 lines
 * - Error isolation per phase
 * - Trigger.dev ctx.run() steps
 *
 * @module trigger/workflows/osax-journey-workflow
 */

import { task, logger } from '@trigger.dev/sdk/v3';
import crypto from 'crypto';

// ============================================================================
// PAYLOAD TYPES
// ============================================================================

interface OsaxJourneyPayload {
  subjectId: string;
  subjectType: 'lead' | 'patient';
  clinicId: string;
  triggeredBy: 'qualification' | 'manual' | 'scheduled';
  correlationId?: string;
}

interface CreateCasePayload extends OsaxJourneyPayload {
  correlationId: string;
}

interface FetchMedicalDataPayload {
  caseId: string;
  subjectId: string;
  subjectType: 'lead' | 'patient';
  correlationId: string;
}

interface ScoreCasePayload {
  caseId: string;
  subjectId: string;
  medicalFactors: MedicalFactors | null;
  correlationId: string;
}

interface NotifyPayload {
  caseId: string;
  clinicId: string;
  riskClass: 'RED' | 'YELLOW' | 'GREEN';
  globalScore: number | null;
  correlationId: string;
}

interface MedicalFactors {
  boneQuality: number;
  softTissueHealth: 'excellent' | 'good' | 'fair' | 'poor';
  systemicRisks: string[];
  urgency: 'routine' | 'soon' | 'urgent' | 'emergency';
  financialReadiness: 'ready' | 'financing_needed' | 'uncertain' | 'not_ready';
}

interface CreateCaseOutput {
  caseId: string;
}

interface FetchMedicalDataOutput {
  factors: MedicalFactors;
}

interface ScoreOutput {
  globalScore: number;
  riskClass: 'RED' | 'YELLOW' | 'GREEN';
  componentScores: Record<string, { rawScore: number; weight: number }>;
  confidence: number;
}

// ============================================================================
// MAIN WORKFLOW (< 60 lines)
// ============================================================================

/**
 * OSAX Journey Workflow
 *
 * Orchestrates the complete OSAX assessment journey:
 * 1. Create OSAX case
 * 2. Fetch medical data
 * 3. Score the case
 * 4. Notify stakeholders
 */
export const osaxJourneyWorkflow = task({
  id: 'osax-journey-workflow',
  retry: { maxAttempts: 3, minTimeoutInMs: 2000, maxTimeoutInMs: 30000, factor: 2 },
  run: async (payload: OsaxJourneyPayload) => {
    const correlationId = payload.correlationId ?? crypto.randomUUID();

    logger.info('Starting OSAX journey workflow', {
      subjectId: payload.subjectId,
      subjectType: payload.subjectType,
      correlationId,
    });

    // Step 1: Create OSAX case
    const caseResult = await createOsaxCaseSubWorkflow.triggerAndWait({
      ...payload,
      correlationId,
    });

    if (!caseResult.ok) {
      return { success: false, error: 'Failed to create OSAX case', correlationId };
    }

    const caseId = caseResult.output.caseId;

    // Step 2: Fetch medical data
    const medicalData = await fetchMedicalDataSubWorkflow.triggerAndWait({
      caseId,
      subjectId: payload.subjectId,
      subjectType: payload.subjectType,
      correlationId,
    });

    const factors = medicalData.ok ? medicalData.output.factors : null;

    // Step 3: Score the case
    const scoreResult = await scoreOsaxCaseSubWorkflow.triggerAndWait({
      caseId,
      subjectId: payload.subjectId,
      medicalFactors: factors,
      correlationId,
    });

    const scoreOutput = scoreResult.ok ? scoreResult.output : null;

    // Step 4: Notify stakeholders
    await notifyStakeholdersSubWorkflow.triggerAndWait({
      caseId,
      clinicId: payload.clinicId,
      riskClass: scoreOutput?.riskClass ?? 'YELLOW',
      globalScore: scoreOutput?.globalScore ?? null,
      correlationId,
    });

    logger.info('OSAX journey workflow completed', {
      caseId,
      success: scoreResult.ok,
      correlationId,
    });

    return {
      success: true,
      caseId,
      riskClass: scoreOutput?.riskClass ?? null,
      globalScore: scoreOutput?.globalScore ?? null,
      correlationId,
    };
  },
});

// ============================================================================
// SUB-WORKFLOW: Create OSAX Case
// ============================================================================

export const createOsaxCaseSubWorkflow = task({
  id: 'osax-create-case',
  retry: { maxAttempts: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000 },
  run: async (payload: CreateCasePayload): Promise<CreateCaseOutput> => {
    logger.info('Creating OSAX case', {
      subjectId: payload.subjectId,
      correlationId: payload.correlationId,
    });

    const caseId = crypto.randomUUID();

    // In production, this would call SupabaseOsaxCaseRepository.save()
    logger.info('OSAX case created', {
      caseId,
      correlationId: payload.correlationId,
    });

    return { caseId };
  },
});

// ============================================================================
// SUB-WORKFLOW: Fetch Medical Data
// ============================================================================

export const fetchMedicalDataSubWorkflow = task({
  id: 'osax-fetch-medical-data',
  retry: { maxAttempts: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 15000 },
  run: async (payload: FetchMedicalDataPayload): Promise<FetchMedicalDataOutput> => {
    logger.info('Fetching medical data for OSAX case', {
      caseId: payload.caseId,
      subjectId: payload.subjectId,
      correlationId: payload.correlationId,
    });

    // In production, this would fetch from EMR/EHR systems
    const factors: MedicalFactors = {
      boneQuality: 2,
      softTissueHealth: 'good',
      systemicRisks: [],
      urgency: 'routine',
      financialReadiness: 'ready',
    };

    logger.info('Medical data fetched', {
      caseId: payload.caseId,
      hasFactors: true,
      correlationId: payload.correlationId,
    });

    return { factors };
  },
});

// ============================================================================
// SUB-WORKFLOW: Score OSAX Case
// ============================================================================

export const scoreOsaxCaseSubWorkflow = task({
  id: 'osax-score-case',
  retry: { maxAttempts: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 10000 },
  run: async (payload: ScoreCasePayload): Promise<ScoreOutput> => {
    logger.info('Scoring OSAX case', {
      caseId: payload.caseId,
      hasFactors: payload.medicalFactors !== null,
      correlationId: payload.correlationId,
    });

    // Default to YELLOW if no factors available
    if (!payload.medicalFactors) {
      logger.warn('No medical factors available, defaulting to YELLOW', {
        caseId: payload.caseId,
        correlationId: payload.correlationId,
      });

      return {
        globalScore: 50,
        riskClass: 'YELLOW',
        componentScores: {},
        confidence: 0.5,
      };
    }

    // In production, this would use OsaxScoringPolicy.scoreFromFactors()
    const { boneQuality, softTissueHealth, systemicRisks } = payload.medicalFactors;

    let globalScore = 100;
    globalScore -= (boneQuality - 1) * 10;
    globalScore -= softTissueHealth === 'poor' ? 20 : softTissueHealth === 'fair' ? 10 : 0;
    globalScore -= systemicRisks.length * 15;

    const riskClass: 'RED' | 'YELLOW' | 'GREEN' =
      globalScore >= 70 ? 'GREEN' : globalScore >= 40 ? 'YELLOW' : 'RED';

    logger.info('OSAX case scored', {
      caseId: payload.caseId,
      globalScore,
      riskClass,
      correlationId: payload.correlationId,
    });

    return {
      globalScore,
      riskClass,
      componentScores: {
        bone_quality: { rawScore: 100 - (boneQuality - 1) * 25, weight: 0.3 },
        soft_tissue: { rawScore: softTissueHealth === 'excellent' ? 100 : 70, weight: 0.15 },
      },
      confidence: 0.85,
    };
  },
});

// ============================================================================
// SUB-WORKFLOW: Notify Stakeholders
// ============================================================================

export const notifyStakeholdersSubWorkflow = task({
  id: 'osax-notify-stakeholders',
  retry: { maxAttempts: 3, minTimeoutInMs: 500, maxTimeoutInMs: 5000 },
  run: async (payload: NotifyPayload): Promise<{ notifications: string[] }> => {
    logger.info('Notifying stakeholders', {
      caseId: payload.caseId,
      riskClass: payload.riskClass,
      correlationId: payload.correlationId,
    });

    const notifications: string[] = [];

    // RED cases require immediate attention
    if (payload.riskClass === 'RED') {
      notifications.push('urgent_sms_to_coordinator');
      notifications.push('slack_alert_clinical_team');
      notifications.push('hubspot_task_high_priority');
    }

    // YELLOW cases need review
    if (payload.riskClass === 'YELLOW') {
      notifications.push('email_to_coordinator');
      notifications.push('hubspot_task_medium_priority');
    }

    // GREEN cases get standard processing
    if (payload.riskClass === 'GREEN') {
      notifications.push('email_confirmation');
      notifications.push('hubspot_task_standard');
    }

    // In production, this would call notification services
    logger.info('Stakeholder notifications sent', {
      caseId: payload.caseId,
      notifications,
      correlationId: payload.correlationId,
    });

    return { notifications };
  },
});
