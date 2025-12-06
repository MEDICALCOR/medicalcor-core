import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createAllOnXEventMetadata,
  createAllOnXCaseCreatedEvent,
  createAllOnXCaseScoredEvent,
  createAllOnXCaseStatusChangedEvent,
  createAllOnXSurgeryScheduledEvent,
  createAllOnXImplantPlacedEvent,
  createAllOnXFollowUpScheduledEvent,
  createAllOnXComplicationReportedEvent,
  isAllOnXCaseCreatedEvent,
  isAllOnXCaseScoredEvent,
  isAllOnXCaseStatusChangedEvent,
  isAllOnXSurgeryEvent,
  isAllOnXComplicationEvent,
  isAllOnXConsentEvent,
  isAllOnXFollowUpEvent,
  type AllOnXDomainEventUnion,
  type AllOnXCaseCreatedPayload,
  type AllOnXCaseScoredPayload,
  type AllOnXCaseStatusChangedPayload,
  type AllOnXSurgeryScheduledPayload,
  type AllOnXImplantPlacedPayload,
  type AllOnXFollowUpScheduledPayload,
  type AllOnXComplicationReportedPayload,
} from '../allonx/events/allonx-events.js';

describe('AllOnX Events', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('createAllOnXEventMetadata', () => {
    it('should create metadata with required fields', () => {
      const metadata = createAllOnXEventMetadata('system');

      expect(metadata.triggeredBy).toBe('system');
      expect(metadata.version).toBe('1.0.0');
      expect(metadata.source).toBe('allonx-domain');
      expect(metadata.timestamp).toEqual(new Date('2024-06-15T10:00:00.000Z'));
    });

    it('should generate unique event ID', () => {
      const metadata1 = createAllOnXEventMetadata('user1');
      vi.advanceTimersByTime(1);
      const metadata2 = createAllOnXEventMetadata('user2');

      expect(metadata1.eventId).toMatch(/^evt_/);
      expect(metadata2.eventId).toMatch(/^evt_/);
      expect(metadata1.eventId).not.toBe(metadata2.eventId);
    });

    it('should use provided correlation ID', () => {
      const metadata = createAllOnXEventMetadata('system', 'custom-corr-123');
      expect(metadata.correlationId).toBe('custom-corr-123');
    });

    it('should generate correlation ID if not provided', () => {
      const metadata = createAllOnXEventMetadata('system');
      expect(metadata.correlationId).toMatch(/^cor_/);
    });

    it('should create frozen metadata object', () => {
      const metadata = createAllOnXEventMetadata('system');
      expect(Object.isFrozen(metadata)).toBe(true);
    });
  });

  describe('Case Lifecycle Events', () => {
    describe('createAllOnXCaseCreatedEvent', () => {
      it('should create case created event', () => {
        const payload: AllOnXCaseCreatedPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          patientId: 'patient-456',
          targetArch: 'MAXILLA',
          priority: 'HIGH',
          assignedClinicianId: 'dr-789',
        };

        const event = createAllOnXCaseCreatedEvent(payload, 'admin', 'corr-001');

        expect(event.type).toBe('ALLONX_CASE_CREATED');
        expect(event.payload).toEqual(payload);
        expect(event.metadata.triggeredBy).toBe('admin');
        expect(event.metadata.correlationId).toBe('corr-001');
      });

      it('should handle null assignedClinicianId', () => {
        const payload: AllOnXCaseCreatedPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-002',
          patientId: 'patient-456',
          targetArch: null,
          priority: 'NORMAL',
          assignedClinicianId: null,
        };

        const event = createAllOnXCaseCreatedEvent(payload, 'system');

        expect(event.payload.assignedClinicianId).toBeNull();
        expect(event.payload.targetArch).toBeNull();
      });
    });

    describe('createAllOnXCaseStatusChangedEvent', () => {
      it('should create status changed event', () => {
        const payload: AllOnXCaseStatusChangedPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          previousStatus: 'INTAKE',
          newStatus: 'ASSESSMENT',
          reason: 'Initial assessment completed',
        };

        const event = createAllOnXCaseStatusChangedEvent(payload, 'dr-123');

        expect(event.type).toBe('ALLONX_CASE_STATUS_CHANGED');
        expect(event.payload.previousStatus).toBe('INTAKE');
        expect(event.payload.newStatus).toBe('ASSESSMENT');
      });

      it('should handle status change without reason', () => {
        const payload: AllOnXCaseStatusChangedPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          previousStatus: 'ASSESSMENT',
          newStatus: 'TREATMENT_PLANNING',
        };

        const event = createAllOnXCaseStatusChangedEvent(payload, 'system');

        expect(event.payload.reason).toBeUndefined();
      });
    });
  });

  describe('Clinical Assessment Events', () => {
    describe('createAllOnXCaseScoredEvent', () => {
      it('should create case scored event', () => {
        const payload: AllOnXCaseScoredPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          patientId: 'patient-456',
          compositeScore: 85,
          eligibility: 'ELIGIBLE',
          riskLevel: 'LOW',
          complexity: 'MODERATE',
          treatmentRecommendation: 'PROCEED',
          recommendedProcedure: 'ALL_ON_4',
          confidence: 0.92,
          riskFlags: ['mild bone loss'],
          contraindications: [],
        };

        const event = createAllOnXCaseScoredEvent(payload, 'ai-scoring', 'corr-score-001');

        expect(event.type).toBe('ALLONX_CASE_SCORED');
        expect(event.payload.compositeScore).toBe(85);
        expect(event.payload.eligibility).toBe('ELIGIBLE');
        expect(event.payload.confidence).toBe(0.92);
      });

      it('should handle high-risk scoring', () => {
        const payload: AllOnXCaseScoredPayload = {
          caseId: 'case-789',
          caseNumber: 'AX-2024-003',
          patientId: 'patient-999',
          compositeScore: 45,
          eligibility: 'CONDITIONAL',
          riskLevel: 'HIGH',
          complexity: 'COMPLEX',
          treatmentRecommendation: 'DEFER',
          recommendedProcedure: 'ALL_ON_6',
          confidence: 0.78,
          riskFlags: ['uncontrolled diabetes', 'heavy smoker', 'severe bone loss'],
          contraindications: ['active infection'],
        };

        const event = createAllOnXCaseScoredEvent(payload, 'ai-scoring');

        expect(event.payload.riskFlags).toHaveLength(3);
        expect(event.payload.contraindications).toContain('active infection');
      });
    });
  });

  describe('Surgical Events', () => {
    describe('createAllOnXSurgeryScheduledEvent', () => {
      it('should create surgery scheduled event', () => {
        const payload: AllOnXSurgeryScheduledPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          patientId: 'patient-456',
          scheduledFor: new Date('2024-07-15T09:00:00.000Z'),
          procedure: 'ALL_ON_4',
          surgeonId: 'dr-surgeon-001',
          estimatedDuration: 180,
        };

        const event = createAllOnXSurgeryScheduledEvent(payload, 'scheduler');

        expect(event.type).toBe('ALLONX_SURGERY_SCHEDULED');
        expect(event.payload.estimatedDuration).toBe(180);
        expect(event.payload.procedure).toBe('ALL_ON_4');
      });
    });

    describe('createAllOnXImplantPlacedEvent', () => {
      it('should create implant placed event', () => {
        const payload: AllOnXImplantPlacedPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          implantId: 'impl-001',
          position: 'UR4',
          brand: 'Nobel Biocare',
          model: 'NobelActive',
          diameter: 4.3,
          length: 13,
          insertionTorque: 45,
          primaryStability: 'HIGH',
        };

        const event = createAllOnXImplantPlacedEvent(payload, 'dr-surgeon-001');

        expect(event.type).toBe('ALLONX_IMPLANT_PLACED');
        expect(event.payload.position).toBe('UR4');
        expect(event.payload.primaryStability).toBe('HIGH');
      });

      it('should handle different stability levels', () => {
        const basePayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          implantId: 'impl-002',
          position: 'UL4',
          brand: 'Straumann',
          model: 'BLX',
          diameter: 4.0,
          length: 10,
          insertionTorque: 25,
        };

        const lowStability = createAllOnXImplantPlacedEvent(
          { ...basePayload, primaryStability: 'LOW' },
          'surgeon'
        );

        expect(lowStability.payload.primaryStability).toBe('LOW');
      });
    });
  });

  describe('Follow-Up Events', () => {
    describe('createAllOnXFollowUpScheduledEvent', () => {
      it('should create follow-up scheduled event', () => {
        const payload: AllOnXFollowUpScheduledPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          followUpId: 'fu-001',
          scheduledFor: new Date('2024-08-15T10:00:00.000Z'),
          type: 'HEALING_CHECK',
        };

        const event = createAllOnXFollowUpScheduledEvent(payload, 'scheduler');

        expect(event.type).toBe('ALLONX_FOLLOW_UP_SCHEDULED');
        expect(event.payload.type).toBe('HEALING_CHECK');
      });

      it('should handle different follow-up types', () => {
        const types: Array<'ROUTINE' | 'HEALING_CHECK' | 'PROSTHETIC' | 'EMERGENCY'> = [
          'ROUTINE',
          'HEALING_CHECK',
          'PROSTHETIC',
          'EMERGENCY',
        ];

        types.forEach((followUpType) => {
          const payload: AllOnXFollowUpScheduledPayload = {
            caseId: 'case-123',
            caseNumber: 'AX-2024-001',
            followUpId: `fu-${followUpType}`,
            scheduledFor: new Date(),
            type: followUpType,
          };

          const event = createAllOnXFollowUpScheduledEvent(payload, 'system');
          expect(event.payload.type).toBe(followUpType);
        });
      });
    });
  });

  describe('Complication Events', () => {
    describe('createAllOnXComplicationReportedEvent', () => {
      it('should create complication reported event', () => {
        const payload: AllOnXComplicationReportedPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          patientId: 'patient-456',
          complicationType: 'INFECTION',
          severity: 'MODERATE',
          description: 'Post-operative infection detected at implant site',
          implantId: 'impl-001',
          reportedAt: new Date('2024-07-20T14:00:00.000Z'),
        };

        const event = createAllOnXComplicationReportedEvent(payload, 'dr-123');

        expect(event.type).toBe('ALLONX_COMPLICATION_REPORTED');
        expect(event.payload.complicationType).toBe('INFECTION');
        expect(event.payload.severity).toBe('MODERATE');
      });

      it('should handle complication without implantId', () => {
        const payload: AllOnXComplicationReportedPayload = {
          caseId: 'case-123',
          caseNumber: 'AX-2024-001',
          patientId: 'patient-456',
          complicationType: 'SOFT_TISSUE',
          severity: 'MINOR',
          description: 'Minor soft tissue irritation',
          reportedAt: new Date(),
        };

        const event = createAllOnXComplicationReportedEvent(payload, 'dr-123');

        expect(event.payload.implantId).toBeUndefined();
      });

      it('should handle all complication types', () => {
        const types: Array<
          | 'IMPLANT_FAILURE'
          | 'INFECTION'
          | 'NERVE_DAMAGE'
          | 'PROSTHETIC_FRACTURE'
          | 'SOFT_TISSUE'
          | 'OTHER'
        > = [
          'IMPLANT_FAILURE',
          'INFECTION',
          'NERVE_DAMAGE',
          'PROSTHETIC_FRACTURE',
          'SOFT_TISSUE',
          'OTHER',
        ];

        types.forEach((type) => {
          const payload: AllOnXComplicationReportedPayload = {
            caseId: 'case-123',
            caseNumber: 'AX-2024-001',
            patientId: 'patient-456',
            complicationType: type,
            severity: 'MINOR',
            description: `Test ${type}`,
            reportedAt: new Date(),
          };

          const event = createAllOnXComplicationReportedEvent(payload, 'system');
          expect(event.payload.complicationType).toBe(type);
        });
      });
    });
  });

  describe('Type Guards', () => {
    const createMockEvent = (type: string): AllOnXDomainEventUnion => ({
      type: type as AllOnXDomainEventUnion['type'],
      metadata: createAllOnXEventMetadata('test'),
      payload: {} as AllOnXDomainEventUnion['payload'],
    });

    describe('isAllOnXCaseCreatedEvent', () => {
      it('should return true for case created events', () => {
        const event = createMockEvent('ALLONX_CASE_CREATED');
        expect(isAllOnXCaseCreatedEvent(event)).toBe(true);
      });

      it('should return false for other events', () => {
        const event = createMockEvent('ALLONX_CASE_SCORED');
        expect(isAllOnXCaseCreatedEvent(event)).toBe(false);
      });
    });

    describe('isAllOnXCaseScoredEvent', () => {
      it('should return true for case scored events', () => {
        const event = createMockEvent('ALLONX_CASE_SCORED');
        expect(isAllOnXCaseScoredEvent(event)).toBe(true);
      });

      it('should return false for other events', () => {
        const event = createMockEvent('ALLONX_CASE_CREATED');
        expect(isAllOnXCaseScoredEvent(event)).toBe(false);
      });
    });

    describe('isAllOnXCaseStatusChangedEvent', () => {
      it('should return true for status changed events', () => {
        const event = createMockEvent('ALLONX_CASE_STATUS_CHANGED');
        expect(isAllOnXCaseStatusChangedEvent(event)).toBe(true);
      });

      it('should return false for other events', () => {
        const event = createMockEvent('ALLONX_CASE_CREATED');
        expect(isAllOnXCaseStatusChangedEvent(event)).toBe(false);
      });
    });

    describe('isAllOnXSurgeryEvent', () => {
      it('should return true for surgery scheduled', () => {
        const event = createMockEvent('ALLONX_SURGERY_SCHEDULED');
        expect(isAllOnXSurgeryEvent(event)).toBe(true);
      });

      it('should return true for implant placed', () => {
        const event = createMockEvent('ALLONX_IMPLANT_PLACED');
        expect(isAllOnXSurgeryEvent(event)).toBe(true);
      });

      it('should return true for surgery completed', () => {
        const event = createMockEvent('ALLONX_SURGERY_COMPLETED');
        expect(isAllOnXSurgeryEvent(event)).toBe(true);
      });

      it('should return false for non-surgery events', () => {
        const event = createMockEvent('ALLONX_CASE_CREATED');
        expect(isAllOnXSurgeryEvent(event)).toBe(false);
      });
    });

    describe('isAllOnXComplicationEvent', () => {
      it('should return true for complication reported', () => {
        const event = createMockEvent('ALLONX_COMPLICATION_REPORTED');
        expect(isAllOnXComplicationEvent(event)).toBe(true);
      });

      it('should return true for complication resolved', () => {
        const event = createMockEvent('ALLONX_COMPLICATION_RESOLVED');
        expect(isAllOnXComplicationEvent(event)).toBe(true);
      });

      it('should return false for non-complication events', () => {
        const event = createMockEvent('ALLONX_SURGERY_COMPLETED');
        expect(isAllOnXComplicationEvent(event)).toBe(false);
      });
    });

    describe('isAllOnXConsentEvent', () => {
      it('should return true for consent obtained', () => {
        const event = createMockEvent('ALLONX_CONSENT_OBTAINED');
        expect(isAllOnXConsentEvent(event)).toBe(true);
      });

      it('should return true for consent withdrawn', () => {
        const event = createMockEvent('ALLONX_CONSENT_WITHDRAWN');
        expect(isAllOnXConsentEvent(event)).toBe(true);
      });

      it('should return false for non-consent events', () => {
        const event = createMockEvent('ALLONX_CASE_CREATED');
        expect(isAllOnXConsentEvent(event)).toBe(false);
      });
    });

    describe('isAllOnXFollowUpEvent', () => {
      it('should return true for follow-up scheduled', () => {
        const event = createMockEvent('ALLONX_FOLLOW_UP_SCHEDULED');
        expect(isAllOnXFollowUpEvent(event)).toBe(true);
      });

      it('should return true for follow-up completed', () => {
        const event = createMockEvent('ALLONX_FOLLOW_UP_COMPLETED');
        expect(isAllOnXFollowUpEvent(event)).toBe(true);
      });

      it('should return true for follow-up missed', () => {
        const event = createMockEvent('ALLONX_FOLLOW_UP_MISSED');
        expect(isAllOnXFollowUpEvent(event)).toBe(true);
      });

      it('should return false for non-follow-up events', () => {
        const event = createMockEvent('ALLONX_CASE_CREATED');
        expect(isAllOnXFollowUpEvent(event)).toBe(false);
      });
    });
  });

  describe('Event Immutability', () => {
    it('should create immutable metadata', () => {
      const metadata = createAllOnXEventMetadata('system');

      expect(() => {
        (metadata as { eventId: string }).eventId = 'new-id';
      }).toThrow();
    });
  });

  describe('Event Serialization', () => {
    it('should serialize event to JSON', () => {
      const payload: AllOnXCaseCreatedPayload = {
        caseId: 'case-123',
        caseNumber: 'AX-2024-001',
        patientId: 'patient-456',
        targetArch: 'BOTH',
        priority: 'URGENT',
        assignedClinicianId: 'dr-789',
      };

      const event = createAllOnXCaseCreatedEvent(payload, 'admin');
      const json = JSON.stringify(event);
      const parsed = JSON.parse(json);

      expect(parsed.type).toBe('ALLONX_CASE_CREATED');
      expect(parsed.payload.caseId).toBe('case-123');
      expect(parsed.metadata.source).toBe('allonx-domain');
    });
  });
});
