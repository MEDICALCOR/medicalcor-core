import { task, schedules, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import { IdempotencyKeys, getTodayString } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { createPLTVScoringService } from '@medicalcor/domain';
import {
  fetchLTVData,
  fetchPaymentBehavior,
  fetchProcedureInterest,
  storePLTVScore,
  fetchEngagementFromHubSpot,
  fetchRetentionScore,
  updateHubSpotWithPLTV,
  emitPaymentRecordedEvent,
  emitHighValueLeadEvent,
  emitPLTVCalculatedEvent,
  buildPLTVInput,
} from './ltv/index.js';

// Use Node.js crypto for UUID generation
function uuidv4(): string {
  return crypto.randomUUID();
}

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
    await emitPaymentRecordedEvent(eventStore, correlationId, {
      leadId,
      clinicId,
      caseId,
      paymentId: dbPaymentId,
      paymentReference,
      amount: amount / 100,
      currency,
      stripePaymentId: paymentId,
    });

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

    // Step 1-4: Fetch all required data in parallel
    const [ltvData, paymentBehavior, engagement, procedures, retentionScore] = await Promise.all([
      fetchLTVData(db, leadId, clinicId),
      fetchPaymentBehavior(db, leadId, clinicId),
      fetchEngagementFromHubSpot(hubspot, db, leadId),
      fetchProcedureInterest(db, leadId),
      fetchRetentionScore(hubspot, db, leadId),
    ]);

    // Step 5: Build pLTV input
    const input = buildPLTVInput({
      leadId,
      clinicId,
      ltvData,
      paymentBehavior,
      engagement,
      procedures,
      retentionScore,
    });

    // Step 6: Calculate pLTV
    const pltvResult = pltvService.calculatePLTV(input);

    logger.info('pLTV calculated', {
      leadId,
      predictedLTV: pltvResult.predictedLTV,
      tier: pltvResult.tier,
      confidence: pltvResult.confidence,
      correlationId,
    });

    // Step 7: Store pLTV in database
    await storePLTVScore(db, {
      id: uuidv4(),
      leadId,
      clinicId,
      predictedLTV: pltvResult.predictedLTV,
      tier: pltvResult.tier,
      growthPotential: pltvResult.growthPotential,
      investmentPriority: pltvResult.investmentPriority,
      confidence: pltvResult.confidence,
      breakdown: pltvResult.breakdown,
      reasoning: pltvResult.reasoning,
      modelVersion: pltvResult.modelVersion,
      calculatedAt: new Date(pltvResult.calculatedAt),
    });

    // Step 8: Update HubSpot with pLTV data
    await updateHubSpotWithPLTV(hubspot, db, leadId, {
      predictedLTV: pltvResult.predictedLTV,
      tier: pltvResult.tier,
      growthPotential: pltvResult.growthPotential,
      investmentPriority: pltvResult.investmentPriority,
      confidence: pltvResult.confidence,
      calculatedAt: pltvResult.calculatedAt,
    });

    // Step 9: Emit event for high-value leads
    if (pltvResult.tier === 'DIAMOND' || pltvResult.tier === 'PLATINUM') {
      await emitHighValueLeadEvent(eventStore, correlationId, {
        leadId,
        clinicId,
        predictedLTV: pltvResult.predictedLTV,
        tier: pltvResult.tier,
        investmentPriority: pltvResult.investmentPriority,
        confidence: pltvResult.confidence,
      });
    }

    // Step 10: Emit general LTV updated event
    await emitPLTVCalculatedEvent(eventStore, correlationId, {
      leadId,
      clinicId,
      predictedLTV: pltvResult.predictedLTV,
      tier: pltvResult.tier,
      growthPotential: pltvResult.growthPotential,
      reason,
    });

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
