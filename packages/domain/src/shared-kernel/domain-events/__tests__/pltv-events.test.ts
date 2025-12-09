/**
 * @fileoverview Tests for pLTV Domain Events
 *
 * Comprehensive tests for pLTV event factories, type guards, and metadata creation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createPLTVEventMetadata,
  createPLTVScoredEvent,
  createHighValuePatientIdentifiedEvent,
  createPLTVTierChangedEvent,
  createPLTVDeclineDetectedEvent,
  createPLTVGrowthOpportunityIdentifiedEvent,
  createBatchPLTVScoringStartedEvent,
  createBatchPLTVScoringCompletedEvent,
  isPLTVScoredEvent,
  isHighValuePatientIdentifiedEvent,
  isPLTVTierChangedEvent,
  isPLTVDeclineDetectedEvent,
  isPLTVGrowthOpportunityIdentifiedEvent,
  isBatchPLTVScoringStartedEvent,
  isBatchPLTVScoringCompletedEvent,
} from '../pltv-events.js';
import type {
  PLTVScoredPayload,
  HighValuePatientIdentifiedPayload,
  PLTVTierChangedPayload,
  PLTVDeclineDetectedPayload,
  PLTVGrowthOpportunityIdentifiedPayload,
  BatchPLTVScoringStartedPayload,
  BatchPLTVScoringCompletedPayload,
  PLTVDomainEvent,
} from '../pltv-events.js';
import type { EventMetadata } from '../lead-events.js';

describe('PLTV Domain Events', () => {
  const mockCorrelationId = 'corr-123';
  const mockCausationId = 'cause-456';
  const mockActor = 'user-789';
  const mockAggregateId = 'lead-001';

  // Mock crypto.randomUUID
  const mockUUID = 'mock-uuid-1234-5678-9012';
  const mockRandomUUID = vi.fn().mockReturnValue(mockUUID);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:30:00.000Z'));

    // Use stubGlobal for crypto mocking
    vi.stubGlobal('crypto', {
      randomUUID: mockRandomUUID,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    mockRandomUUID.mockClear();
  });

  // ==========================================================================
  // METADATA TESTS
  // ==========================================================================

  describe('createPLTVEventMetadata', () => {
    it('should create metadata with required fields', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);

      expect(metadata.eventId).toBe(mockUUID);
      expect(metadata.timestamp).toBe('2024-01-15T10:30:00.000Z');
      expect(metadata.correlationId).toBe(mockCorrelationId);
      expect(metadata.idempotencyKey).toContain('pltv-');
      expect(metadata.idempotencyKey).toContain(mockCorrelationId);
      expect(metadata.version).toBe(1);
      expect(metadata.source).toBe('pltv-scoring-service');
    });

    it('should include causationId when provided', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId, mockCausationId);

      expect(metadata.causationId).toBe(mockCausationId);
    });

    it('should include actor when provided (without causationId)', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId, undefined, mockActor);

      expect(metadata.actor).toBe(mockActor);
      expect(metadata.causationId).toBeUndefined();
    });

    it('should prioritize causationId over actor when both provided', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId, mockCausationId, mockActor);

      expect(metadata.causationId).toBe(mockCausationId);
      // Due to the implementation, actor is not added when causationId is present
    });

    it('should generate unique idempotency keys', () => {
      let callCount = 0;
      mockRandomUUID.mockImplementation(() => {
        callCount++;
        return `uuid-${callCount}`;
      });

      const metadata1 = createPLTVEventMetadata(mockCorrelationId);
      const metadata2 = createPLTVEventMetadata(mockCorrelationId);

      expect(metadata1.idempotencyKey).not.toBe(metadata2.idempotencyKey);
    });
  });

  // ==========================================================================
  // UUID FALLBACK TEST
  // ==========================================================================

  describe('UUID generation fallback', () => {
    it('should use fallback UUID generation when crypto.randomUUID is unavailable', () => {
      // Remove randomUUID to test fallback
      vi.stubGlobal('crypto', {
        randomUUID: undefined,
      });

      const metadata = createPLTVEventMetadata(mockCorrelationId);

      expect(metadata.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });
  });

  // ==========================================================================
  // FACTORY FUNCTION TESTS
  // ==========================================================================

  describe('createPLTVScoredEvent', () => {
    it('should create a PLTVScored event with correct structure', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: PLTVScoredPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        predictedLTV: 15000,
        tier: 'GOLD',
        growthPotential: 'HIGH',
        investmentPriority: 'HIGH',
        confidence: 0.85,
        method: 'ml',
        modelVersion: 'v2.1.0',
        reasoning: 'High intent patient with procedure interest',
      };

      const event = createPLTVScoredEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('pltv.scored');
      expect(event.aggregateId).toBe(mockAggregateId);
      expect(event.aggregateType).toBe('Lead');
      expect(event.metadata).toBe(metadata);
      expect(event.payload).toEqual(payload);
    });

    it('should handle optional previousPLTV field', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: PLTVScoredPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        predictedLTV: 20000,
        previousPLTV: 15000,
        tier: 'PLATINUM',
        growthPotential: 'MEDIUM',
        investmentPriority: 'MEDIUM',
        confidence: 0.9,
        method: 'hybrid',
        modelVersion: 'v2.1.0',
        reasoning: 'Rescoring shows improvement',
      };

      const event = createPLTVScoredEvent(mockAggregateId, payload, metadata);

      expect(event.payload.previousPLTV).toBe(15000);
    });
  });

  describe('createHighValuePatientIdentifiedEvent', () => {
    it('should create a HighValuePatientIdentified event', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: HighValuePatientIdentifiedPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        predictedLTV: 50000,
        tier: 'DIAMOND',
        growthPotential: 'HIGH',
        investmentPriority: 'CRITICAL',
        confidence: 0.95,
        patientName: 'John Doe',
        phone: '+40721000000',
        recommendedActions: ['VIP treatment', 'Priority scheduling'],
        followUpDeadline: '2024-01-16T10:00:00.000Z',
      };

      const event = createHighValuePatientIdentifiedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('pltv.high_value_patient_identified');
      expect(event.aggregateId).toBe(mockAggregateId);
      expect(event.aggregateType).toBe('Lead');
      expect(event.payload).toEqual(payload);
    });

    it('should handle optional patient contact fields', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: HighValuePatientIdentifiedPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        predictedLTV: 30000,
        tier: 'GOLD',
        growthPotential: 'MEDIUM',
        investmentPriority: 'HIGH',
        confidence: 0.88,
        recommendedActions: ['Personal outreach'],
        followUpDeadline: '2024-01-17T10:00:00.000Z',
      };

      const event = createHighValuePatientIdentifiedEvent(mockAggregateId, payload, metadata);

      expect(event.payload.patientName).toBeUndefined();
      expect(event.payload.phone).toBeUndefined();
    });
  });

  describe('createPLTVTierChangedEvent', () => {
    it('should create a PLTVTierChanged event for upgrade', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: PLTVTierChangedPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        previousPLTV: 10000,
        newPLTV: 25000,
        previousTier: 'SILVER',
        newTier: 'GOLD',
        changePercentage: 150,
        direction: 'upgrade',
        changeReason: 'Completed high-value treatment',
      };

      const event = createPLTVTierChangedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('pltv.tier_changed');
      expect(event.payload.direction).toBe('upgrade');
    });

    it('should create a PLTVTierChanged event for downgrade', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: PLTVTierChangedPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        previousPLTV: 25000,
        newPLTV: 8000,
        previousTier: 'GOLD',
        newTier: 'BRONZE',
        changePercentage: -68,
        direction: 'downgrade',
        changeReason: 'Missed appointments and lack of engagement',
      };

      const event = createPLTVTierChangedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('pltv.tier_changed');
      expect(event.payload.direction).toBe('downgrade');
    });
  });

  describe('createPLTVDeclineDetectedEvent', () => {
    it('should create a PLTVDeclineDetected event', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: PLTVDeclineDetectedPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        previousPLTV: 20000,
        newPLTV: 8000,
        declinePercentage: 60,
        riskFactors: ['Missed appointments', 'Negative feedback'],
        recommendedInterventions: ['Outreach call', 'Special offer'],
        patientName: 'Jane Smith',
        phone: '+40722000000',
      };

      const event = createPLTVDeclineDetectedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('pltv.decline_detected');
      expect(event.payload.riskFactors).toContain('Missed appointments');
      expect(event.payload.recommendedInterventions).toContain('Special offer');
    });

    it('should handle optional patient contact fields', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: PLTVDeclineDetectedPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        previousPLTV: 15000,
        newPLTV: 5000,
        declinePercentage: 66.67,
        riskFactors: ['Churn risk'],
        recommendedInterventions: ['Retention campaign'],
      };

      const event = createPLTVDeclineDetectedEvent(mockAggregateId, payload, metadata);

      expect(event.payload.patientName).toBeUndefined();
    });
  });

  describe('createPLTVGrowthOpportunityIdentifiedEvent', () => {
    it('should create a PLTVGrowthOpportunityIdentified event', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: PLTVGrowthOpportunityIdentifiedPayload = {
        leadId: 'lead-123',
        clinicId: 'clinic-456',
        currentPLTV: 15000,
        potentialPLTV: 45000,
        currentTier: 'SILVER',
        potentialTier: 'PLATINUM',
        growthOpportunityPercentage: 200,
        growthDrivers: ['Interest in All-on-X', 'Family referral potential'],
        recommendedActions: ['Premium consultation', 'Financing options'],
        patientName: 'Mike Johnson',
        phone: '+40723000000',
      };

      const event = createPLTVGrowthOpportunityIdentifiedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('pltv.growth_opportunity_identified');
      expect(event.payload.growthOpportunityPercentage).toBe(200);
      expect(event.payload.growthDrivers).toHaveLength(2);
    });
  });

  describe('createBatchPLTVScoringStartedEvent', () => {
    it('should create a BatchPLTVScoringStarted event', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: BatchPLTVScoringStartedPayload = {
        batchId: 'batch-001',
        clinicId: 'clinic-456',
        totalPatients: 500,
        startedAt: '2024-01-15T10:00:00.000Z',
      };

      const event = createBatchPLTVScoringStartedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('pltv.batch_scoring_started');
      expect(event.payload.totalPatients).toBe(500);
    });

    it('should handle optional clinicId', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: BatchPLTVScoringStartedPayload = {
        batchId: 'batch-002',
        totalPatients: 1000,
        startedAt: '2024-01-15T11:00:00.000Z',
      };

      const event = createBatchPLTVScoringStartedEvent(mockAggregateId, payload, metadata);

      expect(event.payload.clinicId).toBeUndefined();
    });
  });

  describe('createBatchPLTVScoringCompletedEvent', () => {
    it('should create a BatchPLTVScoringCompleted event', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const payload: BatchPLTVScoringCompletedPayload = {
        batchId: 'batch-001',
        clinicId: 'clinic-456',
        totalPatients: 500,
        scored: 485,
        highValueCount: 50,
        diamondCount: 5,
        platinumCount: 15,
        goldCount: 30,
        totalPredictedValue: 5000000,
        avgPredictedValue: 10309.28,
        errorCount: 15,
        durationMs: 120000,
      };

      const event = createBatchPLTVScoringCompletedEvent(mockAggregateId, payload, metadata);

      expect(event.type).toBe('pltv.batch_scoring_completed');
      expect(event.payload.scored).toBe(485);
      expect(event.payload.errorCount).toBe(15);
      expect(event.payload.durationMs).toBe(120000);
    });
  });

  // ==========================================================================
  // TYPE GUARD TESTS
  // ==========================================================================

  describe('Type Guards', () => {
    const baseMetadata: EventMetadata = {
      eventId: 'evt-001',
      timestamp: '2024-01-15T10:30:00.000Z',
      correlationId: 'corr-123',
      idempotencyKey: 'key-123',
      version: 1,
      source: 'pltv-scoring-service',
    };

    describe('isPLTVScoredEvent', () => {
      it('should return true for PLTVScored events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.scored',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            predictedLTV: 15000,
            tier: 'GOLD',
            growthPotential: 'HIGH',
            investmentPriority: 'HIGH',
            confidence: 0.85,
            method: 'ml',
            modelVersion: 'v2.1.0',
            reasoning: 'Test',
          },
        };

        expect(isPLTVScoredEvent(event)).toBe(true);
      });

      it('should return false for non-PLTVScored events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.tier_changed',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            previousPLTV: 10000,
            newPLTV: 20000,
            previousTier: 'SILVER',
            newTier: 'GOLD',
            changePercentage: 100,
            direction: 'upgrade',
            changeReason: 'Test',
          },
        };

        expect(isPLTVScoredEvent(event)).toBe(false);
      });
    });

    describe('isHighValuePatientIdentifiedEvent', () => {
      it('should return true for HighValuePatientIdentified events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.high_value_patient_identified',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            predictedLTV: 50000,
            tier: 'DIAMOND',
            growthPotential: 'HIGH',
            investmentPriority: 'CRITICAL',
            confidence: 0.95,
            recommendedActions: ['VIP'],
            followUpDeadline: '2024-01-16T10:00:00.000Z',
          },
        };

        expect(isHighValuePatientIdentifiedEvent(event)).toBe(true);
      });

      it('should return false for non-HighValuePatientIdentified events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.scored',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            predictedLTV: 15000,
            tier: 'GOLD',
            growthPotential: 'HIGH',
            investmentPriority: 'HIGH',
            confidence: 0.85,
            method: 'ml',
            modelVersion: 'v2.1.0',
            reasoning: 'Test',
          },
        };

        expect(isHighValuePatientIdentifiedEvent(event)).toBe(false);
      });
    });

    describe('isPLTVTierChangedEvent', () => {
      it('should return true for PLTVTierChanged events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.tier_changed',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            previousPLTV: 10000,
            newPLTV: 20000,
            previousTier: 'SILVER',
            newTier: 'GOLD',
            changePercentage: 100,
            direction: 'upgrade',
            changeReason: 'Test',
          },
        };

        expect(isPLTVTierChangedEvent(event)).toBe(true);
      });

      it('should return false for non-PLTVTierChanged events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.decline_detected',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            previousPLTV: 20000,
            newPLTV: 8000,
            declinePercentage: 60,
            riskFactors: [],
            recommendedInterventions: [],
          },
        };

        expect(isPLTVTierChangedEvent(event)).toBe(false);
      });
    });

    describe('isPLTVDeclineDetectedEvent', () => {
      it('should return true for PLTVDeclineDetected events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.decline_detected',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            previousPLTV: 20000,
            newPLTV: 8000,
            declinePercentage: 60,
            riskFactors: ['Risk'],
            recommendedInterventions: ['Action'],
          },
        };

        expect(isPLTVDeclineDetectedEvent(event)).toBe(true);
      });

      it('should return false for non-PLTVDeclineDetected events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.growth_opportunity_identified',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            currentPLTV: 15000,
            potentialPLTV: 45000,
            currentTier: 'SILVER',
            potentialTier: 'PLATINUM',
            growthOpportunityPercentage: 200,
            growthDrivers: [],
            recommendedActions: [],
          },
        };

        expect(isPLTVDeclineDetectedEvent(event)).toBe(false);
      });
    });

    describe('isPLTVGrowthOpportunityIdentifiedEvent', () => {
      it('should return true for PLTVGrowthOpportunityIdentified events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.growth_opportunity_identified',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            currentPLTV: 15000,
            potentialPLTV: 45000,
            currentTier: 'SILVER',
            potentialTier: 'PLATINUM',
            growthOpportunityPercentage: 200,
            growthDrivers: ['Driver'],
            recommendedActions: ['Action'],
          },
        };

        expect(isPLTVGrowthOpportunityIdentifiedEvent(event)).toBe(true);
      });

      it('should return false for non-PLTVGrowthOpportunityIdentified events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.batch_scoring_started',
          aggregateId: 'batch-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            batchId: 'batch-001',
            totalPatients: 100,
            startedAt: '2024-01-15T10:00:00.000Z',
          },
        };

        expect(isPLTVGrowthOpportunityIdentifiedEvent(event)).toBe(false);
      });
    });

    describe('isBatchPLTVScoringStartedEvent', () => {
      it('should return true for BatchPLTVScoringStarted events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.batch_scoring_started',
          aggregateId: 'batch-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            batchId: 'batch-001',
            totalPatients: 500,
            startedAt: '2024-01-15T10:00:00.000Z',
          },
        };

        expect(isBatchPLTVScoringStartedEvent(event)).toBe(true);
      });

      it('should return false for non-BatchPLTVScoringStarted events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.batch_scoring_completed',
          aggregateId: 'batch-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            batchId: 'batch-001',
            totalPatients: 500,
            scored: 485,
            highValueCount: 50,
            diamondCount: 5,
            platinumCount: 15,
            goldCount: 30,
            totalPredictedValue: 5000000,
            avgPredictedValue: 10309.28,
            errorCount: 15,
            durationMs: 120000,
          },
        };

        expect(isBatchPLTVScoringStartedEvent(event)).toBe(false);
      });
    });

    describe('isBatchPLTVScoringCompletedEvent', () => {
      it('should return true for BatchPLTVScoringCompleted events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.batch_scoring_completed',
          aggregateId: 'batch-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            batchId: 'batch-001',
            totalPatients: 500,
            scored: 485,
            highValueCount: 50,
            diamondCount: 5,
            platinumCount: 15,
            goldCount: 30,
            totalPredictedValue: 5000000,
            avgPredictedValue: 10309.28,
            errorCount: 15,
            durationMs: 120000,
          },
        };

        expect(isBatchPLTVScoringCompletedEvent(event)).toBe(true);
      });

      it('should return false for non-BatchPLTVScoringCompleted events', () => {
        const event: PLTVDomainEvent = {
          type: 'pltv.scored',
          aggregateId: 'lead-001',
          aggregateType: 'Lead',
          metadata: baseMetadata,
          payload: {
            leadId: 'lead-001',
            clinicId: 'clinic-001',
            predictedLTV: 15000,
            tier: 'GOLD',
            growthPotential: 'HIGH',
            investmentPriority: 'HIGH',
            confidence: 0.85,
            method: 'ml',
            modelVersion: 'v2.1.0',
            reasoning: 'Test',
          },
        };

        expect(isBatchPLTVScoringCompletedEvent(event)).toBe(false);
      });
    });
  });

  // ==========================================================================
  // ALL TIER TYPES TEST
  // ==========================================================================

  describe('PLTVTier values', () => {
    it('should support all tier values in payloads', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const tiers = ['DIAMOND', 'PLATINUM', 'GOLD', 'SILVER', 'BRONZE'] as const;

      for (const tier of tiers) {
        const payload: PLTVScoredPayload = {
          leadId: 'lead-123',
          clinicId: 'clinic-456',
          predictedLTV: 10000,
          tier,
          growthPotential: 'MEDIUM',
          investmentPriority: 'MEDIUM',
          confidence: 0.8,
          method: 'rule_based',
          modelVersion: 'v1.0.0',
          reasoning: `Tier: ${tier}`,
        };

        const event = createPLTVScoredEvent(mockAggregateId, payload, metadata);
        expect(event.payload.tier).toBe(tier);
      }
    });
  });

  describe('Scoring method values', () => {
    it('should support all method values', () => {
      const metadata = createPLTVEventMetadata(mockCorrelationId);
      const methods = ['ml', 'rule_based', 'hybrid'] as const;

      for (const method of methods) {
        const payload: PLTVScoredPayload = {
          leadId: 'lead-123',
          clinicId: 'clinic-456',
          predictedLTV: 10000,
          tier: 'GOLD',
          growthPotential: 'HIGH',
          investmentPriority: 'HIGH',
          confidence: 0.85,
          method,
          modelVersion: 'v2.0.0',
          reasoning: `Method: ${method}`,
        };

        const event = createPLTVScoredEvent(mockAggregateId, payload, metadata);
        expect(event.payload.method).toBe(method);
      }
    });
  });
});
