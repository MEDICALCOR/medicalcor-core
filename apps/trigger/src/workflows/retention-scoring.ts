import { task, schedules, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { createRetentionScoringService, type RetentionMetricsInput } from '@medicalcor/domain';
import type { ChurnRisk as ChurnRiskLevel, FollowUpPriority } from '@medicalcor/types';

/**
 * Retention Scoring Workflow (M8 Milestone)
 * AI-powered churn prediction and retention scoring for patient management
 *
 * Uses the domain-layer RetentionScoringService for consistent scoring logic.
 *
 * Calculates:
 * - Retention Score (0-100): Probability of patient returning
 * - Churn Risk: SCAZUT/MEDIU/RIDICAT/FOARTE_RIDICAT
 * - Follow-up Priority: Based on value and risk
 */

// Initialize clients
function getClients() {
  return createIntegrationClients({
    source: 'retention-scoring',
    includeOpenAI: false,
  });
}

// Initialize domain service
const retentionScoringService = createRetentionScoringService();

// Input schema for single patient scoring
export const RetentionScoringPayloadSchema = z.object({
  contactId: z.string(),
  correlationId: z.string(),
});

// Input schema for batch scoring
export const BatchRetentionScoringPayloadSchema = z.object({
  correlationId: z.string(),
});

/**
 * Calculate retention score using the domain service
 * Provides a thin wrapper for backward compatibility
 */
function calculateRetentionScore(params: RetentionMetricsInput): {
  score: number;
  churnRisk: ChurnRiskLevel;
  followUpPriority: FollowUpPriority;
} {
  return retentionScoringService.calculateSimpleScore(params);
}

/**
 * Score a single patient's retention metrics
 */
export const scorePatientRetention = task({
  id: 'retention-scoring-single',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof RetentionScoringPayloadSchema>) => {
    const { contactId, correlationId } = payload;
    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      throw new Error('HubSpot client not configured');
    }

    logger.info('Starting retention scoring for patient', { contactId, correlationId });

    // Fetch patient data from HubSpot
    const contact = await hubspot.getContact(contactId);

    // Extract metrics
    const daysInactive = parseInt(contact.properties.days_inactive ?? '0', 10);
    const canceledAppointments = parseInt(contact.properties.canceled_appointments ?? '0', 10);
    const npsScoreRaw = contact.properties.nps_score;
    const npsScore = npsScoreRaw ? parseInt(npsScoreRaw, 10) : null;
    const lifetimeValue = parseInt(contact.properties.lifetime_value ?? '0', 10);
    const totalTreatments = parseInt(contact.properties.total_treatments ?? '0', 10);

    // Calculate retention score
    const result = calculateRetentionScore({
      daysInactive,
      canceledAppointments,
      npsScore,
      lifetimeValue,
      totalTreatments,
    });

    logger.info('Retention score calculated', {
      contactId,
      score: result.score,
      churnRisk: result.churnRisk,
      followUpPriority: result.followUpPriority,
      correlationId,
    });

    // Update HubSpot contact
    await hubspot.updateRetentionMetrics(contactId, {
      retentionScore: result.score,
      churnRisk: result.churnRisk,
      daysInactive,
      followUpPriority: result.followUpPriority,
    });

    // Emit event for high-risk patients
    if (result.churnRisk === 'RIDICAT' || result.churnRisk === 'FOARTE_RIDICAT') {
      await eventStore.emit({
        type: 'patient.churn_risk_detected',
        correlationId,
        aggregateId: contactId,
        aggregateType: 'patient',
        payload: {
          contactId,
          retentionScore: result.score,
          churnRisk: result.churnRisk,
          followUpPriority: result.followUpPriority,
          lifetimeValue,
          patientName:
            `${contact.properties.firstname ?? ''} ${contact.properties.lastname ?? ''}`.trim(),
          phone: contact.properties.phone,
        },
      });

      logger.warn('High churn risk patient detected', {
        contactId,
        churnRisk: result.churnRisk,
        correlationId,
      });
    }

    return {
      success: true,
      contactId,
      retentionScore: result.score,
      churnRisk: result.churnRisk,
      followUpPriority: result.followUpPriority,
    };
  },
});

/**
 * Batch process all patients for retention scoring
 * Typically run as a scheduled job
 */
export const batchRetentionScoring = task({
  id: 'retention-scoring-batch',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof BatchRetentionScoringPayloadSchema>) => {
    const { correlationId } = payload;
    const { hubspot, eventStore } = getClients();

    if (!hubspot) {
      throw new Error('HubSpot client not configured');
    }

    logger.info('Starting batch retention scoring', { correlationId });

    // Get all patients with completed treatments (not just leads)
    const patients = await hubspot.searchAllContacts({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'lifecyclestage',
              operator: 'EQ',
              value: 'customer',
            },
          ],
        },
      ],
      properties: [
        'firstname',
        'lastname',
        'phone',
        'days_inactive',
        'canceled_appointments',
        'nps_score',
        'lifetime_value',
        'total_treatments',
        'last_appointment_date',
      ],
    });

    logger.info(`Found ${patients.length} patients to score`, { correlationId });

    let scored = 0;
    let highRisk = 0;
    const errors: string[] = [];

    for (const patient of patients) {
      try {
        // Calculate days inactive if not set
        let daysInactive = parseInt(patient.properties.days_inactive ?? '0', 10);
        if (patient.properties.last_appointment_date) {
          const lastAppointment = new Date(patient.properties.last_appointment_date);
          const now = new Date();
          daysInactive = Math.floor(
            (now.getTime() - lastAppointment.getTime()) / (1000 * 60 * 60 * 24)
          );
        }

        const canceledAppointments = parseInt(patient.properties.canceled_appointments ?? '0', 10);
        const npsScoreRaw = patient.properties.nps_score;
        const npsScore = npsScoreRaw ? parseInt(npsScoreRaw, 10) : null;
        const lifetimeValue = parseInt(patient.properties.lifetime_value ?? '0', 10);
        const totalTreatments = parseInt(patient.properties.total_treatments ?? '0', 10);

        const result = calculateRetentionScore({
          daysInactive,
          canceledAppointments,
          npsScore,
          lifetimeValue,
          totalTreatments,
        });

        // Update HubSpot
        await hubspot.updateRetentionMetrics(patient.id, {
          retentionScore: result.score,
          churnRisk: result.churnRisk,
          daysInactive,
          followUpPriority: result.followUpPriority,
        });

        scored++;

        if (result.churnRisk === 'RIDICAT' || result.churnRisk === 'FOARTE_RIDICAT') {
          highRisk++;
        }

        // Rate limiting - avoid HubSpot API limits
        if (scored % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${patient.id}: ${errorMsg}`);
        logger.error('Failed to score patient', { patientId: patient.id, error: errorMsg });
      }
    }

    // Emit summary event
    await eventStore.emit({
      type: 'retention.batch_scoring_completed',
      correlationId,
      aggregateId: 'system',
      aggregateType: 'retention',
      payload: {
        totalPatients: patients.length,
        scored,
        highRiskCount: highRisk,
        errors: errors.length,
      },
    });

    logger.info('Batch retention scoring completed', {
      totalPatients: patients.length,
      scored,
      highRiskCount: highRisk,
      errorsCount: errors.length,
      correlationId,
    });

    return {
      success: true,
      totalPatients: patients.length,
      scored,
      highRiskCount: highRisk,
      errors,
    };
  },
});

/**
 * Daily scheduled job for retention scoring
 * Runs every day at 6:00 AM
 */
export const dailyRetentionScoring = schedules.task({
  id: 'daily-retention-scoring',
  cron: '0 6 * * *', // Every day at 6:00 AM
  run: async () => {
    const correlationId = `daily-retention-${new Date().toISOString().split('T')[0]}`;

    logger.info('Starting daily retention scoring job', { correlationId });

    // Trigger batch scoring
    await batchRetentionScoring.trigger(
      {
        correlationId,
      },
      {
        idempotencyKey: IdempotencyKeys.cronJob('retention-scoring', getTodayString()),
      }
    );

    return {
      triggered: true,
      correlationId,
    };
  },
});

/**
 * Update inactivity days for all patients
 * Should run daily before retention scoring
 */
export const updateInactivityDays = task({
  id: 'update-inactivity-days',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: { correlationId: string }) => {
    const { correlationId } = payload;
    const { hubspot } = getClients();

    if (!hubspot) {
      throw new Error('HubSpot client not configured');
    }

    logger.info('Updating inactivity days for all patients', { correlationId });

    // Get all patients with last_appointment_date
    const patients = await hubspot.searchAllContacts({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'lifecyclestage',
              operator: 'EQ',
              value: 'customer',
            },
          ],
        },
      ],
      properties: ['last_appointment_date', 'last_treatment_date'],
    });

    const now = new Date();
    let updated = 0;

    for (const patient of patients) {
      const lastActivity =
        patient.properties.last_appointment_date ?? patient.properties.last_treatment_date;

      if (lastActivity) {
        const lastDate = new Date(lastActivity);
        const daysInactive = Math.floor(
          (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        await hubspot.updateContact(patient.id, {
          days_inactive: daysInactive.toString(),
        });

        updated++;

        // Rate limiting
        if (updated % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    }

    logger.info('Inactivity days updated', { updated, correlationId });

    return { success: true, updated };
  },
});
