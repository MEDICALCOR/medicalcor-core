/**
 * @fileoverview Lab SLA Monitoring Service
 *
 * Specialized service for monitoring SLA compliance across all lab cases.
 * Designed to run as a scheduled job via Trigger.dev for proactive alerting.
 *
 * @module application/use-cases/dental-lab/LabSLAMonitoringService
 *
 * ## Features
 *
 * - Real-time SLA status tracking
 * - Automatic escalation on breaches
 * - Performance metrics aggregation
 * - Predictive SLA risk analysis
 * - Multi-channel notification dispatch
 */

import { createLogger } from '@medicalcor/core';
import type {
  LabCase,
  LabCaseStatus,
  LabSLATracking,
  LabCasePriority,
  LabEvent,
} from '@medicalcor/types';

import type {
  ILabCaseRepository,
  SLAStatus,
} from '../../ports/secondary/persistence/LabCaseRepository.js';

import type { IEventPublisher } from '../../ports/secondary/messaging/EventPublisher.js';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger({ name: 'LabSLAMonitoringService' });

// =============================================================================
// TYPES
// =============================================================================

/**
 * SLA breach severity levels
 */
export type SLABreachSeverity = 'WARNING' | 'CRITICAL' | 'ESCALATED';

/**
 * SLA breach record
 */
export interface SLABreach {
  id: string;
  labCaseId: string;
  caseNumber: string;
  clinicId: string;
  severity: SLABreachSeverity;
  breachType: 'MILESTONE_OVERDUE' | 'OVERALL_DEADLINE_AT_RISK' | 'OVERALL_DEADLINE_BREACHED';
  milestoneName?: string;
  expectedDeadline: Date;
  actualDeadline?: Date;
  hoursOverdue: number;
  detectedAt: Date;
  escalatedAt?: Date;
  resolvedAt?: Date;
  notificationsSent: string[];
}

/**
 * SLA health report for a clinic
 */
export interface SLAHealthReport {
  clinicId: string;
  reportDate: Date;
  totalActiveCases: number;
  slaDistribution: {
    onTrack: number;
    atRisk: number;
    overdue: number;
  };
  breachesByPriority: {
    STAT: number;
    RUSH: number;
    STANDARD: number;
    FLEXIBLE: number;
  };
  averageMilestoneCompletionRate: number;
  projectedBreachesNext24h: number;
  projectedBreachesNext48h: number;
  recommendations: SLARecommendation[];
}

/**
 * SLA improvement recommendation
 */
export interface SLARecommendation {
  type: 'CAPACITY' | 'PROCESS' | 'STAFFING' | 'PRIORITIZATION';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  description: string;
  affectedCaseCount: number;
  estimatedImpact: string;
}

/**
 * SLA monitoring configuration
 */
export interface SLAMonitoringConfig {
  /** Hours before deadline to trigger WARNING */
  warningThresholdHours: number;
  /** Hours after deadline to escalate to CRITICAL */
  criticalThresholdHours: number;
  /** Hours after CRITICAL to trigger ESCALATED */
  escalationThresholdHours: number;
  /** Enable automatic notifications */
  notificationsEnabled: boolean;
  /** Enable automatic escalation */
  autoEscalationEnabled: boolean;
  /** Check interval in minutes (for Trigger.dev scheduling) */
  checkIntervalMinutes: number;
}

const DEFAULT_CONFIG: SLAMonitoringConfig = {
  warningThresholdHours: 4,
  criticalThresholdHours: 2,
  escalationThresholdHours: 8,
  notificationsEnabled: true,
  autoEscalationEnabled: true,
  checkIntervalMinutes: 15,
};

/**
 * Notification targets for SLA alerts
 */
export interface NotificationTargets {
  labManagers: string[];
  clinicContacts: string[];
  assignedTechnicians: string[];
}

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Lab SLA Monitoring Service
 *
 * Monitors SLA compliance and triggers alerts/escalations as needed.
 * Designed to work with Trigger.dev scheduled jobs.
 */
export class LabSLAMonitoringService {
  private readonly config: SLAMonitoringConfig;

  constructor(
    private readonly labCaseRepository: ILabCaseRepository,
    private readonly eventPublisher: IEventPublisher,
    config?: Partial<SLAMonitoringConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // MAIN MONITORING OPERATIONS
  // ===========================================================================

  /**
   * Run full SLA check across all active cases for a clinic
   * This is the main entry point for scheduled monitoring
   */
  async runSLACheck(clinicId: string): Promise<{
    checked: number;
    breachesDetected: SLABreach[];
    notificationsSent: number;
  }> {
    logger.info({ clinicId }, 'Starting SLA check');

    const breachesDetected: SLABreach[] = [];
    let notificationsSent = 0;

    // Get all active cases with SLA tracking
    const activeCases = await this.labCaseRepository.list(
      { clinicId, statuses: this.getActiveStatuses() },
      { page: 1, pageSize: 1000, sortBy: 'dueDate', sortOrder: 'asc' }
    );

    for (const labCase of activeCases.data) {
      const slaTracking = await this.labCaseRepository.getSLATracking(labCase.id);
      if (!slaTracking) continue;

      const breach = this.detectBreach(labCase, slaTracking);
      if (breach) {
        breachesDetected.push(breach);

        // Send notifications based on severity
        if (this.config.notificationsEnabled) {
          const sent = await this.sendBreachNotifications(breach, labCase);
          notificationsSent += sent;
        }

        // Auto-escalate if enabled
        if (this.config.autoEscalationEnabled && breach.severity === 'CRITICAL') {
          await this.escalateBreach(breach, labCase);
        }
      }
    }

    logger.info(
      { clinicId, checked: activeCases.data.length, breaches: breachesDetected.length },
      'SLA check completed'
    );

    return {
      checked: activeCases.data.length,
      breachesDetected,
      notificationsSent,
    };
  }

  /**
   * Check SLA status for a single case
   */
  async checkCaseSLA(labCaseId: string): Promise<{
    labCase: LabCase;
    slaTracking: LabSLATracking;
    status: SLAStatus;
    breach?: SLABreach;
    hoursUntilDeadline: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }> {
    const labCase = await this.labCaseRepository.findById(labCaseId);
    if (!labCase) {
      throw new Error(`Lab case not found: ${labCaseId}`);
    }

    const slaTracking = await this.labCaseRepository.getSLATracking(labCaseId);
    if (!slaTracking) {
      throw new Error(`SLA tracking not found for case: ${labCaseId}`);
    }

    const hoursUntilDeadline = this.calculateHoursUntilDeadline(labCase.dueDate);
    const status = this.determineSLAStatus(labCase, slaTracking);
    const riskLevel = this.calculateRiskLevel(labCase, slaTracking, hoursUntilDeadline);
    const breach = this.detectBreach(labCase, slaTracking);

    return {
      labCase,
      slaTracking,
      status,
      breach: breach ?? undefined,
      hoursUntilDeadline,
      riskLevel,
    };
  }

  /**
   * Get projected breaches for a time window
   */
  async getProjectedBreaches(
    clinicId: string,
    hoursAhead: number
  ): Promise<Array<{
    labCase: LabCase;
    projectedBreachTime: Date;
    currentProgress: number;
    requiredProgress: number;
    riskFactors: string[];
  }>> {
    const upcomingDeadlines = await this.labCaseRepository.getUpcomingSLADeadlines(
      clinicId,
      hoursAhead
    );

    const projections: Array<{
      labCase: LabCase;
      projectedBreachTime: Date;
      currentProgress: number;
      requiredProgress: number;
      riskFactors: string[];
    }> = [];

    for (const { labCase, deadline, milestone } of upcomingDeadlines) {
      const slaTracking = await this.labCaseRepository.getSLATracking(labCase.id);
      if (!slaTracking) continue;

      const currentProgress = slaTracking.percentComplete;
      const requiredProgress = this.calculateRequiredProgress(labCase, deadline);
      const riskFactors = this.identifyRiskFactors(labCase, slaTracking);

      if (currentProgress < requiredProgress && riskFactors.length > 0) {
        projections.push({
          labCase,
          projectedBreachTime: deadline,
          currentProgress,
          requiredProgress,
          riskFactors,
        });
      }
    }

    return projections;
  }

  // ===========================================================================
  // HEALTH REPORTING
  // ===========================================================================

  /**
   * Generate comprehensive SLA health report for a clinic
   */
  async generateHealthReport(clinicId: string): Promise<SLAHealthReport> {
    const activeCases = await this.labCaseRepository.list(
      { clinicId, statuses: this.getActiveStatuses() },
      { page: 1, pageSize: 1000, sortBy: 'dueDate', sortOrder: 'asc' }
    );

    const slaDistribution = { onTrack: 0, atRisk: 0, overdue: 0 };
    const breachesByPriority: Record<LabCasePriority, number> = {
      STAT: 0,
      RUSH: 0,
      STANDARD: 0,
      FLEXIBLE: 0,
    };

    let totalCompletionRate = 0;
    let caseCount = 0;

    for (const labCase of activeCases.data) {
      const slaTracking = await this.labCaseRepository.getSLATracking(labCase.id);
      if (!slaTracking) continue;

      // Count by status
      switch (slaTracking.overallStatus) {
        case 'ON_TRACK':
          slaDistribution.onTrack++;
          break;
        case 'AT_RISK':
          slaDistribution.atRisk++;
          breachesByPriority[labCase.priority]++;
          break;
        case 'OVERDUE':
          slaDistribution.overdue++;
          breachesByPriority[labCase.priority]++;
          break;
      }

      totalCompletionRate += slaTracking.percentComplete;
      caseCount++;
    }

    const projections24h = await this.getProjectedBreaches(clinicId, 24);
    const projections48h = await this.getProjectedBreaches(clinicId, 48);

    const recommendations = await this.generateRecommendations(
      clinicId,
      slaDistribution,
      activeCases.data
    );

    return {
      clinicId,
      reportDate: new Date(),
      totalActiveCases: activeCases.total,
      slaDistribution,
      breachesByPriority,
      averageMilestoneCompletionRate: caseCount > 0 ? totalCompletionRate / caseCount : 0,
      projectedBreachesNext24h: projections24h.length,
      projectedBreachesNext48h: projections48h.length,
      recommendations,
    };
  }

  // ===========================================================================
  // ESCALATION MANAGEMENT
  // ===========================================================================

  /**
   * Escalate an SLA breach to management
   */
  async escalateBreach(breach: SLABreach, labCase: LabCase): Promise<void> {
    logger.warn(
      { labCaseId: breach.labCaseId, caseNumber: breach.caseNumber, severity: breach.severity },
      'Escalating SLA breach'
    );

    breach.escalatedAt = new Date();
    breach.severity = 'ESCALATED';

    const event: LabEvent = {
      eventType: 'SLA_BREACH_ESCALATED',
      labCaseId: breach.labCaseId,
      caseNumber: breach.caseNumber,
      clinicId: labCase.clinicId,
      patientId: labCase.patientId,
      breachSeverity: 'ESCALATED',
      hoursOverdue: breach.hoursOverdue,
      escalatedAt: breach.escalatedAt,
    };

    await this.eventPublisher.publish('lab.sla.escalated', event);
  }

  /**
   * Manually resolve an SLA breach (when case is back on track)
   */
  async resolveBreach(breachId: string, resolvedBy: string): Promise<void> {
    logger.info({ breachId, resolvedBy }, 'SLA breach resolved');

    // In a full implementation, this would update the breach record in the database
    await this.eventPublisher.publish('lab.sla.resolved', {
      eventType: 'SLA_BREACH_RESOLVED',
      breachId,
      resolvedBy,
      resolvedAt: new Date(),
    });
  }

  // ===========================================================================
  // NOTIFICATION DISPATCH
  // ===========================================================================

  /**
   * Send notifications for an SLA breach
   */
  private async sendBreachNotifications(breach: SLABreach, labCase: LabCase): Promise<number> {
    let notificationsSent = 0;

    const targets = await this.getNotificationTargets(labCase);
    const channel = this.getNotificationChannel(breach.severity);

    // Always notify lab managers for CRITICAL and ESCALATED
    if (breach.severity !== 'WARNING') {
      for (const managerId of targets.labManagers) {
        await this.sendNotification(managerId, breach, labCase, channel);
        breach.notificationsSent.push(`lab_manager:${managerId}`);
        notificationsSent++;
      }
    }

    // Notify assigned technicians
    for (const technicianId of targets.assignedTechnicians) {
      await this.sendNotification(technicianId, breach, labCase, channel);
      breach.notificationsSent.push(`technician:${technicianId}`);
      notificationsSent++;
    }

    // Notify clinic contacts for ESCALATED
    if (breach.severity === 'ESCALATED') {
      for (const contactId of targets.clinicContacts) {
        await this.sendNotification(contactId, breach, labCase, channel);
        breach.notificationsSent.push(`clinic:${contactId}`);
        notificationsSent++;
      }
    }

    return notificationsSent;
  }

  private async sendNotification(
    userId: string,
    breach: SLABreach,
    labCase: LabCase,
    channel: 'PUSH' | 'SMS' | 'EMAIL'
  ): Promise<void> {
    const event: LabEvent = {
      eventType: 'SLA_NOTIFICATION',
      labCaseId: breach.labCaseId,
      caseNumber: breach.caseNumber,
      clinicId: labCase.clinicId,
      userId,
      channel,
      severity: breach.severity,
      breachType: breach.breachType,
      hoursOverdue: breach.hoursOverdue,
    };

    await this.eventPublisher.publish('lab.notification.sla', event);
  }

  private async getNotificationTargets(labCase: LabCase): Promise<NotificationTargets> {
    // In a full implementation, this would look up actual users
    return {
      labManagers: [], // Would query lab_notification_preferences
      clinicContacts: [], // Would query clinic contacts
      assignedTechnicians: labCase.assignedTechnician ? [labCase.assignedTechnician] : [],
    };
  }

  private getNotificationChannel(severity: SLABreachSeverity): 'PUSH' | 'SMS' | 'EMAIL' {
    switch (severity) {
      case 'ESCALATED':
        return 'SMS'; // Urgent - use SMS
      case 'CRITICAL':
        return 'PUSH'; // Important - push notification
      case 'WARNING':
        return 'EMAIL'; // Informational - email is sufficient
    }
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private detectBreach(labCase: LabCase, slaTracking: LabSLATracking): SLABreach | null {
    const hoursUntilDeadline = this.calculateHoursUntilDeadline(labCase.dueDate);

    // Check overall deadline
    if (hoursUntilDeadline < 0) {
      return {
        id: crypto.randomUUID(),
        labCaseId: labCase.id,
        caseNumber: labCase.caseNumber,
        clinicId: labCase.clinicId,
        severity: this.getSeverityFromHours(hoursUntilDeadline),
        breachType: 'OVERALL_DEADLINE_BREACHED',
        expectedDeadline: labCase.dueDate,
        hoursOverdue: Math.abs(hoursUntilDeadline),
        detectedAt: new Date(),
        notificationsSent: [],
      };
    }

    // Check if at risk
    if (hoursUntilDeadline <= this.config.warningThresholdHours) {
      return {
        id: crypto.randomUUID(),
        labCaseId: labCase.id,
        caseNumber: labCase.caseNumber,
        clinicId: labCase.clinicId,
        severity: hoursUntilDeadline <= this.config.criticalThresholdHours ? 'CRITICAL' : 'WARNING',
        breachType: 'OVERALL_DEADLINE_AT_RISK',
        expectedDeadline: labCase.dueDate,
        hoursOverdue: 0,
        detectedAt: new Date(),
        notificationsSent: [],
      };
    }

    // Check individual milestones
    for (const milestone of slaTracking.milestones) {
      if (milestone.status === 'COMPLETED') continue;

      const milestoneHours = this.calculateHoursUntilDeadline(milestone.expectedBy);
      if (milestoneHours < 0) {
        return {
          id: crypto.randomUUID(),
          labCaseId: labCase.id,
          caseNumber: labCase.caseNumber,
          clinicId: labCase.clinicId,
          severity: this.getSeverityFromHours(milestoneHours),
          breachType: 'MILESTONE_OVERDUE',
          milestoneName: milestone.name,
          expectedDeadline: milestone.expectedBy,
          hoursOverdue: Math.abs(milestoneHours),
          detectedAt: new Date(),
          notificationsSent: [],
        };
      }
    }

    return null;
  }

  private getSeverityFromHours(hoursOverdue: number): SLABreachSeverity {
    const absHours = Math.abs(hoursOverdue);
    if (absHours >= this.config.escalationThresholdHours) return 'ESCALATED';
    if (absHours >= this.config.criticalThresholdHours) return 'CRITICAL';
    return 'WARNING';
  }

  private determineSLAStatus(labCase: LabCase, slaTracking: LabSLATracking): SLAStatus {
    const hoursUntilDeadline = this.calculateHoursUntilDeadline(labCase.dueDate);

    if (hoursUntilDeadline < 0) return 'OVERDUE';
    if (hoursUntilDeadline <= this.config.warningThresholdHours) return 'AT_RISK';
    return 'ON_TRACK';
  }

  private calculateRiskLevel(
    labCase: LabCase,
    slaTracking: LabSLATracking,
    hoursUntilDeadline: number
  ): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (hoursUntilDeadline < 0) return 'CRITICAL';

    const progressGap = this.calculateRequiredProgress(labCase, labCase.dueDate) - slaTracking.percentComplete;

    if (progressGap > 30 || hoursUntilDeadline < this.config.criticalThresholdHours) return 'HIGH';
    if (progressGap > 15 || hoursUntilDeadline < this.config.warningThresholdHours) return 'MEDIUM';
    return 'LOW';
  }

  private calculateHoursUntilDeadline(deadline: Date): number {
    return (deadline.getTime() - Date.now()) / (1000 * 60 * 60);
  }

  private calculateRequiredProgress(labCase: LabCase, deadline: Date): number {
    const totalTime = deadline.getTime() - labCase.receivedAt.getTime();
    const elapsedTime = Date.now() - labCase.receivedAt.getTime();
    return Math.min(100, Math.round((elapsedTime / totalTime) * 100));
  }

  private identifyRiskFactors(labCase: LabCase, slaTracking: LabSLATracking): string[] {
    const risks: string[] = [];

    // Check for stalled progress
    const statusAge = this.getStatusAgeHours(labCase);
    if (statusAge > 8) {
      risks.push('Case has been in current status for extended period');
    }

    // Check priority vs progress
    if (labCase.priority === 'STAT' && slaTracking.percentComplete < 50) {
      risks.push('High-priority case with low progress');
    }

    // Check for missing assignments
    if (!labCase.assignedTechnician && this.requiresTechnician(labCase.status)) {
      risks.push('No technician assigned');
    }

    if (!labCase.assignedDesigner && this.requiresDesigner(labCase.status)) {
      risks.push('No designer assigned');
    }

    // Check for overdue milestones
    const overdueMilestones = slaTracking.milestones.filter(
      (m) => m.status !== 'COMPLETED' && m.expectedBy < new Date()
    );
    if (overdueMilestones.length > 0) {
      risks.push(`${overdueMilestones.length} milestone(s) overdue`);
    }

    return risks;
  }

  private getStatusAgeHours(labCase: LabCase): number {
    // This would need the status history to be accurate
    // For now, use the last updated timestamp
    return (Date.now() - labCase.updatedAt.getTime()) / (1000 * 60 * 60);
  }

  private requiresTechnician(status: LabCaseStatus): boolean {
    const technicianStatuses: LabCaseStatus[] = [
      'QUEUED_FOR_MILLING',
      'MILLING',
      'POST_PROCESSING',
      'FINISHING',
      'QC_INSPECTION',
      'ADJUSTMENT_IN_PROGRESS',
    ];
    return technicianStatuses.includes(status);
  }

  private requiresDesigner(status: LabCaseStatus): boolean {
    const designerStatuses: LabCaseStatus[] = ['SCAN_RECEIVED', 'IN_DESIGN', 'DESIGN_REVISION'];
    return designerStatuses.includes(status);
  }

  private getActiveStatuses(): LabCaseStatus[] {
    return [
      'RECEIVED',
      'PENDING_SCAN',
      'SCAN_RECEIVED',
      'IN_DESIGN',
      'DESIGN_REVIEW',
      'DESIGN_APPROVED',
      'DESIGN_REVISION',
      'QUEUED_FOR_MILLING',
      'MILLING',
      'POST_PROCESSING',
      'FINISHING',
      'QC_INSPECTION',
      'QC_FAILED',
      'QC_PASSED',
      'READY_FOR_PICKUP',
      'IN_TRANSIT',
      'TRY_IN_SCHEDULED',
      'ADJUSTMENT_REQUIRED',
      'ADJUSTMENT_IN_PROGRESS',
    ];
  }

  private async generateRecommendations(
    clinicId: string,
    slaDistribution: { onTrack: number; atRisk: number; overdue: number },
    activeCases: LabCase[]
  ): Promise<SLARecommendation[]> {
    const recommendations: SLARecommendation[] = [];

    // High overdue rate recommendation
    const overdueRate = slaDistribution.overdue / (slaDistribution.onTrack + slaDistribution.atRisk + slaDistribution.overdue);
    if (overdueRate > 0.1) {
      recommendations.push({
        type: 'CAPACITY',
        priority: 'HIGH',
        title: 'High Overdue Rate Detected',
        description: `${Math.round(overdueRate * 100)}% of cases are overdue. Consider adding capacity or reviewing workload distribution.`,
        affectedCaseCount: slaDistribution.overdue,
        estimatedImpact: 'Reducing overdue rate to <5% would improve clinic satisfaction significantly',
      });
    }

    // Unassigned cases recommendation
    const unassignedCases = activeCases.filter(
      (c) => !c.assignedTechnician && this.requiresTechnician(c.status)
    );
    if (unassignedCases.length > 3) {
      recommendations.push({
        type: 'STAFFING',
        priority: 'MEDIUM',
        title: 'Multiple Unassigned Cases',
        description: `${unassignedCases.length} cases require technician assignment but none assigned.`,
        affectedCaseCount: unassignedCases.length,
        estimatedImpact: 'Assigning technicians can reduce turnaround time by 20-30%',
      });
    }

    // High priority case bottleneck
    const statCases = activeCases.filter((c) => c.priority === 'STAT');
    const statAtRisk = statCases.filter(async (c) => {
      const sla = await this.labCaseRepository.getSLATracking(c.id);
      return sla?.overallStatus !== 'ON_TRACK';
    });
    if (statAtRisk.length > 0) {
      recommendations.push({
        type: 'PRIORITIZATION',
        priority: 'HIGH',
        title: 'STAT Cases At Risk',
        description: `${statAtRisk.length} STAT priority cases are not on track.`,
        affectedCaseCount: statAtRisk.length,
        estimatedImpact: 'STAT cases should be prioritized to maintain clinic relationships',
      });
    }

    return recommendations;
  }
}
