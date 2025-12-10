/**
 * Tests for ClinicLabCollaborationService
 *
 * Covers:
 * - Collaboration thread creation and messaging
 * - Design feedback creation
 * - Status update notifications
 * - SLA tracking and calculations
 * - Daily summary generation
 * - Lab performance metrics
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createCollaborationThread,
  addMessageToThread,
  createDesignFeedback,
  generateStatusUpdateNotification,
  calculateSLATracking,
  generateClinicDailySummary,
  calculateLabPerformanceMetrics,
  type CollaborationMessage,
  type CollaborationThread,
  type DesignFeedback,
  type NotificationPreferences,
  type CaseStatusUpdate,
  type LabSLATracking,
} from '../ClinicLabCollaborationService.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function createSender(
  overrides: Partial<CollaborationMessage['sender']> = {}
): CollaborationMessage['sender'] {
  return {
    id: 'user-123',
    name: 'Dr. Smith',
    role: 'CLINICIAN',
    organization: 'CLINIC',
    ...overrides,
  };
}

function createLabTechnician(): CollaborationMessage['sender'] {
  return {
    id: 'tech-456',
    name: 'Lab Tech Mike',
    role: 'LAB_TECHNICIAN',
    organization: 'LAB',
  };
}

function createNotificationPrefs(
  overrides: Partial<NotificationPreferences> = {}
): NotificationPreferences {
  return {
    userId: 'user-123',
    channels: {
      email: true,
      sms: false,
      whatsapp: true,
      inApp: true,
      push: true,
    },
    triggers: {
      statusChange: true,
      designReady: true,
      revisionRequested: true,
      qcComplete: true,
      readyForPickup: true,
      urgentMessage: true,
      deliveryUpdate: true,
    },
    ...overrides,
  };
}

function createStatusUpdate(overrides: Partial<CaseStatusUpdate> = {}): CaseStatusUpdate {
  return {
    labCaseId: 'case-123',
    previousStatus: 'IN_DESIGN',
    newStatus: 'DESIGN_REVIEW',
    changedBy: 'tech-456',
    changedAt: new Date(),
    autoNotify: ['CLINICIAN'],
    ...overrides,
  };
}

function createCompletedCase(overrides = {}) {
  const start = new Date('2024-11-01');
  const completion = new Date('2024-11-10');
  const expected = new Date('2024-11-12');

  return {
    caseNumber: 'CASE-001',
    slaType: 'STANDARD' as const,
    startDate: start,
    completionDate: completion,
    expectedCompletionDate: expected,
    revisionCount: 0,
    qcPassedFirstTime: true,
    patientSatisfaction: 9,
    ...overrides,
  };
}

// ============================================================================
// COLLABORATION THREAD TESTS
// ============================================================================

describe('createCollaborationThread', () => {
  it('should create a new thread with initial message', () => {
    const sender = createSender();

    const thread = createCollaborationThread(
      'case-123',
      'Question about margin fit',
      sender,
      'Can you check the marginal fit on tooth 14?'
    );

    expect(thread.id).toBeDefined();
    expect(thread.labCaseId).toBe('case-123');
    expect(thread.subject).toBe('Question about margin fit');
    expect(thread.status).toBe('OPEN');
    expect(thread.priority).toBe('NORMAL');
    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]?.content).toBe('Can you check the marginal fit on tooth 14?');
  });

  it('should set custom priority', () => {
    const sender = createSender();

    const thread = createCollaborationThread('case-123', 'Urgent issue', sender, 'Help!', 'URGENT');

    expect(thread.priority).toBe('URGENT');
  });

  it('should add sender as participant', () => {
    const sender = createSender();

    const thread = createCollaborationThread('case-123', 'Test', sender, 'Test message');

    expect(thread.participants).toHaveLength(1);
    expect(thread.participants[0]?.userId).toBe('user-123');
    expect(thread.participants[0]?.role).toBe('CLINICIAN');
    expect(thread.participants[0]?.organization).toBe('CLINIC');
  });

  it('should mark initial message as read by sender', () => {
    const sender = createSender();

    const thread = createCollaborationThread('case-123', 'Test', sender, 'Test message');

    expect(thread.messages[0]?.readBy).toHaveLength(1);
    expect(thread.messages[0]?.readBy[0]?.userId).toBe('user-123');
  });
});

describe('addMessageToThread', () => {
  let baseThread: CollaborationThread;

  beforeEach(() => {
    baseThread = createCollaborationThread(
      'case-123',
      'Test Thread',
      createSender(),
      'Initial message'
    );
  });

  it('should add a new message to thread', () => {
    const labTech = createLabTechnician();

    const updated = addMessageToThread(baseThread, labTech, 'Response from lab');

    expect(updated.messages).toHaveLength(2);
    expect(updated.messages[1]?.content).toBe('Response from lab');
    expect(updated.messages[1]?.sender.role).toBe('LAB_TECHNICIAN');
  });

  it('should update thread status when lab responds', () => {
    const labTech = createLabTechnician();

    const updated = addMessageToThread(baseThread, labTech, 'Working on it');

    expect(updated.status).toBe('PENDING_RESPONSE');
  });

  it('should keep status OPEN when clinic responds', () => {
    const clinician = createSender();

    const updated = addMessageToThread(baseThread, clinician, 'Follow up question');

    expect(updated.status).toBe('OPEN');
  });

  it('should add new participant to thread', () => {
    const labTech = createLabTechnician();

    const updated = addMessageToThread(baseThread, labTech, 'Hello');

    expect(updated.participants).toHaveLength(2);
    expect(updated.participants.some((p) => p.userId === 'tech-456')).toBe(true);
  });

  it('should update existing participant lastSeen', () => {
    const sender = createSender();

    const updated = addMessageToThread(baseThread, sender, 'Another message');

    const participant = updated.participants.find((p) => p.userId === 'user-123');
    expect(participant?.lastSeen).toBeDefined();
  });

  it('should increment unread count for other participants', () => {
    // First add lab tech
    const labTech = createLabTechnician();
    const withLabTech = addMessageToThread(baseThread, labTech, 'Lab response');

    // Then clinician responds
    const clinician = createSender();
    const updated = addMessageToThread(withLabTech, clinician, 'Thanks!');

    expect(updated.unreadCount['tech-456']).toBe(1);
  });

  it('should support message type and attachments', () => {
    const labTech = createLabTechnician();

    const updated = addMessageToThread(baseThread, labTech, 'Design ready', {
      messageType: 'DESIGN_FEEDBACK',
      attachments: [
        {
          id: 'att-1',
          filename: 'design.stl',
          fileType: 'STL',
          fileSize: 1024000,
          url: 'https://example.com/design.stl',
        },
      ],
    });

    expect(updated.messages[1]?.messageType).toBe('DESIGN_FEEDBACK');
    expect(updated.messages[1]?.attachments).toHaveLength(1);
  });
});

// ============================================================================
// DESIGN FEEDBACK TESTS
// ============================================================================

describe('createDesignFeedback', () => {
  it('should create design feedback with calculated rating', () => {
    const criteriaScores: DesignFeedback['criteriaScores'] = [
      { criterion: 'MARGINAL_FIT', score: 5 },
      { criterion: 'OCCLUSION', score: 4 },
      { criterion: 'AESTHETICS', score: 5 },
    ];

    const feedback = createDesignFeedback(
      'case-123',
      'design-456',
      'dr-smith',
      'APPROVAL',
      criteriaScores,
      'Excellent work!'
    );

    expect(feedback.id).toBeDefined();
    expect(feedback.labCaseId).toBe('case-123');
    expect(feedback.feedbackType).toBe('APPROVAL');
    expect(feedback.overallRating).toBe(5); // (5+4+5)/3 = 4.67 rounded to 5
    expect(feedback.criteriaScores).toHaveLength(3);
    expect(feedback.generalNotes).toBe('Excellent work!');
  });

  it('should handle empty criteria scores', () => {
    const feedback = createDesignFeedback(
      'case-123',
      'design-456',
      'dr-smith',
      'MINOR_REVISION',
      [],
      'Needs adjustment'
    );

    expect(feedback.overallRating).toBe(3); // Default when empty
  });

  it('should include annotations when provided', () => {
    const annotations = [
      {
        id: 'ann-1',
        type: 'ARROW' as const,
        coordinates: { x: 100, y: 200 },
        description: 'Adjust this margin',
        priority: 'HIGH' as const,
        resolved: false,
      },
    ];

    const feedback = createDesignFeedback(
      'case-123',
      'design-456',
      'dr-smith',
      'MAJOR_REVISION',
      [],
      'See annotations',
      annotations
    );

    expect(feedback.annotations).toHaveLength(1);
    expect(feedback.annotations[0]?.type).toBe('ARROW');
  });

  it('should set response deadline when provided', () => {
    const deadline = new Date('2024-12-15');

    const feedback = createDesignFeedback(
      'case-123',
      'design-456',
      'dr-smith',
      'MINOR_REVISION',
      [],
      'Please fix by deadline',
      [],
      deadline
    );

    expect(feedback.responseDeadline).toEqual(deadline);
  });

  it('should record review timestamp', () => {
    const before = new Date();

    const feedback = createDesignFeedback(
      'case-123',
      'design-456',
      'dr-smith',
      'APPROVAL',
      [],
      'Good'
    );

    expect(feedback.reviewedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

// ============================================================================
// STATUS UPDATE NOTIFICATION TESTS
// ============================================================================

describe('generateStatusUpdateNotification', () => {
  it('should generate notification for enabled triggers', () => {
    const update = createStatusUpdate({ newStatus: 'DESIGN_REVIEW' });
    const prefs = createNotificationPrefs();

    const result = generateStatusUpdateNotification(update, prefs);

    expect(result.shouldNotify).toBe(true);
    expect(result.channels).toContain('email');
    expect(result.channels).toContain('inApp');
    expect(result.message).toContain('design is ready');
  });

  it('should not notify when status change trigger disabled', () => {
    const update = createStatusUpdate();
    const prefs = createNotificationPrefs({
      triggers: {
        statusChange: false,
        designReady: true,
        revisionRequested: true,
        qcComplete: true,
        readyForPickup: true,
        urgentMessage: true,
        deliveryUpdate: true,
      },
    });

    const result = generateStatusUpdateNotification(update, prefs);

    expect(result.shouldNotify).toBe(false);
  });

  it('should not notify when no channels enabled', () => {
    const update = createStatusUpdate();
    const prefs = createNotificationPrefs({
      channels: {
        email: false,
        sms: false,
        whatsapp: false,
        inApp: false,
        push: false,
      },
    });

    const result = generateStatusUpdateNotification(update, prefs);

    expect(result.shouldNotify).toBe(false);
  });

  it('should set HIGH priority for DESIGN_REVIEW status', () => {
    const update = createStatusUpdate({ newStatus: 'DESIGN_REVIEW' });
    const prefs = createNotificationPrefs();

    const result = generateStatusUpdateNotification(update, prefs);

    expect(result.priority).toBe('HIGH');
  });

  it('should set HIGH priority for READY_FOR_PICKUP status', () => {
    const update = createStatusUpdate({ newStatus: 'READY_FOR_PICKUP' });
    const prefs = createNotificationPrefs();

    const result = generateStatusUpdateNotification(update, prefs);

    expect(result.priority).toBe('HIGH');
    expect(result.message).toContain('ready for pickup');
  });

  it('should generate appropriate message for each status', () => {
    const statuses = ['SCAN_RECEIVED', 'IN_DESIGN', 'MILLING', 'QC_PASSED', 'DELIVERED'];

    for (const status of statuses) {
      const update = createStatusUpdate({ newStatus: status });
      const prefs = createNotificationPrefs();

      const result = generateStatusUpdateNotification(update, prefs);

      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('should handle unknown status', () => {
    const update = createStatusUpdate({ newStatus: 'UNKNOWN_STATUS' });
    const prefs = createNotificationPrefs();

    const result = generateStatusUpdateNotification(update, prefs);

    expect(result.message).toContain('UNKNOWN_STATUS');
  });
});

// ============================================================================
// SLA TRACKING TESTS
// ============================================================================

describe('calculateSLATracking', () => {
  // Use fixed dates for testing
  let originalDate: typeof Date;
  let mockNow: Date;

  beforeEach(() => {
    mockNow = new Date('2024-12-10T12:00:00Z');
    originalDate = global.Date;
    vi.useFakeTimers();
    vi.setSystemTime(mockNow);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should calculate SLA for standard case', () => {
    const received = new Date('2024-12-05T10:00:00Z');
    const history = [{ status: 'SCAN_RECEIVED', changedAt: new Date('2024-12-05T12:00:00Z') }];

    const sla = calculateSLATracking('case-123', received, 'IN_DESIGN', 'STANDARD', history);

    expect(sla.labCaseId).toBe('case-123');
    expect(sla.slaType).toBe('STANDARD');
    expect(sla.milestones.length).toBe(6);
    expect(sla.percentComplete).toBeGreaterThanOrEqual(0);
  });

  it('should calculate SLA for RUSH case with shorter durations', () => {
    const received = new Date('2024-12-09T10:00:00Z');
    const history: { status: string; changedAt: Date }[] = [];

    const standardSla = calculateSLATracking('case-1', received, 'IN_DESIGN', 'STANDARD', history);
    const rushSla = calculateSLATracking('case-2', received, 'IN_DESIGN', 'RUSH', history);

    // Rush should have earlier expected dates
    const standardFirstMilestone = standardSla.milestones[0]?.expectedBy;
    const rushFirstMilestone = rushSla.milestones[0]?.expectedBy;

    if (standardFirstMilestone && rushFirstMilestone) {
      expect(rushFirstMilestone.getTime()).toBeLessThan(standardFirstMilestone.getTime());
    }
  });

  it('should mark completed milestones', () => {
    const received = new Date('2024-12-01T10:00:00Z');
    const history = [
      { status: 'SCAN_RECEIVED', changedAt: new Date('2024-12-01T12:00:00Z') },
      { status: 'DESIGN_REVIEW', changedAt: new Date('2024-12-03T10:00:00Z') },
    ];

    const sla = calculateSLATracking('case-123', received, 'DESIGN_REVIEW', 'STANDARD', history);

    expect(sla.milestones[0]?.status).toBe('COMPLETED');
    expect(sla.milestones[1]?.status).toBe('COMPLETED');
  });

  it('should detect overdue milestones', () => {
    const received = new Date('2024-11-01T10:00:00Z'); // Very old case
    const history: { status: string; changedAt: Date }[] = [];

    const sla = calculateSLATracking('case-123', received, 'IN_DESIGN', 'STANDARD', history);

    expect(sla.overallStatus).toBe('OVERDUE');
    expect(sla.milestones.some((m) => m.status === 'OVERDUE')).toBe(true);
  });

  it('should detect at-risk milestones', () => {
    // Case received 23 hours ago with first milestone at 24 hours
    const received = new Date(mockNow.getTime() - 23 * 60 * 60 * 1000);
    const history: { status: string; changedAt: Date }[] = [];

    const sla = calculateSLATracking('case-123', received, 'PROCESSING', 'STANDARD', history);

    expect(sla.milestones.some((m) => m.status === 'AT_RISK')).toBe(true);
  });

  it('should calculate percent complete', () => {
    const received = new Date('2024-12-01T10:00:00Z');
    const history = [
      { status: 'SCAN_RECEIVED', changedAt: new Date('2024-12-01T12:00:00Z') },
      { status: 'DESIGN_REVIEW', changedAt: new Date('2024-12-03T10:00:00Z') },
      { status: 'DESIGN_APPROVED', changedAt: new Date('2024-12-04T10:00:00Z') },
    ];

    const sla = calculateSLATracking('case-123', received, 'MILLING', 'STANDARD', history);

    expect(sla.percentComplete).toBe(50); // 3 of 6 milestones
  });

  it('should calculate days remaining', () => {
    const received = new Date('2024-12-08T10:00:00Z');
    const history: { status: string; changedAt: Date }[] = [];

    const sla = calculateSLATracking('case-123', received, 'IN_DESIGN', 'STANDARD', history);

    expect(sla.daysRemaining).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// DAILY SUMMARY TESTS
// ============================================================================

describe('generateClinicDailySummary', () => {
  it('should generate summary with counts', () => {
    const cases = [
      {
        caseNumber: 'CASE-001',
        patientName: 'John Doe',
        status: 'DESIGN_REVIEW',
        slaStatus: 'ON_TRACK' as const,
        dueDate: new Date(),
        pendingAction: 'Review design',
      },
      {
        caseNumber: 'CASE-002',
        patientName: 'Jane Smith',
        status: 'MILLING',
        slaStatus: 'AT_RISK' as const,
        dueDate: new Date(),
      },
    ];

    const result = generateClinicDailySummary(cases);

    expect(result.actionRequired).toBe(1);
    expect(result.atRisk).toBe(1);
    expect(result.overdue).toBe(0);
    expect(result.casesReadyForReview).toContain('CASE-001');
  });

  it('should identify cases ready for pickup', () => {
    const cases = [
      {
        caseNumber: 'CASE-001',
        patientName: 'John Doe',
        status: 'READY_FOR_PICKUP',
        slaStatus: 'ON_TRACK' as const,
        dueDate: new Date(),
      },
    ];

    const result = generateClinicDailySummary(cases);

    expect(result.casesReadyForPickup).toContain('CASE-001');
  });

  it('should warn about overdue cases', () => {
    const cases = [
      {
        caseNumber: 'CASE-001',
        patientName: 'John Doe',
        status: 'IN_DESIGN',
        slaStatus: 'OVERDUE' as const,
        dueDate: new Date(),
      },
    ];

    const result = generateClinicDailySummary(cases);

    expect(result.overdue).toBe(1);
    expect(result.summary).toContain('ATTENTION');
    expect(result.summary).toContain('overdue');
  });

  it('should show all clear message when no issues', () => {
    const cases = [
      {
        caseNumber: 'CASE-001',
        patientName: 'John Doe',
        status: 'MILLING',
        slaStatus: 'ON_TRACK' as const,
        dueDate: new Date(),
      },
    ];

    const result = generateClinicDailySummary(cases);

    expect(result.summary).toContain('on track');
  });

  it('should handle empty case list', () => {
    const result = generateClinicDailySummary([]);

    expect(result.actionRequired).toBe(0);
    expect(result.casesReadyForReview).toHaveLength(0);
    expect(result.summary).toContain('Total Active Cases: 0');
  });
});

// ============================================================================
// LAB PERFORMANCE METRICS TESTS
// ============================================================================

describe('calculateLabPerformanceMetrics', () => {
  it('should calculate metrics for completed cases', () => {
    const cases = [
      createCompletedCase({ revisionCount: 0, qcPassedFirstTime: true }),
      createCompletedCase({ caseNumber: 'CASE-002', revisionCount: 1, qcPassedFirstTime: false }),
    ];

    const result = calculateLabPerformanceMetrics(cases);

    expect(result.onTimeDeliveryRate).toBe(100); // Both on time
    expect(result.avgTurnaroundDays).toBe(9); // 10 - 1 = 9 days each
    expect(result.firstTimeQCPassRate).toBe(50); // 1 of 2
    expect(result.avgRevisions).toBe(0.5); // (0 + 1) / 2
  });

  it('should handle empty case list', () => {
    const result = calculateLabPerformanceMetrics([]);

    expect(result.onTimeDeliveryRate).toBe(100);
    expect(result.avgTurnaroundDays).toBe(0);
    expect(result.recommendations.some((r) => r.includes('Insufficient data'))).toBe(true);
  });

  it('should calculate patient satisfaction', () => {
    const cases = [
      createCompletedCase({ patientSatisfaction: 9 }),
      createCompletedCase({ patientSatisfaction: 8 }),
      createCompletedCase({ patientSatisfaction: undefined }),
    ];

    const result = calculateLabPerformanceMetrics(cases);

    expect(result.avgPatientSatisfaction).toBe(8.5);
  });

  it('should detect late deliveries', () => {
    const cases = [
      createCompletedCase({
        completionDate: new Date('2024-11-15'), // After expected
        expectedCompletionDate: new Date('2024-11-10'),
      }),
    ];

    const result = calculateLabPerformanceMetrics(cases);

    expect(result.onTimeDeliveryRate).toBe(0);
  });

  it('should generate recommendations for poor performance', () => {
    const cases = [
      createCompletedCase({
        completionDate: new Date('2024-11-20'),
        expectedCompletionDate: new Date('2024-11-10'),
        qcPassedFirstTime: false,
        revisionCount: 3,
      }),
    ];

    const result = calculateLabPerformanceMetrics(cases);

    expect(result.recommendations.some((r) => r.includes('workflow'))).toBe(true);
    expect(result.recommendations.some((r) => r.includes('QC'))).toBe(true);
    expect(result.recommendations.some((r) => r.includes('revision'))).toBe(true);
  });

  it('should generate positive recommendation for excellent performance', () => {
    const cases = [
      createCompletedCase({ qcPassedFirstTime: true, revisionCount: 0, patientSatisfaction: 10 }),
      createCompletedCase({ qcPassedFirstTime: true, revisionCount: 0, patientSatisfaction: 9 }),
    ];

    const result = calculateLabPerformanceMetrics(cases);

    expect(result.recommendations.some((r) => r.includes('Excellent'))).toBe(true);
  });

  it('should determine performance trend', () => {
    const goodCases = [
      createCompletedCase({ qcPassedFirstTime: true }),
      createCompletedCase({ qcPassedFirstTime: true }),
    ];

    const result = calculateLabPerformanceMetrics(goodCases);

    expect(['IMPROVING', 'STABLE', 'DECLINING']).toContain(result.performanceTrend);
  });
});
