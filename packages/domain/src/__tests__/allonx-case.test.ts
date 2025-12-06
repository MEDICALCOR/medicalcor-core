import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createAllOnXCase,
  generateCaseNumber,
  isValidStatusTransition,
  getAllowedNextStatuses,
  requiresImmediateAttention,
  isActiveCase,
  isReadyForSurgery,
  needsAssessment,
  requiresBoneAugmentation,
  calculateCaseProgress,
  getCaseSummary,
  getDaysSinceCreation,
  isOverdueForFollowUp,
  getNextFollowUp,
  getImplantCount,
  getExpectedImplantCount,
  areAllImplantsPlaced,
  getEligibilitySummary,
  type AllOnXCase,
  type AllOnXCaseStatus,
} from '../allonx/entities/AllOnXCase.js';

describe('AllOnXCase Entity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-06-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateCaseNumber', () => {
    it('should generate case number with default prefix', () => {
      const caseNumber = generateCaseNumber();
      expect(caseNumber).toMatch(/^AOX-[A-Z0-9]+-[A-Z0-9]+$/);
    });

    it('should generate case number with custom prefix', () => {
      const caseNumber = generateCaseNumber('CUSTOM');
      expect(caseNumber).toMatch(/^CUSTOM-[A-Z0-9]+-[A-Z0-9]+$/);
    });

    it('should generate unique case numbers', () => {
      const numbers = new Set<string>();
      for (let i = 0; i < 100; i++) {
        numbers.add(generateCaseNumber());
      }
      expect(numbers.size).toBe(100);
    });
  });

  describe('createAllOnXCase', () => {
    it('should create case with required fields', () => {
      const caseEntity = createAllOnXCase({ patientId: 'patient-123' });

      expect(caseEntity.id).toBeDefined();
      expect(caseEntity.caseNumber).toBeDefined();
      expect(caseEntity.patientId).toBe('patient-123');
      expect(caseEntity.status).toBe('INTAKE');
      expect(caseEntity.priority).toBe('MEDIUM');
    });

    it('should create case with optional fields', () => {
      const caseEntity = createAllOnXCase({
        patientId: 'patient-123',
        assignedClinicianId: 'doc-456',
        targetArch: 'MAXILLA',
        priority: 'HIGH',
        clinicalNotes: 'Initial notes',
      });

      expect(caseEntity.assignedClinicianId).toBe('doc-456');
      expect(caseEntity.targetArch).toBe('MAXILLA');
      expect(caseEntity.priority).toBe('HIGH');
      expect(caseEntity.clinicalNotes).toBe('Initial notes');
    });

    it('should initialize with empty arrays', () => {
      const caseEntity = createAllOnXCase({ patientId: 'patient-123' });

      expect(caseEntity.imagingRecords).toEqual([]);
      expect(caseEntity.treatmentPhases).toEqual([]);
      expect(caseEntity.consultations).toEqual([]);
      expect(caseEntity.implants).toEqual([]);
      expect(caseEntity.followUps).toEqual([]);
      expect(caseEntity.physicianReviews).toEqual([]);
    });

    it('should initialize consent as not obtained', () => {
      const caseEntity = createAllOnXCase({ patientId: 'patient-123' });

      expect(caseEntity.consentObtained).toBe(false);
      expect(caseEntity.consentObtainedAt).toBeNull();
    });

    it('should freeze the returned object', () => {
      const caseEntity = createAllOnXCase({ patientId: 'patient-123' });

      expect(Object.isFrozen(caseEntity)).toBe(true);
    });
  });

  describe('Status Transitions', () => {
    describe('isValidStatusTransition', () => {
      it('should allow valid transitions from INTAKE', () => {
        expect(isValidStatusTransition('INTAKE', 'ASSESSMENT')).toBe(true);
        expect(isValidStatusTransition('INTAKE', 'CANCELLED')).toBe(true);
      });

      it('should disallow invalid transitions from INTAKE', () => {
        expect(isValidStatusTransition('INTAKE', 'PLANNING')).toBe(false);
        expect(isValidStatusTransition('INTAKE', 'SURGICAL_PHASE')).toBe(false);
      });

      it('should allow valid transitions from ASSESSMENT', () => {
        expect(isValidStatusTransition('ASSESSMENT', 'PLANNING')).toBe(true);
        expect(isValidStatusTransition('ASSESSMENT', 'INTAKE')).toBe(true);
        expect(isValidStatusTransition('ASSESSMENT', 'ON_HOLD')).toBe(true);
        expect(isValidStatusTransition('ASSESSMENT', 'CANCELLED')).toBe(true);
      });

      it('should not allow transitions from CANCELLED', () => {
        expect(isValidStatusTransition('CANCELLED', 'INTAKE')).toBe(false);
        expect(isValidStatusTransition('CANCELLED', 'ASSESSMENT')).toBe(false);
      });

      it('should allow ON_HOLD to resume to any active status', () => {
        expect(isValidStatusTransition('ON_HOLD', 'INTAKE')).toBe(true);
        expect(isValidStatusTransition('ON_HOLD', 'ASSESSMENT')).toBe(true);
        expect(isValidStatusTransition('ON_HOLD', 'PLANNING')).toBe(true);
        expect(isValidStatusTransition('ON_HOLD', 'SURGICAL_PHASE')).toBe(true);
      });
    });

    describe('getAllowedNextStatuses', () => {
      it('should return allowed statuses for INTAKE', () => {
        const allowed = getAllowedNextStatuses('INTAKE');
        expect(allowed).toContain('ASSESSMENT');
        expect(allowed).toContain('CANCELLED');
      });

      it('should return empty array for CANCELLED', () => {
        const allowed = getAllowedNextStatuses('CANCELLED');
        expect(allowed).toEqual([]);
      });
    });
  });

  describe('Query Helpers', () => {
    describe('requiresImmediateAttention', () => {
      it('should return true for URGENT priority', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          priority: 'URGENT',
        } as AllOnXCase;

        expect(requiresImmediateAttention(caseEntity)).toBe(true);
      });

      it('should return true for CRITICAL risk level', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          clinicalScore: { riskLevel: 'CRITICAL' },
        } as AllOnXCase;

        expect(requiresImmediateAttention(caseEntity)).toBe(true);
      });

      it('should return true for surgery within 7 days', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          surgeryScheduledFor: new Date('2024-06-20T10:00:00.000Z'),
        } as AllOnXCase;

        expect(requiresImmediateAttention(caseEntity)).toBe(true);
      });

      it('should return false for surgery more than 7 days away', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          surgeryScheduledFor: new Date('2024-06-30T10:00:00.000Z'),
        } as AllOnXCase;

        expect(requiresImmediateAttention(caseEntity)).toBe(false);
      });

      it('should return false for normal case', () => {
        const caseEntity = createAllOnXCase({ patientId: 'p1' });
        expect(requiresImmediateAttention(caseEntity)).toBe(false);
      });
    });

    describe('isActiveCase', () => {
      it('should return true for active statuses', () => {
        const activeStatuses: AllOnXCaseStatus[] = [
          'INTAKE',
          'ASSESSMENT',
          'PLANNING',
          'PRE_TREATMENT',
          'SURGICAL_PHASE',
          'HEALING',
          'PROSTHETIC_PHASE',
          'FOLLOW_UP',
        ];

        activeStatuses.forEach((status) => {
          const caseEntity = { ...createAllOnXCase({ patientId: 'p1' }), status } as AllOnXCase;
          expect(isActiveCase(caseEntity)).toBe(true);
        });
      });

      it('should return false for inactive statuses', () => {
        const inactiveStatuses: AllOnXCaseStatus[] = ['COMPLETED', 'CANCELLED', 'ON_HOLD'];

        inactiveStatuses.forEach((status) => {
          const caseEntity = { ...createAllOnXCase({ patientId: 'p1' }), status } as AllOnXCase;
          expect(isActiveCase(caseEntity)).toBe(false);
        });
      });
    });

    describe('isReadyForSurgery', () => {
      it('should return true when all conditions are met', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          status: 'SURGICAL_PHASE',
          consentObtained: true,
          clinicalScore: { isCandidate: () => true },
          assignedClinicianId: 'doc-123',
        } as AllOnXCase;

        expect(isReadyForSurgery(caseEntity)).toBe(true);
      });

      it('should return false when consent not obtained', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          status: 'SURGICAL_PHASE',
          consentObtained: false,
          clinicalScore: { isCandidate: () => true },
          assignedClinicianId: 'doc-123',
        } as AllOnXCase;

        expect(isReadyForSurgery(caseEntity)).toBe(false);
      });

      it('should return false when not in SURGICAL_PHASE', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          status: 'PLANNING',
          consentObtained: true,
          clinicalScore: { isCandidate: () => true },
          assignedClinicianId: 'doc-123',
        } as AllOnXCase;

        expect(isReadyForSurgery(caseEntity)).toBe(false);
      });
    });

    describe('needsAssessment', () => {
      it('should return true for INTAKE status', () => {
        const caseEntity = createAllOnXCase({ patientId: 'p1' });
        expect(needsAssessment(caseEntity)).toBe(true);
      });

      it('should return true when clinicalScore is null', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          status: 'ASSESSMENT',
        } as AllOnXCase;

        expect(needsAssessment(caseEntity)).toBe(true);
      });

      it('should return false when assessed', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          status: 'PLANNING',
          clinicalScore: {},
        } as AllOnXCase;

        expect(needsAssessment(caseEntity)).toBe(false);
      });
    });

    describe('requiresBoneAugmentation', () => {
      it('should return true when clinical score indicates', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          clinicalScore: { requiresBoneAugmentation: () => true },
        } as AllOnXCase;

        expect(requiresBoneAugmentation(caseEntity)).toBe(true);
      });

      it('should return false when clinical score does not indicate', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          clinicalScore: { requiresBoneAugmentation: () => false },
        } as AllOnXCase;

        expect(requiresBoneAugmentation(caseEntity)).toBe(false);
      });

      it('should return false when no clinical score', () => {
        const caseEntity = createAllOnXCase({ patientId: 'p1' });
        expect(requiresBoneAugmentation(caseEntity)).toBe(false);
      });
    });

    describe('calculateCaseProgress', () => {
      it('should return correct progress for each status', () => {
        const progressMap: Record<AllOnXCaseStatus, number> = {
          INTAKE: 5,
          ASSESSMENT: 15,
          PLANNING: 25,
          PRE_TREATMENT: 40,
          SURGICAL_PHASE: 60,
          HEALING: 75,
          PROSTHETIC_PHASE: 90,
          COMPLETED: 100,
          FOLLOW_UP: 100,
          ON_HOLD: -1,
          CANCELLED: -1,
        };

        Object.entries(progressMap).forEach(([status, expectedProgress]) => {
          const caseEntity = {
            ...createAllOnXCase({ patientId: 'p1' }),
            status: status as AllOnXCaseStatus,
          } as AllOnXCase;

          expect(calculateCaseProgress(caseEntity)).toBe(expectedProgress);
        });
      });
    });

    describe('getCaseSummary', () => {
      it('should return basic summary', () => {
        const caseEntity = createAllOnXCase({ patientId: 'p1' });
        const summary = getCaseSummary(caseEntity);

        expect(summary).toContain('Case');
        expect(summary).toContain('Status: INTAKE');
      });

      it('should include clinical score info when available', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          clinicalScore: {
            eligibility: 'ELIGIBLE',
            riskLevel: 'LOW',
          },
        } as AllOnXCase;

        const summary = getCaseSummary(caseEntity);

        expect(summary).toContain('Eligibility: ELIGIBLE');
        expect(summary).toContain('Risk: LOW');
      });

      it('should include procedure when set', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          recommendedProcedure: 'ALL_ON_4',
        } as AllOnXCase;

        const summary = getCaseSummary(caseEntity);

        expect(summary).toContain('Procedure: ALL ON 4');
      });
    });

    describe('getDaysSinceCreation', () => {
      it('should return 0 for newly created case', () => {
        const caseEntity = createAllOnXCase({ patientId: 'p1' });
        expect(getDaysSinceCreation(caseEntity)).toBe(0);
      });

      it('should return correct days for older case', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          createdAt: new Date('2024-06-10T10:00:00.000Z'),
        } as AllOnXCase;

        expect(getDaysSinceCreation(caseEntity)).toBe(5);
      });
    });

    describe('isOverdueForFollowUp', () => {
      it('should return true when follow-up is overdue', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          status: 'FOLLOW_UP',
          followUps: [
            {
              id: 'fu-1',
              scheduledFor: new Date('2024-06-10T10:00:00.000Z'),
              completedAt: undefined,
              type: 'ROUTINE',
            },
          ],
        } as AllOnXCase;

        expect(isOverdueForFollowUp(caseEntity)).toBe(true);
      });

      it('should return false when follow-up is completed', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          followUps: [
            {
              id: 'fu-1',
              scheduledFor: new Date('2024-06-10T10:00:00.000Z'),
              completedAt: new Date('2024-06-10T11:00:00.000Z'),
              type: 'ROUTINE',
            },
          ],
        } as AllOnXCase;

        expect(isOverdueForFollowUp(caseEntity)).toBe(false);
      });

      it('should return false for cancelled cases', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          status: 'CANCELLED',
          followUps: [
            {
              id: 'fu-1',
              scheduledFor: new Date('2024-06-10T10:00:00.000Z'),
              completedAt: undefined,
              type: 'ROUTINE',
            },
          ],
        } as AllOnXCase;

        expect(isOverdueForFollowUp(caseEntity)).toBe(false);
      });
    });

    describe('getNextFollowUp', () => {
      it('should return next pending follow-up', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          followUps: [
            {
              id: 'fu-1',
              scheduledFor: new Date('2024-06-20T10:00:00.000Z'),
              completedAt: undefined,
              type: 'ROUTINE',
            },
            {
              id: 'fu-2',
              scheduledFor: new Date('2024-06-30T10:00:00.000Z'),
              completedAt: undefined,
              type: 'HEALING_CHECK',
            },
          ],
        } as AllOnXCase;

        const next = getNextFollowUp(caseEntity);

        expect(next?.id).toBe('fu-1');
      });

      it('should return null when no pending follow-ups', () => {
        const caseEntity = createAllOnXCase({ patientId: 'p1' });
        expect(getNextFollowUp(caseEntity)).toBeNull();
      });
    });

    describe('Implant helpers', () => {
      describe('getImplantCount', () => {
        it('should return count of implants', () => {
          const caseEntity = {
            ...createAllOnXCase({ patientId: 'p1' }),
            implants: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }],
          } as AllOnXCase;

          expect(getImplantCount(caseEntity)).toBe(4);
        });
      });

      describe('getExpectedImplantCount', () => {
        it('should return 4 for ALL_ON_4 single arch', () => {
          const caseEntity = {
            ...createAllOnXCase({ patientId: 'p1' }),
            recommendedProcedure: 'ALL_ON_4',
            targetArch: 'MAXILLA',
          } as AllOnXCase;

          expect(getExpectedImplantCount(caseEntity)).toBe(4);
        });

        it('should return 8 for ALL_ON_4 both arches', () => {
          const caseEntity = {
            ...createAllOnXCase({ patientId: 'p1' }),
            recommendedProcedure: 'ALL_ON_4',
            targetArch: 'BOTH',
          } as AllOnXCase;

          expect(getExpectedImplantCount(caseEntity)).toBe(8);
        });

        it('should return 6 for ALL_ON_6 single arch', () => {
          const caseEntity = {
            ...createAllOnXCase({ patientId: 'p1' }),
            recommendedProcedure: 'ALL_ON_6',
            targetArch: 'MANDIBLE',
          } as AllOnXCase;

          expect(getExpectedImplantCount(caseEntity)).toBe(6);
        });

        it('should return 0 when no procedure set', () => {
          const caseEntity = createAllOnXCase({ patientId: 'p1' });
          expect(getExpectedImplantCount(caseEntity)).toBe(0);
        });
      });

      describe('areAllImplantsPlaced', () => {
        it('should return true when all implants placed', () => {
          const caseEntity = {
            ...createAllOnXCase({ patientId: 'p1' }),
            recommendedProcedure: 'ALL_ON_4',
            targetArch: 'MAXILLA',
            implants: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }],
          } as AllOnXCase;

          expect(areAllImplantsPlaced(caseEntity)).toBe(true);
        });

        it('should return false when implants missing', () => {
          const caseEntity = {
            ...createAllOnXCase({ patientId: 'p1' }),
            recommendedProcedure: 'ALL_ON_4',
            targetArch: 'MAXILLA',
            implants: [{ id: '1' }, { id: '2' }],
          } as AllOnXCase;

          expect(areAllImplantsPlaced(caseEntity)).toBe(false);
        });
      });
    });

    describe('getEligibilitySummary', () => {
      it('should return null values when no clinical score', () => {
        const caseEntity = createAllOnXCase({ patientId: 'p1' });
        const summary = getEligibilitySummary(caseEntity);

        expect(summary.eligibility).toBeNull();
        expect(summary.riskLevel).toBeNull();
        expect(summary.complexity).toBeNull();
        expect(summary.recommendation).toBeNull();
        expect(summary.riskFactors).toEqual([]);
      });

      it('should return values from clinical score', () => {
        const caseEntity = {
          ...createAllOnXCase({ patientId: 'p1' }),
          clinicalScore: {
            eligibility: 'ELIGIBLE',
            riskLevel: 'MODERATE',
            complexity: 'STANDARD',
            treatmentRecommendation: 'PROCEED',
            getRiskFactors: () => ['diabetes', 'smoking'],
          },
        } as AllOnXCase;

        const summary = getEligibilitySummary(caseEntity);

        expect(summary.eligibility).toBe('ELIGIBLE');
        expect(summary.riskLevel).toBe('MODERATE');
        expect(summary.complexity).toBe('STANDARD');
        expect(summary.recommendation).toBe('PROCEED');
        expect(summary.riskFactors).toEqual(['diabetes', 'smoking']);
      });
    });
  });
});
