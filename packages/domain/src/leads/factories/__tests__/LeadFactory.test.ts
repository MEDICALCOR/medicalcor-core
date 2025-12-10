/**
 * @fileoverview Lead Factory Tests
 *
 * Comprehensive tests for Lead aggregate factory including creation,
 * reconstitution from events, snapshot restoration, and database hydration.
 *
 * @module domain/leads/factories/__tests__/LeadFactory
 */

import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { LeadFactory, leadFactory, type LeadAggregateSnapshot } from '../LeadFactory.js';
import { LeadAggregateRoot, type LeadDomainEvent } from '../../entities/Lead.js';
import { PhoneNumber } from '../../../shared-kernel/value-objects/phone-number.js';
import { LeadScore } from '../../../shared-kernel/value-objects/lead-score.js';

// =============================================================================
// TEST FIXTURES
// =============================================================================

const createValidPhone = (number = '+40700000001'): PhoneNumber => {
  return PhoneNumber.create(number);
};

const createLeadCreatedEvent = (id: string, phone: string): LeadDomainEvent => ({
  type: 'lead.created',
  payload: {
    phone,
    source: 'whatsapp',
    firstName: 'Ion',
    lastName: 'Popescu',
  },
  aggregateId: id,
  aggregateType: 'Lead',
  version: 1,
  timestamp: new Date(),
});

const createLeadScoredEvent = (id: string, version: number): LeadDomainEvent => ({
  type: 'lead.scored',
  payload: {
    score: 4,
    classification: 'HOT',
    confidence: 0.9,
    method: 'ai',
    reasoning: 'High intent detected',
  },
  aggregateId: id,
  aggregateType: 'Lead',
  version,
  timestamp: new Date(),
});

// =============================================================================
// TEST SUITE
// =============================================================================

describe('LeadFactory', () => {
  let factory: LeadFactory;

  beforeEach(() => {
    factory = new LeadFactory();
  });

  // ===========================================================================
  // BASIC CREATION TESTS
  // ===========================================================================

  describe('create', () => {
    it('should create a new Lead aggregate', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
      });

      expect(lead).toBeInstanceOf(LeadAggregateRoot);
      expect(lead.id).toBe('lead-001');
      expect(lead.phone.e164).toBe(phone.e164);
      expect(lead.source).toBe('whatsapp');
      expect(lead.status).toBe('new');
    });

    it('should create lead with optional fields', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-002',
        phone,
        source: 'web_form',
        email: 'test@example.com',
        firstName: 'Ion',
        lastName: 'Popescu',
        hubspotContactId: 'hs-123',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'dental-implants',
      });

      expect(lead.email).toBe('test@example.com');
      expect(lead.firstName).toBe('Ion');
      expect(lead.lastName).toBe('Popescu');
      expect(lead.hubspotContactId).toBe('hs-123');
    });

    it('should create lead with correlation ID', () => {
      const phone = createValidPhone();
      const lead = factory.create(
        {
          id: 'lead-003',
          phone,
          source: 'whatsapp',
        },
        'corr-123'
      );

      const events = lead.getUncommittedEvents();
      expect(events.length).toBeGreaterThan(0);
      expect(events[0].correlationId).toBe('corr-123');
    });

    it('should emit LeadCreated event', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-004',
        phone,
        source: 'whatsapp',
      });

      const events = lead.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('lead.created');
    });
  });

  describe('createWithGeneratedId', () => {
    it('should create lead with auto-generated ID', () => {
      const phone = createValidPhone();
      const lead = factory.createWithGeneratedId({
        phone,
        source: 'whatsapp',
      });

      expect(lead.id).toMatch(/^lead-\d+-[a-z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const phone = createValidPhone();
      const lead1 = factory.createWithGeneratedId({ phone, source: 'whatsapp' });
      const lead2 = factory.createWithGeneratedId({ phone, source: 'whatsapp' });

      expect(lead1.id).not.toBe(lead2.id);
    });
  });

  // ===========================================================================
  // EVENT SOURCING TESTS
  // ===========================================================================

  describe('reconstitute', () => {
    it('should reconstitute lead from events', () => {
      const events: LeadDomainEvent[] = [createLeadCreatedEvent('lead-001', '+40700000001')];

      const lead = factory.reconstitute('lead-001', events);

      expect(lead).toBeInstanceOf(LeadAggregateRoot);
      expect(lead.id).toBe('lead-001');
      expect(lead.source).toBe('whatsapp');
      expect(lead.version).toBe(1);
    });

    it('should replay multiple events', () => {
      const events: LeadDomainEvent[] = [
        createLeadCreatedEvent('lead-001', '+40700000001'),
        createLeadScoredEvent('lead-001', 2),
      ];

      const lead = factory.reconstitute('lead-001', events);

      expect(lead.version).toBe(2);
      expect(lead.currentScore).toBeDefined();
      expect(lead.currentScore?.numericValue).toBe(4);
    });

    it('should handle empty events array', () => {
      const lead = factory.reconstitute('lead-001', []);

      expect(lead).toBeInstanceOf(LeadAggregateRoot);
      expect(lead.id).toBe('lead-001');
      expect(lead.version).toBe(0);
    });

    it('should maintain event order', () => {
      const events: LeadDomainEvent[] = [
        createLeadCreatedEvent('lead-001', '+40700000001'),
        {
          type: 'lead.status_changed',
          payload: { previousStatus: 'new', newStatus: 'contacted' },
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          version: 2,
          timestamp: new Date(),
        },
        createLeadScoredEvent('lead-001', 3),
      ];

      const lead = factory.reconstitute('lead-001', events);

      expect(lead.version).toBe(3);
      expect(lead.status).toBe('contacted');
    });
  });

  describe('createEmpty', () => {
    it('should create empty lead for reconstitution', () => {
      const lead = factory.createEmpty('lead-001');

      expect(lead).toBeInstanceOf(LeadAggregateRoot);
      expect(lead.id).toBe('lead-001');
      expect(lead.version).toBe(0);
    });
  });

  // ===========================================================================
  // SNAPSHOT TESTS
  // ===========================================================================

  describe('createSnapshot', () => {
    it('should create snapshot from lead', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
        firstName: 'Ion',
        lastName: 'Popescu',
      });

      const snapshot = factory.createSnapshot(lead);

      expect(snapshot.aggregateId).toBe('lead-001');
      expect(snapshot.aggregateType).toBe('Lead');
      expect(snapshot.version).toBe(1);
      expect(snapshot.state.phone).toBe(phone.e164);
      expect(snapshot.state.firstName).toBe('Ion');
      expect(snapshot.createdAt).toBeDefined();
    });

    it('should serialize score in snapshot', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
      });

      // Score the lead
      lead.score(LeadScore.hot(), { method: 'ai', reasoning: 'Test', confidence: 0.9 });

      const snapshot = factory.createSnapshot(lead);

      expect(snapshot.state.score).toBeDefined();
      expect(snapshot.state.score?.numericValue).toBe(4);
      expect(snapshot.state.score?.classification).toBe('HOT');
    });

    it('should serialize dates as ISO strings', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
      });

      const snapshot = factory.createSnapshot(lead);

      expect(typeof snapshot.state.createdAt).toBe('string');
      expect(typeof snapshot.state.updatedAt).toBe('string');
      expect(new Date(snapshot.state.createdAt).toISOString()).toBe(snapshot.state.createdAt);
    });

    it('should serialize conversation history', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
      });

      lead.addConversationEntry({
        timestamp: new Date(),
        role: 'patient',
        channel: 'whatsapp',
        content: 'Hello, I need an appointment',
      });

      const snapshot = factory.createSnapshot(lead);

      expect(snapshot.state.conversationHistory).toHaveLength(1);
      expect(typeof snapshot.state.conversationHistory[0].timestamp).toBe('string');
    });
  });

  describe('fromSnapshot', () => {
    it('should restore lead from snapshot', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
        firstName: 'Ion',
      });

      const snapshot = factory.createSnapshot(lead);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.id).toBe('lead-001');
      expect(restored.phone.e164).toBe(phone.e164);
      expect(restored.firstName).toBe('Ion');
    });

    it('should restore score from snapshot', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
      });

      lead.score(LeadScore.hot(), { method: 'ai', reasoning: 'Test', confidence: 0.9 });

      const snapshot = factory.createSnapshot(lead);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.currentScore).toBeDefined();
      expect(restored.currentScore?.classification).toBe('HOT');
    });

    it('should apply events since snapshot', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
      });

      const snapshot = factory.createSnapshot(lead);

      // Events that occurred after the snapshot
      const eventsSinceSnapshot: LeadDomainEvent[] = [createLeadScoredEvent('lead-001', 2)];

      const restored = factory.fromSnapshot(snapshot, eventsSinceSnapshot);

      expect(restored.version).toBe(2);
      expect(restored.currentScore).toBeDefined();
    });

    it('should restore dates correctly', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
      });

      const snapshot = factory.createSnapshot(lead);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.createdAt).toBeInstanceOf(Date);
      expect(restored.updatedAt).toBeInstanceOf(Date);
    });
  });

  // ===========================================================================
  // DATABASE HYDRATION TESTS
  // ===========================================================================

  describe('fromDatabaseRecord', () => {
    it('should hydrate lead from database record', () => {
      const phone = PhoneNumber.create('+40700000001');
      const record = {
        id: 'lead-001',
        version: 1,
        phone,
        source: 'whatsapp' as const,
        status: 'new' as const,
        primarySymptoms: ['pain'],
        procedureInterest: ['implant'],
        conversationHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        email: 'test@example.com',
        firstName: 'Ion',
        lastName: 'Popescu',
      };

      const lead = factory.fromDatabaseRecord(record);

      expect(lead).toBeInstanceOf(LeadAggregateRoot);
      expect(lead.id).toBe('lead-001');
      expect(lead.email).toBe('test@example.com');
      expect(lead.firstName).toBe('Ion');
    });

    it('should handle optional fields in record', () => {
      const phone = PhoneNumber.create('+40700000001');
      const record = {
        id: 'lead-001',
        version: 1,
        phone,
        source: 'whatsapp' as const,
        status: 'new' as const,
        primarySymptoms: [],
        procedureInterest: [],
        conversationHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const lead = factory.fromDatabaseRecord(record);

      expect(lead.email).toBeUndefined();
      expect(lead.firstName).toBeUndefined();
    });

    it('should preserve score from record', () => {
      const phone = PhoneNumber.create('+40700000001');
      const score = LeadScore.hot();
      const record = {
        id: 'lead-001',
        version: 1,
        phone,
        source: 'whatsapp' as const,
        status: 'qualified' as const,
        score,
        primarySymptoms: [],
        procedureInterest: ['implant'],
        conversationHistory: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const lead = factory.fromDatabaseRecord(record);

      expect(lead.currentScore).toBe(score);
      expect(lead.status).toBe('qualified');
    });
  });

  // ===========================================================================
  // SINGLETON INSTANCE TESTS
  // ===========================================================================

  describe('leadFactory singleton', () => {
    it('should export singleton instance', () => {
      expect(leadFactory).toBeInstanceOf(LeadFactory);
    });

    it('should be usable for lead creation', () => {
      const phone = createValidPhone();
      const lead = leadFactory.create({
        id: 'lead-singleton',
        phone,
        source: 'whatsapp',
      });

      expect(lead).toBeInstanceOf(LeadAggregateRoot);
    });
  });

  // ===========================================================================
  // PROPERTY-BASED TESTS
  // ===========================================================================

  describe('Property-Based Tests', () => {
    it('should always create valid lead with any valid phone', () => {
      const validPhones = ['+40700000001', '+40700000002', '+40711111111', '+40722222222'];

      fc.assert(
        fc.property(
          fc.constantFrom(...validPhones),
          fc.constantFrom(
            'whatsapp',
            'voice',
            'web_form',
            'facebook',
            'google',
            'referral',
            'manual',
            'hubspot'
          ),
          (phoneStr, source) => {
            const phone = PhoneNumber.create(phoneStr);
            const lead = factory.create({
              id: `lead-${Date.now()}`,
              phone,
              source: source as any,
            });

            return (
              lead instanceof LeadAggregateRoot &&
              lead.phone.e164 === phoneStr &&
              lead.source === source &&
              lead.status === 'new'
            );
          }
        ),
        { numRuns: 20 }
      );
    });

    it('snapshot and restore should be idempotent', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-001',
        phone,
        source: 'whatsapp',
        firstName: 'Ion',
        lastName: 'Popescu',
        email: 'test@example.com',
      });

      const snapshot1 = factory.createSnapshot(lead);
      const restored = factory.fromSnapshot(snapshot1);
      const snapshot2 = factory.createSnapshot(restored);

      expect(snapshot1.state.phone).toBe(snapshot2.state.phone);
      expect(snapshot1.state.firstName).toBe(snapshot2.state.firstName);
      expect(snapshot1.state.lastName).toBe(snapshot2.state.lastName);
      expect(snapshot1.state.email).toBe(snapshot2.state.email);
      expect(snapshot1.state.source).toBe(snapshot2.state.source);
    });

    it('generated IDs should always be unique', () => {
      const phone = createValidPhone();
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const lead = factory.createWithGeneratedId({ phone, source: 'whatsapp' });
        ids.add(lead.id);
      }

      expect(ids.size).toBe(100);
    });
  });

  // ===========================================================================
  // EDGE CASES
  // ===========================================================================

  describe('Edge Cases', () => {
    it('should handle lead with all optional fields', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-full',
        phone,
        source: 'whatsapp',
        email: 'test@example.com',
        firstName: 'Ion',
        lastName: 'Popescu',
        hubspotContactId: 'hs-123',
        utmSource: 'google',
        utmMedium: 'cpc',
        utmCampaign: 'dental',
      });

      const snapshot = factory.createSnapshot(lead);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.hubspotContactId).toBe('hs-123');
    });

    it('should handle lead with conversation history', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-conv',
        phone,
        source: 'whatsapp',
      });

      // Add multiple conversation entries
      for (let i = 0; i < 5; i++) {
        lead.addConversationEntry({
          timestamp: new Date(),
          role: i % 2 === 0 ? 'patient' : 'assistant',
          channel: 'whatsapp',
          content: `Message ${i}`,
        });
      }

      const snapshot = factory.createSnapshot(lead);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.conversationHistory).toHaveLength(5);
    });

    it('should preserve procedure interest array', () => {
      const phone = createValidPhone();
      const lead = factory.create({
        id: 'lead-proc',
        phone,
        source: 'whatsapp',
      });

      lead.score(LeadScore.hot(), {
        method: 'ai',
        reasoning: 'High intent',
        confidence: 0.9,
        procedureInterest: ['all-on-4', 'dental-implant'],
      });

      const snapshot = factory.createSnapshot(lead);
      const restored = factory.fromSnapshot(snapshot);

      expect(restored.procedureInterest).toContain('all-on-4');
      expect(restored.procedureInterest).toContain('dental-implant');
    });
  });
});
