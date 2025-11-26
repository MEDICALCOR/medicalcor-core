import { task, schedules, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { createIntegrationClients } from '@medicalcor/integrations';

/**
 * Retention Scoring Workflow
 * AI-powered churn prediction and retention scoring for patient management
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
 * Calculate retention score based on patient metrics
 * Uses a weighted formula considering multiple factors
 */
function calculateRetentionScore(params: {
  daysInactive: number;
  canceledAppointments: number;
  npsScore: number | null;
  lifetimeValue: number;
  totalTreatments: number;
}): {
  score: number;
  churnRisk: 'SCAZUT' | 'MEDIU' | 'RIDICAT' | 'FOARTE_RIDICAT';
  followUpPriority: 'URGENTA' | 'RIDICATA' | 'MEDIE' | 'SCAZUTA';
} {
  let score = 100;

  // Factor 1: Days Inactive (max -40 points)
  // 0-7 days: no penalty
  // 8-30 days: -10 points
  // 31-60 days: -20 points
  // 61-90 days: -30 points
  // 90+ days: -40 points
  if (params.daysInactive > 90) {
    score -= 40;
  } else if (params.daysInactive > 60) {
    score -= 30;
  } else if (params.daysInactive > 30) {
    score -= 20;
  } else if (params.daysInactive > 7) {
    score -= 10;
  }

  // Factor 2: Canceled Appointments (max -30 points)
  // Each cancellation: -10 points
  score -= Math.min(params.canceledAppointments * 10, 30);

  // Factor 3: NPS Score (max -20 points or +10 bonus)
  if (params.npsScore !== null) {
    if (params.npsScore <= 6) {
      // Detractor: -20 points
      score -= 20;
    } else if (params.npsScore <= 8) {
      // Passive: -5 points
      score -= 5;
    } else {
      // Promoter: +10 bonus
      score += 10;
    }
  }

  // Factor 4: Engagement bonus based on treatments
  // 1-2 treatments: no bonus
  // 3-5 treatments: +5 points
  // 6+ treatments: +10 points
  if (params.totalTreatments >= 6) {
    score += 10;
  } else if (params.totalTreatments >= 3) {
    score += 5;
  }

  // Factor 5: High-value patient bonus
  // LTV > 20000: +5 points
  if (params.lifetimeValue > 20000) {
    score += 5;
  }

  // Clamp score to 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine churn risk
  let churnRisk: 'SCAZUT' | 'MEDIU' | 'RIDICAT' | 'FOARTE_RIDICAT';
  if (score >= 80) {
    churnRisk = 'SCAZUT';
  } else if (score >= 50) {
    churnRisk = 'MEDIU';
  } else if (score >= 30) {
    churnRisk = 'RIDICAT';
  } else {
    churnRisk = 'FOARTE_RIDICAT';
  }

  // Determine follow-up priority (combines risk and value)
  let followUpPriority: 'URGENTA' | 'RIDICATA' | 'MEDIE' | 'SCAZUTA';
  const isHighValue = params.lifetimeValue > 10000;

  if (churnRisk === 'FOARTE_RIDICAT' || (churnRisk === 'RIDICAT' && isHighValue)) {
    followUpPriority = 'URGENTA';
  } else if (churnRisk === 'RIDICAT' || (churnRisk === 'MEDIU' && isHighValue)) {
    followUpPriority = 'RIDICATA';
  } else if (churnRisk === 'MEDIU') {
    followUpPriority = 'MEDIE';
  } else {
    followUpPriority = 'SCAZUTA';
  }

  return { score, churnRisk, followUpPriority };
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
    await batchRetentionScoring.trigger({
      correlationId,
    });

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
