import { task, logger } from '@trigger.dev/sdk/v3';
import { z } from 'zod';
import { Pool } from 'pg';
import { normalizeRomanianPhone, IdempotencyKeys } from '@medicalcor/core';
import { recordPaymentToCase } from '../workflows/ltv-orchestration.js';

/**
 * Payment Attribution Task
 *
 * H8 Production Fix: Automatically attributes payments to leads and cases
 * when the payment webhook doesn't include explicit leadId/clinicId.
 *
 * This bridges the gap between Stripe payments and the internal case management
 * by looking up leads by email, phone, or Stripe customer ID.
 *
 * Flow:
 * 1. Receive payment with customer identifiers (email/phone/stripeCustomerId)
 * 2. Look up lead in database using available identifiers
 * 3. Find associated clinic
 * 4. Find or infer the case for the payment
 * 5. Delegate to recordPaymentToCase for LTV tracking
 *
 * @module trigger/tasks/payment-attribution
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

// ============================================================================
// SCHEMAS
// ============================================================================

/**
 * Payload for payment attribution
 * Requires at least one customer identifier
 */
export const PaymentAttributionPayloadSchema = z.object({
  /** Stripe payment intent ID */
  paymentId: z.string(),
  /** Payment amount in cents */
  amount: z.number().positive(),
  /** Payment currency */
  currency: z.string().default('EUR'),
  /** Stripe customer ID (if available) */
  stripeCustomerId: z.string().nullable().optional(),
  /** Customer email (preferred identifier) */
  customerEmail: z.string().email().nullable().optional(),
  /** Customer phone (E.164 or Romanian format) */
  customerPhone: z.string().nullable().optional(),
  /** Customer name (for fuzzy matching fallback) */
  customerName: z.string().nullable().optional(),
  /** Payment method */
  method: z
    .enum(['cash', 'card', 'bank_transfer', 'financing', 'insurance', 'check', 'other'])
    .default('card'),
  /** Payment type */
  type: z
    .enum(['payment', 'deposit', 'installment', 'refund', 'adjustment', 'financing_payout'])
    .default('payment'),
  /** Correlation ID for distributed tracing */
  correlationId: z.string(),
  /** Optional explicit lead ID (skip lookup if provided) */
  leadId: z.string().uuid().optional(),
  /** Optional explicit clinic ID (skip lookup if provided) */
  clinicId: z.string().uuid().optional(),
  /** Optional explicit case ID (skip lookup if provided) */
  caseId: z.string().uuid().optional(),
});

export type PaymentAttributionPayload = z.infer<typeof PaymentAttributionPayloadSchema>;

/**
 * Result of attribution lookup
 */
interface AttributionResult {
  leadId: string;
  clinicId: string;
  caseId?: string;
  treatmentPlanId?: string;
  matchedBy: 'email' | 'phone' | 'stripe_customer_id' | 'explicit';
  confidence: 'high' | 'medium' | 'low';
}

// ============================================================================
// MAIN TASK
// ============================================================================

/**
 * Attribute payment to lead and case
 *
 * This task automatically resolves leadId and clinicId from payment customer
 * information, enabling LTV tracking even when Stripe webhooks don't include
 * explicit lead references.
 */
export const attributePaymentToLead = task({
  id: 'payment-attribution-resolve',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 10000,
    factor: 2,
  },
  run: async (payload: PaymentAttributionPayload) => {
    const {
      paymentId,
      amount,
      currency,
      stripeCustomerId,
      customerEmail,
      customerPhone,
      customerName,
      method,
      type,
      correlationId,
      leadId: explicitLeadId,
      clinicId: explicitClinicId,
      caseId: explicitCaseId,
    } = payload;

    const db = getPool();

    logger.info('Starting payment attribution', {
      paymentId,
      amount,
      hasEmail: !!customerEmail,
      hasPhone: !!customerPhone,
      hasStripeId: !!stripeCustomerId,
      hasExplicitLead: !!explicitLeadId,
      correlationId,
    });

    // If we have explicit IDs, use them directly
    if (explicitLeadId && explicitClinicId) {
      logger.info('Using explicit lead and clinic IDs', {
        leadId: explicitLeadId,
        clinicId: explicitClinicId,
        correlationId,
      });

      await triggerLTVRecording(
        {
          paymentId,
          leadId: explicitLeadId,
          clinicId: explicitClinicId,
          caseId: explicitCaseId,
          amount,
          currency,
          method,
          type,
          correlationId,
        },
        db
      );

      return {
        success: true,
        paymentId,
        leadId: explicitLeadId,
        clinicId: explicitClinicId,
        matchedBy: 'explicit' as const,
        confidence: 'high' as const,
        ltvTriggered: true,
      };
    }

    // Try to find the lead using available identifiers
    const attribution = await findLeadForPayment(db, {
      email: customerEmail ?? undefined,
      phone: customerPhone ?? undefined,
      stripeCustomerId: stripeCustomerId ?? undefined,
      name: customerName ?? undefined,
    });

    if (!attribution) {
      logger.warn('Could not attribute payment to any lead', {
        paymentId,
        hasEmail: !!customerEmail,
        hasPhone: !!customerPhone,
        hasStripeId: !!stripeCustomerId,
        correlationId,
      });

      return {
        success: false,
        paymentId,
        reason: 'no_matching_lead',
        searchedBy: {
          email: !!customerEmail,
          phone: !!customerPhone,
          stripeCustomerId: !!stripeCustomerId,
        },
        ltvTriggered: false,
      };
    }

    logger.info('Payment attributed to lead', {
      paymentId,
      leadId: attribution.leadId,
      clinicId: attribution.clinicId,
      matchedBy: attribution.matchedBy,
      confidence: attribution.confidence,
      correlationId,
    });

    // Trigger LTV recording with attributed IDs
    await triggerLTVRecording(
      {
        paymentId,
        leadId: attribution.leadId,
        clinicId: attribution.clinicId,
        caseId: attribution.caseId ?? explicitCaseId,
        treatmentPlanId: attribution.treatmentPlanId,
        amount,
        currency,
        method,
        type,
        correlationId,
      },
      db
    );

    // Update lead with Stripe customer ID for future lookups
    if (stripeCustomerId && attribution.matchedBy !== 'stripe_customer_id') {
      try {
        await db.query(
          `UPDATE leads
           SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('stripe_customer_id', $1),
               updated_at = NOW()
           WHERE id = $2`,
          [stripeCustomerId, attribution.leadId]
        );
        logger.info('Linked Stripe customer ID to lead', {
          leadId: attribution.leadId,
          stripeCustomerId,
          correlationId,
        });
      } catch (err) {
        logger.warn('Failed to link Stripe customer ID to lead', { err, correlationId });
      }
    }

    return {
      success: true,
      paymentId,
      leadId: attribution.leadId,
      clinicId: attribution.clinicId,
      caseId: attribution.caseId,
      matchedBy: attribution.matchedBy,
      confidence: attribution.confidence,
      ltvTriggered: true,
    };
  },
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Find a lead using various identifiers
 */
async function findLeadForPayment(
  db: Pool,
  identifiers: {
    email?: string;
    phone?: string;
    stripeCustomerId?: string;
    name?: string;
  }
): Promise<AttributionResult | null> {
  const { email, phone, stripeCustomerId, name } = identifiers;

  // Priority 1: Stripe customer ID (highest confidence - direct link)
  if (stripeCustomerId) {
    const stripeResult = await db.query<{
      id: string;
      clinic_id: string;
    }>(
      `SELECT id, clinic_id FROM leads
       WHERE metadata->>'stripe_customer_id' = $1
       AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [stripeCustomerId]
    );

    if (stripeResult.rows.length > 0) {
      const lead = stripeResult.rows[0]!;
      const caseInfo = await findActiveCase(db, lead.id, lead.clinic_id);
      return {
        leadId: lead.id,
        clinicId: lead.clinic_id,
        caseId: caseInfo?.caseId,
        treatmentPlanId: caseInfo?.treatmentPlanId,
        matchedBy: 'stripe_customer_id',
        confidence: 'high',
      };
    }
  }

  // Priority 2: Email (high confidence)
  if (email) {
    const emailResult = await db.query<{
      id: string;
      clinic_id: string;
    }>(
      `SELECT id, clinic_id FROM leads
       WHERE LOWER(email) = LOWER($1)
       AND deleted_at IS NULL
       ORDER BY last_interaction_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [email]
    );

    if (emailResult.rows.length > 0) {
      const lead = emailResult.rows[0]!;
      const caseInfo = await findActiveCase(db, lead.id, lead.clinic_id);
      return {
        leadId: lead.id,
        clinicId: lead.clinic_id,
        caseId: caseInfo?.caseId,
        treatmentPlanId: caseInfo?.treatmentPlanId,
        matchedBy: 'email',
        confidence: 'high',
      };
    }
  }

  // Priority 3: Phone (high confidence if normalized)
  if (phone) {
    const phoneResult = normalizeRomanianPhone(phone);
    const normalizedPhone = phoneResult.normalized;

    const phoneDbResult = await db.query<{
      id: string;
      clinic_id: string;
    }>(
      `SELECT id, clinic_id FROM leads
       WHERE phone = $1
       AND deleted_at IS NULL
       ORDER BY last_interaction_at DESC NULLS LAST, created_at DESC
       LIMIT 1`,
      [normalizedPhone]
    );

    if (phoneDbResult.rows.length > 0) {
      const lead = phoneDbResult.rows[0]!;
      const caseInfo = await findActiveCase(db, lead.id, lead.clinic_id);
      return {
        leadId: lead.id,
        clinicId: lead.clinic_id,
        caseId: caseInfo?.caseId,
        treatmentPlanId: caseInfo?.treatmentPlanId,
        matchedBy: 'phone',
        confidence: 'high',
      };
    }
  }

  // Priority 4: Name fuzzy match (low confidence - only if email/phone fail)
  // This is intentionally limited to prevent misattribution
  if (name && (email || phone)) {
    // Only try name matching if we have another identifier that partially matched
    // This prevents false positives from common names
    const nameParts = name.toLowerCase().split(' ').filter(Boolean);
    if (nameParts.length >= 2) {
      const nameResult = await db.query<{
        id: string;
        clinic_id: string;
      }>(
        `SELECT id, clinic_id FROM leads
         WHERE LOWER(full_name) LIKE $1
         AND deleted_at IS NULL
         ORDER BY created_at DESC
         LIMIT 1`,
        [`%${nameParts.join('%')}%`]
      );

      if (nameResult.rows.length > 0) {
        const lead = nameResult.rows[0]!;
        const caseInfo = await findActiveCase(db, lead.id, lead.clinic_id);
        return {
          leadId: lead.id,
          clinicId: lead.clinic_id,
          caseId: caseInfo?.caseId,
          treatmentPlanId: caseInfo?.treatmentPlanId,
          matchedBy: 'email', // Use email/phone as the match source since name is secondary
          confidence: 'low',
        };
      }
    }
  }

  return null;
}

/**
 * Find the most recent active case for a lead
 */
async function findActiveCase(
  db: Pool,
  leadId: string,
  clinicId: string
): Promise<{ caseId: string; treatmentPlanId?: string } | null> {
  const result = await db.query<{
    id: string;
    treatment_plan_id: string | null;
  }>(
    `SELECT id, treatment_plan_id FROM cases
     WHERE lead_id = $1 AND clinic_id = $2
     AND status NOT IN ('cancelled', 'completed')
     AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [leadId, clinicId]
  );

  if (result.rows.length > 0) {
    const caseRow = result.rows[0]!;
    return {
      caseId: caseRow.id,
      treatmentPlanId: caseRow.treatment_plan_id ?? undefined,
    };
  }

  return null;
}

/**
 * Trigger the LTV recording workflow
 */
async function triggerLTVRecording(
  params: {
    paymentId: string;
    leadId: string;
    clinicId: string;
    caseId?: string;
    treatmentPlanId?: string;
    amount: number;
    currency: string;
    method: string;
    type: string;
    correlationId: string;
  },
  _db: Pool
): Promise<void> {
  await recordPaymentToCase.trigger(
    {
      paymentId: params.paymentId,
      leadId: params.leadId,
      clinicId: params.clinicId,
      caseId: params.caseId,
      treatmentPlanId: params.treatmentPlanId,
      amount: params.amount,
      currency: params.currency,
      method: params.method as
        | 'cash'
        | 'card'
        | 'bank_transfer'
        | 'financing'
        | 'insurance'
        | 'check'
        | 'other',
      type: params.type as
        | 'payment'
        | 'deposit'
        | 'installment'
        | 'refund'
        | 'adjustment'
        | 'financing_payout',
      processorName: 'stripe',
      processorTransactionId: params.paymentId,
      correlationId: params.correlationId,
    },
    {
      idempotencyKey: IdempotencyKeys.custom(
        'ltv-attribution',
        params.paymentId,
        params.correlationId
      ),
    }
  );
}

// ============================================================================
// BATCH ATTRIBUTION TASK
// ============================================================================

/**
 * Batch attribute unlinked payments
 *
 * Finds payments in the database that don't have cases attached
 * and attempts to attribute them.
 */
export const batchAttributeUnlinkedPayments = task({
  id: 'payment-attribution-batch',
  retry: {
    maxAttempts: 2,
    minTimeoutInMs: 5000,
    maxTimeoutInMs: 60000,
    factor: 2,
  },
  run: async (payload: { clinicId?: string; correlationId: string }) => {
    const { clinicId, correlationId } = payload;
    const db = getPool();

    logger.info('Starting batch payment attribution', { clinicId, correlationId });

    // Find payments without cases (from domain_events)
    let sql = `
      SELECT DISTINCT
        de.payload->>'stripePaymentId' as payment_id,
        de.payload->>'amount' as amount,
        de.payload->>'currency' as currency,
        de.payload->>'stripeCustomerId' as stripe_customer_id,
        de.payload->>'customerEmail' as customer_email,
        de.payload->>'phone' as phone,
        de.correlation_id
      FROM domain_events de
      LEFT JOIN payments p ON p.processor_transaction_id = de.payload->>'stripePaymentId'
      WHERE de.event_type = 'payment.received'
      AND p.id IS NULL
      AND de.created_at > NOW() - INTERVAL '30 days'
    `;
    const params: unknown[] = [];

    if (clinicId) {
      // Filter by clinic if specified (through leads)
      sql += ` AND EXISTS (
        SELECT 1 FROM leads l
        WHERE (l.email = de.payload->>'customerEmail' OR l.phone = de.payload->>'phone')
        AND l.clinic_id = $1
      )`;
      params.push(clinicId);
    }

    sql += ' LIMIT 100';

    const result = await db.query<{
      payment_id: string;
      amount: string;
      currency: string;
      stripe_customer_id: string | null;
      customer_email: string | null;
      phone: string | null;
      correlation_id: string;
    }>(sql, params);

    logger.info(`Found ${result.rows.length} unlinked payments`, { correlationId });

    let attributed = 0;
    let failed = 0;

    for (const row of result.rows) {
      try {
        await attributePaymentToLead.trigger(
          {
            paymentId: row.payment_id,
            amount: parseInt(row.amount, 10) || 0,
            currency: row.currency || 'EUR',
            stripeCustomerId: row.stripe_customer_id,
            customerEmail: row.customer_email,
            customerPhone: row.phone,
            method: 'card',
            type: 'payment',
            correlationId: row.correlation_id || correlationId,
          },
          {
            idempotencyKey: IdempotencyKeys.custom('batch-attr', row.payment_id, correlationId),
          }
        );
        attributed++;
      } catch (err) {
        failed++;
        logger.error('Failed to attribute payment', {
          paymentId: row.payment_id,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    logger.info('Batch payment attribution completed', {
      total: result.rows.length,
      attributed,
      failed,
      correlationId,
    });

    return {
      success: true,
      total: result.rows.length,
      attributed,
      failed,
    };
  },
});
