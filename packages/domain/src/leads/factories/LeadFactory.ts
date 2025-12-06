/**
 * @fileoverview Lead Factory
 *
 * Factory for creating and reconstituting Lead aggregates.
 * Supports both fresh creation and event-sourced reconstitution.
 *
 * @module domain/leads/factories/LeadFactory
 *
 * DESIGN PRINCIPLES:
 * 1. ENCAPSULATED CREATION - Aggregate creation logic in one place
 * 2. EVENT SOURCING SUPPORT - Reconstitute from event history
 * 3. SNAPSHOT SUPPORT - Restore from snapshots for performance
 */

import {
  LeadAggregateRoot,
  type LeadAggregateState,
  type LeadDomainEvent,
  type CreateLeadParams,
} from '../entities/Lead.js';
import { PhoneNumber } from '../../shared-kernel/value-objects/phone-number.js';
import { LeadScore } from '../../shared-kernel/value-objects/lead-score.js';
import type {
  Lead,
  LeadSource,
  LeadStatus,
} from '../../shared-kernel/repository-interfaces/lead-repository.js';

// ============================================================================
// LEAD FACTORY
// ============================================================================

/**
 * Factory for creating Lead aggregates
 *
 * Provides centralized construction of Lead aggregates with:
 * - Fresh creation with validation
 * - Reconstitution from event history
 * - Restoration from snapshots
 * - Hydration from database records
 *
 * @example
 * ```typescript
 * const factory = new LeadFactory();
 *
 * // Create new lead
 * const lead = factory.create({
 *   id: 'lead-123',
 *   phone: PhoneNumber.create('+40700000001'),
 *   source: 'whatsapp',
 * });
 *
 * // Reconstitute from events
 * const reconstituted = factory.reconstitute('lead-123', events);
 *
 * // Hydrate from database record
 * const hydrated = factory.fromDatabaseRecord(dbRecord);
 * ```
 */
export class LeadFactory {
  /**
   * Create a new Lead aggregate
   *
   * @param params - Creation parameters
   * @param correlationId - Optional correlation ID for tracing
   * @returns New LeadAggregateRoot instance
   */
  create(params: CreateLeadParams, correlationId?: string): LeadAggregateRoot {
    return LeadAggregateRoot.create(params, correlationId);
  }

  /**
   * Create a new Lead with generated ID
   *
   * @param params - Creation parameters without ID
   * @param correlationId - Optional correlation ID for tracing
   * @returns New LeadAggregateRoot instance
   */
  createWithGeneratedId(
    params: Omit<CreateLeadParams, 'id'>,
    correlationId?: string
  ): LeadAggregateRoot {
    const id = this.generateId();
    return LeadAggregateRoot.create({ ...params, id }, correlationId);
  }

  /**
   * Reconstitute a Lead from event history (event sourcing)
   *
   * @param id - Lead aggregate ID
   * @param events - Domain events to replay
   * @returns Reconstituted LeadAggregateRoot
   */
  reconstitute(id: string, events: LeadDomainEvent[]): LeadAggregateRoot {
    return LeadAggregateRoot.fromEvents(id, events);
  }

  /**
   * Restore a Lead from a snapshot
   *
   * @param snapshot - Aggregate snapshot
   * @param eventsSinceSnapshot - Events since the snapshot was taken
   * @returns Restored LeadAggregateRoot
   */
  fromSnapshot(
    snapshot: LeadAggregateSnapshot,
    eventsSinceSnapshot: LeadDomainEvent[] = []
  ): LeadAggregateRoot {
    const state = this.snapshotToState(snapshot);
    const lead = LeadAggregateRoot.reconstitute(state);

    // Apply any events that occurred after the snapshot
    if (eventsSinceSnapshot.length > 0) {
      lead.loadFromHistory(eventsSinceSnapshot);
    }

    return lead;
  }

  /**
   * Hydrate a Lead from a database record (Lead interface)
   *
   * @param record - Lead database record
   * @returns Hydrated LeadAggregateRoot
   */
  fromDatabaseRecord(record: Lead): LeadAggregateRoot {
    const state: LeadAggregateState = {
      id: record.id,
      version: record.version,
      phone: record.phone,
      email: record.email,
      hubspotContactId: record.hubspotContactId,
      hubspotDealId: record.hubspotDealId,
      firstName: record.firstName,
      lastName: record.lastName,
      dateOfBirth: record.dateOfBirth,
      city: record.city,
      county: record.county,
      source: record.source,
      status: record.status,
      score: record.score,
      primarySymptoms: record.primarySymptoms,
      procedureInterest: record.procedureInterest,
      urgencyLevel: record.urgencyLevel,
      conversationHistory: record.conversationHistory,
      lastContactAt: record.lastContactAt,
      utmSource: record.utmSource,
      utmMedium: record.utmMedium,
      utmCampaign: record.utmCampaign,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      isDeleted: false,
    };

    return LeadAggregateRoot.reconstitute(state);
  }

  /**
   * Create an empty Lead for reconstitution
   * Used internally by event-sourced repositories
   *
   * @param id - Lead ID
   * @returns Empty LeadAggregateRoot ready for event replay
   */
  createEmpty(id: string): LeadAggregateRoot {
    return LeadAggregateRoot.fromEvents(id, []);
  }

  // ============================================================================
  // SNAPSHOT SUPPORT
  // ============================================================================

  /**
   * Create a snapshot from a Lead aggregate
   *
   * @param lead - Lead aggregate to snapshot
   * @returns Lead aggregate snapshot
   */
  createSnapshot(lead: LeadAggregateRoot): LeadAggregateSnapshot {
    const state = lead.getState();
    return {
      aggregateId: state.id,
      aggregateType: 'Lead',
      version: state.version,
      state: {
        phone: state.phone.e164,
        email: state.email,
        hubspotContactId: state.hubspotContactId,
        hubspotDealId: state.hubspotDealId,
        firstName: state.firstName,
        lastName: state.lastName,
        dateOfBirth: state.dateOfBirth?.toISOString(),
        city: state.city,
        county: state.county,
        source: state.source,
        status: state.status,
        score: state.score
          ? {
              numericValue: state.score.numericValue,
              classification: state.score.classification,
              confidence: state.score.confidence,
              scoredAt: state.score.scoredAt.toISOString(),
            }
          : undefined,
        primarySymptoms: [...state.primarySymptoms],
        procedureInterest: [...state.procedureInterest],
        urgencyLevel: state.urgencyLevel,
        conversationHistory: state.conversationHistory.map((entry) => ({
          ...entry,
          timestamp: entry.timestamp.toISOString(),
        })),
        lastContactAt: state.lastContactAt?.toISOString(),
        assignedTo: state.assignedTo,
        assignedAt: state.assignedAt?.toISOString(),
        utmSource: state.utmSource,
        utmMedium: state.utmMedium,
        utmCampaign: state.utmCampaign,
        createdAt: state.createdAt.toISOString(),
        updatedAt: state.updatedAt.toISOString(),
        isDeleted: state.isDeleted,
        deletedAt: state.deletedAt?.toISOString(),
        deletionReason: state.deletionReason,
      },
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate a unique Lead ID
   */
  private generateId(): string {
    return `lead-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  /**
   * Convert a snapshot to aggregate state
   */
  private snapshotToState(snapshot: LeadAggregateSnapshot): LeadAggregateState {
    const data = snapshot.state;
    return {
      id: snapshot.aggregateId,
      version: snapshot.version,
      phone: PhoneNumber.create(data.phone),
      email: data.email,
      hubspotContactId: data.hubspotContactId,
      hubspotDealId: data.hubspotDealId,
      firstName: data.firstName,
      lastName: data.lastName,
      dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
      city: data.city,
      county: data.county,
      source: data.source as LeadSource,
      status: data.status as LeadStatus,
      score: data.score
        ? LeadScore.fromNumeric(data.score.numericValue, data.score.confidence)
        : undefined,
      primarySymptoms: data.primarySymptoms,
      procedureInterest: data.procedureInterest,
      urgencyLevel: data.urgencyLevel as
        | 'emergency'
        | 'urgent'
        | 'routine'
        | 'preventive'
        | undefined,
      conversationHistory: data.conversationHistory.map((entry) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      })),
      lastContactAt: data.lastContactAt ? new Date(data.lastContactAt) : undefined,
      assignedTo: data.assignedTo,
      assignedAt: data.assignedAt ? new Date(data.assignedAt) : undefined,
      utmSource: data.utmSource,
      utmMedium: data.utmMedium,
      utmCampaign: data.utmCampaign,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt),
      isDeleted: data.isDeleted,
      deletedAt: data.deletedAt ? new Date(data.deletedAt) : undefined,
      deletionReason: data.deletionReason,
    };
  }
}

// ============================================================================
// SNAPSHOT TYPES
// ============================================================================

/**
 * Lead aggregate snapshot for persistence
 */
export interface LeadAggregateSnapshot {
  readonly aggregateId: string;
  readonly aggregateType: 'Lead';
  readonly version: number;
  readonly state: LeadSnapshotState;
  readonly createdAt: string;
}

/**
 * Serializable Lead state for snapshots
 */
export interface LeadSnapshotState {
  readonly phone: string;
  readonly email?: string;
  readonly hubspotContactId?: string;
  readonly hubspotDealId?: string;
  readonly firstName?: string;
  readonly lastName?: string;
  readonly dateOfBirth?: string;
  readonly city?: string;
  readonly county?: string;
  readonly source: string;
  readonly status: string;
  readonly score?: {
    readonly numericValue: number;
    readonly classification: string;
    readonly confidence: number;
    readonly scoredAt: string;
  };
  readonly primarySymptoms: readonly string[];
  readonly procedureInterest: readonly string[];
  readonly urgencyLevel?: string;
  readonly conversationHistory: readonly SerializedConversationEntry[];
  readonly lastContactAt?: string;
  readonly assignedTo?: string;
  readonly assignedAt?: string;
  readonly utmSource?: string;
  readonly utmMedium?: string;
  readonly utmCampaign?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isDeleted: boolean;
  readonly deletedAt?: string;
  readonly deletionReason?: string;
}

/**
 * Serialized conversation entry for snapshots
 */
export interface SerializedConversationEntry {
  readonly id: string;
  readonly timestamp: string;
  readonly role: 'patient' | 'assistant' | 'agent' | 'system';
  readonly channel: 'whatsapp' | 'voice' | 'sms' | 'email';
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

/**
 * Default LeadFactory instance
 */
export const leadFactory = new LeadFactory();
