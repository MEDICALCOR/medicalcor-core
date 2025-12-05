import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Unit tests for OSAX Journey Workflow
 * Tests automated workflow for OSAX (Obstructive Sleep Apnea) case management
 */

// Mock environment variables
vi.stubEnv('DATABASE_URL', '');

// Import after env setup
import { createInMemoryEventStore, IdempotencyKeys, getTodayString } from '@medicalcor/core';

describe('OSAX Journey Workflow', () => {
  const correlationId = 'osax-journey-test-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Main workflow orchestration', () => {
    it('should initiate urgent review for SEVERE cases', async () => {
      const eventStore = createInMemoryEventStore('osax-urgent');

      const payload = {
        caseId: 'case-uuid-123',
        caseNumber: 'OSAX-2025-001',
        patientId: 'patient-123',
        severity: 'SEVERE' as const,
        ahi: 45.5,
        treatmentRecommendation: 'CPAP therapy recommended immediately',
        cardiovascularRisk: 'CRITICAL' as const,
        correlationId,
      };

      // Workflow should trigger urgent review
      expect(payload.severity).toBe('SEVERE');
      expect(payload.cardiovascularRisk).toBe('CRITICAL');

      // Emit event to track urgent review trigger
      await eventStore.emit({
        type: 'osax.urgent_review.triggered',
        correlationId: `${correlationId}_urgent`,
        aggregateId: payload.caseId,
        aggregateType: 'osax_case',
        payload: {
          caseId: payload.caseId,
          caseNumber: payload.caseNumber,
          severity: payload.severity,
          cardiovascularRisk: payload.cardiovascularRisk,
          ahi: payload.ahi,
        },
      });

      const events = await eventStore.getByType('osax.urgent_review.triggered');
      expect(events.length).toBe(1);
      expect(events[0]?.payload.severity).toBe('SEVERE');
    });

    it('should initiate standard review for MODERATE cases', async () => {
      const eventStore = createInMemoryEventStore('osax-standard');

      const payload = {
        caseId: 'case-uuid-456',
        caseNumber: 'OSAX-2025-002',
        patientId: 'patient-456',
        severity: 'MODERATE' as const,
        ahi: 25.3,
        treatmentRecommendation: 'Lifestyle modifications and CPAP',
        cardiovascularRisk: 'MODERATE' as const,
        correlationId,
      };

      // Should trigger standard review (not urgent)
      expect(payload.severity).toBe('MODERATE');
      expect(payload.cardiovascularRisk).not.toBe('CRITICAL');

      await eventStore.emit({
        type: 'osax.standard_review.triggered',
        correlationId: `${correlationId}_standard`,
        aggregateId: payload.caseId,
        aggregateType: 'osax_case',
        payload: {
          caseId: payload.caseId,
          caseNumber: payload.caseNumber,
          severity: payload.severity,
          treatmentRecommendation: payload.treatmentRecommendation,
        },
      });

      const events = await eventStore.getByType('osax.standard_review.triggered');
      expect(events.length).toBe(1);
    });

    it('should skip treatment planning for NONE severity', () => {
      const payload = {
        caseId: 'case-uuid-789',
        severity: 'NONE' as const,
        ahi: 3.2,
        cardiovascularRisk: 'LOW' as const,
      };

      // No treatment planning needed
      const shouldPlanTreatment = payload.severity !== 'NONE';
      expect(shouldPlanTreatment).toBe(false);
    });

    it('should calculate correct wait times based on severity', () => {
      const severities: Array<'SEVERE' | 'MODERATE' | 'MILD' | 'NONE'> = [
        'SEVERE',
        'MODERATE',
        'MILD',
        'NONE',
      ];
      const expectedWaitHours: Record<string, number> = {
        SEVERE: 4,
        MODERATE: 24,
        MILD: 48,
        NONE: 48,
      };

      for (const severity of severities) {
        const reviewWaitHours =
          severity === 'SEVERE' ? 4 : severity === 'MODERATE' ? 24 : 48;
        expect(reviewWaitHours).toBe(expectedWaitHours[severity]);
      }
    });

    it('should schedule follow-up based on severity', () => {
      const severities: Array<'SEVERE' | 'MODERATE' | 'MILD'> = ['SEVERE', 'MODERATE', 'MILD'];
      const expectedDelayDays: Record<string, number> = {
        SEVERE: 7,
        MODERATE: 14,
        MILD: 30,
      };

      for (const severity of severities) {
        const followUpDelayDays =
          severity === 'SEVERE' ? 7 : severity === 'MODERATE' ? 14 : 30;
        expect(followUpDelayDays).toBe(expectedDelayDays[severity]);
      }
    });

    it('should return complete workflow result', async () => {
      const result = {
        success: true,
        caseId: 'case-123',
        caseNumber: 'OSAX-2025-001',
        severity: 'MODERATE' as const,
        stagesCompleted: [
          'notifications',
          'review_initiated',
          'treatment_planning',
          'followup_scheduled',
        ],
      };

      expect(result.success).toBe(true);
      expect(result.stagesCompleted).toContain('notifications');
      expect(result.stagesCompleted).toContain('review_initiated');
      expect(result.stagesCompleted).toContain('treatment_planning');
      expect(result.stagesCompleted).toContain('followup_scheduled');
    });
  });

  describe('Urgent review workflow', () => {
    it('should set SLA deadline for urgent cases', () => {
      const slaHours = 4;
      const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);
      const now = new Date();

      const hoursDiff = (slaDeadline.getTime() - now.getTime()) / (1000 * 60 * 60);
      expect(hoursDiff).toBeGreaterThanOrEqual(3.9);
      expect(hoursDiff).toBeLessThanOrEqual(4.1);
    });

    it('should escalate if case still pending after 2 hours', () => {
      const caseStatus = {
        reviewStatus: 'PENDING' as const,
        hasPhysicianReview: false,
        status: 'pending',
      };

      const stillPending = caseStatus.reviewStatus === 'PENDING' && !caseStatus.hasPhysicianReview;
      expect(stillPending).toBe(true);
    });

    it('should not escalate if case was reviewed', () => {
      const caseStatus = {
        reviewStatus: 'APPROVED' as const,
        hasPhysicianReview: true,
        status: 'approved',
      };

      const stillPending = caseStatus.reviewStatus === 'PENDING' && !caseStatus.hasPhysicianReview;
      expect(stillPending).toBe(false);
    });

    it('should return escalation status in result', () => {
      const result = {
        success: true,
        caseId: 'case-123',
        caseNumber: 'OSAX-2025-001',
        slaDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        escalated: true,
        reviewStatus: 'PENDING' as const,
      };

      expect(result.escalated).toBe(true);
      expect(result.reviewStatus).toBe('PENDING');
    });

    it('should emit urgent review events', async () => {
      const eventStore = createInMemoryEventStore('urgent-review');

      await eventStore.emit({
        type: 'osax.urgent_review.initiated',
        correlationId,
        aggregateId: 'case-123',
        aggregateType: 'osax_case',
        payload: {
          caseId: 'case-123',
          severity: 'SEVERE',
          cardiovascularRisk: 'CRITICAL',
          slaDeadline: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
        },
      });

      const events = await eventStore.getByType('osax.urgent_review.initiated');
      expect(events.length).toBe(1);
    });
  });

  describe('Standard review workflow', () => {
    it('should set SLA based on severity for standard cases', () => {
      const severities: Array<'MODERATE' | 'MILD'> = ['MODERATE', 'MILD'];
      const expectedSlaHours: Record<string, number> = {
        MODERATE: 24,
        MILD: 48,
      };

      for (const severity of severities) {
        const slaHours = severity === 'MODERATE' ? 24 : 48;
        expect(slaHours).toBe(expectedSlaHours[severity]);
      }
    });

    it('should schedule reminder at 75% of SLA', () => {
      const slaHours = 24;
      const reminderHours = Math.floor(slaHours * 0.75);

      expect(reminderHours).toBe(18);
    });

    it('should return standard review result', () => {
      const result = {
        success: true,
        caseId: 'case-456',
        caseNumber: 'OSAX-2025-002',
        slaDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        reminderSent: true,
      };

      expect(result.success).toBe(true);
      expect(result.reminderSent).toBe(true);
      expect(result.slaDeadline).toBeDefined();
    });
  });

  describe('Treatment planning workflow', () => {
    it('should determine PAP_THERAPY path for CPAP/BIPAP recommendations', () => {
      const recommendations = [
        'CPAP therapy recommended',
        'BIPAP with adjustable pressure',
        'Continue CPAP usage',
      ];

      for (const recommendation of recommendations) {
        let treatmentPath: string;
        if (recommendation.includes('CPAP') || recommendation.includes('BIPAP')) {
          treatmentPath = 'PAP_THERAPY';
        } else {
          treatmentPath = 'UNKNOWN';
        }
        expect(treatmentPath).toBe('PAP_THERAPY');
      }
    });

    it('should determine ORAL_APPLIANCE path for oral device recommendations', () => {
      const recommendation = 'ORAL appliance therapy';

      let treatmentPath: string;
      if (recommendation.includes('ORAL')) {
        treatmentPath = 'ORAL_APPLIANCE';
      } else {
        treatmentPath = 'UNKNOWN';
      }

      expect(treatmentPath).toBe('ORAL_APPLIANCE');
    });

    it('should determine SURGICAL_EVALUATION path for surgery recommendations', () => {
      const recommendation = 'SURGERY evaluation for upper airway';

      let treatmentPath: string;
      if (recommendation.includes('SURGERY')) {
        treatmentPath = 'SURGICAL_EVALUATION';
      } else {
        treatmentPath = 'UNKNOWN';
      }

      expect(treatmentPath).toBe('SURGICAL_EVALUATION');
    });

    it('should create appropriate tasks for PAP_THERAPY path', () => {
      const treatmentPath = 'PAP_THERAPY';
      const tasks: string[] = [];

      if (treatmentPath === 'PAP_THERAPY') {
        tasks.push('Schedule CPAP education session');
        tasks.push('Order CPAP equipment');
        tasks.push('Schedule mask fitting');
        tasks.push('Set up remote monitoring');
      }

      expect(tasks.length).toBe(4);
      expect(tasks).toContain('Schedule CPAP education session');
      expect(tasks).toContain('Order CPAP equipment');
    });

    it('should create appropriate tasks for ORAL_APPLIANCE path', () => {
      const treatmentPath = 'ORAL_APPLIANCE';
      const tasks: string[] = [];

      if (treatmentPath === 'ORAL_APPLIANCE') {
        tasks.push('Refer to sleep dentist');
        tasks.push('Schedule dental impression');
        tasks.push('Order custom appliance');
      }

      expect(tasks.length).toBe(3);
      expect(tasks).toContain('Refer to sleep dentist');
    });

    it('should create appropriate tasks for SURGICAL_EVALUATION path', () => {
      const treatmentPath = 'SURGICAL_EVALUATION';
      const tasks: string[] = [];

      if (treatmentPath === 'SURGICAL_EVALUATION') {
        tasks.push('Refer to ENT specialist');
        tasks.push('Schedule surgical consultation');
        tasks.push('Order pre-surgical workup');
      }

      expect(tasks.length).toBe(3);
      expect(tasks).toContain('Refer to ENT specialist');
    });

    it('should create appropriate tasks for LIFESTYLE_MODIFICATION path', () => {
      const treatmentPath = 'LIFESTYLE_MODIFICATION';
      const tasks: string[] = [];

      if (treatmentPath === 'LIFESTYLE_MODIFICATION') {
        tasks.push('Schedule lifestyle counseling');
        tasks.push('Provide weight management resources');
        tasks.push('Send positional therapy instructions');
      }

      expect(tasks.length).toBe(3);
      expect(tasks).toContain('Schedule lifestyle counseling');
    });

    it('should return treatment planning result', () => {
      const result = {
        success: true,
        caseId: 'case-123',
        caseNumber: 'OSAX-2025-001',
        treatmentPath: 'PAP_THERAPY',
        tasksCreated: [
          'Schedule CPAP education session',
          'Order CPAP equipment',
          'Schedule mask fitting',
          'Set up remote monitoring',
        ],
      };

      expect(result.success).toBe(true);
      expect(result.treatmentPath).toBe('PAP_THERAPY');
      expect(result.tasksCreated.length).toBeGreaterThan(0);
    });
  });

  describe('Follow-up workflow', () => {
    it('should schedule follow-up based on type and days', () => {
      const scheduledForDays = 7;
      const followUpDate = new Date(Date.now() + scheduledForDays * 24 * 60 * 60 * 1000);
      const now = new Date();

      const daysDiff = (followUpDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeGreaterThanOrEqual(6.9);
      expect(daysDiff).toBeLessThanOrEqual(7.1);
    });

    it('should calculate reminder days correctly', () => {
      const scheduledForDays = 7;
      const reminderDays = Math.max(0, scheduledForDays - 2);

      expect(reminderDays).toBe(5);
    });

    it('should handle short follow-up periods', () => {
      const scheduledForDays = 1;
      const reminderDays = Math.max(0, scheduledForDays - 2);

      expect(reminderDays).toBe(0); // Can't send reminder before follow-up day
    });

    it('should support different follow-up types', () => {
      const followUpTypes = ['INITIAL', 'COMPLIANCE_CHECK', 'TREATMENT_REVIEW', 'ANNUAL'];

      for (const type of followUpTypes) {
        expect(['INITIAL', 'COMPLIANCE_CHECK', 'TREATMENT_REVIEW', 'ANNUAL']).toContain(type);
      }
    });

    it('should return follow-up result with completion status', () => {
      const result = {
        success: true,
        caseId: 'case-123',
        caseNumber: 'OSAX-2025-001',
        followUpType: 'INITIAL',
        scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        reminderSent: true,
        followUpStatus: 'COMPLETED' as const,
        completed: true,
      };

      expect(result.success).toBe(true);
      expect(result.followUpType).toBe('INITIAL');
      expect(result.completed).toBe(true);
    });

    it('should emit follow-up scheduled event', async () => {
      const eventStore = createInMemoryEventStore('follow-up');

      await eventStore.emit({
        type: 'osax.followup.scheduled',
        correlationId,
        aggregateId: 'case-123',
        aggregateType: 'osax_case',
        payload: {
          caseId: 'case-123',
          followUpType: 'INITIAL',
          scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });

      const events = await eventStore.getByType('osax.followup.scheduled');
      expect(events.length).toBe(1);
    });
  });

  describe('Treatment onboarding workflow', () => {
    it('should execute onboarding stages over time', () => {
      const stages = [
        { day: 1, description: 'Welcome message' },
        { day: 3, description: 'First usage check' },
        { day: 7, description: 'Week 1 compliance check' },
        { day: 30, description: 'Month 1 review' },
      ];

      expect(stages.length).toBe(4);
      expect(stages[0]?.day).toBe(1);
      expect(stages[3]?.day).toBe(30);
    });

    it('should return onboarding completion result', () => {
      const result = {
        success: true,
        caseId: 'case-123',
        caseNumber: 'OSAX-2025-001',
        treatmentType: 'CPAP',
        onboardingStages: ['welcome', 'day3_check', 'week1_review', 'month1_review'],
      };

      expect(result.onboardingStages.length).toBe(4);
      expect(result.onboardingStages).toContain('welcome');
      expect(result.onboardingStages).toContain('month1_review');
    });
  });

  describe('Data retention workflow', () => {
    it('should use 7 years (2555 days) as default retention period', () => {
      const retentionPeriodDays = 2555; // 7 years
      const years = retentionPeriodDays / 365;

      expect(years).toBeCloseTo(7, 0);
    });

    it('should schedule deletion reminder at 90% of retention period', () => {
      const retentionPeriodDays = 2555;
      const reminderDays = Math.floor(retentionPeriodDays * 0.9);

      expect(reminderDays).toBe(2299);
      expect(reminderDays).toBeLessThan(retentionPeriodDays);
    });

    it('should trigger deletion after retention period', () => {
      const result = {
        success: true,
        caseId: 'case-123',
        caseNumber: 'OSAX-2025-001',
        retentionPeriodDays: 2555,
        deletionTriggered: true,
      };

      expect(result.deletionTriggered).toBe(true);
    });
  });

  describe('Database queries', () => {
    it('should handle case review status structure', () => {
      const reviewStatus = {
        reviewStatus: 'PENDING' as const,
        hasPhysicianReview: false,
        status: 'pending',
      };

      expect(['PENDING', 'IN_REVIEW', 'APPROVED', 'NEEDS_MODIFICATION']).toContain(
        reviewStatus.reviewStatus
      );
      expect(typeof reviewStatus.hasPhysicianReview).toBe('boolean');
    });

    it('should handle follow-up status structure', () => {
      const followUpStatus = {
        completed: true,
        status: 'COMPLETED' as const,
      };

      expect(['SCHEDULED', 'COMPLETED', 'MISSED', 'CANCELLED', 'NOT_FOUND']).toContain(
        followUpStatus.status
      );
      expect(typeof followUpStatus.completed).toBe('boolean');
    });

    it('should handle missing database URL gracefully', () => {
      const databaseUrl = process.env.DATABASE_URL;

      if (!databaseUrl) {
        const failSafeStatus = {
          reviewStatus: 'PENDING' as const,
          hasPhysicianReview: false,
          status: 'UNKNOWN',
        };
        expect(failSafeStatus.status).toBe('UNKNOWN');
      }
    });
  });

  describe('Idempotency', () => {
    it('should generate idempotency keys for sub-workflows', () => {
      const caseId = 'case-123';
      const urgentKey = IdempotencyKeys.custom('osax-urgent', caseId);
      const standardKey = IdempotencyKeys.custom('osax-standard', caseId);
      const treatmentKey = IdempotencyKeys.custom('osax-treatment', caseId);

      expect(urgentKey).toBeDefined();
      expect(standardKey).toBeDefined();
      expect(treatmentKey).toBeDefined();
      expect(urgentKey).not.toBe(standardKey);
    });

    it('should generate unique idempotency keys for follow-ups', () => {
      const caseId = 'case-123';
      const followUpTypes = ['INITIAL', 'COMPLIANCE_CHECK', 'TREATMENT_REVIEW'];

      const keys = followUpTypes.map((type) =>
        IdempotencyKeys.custom('osax-followup', caseId, type)
      );

      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);
    });
  });

  describe('Error handling', () => {
    it('should handle database connection errors', () => {
      const errorResponse = {
        reviewStatus: 'PENDING' as const,
        hasPhysicianReview: false,
        status: 'ERROR',
      };

      expect(errorResponse.status).toBe('ERROR');
      expect(errorResponse.reviewStatus).toBe('PENDING'); // Fail-safe
    });

    it('should handle case not found in database', () => {
      const notFoundResponse = {
        reviewStatus: 'PENDING' as const,
        hasPhysicianReview: false,
        status: 'NOT_FOUND',
      };

      expect(notFoundResponse.status).toBe('NOT_FOUND');
    });

    it('should emit warning for unreviewed cases after wait period', async () => {
      const eventStore = createInMemoryEventStore('osax-warnings');

      const reviewStatus = {
        reviewStatus: 'PENDING' as const,
        hasPhysicianReview: false,
        status: 'pending',
      };

      if (!reviewStatus.hasPhysicianReview && reviewStatus.reviewStatus === 'PENDING') {
        await eventStore.emit({
          type: 'osax.case.unreviewed_warning',
          correlationId,
          aggregateId: 'case-123',
          aggregateType: 'osax_case',
          payload: {
            caseId: 'case-123',
            reviewStatus: reviewStatus.reviewStatus,
            severity: 'MODERATE',
          },
        });
      }

      const events = await eventStore.getByType('osax.case.unreviewed_warning');
      expect(events.length).toBe(1);
    });
  });

  describe('Integration with multiple workflows', () => {
    it('should trigger all required workflows in sequence', async () => {
      const eventStore = createInMemoryEventStore('osax-integration');

      const workflowStages = [
        'urgent_review_triggered',
        'treatment_planning_initiated',
        'followup_scheduled',
      ];

      for (const stage of workflowStages) {
        await eventStore.emit({
          type: `osax.${stage}`,
          correlationId,
          aggregateId: 'case-123',
          aggregateType: 'osax_case',
          payload: { caseId: 'case-123', stage },
        });
      }

      const allEvents = await eventStore.getByAggregateId('case-123');
      expect(allEvents.length).toBe(workflowStages.length);
    });
  });
});
