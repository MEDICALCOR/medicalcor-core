/**
 * @fileoverview Dental Lab Production Service
 *
 * Main application service implementing the dental lab production use case.
 * Orchestrates all lab case operations including digital workflow, QC, and delivery.
 *
 * @module application/use-cases/dental-lab/DentalLabProductionService
 *
 * ## Hexagonal Architecture
 *
 * This service is the APPLICATION LAYER that:
 * - Implements the primary port (IDentalLabProductionUseCase)
 * - Depends on secondary ports (repositories, storage, event publisher)
 * - Contains no business logic (delegates to domain services)
 * - Orchestrates workflows and transaction boundaries
 */

import { createLogger } from '@medicalcor/core';
import type {
  LabCase,
  CreateLabCase,
  UpdateLabCase,
  LabCaseStatus,
  LabCaseQueryFilters,
  LabCasePagination,
  LabCaseListResponse,
  DigitalScan,
  CreateDigitalScan,
  CADDesign,
  CreateCADDesign,
  ApproveDesign,
  FabricationRecord,
  CreateFabricationRecord,
  QCInspection,
  CreateQCInspection,
  TryInRecord,
  CreateTryInRecord,
  StatusHistoryEntry,
  LabSLATracking,
  LabPerformanceMetrics,
  CollaborationThread,
  CreateCollaborationThread,
  CollaborationMessage,
  AddMessageToThread,
  DesignFeedback,
  CreateDesignFeedback,
  LabEvent,
  ScanType,
  DigitalFileFormat,
} from '@medicalcor/types';

import {
  isValidStatusTransition,
  calculateSLADeadline,
  isActiveStatus,
  didQCPass,
} from '@medicalcor/types';

import type {
  IDentalLabProductionUseCase,
  CreateLabCaseResult,
  TransitionStatusResult,
  SubmitDesignResult,
  PerformQCInspectionResult,
  ApproveDesignResult,
  UploadScanResult,
  CaseSummary,
  DailyLabReport,
} from '../../ports/primary/DentalLabProductionUseCase.js';

import type {
  ILabCaseRepository,
  ILabCollaborationRepository,
  LabCaseStats,
  LabCaseDashboard,
  TechnicianWorkload,
} from '../../ports/secondary/persistence/LabCaseRepository.js';

import type {
  IDigitalAssetStoragePort,
  PresignedDownloadUrl,
  AssetMetadata,
  generateStoragePath,
} from '../../ports/secondary/external/DigitalAssetStoragePort.js';

import type { EventPublisher as IEventPublisher, DomainEvent } from '../../ports/secondary/messaging/EventPublisher.js';
import { DomainError, BusinessRuleError, ErrorSeverity } from '../../shared/DomainError.js';

/**
 * Convert a LabEvent to a DomainEvent for publishing
 */
function toDomainEvent(event: LabEvent, actorId: string, correlationId?: string): DomainEvent {
  return {
    eventType: event.eventType,
    aggregateId: event.labCaseId,
    aggregateType: 'LabCase',
    aggregateVersion: 1,
    eventData: event,
    correlationId: correlationId ?? crypto.randomUUID(),
    causationId: null,
    actorId,
    occurredAt: new Date(),
  };
}

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger({ name: 'DentalLabProductionService' });

// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Lab case specific errors
 */
export class LabCaseError extends DomainError {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
    correlationId?: string
  ) {
    super(`lab_case.${code}`, message, details, ErrorSeverity.MEDIUM, correlationId);
    this.name = 'LabCaseError';
  }

  static invalidStatusTransition(
    caseId: string,
    fromStatus: LabCaseStatus,
    toStatus: LabCaseStatus,
    correlationId?: string
  ): LabCaseError {
    return new LabCaseError(
      'invalid_status_transition',
      `Invalid status transition from ${fromStatus} to ${toStatus}`,
      { caseId, fromStatus, toStatus },
      correlationId
    );
  }

  static scanNotFound(scanId: string, correlationId?: string): LabCaseError {
    return new LabCaseError(
      'scan_not_found',
      `Scan with ID '${scanId}' not found`,
      { scanId },
      correlationId
    );
  }

  static designNotFound(designId: string, correlationId?: string): LabCaseError {
    return new LabCaseError(
      'design_not_found',
      `Design with ID '${designId}' not found`,
      { designId },
      correlationId
    );
  }

  static caseNotActive(caseId: string, status: LabCaseStatus, correlationId?: string): LabCaseError {
    return new LabCaseError(
      'case_not_active',
      `Lab case is not active (current status: ${status})`,
      { caseId, status },
      correlationId
    );
  }

  static noDesignToApprove(caseId: string, correlationId?: string): LabCaseError {
    return new LabCaseError(
      'no_design_to_approve',
      'No pending design to approve',
      { caseId },
      correlationId
    );
  }
}

// =============================================================================
// SERVICE CONFIGURATION
// =============================================================================

export interface DentalLabProductionServiceConfig {
  /** Default SLA type for new cases */
  defaultSLAType: 'STANDARD' | 'RUSH' | 'EMERGENCY';
  /** Hours to look ahead for SLA deadline warnings */
  slaWarningHoursAhead: number;
  /** Enable automatic status transitions on certain events */
  autoTransitionEnabled: boolean;
  /** Enable real-time notifications */
  notificationsEnabled: boolean;
}

const DEFAULT_CONFIG: DentalLabProductionServiceConfig = {
  defaultSLAType: 'STANDARD',
  slaWarningHoursAhead: 4,
  autoTransitionEnabled: true,
  notificationsEnabled: true,
};

// =============================================================================
// SERVICE IMPLEMENTATION
// =============================================================================

/**
 * Dental Lab Production Service
 *
 * Implements all lab case operations with proper validation, event publishing,
 * and workflow orchestration.
 */
export class DentalLabProductionService implements IDentalLabProductionUseCase {
  private readonly config: DentalLabProductionServiceConfig;

  constructor(
    private readonly labCaseRepository: ILabCaseRepository,
    private readonly collaborationRepository: ILabCollaborationRepository,
    private readonly assetStorage: IDigitalAssetStoragePort,
    private readonly eventPublisher: IEventPublisher,
    config?: Partial<DentalLabProductionServiceConfig>
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ===========================================================================
  // LAB CASE LIFECYCLE
  // ===========================================================================

  async createLabCase(input: CreateLabCase, createdBy: string): Promise<CreateLabCaseResult> {
    logger.info({ clinicId: input.clinicId, createdBy }, 'Creating new lab case');

    // Validate prosthetics
    if (input.prosthetics.length === 0) {
      throw new BusinessRuleError(
        'prosthetics_required',
        'At least one prosthetic specification is required'
      );
    }

    // Create the lab case
    const labCase = await this.labCaseRepository.create(input, createdBy);

    // Create SLA tracking
    await this.initializeSLATracking(labCase);

    // Emit event
    const event: LabEvent = {
      eventType: 'LAB_CASE_STATUS_CHANGED',
      labCaseId: labCase.id,
      caseNumber: labCase.caseNumber,
      newStatus: labCase.status,
      changedBy: createdBy,
      changedAt: new Date(),
      clinicId: labCase.clinicId,
      patientId: labCase.patientId,
    };

    await this.eventPublisher.publishTo('lab.case.created', toDomainEvent(event, createdBy));

    logger.info(
      { labCaseId: labCase.id, caseNumber: labCase.caseNumber },
      'Lab case created successfully'
    );

    return { labCase, event };
  }

  async getLabCase(id: string): Promise<LabCase | null> {
    return this.labCaseRepository.findById(id);
  }

  async getLabCaseByCaseNumber(caseNumber: string): Promise<LabCase | null> {
    return this.labCaseRepository.findByCaseNumber(caseNumber);
  }

  async updateLabCase(id: string, input: UpdateLabCase, updatedBy: string): Promise<LabCase> {
    const labCase = await this.requireLabCase(id);

    if (!isActiveStatus(labCase.status)) {
      throw LabCaseError.caseNotActive(id, labCase.status);
    }

    return this.labCaseRepository.update(id, input, updatedBy);
  }

  async listLabCases(
    filters: LabCaseQueryFilters,
    pagination: LabCasePagination
  ): Promise<LabCaseListResponse> {
    return this.labCaseRepository.list(filters, pagination);
  }

  async searchLabCases(clinicId: string, searchText: string, limit?: number): Promise<LabCase[]> {
    return this.labCaseRepository.search(clinicId, searchText, limit);
  }

  async cancelLabCase(id: string, reason: string, cancelledBy: string): Promise<LabCase> {
    const labCase = await this.requireLabCase(id);

    if (!isActiveStatus(labCase.status)) {
      throw LabCaseError.caseNotActive(id, labCase.status);
    }

    // Validate transition
    if (!isValidStatusTransition(labCase.status, 'CANCELLED')) {
      throw LabCaseError.invalidStatusTransition(id, labCase.status, 'CANCELLED');
    }

    const updatedCase = await this.labCaseRepository.transitionStatus(
      id,
      'CANCELLED',
      cancelledBy,
      reason
    );

    // Emit event
    const cancelledEvent: LabEvent = {
      eventType: 'LAB_CASE_STATUS_CHANGED',
      labCaseId: id,
      caseNumber: updatedCase.caseNumber,
      previousStatus: labCase.status,
      newStatus: 'CANCELLED',
      changedBy: cancelledBy,
      changedAt: new Date(),
      reason,
      clinicId: updatedCase.clinicId,
      patientId: updatedCase.patientId,
    };
    await this.eventPublisher.publishTo('lab.case.cancelled', toDomainEvent(cancelledEvent, cancelledBy));

    logger.info({ labCaseId: id, reason }, 'Lab case cancelled');

    return updatedCase;
  }

  // ===========================================================================
  // STATUS WORKFLOW
  // ===========================================================================

  async transitionStatus(
    id: string,
    newStatus: LabCaseStatus,
    changedBy: string,
    reason?: string
  ): Promise<TransitionStatusResult> {
    const labCase = await this.requireLabCase(id);

    // Validate transition
    if (!isValidStatusTransition(labCase.status, newStatus)) {
      throw LabCaseError.invalidStatusTransition(id, labCase.status, newStatus);
    }

    // Perform transition
    const updatedCase = await this.labCaseRepository.transitionStatus(
      id,
      newStatus,
      changedBy,
      reason
    );

    // Get the new history entry
    const history = await this.labCaseRepository.getStatusHistory(id);
    const historyEntry = history[0]!;

    // Update SLA tracking
    await this.updateSLATrackingForStatus(id, newStatus);

    // Build event
    const event: LabEvent = {
      eventType: 'LAB_CASE_STATUS_CHANGED',
      labCaseId: id,
      caseNumber: updatedCase.caseNumber,
      previousStatus: labCase.status,
      newStatus,
      changedBy,
      changedAt: new Date(),
      reason,
      clinicId: updatedCase.clinicId,
      patientId: updatedCase.patientId,
    };

    await this.eventPublisher.publishTo('lab.case.status_changed', toDomainEvent(event, changedBy));

    // Determine next actions
    const nextActions = this.getNextActionsForStatus(newStatus, updatedCase);

    logger.info(
      { labCaseId: id, previousStatus: labCase.status, newStatus },
      'Lab case status transitioned'
    );

    return { labCase: updatedCase, historyEntry, event, nextActions };
  }

  async getStatusHistory(id: string): Promise<StatusHistoryEntry[]> {
    await this.requireLabCase(id);
    return this.labCaseRepository.getStatusHistory(id);
  }

  async getRecommendedNextStatuses(
    id: string
  ): Promise<Array<{ status: LabCaseStatus; description: string; isRecommended: boolean }>> {
    const labCase = await this.requireLabCase(id);

    const statusDescriptions: Record<LabCaseStatus, string> = {
      RECEIVED: 'Case received from clinic',
      PENDING_SCAN: 'Awaiting digital impression upload',
      SCAN_RECEIVED: 'Digital impression uploaded',
      IN_DESIGN: 'CAD design in progress',
      DESIGN_REVIEW: 'Design ready for clinician review',
      DESIGN_APPROVED: 'Design approved, ready for fabrication',
      DESIGN_REVISION: 'Design revision requested',
      QUEUED_FOR_MILLING: 'Queued for milling/printing',
      MILLING: 'Fabrication in progress',
      POST_PROCESSING: 'Post-processing (sintering, staining)',
      FINISHING: 'Manual finishing and polishing',
      QC_INSPECTION: 'Quality control inspection',
      QC_FAILED: 'QC failed, needs rework',
      QC_PASSED: 'QC passed',
      READY_FOR_PICKUP: 'Ready for clinic pickup/delivery',
      IN_TRANSIT: 'In transit to clinic',
      DELIVERED: 'Delivered to clinic',
      TRY_IN_SCHEDULED: 'Try-in appointment scheduled',
      ADJUSTMENT_REQUIRED: 'Adjustment needed after try-in',
      ADJUSTMENT_IN_PROGRESS: 'Adjustment in progress',
      COMPLETED: 'Case completed successfully',
      CANCELLED: 'Case cancelled',
      ON_HOLD: 'Case on hold',
    };

    const validTransitions = this.getValidTransitions(labCase.status);
    const recommended = this.getRecommendedStatus(labCase);

    return validTransitions.map((status) => ({
      status,
      description: statusDescriptions[status],
      isRecommended: status === recommended,
    }));
  }

  // ===========================================================================
  // DIGITAL SCAN WORKFLOW
  // ===========================================================================

  async initiateScanUpload(
    labCaseId: string,
    metadata: {
      scanType: ScanType;
      fileFormat: DigitalFileFormat;
      filename: string;
      fileSize: number;
      scannerBrand?: string;
      scannerModel?: string;
    },
    uploadedBy: string
  ): Promise<UploadScanResult> {
    const labCase = await this.requireLabCase(labCaseId);

    if (!isActiveStatus(labCase.status)) {
      throw LabCaseError.caseNotActive(labCaseId, labCase.status);
    }

    // Generate storage path
    const storagePath = `lab-cases/${labCaseId}/scans/${Date.now()}_${metadata.filename}`;

    // Get presigned upload URL
    const assetMetadata: AssetMetadata = {
      filename: metadata.filename,
      mimeType: this.getMimeType(metadata.fileFormat),
      fileSize: metadata.fileSize,
      labCaseId,
      assetType: 'SCAN',
      format: metadata.fileFormat,
      uploadedBy,
    };

    const uploadUrl = await this.assetStorage.getPresignedUploadUrl(assetMetadata);

    // Create pending scan record
    const pendingScan = {
      id: crypto.randomUUID(),
      storagePath: uploadUrl.storagePath,
    };

    logger.info(
      { labCaseId, scanType: metadata.scanType, filename: metadata.filename },
      'Scan upload initiated'
    );

    return { uploadUrl, pendingScan };
  }

  async confirmScanUpload(pendingScanId: string, checksum?: string): Promise<DigitalScan> {
    // In a full implementation, we'd look up the pending scan record
    // For now, we'll verify the file exists and create the scan record

    logger.info({ pendingScanId, checksum }, 'Scan upload confirmed');

    // This would be implemented with the actual pending scan lookup
    throw new Error('Not implemented - requires pending scan tracking');
  }

  async getScans(labCaseId: string): Promise<DigitalScan[]> {
    await this.requireLabCase(labCaseId);
    return this.labCaseRepository.getScans(labCaseId);
  }

  async getScanDownloadUrl(scanId: string): Promise<PresignedDownloadUrl> {
    // Get the scan record to find the storage path
    // This would need to be added to the repository interface
    throw new Error('Not implemented - requires scan lookup by ID');
  }

  // ===========================================================================
  // CAD DESIGN WORKFLOW
  // ===========================================================================

  async submitDesignForReview(
    labCaseId: string,
    design: CreateCADDesign,
    designedBy: string
  ): Promise<SubmitDesignResult> {
    const labCase = await this.requireLabCase(labCaseId);

    // Validate case is in design phase or can accept designs
    const validStatuses: LabCaseStatus[] = ['SCAN_RECEIVED', 'IN_DESIGN', 'DESIGN_REVISION'];
    if (!validStatuses.includes(labCase.status)) {
      throw new BusinessRuleError(
        'invalid_status_for_design',
        `Cannot submit design when case is in ${labCase.status} status`,
        { labCaseId, currentStatus: labCase.status }
      );
    }

    // Create the design
    const createdDesign = await this.labCaseRepository.addDesign(labCaseId, {
      ...design,
      designedBy,
      approvalStatus: 'PENDING',
    });

    // Transition to DESIGN_REVIEW
    let updatedCase = labCase;
    if (this.config.autoTransitionEnabled) {
      updatedCase = await this.labCaseRepository.transitionStatus(
        labCaseId,
        'DESIGN_REVIEW',
        designedBy,
        'Design submitted for review'
      );
    }

    // Emit event for notification
    const event: LabEvent = {
      eventType: 'DESIGN_REVIEW_REQUIRED',
      labCaseId,
      caseNumber: updatedCase.caseNumber,
      designId: createdDesign.id,
      clinicId: updatedCase.clinicId,
      clinicianId: updatedCase.prescribingDentist,
      deadline: calculateSLADeadline('DESIGN_REVIEW', new Date()),
    };

    if (this.config.notificationsEnabled) {
      await this.eventPublisher.publishTo('lab.design.review_required', toDomainEvent(event, designedBy));
    }

    logger.info(
      { labCaseId, designId: createdDesign.id, designedBy },
      'Design submitted for review'
    );

    return { design: createdDesign, labCase: updatedCase, event };
  }

  async processDesignApproval(input: ApproveDesign): Promise<ApproveDesignResult> {
    const design = await this.labCaseRepository.approveDesign(input);
    const labCase = await this.requireLabCase(design.labCaseId);

    let updatedCase = labCase;

    if (this.config.autoTransitionEnabled) {
      if (input.approvalStatus === 'APPROVED') {
        // Move to fabrication queue
        updatedCase = await this.labCaseRepository.transitionStatus(
          labCase.id,
          'DESIGN_APPROVED',
          input.approvedBy,
          'Design approved by clinician'
        );
      } else if (input.approvalStatus === 'REVISION_REQUESTED') {
        // Move back to design
        updatedCase = await this.labCaseRepository.transitionStatus(
          labCase.id,
          'DESIGN_REVISION',
          input.approvedBy,
          input.notes ?? 'Revision requested'
        );
      }
    }

    logger.info(
      { labCaseId: labCase.id, designId: input.designId, approvalStatus: input.approvalStatus },
      'Design approval processed'
    );

    return { design, labCase: updatedCase };
  }

  async getDesignsAwaitingReview(clinicId: string): Promise<LabCase[]> {
    return this.labCaseRepository.getDesignsAwaitingReview(clinicId);
  }

  async getDesignDownloadUrl(designId: string): Promise<PresignedDownloadUrl> {
    // Would need design lookup by ID
    throw new Error('Not implemented - requires design lookup by ID');
  }

  // ===========================================================================
  // FABRICATION WORKFLOW
  // ===========================================================================

  async startFabrication(
    labCaseId: string,
    record: CreateFabricationRecord
  ): Promise<FabricationRecord> {
    const labCase = await this.requireLabCase(labCaseId);

    // Validate case is ready for fabrication
    const validStatuses: LabCaseStatus[] = ['DESIGN_APPROVED', 'QUEUED_FOR_MILLING'];
    if (!validStatuses.includes(labCase.status)) {
      throw new BusinessRuleError(
        'invalid_status_for_fabrication',
        `Cannot start fabrication when case is in ${labCase.status} status`,
        { labCaseId, currentStatus: labCase.status }
      );
    }

    // Create fabrication record
    const fabricationRecord = await this.labCaseRepository.addFabricationRecord(labCaseId, record);

    // Auto-transition to MILLING
    if (this.config.autoTransitionEnabled && labCase.status !== 'MILLING') {
      await this.labCaseRepository.transitionStatus(
        labCaseId,
        'MILLING',
        record.technicianId,
        `Fabrication started: ${record.method}`
      );
    }

    logger.info(
      { labCaseId, method: record.method, technicianId: record.technicianId },
      'Fabrication started'
    );

    return fabricationRecord;
  }

  async completeFabrication(recordId: string): Promise<FabricationRecord> {
    await this.labCaseRepository.completeFabrication(recordId);

    // Return the updated record - would need to add getFabricationRecord method
    throw new Error('Not implemented - requires getFabricationRecord method');
  }

  async getFabricationRecords(labCaseId: string): Promise<FabricationRecord[]> {
    await this.requireLabCase(labCaseId);
    return this.labCaseRepository.getFabricationRecords(labCaseId);
  }

  // ===========================================================================
  // QUALITY CONTROL WORKFLOW
  // ===========================================================================

  async performQCInspection(
    labCaseId: string,
    inspection: CreateQCInspection
  ): Promise<PerformQCInspectionResult> {
    const labCase = await this.requireLabCase(labCaseId);

    // Validate case is ready for QC
    const validStatuses: LabCaseStatus[] = ['FINISHING', 'QC_INSPECTION', 'ADJUSTMENT_IN_PROGRESS'];
    if (!validStatuses.includes(labCase.status)) {
      throw new BusinessRuleError(
        'invalid_status_for_qc',
        `Cannot perform QC when case is in ${labCase.status} status`,
        { labCaseId, currentStatus: labCase.status }
      );
    }

    // Determine pass/fail from criteria
    const passed = didQCPass(inspection.criteria);
    const inspectionWithResult = { ...inspection, passed };

    // Create inspection record
    const qcInspection = await this.labCaseRepository.addQCInspection(
      labCaseId,
      inspectionWithResult
    );

    // Determine next status
    const recommendedNextStatus: LabCaseStatus = passed ? 'QC_PASSED' : 'QC_FAILED';

    // Auto-transition
    let updatedCase = labCase;
    if (this.config.autoTransitionEnabled) {
      updatedCase = await this.labCaseRepository.transitionStatus(
        labCaseId,
        recommendedNextStatus,
        inspection.inspectedBy,
        passed ? 'QC passed' : 'QC failed - rework required'
      );
    }

    // Emit event
    const event: LabEvent = {
      eventType: 'QC_INSPECTION_COMPLETED',
      labCaseId,
      caseNumber: updatedCase.caseNumber,
      inspectionId: qcInspection.id,
      passed,
      overallScore: qcInspection.overallScore,
      inspectedBy: inspection.inspectedBy,
      clinicId: updatedCase.clinicId,
    };

    await this.eventPublisher.publishTo('lab.qc.completed', toDomainEvent(event, inspection.inspectedBy));

    logger.info(
      { labCaseId, passed, overallScore: qcInspection.overallScore },
      'QC inspection completed'
    );

    return {
      inspection: qcInspection,
      labCase: updatedCase,
      event,
      recommendedNextStatus,
    };
  }

  async getQCInspections(labCaseId: string): Promise<QCInspection[]> {
    await this.requireLabCase(labCaseId);
    return this.labCaseRepository.getQCInspections(labCaseId);
  }

  // ===========================================================================
  // TRY-IN WORKFLOW
  // ===========================================================================

  async scheduleTryIn(
    labCaseId: string,
    scheduledAt: Date,
    clinicianId: string
  ): Promise<TryInRecord> {
    const labCase = await this.requireLabCase(labCaseId);

    // Validate case is delivered
    if (labCase.status !== 'DELIVERED') {
      throw new BusinessRuleError(
        'invalid_status_for_tryin',
        'Can only schedule try-in after delivery',
        { labCaseId, currentStatus: labCase.status }
      );
    }

    const record = await this.labCaseRepository.addTryInRecord(labCaseId, {
      labCaseId,
      scheduledAt,
      clinicianId,
    });

    // Auto-transition
    if (this.config.autoTransitionEnabled) {
      await this.labCaseRepository.transitionStatus(
        labCaseId,
        'TRY_IN_SCHEDULED',
        clinicianId,
        `Try-in scheduled for ${scheduledAt.toISOString()}`
      );
    }

    logger.info({ labCaseId, scheduledAt }, 'Try-in scheduled');

    return record;
  }

  async recordTryInResults(
    tryInRecordId: string,
    results: Pick<TryInRecord, 'clinicianNotes' | 'adjustmentsRequired' | 'patientSatisfaction' | 'photos'>
  ): Promise<TryInRecord> {
    const record = await this.labCaseRepository.updateTryInRecord(tryInRecordId, {
      ...results,
      completedAt: new Date(),
    });

    logger.info(
      { tryInRecordId, hasAdjustments: (results.adjustmentsRequired?.length ?? 0) > 0 },
      'Try-in results recorded'
    );

    return record;
  }

  async getTryInRecords(labCaseId: string): Promise<TryInRecord[]> {
    await this.requireLabCase(labCaseId);
    return this.labCaseRepository.getTryInRecords(labCaseId);
  }

  // ===========================================================================
  // DELIVERY WORKFLOW
  // ===========================================================================

  async markReadyForPickup(labCaseId: string, preparedBy: string): Promise<LabCase> {
    const labCase = await this.requireLabCase(labCaseId);

    if (labCase.status !== 'QC_PASSED') {
      throw new BusinessRuleError(
        'invalid_status_for_pickup',
        'Can only mark ready for pickup after QC passed',
        { labCaseId, currentStatus: labCase.status }
      );
    }

    const updatedCase = await this.labCaseRepository.transitionStatus(
      labCaseId,
      'READY_FOR_PICKUP',
      preparedBy,
      'Case ready for clinic pickup'
    );

    // Emit notification event
    const event: LabEvent = {
      eventType: 'LAB_CASE_READY_FOR_PICKUP',
      labCaseId,
      caseNumber: updatedCase.caseNumber,
      clinicId: updatedCase.clinicId,
      patientId: updatedCase.patientId,
      completedAt: new Date(),
    };

    await this.eventPublisher.publishTo('lab.case.ready_for_pickup', toDomainEvent(event, preparedBy));

    logger.info({ labCaseId }, 'Case marked ready for pickup');

    return updatedCase;
  }

  async markInTransit(
    labCaseId: string,
    trackingNumber: string | undefined,
    deliveredBy: string
  ): Promise<LabCase> {
    const labCase = await this.requireLabCase(labCaseId);

    if (labCase.status !== 'READY_FOR_PICKUP') {
      throw new BusinessRuleError(
        'invalid_status_for_transit',
        'Can only mark in transit from ready for pickup status',
        { labCaseId, currentStatus: labCase.status }
      );
    }

    // Update with tracking number if provided
    if (trackingNumber) {
      await this.labCaseRepository.update(labCaseId, { notes: `Tracking: ${trackingNumber}` }, deliveredBy);
    }

    return this.labCaseRepository.transitionStatus(
      labCaseId,
      'IN_TRANSIT',
      deliveredBy,
      trackingNumber ? `In transit - Tracking: ${trackingNumber}` : 'In transit'
    );
  }

  async markDelivered(labCaseId: string, deliveryDate?: Date): Promise<LabCase> {
    const labCase = await this.requireLabCase(labCaseId);

    const validStatuses: LabCaseStatus[] = ['READY_FOR_PICKUP', 'IN_TRANSIT'];
    if (!validStatuses.includes(labCase.status)) {
      throw new BusinessRuleError(
        'invalid_status_for_delivery',
        'Can only mark delivered from ready for pickup or in transit status',
        { labCaseId, currentStatus: labCase.status }
      );
    }

    const updatedCase = await this.labCaseRepository.transitionStatus(
      labCaseId,
      'DELIVERED',
      'system', // Would typically be the delivery person
      `Delivered on ${(deliveryDate ?? new Date()).toISOString()}`
    );

    logger.info({ labCaseId }, 'Case marked as delivered');

    return updatedCase;
  }

  async completeCase(labCaseId: string, completedBy: string): Promise<LabCase> {
    const labCase = await this.requireLabCase(labCaseId);

    const validStatuses: LabCaseStatus[] = ['DELIVERED', 'TRY_IN_SCHEDULED'];
    if (!validStatuses.includes(labCase.status)) {
      throw new BusinessRuleError(
        'invalid_status_for_completion',
        'Can only complete case after delivery or try-in',
        { labCaseId, currentStatus: labCase.status }
      );
    }

    return this.labCaseRepository.transitionStatus(
      labCaseId,
      'COMPLETED',
      completedBy,
      'Case completed successfully'
    );
  }

  // ===========================================================================
  // COLLABORATION
  // ===========================================================================

  async createCollaborationThread(input: CreateCollaborationThread): Promise<CollaborationThread> {
    await this.requireLabCase(input.labCaseId);
    return this.collaborationRepository.createThread(input);
  }

  async addMessageToThread(input: AddMessageToThread): Promise<CollaborationMessage> {
    return this.collaborationRepository.addMessage(input);
  }

  async getThreadsForCase(labCaseId: string): Promise<CollaborationThread[]> {
    await this.requireLabCase(labCaseId);
    return this.collaborationRepository.getThreadsForCase(labCaseId);
  }

  async markThreadAsRead(threadId: string, userId: string): Promise<void> {
    await this.collaborationRepository.markMessagesRead(threadId, userId);
  }

  async submitDesignFeedback(input: CreateDesignFeedback): Promise<DesignFeedback> {
    await this.requireLabCase(input.labCaseId);
    return this.collaborationRepository.addDesignFeedback(input);
  }

  async getDesignFeedback(designId: string): Promise<DesignFeedback[]> {
    return this.collaborationRepository.getDesignFeedback(designId);
  }

  // ===========================================================================
  // SLA MONITORING
  // ===========================================================================

  async getSLATracking(labCaseId: string): Promise<LabSLATracking | null> {
    await this.requireLabCase(labCaseId);
    return this.labCaseRepository.getSLATracking(labCaseId);
  }

  async checkSLABreaches(clinicId: string): Promise<Array<{
    labCase: LabCase;
    slaTracking: LabSLATracking;
    breachType: 'AT_RISK' | 'OVERDUE';
  }>> {
    const [atRisk, overdue] = await Promise.all([
      this.labCaseRepository.getCasesWithSLAIssues(clinicId, 'AT_RISK'),
      this.labCaseRepository.getCasesWithSLAIssues(clinicId, 'OVERDUE'),
    ]);

    return [
      ...atRisk.map((item) => ({ ...item, breachType: 'AT_RISK' as const })),
      ...overdue.map((item) => ({ ...item, breachType: 'OVERDUE' as const })),
    ];
  }

  async getUpcomingSLADeadlines(
    clinicId: string,
    hoursAhead: number
  ): Promise<Array<{ labCase: LabCase; deadline: Date; milestone: string }>> {
    return this.labCaseRepository.getUpcomingSLADeadlines(clinicId, hoursAhead);
  }

  // ===========================================================================
  // ASSIGNMENT
  // ===========================================================================

  async assignTechnician(
    labCaseId: string,
    technicianId: string,
    assignedBy: string
  ): Promise<void> {
    await this.requireLabCase(labCaseId);
    await this.labCaseRepository.assignTechnician(labCaseId, technicianId, assignedBy);
    logger.info({ labCaseId, technicianId, assignedBy }, 'Technician assigned');
  }

  async assignDesigner(labCaseId: string, designerId: string, assignedBy: string): Promise<void> {
    await this.requireLabCase(labCaseId);
    await this.labCaseRepository.assignDesigner(labCaseId, designerId, assignedBy);
    logger.info({ labCaseId, designerId, assignedBy }, 'Designer assigned');
  }

  async getTechnicianWorkloads(clinicId: string): Promise<TechnicianWorkload[]> {
    return this.labCaseRepository.getTechnicianWorkloads(clinicId);
  }

  // ===========================================================================
  // ANALYTICS & REPORTING
  // ===========================================================================

  async getLabCaseStats(clinicId: string): Promise<LabCaseStats> {
    return this.labCaseRepository.getStats(clinicId);
  }

  async getLabDashboard(clinicId: string): Promise<LabCaseDashboard> {
    return this.labCaseRepository.getDashboard(clinicId);
  }

  async getPerformanceMetrics(
    clinicId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<LabPerformanceMetrics> {
    return this.labCaseRepository.getPerformanceMetrics(clinicId, periodStart, periodEnd);
  }

  async generateDailyReport(clinicId: string, date: Date): Promise<DailyLabReport> {
    const dashboard = await this.labCaseRepository.getDashboard(clinicId);
    const slaBreaches = await this.checkSLABreaches(clinicId);

    const attentionRequired: CaseSummary[] = [
      ...dashboard.urgentItems.map((item) => ({
        caseId: item.caseId,
        caseNumber: item.caseNumber,
        patientName: '', // Would need to join with patients table
        status: 'RECEIVED' as LabCaseStatus, // Would need actual status
        slaStatus: 'AT_RISK' as const,
        dueDate: new Date(),
        pendingActions: [item.details],
      })),
    ];

    return {
      date,
      clinicId,
      summary: {
        activeCases: dashboard.pipeline.inDesign + dashboard.pipeline.inFabrication + dashboard.pipeline.inQC + dashboard.pipeline.awaitingDelivery,
        completedToday: dashboard.today.completedCases,
        newCasesToday: dashboard.today.newCases,
        designsAwaitingReview: dashboard.today.designsAwaitingReview,
        casesReadyForPickup: dashboard.today.readyForPickup,
      },
      slaHealth: dashboard.slaHealth,
      attentionRequired,
      generatedAt: new Date(),
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  private async requireLabCase(id: string): Promise<LabCase> {
    const labCase = await this.labCaseRepository.findById(id);
    if (!labCase) {
      throw DomainError.notFound('LabCase', id);
    }
    return labCase;
  }

  private async initializeSLATracking(labCase: LabCase): Promise<void> {
    const milestones = [
      { name: 'Scan Processing', status: 'PENDING' as const, expectedBy: calculateSLADeadline('SCAN_RECEIVED', labCase.receivedAt) },
      { name: 'Design', status: 'PENDING' as const, expectedBy: calculateSLADeadline('DESIGN_REVIEW', labCase.receivedAt) },
      { name: 'Fabrication', status: 'PENDING' as const, expectedBy: calculateSLADeadline('QC_INSPECTION', labCase.receivedAt) },
      { name: 'QC', status: 'PENDING' as const, expectedBy: calculateSLADeadline('QC_PASSED', labCase.receivedAt) },
      { name: 'Ready for Delivery', status: 'PENDING' as const, expectedBy: calculateSLADeadline('READY_FOR_PICKUP', labCase.receivedAt) },
    ];

    await this.labCaseRepository.updateSLATracking(labCase.id, {
      labCaseId: labCase.id,
      slaType: this.config.defaultSLAType,
      milestones,
      overallStatus: 'ON_TRACK',
      daysRemaining: Math.ceil((labCase.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)),
      percentComplete: 0,
    });
  }

  private async updateSLATrackingForStatus(labCaseId: string, newStatus: LabCaseStatus): Promise<void> {
    // Update milestone completion based on status
    const tracking = await this.labCaseRepository.getSLATracking(labCaseId);
    if (!tracking) return;

    const statusToMilestone: Partial<Record<LabCaseStatus, string>> = {
      SCAN_RECEIVED: 'Scan Processing',
      DESIGN_REVIEW: 'Design',
      QC_INSPECTION: 'Fabrication',
      QC_PASSED: 'QC',
      READY_FOR_PICKUP: 'Ready for Delivery',
    };

    const milestoneName = statusToMilestone[newStatus];
    if (!milestoneName) return;

    const updatedMilestones = tracking.milestones.map((m) =>
      m.name === milestoneName ? { ...m, status: 'COMPLETED' as const, completedAt: new Date() } : m
    );

    const completedCount = updatedMilestones.filter((m) => m.status === 'COMPLETED').length;
    const percentComplete = Math.round((completedCount / updatedMilestones.length) * 100);

    await this.labCaseRepository.updateSLATracking(labCaseId, {
      milestones: updatedMilestones,
      percentComplete,
    });
  }

  private getValidTransitions(currentStatus: LabCaseStatus): LabCaseStatus[] {
    const transitions: Record<LabCaseStatus, LabCaseStatus[]> = {
      RECEIVED: ['PENDING_SCAN', 'SCAN_RECEIVED', 'CANCELLED', 'ON_HOLD'],
      PENDING_SCAN: ['SCAN_RECEIVED', 'CANCELLED', 'ON_HOLD'],
      SCAN_RECEIVED: ['IN_DESIGN', 'CANCELLED', 'ON_HOLD'],
      IN_DESIGN: ['DESIGN_REVIEW', 'CANCELLED', 'ON_HOLD'],
      DESIGN_REVIEW: ['DESIGN_APPROVED', 'DESIGN_REVISION', 'ON_HOLD'],
      DESIGN_APPROVED: ['QUEUED_FOR_MILLING', 'DESIGN_REVISION'],
      DESIGN_REVISION: ['IN_DESIGN', 'CANCELLED'],
      QUEUED_FOR_MILLING: ['MILLING', 'CANCELLED', 'ON_HOLD'],
      MILLING: ['POST_PROCESSING', 'QC_FAILED'],
      POST_PROCESSING: ['FINISHING'],
      FINISHING: ['QC_INSPECTION'],
      QC_INSPECTION: ['QC_PASSED', 'QC_FAILED'],
      QC_FAILED: ['IN_DESIGN', 'MILLING', 'CANCELLED'],
      QC_PASSED: ['READY_FOR_PICKUP'],
      READY_FOR_PICKUP: ['IN_TRANSIT', 'DELIVERED'],
      IN_TRANSIT: ['DELIVERED'],
      DELIVERED: ['TRY_IN_SCHEDULED', 'COMPLETED', 'ADJUSTMENT_REQUIRED'],
      TRY_IN_SCHEDULED: ['ADJUSTMENT_REQUIRED', 'COMPLETED'],
      ADJUSTMENT_REQUIRED: ['ADJUSTMENT_IN_PROGRESS'],
      ADJUSTMENT_IN_PROGRESS: ['QC_INSPECTION', 'DELIVERED'],
      COMPLETED: [],
      CANCELLED: [],
      ON_HOLD: ['RECEIVED', 'PENDING_SCAN', 'SCAN_RECEIVED', 'IN_DESIGN', 'QUEUED_FOR_MILLING'],
    };

    return transitions[currentStatus] ?? [];
  }

  private getRecommendedStatus(labCase: LabCase): LabCaseStatus | null {
    // Simple recommendation logic based on current status
    const recommendations: Partial<Record<LabCaseStatus, LabCaseStatus>> = {
      RECEIVED: 'SCAN_RECEIVED',
      SCAN_RECEIVED: 'IN_DESIGN',
      IN_DESIGN: 'DESIGN_REVIEW',
      DESIGN_REVIEW: 'DESIGN_APPROVED',
      DESIGN_APPROVED: 'QUEUED_FOR_MILLING',
      QUEUED_FOR_MILLING: 'MILLING',
      MILLING: 'POST_PROCESSING',
      POST_PROCESSING: 'FINISHING',
      FINISHING: 'QC_INSPECTION',
      QC_INSPECTION: 'QC_PASSED',
      QC_PASSED: 'READY_FOR_PICKUP',
      READY_FOR_PICKUP: 'DELIVERED',
      DELIVERED: 'COMPLETED',
    };

    return recommendations[labCase.status] ?? null;
  }

  private getNextActionsForStatus(status: LabCaseStatus, labCase: LabCase): string[] {
    const actions: Partial<Record<LabCaseStatus, string[]>> = {
      RECEIVED: ['Upload digital scan', 'Assign designer'],
      SCAN_RECEIVED: ['Start CAD design', 'Verify scan quality'],
      IN_DESIGN: ['Complete design', 'Request clinician input if needed'],
      DESIGN_REVIEW: ['Review design', 'Provide feedback or approve'],
      DESIGN_APPROVED: ['Queue for fabrication', 'Assign technician'],
      QUEUED_FOR_MILLING: ['Start fabrication', 'Verify material availability'],
      MILLING: ['Monitor progress', 'Prepare for post-processing'],
      POST_PROCESSING: ['Complete sintering/staining', 'Prepare for finishing'],
      FINISHING: ['Complete polishing', 'Proceed to QC'],
      QC_INSPECTION: ['Perform QC inspection', 'Document results'],
      QC_PASSED: ['Prepare for delivery', 'Notify clinic'],
      READY_FOR_PICKUP: ['Arrange delivery', 'Update tracking'],
      DELIVERED: ['Confirm receipt', 'Schedule try-in if needed'],
    };

    return actions[status] ?? [];
  }

  private getMimeType(format: DigitalFileFormat): string {
    const mimeTypes: Record<DigitalFileFormat, string> = {
      STL: 'model/stl',
      PLY: 'model/ply',
      OBJ: 'model/obj',
      DCM: 'application/dicom',
      DICOM: 'application/dicom',
    };
    return mimeTypes[format] ?? 'application/octet-stream';
  }
}
