/**
 * @fileoverview Tests for OSAX Domain Events
 * Tests event factories, type guards, and event metadata creation
 */

import { describe, it, expect } from 'vitest';
import {
  createOsaxEventMetadata,
  createOsaxCaseCreatedEvent,
  createOsaxCaseScoredEvent,
  createOsaxCaseStatusChangedEvent,
  createOsaxTreatmentInitiatedEvent,
  createOsaxFollowUpScheduledEvent,
  isOsaxCaseCreatedEvent,
  isOsaxCaseScoredEvent,
  isOsaxCaseStatusChangedEvent,
  isOsaxTreatmentInitiatedEvent,
  isOsaxCaseReviewedEvent,
  isOsaxFollowUpCompletedEvent,
  isOsaxConsentEvent,
  isOsaxGdprEvent,
  type OsaxEventMetadata,
  type OsaxCaseCreatedPayload,
  type OsaxCaseScoredPayload,
  type OsaxCaseStatusChangedPayload,
  type OsaxTreatmentInitiatedPayload,
  type OsaxFollowUpScheduledPayload,
  type OsaxDomainEventUnion,
} from '../osax/events/osax-events.js';

describe('OSAX Domain Events', () => {
  describe('createOsaxEventMetadata', () => {
    it('should create event metadata with required fields', () => {
      const metadata = createOsaxEventMetadata('correlation-123', 'osax-service');

      expect(metadata.eventId).toBeDefined();
      expect(metadata.timestamp).toBeDefined();
      expect(metadata.correlationId).toBe('correlation-123');
      expect(metadata.idempotencyKey).toBeDefined();
      expect(metadata.version).toBe(1);
      expect(metadata.source).toBe('osax-service');
      expect(metadata.causationId).toBeUndefined();
      expect(metadata.actor).toBeUndefined();
      expect(metadata.tenantId).toBeUndefined();
    });

    it('should create metadata with all optional fields', () => {
      const metadata = createOsaxEventMetadata(
        'correlation-123',
        'osax-service',
        'causation-456',
        'user-789',
        'tenant-abc'
      );

      expect(metadata.causationId).toBe('causation-456');
      expect(metadata.actor).toBe('user-789');
      expect(metadata.tenantId).toBe('tenant-abc');
    });

    it('should generate unique event IDs', () => {
      const metadata1 = createOsaxEventMetadata('correlation-123', 'osax-service');
      const metadata2 = createOsaxEventMetadata('correlation-123', 'osax-service');

      expect(metadata1.eventId).not.toBe(metadata2.eventId);
    });

    it('should generate consistent idempotency keys with correlation ID', () => {
      const metadata1 = createOsaxEventMetadata('correlation-123', 'osax-service');
      const metadata2 = createOsaxEventMetadata('correlation-456', 'osax-service');

      // Idempotency keys should be different for different correlation IDs
      expect(metadata1.idempotencyKey).not.toBe(metadata2.idempotencyKey);
      // Both should contain source and correlation ID
      expect(metadata1.idempotencyKey).toContain('osax-service');
      expect(metadata1.idempotencyKey).toContain('correlation-123');
    });

    it('should create ISO 8601 timestamps', () => {
      const metadata = createOsaxEventMetadata('correlation-123', 'osax-service');

      expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(() => new Date(metadata.timestamp)).not.toThrow();
    });
  });

  describe('Event Factory Functions', () => {
    const metadata = createOsaxEventMetadata('correlation-123', 'test-service');

    describe('createOsaxCaseCreatedEvent', () => {
      it('should create case created event', () => {
        const payload: OsaxCaseCreatedPayload = {
          caseNumber: 'OSA-2025-00001',
          subjectId: 'osax_2025_001',
          patientId: 'patient-123',
          priority: 'NORMAL',
          consentStatus: 'PENDING',
        };

        const event = createOsaxCaseCreatedEvent('case-123', payload, metadata);

        expect(event.type).toBe('osax.case.created');
        expect(event.aggregateId).toBe('case-123');
        expect(event.aggregateType).toBe('OsaxCase');
        expect(event.metadata).toBe(metadata);
        expect(event.payload).toBe(payload);
      });

      it('should create event with optional fields', () => {
        const payload: OsaxCaseCreatedPayload = {
          caseNumber: 'OSA-2025-00001',
          subjectId: 'osax_2025_001',
          patientId: 'patient-123',
          referringPhysicianId: 'doctor-456',
          assignedSpecialistId: 'specialist-789',
          priority: 'URGENT',
          consentStatus: 'OBTAINED',
        };

        const event = createOsaxCaseCreatedEvent('case-123', payload, metadata);

        expect(event.payload.referringPhysicianId).toBe('doctor-456');
        expect(event.payload.assignedSpecialistId).toBe('specialist-789');
        expect(event.payload.priority).toBe('URGENT');
      });
    });

    describe('createOsaxCaseScoredEvent', () => {
      it('should create case scored event', () => {
        const payload: OsaxCaseScoredPayload = {
          caseNumber: 'OSA-2025-00001',
          severity: 'MODERATE',
          indicators: {
            ahi: 20,
            odi: 18,
            spo2Nadir: 82,
            essScore: 12,
          },
          compositeScore: 65.5,
          confidence: 0.92,
          scoringMethod: 'SYSTEM',
          treatmentRecommendation: 'CPAP_THERAPY',
          cardiovascularRisk: 'MODERATE',
          riskFlags: ['high_ahi', 'moderate_desaturation'],
        };

        const event = createOsaxCaseScoredEvent('case-123', payload, metadata);

        expect(event.type).toBe('osax.case.scored');
        expect(event.payload.severity).toBe('MODERATE');
        expect(event.payload.compositeScore).toBe(65.5);
        expect(event.payload.confidence).toBe(0.92);
      });

      it('should create event with rescoring data', () => {
        const payload: OsaxCaseScoredPayload = {
          caseNumber: 'OSA-2025-00001',
          severity: 'MILD',
          indicators: { ahi: 8, odi: 7, spo2Nadir: 88, essScore: 6 },
          compositeScore: 45.0,
          confidence: 0.88,
          scoringMethod: 'PHYSICIAN',
          treatmentRecommendation: 'LIFESTYLE_MODIFICATION',
          cardiovascularRisk: 'LOW',
          riskFlags: [],
          previousSeverity: 'MODERATE',
          previousCompositeScore: 65.5,
        };

        const event = createOsaxCaseScoredEvent('case-123', payload, metadata);

        expect(event.payload.previousSeverity).toBe('MODERATE');
        expect(event.payload.previousCompositeScore).toBe(65.5);
      });
    });

    describe('createOsaxCaseStatusChangedEvent', () => {
      it('should create status changed event', () => {
        const payload: OsaxCaseStatusChangedPayload = {
          caseNumber: 'OSA-2025-00001',
          previousStatus: 'PENDING_STUDY',
          newStatus: 'STUDY_COMPLETED',
          reason: 'PSG study completed successfully',
          changedBy: 'tech-user-123',
        };

        const event = createOsaxCaseStatusChangedEvent('case-123', payload, metadata);

        expect(event.type).toBe('osax.case.status_changed');
        expect(event.payload.previousStatus).toBe('PENDING_STUDY');
        expect(event.payload.newStatus).toBe('STUDY_COMPLETED');
      });
    });

    describe('createOsaxTreatmentInitiatedEvent', () => {
      it('should create treatment initiated event', () => {
        const payload: OsaxTreatmentInitiatedPayload = {
          caseNumber: 'OSA-2025-00001',
          treatmentType: 'CPAP_THERAPY',
          startDate: '2025-01-15T10:00:00Z',
          prescribingPhysicianId: 'doctor-456',
        };

        const event = createOsaxTreatmentInitiatedEvent('case-123', payload, metadata);

        expect(event.type).toBe('osax.treatment.initiated');
        expect(event.payload.treatmentType).toBe('CPAP_THERAPY');
      });

      it('should create event with device info', () => {
        const payload: OsaxTreatmentInitiatedPayload = {
          caseNumber: 'OSA-2025-00001',
          treatmentType: 'CPAP_THERAPY',
          startDate: '2025-01-15T10:00:00Z',
          deviceInfo: {
            manufacturer: 'ResMed',
            model: 'AirSense 11',
          },
          prescribingPhysicianId: 'doctor-456',
        };

        const event = createOsaxTreatmentInitiatedEvent('case-123', payload, metadata);

        expect(event.payload.deviceInfo?.manufacturer).toBe('ResMed');
        expect(event.payload.deviceInfo?.model).toBe('AirSense 11');
      });
    });

    describe('createOsaxFollowUpScheduledEvent', () => {
      it('should create follow-up scheduled event', () => {
        const payload: OsaxFollowUpScheduledPayload = {
          caseNumber: 'OSA-2025-00001',
          followUpId: 'followup-123',
          scheduledDate: '2025-02-15T14:00:00Z',
          followUpType: 'IN_PERSON',
          scheduledBy: 'scheduler-user',
        };

        const event = createOsaxFollowUpScheduledEvent('case-123', payload, metadata);

        expect(event.type).toBe('osax.followup.scheduled');
        expect(event.payload.followUpType).toBe('IN_PERSON');
      });
    });
  });

  describe('Type Guards', () => {
    const metadata = createOsaxEventMetadata('correlation-123', 'test-service');

    describe('isOsaxCaseCreatedEvent', () => {
      it('should return true for case created event', () => {
        const payload: OsaxCaseCreatedPayload = {
          caseNumber: 'OSA-2025-00001',
          subjectId: 'osax_2025_001',
          patientId: 'patient-123',
          priority: 'NORMAL',
          consentStatus: 'PENDING',
        };
        const event = createOsaxCaseCreatedEvent('case-123', payload, metadata);

        expect(isOsaxCaseCreatedEvent(event)).toBe(true);
      });

      it('should return false for other event types', () => {
        const payload: OsaxCaseScoredPayload = {
          caseNumber: 'OSA-2025-00001',
          severity: 'MODERATE',
          indicators: { ahi: 20, odi: 18, spo2Nadir: 82, essScore: 12 },
          compositeScore: 65.5,
          confidence: 0.92,
          scoringMethod: 'SYSTEM',
          treatmentRecommendation: 'CPAP_THERAPY',
          cardiovascularRisk: 'MODERATE',
          riskFlags: [],
        };
        const event = createOsaxCaseScoredEvent('case-123', payload, metadata);

        expect(isOsaxCaseCreatedEvent(event)).toBe(false);
      });
    });

    describe('isOsaxCaseScoredEvent', () => {
      it('should return true for case scored event', () => {
        const payload: OsaxCaseScoredPayload = {
          caseNumber: 'OSA-2025-00001',
          severity: 'MODERATE',
          indicators: { ahi: 20, odi: 18, spo2Nadir: 82, essScore: 12 },
          compositeScore: 65.5,
          confidence: 0.92,
          scoringMethod: 'SYSTEM',
          treatmentRecommendation: 'CPAP_THERAPY',
          cardiovascularRisk: 'MODERATE',
          riskFlags: [],
        };
        const event = createOsaxCaseScoredEvent('case-123', payload, metadata);

        expect(isOsaxCaseScoredEvent(event)).toBe(true);
      });
    });

    describe('isOsaxCaseStatusChangedEvent', () => {
      it('should return true for status changed event', () => {
        const payload: OsaxCaseStatusChangedPayload = {
          caseNumber: 'OSA-2025-00001',
          previousStatus: 'PENDING_STUDY',
          newStatus: 'STUDY_COMPLETED',
          changedBy: 'user-123',
        };
        const event = createOsaxCaseStatusChangedEvent('case-123', payload, metadata);

        expect(isOsaxCaseStatusChangedEvent(event)).toBe(true);
      });
    });

    describe('isOsaxTreatmentInitiatedEvent', () => {
      it('should return true for treatment initiated event', () => {
        const payload: OsaxTreatmentInitiatedPayload = {
          caseNumber: 'OSA-2025-00001',
          treatmentType: 'CPAP_THERAPY',
          startDate: '2025-01-15T10:00:00Z',
          prescribingPhysicianId: 'doctor-456',
        };
        const event = createOsaxTreatmentInitiatedEvent('case-123', payload, metadata);

        expect(isOsaxTreatmentInitiatedEvent(event)).toBe(true);
      });
    });

    describe('isOsaxConsentEvent', () => {
      it('should return true for consent obtained event', () => {
        const event: OsaxDomainEventUnion = {
          type: 'osax.consent.obtained',
          aggregateId: 'case-123',
          aggregateType: 'OsaxCase',
          metadata,
          payload: {
            caseNumber: 'OSA-2025-00001',
            consentType: 'TREATMENT',
            consentDate: '2025-01-15T10:00:00Z',
            consentMethod: 'WRITTEN',
            consentVersion: '1.0',
          },
        };

        expect(isOsaxConsentEvent(event)).toBe(true);
      });

      it('should return true for consent withdrawn event', () => {
        const event: OsaxDomainEventUnion = {
          type: 'osax.consent.withdrawn',
          aggregateId: 'case-123',
          aggregateType: 'OsaxCase',
          metadata,
          payload: {
            caseNumber: 'OSA-2025-00001',
            consentType: 'TREATMENT',
            withdrawalDate: '2025-01-15T10:00:00Z',
            dataRetentionRequired: true,
          },
        };

        expect(isOsaxConsentEvent(event)).toBe(true);
      });

      it('should return false for non-consent events', () => {
        const payload: OsaxCaseCreatedPayload = {
          caseNumber: 'OSA-2025-00001',
          subjectId: 'osax_2025_001',
          patientId: 'patient-123',
          priority: 'NORMAL',
          consentStatus: 'PENDING',
        };
        const event = createOsaxCaseCreatedEvent('case-123', payload, metadata);

        expect(isOsaxConsentEvent(event)).toBe(false);
      });
    });

    describe('isOsaxGdprEvent', () => {
      it('should return true for data exported event', () => {
        const event: OsaxDomainEventUnion = {
          type: 'osax.data.exported',
          aggregateId: 'case-123',
          aggregateType: 'OsaxCase',
          metadata,
          payload: {
            caseNumber: 'OSA-2025-00001',
            exportFormat: 'JSON',
            exportDate: '2025-01-15T10:00:00Z',
            requestedBy: 'patient-123',
            exportReference: 'export-ref-123',
          },
        };

        expect(isOsaxGdprEvent(event)).toBe(true);
      });

      it('should return true for data deleted event', () => {
        const event: OsaxDomainEventUnion = {
          type: 'osax.data.deleted',
          aggregateId: 'case-123',
          aggregateType: 'OsaxCase',
          metadata,
          payload: {
            caseNumber: 'OSA-2025-00001',
            deletionType: 'SOFT',
            deletionDate: '2025-01-15T10:00:00Z',
            deletionReason: 'GDPR_REQUEST',
            requestedBy: 'patient-123',
            auditReference: 'audit-ref-123',
          },
        };

        expect(isOsaxGdprEvent(event)).toBe(true);
      });

      it('should return false for non-GDPR events', () => {
        const payload: OsaxCaseCreatedPayload = {
          caseNumber: 'OSA-2025-00001',
          subjectId: 'osax_2025_001',
          patientId: 'patient-123',
          priority: 'NORMAL',
          consentStatus: 'PENDING',
        };
        const event = createOsaxCaseCreatedEvent('case-123', payload, metadata);

        expect(isOsaxGdprEvent(event)).toBe(false);
      });
    });
  });
});
