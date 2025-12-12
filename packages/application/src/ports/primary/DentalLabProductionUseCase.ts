/**
 * @fileoverview Dental Lab Production Use Case Port Interface (Primary Port)
 *
 * Defines the primary interface for dental laboratory production workflows.
 * This is the main entry point for all lab case operations in the application.
 *
 * @module application/ports/primary/DentalLabProductionUseCase
 *
 * ## Hexagonal Architecture
 *
 * This is a **PRIMARY PORT** (driving port) that defines what the
 * application offers to the outside world for dental lab production.
 *
 * ## Features
 *
 * - Complete lab case lifecycle management
 * - Digital workflow orchestration (CAD/CAM)
 * - Quality control workflow
 * - Clinic-lab collaboration
 * - SLA monitoring and alerts
 * - Performance analytics
 */

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
} from '@medicalcor/types';

import type {
  LabCaseStats,
  LabCaseDashboard,
  TechnicianWorkload,
} from '../secondary/persistence/LabCaseRepository.js';

import type {
  PresignedUploadUrl,
  PresignedDownloadUrl,
  AssetMetadata,
} from '../secondary/external/DigitalAssetStoragePort.js';

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * Result of a lab case creation
 */
export interface CreateLabCaseResult {
  /** Created lab case */
  labCase: LabCase;
  /** Event emitted */
  event: LabEvent;
}

/**
 * Result of a status transition
 */
export interface TransitionStatusResult {
  /** Updated lab case */
  labCase: LabCase;
  /** Status history entry created */
  historyEntry: StatusHistoryEntry;
  /** Event emitted */
  event: LabEvent;
  /** Next recommended actions */
  nextActions: string[];
}

/**
 * Result of a design submission
 */
export interface SubmitDesignResult {
  /** Created design */
  design: CADDesign;
  /** Updated lab case */
  labCase: LabCase;
  /** Event emitted for review notification */
  event?: LabEvent;
}

/**
 * Result of a QC inspection
 */
export interface PerformQCInspectionResult {
  /** QC inspection record */
  inspection: QCInspection;
  /** Updated lab case */
  labCase: LabCase;
  /** Event emitted */
  event: LabEvent;
  /** Recommended next status */
  recommendedNextStatus: LabCaseStatus;
}

/**
 * Result of design approval
 */
export interface ApproveDesignResult {
  /** Updated design */
  design: CADDesign;
  /** Updated lab case */
  labCase: LabCase;
  /** Event emitted */
  event?: LabEvent;
}

/**
 * Upload result
 */
export interface UploadScanResult {
  /** Presigned URL for upload */
  uploadUrl: PresignedUploadUrl;
  /** Scan record (pending confirmation) */
  pendingScan: {
    id: string;
    storagePath: string;
  };
}

/**
 * Case summary for notifications
 */
export interface CaseSummary {
  caseId: string;
  caseNumber: string;
  patientName: string;
  status: LabCaseStatus;
  slaStatus: 'ON_TRACK' | 'AT_RISK' | 'OVERDUE';
  dueDate: Date;
  pendingActions: string[];
}

/**
 * Daily report for a clinic
 */
export interface DailyLabReport {
  /** Report date */
  date: Date;
  /** Clinic ID */
  clinicId: string;
  /** Summary statistics */
  summary: {
    activeCases: number;
    completedToday: number;
    newCasesToday: number;
    designsAwaitingReview: number;
    casesReadyForPickup: number;
  };
  /** SLA health */
  slaHealth: {
    onTrack: number;
    atRisk: number;
    overdue: number;
  };
  /** Cases requiring attention */
  attentionRequired: CaseSummary[];
  /** Generated at timestamp */
  generatedAt: Date;
}

// =============================================================================
// USE CASE INTERFACE
// =============================================================================

/**
 * Dental Lab Production Use Case Interface
 *
 * Defines the primary operations available for dental lab production management.
 * This interface is implemented by the application service layer and consumed
 * by API routes, CLI commands, or other entry points.
 *
 * @example
 * ```typescript
 * // Create a new lab case
 * const result = await dentalLabUseCase.createLabCase({
 *   clinicId: 'clinic-123',
 *   patientId: 'patient-456',
 *   prescribingDentist: 'Dr. Smith',
 *   prosthetics: [{ type: 'CROWN', material: 'ZIRCONIA', toothNumbers: ['11'] }],
 *   priority: 'STANDARD',
 *   dueDate: new Date('2024-12-20'),
 * }, 'user-789');
 *
 * // Upload a scan
 * const uploadResult = await dentalLabUseCase.initiatesScanUpload(
 *   result.labCase.id,
 *   {
 *     filename: 'upper_arch.stl',
 *     fileSize: 15_000_000,
 *     scanType: 'INTRAORAL',
 *     fileFormat: 'STL',
 *   },
 *   'user-789'
 * );
 *
 * // Submit design for review
 * await dentalLabUseCase.submitDesignForReview(
 *   result.labCase.id,
 *   designInput,
 *   'designer-user-id'
 * );
 * ```
 */
export interface IDentalLabProductionUseCase {
  // ===========================================================================
  // LAB CASE LIFECYCLE
  // ===========================================================================

  /**
   * Create a new dental lab case
   *
   * Creates a lab case, generates case number, initializes SLA tracking,
   * and emits a case created event.
   *
   * @param input - Lab case creation data
   * @param createdBy - User ID of the creator
   * @returns Created lab case and event
   */
  createLabCase(input: CreateLabCase, createdBy: string): Promise<CreateLabCaseResult>;

  /**
   * Get a lab case by ID
   *
   * @param id - Lab case ID
   * @returns Lab case or null if not found
   */
  getLabCase(id: string): Promise<LabCase | null>;

  /**
   * Get a lab case by case number
   *
   * @param caseNumber - Human-readable case number
   * @returns Lab case or null if not found
   */
  getLabCaseByCaseNumber(caseNumber: string): Promise<LabCase | null>;

  /**
   * Update a lab case
   *
   * @param id - Lab case ID
   * @param input - Update data
   * @param updatedBy - User ID of the updater
   * @returns Updated lab case
   */
  updateLabCase(id: string, input: UpdateLabCase, updatedBy: string): Promise<LabCase>;

  /**
   * List lab cases with filtering and pagination
   *
   * @param filters - Query filters
   * @param pagination - Pagination options
   * @returns Paginated list of lab cases
   */
  listLabCases(
    filters: LabCaseQueryFilters,
    pagination: LabCasePagination
  ): Promise<LabCaseListResponse>;

  /**
   * Search lab cases by text
   *
   * @param clinicId - Clinic ID
   * @param searchText - Search query
   * @param limit - Maximum results
   * @returns Array of matching lab cases
   */
  searchLabCases(clinicId: string, searchText: string, limit?: number): Promise<LabCase[]>;

  /**
   * Cancel a lab case
   *
   * @param id - Lab case ID
   * @param reason - Cancellation reason
   * @param cancelledBy - User ID cancelling the case
   * @returns Updated lab case
   */
  cancelLabCase(id: string, reason: string, cancelledBy: string): Promise<LabCase>;

  // ===========================================================================
  // STATUS WORKFLOW
  // ===========================================================================

  /**
   * Transition lab case to a new status
   *
   * Validates the transition, updates the case, records history,
   * and emits appropriate events.
   *
   * @param id - Lab case ID
   * @param newStatus - Target status
   * @param changedBy - User ID making the change
   * @param reason - Optional reason for the change
   * @returns Transition result with updated case and event
   * @throws Error if transition is not valid
   */
  transitionStatus(
    id: string,
    newStatus: LabCaseStatus,
    changedBy: string,
    reason?: string
  ): Promise<TransitionStatusResult>;

  /**
   * Get status history for a lab case
   *
   * @param id - Lab case ID
   * @returns Array of status history entries
   */
  getStatusHistory(id: string): Promise<StatusHistoryEntry[]>;

  /**
   * Get recommended next statuses for a lab case
   *
   * Based on current status and case data, returns valid next statuses
   * with recommendations.
   *
   * @param id - Lab case ID
   * @returns Array of valid next statuses with descriptions
   */
  getRecommendedNextStatuses(id: string): Promise<Array<{
    status: LabCaseStatus;
    description: string;
    isRecommended: boolean;
  }>>;

  // ===========================================================================
  // DIGITAL SCAN WORKFLOW
  // ===========================================================================

  /**
   * Initiate a scan upload
   *
   * Returns a presigned URL for direct upload and creates a pending scan record.
   *
   * @param labCaseId - Lab case ID
   * @param metadata - Scan metadata
   * @param uploadedBy - User ID uploading
   * @returns Upload URL and pending scan info
   */
  initiateScanUpload(
    labCaseId: string,
    metadata: Pick<CreateDigitalScan, 'scanType' | 'fileFormat' | 'scannerBrand' | 'scannerModel'> & {
      filename: string;
      fileSize: number;
    },
    uploadedBy: string
  ): Promise<UploadScanResult>;

  /**
   * Confirm a scan upload was successful
   *
   * Call after client-side upload completes to verify and finalize the scan record.
   *
   * @param pendingScanId - ID of the pending scan
   * @param checksum - Optional checksum to verify
   * @returns Created scan record
   */
  confirmScanUpload(pendingScanId: string, checksum?: string): Promise<DigitalScan>;

  /**
   * Get all scans for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of digital scans
   */
  getScans(labCaseId: string): Promise<DigitalScan[]>;

  /**
   * Get download URL for a scan
   *
   * @param scanId - Scan ID
   * @returns Presigned download URL
   */
  getScanDownloadUrl(scanId: string): Promise<PresignedDownloadUrl>;

  // ===========================================================================
  // CAD DESIGN WORKFLOW
  // ===========================================================================

  /**
   * Submit a design for review
   *
   * Creates a new design revision, updates case status to DESIGN_REVIEW,
   * and notifies the clinician.
   *
   * @param labCaseId - Lab case ID
   * @param design - Design data
   * @param designedBy - Designer user ID
   * @returns Submit result with design and updated case
   */
  submitDesignForReview(
    labCaseId: string,
    design: CreateCADDesign,
    designedBy: string
  ): Promise<SubmitDesignResult>;

  /**
   * Approve or reject a design
   *
   * Updates design status, transitions case status, and emits events.
   *
   * @param input - Approval data
   * @returns Approval result with updated design and case
   */
  processDesignApproval(input: ApproveDesign): Promise<ApproveDesignResult>;

  /**
   * Get designs awaiting review for a clinic
   *
   * @param clinicId - Clinic ID
   * @returns Array of lab cases with pending designs
   */
  getDesignsAwaitingReview(clinicId: string): Promise<LabCase[]>;

  /**
   * Get download URL for a design file
   *
   * @param designId - Design ID
   * @returns Presigned download URL
   */
  getDesignDownloadUrl(designId: string): Promise<PresignedDownloadUrl>;

  // ===========================================================================
  // FABRICATION WORKFLOW
  // ===========================================================================

  /**
   * Start fabrication for a lab case
   *
   * Records fabrication start and transitions case to appropriate status.
   *
   * @param labCaseId - Lab case ID
   * @param record - Fabrication record data
   * @returns Created fabrication record
   */
  startFabrication(labCaseId: string, record: CreateFabricationRecord): Promise<FabricationRecord>;

  /**
   * Complete fabrication
   *
   * Records fabrication completion and transitions case to QC_INSPECTION.
   *
   * @param recordId - Fabrication record ID
   * @returns Updated fabrication record
   */
  completeFabrication(recordId: string): Promise<FabricationRecord>;

  /**
   * Get fabrication records for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of fabrication records
   */
  getFabricationRecords(labCaseId: string): Promise<FabricationRecord[]>;

  // ===========================================================================
  // QUALITY CONTROL WORKFLOW
  // ===========================================================================

  /**
   * Perform QC inspection
   *
   * Records inspection results, transitions case based on pass/fail,
   * and emits appropriate events.
   *
   * @param labCaseId - Lab case ID
   * @param inspection - QC inspection data
   * @returns Inspection result with recommendations
   */
  performQCInspection(
    labCaseId: string,
    inspection: CreateQCInspection
  ): Promise<PerformQCInspectionResult>;

  /**
   * Get QC inspections for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of QC inspections
   */
  getQCInspections(labCaseId: string): Promise<QCInspection[]>;

  // ===========================================================================
  // TRY-IN WORKFLOW
  // ===========================================================================

  /**
   * Schedule a try-in appointment
   *
   * Creates try-in record and transitions case to TRY_IN_SCHEDULED.
   *
   * @param labCaseId - Lab case ID
   * @param scheduledAt - Try-in date/time
   * @param clinicianId - Clinician user ID
   * @returns Created try-in record
   */
  scheduleTryIn(labCaseId: string, scheduledAt: Date, clinicianId: string): Promise<TryInRecord>;

  /**
   * Record try-in results
   *
   * Updates try-in record and transitions case based on results.
   *
   * @param tryInRecordId - Try-in record ID
   * @param results - Try-in results
   * @returns Updated try-in record
   */
  recordTryInResults(
    tryInRecordId: string,
    results: Pick<TryInRecord, 'clinicianNotes' | 'adjustmentsRequired' | 'patientSatisfaction' | 'photos'>
  ): Promise<TryInRecord>;

  /**
   * Get try-in records for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of try-in records
   */
  getTryInRecords(labCaseId: string): Promise<TryInRecord[]>;

  // ===========================================================================
  // DELIVERY WORKFLOW
  // ===========================================================================

  /**
   * Mark case ready for pickup
   *
   * Transitions to READY_FOR_PICKUP and sends notification.
   *
   * @param labCaseId - Lab case ID
   * @param preparedBy - User ID who prepared the case
   * @returns Updated lab case
   */
  markReadyForPickup(labCaseId: string, preparedBy: string): Promise<LabCase>;

  /**
   * Mark case as in transit
   *
   * @param labCaseId - Lab case ID
   * @param trackingNumber - Optional shipping tracking number
   * @param deliveredBy - Delivery person/service
   * @returns Updated lab case
   */
  markInTransit(
    labCaseId: string,
    trackingNumber: string | undefined,
    deliveredBy: string
  ): Promise<LabCase>;

  /**
   * Mark case as delivered
   *
   * @param labCaseId - Lab case ID
   * @param deliveryDate - Actual delivery date
   * @returns Updated lab case
   */
  markDelivered(labCaseId: string, deliveryDate?: Date): Promise<LabCase>;

  /**
   * Complete a lab case
   *
   * Final status transition after successful try-in or delivery.
   *
   * @param labCaseId - Lab case ID
   * @param completedBy - User ID completing the case
   * @returns Updated lab case
   */
  completeCase(labCaseId: string, completedBy: string): Promise<LabCase>;

  // ===========================================================================
  // COLLABORATION
  // ===========================================================================

  /**
   * Create a collaboration thread
   *
   * @param input - Thread creation data
   * @returns Created thread
   */
  createCollaborationThread(input: CreateCollaborationThread): Promise<CollaborationThread>;

  /**
   * Add message to a thread
   *
   * @param input - Message data
   * @returns Created message
   */
  addMessageToThread(input: AddMessageToThread): Promise<CollaborationMessage>;

  /**
   * Get threads for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of collaboration threads
   */
  getThreadsForCase(labCaseId: string): Promise<CollaborationThread[]>;

  /**
   * Mark thread messages as read
   *
   * @param threadId - Thread ID
   * @param userId - User ID
   */
  markThreadAsRead(threadId: string, userId: string): Promise<void>;

  /**
   * Submit design feedback
   *
   * @param input - Feedback data
   * @returns Created feedback
   */
  submitDesignFeedback(input: CreateDesignFeedback): Promise<DesignFeedback>;

  /**
   * Get feedback for a design
   *
   * @param designId - Design ID
   * @returns Array of design feedback
   */
  getDesignFeedback(designId: string): Promise<DesignFeedback[]>;

  // ===========================================================================
  // SLA MONITORING
  // ===========================================================================

  /**
   * Get SLA tracking for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns SLA tracking data
   */
  getSLATracking(labCaseId: string): Promise<LabSLATracking | null>;

  /**
   * Check for SLA breaches
   *
   * Identifies cases at risk or overdue and returns them.
   *
   * @param clinicId - Clinic ID
   * @returns Cases with SLA issues
   */
  checkSLABreaches(clinicId: string): Promise<Array<{
    labCase: LabCase;
    slaTracking: LabSLATracking;
    breachType: 'AT_RISK' | 'OVERDUE';
  }>>;

  /**
   * Get upcoming SLA deadlines
   *
   * @param clinicId - Clinic ID
   * @param hoursAhead - Hours to look ahead
   * @returns Cases with upcoming deadlines
   */
  getUpcomingSLADeadlines(
    clinicId: string,
    hoursAhead: number
  ): Promise<Array<{ labCase: LabCase; deadline: Date; milestone: string }>>;

  // ===========================================================================
  // ASSIGNMENT
  // ===========================================================================

  /**
   * Assign technician to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param technicianId - Technician user ID
   * @param assignedBy - User ID making the assignment
   */
  assignTechnician(labCaseId: string, technicianId: string, assignedBy: string): Promise<void>;

  /**
   * Assign designer to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param designerId - Designer user ID
   * @param assignedBy - User ID making the assignment
   */
  assignDesigner(labCaseId: string, designerId: string, assignedBy: string): Promise<void>;

  /**
   * Get technician workloads
   *
   * @param clinicId - Clinic ID
   * @returns Array of technician workloads
   */
  getTechnicianWorkloads(clinicId: string): Promise<TechnicianWorkload[]>;

  // ===========================================================================
  // ANALYTICS & REPORTING
  // ===========================================================================

  /**
   * Get lab case statistics
   *
   * @param clinicId - Clinic ID
   * @returns Lab case statistics
   */
  getLabCaseStats(clinicId: string): Promise<LabCaseStats>;

  /**
   * Get lab case dashboard data
   *
   * @param clinicId - Clinic ID
   * @returns Dashboard summary
   */
  getLabDashboard(clinicId: string): Promise<LabCaseDashboard>;

  /**
   * Get performance metrics
   *
   * @param clinicId - Clinic ID
   * @param periodStart - Start date
   * @param periodEnd - End date
   * @returns Performance metrics
   */
  getPerformanceMetrics(
    clinicId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<LabPerformanceMetrics>;

  /**
   * Generate daily lab report
   *
   * @param clinicId - Clinic ID
   * @param date - Report date
   * @returns Daily report
   */
  generateDailyReport(clinicId: string, date: Date): Promise<DailyLabReport>;
}
