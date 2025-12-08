import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { Pool } from 'pg';
import crypto from 'node:crypto';
import { IdempotencyKeys } from '@medicalcor/core';
import { createIntegrationClients } from '@medicalcor/integrations';
import { recalculatePLTV } from './ltv-orchestration.js';

/**
 * Lead to Case Workflow
 *
 * Creates a case when a lead is qualified (HOT classification).
 * This bridges the gap between lead scoring and LTV tracking.
 *
 * Flow:
 * 1. Lead is scored as HOT (via lead-scoring workflow)
 * 2. This workflow creates a pending case for the lead
 * 3. Treatment plan is linked or auto-created
 * 4. pLTV recalculation is triggered
 * 5. Case is ready for conversion to appointment/payment
 *
 * H3 Production Fix: Enables automatic case creation on lead qualification
 *
 * @module trigger/workflows/lead-to-case
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
    source: 'lead-to-case',
    includeOpenAI: false,
  });
}

function uuidv4(): string {
  return crypto.randomUUID();
}

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Payload for lead qualification (triggering case creation)
 */
export const LeadQualifiedPayloadSchema = z.object({
  leadId: z.string().uuid().describe('Lead UUID'),
  clinicId: z.string().uuid().describe('Clinic UUID'),
  classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).describe('Lead classification'),
  score: z.number().min(1).max(5).describe('Lead score'),
  procedureInterest: z
    .array(z.string())
    .optional()
    .describe('Procedures the lead is interested in'),
  urgencyIndicators: z.array(z.string()).optional().describe('Urgency signals detected'),
  estimatedValue: z.number().optional().describe('Estimated case value if known'),
  treatmentPlanId: z.string().uuid().optional().describe('Existing treatment plan to link'),
  correlationId: z.string(),
});

export type LeadQualifiedPayload = z.infer<typeof LeadQualifiedPayloadSchema>;

/**
 * Result from case creation
 */
export interface CaseCreationResult {
  success: boolean;
  caseId?: string;
  caseNumber?: string;
  treatmentPlanId?: string;
  status: 'created' | 'exists' | 'skipped';
  reason?: string;
}

// ============================================================================
// TASKS
// ============================================================================

/**
 * Create a case when a lead is qualified
 *
 * This task should be triggered when:
 * 1. A lead is scored as HOT (from lead-scoring workflow)
 * 2. A lead expresses explicit procedure interest
 * 3. A lead requests an appointment/consultation
 *
 * The task is idempotent - calling it multiple times for the same lead
 * will not create duplicate cases.
 */
export const createCaseOnQualification = task({
  id: 'lead-to-case-create',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: LeadQualifiedPayload): Promise<CaseCreationResult> => {
    const {
      leadId,
      clinicId,
      classification,
      score,
      procedureInterest,
      urgencyIndicators,
      estimatedValue,
      treatmentPlanId: existingPlanId,
      correlationId,
    } = payload;

    const db = getPool();
    const { eventStore } = getClients();

    logger.info('Processing lead qualification for case creation', {
      leadId,
      clinicId,
      classification,
      score,
      correlationId,
    });

    // Only create cases for HOT leads (or optionally WARM with high score)
    if (classification !== 'HOT' && !(classification === 'WARM' && score >= 4)) {
      logger.info('Skipping case creation - lead not qualified', {
        leadId,
        classification,
        score,
        correlationId,
      });

      return {
        success: true,
        status: 'skipped',
        reason: `Lead classification ${classification} with score ${score} does not meet case creation threshold`,
      };
    }

    // Check if lead already has an active case
    const existingCaseResult = await db.query<{ id: string; case_number: string }>(
      `
      SELECT id, case_number FROM cases
      WHERE lead_id = $1 AND clinic_id = $2
      AND status NOT IN ('cancelled', 'completed')
      AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1
    `,
      [leadId, clinicId]
    );

    if (existingCaseResult.rows.length > 0) {
      const existingCase = existingCaseResult.rows[0]!;
      logger.info('Lead already has an active case', {
        leadId,
        caseId: existingCase.id,
        caseNumber: existingCase.case_number,
        correlationId,
      });

      return {
        success: true,
        caseId: existingCase.id,
        caseNumber: existingCase.case_number,
        status: 'exists',
        reason: 'Lead already has an active case',
      };
    }

    // Verify lead exists
    const leadResult = await db.query<{ id: string; full_name: string | null }>(
      'SELECT id, full_name FROM leads WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL',
      [leadId, clinicId]
    );

    if (leadResult.rows.length === 0) {
      logger.error('Lead not found', { leadId, clinicId, correlationId });
      return {
        success: false,
        status: 'skipped',
        reason: 'Lead not found',
      };
    }

    // Find or create treatment plan
    let treatmentPlanId = existingPlanId;

    if (!treatmentPlanId) {
      // Look for existing treatment plan
      const planResult = await db.query<{ id: string }>(
        `
        SELECT id FROM treatment_plans
        WHERE lead_id = $1 AND clinic_id = $2
        AND status NOT IN ('rejected', 'expired')
        AND deleted_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `,
        [leadId, clinicId]
      );

      if (planResult.rows.length > 0) {
        treatmentPlanId = planResult.rows[0]!.id;
        logger.info('Found existing treatment plan', { treatmentPlanId, correlationId });
      } else {
        // Create a new treatment plan based on procedure interest
        treatmentPlanId = uuidv4();
        const planName = procedureInterest?.length
          ? `Consultation: ${procedureInterest.join(', ')}`
          : 'Initial Consultation';

        await db.query(
          `
          INSERT INTO treatment_plans (
            id, lead_id, clinic_id, name, status,
            created_at, updated_at, metadata
          ) VALUES (
            $1, $2, $3, $4, 'draft',
            NOW(), NOW(), $5
          )
        `,
          [
            treatmentPlanId,
            leadId,
            clinicId,
            planName,
            JSON.stringify({
              procedureInterest,
              autoCreatedFromQualification: true,
              qualificationScore: score,
            }),
          ]
        );

        logger.info('Created new treatment plan', {
          treatmentPlanId,
          planName,
          correlationId,
        });
      }
    }

    // Generate case number
    const caseNumberResult = await db.query<{ case_number: string }>(
      'SELECT generate_case_number($1) as case_number',
      [clinicId]
    );
    const caseNumber = caseNumberResult.rows[0]!.case_number;

    // Estimate case value based on procedure interest
    let totalAmount = estimatedValue ?? 0;
    if (!totalAmount && procedureInterest?.length) {
      // Use default estimates based on procedure type
      const procedureEstimates: Record<string, number> = {
        'all-on-4': 15000,
        'all-on-x': 18000,
        implant: 2500,
        crown: 800,
        veneer: 600,
        'root-canal': 500,
        extraction: 200,
        cleaning: 150,
        whitening: 400,
      };

      for (const proc of procedureInterest) {
        const lowerProc = proc.toLowerCase();
        for (const [key, value] of Object.entries(procedureEstimates)) {
          if (lowerProc.includes(key)) {
            totalAmount += value;
            break;
          }
        }
      }
    }

    // Default to consultation value if no estimate
    if (totalAmount === 0) {
      totalAmount = 100; // Basic consultation fee
    }

    // Create the case
    const caseId = uuidv4();
    const isUrgent = urgencyIndicators && urgencyIndicators.length > 0;

    await db.query(
      `
      INSERT INTO cases (
        id, clinic_id, lead_id, treatment_plan_id, case_number,
        status, total_amount, paid_amount, outstanding_amount,
        currency, payment_status,
        created_at, updated_at, metadata
      ) VALUES (
        $1, $2, $3, $4, $5,
        'pending', $6, 0, $6,
        'EUR', 'unpaid',
        NOW(), NOW(), $7
      )
    `,
      [
        caseId,
        clinicId,
        leadId,
        treatmentPlanId,
        caseNumber,
        totalAmount,
        JSON.stringify({
          qualificationSource: 'lead-scoring',
          qualificationScore: score,
          classification,
          procedureInterest,
          urgencyIndicators,
          isUrgent,
          autoCreated: true,
          correlationId,
        }),
      ]
    );

    logger.info('Case created from lead qualification', {
      caseId,
      caseNumber,
      leadId,
      totalAmount,
      isUrgent,
      correlationId,
    });

    // Trigger pLTV recalculation
    try {
      await recalculatePLTV.trigger(
        {
          leadId,
          clinicId,
          correlationId,
          reason: 'case_created_on_qualification',
        },
        {
          idempotencyKey: IdempotencyKeys.custom('pltv-qual', leadId, correlationId),
        }
      );
    } catch (err) {
      logger.warn('Failed to trigger pLTV recalculation', { err, correlationId });
    }

    // Emit case created event
    try {
      await eventStore.emit({
        type: 'case.created_from_qualification',
        correlationId,
        aggregateId: caseId,
        aggregateType: 'case',
        payload: {
          caseId,
          caseNumber,
          leadId,
          clinicId,
          treatmentPlanId,
          classification,
          score,
          totalAmount,
          isUrgent,
          procedureInterest,
        },
      });
    } catch (err) {
      logger.error('Failed to emit case.created_from_qualification event', { err, correlationId });
    }

    // If urgent, emit alert event
    if (isUrgent) {
      try {
        await eventStore.emit({
          type: 'case.urgent_case_created',
          correlationId,
          aggregateId: caseId,
          aggregateType: 'case',
          payload: {
            caseId,
            caseNumber,
            leadId,
            clinicId,
            urgencyIndicators,
            requiresImmediateAttention: true,
          },
        });
      } catch (err) {
        logger.error('Failed to emit urgent case event', { err, correlationId });
      }
    }

    return {
      success: true,
      caseId,
      caseNumber,
      treatmentPlanId,
      status: 'created',
    };
  },
});

/**
 * Batch process leads that may need cases created
 *
 * Finds HOT leads without active cases and creates cases for them.
 * Useful for catching any leads that slipped through the real-time flow.
 */
export const batchCreateMissingCases = task({
  id: 'lead-to-case-batch-missing',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: { clinicId?: string; correlationId: string }) => {
    const { clinicId, correlationId } = payload;
    const db = getPool();

    logger.info('Starting batch case creation for qualified leads', { clinicId, correlationId });

    // Find HOT leads from lead_scoring that don't have active cases
    let sql = `
      SELECT DISTINCT l.id as lead_id, l.clinic_id,
             ls.score, ls.classification, ls.procedure_interest
      FROM leads l
      JOIN lead_scoring ls ON ls.lead_id = l.id
      LEFT JOIN cases c ON c.lead_id = l.id
        AND c.status NOT IN ('cancelled', 'completed')
        AND c.deleted_at IS NULL
      WHERE l.deleted_at IS NULL
      AND c.id IS NULL
      AND ls.classification = 'HOT'
      AND ls.created_at > NOW() - INTERVAL '30 days'
    `;
    const params: unknown[] = [];

    if (clinicId) {
      sql += ' AND l.clinic_id = $1';
      params.push(clinicId);
    }

    sql += ' LIMIT 100';

    const result = await db.query<{
      lead_id: string;
      clinic_id: string;
      score: number;
      classification: string;
      procedure_interest: string | null;
    }>(sql, params);

    logger.info(`Found ${result.rows.length} qualified leads without cases`, { correlationId });

    let created = 0;
    const skipped = 0;
    let failed = 0;

    for (const row of result.rows) {
      try {
        const procInterest = row.procedure_interest
          ? row.procedure_interest.split(';').filter(Boolean)
          : undefined;

        await createCaseOnQualification.trigger(
          {
            leadId: row.lead_id,
            clinicId: row.clinic_id,
            classification: row.classification as 'HOT',
            score: row.score,
            procedureInterest: procInterest,
            correlationId,
          },
          {
            idempotencyKey: IdempotencyKeys.custom('batch-case', row.lead_id, correlationId),
          }
        );

        created++;
      } catch (err) {
        failed++;
        logger.error('Failed to create case for lead', {
          leadId: row.lead_id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    logger.info('Batch case creation completed', {
      total: result.rows.length,
      created,
      skipped,
      failed,
      correlationId,
    });

    return {
      success: true,
      total: result.rows.length,
      created,
      skipped,
      failed,
    };
  },
});
