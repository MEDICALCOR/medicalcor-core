/**
 * @fileoverview Lab Case Repository Port Interface (Secondary Port)
 *
 * Defines the interface for dental lab case data persistence with comprehensive
 * query capabilities for production workflow management.
 *
 * @module application/ports/secondary/persistence/LabCaseRepository
 *
 * ## Hexagonal Architecture
 *
 * This is a **SECONDARY PORT** (driven port) that defines what the
 * application needs from the infrastructure layer for lab case data access.
 *
 * ## Features
 *
 * - Full lab case CRUD operations
 * - Status transition with audit trail
 * - SLA tracking and monitoring
 * - Performance metrics aggregation
 * - Digital asset management
 * - Collaboration thread management
 */

import type {
  LabCase,
  CreateLabCase,
  UpdateLabCase,
  LabCaseStatus,
  LabCasePriority,
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
  LabNotificationPreferences,
  SLAOverallStatus,
} from '@medicalcor/types';

// =============================================================================
// LAB CASE STATISTICS TYPES
// =============================================================================

/**
 * Lab case statistics summary
 */
export interface LabCaseStats {
  /** Total active cases */
  totalActive: number;
  /** Cases by status */
  byStatus: Record<LabCaseStatus, number>;
  /** Cases by priority */
  byPriority: Record<LabCasePriority, number>;
  /** Cases at SLA risk */
  atRiskCount: number;
  /** Overdue cases */
  overdueCount: number;
  /** Average turnaround days (completed cases) */
  avgTurnaroundDays: number | null;
  /** First-time QC pass rate */
  firstTimeQCPassRate: number | null;
}

/**
 * Lab case dashboard summary for a clinic
 */
export interface LabCaseDashboard {
  /** Today's statistics */
  today: {
    newCases: number;
    completedCases: number;
    designsAwaitingReview: number;
    readyForPickup: number;
  };
  /** SLA health */
  slaHealth: {
    onTrack: number;
    atRisk: number;
    overdue: number;
  };
  /** Production pipeline */
  pipeline: {
    inDesign: number;
    inFabrication: number;
    inQC: number;
    awaitingDelivery: number;
  };
  /** Urgent items requiring attention */
  urgentItems: Array<{
    caseId: string;
    caseNumber: string;
    issue: 'SLA_BREACH' | 'QC_FAILED' | 'REVISION_REQUIRED' | 'URGENT_MESSAGE';
    details: string;
  }>;
}

/**
 * Workload distribution for technicians/designers
 */
export interface TechnicianWorkload {
  userId: string;
  userName: string;
  assignedCases: number;
  inProgressCases: number;
  completedThisWeek: number;
  avgTurnaroundDays: number | null;
}

// =============================================================================
// LAB CASE REPOSITORY PORT INTERFACE
// =============================================================================

/**
 * Lab Case Repository Port Interface
 *
 * Defines the contract for dental lab case data persistence with comprehensive
 * query capabilities for production workflow management.
 *
 * @example
 * ```typescript
 * // Create a new lab case
 * const labCase = await labCaseRepository.create({
 *   clinicId: 'clinic-123',
 *   patientId: 'patient-456',
 *   prescribingDentist: 'Dr. Smith',
 *   prosthetics: [{ type: 'CROWN', material: 'ZIRCONIA', toothNumbers: ['11'] }],
 *   priority: 'STANDARD',
 *   dueDate: new Date('2024-12-20'),
 * }, 'user-789');
 *
 * // Transition status
 * await labCaseRepository.transitionStatus(labCase.id, 'IN_DESIGN', 'user-789');
 * ```
 */
export interface ILabCaseRepository {
  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new lab case
   *
   * @param input - Lab case creation data
   * @param createdBy - User ID of the creator
   * @returns Created lab case with generated ID and case number
   */
  create(input: CreateLabCase, createdBy: string): Promise<LabCase>;

  /**
   * Get a lab case by ID
   *
   * @param id - Lab case ID
   * @returns Lab case or null if not found
   */
  findById(id: string): Promise<LabCase | null>;

  /**
   * Get a lab case by case number
   *
   * @param caseNumber - Human-readable case number (e.g., 'LAB-2024-001234')
   * @returns Lab case or null if not found
   */
  findByCaseNumber(caseNumber: string): Promise<LabCase | null>;

  /**
   * Update a lab case
   *
   * @param id - Lab case ID
   * @param input - Update data
   * @param updatedBy - User ID of the updater
   * @returns Updated lab case
   */
  update(id: string, input: UpdateLabCase, updatedBy: string): Promise<LabCase>;

  /**
   * Soft delete a lab case
   *
   * @param id - Lab case ID
   * @param deletedBy - User ID of the deleter
   */
  softDelete(id: string, deletedBy: string): Promise<void>;

  // ===========================================================================
  // QUERY OPERATIONS
  // ===========================================================================

  /**
   * List lab cases with filtering and pagination
   *
   * @param filters - Query filters
   * @param pagination - Pagination options
   * @returns Paginated list of lab cases
   */
  list(filters: LabCaseQueryFilters, pagination: LabCasePagination): Promise<LabCaseListResponse>;

  /**
   * Get all lab cases for a patient
   *
   * @param patientId - Patient ID
   * @returns Array of lab cases
   */
  findByPatientId(patientId: string): Promise<LabCase[]>;

  /**
   * Get lab cases assigned to a technician
   *
   * @param technicianId - Technician user ID
   * @param activeOnly - If true, only return active (non-completed) cases
   * @returns Array of lab cases
   */
  findByAssignedTechnician(technicianId: string, activeOnly?: boolean): Promise<LabCase[]>;

  /**
   * Get lab cases assigned to a designer
   *
   * @param designerId - Designer user ID
   * @param activeOnly - If true, only return active (non-completed) cases
   * @returns Array of lab cases
   */
  findByAssignedDesigner(designerId: string, activeOnly?: boolean): Promise<LabCase[]>;

  /**
   * Search lab cases by text (case number, patient name, notes)
   *
   * @param clinicId - Clinic ID
   * @param searchText - Search query
   * @param limit - Maximum results
   * @returns Array of matching lab cases
   */
  search(clinicId: string, searchText: string, limit?: number): Promise<LabCase[]>;

  // ===========================================================================
  // STATUS MANAGEMENT
  // ===========================================================================

  /**
   * Transition lab case to a new status
   *
   * Validates the transition is allowed, updates status, and records history.
   *
   * @param id - Lab case ID
   * @param newStatus - New status
   * @param changedBy - User ID making the change
   * @param reason - Optional reason for the change
   * @returns Updated lab case
   * @throws Error if transition is not valid
   */
  transitionStatus(
    id: string,
    newStatus: LabCaseStatus,
    changedBy: string,
    reason?: string
  ): Promise<LabCase>;

  /**
   * Get status history for a lab case
   *
   * @param id - Lab case ID
   * @returns Array of status history entries, ordered by date descending
   */
  getStatusHistory(id: string): Promise<StatusHistoryEntry[]>;

  /**
   * Get lab cases by status
   *
   * @param clinicId - Clinic ID
   * @param statuses - Array of statuses to filter by
   * @returns Array of lab cases
   */
  findByStatus(clinicId: string, statuses: LabCaseStatus[]): Promise<LabCase[]>;

  // ===========================================================================
  // DIGITAL SCAN MANAGEMENT
  // ===========================================================================

  /**
   * Add a digital scan to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param scan - Scan data
   * @returns Created digital scan
   */
  addScan(labCaseId: string, scan: CreateDigitalScan): Promise<DigitalScan>;

  /**
   * Get all scans for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of digital scans
   */
  getScans(labCaseId: string): Promise<DigitalScan[]>;

  /**
   * Update scan processing status
   *
   * @param scanId - Scan ID
   * @param processed - Whether the scan has been processed
   * @param errors - Optional array of processing errors
   */
  updateScanStatus(scanId: string, processed: boolean, errors?: string[]): Promise<void>;

  // ===========================================================================
  // CAD DESIGN MANAGEMENT
  // ===========================================================================

  /**
   * Add a CAD design to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param design - Design data
   * @returns Created CAD design
   */
  addDesign(labCaseId: string, design: CreateCADDesign): Promise<CADDesign>;

  /**
   * Get all designs for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of CAD designs, ordered by revision number
   */
  getDesigns(labCaseId: string): Promise<CADDesign[]>;

  /**
   * Get the current (latest approved or pending) design
   *
   * @param labCaseId - Lab case ID
   * @returns Current design or null
   */
  getCurrentDesign(labCaseId: string): Promise<CADDesign | null>;

  /**
   * Approve or reject a design
   *
   * @param input - Approval data
   * @returns Updated design
   */
  approveDesign(input: ApproveDesign): Promise<CADDesign>;

  /**
   * Get designs awaiting review
   *
   * @param clinicId - Clinic ID
   * @returns Array of lab cases with pending designs
   */
  getDesignsAwaitingReview(clinicId: string): Promise<LabCase[]>;

  // ===========================================================================
  // FABRICATION MANAGEMENT
  // ===========================================================================

  /**
   * Add a fabrication record to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param record - Fabrication record data
   * @returns Created fabrication record
   */
  addFabricationRecord(labCaseId: string, record: CreateFabricationRecord): Promise<FabricationRecord>;

  /**
   * Get all fabrication records for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of fabrication records
   */
  getFabricationRecords(labCaseId: string): Promise<FabricationRecord[]>;

  /**
   * Complete a fabrication record
   *
   * @param recordId - Fabrication record ID
   * @param completedAt - Completion timestamp
   */
  completeFabrication(recordId: string, completedAt?: Date): Promise<void>;

  // ===========================================================================
  // QUALITY CONTROL
  // ===========================================================================

  /**
   * Add a QC inspection to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param inspection - QC inspection data
   * @returns Created QC inspection
   */
  addQCInspection(labCaseId: string, inspection: CreateQCInspection): Promise<QCInspection>;

  /**
   * Get all QC inspections for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of QC inspections
   */
  getQCInspections(labCaseId: string): Promise<QCInspection[]>;

  /**
   * Get the latest QC inspection for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Latest QC inspection or null
   */
  getLatestQCInspection(labCaseId: string): Promise<QCInspection | null>;

  // ===========================================================================
  // TRY-IN MANAGEMENT
  // ===========================================================================

  /**
   * Add a try-in record to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param record - Try-in record data
   * @returns Created try-in record
   */
  addTryInRecord(labCaseId: string, record: CreateTryInRecord): Promise<TryInRecord>;

  /**
   * Get all try-in records for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of try-in records
   */
  getTryInRecords(labCaseId: string): Promise<TryInRecord[]>;

  /**
   * Update a try-in record with completion data
   *
   * @param recordId - Try-in record ID
   * @param data - Update data
   * @returns Updated try-in record
   */
  updateTryInRecord(
    recordId: string,
    data: Partial<Pick<TryInRecord, 'completedAt' | 'clinicianNotes' | 'adjustmentsRequired' | 'patientSatisfaction' | 'photos'>>
  ): Promise<TryInRecord>;

  // ===========================================================================
  // SLA TRACKING
  // ===========================================================================

  /**
   * Get SLA tracking for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns SLA tracking data or null
   */
  getSLATracking(labCaseId: string): Promise<LabSLATracking | null>;

  /**
   * Update SLA tracking for a lab case
   *
   * @param labCaseId - Lab case ID
   * @param tracking - Updated tracking data
   */
  updateSLATracking(labCaseId: string, tracking: Partial<LabSLATracking>): Promise<void>;

  /**
   * Get all cases with SLA issues
   *
   * @param clinicId - Clinic ID
   * @param status - SLA status to filter by (AT_RISK or OVERDUE)
   * @returns Array of lab cases with SLA tracking
   */
  getCasesWithSLAIssues(
    clinicId: string,
    status: SLAOverallStatus
  ): Promise<Array<{ labCase: LabCase; slaTracking: LabSLATracking }>>;

  /**
   * Get upcoming SLA deadlines
   *
   * @param clinicId - Clinic ID
   * @param hoursAhead - Number of hours to look ahead
   * @returns Array of lab cases with upcoming deadlines
   */
  getUpcomingSLADeadlines(
    clinicId: string,
    hoursAhead: number
  ): Promise<Array<{ labCase: LabCase; deadline: Date; milestone: string }>>;

  // ===========================================================================
  // STATISTICS & METRICS
  // ===========================================================================

  /**
   * Get lab case statistics for a clinic
   *
   * @param clinicId - Clinic ID
   * @returns Lab case statistics
   */
  getStats(clinicId: string): Promise<LabCaseStats>;

  /**
   * Get lab case dashboard data
   *
   * @param clinicId - Clinic ID
   * @returns Dashboard summary
   */
  getDashboard(clinicId: string): Promise<LabCaseDashboard>;

  /**
   * Get performance metrics for a period
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
   * Get technician workload distribution
   *
   * @param clinicId - Clinic ID
   * @returns Array of technician workloads
   */
  getTechnicianWorkloads(clinicId: string): Promise<TechnicianWorkload[]>;

  // ===========================================================================
  // ASSIGNMENT
  // ===========================================================================

  /**
   * Assign a technician to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param technicianId - Technician user ID
   * @param assignedBy - User ID making the assignment
   */
  assignTechnician(labCaseId: string, technicianId: string, assignedBy: string): Promise<void>;

  /**
   * Assign a designer to a lab case
   *
   * @param labCaseId - Lab case ID
   * @param designerId - Designer user ID
   * @param assignedBy - User ID making the assignment
   */
  assignDesigner(labCaseId: string, designerId: string, assignedBy: string): Promise<void>;

  /**
   * Unassign a technician from a lab case
   *
   * @param labCaseId - Lab case ID
   * @param unassignedBy - User ID making the unassignment
   */
  unassignTechnician(labCaseId: string, unassignedBy: string): Promise<void>;

  /**
   * Unassign a designer from a lab case
   *
   * @param labCaseId - Lab case ID
   * @param unassignedBy - User ID making the unassignment
   */
  unassignDesigner(labCaseId: string, unassignedBy: string): Promise<void>;
}

// =============================================================================
// COLLABORATION REPOSITORY PORT INTERFACE
// =============================================================================

/**
 * Lab Collaboration Repository Port Interface
 *
 * Defines the contract for clinic-lab collaboration data persistence
 * including messaging threads and design feedback.
 */
export interface ILabCollaborationRepository {
  // ===========================================================================
  // THREAD MANAGEMENT
  // ===========================================================================

  /**
   * Create a new collaboration thread
   *
   * @param input - Thread creation data
   * @returns Created thread
   */
  createThread(input: CreateCollaborationThread): Promise<CollaborationThread>;

  /**
   * Get a thread by ID
   *
   * @param threadId - Thread ID
   * @returns Thread or null
   */
  getThread(threadId: string): Promise<CollaborationThread | null>;

  /**
   * Get all threads for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of threads
   */
  getThreadsForCase(labCaseId: string): Promise<CollaborationThread[]>;

  /**
   * Add a message to a thread
   *
   * @param input - Message data
   * @returns Created message
   */
  addMessage(input: AddMessageToThread): Promise<CollaborationMessage>;

  /**
   * Mark messages as read
   *
   * @param threadId - Thread ID
   * @param userId - User ID marking as read
   * @param upToMessageId - Mark all messages up to this ID as read
   */
  markMessagesRead(threadId: string, userId: string, upToMessageId?: string): Promise<void>;

  /**
   * Get unread message count for a user
   *
   * @param userId - User ID
   * @returns Total unread count across all threads
   */
  getUnreadCount(userId: string): Promise<number>;

  /**
   * Update thread status
   *
   * @param threadId - Thread ID
   * @param status - New status
   */
  updateThreadStatus(threadId: string, status: CollaborationThread['status']): Promise<void>;

  /**
   * Resolve a thread
   *
   * @param threadId - Thread ID
   * @param resolvedBy - User ID resolving the thread
   */
  resolveThread(threadId: string, resolvedBy: string): Promise<void>;

  // ===========================================================================
  // DESIGN FEEDBACK
  // ===========================================================================

  /**
   * Add design feedback
   *
   * @param input - Feedback data
   * @returns Created feedback
   */
  addDesignFeedback(input: CreateDesignFeedback): Promise<DesignFeedback>;

  /**
   * Get all feedback for a design
   *
   * @param designId - Design ID
   * @returns Array of feedback
   */
  getDesignFeedback(designId: string): Promise<DesignFeedback[]>;

  /**
   * Get all feedback for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Array of feedback
   */
  getFeedbackForCase(labCaseId: string): Promise<DesignFeedback[]>;

  // ===========================================================================
  // NOTIFICATION PREFERENCES
  // ===========================================================================

  /**
   * Get notification preferences for a user
   *
   * @param userId - User ID
   * @returns Notification preferences or null
   */
  getNotificationPreferences(userId: string): Promise<LabNotificationPreferences | null>;

  /**
   * Update notification preferences
   *
   * @param userId - User ID
   * @param preferences - Updated preferences
   */
  updateNotificationPreferences(
    userId: string,
    preferences: Partial<LabNotificationPreferences>
  ): Promise<void>;
}
