/**
 * CRM Database Operations
 * Lead Generation Machine - Upsert, Events, Interactions
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive fallbacks for optional DTO properties */

import {
  createDatabaseClient,
  withTransaction,
  type DatabasePool,
  type TransactionClient,
} from './database.js';
import { createLogger } from './logger.js';
import type { LeadDTO, TreatmentPlanDTO, InteractionDTO } from '@medicalcor/types';

const logger = createLogger({ name: 'crm-db' });

// --- Structured Error Types for Platinum Standard ---

/**
 * Base class for CRM domain errors
 * Provides structured error handling for proper HTTP status mapping
 */
export class CrmDatabaseError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly originalError?: Error;

  constructor(message: string, code: string, httpStatus: number, originalError?: Error) {
    super(message);
    this.name = 'CrmDatabaseError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.originalError = originalError;
    Object.setPrototypeOf(this, CrmDatabaseError.prototype);
  }
}

export class LeadNotFoundError extends CrmDatabaseError {
  constructor(identifier: string) {
    super(`Lead not found: ${identifier}`, 'LEAD_NOT_FOUND', 404);
    this.name = 'LeadNotFoundError';
  }
}

export class LeadUpdateFailedError extends CrmDatabaseError {
  constructor(message: string, originalError?: Error) {
    super(message, 'LEAD_UPDATE_FAILED', 500, originalError);
    this.name = 'LeadUpdateFailedError';
  }
}

export class DatabaseConnectionError extends CrmDatabaseError {
  constructor(originalError?: Error) {
    super('Database connection failed', 'DB_CONNECTION_FAILED', 503, originalError);
    this.name = 'DatabaseConnectionError';
  }
}

export class DuplicateRecordError extends CrmDatabaseError {
  constructor(entity: string, constraint: string) {
    super(`Duplicate ${entity} violates constraint: ${constraint}`, 'DUPLICATE_RECORD', 409);
    this.name = 'DuplicateRecordError';
  }
}

/**
 * Converts generic database errors into structured domain errors
 * @param error - The original error from database operation
 * @param context - Additional context about the operation
 */
function handleDatabaseError(error: unknown, context: string): never {
  if (error instanceof CrmDatabaseError) {
    throw error;
  }

  const err = error instanceof Error ? error : new Error(String(error));
  const pgError = err as Error & { code?: string; constraint?: string };

  // PostgreSQL error codes: https://www.postgresql.org/docs/current/errcodes-appendix.html
  switch (pgError.code) {
    case '23505': // unique_violation
      throw new DuplicateRecordError(context, pgError.constraint ?? 'unknown');
    case '08000': // connection_exception
    case '08003': // connection_does_not_exist
    case '08006': // connection_failure
    case '57P01': // admin_shutdown
    case '57P02': // crash_shutdown
    case '57P03': // cannot_connect_now
      throw new DatabaseConnectionError(err);
    case undefined:
    default:
      logger.error({ error: err, context }, 'Unhandled database error');
      throw new LeadUpdateFailedError(`${context}: ${err.message}`, err);
  }
}

// --- 0. Utils ----------------------------------------------------------------
function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

// --- 1. Helpers de bază ------------------------------------------------------
export async function findLeadIdByExternal(
  externalSource: string,
  externalContactId: string,
  client?: DatabasePool | TransactionClient
): Promise<string | null> {
  const db = client ?? createDatabaseClient();
  const result = await db.query<{ id: string }>(
    `SELECT id FROM leads
     WHERE external_source = $1
       AND external_contact_id = $2
     LIMIT 1`,
    [externalSource, externalContactId]
  );
  return result.rows[0]?.id ?? null;
}

export async function findPractitionerIdByExternalUserId(
  externalUserId: string,
  client?: DatabasePool | TransactionClient
): Promise<string | null> {
  const db = client ?? createDatabaseClient();
  const result = await db.query<{ id: string }>(
    `SELECT id
     FROM practitioners
     WHERE external_user_id = $1
       AND is_active = true
     LIMIT 1`,
    [externalUserId]
  );
  return result.rows[0]?.id ?? null;
}

// --- 2. Lead Events ----------------------------------------------------------
export async function recordLeadEvent(params: {
  leadId: string;
  eventType: string;
  actor?: string;
  payload?: Record<string, unknown> | null;
  client?: DatabasePool | TransactionClient;
}): Promise<void> {
  const { leadId, eventType, actor = 'system', payload = null } = params;
  const db = params.client ?? createDatabaseClient();

  await db.query(
    `INSERT INTO lead_events (lead_id, event_type, actor, payload)
     VALUES ($1, $2, $3, $4)`,
    [leadId, eventType, actor, payload ? JSON.stringify(payload) : null]
  );
}

// --- 3. UPSERT LEAD (Smart Patch) --------------------------------------------
export interface UpsertLeadOptions {
  createdBy?: string;
  clinicId?: string;
  actor?: string;
}

export async function upsertLeadFromDTO(dto: LeadDTO, opts?: UpsertLeadOptions): Promise<string> {
  const pool = createDatabaseClient();

  try {
    return await withTransaction(pool, async (tx) => {
      // A. Agent
      let assignedAgentId: string | null = null;
      if (dto.assignedAgentExternalUserId) {
        assignedAgentId = await findPractitionerIdByExternalUserId(
          dto.assignedAgentExternalUserId,
          tx
        );
      }

      // B. Valori derivate
      const aiScore = dto.aiScore !== undefined ? clamp(dto.aiScore, 0, 100) : undefined;

      const clinicId = dto.clinicId ?? opts?.clinicId ?? null;

      // C. INSERT first
      const insertResult = await tx.query<{ id: string }>(
        `INSERT INTO leads (
        clinic_id, assigned_agent_id, external_contact_id, external_source, external_url,
        full_name, phone, email, source, acquisition_channel, ad_campaign_id,
        ai_score, ai_intent, ai_summary, ai_last_analysis_at, language, tags, metadata,
        gdpr_consent, gdpr_consent_at, gdpr_consent_source, status, created_by, updated_by
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22, $23, $24
      )
      ON CONFLICT (external_source, external_contact_id) DO NOTHING
      RETURNING id`,
        [
          clinicId,
          assignedAgentId,
          dto.externalContactId,
          dto.externalSource,
          dto.externalUrl ?? null,
          dto.fullName ?? null,
          dto.phone,
          dto.email ?? null,
          dto.source ?? null,
          dto.acquisitionChannel ?? null,
          dto.adCampaignId ?? null,
          aiScore ?? 0,
          dto.aiIntent ?? null,
          dto.aiSummary ?? null,
          dto.aiLastAnalysisAt ?? null,
          dto.language ?? 'ro',
          dto.tags ?? null,
          dto.metadata ? JSON.stringify(dto.metadata) : null,
          dto.gdprConsent ?? false,
          dto.gdprConsentAt ?? null,
          dto.gdprConsentSource ?? null,
          dto.status ?? 'new',
          opts?.createdBy ?? null,
          opts?.createdBy ?? null,
        ]
      );

      let leadId = insertResult.rows[0]?.id;
      let eventType: 'lead_created' | 'lead_updated' = 'lead_created';

      // D. UPDATE (patch) dacă există deja
      if (!leadId) {
        const updateResult = await tx.query<{ id: string }>(
          `UPDATE leads SET
          clinic_id            = COALESCE($1, leads.clinic_id),
          assigned_agent_id    = COALESCE($2, leads.assigned_agent_id),
          external_url         = COALESCE($3, leads.external_url),
          full_name            = COALESCE($4, leads.full_name),
          phone                = COALESCE($5, leads.phone),
          email                = COALESCE($6, leads.email),
          source               = COALESCE($7, leads.source),
          acquisition_channel  = COALESCE($8, leads.acquisition_channel),
          ad_campaign_id       = COALESCE($9, leads.ad_campaign_id),
          ai_score             = COALESCE($10, leads.ai_score),
          ai_intent            = COALESCE($11, leads.ai_intent),
          ai_summary           = COALESCE($12, leads.ai_summary),
          ai_last_analysis_at  = COALESCE($13, leads.ai_last_analysis_at),
          language             = COALESCE($14, leads.language),
          tags                 = COALESCE($15, leads.tags),
          metadata             = COALESCE($16, leads.metadata),
          gdpr_consent         = COALESCE($17, leads.gdpr_consent),
          gdpr_consent_at      = COALESCE($18, leads.gdpr_consent_at),
          gdpr_consent_source  = COALESCE($19, leads.gdpr_consent_source),
          status               = COALESCE($20, leads.status),
          updated_by           = $21,
          updated_at           = NOW()
        WHERE external_source = $22
          AND external_contact_id = $23
        RETURNING id`,
          [
            clinicId,
            assignedAgentId,
            dto.externalUrl ?? null,
            dto.fullName ?? null,
            dto.phone,
            dto.email ?? null,
            dto.source ?? null,
            dto.acquisitionChannel ?? null,
            dto.adCampaignId ?? null,
            aiScore ?? null,
            dto.aiIntent ?? null,
            dto.aiSummary ?? null,
            dto.aiLastAnalysisAt ?? null,
            dto.language ?? null,
            dto.tags ?? null,
            dto.metadata ? JSON.stringify(dto.metadata) : null,
            dto.gdprConsent ?? null,
            dto.gdprConsentAt ?? null,
            dto.gdprConsentSource ?? null,
            dto.status ?? null,
            opts?.createdBy ?? null,
            dto.externalSource,
            dto.externalContactId,
          ]
        );

        if (!updateResult.rows[0]) {
          throw new Error('Lead disappeared during upsert');
        }

        leadId = updateResult.rows[0].id;
        eventType = 'lead_updated';
      }

      // E. Audit
      await recordLeadEvent({
        leadId,
        eventType,
        actor: opts?.actor ?? 'system',
        payload: {
          change: 'crm_sync',
          source: dto.externalSource,
          status: dto.status,
        },
        client: tx,
      });

      logger.info({ leadId, eventType, source: dto.externalSource }, 'Lead upserted');
      return leadId;
    });
  } catch (error) {
    handleDatabaseError(error, 'Lead upsert');
  }
}

// --- 4. UPSERT TREATMENT PLAN (Smart Patch) ----------------------------------
export interface UpsertTreatmentPlanOptions {
  actor?: string;
}

export async function upsertTreatmentPlanFromDTO(
  dto: TreatmentPlanDTO,
  opts?: UpsertTreatmentPlanOptions
): Promise<string> {
  const pool = createDatabaseClient();

  try {
    return await withTransaction(pool, async (tx) => {
      const leadId = await findLeadIdByExternal(dto.externalSource, dto.leadExternalId, tx);
      if (!leadId) {
        throw new LeadNotFoundError(
          `source=${dto.externalSource}, contactId=${dto.leadExternalId}`
        );
      }

      let doctorId: string | null = null;
      if (dto.doctorExternalUserId) {
        doctorId = await findPractitionerIdByExternalUserId(dto.doctorExternalUserId, tx);
      }

      const probability =
        dto.probability !== undefined ? clamp(dto.probability, 0, 100) : undefined;
      const totalValue = dto.totalValue !== undefined ? Math.max(0, dto.totalValue) : undefined;
      const currency = dto.currency ?? 'EUR';

      // 1. INSERT
      const insertResult = await tx.query<{ id: string }>(
        `INSERT INTO treatment_plans (
        lead_id, doctor_id, external_deal_id, name, total_value, currency,
        stage, probability, is_accepted, accepted_at, rejected_reason,
        valid_until, notes
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13
      )
      ON CONFLICT (external_deal_id) DO NOTHING
      RETURNING id`,
        [
          leadId,
          doctorId,
          dto.externalDealId,
          dto.name ?? null,
          totalValue ?? 0,
          currency,
          dto.stage ?? 'draft',
          probability ?? 0,
          dto.isAccepted ?? false,
          dto.acceptedAt ?? null,
          dto.rejectedReason ?? null,
          dto.validUntil ?? null,
          dto.notes ?? null,
        ]
      );

      let planId = insertResult.rows[0]?.id;
      let eventType: 'treatment_plan_created' | 'treatment_plan_updated' = 'treatment_plan_created';

      // 2. UPDATE (patch)
      if (!planId) {
        const updateResult = await tx.query<{ id: string }>(
          `UPDATE treatment_plans SET
          lead_id         = $1,
          doctor_id       = COALESCE($2, treatment_plans.doctor_id),
          name            = COALESCE($3, treatment_plans.name),
          total_value     = COALESCE($4, treatment_plans.total_value),
          currency        = COALESCE($5, treatment_plans.currency),
          stage           = COALESCE($6, treatment_plans.stage),
          probability     = COALESCE($7, treatment_plans.probability),
          is_accepted     = COALESCE($8, treatment_plans.is_accepted),
          accepted_at     = COALESCE($9, treatment_plans.accepted_at),
          rejected_reason = COALESCE($10, treatment_plans.rejected_reason),
          valid_until     = COALESCE($11, treatment_plans.valid_until),
          notes           = COALESCE($12, treatment_plans.notes),
          updated_at      = NOW()
        WHERE external_deal_id = $13
        RETURNING id`,
          [
            leadId,
            doctorId,
            dto.name ?? null,
            totalValue ?? null,
            currency,
            dto.stage ?? null,
            probability ?? null,
            dto.isAccepted ?? null,
            dto.acceptedAt ?? null,
            dto.rejectedReason ?? null,
            dto.validUntil ?? null,
            dto.notes ?? null,
            dto.externalDealId,
          ]
        );

        if (!updateResult.rows[0]) {
          throw new Error('Treatment Plan disappeared during upsert');
        }

        planId = updateResult.rows[0].id;
        eventType = 'treatment_plan_updated';
      }

      await recordLeadEvent({
        leadId,
        eventType,
        actor: opts?.actor ?? 'system',
        payload: {
          planId,
          dealId: dto.externalDealId,
          value: totalValue,
          stage: dto.stage,
          isAccepted: dto.isAccepted,
        },
        client: tx,
      });

      logger.info({ planId, leadId, eventType }, 'Treatment plan upserted');
      return planId;
    });
  } catch (error) {
    handleDatabaseError(error, 'Treatment plan upsert');
  }
}

// --- 5. INTERACTION (Atomic + Last Contact) ----------------------------------
export interface InsertInteractionOptions {
  actor?: string;
}

export async function insertInteractionFromDTO(
  dto: InteractionDTO,
  opts?: InsertInteractionOptions
): Promise<string | null> {
  const pool = createDatabaseClient();

  try {
    return await withTransaction(pool, async (tx) => {
      const leadId = await findLeadIdByExternal(dto.leadExternalSource, dto.leadExternalId, tx);
      if (!leadId) {
        logger.warn(
          { source: dto.leadExternalSource, contactId: dto.leadExternalId },
          'Lead not found for interaction'
        );
        return null;
      }

      const createdAt = dto.createdAt ?? new Date();
      const sentiment =
        dto.aiSentimentScore !== undefined ? clamp(dto.aiSentimentScore, -1.0, 1.0) : null;

      const result = await tx.query<{ id: string }>(
        `INSERT INTO interactions (
        lead_id, external_id, thread_id, provider, channel, direction, type,
        content, media_url, ai_sentiment_score, ai_tags, status, error_message, created_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14
      )
      ON CONFLICT (provider, external_id)
      DO NOTHING
      RETURNING id`,
        [
          leadId,
          dto.externalId,
          dto.threadId ?? null,
          dto.provider,
          dto.channel,
          dto.direction,
          dto.type,
          dto.content ?? null,
          dto.mediaUrl ?? null,
          sentiment,
          dto.aiTags ?? null,
          dto.status ?? null,
          dto.errorMessage ?? null,
          createdAt,
        ]
      );

      const interactionId = result.rows[0]?.id ?? null;

      if (interactionId) {
        await recordLeadEvent({
          leadId,
          eventType: 'interaction_added',
          actor: opts?.actor ?? 'system',
          payload: {
            interactionId,
            channel: dto.channel,
            direction: dto.direction,
            type: dto.type,
            sentiment,
          },
          client: tx,
        });

        await tx.query(
          `UPDATE leads
         SET last_interaction_at = $1, updated_at = NOW()
         WHERE id = $2`,
          [createdAt, leadId]
        );

        logger.info({ interactionId, leadId, channel: dto.channel }, 'Interaction added');
      }

      return interactionId;
    });
  } catch (error) {
    handleDatabaseError(error, 'Interaction insert');
  }
}

// --- 6. Query Helpers --------------------------------------------------------
export async function getLeadById(leadId: string): Promise<Record<string, unknown> | null> {
  const db = createDatabaseClient();
  const result = await db.query(`SELECT * FROM leads WHERE id = $1 LIMIT 1`, [leadId]);
  return result.rows[0] ?? null;
}

export async function getLeadByExternal(
  externalSource: string,
  externalContactId: string
): Promise<Record<string, unknown> | null> {
  const db = createDatabaseClient();
  const result = await db.query(
    `SELECT * FROM leads
     WHERE external_source = $1 AND external_contact_id = $2
     LIMIT 1`,
    [externalSource, externalContactId]
  );
  return result.rows[0] ?? null;
}

export async function getLeadEvents(
  leadId: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  const db = createDatabaseClient();
  const result = await db.query(
    `SELECT * FROM lead_events
     WHERE lead_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [leadId, limit]
  );
  return result.rows;
}

export async function getTreatmentPlansByLead(leadId: string): Promise<Record<string, unknown>[]> {
  const db = createDatabaseClient();
  const result = await db.query(
    `SELECT * FROM treatment_plans
     WHERE lead_id = $1
     ORDER BY created_at DESC`,
    [leadId]
  );
  return result.rows;
}

export async function getInteractionsByLead(
  leadId: string,
  limit = 100
): Promise<Record<string, unknown>[]> {
  const db = createDatabaseClient();
  const result = await db.query(
    `SELECT * FROM interactions
     WHERE lead_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [leadId, limit]
  );
  return result.rows;
}
