/**
 * HubSpot CRM Provider Adapter
 *
 * Implements the ICRMProvider interface for HubSpot.
 */

import { z } from 'zod';
import type {
  ICRMProvider,
  IContact,
  IContactProperties,
  IContactSearchFilters,
  IContactSyncInput,
  IActivity,
  ICreateActivityInput,
  ActivityDirection,
  ITask,
  ICreateTaskInput,
  IRetentionMetrics,
  LoyaltySegment,
  ChurnRisk,
  IHealthCheckResult,
  IWebhookVerification,
  ICRMWebhookPayload,
  IPaginationParams,
  IPaginatedResponse,
} from '@medicalcor/types';
import { withRetry, ExternalServiceError, RateLimitError, createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'hubspot-adapter' });

export interface HubSpotAdapterConfig {
  accessToken: string;
  portalId?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}

// Input validation
const ContactSyncSchema = z.object({
  phone: z.string().min(10).max(20),
  name: z.string().max(256).optional(),
  email: z.string().email().optional(),
  properties: z.record(z.string()).optional(),
});

/**
 * HubSpot implementation of the universal CRM Provider interface
 */
export class HubSpotAdapter implements ICRMProvider {
  readonly providerName = 'hubspot' as const;
  private config: HubSpotAdapterConfig;
  private baseUrl: string;

  constructor(config: HubSpotAdapterConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://api.hubapi.com';
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  async healthCheck(): Promise<IHealthCheckResult> {
    const startTime = Date.now();
    try {
      await this.request<unknown>('/crm/v3/objects/contacts?limit=1');
      return {
        healthy: true,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  // ===========================================================================
  // Contact Operations
  // ===========================================================================

  async syncContact(input: IContactSyncInput): Promise<IContact> {
    const validated = ContactSyncSchema.parse(input);

    // Search for existing contact
    const existing = await this.getContactByPhone(validated.phone);

    if (existing) {
      // Update existing contact
      return this.updateContact(existing.id, {
        ...(validated.name && !existing.properties.firstName ? { firstName: validated.name } : {}),
        ...(validated.email && !existing.properties.email ? { email: validated.email } : {}),
        ...validated.properties,
      });
    }

    // Create new contact
    const properties: Record<string, string> = {
      phone: validated.phone,
      ...(validated.name ? { firstname: validated.name } : {}),
      ...(validated.email ? { email: validated.email } : {}),
      ...validated.properties,
    };

    const response = await this.request<{
      id: string;
      properties: Record<string, string>;
      createdAt: string;
      updatedAt: string;
    }>('/crm/v3/objects/contacts', {
      method: 'POST',
      body: JSON.stringify({ properties }),
    });

    return this.mapHubSpotContact(response);
  }

  async getContact(contactId: string): Promise<IContact> {
    const properties = this.getContactProperties().join(',');
    const response = await this.request<{
      id: string;
      properties: Record<string, string>;
      createdAt: string;
      updatedAt: string;
    }>(`/crm/v3/objects/contacts/${contactId}?properties=${properties}`);

    return this.mapHubSpotContact(response);
  }

  async getContactByPhone(phone: string): Promise<IContact | null> {
    const response = await this.request<{
      results: {
        id: string;
        properties: Record<string, string>;
        createdAt: string;
        updatedAt: string;
      }[];
    }>('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: 'phone', operator: 'EQ', value: phone }],
          },
        ],
        properties: this.getContactProperties(),
        limit: 1,
      }),
    });

    const contact = response.results[0];
    if (!contact) return null;
    return this.mapHubSpotContact(contact);
  }

  async getContactByEmail(email: string): Promise<IContact | null> {
    const response = await this.request<{
      results: {
        id: string;
        properties: Record<string, string>;
        createdAt: string;
        updatedAt: string;
      }[];
    }>('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [{ propertyName: 'email', operator: 'EQ', value: email }],
          },
        ],
        properties: this.getContactProperties(),
        limit: 1,
      }),
    });

    const contact = response.results[0];
    if (!contact) return null;
    return this.mapHubSpotContact(contact);
  }

  async searchContacts(
    filters: IContactSearchFilters,
    pagination?: IPaginationParams
  ): Promise<IPaginatedResponse<IContact>> {
    const filterGroups: { filters: { propertyName: string; operator: string; value: string }[] }[] =
      [];

    if (filters.email) {
      filterGroups.push({
        filters: [{ propertyName: 'email', operator: 'EQ', value: filters.email }],
      });
    }
    if (filters.phone) {
      filterGroups.push({
        filters: [{ propertyName: 'phone', operator: 'EQ', value: filters.phone }],
      });
    }
    if (filters.name) {
      filterGroups.push({
        filters: [{ propertyName: 'firstname', operator: 'CONTAINS_TOKEN', value: filters.name }],
      });
    }
    if (filters.lifecycleStage) {
      filterGroups.push({
        filters: [
          { propertyName: 'lifecyclestage', operator: 'EQ', value: filters.lifecycleStage },
        ],
      });
    }

    const response = await this.request<{
      results: {
        id: string;
        properties: Record<string, string>;
        createdAt: string;
        updatedAt: string;
      }[];
      paging?: { next?: { after: string } };
    }>('/crm/v3/objects/contacts/search', {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: filterGroups.length > 0 ? filterGroups : undefined,
        properties: this.getContactProperties(),
        limit: pagination?.limit ?? 100,
        after: pagination?.cursor,
      }),
    });

    return {
      items: response.results.map((c) => this.mapHubSpotContact(c)),
      hasMore: !!response.paging?.next?.after,
      nextCursor: response.paging?.next?.after,
    };
  }

  async updateContact(
    contactId: string,
    properties: Partial<IContactProperties>
  ): Promise<IContact> {
    const hubspotProperties: Record<string, string> = {};

    if (properties.email) hubspotProperties.email = properties.email;
    if (properties.phone) hubspotProperties.phone = properties.phone;
    if (properties.firstName) hubspotProperties.firstname = properties.firstName;
    if (properties.lastName) hubspotProperties.lastname = properties.lastName;
    if (properties.lifecycleStage) hubspotProperties.lifecyclestage = properties.lifecycleStage;
    if (properties.leadScore !== undefined)
      hubspotProperties.lead_score = properties.leadScore.toString();

    if (properties.customProperties) {
      for (const [key, value] of Object.entries(properties.customProperties)) {
        hubspotProperties[key] = String(value);
      }
    }

    const response = await this.request<{
      id: string;
      properties: Record<string, string>;
      createdAt: string;
      updatedAt: string;
    }>(`/crm/v3/objects/contacts/${contactId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties: hubspotProperties }),
    });

    return this.mapHubSpotContact(response);
  }

  async deleteContact(contactId: string): Promise<void> {
    await this.request<undefined>(`/crm/v3/objects/contacts/${contactId}`, { method: 'DELETE' });
  }

  // ===========================================================================
  // Activity Operations
  // ===========================================================================

  async logActivity(input: ICreateActivityInput): Promise<IActivity> {
    const { contactId, type, body, direction, channel, externalId, metadata } = input;

    if (type === 'call') {
      return this.logCallActivity(
        contactId,
        body,
        direction ?? 'inbound',
        input.duration ?? 0,
        metadata
      );
    }

    // Create note for other activity types
    const response = await this.request<{
      id: string;
      properties: { hs_timestamp: string; hs_note_body: string };
    }>('/crm/v3/objects/notes', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_note_body: `[${channel?.toUpperCase() ?? type.toUpperCase()}] ${direction ?? ''}: ${body}${externalId ? ` (ID: ${externalId})` : ''}`,
        },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }],
          },
        ],
      }),
    });

    return {
      id: response.id,
      type,
      direction,
      body,
      channel,
      contactId,
      externalId,
      timestamp: new Date(response.properties.hs_timestamp),
      metadata,
    };
  }

  async logMessage(
    contactId: string,
    message: string,
    direction: ActivityDirection,
    channel: 'whatsapp' | 'voice' | 'email' | 'web' | 'sms'
  ): Promise<IActivity> {
    return this.logActivity({
      contactId,
      type: 'message',
      body: message,
      direction,
      channel,
    });
  }

  async logCall(input: {
    contactId: string;
    callId: string;
    duration: number;
    transcript?: string;
    sentiment?: string;
  }): Promise<IActivity> {
    return this.logCallActivity(
      input.contactId,
      input.transcript ?? 'Call completed',
      'inbound',
      input.duration,
      { callId: input.callId, sentiment: input.sentiment }
    );
  }

  async logPayment(input: {
    contactId: string;
    paymentId: string;
    amount: number;
    currency: string;
    status: string;
  }): Promise<IActivity> {
    return this.logActivity({
      contactId: input.contactId,
      type: 'payment',
      body: `Payment ${input.status}: ${(input.amount / 100).toFixed(2)} ${input.currency.toUpperCase()} (ID: ${input.paymentId})`,
      direction: 'inbound',
    });
  }

  async getActivities(
    contactId: string,
    pagination?: IPaginationParams
  ): Promise<IPaginatedResponse<IActivity>> {
    // HubSpot requires fetching notes associated with contact
    const response = await this.request<{
      results: {
        id: string;
        properties: { hs_timestamp: string; hs_note_body: string };
      }[];
      paging?: { next?: { after: string } };
    }>(
      `/crm/v3/objects/contacts/${contactId}/associations/notes?limit=${pagination?.limit ?? 100}`
    );

    const activities: IActivity[] = response.results.map((note) => ({
      id: note.id,
      type: 'note' as const,
      body: note.properties.hs_note_body,
      contactId,
      timestamp: new Date(note.properties.hs_timestamp),
    }));

    return {
      items: activities,
      hasMore: !!response.paging?.next?.after,
      nextCursor: response.paging?.next?.after,
    };
  }

  private async logCallActivity(
    contactId: string,
    body: string,
    direction: ActivityDirection,
    duration: number,
    metadata?: Record<string, unknown>
  ): Promise<IActivity> {
    const response = await this.request<{
      id: string;
      properties: { hs_timestamp: string; hs_call_body: string };
    }>('/crm/v3/objects/calls', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_call_body: body,
          hs_call_duration: duration.toString(),
          hs_call_direction: direction === 'inbound' ? 'INBOUND' : 'OUTBOUND',
          hs_call_status: 'COMPLETED',
        },
        associations: [
          {
            to: { id: contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 194 }],
          },
        ],
      }),
    });

    return {
      id: response.id,
      type: 'call',
      direction,
      body,
      channel: 'voice',
      contactId,
      timestamp: new Date(response.properties.hs_timestamp),
      duration,
      metadata,
    };
  }

  // ===========================================================================
  // Task Operations
  // ===========================================================================

  async createTask(input: ICreateTaskInput): Promise<ITask> {
    const response = await this.request<{
      id: string;
      properties: {
        hs_task_subject: string;
        hs_task_body: string;
        hs_task_status: string;
        hs_task_priority: string;
        hs_timestamp: string;
      };
    }>('/crm/v3/objects/tasks', {
      method: 'POST',
      body: JSON.stringify({
        properties: {
          hs_task_subject: input.subject,
          hs_task_body: input.body,
          hs_task_status: 'NOT_STARTED',
          hs_task_priority: (input.priority ?? 'medium').toUpperCase(),
          hs_timestamp: (input.dueDate ?? new Date()).toISOString(),
          hubspot_owner_id: input.ownerId,
        },
        associations: [
          {
            to: { id: input.contactId },
            types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 204 }],
          },
        ],
      }),
    });

    return this.mapHubSpotTask(response, input.contactId);
  }

  async getTask(taskId: string): Promise<ITask> {
    const response = await this.request<{
      id: string;
      properties: Record<string, string>;
    }>(`/crm/v3/objects/tasks/${taskId}`);

    return this.mapHubSpotTask(response);
  }

  async updateTask(
    taskId: string,
    updates: Partial<Pick<ITask, 'subject' | 'body' | 'priority' | 'status' | 'dueDate'>>
  ): Promise<ITask> {
    const properties: Record<string, string> = {};

    if (updates.subject) properties.hs_task_subject = updates.subject;
    if (updates.body) properties.hs_task_body = updates.body;
    if (updates.priority) properties.hs_task_priority = updates.priority.toUpperCase();
    if (updates.status) properties.hs_task_status = this.mapTaskStatusToHubSpot(updates.status);
    if (updates.dueDate) properties.hs_timestamp = updates.dueDate.toISOString();

    const response = await this.request<{
      id: string;
      properties: Record<string, string>;
    }>(`/crm/v3/objects/tasks/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({ properties }),
    });

    return this.mapHubSpotTask(response);
  }

  async completeTask(taskId: string): Promise<ITask> {
    return this.updateTask(taskId, { status: 'completed' });
  }

  async getTasksForContact(
    contactId: string,
    pagination?: IPaginationParams
  ): Promise<IPaginatedResponse<ITask>> {
    const response = await this.request<{
      results: { id: string; properties: Record<string, string> }[];
      paging?: { next?: { after: string } };
    }>(
      `/crm/v3/objects/contacts/${contactId}/associations/tasks?limit=${pagination?.limit ?? 100}`
    );

    return {
      items: response.results.map((t) => this.mapHubSpotTask(t, contactId)),
      hasMore: !!response.paging?.next?.after,
      nextCursor: response.paging?.next?.after,
    };
  }

  // ===========================================================================
  // Retention Operations
  // ===========================================================================

  async updateRetentionMetrics(
    contactId: string,
    metrics: Partial<IRetentionMetrics>
  ): Promise<IContact> {
    const properties: Record<string, string> = {};

    if (metrics.retentionScore !== undefined) {
      properties.retention_score = metrics.retentionScore.toString();
    }
    if (metrics.churnRisk) {
      properties.churn_risk = metrics.churnRisk;
    }
    if (metrics.daysInactive !== undefined) {
      properties.days_inactive = metrics.daysInactive.toString();
    }
    if (metrics.followUpPriority) {
      properties.follow_up_priority = metrics.followUpPriority.toUpperCase();
    }

    return this.updateContact(contactId, { customProperties: properties });
  }

  async updateNPSScore(contactId: string, score: number, feedback?: string): Promise<IContact> {
    let category: string;
    if (score >= 9) category = 'PROMOTOR';
    else if (score >= 7) category = 'PASIV';
    else category = 'DETRACTOR';

    const properties: Record<string, string> = {
      nps_score: score.toString(),
      nps_category: category,
      last_nps_survey_date: new Date().toISOString(),
    };

    if (feedback) {
      properties.nps_feedback = feedback;
    }

    return this.updateContact(contactId, { customProperties: properties });
  }

  async updateLoyaltySegment(contactId: string, segment: LoyaltySegment): Promise<IContact> {
    return this.updateContact(contactId, {
      customProperties: { loyalty_segment: segment },
    });
  }

  async getChurnRiskContacts(riskLevel?: ChurnRisk): Promise<IContact[]> {
    const response = await this.searchContacts({
      customProperty: { name: 'churn_risk', operator: 'eq', value: riskLevel ?? 'RIDICAT' },
    });
    return response.items;
  }

  async getNPSDetractors(): Promise<IContact[]> {
    const response = await this.searchContacts({
      customProperty: { name: 'nps_category', operator: 'eq', value: 'DETRACTOR' },
    });
    return response.items;
  }

  async getContactsByLoyaltySegment(segment: LoyaltySegment): Promise<IContact[]> {
    const response = await this.searchContacts({
      customProperty: {
        name: 'loyalty_segment',
        operator: 'eq',
        value: segment,
      },
    });
    return response.items;
  }

  async recordAppointmentCancellation(contactId: string): Promise<IContact> {
    const contact = await this.getContact(contactId);
    const currentCount = parseInt(
      contact.properties.customProperties?.canceled_appointments?.toString() ?? '0',
      10
    );

    return this.updateContact(contactId, {
      customProperties: { canceled_appointments: (currentCount + 1).toString() },
    });
  }

  async recordTreatmentCompletion(contactId: string, treatmentValue: number): Promise<IContact> {
    const contact = await this.getContact(contactId);
    const currentLTV = parseInt(
      contact.properties.customProperties?.lifetime_value?.toString() ?? '0',
      10
    );
    const newLTV = currentLTV + treatmentValue;

    let newSegment: LoyaltySegment = 'Bronze';
    if (newLTV >= 30000) newSegment = 'Platinum';
    else if (newLTV >= 15000) newSegment = 'Gold';
    else if (newLTV >= 5000) newSegment = 'Silver';

    return this.updateContact(contactId, {
      customProperties: {
        lifetime_value: newLTV.toString(),
        last_treatment_date: new Date().toISOString(),
        loyalty_segment: newSegment,
        days_inactive: '0',
      },
    });
  }

  // ===========================================================================
  // Webhook Operations
  // ===========================================================================

  verifyWebhook(_payload: string, _signature: string): IWebhookVerification {
    // HubSpot webhook verification would be implemented here
    return { valid: true };
  }

  parseWebhookPayload(payload: unknown): ICRMWebhookPayload | null {
    const event = payload as {
      eventId: number;
      subscriptionType: string;
      objectId: number;
      propertyName?: string;
      propertyValue?: string;
      occurredAt: number;
    };

    const eventTypeMap: Record<string, ICRMWebhookPayload['eventType']> = {
      'contact.creation': 'contact.created',
      'contact.propertyChange': 'contact.updated',
      'contact.deletion': 'contact.deleted',
      'deal.creation': 'deal.created',
      'deal.propertyChange': 'deal.updated',
    };

    const mappedType = eventTypeMap[event.subscriptionType];
    if (!mappedType) return null;

    return {
      eventType: mappedType,
      eventId: event.eventId.toString(),
      objectType: event.subscriptionType.split('.')[0] as 'contact' | 'deal' | 'task',
      objectId: event.objectId.toString(),
      changedProperties: event.propertyName ? [event.propertyName] : undefined,
      rawPayload: payload,
      timestamp: new Date(event.occurredAt),
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = this.config.timeoutMs ?? 30000;

    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.accessToken}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> | undefined),
          },
        });

        clearTimeout(timeoutId);

        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') ?? '5', 10);
          throw new RateLimitError(retryAfter);
        }

        if (!response.ok) {
          const errorBody = await response.text();
          logger.error({ status: response.status, url: path, errorBody }, 'HubSpot API error');
          throw new ExternalServiceError(
            'HubSpot',
            `Request failed with status ${response.status}`
          );
        }

        return (await response.json()) as T;
      } catch (error) {
        clearTimeout(timeoutId);
        if (error instanceof Error && error.name === 'AbortError') {
          throw new ExternalServiceError('HubSpot', `Request timeout after ${timeoutMs}ms`);
        }
        throw error;
      }
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof RateLimitError) return true;
        if (error instanceof ExternalServiceError && error.message.includes('502')) return true;
        if (error instanceof ExternalServiceError && error.message.includes('503')) return true;
        return false;
      },
    });
  }

  private getContactProperties(): string[] {
    return [
      'email',
      'phone',
      'firstname',
      'lastname',
      'lifecyclestage',
      'lead_status',
      'lead_score',
      'lead_source',
      'hs_language',
      'retention_score',
      'churn_risk',
      'nps_score',
      'nps_category',
      'loyalty_segment',
      'lifetime_value',
      'follow_up_priority',
    ];
  }

  private mapHubSpotContact(response: {
    id: string;
    properties: Record<string, string>;
    createdAt: string;
    updatedAt: string;
  }): IContact {
    const props = response.properties;
    // Build custom properties, filtering out undefined values
    const customProperties: Record<string, string | number | boolean> = {};
    if (props.retention_score) customProperties.retention_score = props.retention_score;
    if (props.churn_risk) customProperties.churn_risk = props.churn_risk;
    if (props.nps_score) customProperties.nps_score = props.nps_score;
    if (props.nps_category) customProperties.nps_category = props.nps_category;
    if (props.loyalty_segment) customProperties.loyalty_segment = props.loyalty_segment;
    if (props.lifetime_value) customProperties.lifetime_value = props.lifetime_value;

    return {
      id: response.id,
      providerContactId: response.id,
      properties: {
        email: props.email,
        phone: props.phone,
        firstName: props.firstname,
        lastName: props.lastname,
        fullName: [props.firstname, props.lastname].filter(Boolean).join(' ') || undefined,
        lifecycleStage: props.lifecyclestage as IContactProperties['lifecycleStage'],
        leadScore: props.lead_score ? parseInt(props.lead_score, 10) : undefined,
        leadSource: props.lead_source,
        language: props.hs_language,
        customProperties: Object.keys(customProperties).length > 0 ? customProperties : undefined,
      },
      createdAt: new Date(response.createdAt),
      updatedAt: new Date(response.updatedAt),
    };
  }

  private mapHubSpotTask(
    response: { id: string; properties: Record<string, string> },
    contactId?: string
  ): ITask {
    const props = response.properties;
    const subject = props.hs_task_subject ?? '';
    return {
      id: response.id,
      subject,
      body: props.hs_task_body,
      priority: (props.hs_task_priority?.toLowerCase() ?? 'medium') as ITask['priority'],
      status: this.mapHubSpotTaskStatus(props.hs_task_status ?? 'NOT_STARTED'),
      dueDate: props.hs_timestamp ? new Date(props.hs_timestamp) : undefined,
      contactId,
      ownerId: props.hubspot_owner_id,
      createdAt: new Date(props.hs_createdate ?? Date.now()),
      completedAt: props.hs_task_status === 'COMPLETED' ? new Date() : undefined,
    };
  }

  private mapHubSpotTaskStatus(status: string): ITask['status'] {
    switch (status) {
      case 'NOT_STARTED':
        return 'not_started';
      case 'IN_PROGRESS':
        return 'in_progress';
      case 'COMPLETED':
        return 'completed';
      case 'DEFERRED':
        return 'deferred';
      default:
        return 'not_started';
    }
  }

  private mapTaskStatusToHubSpot(status: ITask['status']): string {
    switch (status) {
      case 'not_started':
        return 'NOT_STARTED';
      case 'in_progress':
        return 'IN_PROGRESS';
      case 'completed':
        return 'COMPLETED';
      case 'deferred':
        return 'DEFERRED';
      case 'cancelled':
        return 'DEFERRED';
      default:
        return 'NOT_STARTED';
    }
  }
}

/**
 * Create HubSpot adapter
 */
export function createHubSpotAdapter(config: HubSpotAdapterConfig): ICRMProvider {
  return new HubSpotAdapter(config);
}
