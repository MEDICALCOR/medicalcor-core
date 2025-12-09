/**
 * Database queries for LTV orchestration
 */

import type { Pool } from 'pg';
import type {
  LTVDataRow,
  PaymentBehaviorRow,
  ProcedureInterestRow,
  LeadContactData,
} from './types.js';

/**
 * Fetch LTV data from database view
 */
export async function fetchLTVData(
  db: Pool,
  leadId: string,
  clinicId: string
): Promise<LTVDataRow | undefined> {
  const result = await db.query<LTVDataRow>(
    `
    SELECT
      total_cases, completed_cases, total_case_value, total_paid,
      total_outstanding, avg_case_value, first_case_date, last_case_date
    FROM lead_ltv
    WHERE lead_id = $1 AND clinic_id = $2
    `,
    [leadId, clinicId]
  );
  return result.rows[0];
}

/**
 * Fetch payment behavior data
 */
export async function fetchPaymentBehavior(
  db: Pool,
  leadId: string,
  clinicId: string
): Promise<PaymentBehaviorRow | undefined> {
  const result = await db.query<PaymentBehaviorRow>(
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
  return result.rows[0];
}

/**
 * Fetch procedure interest data
 */
export async function fetchProcedureInterest(
  db: Pool,
  leadId: string
): Promise<ProcedureInterestRow | undefined> {
  const result = await db.query<ProcedureInterestRow>(
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
  return result.rows[0];
}

/**
 * Fetch lead contact data
 */
export async function fetchLeadContactData(
  db: Pool,
  leadId: string
): Promise<LeadContactData | undefined> {
  const result = await db.query<LeadContactData>('SELECT email, phone FROM leads WHERE id = $1', [
    leadId,
  ]);
  return result.rows[0];
}

/**
 * Store pLTV score in database
 */
export async function storePLTVScore(
  db: Pool,
  params: {
    id: string;
    leadId: string;
    clinicId: string;
    predictedLTV: number;
    tier: string;
    growthPotential: string;
    investmentPriority: string;
    confidence: number;
    breakdown: unknown;
    reasoning: string;
    modelVersion: string;
    calculatedAt: Date;
  }
): Promise<void> {
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
      params.id,
      params.leadId,
      params.clinicId,
      params.predictedLTV,
      params.tier,
      params.growthPotential,
      params.investmentPriority,
      params.confidence,
      JSON.stringify(params.breakdown),
      params.reasoning,
      params.modelVersion,
      params.calculatedAt,
    ]
  );
}
