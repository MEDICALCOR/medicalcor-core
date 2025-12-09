/**
 * @fileoverview Clinic-Lab Collaboration Service
 *
 * Real-time collaboration hub between dental clinics and laboratories.
 * Eliminates communication gaps, tracks case status, and ensures
 * everyone stays aligned throughout the prosthetic workflow.
 *
 * This solves the #1 pain point in dentistry: "Where's my case?"
 *
 * @module domain/treatment-journey/services/ClinicLabCollaborationService
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Collaboration message between clinic and lab
 */
export interface CollaborationMessage {
  readonly id: string;
  readonly threadId: string;
  readonly labCaseId: string;

  readonly sender: {
    readonly id: string;
    readonly name: string;
    readonly role: 'CLINICIAN' | 'LAB_TECHNICIAN' | 'LAB_DESIGNER' | 'QC_INSPECTOR' | 'COORDINATOR';
    readonly organization: 'CLINIC' | 'LAB';
  };

  readonly content: string;
  readonly messageType:
    | 'TEXT'
    | 'DESIGN_FEEDBACK'
    | 'APPROVAL_REQUEST'
    | 'REVISION_REQUEST'
    | 'QUESTION'
    | 'URGENT'
    | 'STATUS_UPDATE';

  readonly attachments: readonly MessageAttachment[];
  readonly references: readonly {
    readonly type: 'DESIGN' | 'SCAN' | 'PHOTO' | 'DOCUMENT';
    readonly id: string;
    readonly description: string;
  }[];

  readonly readBy: readonly { userId: string; readAt: Date }[];
  readonly createdAt: Date;
}

export interface MessageAttachment {
  readonly id: string;
  readonly filename: string;
  readonly fileType: 'IMAGE' | 'STL' | 'PLY' | 'PDF' | 'DICOM' | 'VIDEO';
  readonly fileSize: number;
  readonly url: string;
  readonly thumbnailUrl?: string;
}

/**
 * Design feedback from clinician
 */
export interface DesignFeedback {
  readonly id: string;
  readonly labCaseId: string;
  readonly designId: string;

  readonly feedbackType: 'APPROVAL' | 'MINOR_REVISION' | 'MAJOR_REVISION' | 'REJECTION';
  readonly overallRating: 1 | 2 | 3 | 4 | 5;

  readonly criteriaScores: readonly {
    readonly criterion:
      | 'MARGINAL_FIT'
      | 'OCCLUSION'
      | 'CONTACTS'
      | 'AESTHETICS'
      | 'CONTOUR'
      | 'EMERGENCE';
    readonly score: 1 | 2 | 3 | 4 | 5;
    readonly notes?: string;
  }[];

  readonly annotations: readonly DesignAnnotation[];
  readonly generalNotes: string;

  readonly reviewedBy: string;
  readonly reviewedAt: Date;
  readonly responseDeadline?: Date;
}

export interface DesignAnnotation {
  readonly id: string;
  readonly type: 'ARROW' | 'CIRCLE' | 'RECTANGLE' | 'FREEFORM' | 'TEXT';
  readonly coordinates: { x: number; y: number; z?: number };
  readonly description: string;
  readonly priority: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly resolved: boolean;
}

/**
 * Real-time case status
 */
export interface CaseStatusUpdate {
  readonly labCaseId: string;
  readonly previousStatus: string;
  readonly newStatus: string;
  readonly changedBy: string;
  readonly changedAt: Date;
  readonly estimatedCompletion?: Date;
  readonly notes?: string;
  readonly autoNotify: readonly ('CLINICIAN' | 'PATIENT' | 'COORDINATOR')[];
}

/**
 * Notification preferences
 */
export interface NotificationPreferences {
  readonly userId: string;
  readonly channels: {
    readonly email: boolean;
    readonly sms: boolean;
    readonly whatsapp: boolean;
    readonly inApp: boolean;
    readonly push: boolean;
  };
  readonly triggers: {
    readonly statusChange: boolean;
    readonly designReady: boolean;
    readonly revisionRequested: boolean;
    readonly qcComplete: boolean;
    readonly readyForPickup: boolean;
    readonly urgentMessage: boolean;
    readonly deliveryUpdate: boolean;
  };
  readonly quietHours?: { start: string; end: string };
}

/**
 * Collaboration thread
 */
export interface CollaborationThread {
  readonly id: string;
  readonly labCaseId: string;
  readonly subject: string;
  readonly status: 'OPEN' | 'PENDING_RESPONSE' | 'RESOLVED' | 'ESCALATED';
  readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  readonly participants: readonly {
    readonly userId: string;
    readonly role: CollaborationMessage['sender']['role'];
    readonly organization: 'CLINIC' | 'LAB';
    readonly lastSeen?: Date;
  }[];

  readonly messages: readonly CollaborationMessage[];
  readonly unreadCount: Record<string, number>; // userId -> unread count

  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly resolvedAt?: Date;
}

/**
 * SLA tracking for clinic-lab turnaround
 */
export interface LabSLATracking {
  readonly labCaseId: string;
  readonly slaType: 'STANDARD' | 'RUSH' | 'EMERGENCY';

  readonly milestones: readonly {
    readonly name: string;
    readonly expectedBy: Date;
    readonly completedAt?: Date;
    readonly status: 'PENDING' | 'ON_TRACK' | 'AT_RISK' | 'OVERDUE' | 'COMPLETED';
  }[];

  readonly overallStatus: 'ON_TRACK' | 'AT_RISK' | 'OVERDUE';
  readonly daysRemaining: number;
  readonly percentComplete: number;
}

// ============================================================================
// COLLABORATION SERVICE
// ============================================================================

/**
 * Creates a new collaboration thread for a lab case
 */
export function createCollaborationThread(
  labCaseId: string,
  subject: string,
  initiator: CollaborationMessage['sender'],
  initialMessage: string,
  priority: CollaborationThread['priority'] = 'NORMAL'
): CollaborationThread {
  const now = new Date();
  const threadId = crypto.randomUUID();

  const message: CollaborationMessage = {
    id: crypto.randomUUID(),
    threadId,
    labCaseId,
    sender: initiator,
    content: initialMessage,
    messageType: 'TEXT',
    attachments: [],
    references: [],
    readBy: [{ userId: initiator.id, readAt: now }],
    createdAt: now,
  };

  return {
    id: threadId,
    labCaseId,
    subject,
    status: 'OPEN',
    priority,
    participants: [
      {
        userId: initiator.id,
        role: initiator.role,
        organization: initiator.organization,
        lastSeen: now,
      },
    ],
    messages: [message],
    unreadCount: {},
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Adds a message to a collaboration thread
 */
export function addMessageToThread(
  thread: CollaborationThread,
  sender: CollaborationMessage['sender'],
  content: string,
  options?: {
    messageType?: CollaborationMessage['messageType'];
    attachments?: readonly MessageAttachment[];
    references?: CollaborationMessage['references'];
  }
): CollaborationThread {
  const now = new Date();

  const message: CollaborationMessage = {
    id: crypto.randomUUID(),
    threadId: thread.id,
    labCaseId: thread.labCaseId,
    sender,
    content,
    messageType: options?.messageType ?? 'TEXT',
    attachments: options?.attachments ?? [],
    references: options?.references ?? [],
    readBy: [{ userId: sender.id, readAt: now }],
    createdAt: now,
  };

  // Update unread counts for all participants except sender
  const newUnreadCount = { ...thread.unreadCount };
  for (const participant of thread.participants) {
    if (participant.userId !== sender.id) {
      newUnreadCount[participant.userId] = (newUnreadCount[participant.userId] ?? 0) + 1;
    }
  }

  // Add sender to participants if not already present
  const participantExists = thread.participants.some((p) => p.userId === sender.id);
  const updatedParticipants = participantExists
    ? thread.participants.map((p) => (p.userId === sender.id ? { ...p, lastSeen: now } : p))
    : [
        ...thread.participants,
        {
          userId: sender.id,
          role: sender.role,
          organization: sender.organization,
          lastSeen: now,
        },
      ];

  return {
    ...thread,
    messages: [...thread.messages, message],
    participants: updatedParticipants,
    unreadCount: newUnreadCount,
    status: sender.organization === 'LAB' ? 'PENDING_RESPONSE' : 'OPEN',
    updatedAt: now,
  };
}

/**
 * Creates design feedback from clinician
 */
export function createDesignFeedback(
  labCaseId: string,
  designId: string,
  reviewedBy: string,
  feedbackType: DesignFeedback['feedbackType'],
  criteriaScores: DesignFeedback['criteriaScores'],
  generalNotes: string,
  annotations: readonly DesignAnnotation[] = [],
  responseDeadline?: Date
): DesignFeedback {
  const overallRating = calculateOverallRating(criteriaScores);

  return {
    id: crypto.randomUUID(),
    labCaseId,
    designId,
    feedbackType,
    overallRating,
    criteriaScores,
    annotations,
    generalNotes,
    reviewedBy,
    reviewedAt: new Date(),
    responseDeadline,
  };
}

function calculateOverallRating(scores: DesignFeedback['criteriaScores']): 1 | 2 | 3 | 4 | 5 {
  if (scores.length === 0) return 3;

  const avgScore = scores.reduce((sum, s) => sum + s.score, 0) / scores.length;
  return Math.round(avgScore) as 1 | 2 | 3 | 4 | 5;
}

/**
 * Generates status update notification
 */
export function generateStatusUpdateNotification(
  update: CaseStatusUpdate,
  preferences: NotificationPreferences
): {
  shouldNotify: boolean;
  channels: readonly ('email' | 'sms' | 'whatsapp' | 'inApp' | 'push')[];
  message: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH';
} {
  const channels: ('email' | 'sms' | 'whatsapp' | 'inApp' | 'push')[] = [];

  // Check if status change notifications are enabled
  if (!preferences.triggers.statusChange) {
    return { shouldNotify: false, channels: [], message: '', priority: 'LOW' };
  }

  // Determine channels based on preferences
  if (preferences.channels.email) channels.push('email');
  if (preferences.channels.sms) channels.push('sms');
  if (preferences.channels.whatsapp) channels.push('whatsapp');
  if (preferences.channels.inApp) channels.push('inApp');
  if (preferences.channels.push) channels.push('push');

  // Generate message based on status
  const statusMessages: Record<string, string> = {
    SCAN_RECEIVED: 'Your case scan has been received and is being processed.',
    IN_DESIGN: 'Your case is now in the design phase.',
    DESIGN_REVIEW: 'The design is ready for your review.',
    DESIGN_APPROVED: 'Design approved! Moving to fabrication.',
    MILLING: 'Your prosthetic is being milled.',
    QC_PASSED: 'Quality control passed! Case is being prepared for delivery.',
    READY_FOR_PICKUP: 'Your case is ready for pickup/delivery!',
    DELIVERED: 'Your case has been delivered.',
  };

  const message = statusMessages[update.newStatus] ?? `Case status updated to: ${update.newStatus}`;

  // Determine priority
  let priority: 'LOW' | 'NORMAL' | 'HIGH' = 'NORMAL';
  if (update.newStatus === 'DESIGN_REVIEW' || update.newStatus === 'READY_FOR_PICKUP') {
    priority = 'HIGH';
  }

  return {
    shouldNotify: channels.length > 0,
    channels,
    message,
    priority,
  };
}

/**
 * Calculates SLA tracking for a lab case
 */
export function calculateSLATracking(
  labCaseId: string,
  caseReceivedAt: Date,
  currentStatus: string,
  slaType: LabSLATracking['slaType'],
  statusHistory: readonly { status: string; changedAt: Date }[]
): LabSLATracking {
  // SLA durations in hours
  const slaDurations: Record<LabSLATracking['slaType'], Record<string, number>> = {
    STANDARD: {
      scan_processing: 24,
      design: 72,
      design_review: 24,
      fabrication: 96,
      qc: 8,
      delivery_prep: 8,
    },
    RUSH: {
      scan_processing: 8,
      design: 24,
      design_review: 8,
      fabrication: 48,
      qc: 4,
      delivery_prep: 4,
    },
    EMERGENCY: {
      scan_processing: 4,
      design: 12,
      design_review: 4,
      fabrication: 24,
      qc: 2,
      delivery_prep: 2,
    },
  };

  const durations = slaDurations[slaType];
  const now = new Date();

  // Extract durations with defaults for type safety
  const scanProcessing = durations.scan_processing ?? 24;
  const design = durations.design ?? 72;
  const designReview = durations.design_review ?? 24;
  const fabrication = durations.fabrication ?? 96;
  const qc = durations.qc ?? 8;
  const deliveryPrep = durations.delivery_prep ?? 8;

  // Track cumulative hours for each milestone
  const scanProcessingEnd = scanProcessing;
  const designEnd = scanProcessingEnd + design;
  const designReviewEnd = designEnd + designReview;
  const fabricationEnd = designReviewEnd + fabrication;
  const qcEnd = fabricationEnd + qc;
  const deliveryEnd = qcEnd + deliveryPrep;

  const milestones: LabSLATracking['milestones'][number][] = [
    {
      name: 'Scan Processing',
      expectedBy: addHours(caseReceivedAt, scanProcessingEnd),
      completedAt: findCompletionDate(statusHistory, 'SCAN_RECEIVED'),
      status: determineStatus(
        caseReceivedAt,
        scanProcessingEnd,
        findCompletionDate(statusHistory, 'SCAN_RECEIVED'),
        now
      ),
    },
    {
      name: 'Design',
      expectedBy: addHours(caseReceivedAt, designEnd),
      completedAt: findCompletionDate(statusHistory, 'DESIGN_REVIEW'),
      status: determineStatus(
        caseReceivedAt,
        designEnd,
        findCompletionDate(statusHistory, 'DESIGN_REVIEW'),
        now
      ),
    },
    {
      name: 'Design Review',
      expectedBy: addHours(caseReceivedAt, designReviewEnd),
      completedAt: findCompletionDate(statusHistory, 'DESIGN_APPROVED'),
      status: determineStatus(
        caseReceivedAt,
        designReviewEnd,
        findCompletionDate(statusHistory, 'DESIGN_APPROVED'),
        now
      ),
    },
    {
      name: 'Fabrication',
      expectedBy: addHours(caseReceivedAt, fabricationEnd),
      completedAt: findCompletionDate(statusHistory, 'QC_INSPECTION'),
      status: determineStatus(
        caseReceivedAt,
        fabricationEnd,
        findCompletionDate(statusHistory, 'QC_INSPECTION'),
        now
      ),
    },
    {
      name: 'Quality Control',
      expectedBy: addHours(caseReceivedAt, qcEnd),
      completedAt: findCompletionDate(statusHistory, 'QC_PASSED'),
      status: determineStatus(
        caseReceivedAt,
        qcEnd,
        findCompletionDate(statusHistory, 'QC_PASSED'),
        now
      ),
    },
    {
      name: 'Ready for Delivery',
      expectedBy: addHours(caseReceivedAt, deliveryEnd),
      completedAt: findCompletionDate(statusHistory, 'READY_FOR_PICKUP'),
      status: determineStatus(
        caseReceivedAt,
        deliveryEnd,
        findCompletionDate(statusHistory, 'READY_FOR_PICKUP'),
        now
      ),
    },
  ];

  const completedMilestones = milestones.filter((m) => m.status === 'COMPLETED').length;
  const percentComplete = Math.round((completedMilestones / milestones.length) * 100);

  const hasOverdue = milestones.some((m) => m.status === 'OVERDUE');
  const hasAtRisk = milestones.some((m) => m.status === 'AT_RISK');

  const lastMilestone = milestones[milestones.length - 1];
  const finalExpectedDate = lastMilestone?.expectedBy ?? addHours(caseReceivedAt, deliveryEnd);
  const daysRemaining = Math.max(
    0,
    Math.ceil((finalExpectedDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  );

  return {
    labCaseId,
    slaType,
    milestones,
    overallStatus: hasOverdue ? 'OVERDUE' : hasAtRisk ? 'AT_RISK' : 'ON_TRACK',
    daysRemaining,
    percentComplete,
  };
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function findCompletionDate(
  history: readonly { status: string; changedAt: Date }[],
  targetStatus: string
): Date | undefined {
  const entry = history.find((h) => h.status === targetStatus);
  return entry?.changedAt;
}

function determineStatus(
  baseDate: Date,
  expectedHours: number,
  completedAt: Date | undefined,
  now: Date
): LabSLATracking['milestones'][number]['status'] {
  const expectedBy = addHours(baseDate, expectedHours);

  if (completedAt) {
    return 'COMPLETED';
  }

  const hoursUntilDeadline = (expectedBy.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilDeadline < 0) {
    return 'OVERDUE';
  }

  if (hoursUntilDeadline < 4) {
    return 'AT_RISK';
  }

  return 'ON_TRACK';
}

/**
 * Generates daily case summary for clinician
 */
export function generateClinicDailySummary(
  cases: readonly {
    caseNumber: string;
    patientName: string;
    status: string;
    slaStatus: 'ON_TRACK' | 'AT_RISK' | 'OVERDUE';
    dueDate: Date;
    pendingAction?: string;
  }[]
): {
  summary: string;
  actionRequired: number;
  atRisk: number;
  overdue: number;
  casesReadyForReview: readonly string[];
  casesReadyForPickup: readonly string[];
} {
  const actionRequired = cases.filter((c) => c.pendingAction).length;
  const atRisk = cases.filter((c) => c.slaStatus === 'AT_RISK').length;
  const overdue = cases.filter((c) => c.slaStatus === 'OVERDUE').length;
  const casesReadyForReview = cases
    .filter((c) => c.status === 'DESIGN_REVIEW')
    .map((c) => c.caseNumber);
  const casesReadyForPickup = cases
    .filter((c) => c.status === 'READY_FOR_PICKUP')
    .map((c) => c.caseNumber);

  const summary = `
📊 Daily Lab Cases Summary

Total Active Cases: ${cases.length}
• Action Required: ${actionRequired}
• At Risk: ${atRisk}
• Overdue: ${overdue}

${casesReadyForReview.length > 0 ? `🔍 Ready for Review: ${casesReadyForReview.join(', ')}` : ''}
${casesReadyForPickup.length > 0 ? `📦 Ready for Pickup: ${casesReadyForPickup.join(', ')}` : ''}

${overdue > 0 ? `⚠️ ATTENTION: ${overdue} case(s) are overdue!` : '✅ All cases on track'}
  `.trim();

  return {
    summary,
    actionRequired,
    atRisk,
    overdue,
    casesReadyForReview,
    casesReadyForPickup,
  };
}

/**
 * Generates lab performance metrics
 */
export function calculateLabPerformanceMetrics(
  completedCases: readonly {
    caseNumber: string;
    slaType: LabSLATracking['slaType'];
    startDate: Date;
    completionDate: Date;
    expectedCompletionDate: Date;
    revisionCount: number;
    qcPassedFirstTime: boolean;
    patientSatisfaction?: number;
  }[]
): {
  onTimeDeliveryRate: number;
  avgTurnaroundDays: number;
  firstTimeQCPassRate: number;
  avgRevisions: number;
  avgPatientSatisfaction: number;
  performanceTrend: 'IMPROVING' | 'STABLE' | 'DECLINING';
  recommendations: readonly string[];
} {
  if (completedCases.length === 0) {
    return {
      onTimeDeliveryRate: 100,
      avgTurnaroundDays: 0,
      firstTimeQCPassRate: 100,
      avgRevisions: 0,
      avgPatientSatisfaction: 0,
      performanceTrend: 'STABLE',
      recommendations: ['Insufficient data for meaningful analysis'],
    };
  }

  const onTimeCases = completedCases.filter(
    (c) => c.completionDate <= c.expectedCompletionDate
  ).length;

  const onTimeDeliveryRate = Math.round((onTimeCases / completedCases.length) * 100);

  const totalTurnaroundDays = completedCases.reduce((sum, c) => {
    const days = (c.completionDate.getTime() - c.startDate.getTime()) / (1000 * 60 * 60 * 24);
    return sum + days;
  }, 0);

  const avgTurnaroundDays = Math.round((totalTurnaroundDays / completedCases.length) * 10) / 10;

  const qcPassedFirst = completedCases.filter((c) => c.qcPassedFirstTime).length;
  const firstTimeQCPassRate = Math.round((qcPassedFirst / completedCases.length) * 100);

  const avgRevisions =
    Math.round(
      (completedCases.reduce((sum, c) => sum + c.revisionCount, 0) / completedCases.length) * 10
    ) / 10;

  const casesWithSatisfaction = completedCases.filter((c) => c.patientSatisfaction !== undefined);
  const avgPatientSatisfaction =
    casesWithSatisfaction.length > 0
      ? Math.round(
          (casesWithSatisfaction.reduce((sum, c) => sum + (c.patientSatisfaction ?? 0), 0) /
            casesWithSatisfaction.length) *
            10
        ) / 10
      : 0;

  // Determine trend (simplified - would need historical data)
  const performanceTrend: 'IMPROVING' | 'STABLE' | 'DECLINING' =
    onTimeDeliveryRate >= 95 && firstTimeQCPassRate >= 90
      ? 'STABLE'
      : onTimeDeliveryRate >= 85
        ? 'STABLE'
        : 'DECLINING';

  // Generate recommendations
  const recommendations: string[] = [];

  if (onTimeDeliveryRate < 90) {
    recommendations.push('Review workflow bottlenecks - on-time delivery below target');
  }

  if (firstTimeQCPassRate < 85) {
    recommendations.push('Implement additional design review checkpoints to reduce QC failures');
  }

  if (avgRevisions > 1.5) {
    recommendations.push(
      'Consider improving prescription clarity with clinicians to reduce revisions'
    );
  }

  if (avgPatientSatisfaction > 0 && avgPatientSatisfaction < 8) {
    recommendations.push('Review patient feedback for improvement opportunities');
  }

  if (recommendations.length === 0) {
    recommendations.push('Excellent performance! Maintain current quality standards.');
  }

  return {
    onTimeDeliveryRate,
    avgTurnaroundDays,
    firstTimeQCPassRate,
    avgRevisions,
    avgPatientSatisfaction,
    performanceTrend,
    recommendations,
  };
}
