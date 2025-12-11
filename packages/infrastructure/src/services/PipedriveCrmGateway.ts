/**
 * @fileoverview Pipedrive CRM Gateway Adapter
 *
 * Infrastructure adapter implementing the ICrmGateway port from the domain layer.
 * Provides a vendor-agnostic interface for CRM operations using Pipedrive as backend.
 *
 * @module @medicalcor/infrastructure/services/PipedriveCrmGateway
 *
 * DESIGN PRINCIPLES:
 * 1. ANTI-CORRUPTION LAYER - Translates Pipedrive models to domain models
 * 2. PORT/ADAPTER PATTERN - Implements domain-defined port
 * 3. ERROR HANDLING - Maps Pipedrive errors to domain error types
 * 4. IDEMPOTENT OPERATIONS - Safe for retries
 */

import { createLogger } from '@medicalcor/core';
import type {
  ICrmGateway,
  CrmContact,
  CreateCrmContactInput,
  UpdateCrmContactInput,
  CrmDeal,
  CreateCrmDealInput,
  CrmTask,
  CreateCrmTaskInput,
  CrmNote,
  CreateCrmNoteInput,
  CrmPipeline,
  CrmPipelineStage,
  CrmOwner,
  CrmHealthStatus,
  CrmGatewayResult,
  CrmGatewayError,
  ScoreUpdateMetadata,
  LeadScore,
  PhoneNumber,
} from '@medicalcor/domain';
import { PipedriveClient, type PipedriveClientOptions } from '@medicalcor/integrations';
import type {
  PipedrivePerson,
  PipedriveDeal,
  PipedriveActivity,
  PipedriveNote as PipedriveNoteType,
  PipedrivePipeline as PipedrivePipelineType,
  PipedriveStage,
  PipedriveUser,
} from '@medicalcor/types';

const logger = createLogger({ name: 'pipedrive-crm-gateway' });

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract primary phone from Pipedrive phone array
 */
function extractPrimaryPhone(phones?: { value: string; primary?: boolean }[]): string | undefined {
  if (!phones?.length) return undefined;
  const primary = phones.find((p) => p.primary);
  return primary?.value ?? phones[0]?.value;
}

/**
 * Extract primary email from Pipedrive email array
 */
function extractPrimaryEmail(emails?: { value: string; primary?: boolean }[]): string | undefined {
  if (!emails?.length) return undefined;
  const primary = emails.find((e) => e.primary);
  return primary?.value ?? emails[0]?.value;
}

/**
 * Extract owner ID from Pipedrive owner field
 */
function extractOwnerId(owner?: number | { id: number }): string | undefined {
  if (!owner) return undefined;
  if (typeof owner === 'number') return String(owner);
  return String(owner.id);
}

/**
 * Extract person ID from Pipedrive person_id field
 */
function extractPersonId(personId?: number | { value: number }): string | undefined {
  if (!personId) return undefined;
  if (typeof personId === 'number') return String(personId);
  return String(personId.value);
}

/**
 * Map Pipedrive person to domain CrmContact
 */
function mapPersonToContact(person: PipedrivePerson): CrmContact {
  return {
    id: String(person.id),
    email: extractPrimaryEmail(person.email),
    phone: extractPrimaryPhone(person.phone),
    firstName: person.first_name,
    lastName: person.last_name,
    ownerId: extractOwnerId(person.owner_id),
    createdAt: person.add_time ? new Date(person.add_time) : new Date(),
    updatedAt: person.update_time ? new Date(person.update_time) : new Date(),
  };
}

/**
 * Map Pipedrive deal to domain CrmDeal
 */
function mapDealToCrmDeal(deal: PipedriveDeal): CrmDeal {
  return {
    id: String(deal.id),
    name: deal.title ?? 'Untitled Deal',
    amount: deal.value,
    currency: deal.currency,
    stage: deal.stage_id ? `stage_${deal.stage_id}` : 'unknown',
    pipeline: deal.pipeline_id ? String(deal.pipeline_id) : undefined,
    contactId: extractPersonId(deal.person_id),
    ownerId: extractOwnerId(deal.user_id),
    expectedCloseDate: deal.expected_close_date ? new Date(deal.expected_close_date) : undefined,
    createdAt: deal.add_time ? new Date(deal.add_time) : new Date(),
    updatedAt: deal.update_time ? new Date(deal.update_time) : new Date(),
  };
}

/**
 * Map Pipedrive activity to domain CrmTask
 */
function mapActivityToTask(activity: PipedriveActivity): CrmTask {
  const status = activity.done
    ? 'COMPLETED'
    : activity.marked_as_done_time
      ? 'COMPLETED'
      : 'NOT_STARTED';

  return {
    id: String(activity.id),
    subject: activity.subject ?? 'Untitled Task',
    body: activity.note,
    status: status as CrmTask['status'],
    priority: 'MEDIUM', // Pipedrive doesn't have priority, default to MEDIUM
    dueDate: activity.due_date ? new Date(activity.due_date) : undefined,
    contactId: activity.person_id ? String(activity.person_id) : undefined,
    dealId: activity.deal_id ? String(activity.deal_id) : undefined,
    ownerId: activity.user_id ? String(activity.user_id) : undefined,
    createdAt: activity.add_time ? new Date(activity.add_time) : new Date(),
  };
}

/**
 * Map Pipedrive note to domain CrmNote
 */
function mapNoteToCrmNote(note: PipedriveNoteType): CrmNote {
  return {
    id: String(note.id),
    body: note.content,
    contactId: note.person_id ? String(note.person_id) : undefined,
    dealId: note.deal_id ? String(note.deal_id) : undefined,
    createdAt: note.add_time ? new Date(note.add_time) : new Date(),
  };
}

/**
 * Map Pipedrive pipeline to domain CrmPipeline
 */
function mapPipelineToCrmPipeline(pipeline: PipedrivePipelineType): CrmPipeline {
  return {
    id: String(pipeline.id),
    name: pipeline.name,
    isDefault: pipeline.order_nr === 0,
  };
}

/**
 * Map Pipedrive stage to domain CrmPipelineStage
 */
function mapStageToCrmStage(stage: PipedriveStage): CrmPipelineStage {
  return {
    id: String(stage.id),
    name: stage.name,
    order: stage.order_nr ?? 0,
    probability: stage.deal_probability,
  };
}

/**
 * Map Pipedrive user to domain CrmOwner
 */
function mapUserToOwner(user: PipedriveUser): CrmOwner {
  const nameParts = user.name.split(' ');
  return {
    id: String(user.id),
    email: user.email,
    firstName: nameParts[0],
    lastName: nameParts.slice(1).join(' ') || undefined,
    isActive: user.active_flag ?? true,
  };
}

/**
 * Create success result
 */
function success<T>(value: T): CrmGatewayResult<T> {
  return { success: true, value };
}

/**
 * Create error result
 */
function error<T>(err: CrmGatewayError): CrmGatewayResult<T> {
  return { success: false, error: err };
}

/**
 * Map error to CrmGatewayError
 */
function mapError(err: unknown, operation: string): CrmGatewayError {
  const message = err instanceof Error ? err.message : 'Unknown error';

  // Determine error code based on message
  let code: CrmGatewayError['code'] = 'UNKNOWN_ERROR';
  let retryable = false;

  if (message.includes('404') || message.includes('not found')) {
    code = 'NOT_FOUND';
  } else if (message.includes('429') || message.includes('rate limit')) {
    code = 'RATE_LIMITED';
    retryable = true;
  } else if (message.includes('401') || message.includes('unauthorized')) {
    code = 'UNAUTHORIZED';
  } else if (message.includes('403') || message.includes('forbidden')) {
    code = 'FORBIDDEN';
  } else if (message.includes('timeout')) {
    code = 'TIMEOUT';
    retryable = true;
  } else if (message.includes('502') || message.includes('503') || message.includes('504')) {
    code = 'SERVICE_UNAVAILABLE';
    retryable = true;
  } else if (message.includes('ECONNREFUSED') || message.includes('network')) {
    code = 'CONNECTION_ERROR';
    retryable = true;
  } else if (message.includes('validation') || message.includes('invalid')) {
    code = 'VALIDATION_ERROR';
  }

  logger.error({ operation, code, message }, 'Pipedrive CRM Gateway error');

  return {
    code,
    message: `${operation}: ${message}`,
    retryable,
    cause: err instanceof Error ? err : undefined,
  };
}

// =============================================================================
// PIPEDRIVE CRM GATEWAY
// =============================================================================

/**
 * Pipedrive CRM Gateway Configuration
 */
export interface PipedriveCrmGatewayConfig extends PipedriveClientOptions {
  /** Custom field mapping for lead score */
  leadScoreField?: string;
  /** Custom field mapping for lead status */
  leadStatusField?: string;
  /** Custom field mapping for procedure interest */
  procedureInterestField?: string;
  /** Custom field mapping for budget range */
  budgetRangeField?: string;
  /** Custom field mapping for urgency level */
  urgencyLevelField?: string;
  /** Default pipeline ID for new deals */
  defaultPipelineId?: number;
}

/**
 * Pipedrive CRM Gateway
 *
 * Infrastructure adapter implementing ICrmGateway for Pipedrive.
 * Provides vendor-agnostic CRM operations with automatic error mapping.
 *
 * @example
 * ```typescript
 * const gateway = createPipedriveCrmGateway({
 *   apiToken: process.env.PIPEDRIVE_API_TOKEN!,
 *   companyDomain: 'medicalcor',
 * });
 *
 * // Find contact by phone
 * const result = await gateway.findContactByPhone(phoneNumber);
 * if (result.success) {
 *   console.log('Found contact:', result.value);
 * }
 * ```
 */
export class PipedriveCrmGateway implements ICrmGateway {
  private readonly client: PipedriveClient;
  private readonly config: PipedriveCrmGatewayConfig;

  constructor(config: PipedriveCrmGatewayConfig) {
    this.config = config;
    this.client = new PipedriveClient(config);

    logger.info({ companyDomain: config.companyDomain }, 'Pipedrive CRM Gateway initialized');
  }

  // ===========================================================================
  // CONTACT OPERATIONS
  // ===========================================================================

  async getContact(id: string): Promise<CrmGatewayResult<CrmContact | null>> {
    try {
      const person = await this.client.getPerson(parseInt(id, 10));
      if (!person) {
        return success(null);
      }
      return success(mapPersonToContact(person));
    } catch (err) {
      return error(mapError(err, 'getContact'));
    }
  }

  async findContactByPhone(phone: PhoneNumber): Promise<CrmGatewayResult<CrmContact | null>> {
    try {
      const phoneStr = phone.toString();
      const person = await this.client.findPersonByPhone(phoneStr);
      if (!person) {
        return success(null);
      }
      return success(mapPersonToContact(person));
    } catch (err) {
      return error(mapError(err, 'findContactByPhone'));
    }
  }

  async findContactByEmail(email: string): Promise<CrmGatewayResult<CrmContact | null>> {
    try {
      const person = await this.client.findPersonByEmail(email);
      if (!person) {
        return success(null);
      }
      return success(mapPersonToContact(person));
    } catch (err) {
      return error(mapError(err, 'findContactByEmail'));
    }
  }

  async createContact(
    input: CreateCrmContactInput,
    _idempotencyKey?: string
  ): Promise<CrmGatewayResult<CrmContact>> {
    try {
      const phoneStr = input.phone.toString();
      const person = await this.client.createPerson({
        name: [input.firstName, input.lastName].filter(Boolean).join(' ') || phoneStr,
        phone: [phoneStr],
        email: input.email ? [input.email] : undefined,
        owner_id: input.ownerId ? parseInt(input.ownerId, 10) : undefined,
        ...(input.customProperties as Record<string, unknown>),
      });
      return success(mapPersonToContact(person));
    } catch (err) {
      return error(mapError(err, 'createContact'));
    }
  }

  async updateContact(
    id: string,
    input: UpdateCrmContactInput
  ): Promise<CrmGatewayResult<CrmContact>> {
    try {
      const updateData: Record<string, unknown> = {};

      if (input.email) updateData.email = [input.email];
      if (input.firstName) updateData.first_name = input.firstName;
      if (input.lastName) updateData.last_name = input.lastName;
      if (input.company) updateData.org_name = input.company;
      if (input.ownerId) updateData.owner_id = parseInt(input.ownerId, 10);

      // Map custom fields
      if (input.leadScore && this.config.leadScoreField) {
        updateData[this.config.leadScoreField] = input.leadScore.numericValue;
      }
      if (input.leadStatus && this.config.leadStatusField) {
        updateData[this.config.leadStatusField] = input.leadStatus;
      }
      if (input.procedureInterest && this.config.procedureInterestField) {
        updateData[this.config.procedureInterestField] = input.procedureInterest.join(', ');
      }
      if (input.budgetRange && this.config.budgetRangeField) {
        updateData[this.config.budgetRangeField] = input.budgetRange;
      }
      if (input.urgencyLevel && this.config.urgencyLevelField) {
        updateData[this.config.urgencyLevelField] = input.urgencyLevel;
      }

      // Add any custom properties
      if (input.customProperties) {
        Object.assign(updateData, input.customProperties);
      }

      const person = await this.client.updatePerson(parseInt(id, 10), updateData);
      return success(mapPersonToContact(person));
    } catch (err) {
      return error(mapError(err, 'updateContact'));
    }
  }

  async upsertContact(input: CreateCrmContactInput): Promise<CrmGatewayResult<CrmContact>> {
    try {
      const phoneStr = input.phone.toString();
      const person = await this.client.upsertPersonByPhone(phoneStr, {
        name: [input.firstName, input.lastName].filter(Boolean).join(' ') || phoneStr,
        email: input.email ? [input.email] : undefined,
        owner_id: input.ownerId ? parseInt(input.ownerId, 10) : undefined,
        ...(input.customProperties as Record<string, unknown>),
      });
      return success(mapPersonToContact(person));
    } catch (err) {
      return error(mapError(err, 'upsertContact'));
    }
  }

  async updateContactScore(
    id: string,
    score: LeadScore,
    metadata?: ScoreUpdateMetadata
  ): Promise<CrmGatewayResult<CrmContact>> {
    try {
      const updateData: Record<string, unknown> = {};

      if (this.config.leadScoreField) {
        updateData[this.config.leadScoreField] = score.numericValue;
      }

      if (this.config.leadStatusField) {
        updateData[this.config.leadStatusField] = score.classification;
      }

      if (metadata?.procedureInterest && this.config.procedureInterestField) {
        updateData[this.config.procedureInterestField] = metadata.procedureInterest.join(', ');
      }

      const person = await this.client.updatePerson(parseInt(id, 10), updateData);

      // Add note with scoring reasoning if provided
      if (metadata?.reasoning) {
        await this.client.createNote({
          content: `[AI Scoring] Score: ${score.numericValue} (${score.classification})\nMethod: ${metadata.method}\n\n${metadata.reasoning}`,
          personId: parseInt(id, 10),
        });
      }

      return success(mapPersonToContact(person));
    } catch (err) {
      return error(mapError(err, 'updateContactScore'));
    }
  }

  async deleteContact(id: string): Promise<CrmGatewayResult<void>> {
    try {
      await this.client.deletePerson(parseInt(id, 10));
      return success(undefined);
    } catch (err) {
      return error(mapError(err, 'deleteContact'));
    }
  }

  // ===========================================================================
  // DEAL OPERATIONS
  // ===========================================================================

  async getDeal(id: string): Promise<CrmGatewayResult<CrmDeal | null>> {
    try {
      const deal = await this.client.getDeal(parseInt(id, 10));
      if (!deal) {
        return success(null);
      }
      return success(mapDealToCrmDeal(deal));
    } catch (err) {
      return error(mapError(err, 'getDeal'));
    }
  }

  async findDealsByContact(contactId: string): Promise<CrmGatewayResult<CrmDeal[]>> {
    try {
      const deals = await this.client.findDealsByPerson(parseInt(contactId, 10));
      return success(deals.map(mapDealToCrmDeal));
    } catch (err) {
      return error(mapError(err, 'findDealsByContact'));
    }
  }

  async createDeal(input: CreateCrmDealInput): Promise<CrmGatewayResult<CrmDeal>> {
    try {
      const deal = await this.client.createDeal({
        title: input.name,
        value: input.amount,
        currency: input.currency,
        person_id: parseInt(input.contactId, 10),
        user_id: input.ownerId ? parseInt(input.ownerId, 10) : undefined,
        pipeline_id: input.pipeline ? parseInt(input.pipeline, 10) : this.config.defaultPipelineId,
        stage_id: input.stage ? parseInt(input.stage.replace('stage_', ''), 10) : undefined,
        expected_close_date: input.expectedCloseDate?.toISOString().split('T')[0],
        ...(input.customProperties as Record<string, unknown>),
      });
      return success(mapDealToCrmDeal(deal));
    } catch (err) {
      return error(mapError(err, 'createDeal'));
    }
  }

  async updateDealStage(id: string, stage: string): Promise<CrmGatewayResult<CrmDeal>> {
    try {
      const stageId = parseInt(stage.replace('stage_', ''), 10);
      const deal = await this.client.updateDealStage(parseInt(id, 10), stageId);
      return success(mapDealToCrmDeal(deal));
    } catch (err) {
      return error(mapError(err, 'updateDealStage'));
    }
  }

  // ===========================================================================
  // TASK OPERATIONS
  // ===========================================================================

  async createTask(input: CreateCrmTaskInput): Promise<CrmGatewayResult<CrmTask>> {
    try {
      const activity = await this.client.createActivity({
        subject: input.subject,
        type: 'task',
        personId: input.contactId ? parseInt(input.contactId, 10) : undefined,
        dealId: input.dealId ? parseInt(input.dealId, 10) : undefined,
        dueDate: input.dueDate,
        note: input.body,
      });
      return success(mapActivityToTask(activity));
    } catch (err) {
      return error(mapError(err, 'createTask'));
    }
  }

  async getPendingTasksForContact(contactId: string): Promise<CrmGatewayResult<CrmTask[]>> {
    try {
      const activities = await this.client.getPendingActivitiesForPerson(parseInt(contactId, 10));
      return success(activities.map(mapActivityToTask));
    } catch (err) {
      return error(mapError(err, 'getPendingTasksForContact'));
    }
  }

  async completeTask(id: string): Promise<CrmGatewayResult<CrmTask>> {
    try {
      const activity = await this.client.completeActivity(parseInt(id, 10));
      return success(mapActivityToTask(activity));
    } catch (err) {
      return error(mapError(err, 'completeTask'));
    }
  }

  // ===========================================================================
  // NOTE OPERATIONS
  // ===========================================================================

  async addNote(input: CreateCrmNoteInput): Promise<CrmGatewayResult<CrmNote>> {
    try {
      const note = await this.client.createNote({
        content: input.body,
        personId: input.contactId ? parseInt(input.contactId, 10) : undefined,
        dealId: input.dealId ? parseInt(input.dealId, 10) : undefined,
      });
      return success(mapNoteToCrmNote(note));
    } catch (err) {
      return error(mapError(err, 'addNote'));
    }
  }

  async getNotesForContact(
    contactId: string,
    limit?: number
  ): Promise<CrmGatewayResult<CrmNote[]>> {
    try {
      const notes = await this.client.getNotesForPerson(parseInt(contactId, 10), limit);
      return success(notes.map(mapNoteToCrmNote));
    } catch (err) {
      return error(mapError(err, 'getNotesForContact'));
    }
  }

  // ===========================================================================
  // PIPELINE OPERATIONS
  // ===========================================================================

  async getPipelines(): Promise<CrmGatewayResult<CrmPipeline[]>> {
    try {
      const pipelines = await this.client.getPipelines();
      return success(pipelines.map(mapPipelineToCrmPipeline));
    } catch (err) {
      return error(mapError(err, 'getPipelines'));
    }
  }

  async getPipelineStages(pipelineId: string): Promise<CrmGatewayResult<CrmPipelineStage[]>> {
    try {
      const stages = await this.client.getStages(parseInt(pipelineId, 10));
      return success(stages.map(mapStageToCrmStage));
    } catch (err) {
      return error(mapError(err, 'getPipelineStages'));
    }
  }

  // ===========================================================================
  // OWNER OPERATIONS
  // ===========================================================================

  async getOwners(): Promise<CrmGatewayResult<CrmOwner[]>> {
    try {
      const users = await this.client.getUsers();
      return success(users.map(mapUserToOwner));
    } catch (err) {
      return error(mapError(err, 'getOwners'));
    }
  }

  async getOwner(id: string): Promise<CrmGatewayResult<CrmOwner | null>> {
    try {
      const user = await this.client.getUser(parseInt(id, 10));
      if (!user) {
        return success(null);
      }
      return success(mapUserToOwner(user));
    } catch (err) {
      return error(mapError(err, 'getOwner'));
    }
  }

  // ===========================================================================
  // HEALTH CHECK
  // ===========================================================================

  async healthCheck(): Promise<CrmGatewayResult<CrmHealthStatus>> {
    try {
      const status = await this.client.healthCheck();
      return success({
        connected: status.connected,
        latencyMs: status.latencyMs,
        rateLimit: status.rateLimit
          ? {
              remaining: status.rateLimit.remaining,
              resetAt: status.rateLimit.resetAt ?? new Date(),
            }
          : undefined,
        apiVersion: status.apiVersion,
      });
    } catch (err) {
      return error(mapError(err, 'healthCheck'));
    }
  }
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a Pipedrive CRM Gateway
 */
export function createPipedriveCrmGateway(config: PipedriveCrmGatewayConfig): ICrmGateway {
  return new PipedriveCrmGateway(config);
}

/**
 * Create Pipedrive CRM Gateway from environment variables
 */
export function createPipedriveCrmGatewayFromEnv(): ICrmGateway {
  const apiToken = process.env.PIPEDRIVE_API_TOKEN;
  if (!apiToken) {
    throw new Error('PIPEDRIVE_API_TOKEN environment variable is required');
  }

  return new PipedriveCrmGateway({
    apiToken,
    companyDomain: process.env.PIPEDRIVE_COMPANY_DOMAIN ?? 'medicalcor',
    leadScoreField: process.env.PIPEDRIVE_FIELD_LEAD_SCORE,
    leadStatusField: process.env.PIPEDRIVE_FIELD_LEAD_STATUS,
    procedureInterestField: process.env.PIPEDRIVE_FIELD_PROCEDURE_INTEREST,
    budgetRangeField: process.env.PIPEDRIVE_FIELD_BUDGET_RANGE,
    urgencyLevelField: process.env.PIPEDRIVE_FIELD_URGENCY_LEVEL,
    defaultPipelineId: process.env.PIPEDRIVE_DEFAULT_PIPELINE_ID
      ? parseInt(process.env.PIPEDRIVE_DEFAULT_PIPELINE_ID, 10)
      : undefined,
  });
}
