import { task, schedules, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import { IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';

// Use Node.js crypto for UUID generation
function uuidv4(): string {
  return crypto.randomUUID();
}
import {
  createPLTVScoringService,
  type PLTVPredictionInput,
  type HistoricalLTVInput,
  type PaymentBehaviorInput,
  type EngagementMetricsInput,
  type ProcedureInterestInput,
} from '@medicalcor/domain';

/**
 * LTV Orchestration Workflow
 *
 * Complete orchestration for the Lead → Case → Payment → LTV flow.
 * This workflow bridges the gap between payment events and LTV calculations.
 *
 * Flow:
 * 1. Payment received (from Stripe webhook via payment-handler)
 * 2. Record payment in database
 * 3. Link payment to case (create case if needed)
 * 4. Database trigger auto-updates case totals
 * 5. Recalculate pLTV for the lead
 * 6. Emit ltv.updated event
 *
 * @module trigger/workflows/ltv-orchestration
 */

// ============================================================================
// DATABASE POOL (lazy initialization)
// ============================================================================

let pool: Pool | null = null;

function getPool(): Pool {
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });
  return pool;
}

function getClients() {
  return createIntegrationClients({
    source: 'ltv-orchestration',
    includeOpenAI: false,
  });
}

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Payload for recording a payment to a case
 */
export const RecordPaymentPayloadSchema = z.object({
  paymentId: z.string().describe('Stripe payment intent ID'),
  leadId: z.string().uuid().describe('Lead UUID'),
  clinicId: z.string().uuid().describe('Clinic UUID'),
  caseId: z.string().uuid().optional().describe('Optional case UUID if known'),
  treatmentPlanId: z.string().uuid().optional().describe('Optional treatment plan UUID'),
  amount: z.number().positive().describe('Payment amount in cents'),
  currency: z.string().default('EUR'),
  method: z
    .enum(['cash', 'card', 'bank_transfer', 'financing', 'insurance', 'check', 'other'])
    .default('card'),
  type: z
    .enum(['payment', 'deposit', 'installment', 'refund', 'adjustment', 'financing_payout'])
    .default('payment'),
  processorName: z.string().default('stripe'),
  processorTransactionId: z.string(),
  correlationId: z.string(),
});

export type RecordPaymentPayload = z.infer<typeof RecordPaymentPayloadSchema>;

/**
 * Payload for recalculating pLTV
 */
export const RecalculatePLTVPayloadSchema = z.object({
  leadId: z.string().uuid(),
  clinicId: z.string().uuid(),
  correlationId: z.string(),
  reason: z.string().optional().describe('Reason for recalculation'),
});

export type RecalculatePLTVPayload = z.infer<typeof RecalculatePLTVPayloadSchema>;

/**
 * Payload for batch LTV update
 */
export const BatchLTVUpdatePayloadSchema = z.object({
  clinicId: z.string().uuid().optional().describe('Optional clinic filter'),
  correlationId: z.string(),
});

// ============================================================================
// TASKS
// ============================================================================

/**
 * Record a payment to a case and trigger LTV recalculation
 *
 * This is the main orchestration task that:
 * 1. Finds or creates a case for the payment
 * 2. Records the payment in the database
 * 3. Triggers pLTV recalculation
 * 4. Emits LTV updated event
 */
export const recordPaymentToCase = task({
  id: 'ltv-record-payment-to-case',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: RecordPaymentPayload) => {
    const {
      paymentId,
      leadId,
      clinicId,
      caseId: existingCaseId,
      treatmentPlanId,
      amount,
      currency,
      method,
      type,
      processorName,
      processorTransactionId,
      correlationId,
    } = payload;

    const db = getPool();
    const { eventStore } = getClients();

    logger.info('Recording payment to case', {
      paymentId,
      leadId,
      clinicId,
      amount,
      correlationId,
    });

    // Step 1: Find or create a case for this payment
    let caseId = existingCaseId;

    if (!caseId) {
      // Find the most recent active case for this lead
      const findCaseResult = await db.query<{ id: string }>(
        `
        SELECT id FROM cases
        WHERE lead_id = $1 AND clinic_id = $2
        AND status NOT IN ('cancelled', 'completed')
        AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
        [leadId, clinicId]
      );

      if (findCaseResult.rows.length > 0) {
        caseId = findCaseResult.rows[0]!.id;
        logger.info('Found existing case for payment', { caseId, correlationId });
      } else {
        // Create a new case for this payment
        const newCaseId = uuidv4();

        // Generate case number
        const caseNumberResult = await db.query<{ case_number: string }>(
          'SELECT generate_case_number($1) as case_number',
          [clinicId]
        );
        const caseNumber = caseNumberResult.rows[0]!.case_number;

        // Use provided treatment plan or find the most recent one
        let planId = treatmentPlanId;
        if (!planId) {
          const planResult = await db.query<{ id: string }>(
            `
            SELECT id FROM treatment_plans
            WHERE lead_id = $1 AND clinic_id = $2
            AND deleted_at IS NULL
            ORDER BY created_at DESC
            LIMIT 1
          `,
            [leadId, clinicId]
          );
          planId = planResult.rows[0]?.id;
        }

        // If no treatment plan exists, create a generic one
        if (!planId) {
          planId = uuidv4();
          await db.query(
            `
            INSERT INTO treatment_plans (id, lead_id, clinic_id, name, status, created_at, updated_at)
            VALUES ($1, $2, $3, 'Auto-generated for payment', 'accepted', NOW(), NOW())
          `,
            [planId, leadId, clinicId]
          );
          logger.info('Created generic treatment plan', { treatmentPlanId: planId, correlationId });
        }

        // Create the case
        await db.query(
          `
          INSERT INTO cases (
            id, clinic_id, lead_id, treatment_plan_id, case_number,
            status, total_amount, paid_amount, currency, payment_status,
            created_at, updated_at, metadata
          ) VALUES (
            $1, $2, $3, $4, $5,
            'in_progress', $6, 0, $7, 'unpaid',
            NOW(), NOW(), '{}'
          )
        `,
          [newCaseId, clinicId, leadId, planId, caseNumber, amount / 100, currency]
        );

        caseId = newCaseId;
        logger.info('Created new case for payment', { caseId, caseNumber, correlationId });
      }
    }

    // Step 2: Generate payment reference and record payment
    const paymentRefResult = await db.query<{ next_seq: string }>(
      `
      SELECT COALESCE(MAX(
        CAST(SUBSTRING(payment_reference FROM 'PAY-[0-9]{4}-([0-9]+)') AS INTEGER)
      ), 0) + 1 as next_seq
      FROM payments
      WHERE clinic_id = $1
      AND payment_reference LIKE $2
    `,
      [clinicId, `PAY-${new Date().getFullYear()}-%`]
    );
    const nextSeq = parseInt(paymentRefResult.rows[0]?.next_seq ?? '1', 10);
    const paymentReference = `PAY-${new Date().getFullYear()}-${nextSeq.toString().padStart(6, '0')}`;

    const dbPaymentId = uuidv4();
    await db.query(
      `
      INSERT INTO payments (
        id, case_id, clinic_id, payment_reference, external_reference,
        amount, currency, type, method, status,
        processed_at, processor_name, processor_transaction_id,
        created_at, updated_at, metadata
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, 'completed',
        NOW(), $10, $11,
        NOW(), NOW(), $12
      )
    `,
      [
        dbPaymentId,
        caseId,
        clinicId,
        paymentReference,
        paymentId, // Stripe payment ID as external reference
        amount / 100, // Convert from cents to EUR
        currency,
        type,
        method,
        processorName,
        processorTransactionId,
        JSON.stringify({ stripePaymentId: paymentId, correlationId }),
      ]
    );

    logger.info('Payment recorded in database', {
      paymentId: dbPaymentId,
      caseId,
      paymentReference,
      amount: amount / 100,
      correlationId,
    });

    // Note: The database trigger (update_case_payment_totals) automatically
    // updates the case's paid_amount and payment_status

    // Step 3: Trigger pLTV recalculation
    await recalculatePLTV.trigger(
      {
        leadId,
        clinicId,
        correlationId,
        reason: 'payment_received',
      },
      {
        idempotencyKey: IdempotencyKeys.custom('pltv-recalc', leadId, correlationId),
      }
    );

    // Step 4: Emit LTV updated event
    try {
      await eventStore.emit({
        type: 'ltv.payment_recorded',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'lead',
        payload: {
          leadId,
          clinicId,
          caseId,
          paymentId: dbPaymentId,
          paymentReference,
          amount: amount / 100,
          currency,
          stripePaymentId: paymentId,
        },
      });
    } catch (err) {
      logger.error('Failed to emit ltv.payment_recorded event', { err, correlationId });
    }

    return {
      success: true,
      paymentId: dbPaymentId,
      caseId,
      paymentReference,
      amount: amount / 100,
      pLTVRecalcTriggered: true,
    };
  },
});

/**
 * Recalculate pLTV for a lead
 *
 * Gathers all relevant data and recalculates the predicted lifetime value.
 */
export const recalculatePLTV = task({
  id: 'ltv-recalculate-pltv',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: RecalculatePLTVPayload) => {
    const { leadId, clinicId, correlationId, reason } = payload;

    const db = getPool();
    const { eventStore, hubspot } = getClients();
    const pltvService = createPLTVScoringService();

    logger.info('Recalculating pLTV for lead', { leadId, clinicId, reason, correlationId });

    // Step 1: Fetch LTV data from database view
    const ltvResult = await db.query<{
      total_cases: string;
      completed_cases: string;
      total_case_value: string;
      total_paid: string;
      total_outstanding: string;
      avg_case_value: string;
      first_case_date: Date | null;
      last_case_date: Date | null;
    }>(
      `
      SELECT
        total_cases, completed_cases, total_case_value, total_paid,
        total_outstanding, avg_case_value, first_case_date, last_case_date
      FROM lead_ltv
      WHERE lead_id = $1 AND clinic_id = $2
    `,
      [leadId, clinicId]
    );

    const ltvData = ltvResult.rows[0];

    // Step 2: Fetch payment behavior
    const paymentBehaviorResult = await db.query<{
      on_time_rate: string;
      plans_used: string;
      avg_days: string | null;
      missed: string;
    }>(
      `
      SELECT
        COALESCE(
          COUNT(*) FILTER (WHERE p.processed_at <= p.created_at + INTERVAL '7 days') * 100.0 / NULLIF(COUNT(*), 0),
          100
        ) AS on_time_rate,
        COUNT(DISTINCT pp.id) AS plans_used,
        AVG(EXTRACT(EPOCH FROM (p.processed_at - p.created_at)) / 86400) AS avg_days,
        COUNT(*) FILTER (WHERE p.status = 'failed') AS missed
      FROM payments p
      JOIN cases c ON c.id = p.case_id
      LEFT JOIN payment_plans pp ON pp.case_id = c.id
      WHERE c.lead_id = $1 AND c.clinic_id = $2
    `,
      [leadId, clinicId]
    );

    const paymentBehavior = paymentBehaviorResult.rows[0];

    // Step 3: Fetch engagement metrics (from HubSpot if available)
    let engagement: EngagementMetricsInput = {
      totalAppointments: 0,
      keptAppointments: 0,
      canceledAppointments: 0,
      noShows: 0,
      daysSinceLastContact: 30,
      referralsMade: 0,
      hasNPSFeedback: false,
      npsScore: null,
    };

    if (hubspot) {
      try {
        // Find HubSpot contact
        const leadResult = await db.query<{ email: string | null; phone: string | null }>(
          'SELECT email, phone FROM leads WHERE id = $1',
          [leadId]
        );
        const lead = leadResult.rows[0];

        if (lead?.email) {
          const contact = await hubspot.findContactByEmail(lead.email);
          if (contact) {
            // HubSpot properties are dynamically typed - cast to access custom properties
            const props = contact.properties as Record<string, string | undefined>;
            engagement = {
              totalAppointments: parseInt(props.total_appointments ?? '0', 10),
              keptAppointments: parseInt(props.kept_appointments ?? '0', 10),
              canceledAppointments: parseInt(props.canceled_appointments ?? '0', 10),
              noShows: parseInt(props.no_shows ?? '0', 10),
              daysSinceLastContact: props.last_contact_date
                ? Math.floor(
                    (Date.now() - new Date(props.last_contact_date).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )
                : 30,
              referralsMade: parseInt(props.referrals_made ?? '0', 10),
              hasNPSFeedback: !!props.nps_score,
              npsScore: props.nps_score ? parseInt(props.nps_score, 10) : null,
            };
          }
        }
      } catch (err) {
        logger.warn('Failed to fetch HubSpot engagement data', { err, leadId });
      }
    }

    // Step 4: Fetch procedure interest
    const procedureResult = await db.query<{
      all_on_x: boolean;
      implant: boolean;
      full_mouth: boolean;
      cosmetic: boolean;
      high_value_completed: string;
    }>(
      `
      SELECT
        EXISTS(SELECT 1 FROM treatment_plan_items tpi
               JOIN treatment_plans tp ON tp.id = tpi.treatment_plan_id
               WHERE tp.lead_id = $1 AND tpi.procedure_code ILIKE '%all-on%') AS all_on_x,
        EXISTS(SELECT 1 FROM treatment_plan_items tpi
               JOIN treatment_plans tp ON tp.id = tpi.treatment_plan_id
               WHERE tp.lead_id = $1 AND tpi.procedure_code ILIKE '%implant%') AS implant,
        EXISTS(SELECT 1 FROM treatment_plan_items tpi
               JOIN treatment_plans tp ON tp.id = tpi.treatment_plan_id
               WHERE tp.lead_id = $1 AND tpi.procedure_code ILIKE '%full%mouth%') AS full_mouth,
        EXISTS(SELECT 1 FROM treatment_plan_items tpi
               JOIN treatment_plans tp ON tp.id = tpi.treatment_plan_id
               WHERE tp.lead_id = $1 AND tpi.procedure_code ILIKE '%cosmetic%') AS cosmetic,
        COUNT(DISTINCT c.id) FILTER (WHERE c.total_amount > 10000 AND c.status = 'completed') AS high_value_completed
      FROM leads l
      LEFT JOIN treatment_plans tp ON tp.lead_id = l.id
      LEFT JOIN cases c ON c.lead_id = l.id
      WHERE l.id = $1
      GROUP BY l.id
    `,
      [leadId]
    );

    const procedures = procedureResult.rows[0];

    // Step 5: Fetch retention score if available
    let retentionScore: number | null = null;
    if (hubspot) {
      try {
        const leadResult = await db.query<{ email: string | null }>(
          'SELECT email FROM leads WHERE id = $1',
          [leadId]
        );
        if (leadResult.rows[0]?.email) {
          const contact = await hubspot.findContactByEmail(leadResult.rows[0].email);
          if (contact?.properties.retention_score) {
            retentionScore = parseInt(contact.properties.retention_score, 10);
          }
        }
      } catch {
        // Ignore - retention score is optional
      }
    }

    // Step 6: Build pLTV input
    const now = new Date();
    const firstCaseDate = ltvData?.first_case_date ? new Date(ltvData.first_case_date) : null;
    const lastCaseDate = ltvData?.last_case_date ? new Date(ltvData.last_case_date) : null;

    const historical: HistoricalLTVInput = {
      totalPaid: parseFloat(ltvData?.total_paid ?? '0'),
      totalCaseValue: parseFloat(ltvData?.total_case_value ?? '0'),
      totalOutstanding: parseFloat(ltvData?.total_outstanding ?? '0'),
      completedCases: parseInt(ltvData?.completed_cases ?? '0', 10),
      totalCases: parseInt(ltvData?.total_cases ?? '0', 10),
      avgCaseValue: parseFloat(ltvData?.avg_case_value ?? '0'),
      daysSinceFirstCase: firstCaseDate
        ? Math.floor((now.getTime() - firstCaseDate.getTime()) / (1000 * 60 * 60 * 24))
        : null,
      daysSinceLastCase: lastCaseDate
        ? Math.floor((now.getTime() - lastCaseDate.getTime()) / (1000 * 60 * 60 * 24))
        : null,
    };

    const paymentBehaviorInput: PaymentBehaviorInput = {
      onTimePaymentRate: parseFloat(paymentBehavior?.on_time_rate ?? '100'),
      paymentPlansUsed: parseInt(paymentBehavior?.plans_used ?? '0', 10),
      avgDaysToPayment: paymentBehavior?.avg_days ? parseFloat(paymentBehavior.avg_days) : null,
      missedPayments: parseInt(paymentBehavior?.missed ?? '0', 10),
      preferredPaymentMethod: 'card',
    };

    const procedureInterest: ProcedureInterestInput = {
      allOnXInterest: procedures?.all_on_x ?? false,
      implantInterest: procedures?.implant ?? false,
      fullMouthInterest: procedures?.full_mouth ?? false,
      cosmeticInterest: procedures?.cosmetic ?? false,
      highValueProceduresCompleted: parseInt(procedures?.high_value_completed ?? '0', 10),
    };

    const input: PLTVPredictionInput = {
      leadId,
      clinicId,
      historical,
      paymentBehavior: paymentBehaviorInput,
      engagement,
      procedureInterest,
      retentionScore,
    };

    // Step 7: Calculate pLTV
    const pltvResult = pltvService.calculatePLTV(input);

    logger.info('pLTV calculated', {
      leadId,
      predictedLTV: pltvResult.predictedLTV,
      tier: pltvResult.tier,
      confidence: pltvResult.confidence,
      correlationId,
    });

    // Step 8: Store pLTV in database
    await db.query(
      `
      INSERT INTO lead_pltv_scores (
        id, lead_id, clinic_id, predicted_ltv, tier, growth_potential,
        investment_priority, confidence, breakdown, reasoning,
        model_version, calculated_at, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW()
      )
      ON CONFLICT (lead_id) DO UPDATE SET
        predicted_ltv = EXCLUDED.predicted_ltv,
        tier = EXCLUDED.tier,
        growth_potential = EXCLUDED.growth_potential,
        investment_priority = EXCLUDED.investment_priority,
        confidence = EXCLUDED.confidence,
        breakdown = EXCLUDED.breakdown,
        reasoning = EXCLUDED.reasoning,
        model_version = EXCLUDED.model_version,
        calculated_at = EXCLUDED.calculated_at
    `,
      [
        uuidv4(),
        leadId,
        clinicId,
        pltvResult.predictedLTV,
        pltvResult.tier,
        pltvResult.growthPotential,
        pltvResult.investmentPriority,
        pltvResult.confidence,
        JSON.stringify(pltvResult.breakdown),
        pltvResult.reasoning,
        pltvResult.modelVersion,
        new Date(pltvResult.calculatedAt),
      ]
    );

    // Step 9: Update HubSpot with pLTV data
    if (hubspot) {
      try {
        const leadResult = await db.query<{ email: string | null }>(
          'SELECT email FROM leads WHERE id = $1',
          [leadId]
        );
        if (leadResult.rows[0]?.email) {
          const contact = await hubspot.findContactByEmail(leadResult.rows[0].email);
          if (contact) {
            await hubspot.updateContact(contact.id, {
              predicted_ltv: pltvResult.predictedLTV.toString(),
              pltv_tier: pltvResult.tier,
              pltv_growth_potential: pltvResult.growthPotential,
              pltv_investment_priority: pltvResult.investmentPriority,
              pltv_confidence: Math.round(pltvResult.confidence * 100).toString(),
              pltv_calculated_at: pltvResult.calculatedAt,
            });
            logger.info('HubSpot contact updated with pLTV', { contactId: contact.id });
          }
        }
      } catch (err) {
        logger.warn('Failed to update HubSpot with pLTV', { err, leadId });
      }
    }

    // Step 10: Emit event for high-value leads
    if (pltvResult.tier === 'DIAMOND' || pltvResult.tier === 'PLATINUM') {
      try {
        await eventStore.emit({
          type: 'ltv.high_value_lead_identified',
          correlationId,
          aggregateId: leadId,
          aggregateType: 'lead',
          payload: {
            leadId,
            clinicId,
            predictedLTV: pltvResult.predictedLTV,
            tier: pltvResult.tier,
            investmentPriority: pltvResult.investmentPriority,
            confidence: pltvResult.confidence,
          },
        });
      } catch (err) {
        logger.error('Failed to emit high_value_lead event', { err, correlationId });
      }
    }

    // Step 11: Emit general LTV updated event
    try {
      await eventStore.emit({
        type: 'ltv.pltv_calculated',
        correlationId,
        aggregateId: leadId,
        aggregateType: 'lead',
        payload: {
          leadId,
          clinicId,
          predictedLTV: pltvResult.predictedLTV,
          tier: pltvResult.tier,
          growthPotential: pltvResult.growthPotential,
          reason,
        },
      });
    } catch (err) {
      logger.error('Failed to emit ltv.pltv_calculated event', { err, correlationId });
    }

    return {
      success: true,
      leadId,
      predictedLTV: pltvResult.predictedLTV,
      tier: pltvResult.tier,
      growthPotential: pltvResult.growthPotential,
      investmentPriority: pltvResult.investmentPriority,
      confidence: pltvResult.confidence,
    };
  },
});

/**
 * Batch recalculate pLTV for all leads with recent activity
 *
 * Runs daily to keep pLTV scores current.
 */
export const batchRecalculatePLTV = task({
  id: 'ltv-batch-recalculate-pltv',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof BatchLTVUpdatePayloadSchema>) => {
    const { clinicId, correlationId } = payload;

    const db = getPool();

    logger.info('Starting batch pLTV recalculation', { clinicId, correlationId });

    // Find leads with activity in the last 90 days OR without recent pLTV calculation
    let sql = `
      SELECT DISTINCT l.id as lead_id, l.clinic_id
      FROM leads l
      LEFT JOIN lead_pltv_scores lps ON lps.lead_id = l.id
      LEFT JOIN cases c ON c.lead_id = l.id AND c.deleted_at IS NULL
      WHERE l.deleted_at IS NULL
      AND (
        -- Has recent case activity
        c.updated_at > NOW() - INTERVAL '90 days'
        OR
        -- Never calculated pLTV
        lps.id IS NULL
        OR
        -- pLTV calculation is stale (>30 days old)
        lps.calculated_at < NOW() - INTERVAL '30 days'
      )
    `;
    const params: unknown[] = [];

    if (clinicId) {
      sql += ' AND l.clinic_id = $1';
      params.push(clinicId);
    }

    sql += ' LIMIT 500'; // Process in batches of 500

    const result = await db.query<{ lead_id: string; clinic_id: string }>(sql, params);

    logger.info(`Found ${result.rows.length} leads to recalculate`, { correlationId });

    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const row of result.rows) {
      try {
        await recalculatePLTV.trigger(
          {
            leadId: row.lead_id,
            clinicId: row.clinic_id,
            correlationId,
            reason: 'batch_recalculation',
          },
          {
            idempotencyKey: IdempotencyKeys.custom('batch-pltv', row.lead_id, getTodayString()),
          }
        );

        processed++;

        // Rate limiting - avoid overwhelming the system
        if (processed % 10 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (err) {
        failed++;
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        errors.push(`${row.lead_id}: ${errorMsg}`);
        logger.error('Failed to trigger pLTV recalculation', {
          leadId: row.lead_id,
          error: errorMsg,
        });
      }
    }

    logger.info('Batch pLTV recalculation completed', {
      total: result.rows.length,
      processed,
      failed,
      correlationId,
    });

    return {
      success: true,
      total: result.rows.length,
      processed,
      failed,
      errors: errors.slice(0, 10), // Only return first 10 errors
    };
  },
});

/**
 * Refresh cohort LTV materialized views
 *
 * Runs after batch processing to update analytics.
 */
export const refreshCohortViews = task({
  id: 'ltv-refresh-cohort-views',
  retry: {
    maxAttempts: 2,
  },
  run: async (payload: { correlationId: string }) => {
    const { correlationId } = payload;
    const db = getPool();

    logger.info('Refreshing cohort LTV views', { correlationId });

    // Refresh materialized view if it exists
    try {
      await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY cohort_ltv_monthly');
      logger.info('Refreshed cohort_ltv_monthly materialized view', { correlationId });
    } catch (_err) {
      // View might not be materialized - that's okay
      logger.debug('cohort_ltv_monthly is not a materialized view or does not exist', {
        correlationId,
      });
    }

    return { success: true };
  },
});

/**
 * Daily LTV orchestration job
 *
 * Runs every day at 5:00 AM to:
 * 1. Batch recalculate pLTV for leads with activity
 * 2. Refresh cohort views
 */
export const dailyLTVOrchestration = schedules.task({
  id: 'daily-ltv-orchestration',
  cron: '0 5 * * *', // Every day at 5:00 AM
  run: async () => {
    const correlationId = `daily-ltv-${new Date().toISOString().split('T')[0]}`;

    logger.info('Starting daily LTV orchestration', { correlationId });

    // Trigger batch pLTV recalculation
    await batchRecalculatePLTV.trigger(
      { correlationId },
      {
        idempotencyKey: IdempotencyKeys.cronJob('ltv-batch', getTodayString()),
      }
    );

    // Refresh cohort views after batch processing
    await refreshCohortViews.trigger(
      { correlationId },
      {
        idempotencyKey: IdempotencyKeys.cronJob('ltv-cohort-refresh', getTodayString()),
        delay: '5m', // Wait 5 minutes for batch to complete
      }
    );

    return {
      triggered: true,
      correlationId,
    };
  },
});

/**
 * Weekly comprehensive LTV audit
 *
 * Runs every Sunday at 3:00 AM for a full audit.
 */
export const weeklyLTVAudit = schedules.task({
  id: 'weekly-ltv-audit',
  cron: '0 3 * * 0', // Every Sunday at 3:00 AM
  run: async () => {
    const correlationId = `weekly-ltv-audit-${new Date().toISOString().split('T')[0]}`;

    logger.info('Starting weekly LTV audit', { correlationId });

    // Full batch recalculation without recency filter
    // This is handled by the batch task's 30-day stale check
    await batchRecalculatePLTV.trigger(
      { correlationId },
      {
        idempotencyKey: IdempotencyKeys.cronJob('ltv-weekly-audit', getTodayString()),
      }
    );

    return {
      triggered: true,
      correlationId,
    };
  },
});
