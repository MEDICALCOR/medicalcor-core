/**
 * CRM Database Operations
 * Lead Generation Machine - Upsert, Events, Interactions
 *
 * PLATINUM STANDARD: SQL queries extracted to crm.db.sql.ts for maintainability
 */

/* eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive fallbacks for optional DTO properties */

import {
  createDatabaseClient,
  withTransaction,
  type DatabasePool,
  type TransactionClient,
} from './database.js';
import { createLogger } from './logger.js';
import {
  DatabaseConnectionError,
  DatabaseOperationError,
  LeadNotFoundError,
  LeadUpsertError,
} from './errors.js';
import type { LeadDTO, TreatmentPlanDTO, InteractionDTO } from '@medicalcor/types';

// Import extracted SQL queries for maintainability
import {
  FIND_LEAD_BY_EXTERNAL_SQL,
  FIND_PRACTITIONER_BY_EXTERNAL_USER_SQL,
  INSERT_LEAD_EVENT_SQL,
  INSERT_LEAD_SQL,
  UPDATE_LEAD_SQL,
  INSERT_TREATMENT_PLAN_SQL,
  UPDATE_TREATMENT_PLAN_SQL,
  INSERT_INTERACTION_SQL,
  UPDATE_LEAD_LAST_INTERACTION_SQL,
  GET_LEAD_BY_ID_SQL,
  GET_LEAD_BY_EXTERNAL_SQL,
  GET_LEAD_EVENTS_SQL,
  GET_TREATMENT_PLANS_BY_LEAD_SQL,
  GET_INTERACTIONS_BY_LEAD_SQL,
} from './crm.db.sql.js';

const logger = createLogger({ name: 'crm-db' });

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
  const result = await db.query<{ id: string }>(FIND_LEAD_BY_EXTERNAL_SQL, [
    externalSource,
    externalContactId,
  ]);
  return result.rows[0]?.id ?? null;
}

export async function findPractitionerIdByExternalUserId(
  externalUserId: string,
  client?: DatabasePool | TransactionClient
): Promise<string | null> {
  const db = client ?? createDatabaseClient();
  const result = await db.query<{ id: string }>(FIND_PRACTITIONER_BY_EXTERNAL_USER_SQL, [
    externalUserId,
  ]);
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

  await db.query(INSERT_LEAD_EVENT_SQL, [
    leadId,
    eventType,
    actor,
    payload ? JSON.stringify(payload) : null,
  ]);
}

// --- 3. UPSERT LEAD (Smart Patch) --------------------------------------------
export interface UpsertLeadOptions {
  createdBy?: string;
  clinicId?: string;
  actor?: string;
}

export async function upsertLeadFromDTO(dto: LeadDTO, opts?: UpsertLeadOptions): Promise<string> {
  let pool: DatabasePool;

  try {
    pool = createDatabaseClient();
  } catch (error) {
    throw new DatabaseConnectionError(
      error instanceof Error ? error.message : 'Failed to connect to database'
    );
  }

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

      // C. INSERT first (using extracted SQL)
      const insertResult = await tx.query<{ id: string }>(INSERT_LEAD_SQL, [
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
      ]);

      let leadId = insertResult.rows[0]?.id;
      let eventType: 'lead_created' | 'lead_updated' = 'lead_created';

      // D. UPDATE (patch) dacă există deja (using extracted SQL)
      if (!leadId) {
        const updateResult = await tx.query<{ id: string }>(UPDATE_LEAD_SQL, [
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
        ]);

        if (!updateResult.rows[0]) {
          throw new LeadUpsertError(dto.externalSource, dto.externalContactId);
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
    // Re-throw domain errors as-is
    if (error instanceof LeadUpsertError || error instanceof DatabaseConnectionError) {
      throw error;
    }

    // Wrap unexpected errors in typed domain error
    logger.error(
      { error, source: dto.externalSource, contactId: dto.externalContactId },
      'Lead upsert failed'
    );
    throw new LeadUpsertError(
      dto.externalSource,
      dto.externalContactId,
      error instanceof Error ? error : new Error(String(error))
    );
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

      // 1. INSERT (using extracted SQL)
      const insertResult = await tx.query<{ id: string }>(INSERT_TREATMENT_PLAN_SQL, [
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
      ]);

      let planId = insertResult.rows[0]?.id;
      let eventType: 'treatment_plan_created' | 'treatment_plan_updated' = 'treatment_plan_created';

      // 2. UPDATE (patch) using extracted SQL
      if (!planId) {
        const updateResult = await tx.query<{ id: string }>(UPDATE_TREATMENT_PLAN_SQL, [
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
        ]);

        if (!updateResult.rows[0]) {
          throw new DatabaseOperationError(
            'treatment_plan_upsert',
            'Treatment plan disappeared during upsert'
          );
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
    if (error instanceof LeadNotFoundError || error instanceof DatabaseOperationError) {
      throw error;
    }
    logger.error({ error, dealId: dto.externalDealId }, 'Treatment plan upsert failed');
    throw new DatabaseOperationError(
      'treatment_plan_upsert',
      error instanceof Error ? error.message : String(error)
    );
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

      const result = await tx.query<{ id: string }>(INSERT_INTERACTION_SQL, [
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
      ]);

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

        await tx.query(UPDATE_LEAD_LAST_INTERACTION_SQL, [createdAt, leadId]);

        logger.info({ interactionId, leadId, channel: dto.channel }, 'Interaction added');
      }

      return interactionId;
    });
  } catch (error) {
    logger.error(
      { error, provider: dto.provider, externalId: dto.externalId },
      'Interaction insert failed'
    );
    throw new DatabaseOperationError(
      'interaction_insert',
      error instanceof Error ? error.message : String(error)
    );
  }
}

// --- 6. Query Helpers --------------------------------------------------------
export async function getLeadById(leadId: string): Promise<Record<string, unknown> | null> {
  const db = createDatabaseClient();
  const result = await db.query(GET_LEAD_BY_ID_SQL, [leadId]);
  return result.rows[0] ?? null;
}

export async function getLeadByExternal(
  externalSource: string,
  externalContactId: string
): Promise<Record<string, unknown> | null> {
  const db = createDatabaseClient();
  const result = await db.query(GET_LEAD_BY_EXTERNAL_SQL, [externalSource, externalContactId]);
  return result.rows[0] ?? null;
}

export async function getLeadEvents(
  leadId: string,
  limit = 50
): Promise<Record<string, unknown>[]> {
  const db = createDatabaseClient();
  const result = await db.query(GET_LEAD_EVENTS_SQL, [leadId, limit]);
  return result.rows;
}

export async function getTreatmentPlansByLead(leadId: string): Promise<Record<string, unknown>[]> {
  const db = createDatabaseClient();
  const result = await db.query(GET_TREATMENT_PLANS_BY_LEAD_SQL, [leadId]);
  return result.rows;
}

export async function getInteractionsByLead(
  leadId: string,
  limit = 100
): Promise<Record<string, unknown>[]> {
  const db = createDatabaseClient();
  const result = await db.query(GET_INTERACTIONS_BY_LEAD_SQL, [leadId, limit]);
  return result.rows;
}
