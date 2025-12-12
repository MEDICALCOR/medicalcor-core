/**
 * @fileoverview PostgreSQL Lab Case Repository (Infrastructure Layer)
 *
 * Production-grade PostgreSQL adapter implementing ILabCaseRepository and
 * ILabCollaborationRepository ports from the application layer.
 *
 * @module @medicalcor/infrastructure/repositories/postgres-lab-case-repository
 *
 * ## Strategic Design Patterns
 *
 * 1. **Repository Pattern**: Encapsulates data access logic, providing domain-oriented interface
 * 2. **Unit of Work Pattern**: Transaction management with automatic rollback on failure
 * 3. **Query Builder Pattern**: Type-safe dynamic query construction
 * 4. **Factory Pattern**: Standardized object creation from database rows
 * 5. **Strategy Pattern**: Pluggable query strategies for different filter combinations
 *
 * ## Hexagonal Architecture
 *
 * This is an **ADAPTER** implementing ports defined in the application layer:
 * - ILabCaseRepository: Lab case persistence operations
 * - ILabCollaborationRepository: Collaboration and messaging operations
 *
 * @example
 * ```typescript
 * import { PostgresLabCaseRepository } from '@medicalcor/infrastructure';
 *
 * const repository = new PostgresLabCaseRepository({
 *   connectionString: process.env.DATABASE_URL,
 *   maxConnections: 20,
 * });
 *
 * const labCase = await repository.findById('uuid');
 * const dashboard = await repository.getDashboard('clinic-uuid');
 * ```
 */

import { Pool, PoolClient } from 'pg';
import { createLogger, RecordNotFoundError } from '@medicalcor/core';

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
  LabCasePriority,
} from '@medicalcor/types';

import type {
  ILabCaseRepository,
  ILabCollaborationRepository,
  LabCaseStats,
  LabCaseDashboard,
  TechnicianWorkload,
  SLAStatus,
} from '@medicalcor/application/ports/secondary/persistence/LabCaseRepository';

// =============================================================================
// LOGGER
// =============================================================================

const logger = createLogger({ name: 'PostgresLabCaseRepository' });

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Repository configuration with sensible defaults
 */
export interface PostgresLabCaseRepositoryConfig {
  /** PostgreSQL connection string */
  connectionString: string;
  /** Maximum connections in the pool (default: 20) */
  maxConnections?: number;
  /** Connection timeout in ms (default: 30000) */
  connectionTimeoutMs?: number;
  /** Idle timeout in ms (default: 10000) */
  idleTimeoutMs?: number;
  /** Enable query logging for debugging (default: false) */
  enableQueryLogging?: boolean;
  /** Default page size for paginated queries (default: 50) */
  defaultPageSize?: number;
}

const DEFAULT_CONFIG: Required<Omit<PostgresLabCaseRepositoryConfig, 'connectionString'>> = {
  maxConnections: 20,
  connectionTimeoutMs: 30000,
  idleTimeoutMs: 10000,
  enableQueryLogging: false,
  defaultPageSize: 50,
};

// =============================================================================
// DATABASE ROW TYPES (Internal)
// =============================================================================

interface LabCaseRow {
  id: string;
  case_number: string;
  clinic_id: string;
  patient_id: string;
  prescribing_dentist: string;
  status: string;
  priority: string;
  received_at: Date;
  due_date: Date;
  completed_at: Date | null;
  shade_guide: string | null;
  shade_value: string | null;
  special_instructions: string | null;
  internal_notes: string | null;
  assigned_technician: string | null;
  assigned_designer: string | null;
  estimated_hours: number | null;
  actual_hours: number | null;
  rush_fee: string | null;
  total_cost: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  version: number;
}

interface DigitalScanRow {
  id: string;
  lab_case_id: string;
  scan_type: string;
  file_format: string;
  storage_path: string;
  file_size_bytes: number;
  checksum: string | null;
  scanner_brand: string | null;
  scanner_model: string | null;
  scan_date: Date;
  uploaded_by: string;
  quality_score: number | null;
  notes: string | null;
  created_at: Date;
}

interface CADDesignRow {
  id: string;
  lab_case_id: string;
  version: number;
  software_name: string;
  software_version: string | null;
  file_format: string;
  storage_path: string;
  file_size_bytes: number;
  designed_by: string;
  design_hours: number | null;
  approval_status: string;
  approved_by: string | null;
  approved_at: Date | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

interface FabricationRecordRow {
  id: string;
  lab_case_id: string;
  method: string;
  equipment_id: string | null;
  material_lot_number: string | null;
  material_expiry: Date | null;
  technician_id: string;
  started_at: Date;
  completed_at: Date | null;
  machine_time_minutes: number | null;
  parameters: Record<string, unknown>;
  notes: string | null;
  created_at: Date;
}

interface QCInspectionRow {
  id: string;
  lab_case_id: string;
  inspection_type: string;
  inspected_by: string;
  inspected_at: Date;
  passed: boolean;
  overall_score: number;
  criteria: Record<string, unknown>;
  defects_found: string[] | null;
  corrective_actions: string | null;
  photos: string[] | null;
  notes: string | null;
  created_at: Date;
}

interface TryInRecordRow {
  id: string;
  lab_case_id: string;
  scheduled_at: Date;
  completed_at: Date | null;
  clinician_id: string;
  clinician_notes: string | null;
  patient_satisfaction: number | null;
  adjustments_required: string[] | null;
  photos: string[] | null;
  created_at: Date;
  updated_at: Date;
}

interface StatusHistoryRow {
  id: string;
  lab_case_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string;
  changed_at: Date;
  reason: string | null;
  metadata: Record<string, unknown>;
}

interface SLATrackingRow {
  id: string;
  lab_case_id: string;
  sla_type: string;
  milestones: Array<{
    name: string;
    status: string;
    expectedBy: string;
    completedAt?: string;
  }>;
  overall_status: string;
  days_remaining: number;
  percent_complete: number;
  created_at: Date;
  updated_at: Date;
}

interface CollaborationThreadRow {
  id: string;
  lab_case_id: string;
  subject: string;
  thread_type: string;
  priority: string;
  status: string;
  participants: string[];
  created_by: string;
  created_at: Date;
  updated_at: Date;
  last_message_at: Date | null;
}

interface CollaborationMessageRow {
  id: string;
  thread_id: string;
  sender_id: string;
  sender_type: string;
  content: string;
  attachments: Array<{ url: string; filename: string; mimeType: string }> | null;
  created_at: Date;
  edited_at: Date | null;
}

interface DesignFeedbackRow {
  id: string;
  lab_case_id: string;
  design_id: string;
  feedback_type: string;
  provided_by: string;
  content: string;
  annotations: Record<string, unknown> | null;
  created_at: Date;
}

// =============================================================================
// QUERY BUILDER (Strategy Pattern)
// =============================================================================

/**
 * Type-safe query builder for lab case queries
 */
class LabCaseQueryBuilder {
  private conditions: string[] = ['deleted_at IS NULL'];
  private params: unknown[] = [];
  private paramIndex = 1;

  addCondition(condition: string, value: unknown): this {
    this.conditions.push(condition.replace('?', `$${this.paramIndex++}`));
    this.params.push(value);
    return this;
  }

  addArrayCondition(column: string, values: unknown[]): this {
    this.conditions.push(`${column} = ANY($${this.paramIndex++})`);
    this.params.push(values);
    return this;
  }

  addRangeCondition(column: string, min?: unknown, max?: unknown): this {
    if (min !== undefined) {
      this.conditions.push(`${column} >= $${this.paramIndex++}`);
      this.params.push(min);
    }
    if (max !== undefined) {
      this.conditions.push(`${column} <= $${this.paramIndex++}`);
      this.params.push(max);
    }
    return this;
  }

  addSearchCondition(columns: string[], searchText: string): this {
    const searchConditions = columns.map(
      (col) => `${col} ILIKE $${this.paramIndex}`
    );
    this.conditions.push(`(${searchConditions.join(' OR ')})`);
    this.params.push(`%${searchText}%`);
    this.paramIndex++;
    return this;
  }

  getWhereClause(): string {
    return this.conditions.join(' AND ');
  }

  getParams(): unknown[] {
    return this.params;
  }

  getNextParamIndex(): number {
    return this.paramIndex;
  }
}

// =============================================================================
// ROW MAPPER FACTORY (Factory Pattern)
// =============================================================================

/**
 * Factory for converting database rows to domain entities
 */
class LabCaseRowMapper {
  static toLabCase(row: LabCaseRow): LabCase {
    return {
      id: row.id,
      caseNumber: row.case_number,
      clinicId: row.clinic_id,
      patientId: row.patient_id,
      prescribingDentist: row.prescribing_dentist,
      status: row.status as LabCaseStatus,
      priority: row.priority as LabCasePriority,
      receivedAt: row.received_at,
      dueDate: row.due_date,
      completedAt: row.completed_at ?? undefined,
      shadeGuide: row.shade_guide ?? undefined,
      shadeValue: row.shade_value ?? undefined,
      specialInstructions: row.special_instructions ?? undefined,
      internalNotes: row.internal_notes ?? undefined,
      assignedTechnician: row.assigned_technician ?? undefined,
      assignedDesigner: row.assigned_designer ?? undefined,
      estimatedHours: row.estimated_hours ?? undefined,
      actualHours: row.actual_hours ?? undefined,
      rushFee: row.rush_fee ? parseFloat(row.rush_fee) : undefined,
      totalCost: row.total_cost ? parseFloat(row.total_cost) : undefined,
      notes: row.notes ?? undefined,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
    };
  }

  static toDigitalScan(row: DigitalScanRow): DigitalScan {
    return {
      id: row.id,
      labCaseId: row.lab_case_id,
      scanType: row.scan_type as DigitalScan['scanType'],
      fileFormat: row.file_format as DigitalScan['fileFormat'],
      storagePath: row.storage_path,
      fileSizeBytes: row.file_size_bytes,
      checksum: row.checksum ?? undefined,
      scannerBrand: row.scanner_brand ?? undefined,
      scannerModel: row.scanner_model ?? undefined,
      scanDate: row.scan_date,
      uploadedBy: row.uploaded_by,
      qualityScore: row.quality_score ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    };
  }

  static toCADDesign(row: CADDesignRow): CADDesign {
    return {
      id: row.id,
      labCaseId: row.lab_case_id,
      version: row.version,
      softwareName: row.software_name,
      softwareVersion: row.software_version ?? undefined,
      fileFormat: row.file_format as CADDesign['fileFormat'],
      storagePath: row.storage_path,
      fileSizeBytes: row.file_size_bytes,
      designedBy: row.designed_by,
      designHours: row.design_hours ?? undefined,
      approvalStatus: row.approval_status as CADDesign['approvalStatus'],
      approvedBy: row.approved_by ?? undefined,
      approvedAt: row.approved_at ?? undefined,
      notes: row.notes ?? undefined,
      metadata: row.metadata,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static toFabricationRecord(row: FabricationRecordRow): FabricationRecord {
    return {
      id: row.id,
      labCaseId: row.lab_case_id,
      method: row.method as FabricationRecord['method'],
      equipmentId: row.equipment_id ?? undefined,
      materialLotNumber: row.material_lot_number ?? undefined,
      materialExpiry: row.material_expiry ?? undefined,
      technicianId: row.technician_id,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? undefined,
      machineTimeMinutes: row.machine_time_minutes ?? undefined,
      parameters: row.parameters,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    };
  }

  static toQCInspection(row: QCInspectionRow): QCInspection {
    return {
      id: row.id,
      labCaseId: row.lab_case_id,
      inspectionType: row.inspection_type as QCInspection['inspectionType'],
      inspectedBy: row.inspected_by,
      inspectedAt: row.inspected_at,
      passed: row.passed,
      overallScore: row.overall_score,
      criteria: row.criteria as QCInspection['criteria'],
      defectsFound: row.defects_found ?? undefined,
      correctiveActions: row.corrective_actions ?? undefined,
      photos: row.photos ?? undefined,
      notes: row.notes ?? undefined,
      createdAt: row.created_at,
    };
  }

  static toTryInRecord(row: TryInRecordRow): TryInRecord {
    return {
      id: row.id,
      labCaseId: row.lab_case_id,
      scheduledAt: row.scheduled_at,
      completedAt: row.completed_at ?? undefined,
      clinicianId: row.clinician_id,
      clinicianNotes: row.clinician_notes ?? undefined,
      patientSatisfaction: row.patient_satisfaction ?? undefined,
      adjustmentsRequired: row.adjustments_required ?? undefined,
      photos: row.photos ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  static toStatusHistoryEntry(row: StatusHistoryRow): StatusHistoryEntry {
    return {
      id: row.id,
      labCaseId: row.lab_case_id,
      fromStatus: row.from_status as LabCaseStatus | undefined,
      toStatus: row.to_status as LabCaseStatus,
      changedBy: row.changed_by,
      changedAt: row.changed_at,
      reason: row.reason ?? undefined,
      metadata: row.metadata,
    };
  }

  static toSLATracking(row: SLATrackingRow): LabSLATracking {
    return {
      labCaseId: row.lab_case_id,
      slaType: row.sla_type as LabSLATracking['slaType'],
      milestones: row.milestones.map((m) => ({
        name: m.name,
        status: m.status as 'PENDING' | 'COMPLETED' | 'OVERDUE',
        expectedBy: new Date(m.expectedBy),
        completedAt: m.completedAt ? new Date(m.completedAt) : undefined,
      })),
      overallStatus: row.overall_status as SLAStatus,
      daysRemaining: row.days_remaining,
      percentComplete: row.percent_complete,
    };
  }

  static toCollaborationThread(row: CollaborationThreadRow): CollaborationThread {
    return {
      id: row.id,
      labCaseId: row.lab_case_id,
      subject: row.subject,
      threadType: row.thread_type as CollaborationThread['threadType'],
      priority: row.priority as CollaborationThread['priority'],
      status: row.status as CollaborationThread['status'],
      participants: row.participants,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at ?? undefined,
    };
  }

  static toCollaborationMessage(row: CollaborationMessageRow): CollaborationMessage {
    return {
      id: row.id,
      threadId: row.thread_id,
      senderId: row.sender_id,
      senderType: row.sender_type as CollaborationMessage['senderType'],
      content: row.content,
      attachments: row.attachments ?? undefined,
      createdAt: row.created_at,
      editedAt: row.edited_at ?? undefined,
    };
  }

  static toDesignFeedback(row: DesignFeedbackRow): DesignFeedback {
    return {
      id: row.id,
      labCaseId: row.lab_case_id,
      designId: row.design_id,
      feedbackType: row.feedback_type as DesignFeedback['feedbackType'],
      providedBy: row.provided_by,
      content: row.content,
      annotations: row.annotations ?? undefined,
      createdAt: row.created_at,
    };
  }
}

// =============================================================================
// UNIT OF WORK (Transaction Management)
// =============================================================================

/**
 * Unit of Work for managing database transactions
 */
class UnitOfWork {
  private client: PoolClient | null = null;

  constructor(private readonly pool: Pool) {}

  async begin(): Promise<PoolClient> {
    this.client = await this.pool.connect();
    await this.client.query('BEGIN');
    return this.client;
  }

  async commit(): Promise<void> {
    if (this.client) {
      await this.client.query('COMMIT');
      this.client.release();
      this.client = null;
    }
  }

  async rollback(): Promise<void> {
    if (this.client) {
      await this.client.query('ROLLBACK');
      this.client.release();
      this.client = null;
    }
  }

  async execute<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.begin();
    try {
      const result = await operation(client);
      await this.commit();
      return result;
    } catch (error) {
      await this.rollback();
      throw error;
    }
  }
}

// =============================================================================
// REPOSITORY IMPLEMENTATION
// =============================================================================

/**
 * PostgreSQL Lab Case Repository
 *
 * Production-grade implementation with:
 * - Connection pooling with health monitoring
 * - Transaction management via Unit of Work
 * - Type-safe query building
 * - Comprehensive error handling
 * - Query performance logging
 */
export class PostgresLabCaseRepository implements ILabCaseRepository, ILabCollaborationRepository {
  private readonly pool: Pool;
  private readonly config: Required<Omit<PostgresLabCaseRepositoryConfig, 'connectionString'>>;

  constructor(config: PostgresLabCaseRepositoryConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.pool = new Pool({
      connectionString: config.connectionString,
      max: this.config.maxConnections,
      connectionTimeoutMillis: this.config.connectionTimeoutMs,
      idleTimeoutMillis: this.config.idleTimeoutMs,
    });

    // Pool error handling
    this.pool.on('error', (err) => {
      logger.error({ error: err }, 'Unexpected pool error');
    });

    logger.info(
      { maxConnections: this.config.maxConnections },
      'PostgresLabCaseRepository initialized'
    );
  }

  // ===========================================================================
  // LAB CASE CRUD OPERATIONS
  // ===========================================================================

  async findById(id: string): Promise<LabCase | null> {
    const sql = `
      SELECT * FROM lab_cases
      WHERE id = $1 AND deleted_at IS NULL
    `;

    const result = await this.query<LabCaseRow>(sql, [id]);
    return result.rows[0] ? LabCaseRowMapper.toLabCase(result.rows[0]) : null;
  }

  async findByCaseNumber(caseNumber: string): Promise<LabCase | null> {
    const sql = `
      SELECT * FROM lab_cases
      WHERE case_number = $1 AND deleted_at IS NULL
    `;

    const result = await this.query<LabCaseRow>(sql, [caseNumber]);
    return result.rows[0] ? LabCaseRowMapper.toLabCase(result.rows[0]) : null;
  }

  async create(input: CreateLabCase, createdBy: string): Promise<LabCase> {
    const uow = new UnitOfWork(this.pool);

    return uow.execute(async (client) => {
      const caseNumber = await this.generateCaseNumber(client, input.clinicId);

      // Insert lab case
      const caseSql = `
        INSERT INTO lab_cases (
          id, case_number, clinic_id, patient_id, prescribing_dentist,
          status, priority, received_at, due_date,
          shade_guide, shade_value, special_instructions, internal_notes,
          notes, metadata, created_at, updated_at, version
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4,
          'RECEIVED', $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, NOW(), NOW(), 1
        )
        RETURNING *
      `;

      const caseResult = await client.query<LabCaseRow>(caseSql, [
        caseNumber,
        input.clinicId,
        input.patientId,
        input.prescribingDentist,
        input.priority,
        input.receivedAt ?? new Date(),
        input.dueDate,
        input.shadeGuide ?? null,
        input.shadeValue ?? null,
        input.specialInstructions ?? null,
        input.internalNotes ?? null,
        input.notes ?? null,
        input.metadata ?? {},
      ]);

      const labCase = LabCaseRowMapper.toLabCase(caseResult.rows[0]!);

      // Insert prosthetics
      if (input.prosthetics.length > 0) {
        const prostheticsSql = `
          INSERT INTO lab_case_prosthetics (
            id, lab_case_id, tooth_number, prosthetic_type, material,
            specifications, created_at
          ) VALUES (
            gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
          )
        `;

        for (const prosthetic of input.prosthetics) {
          await client.query(prostheticsSql, [
            labCase.id,
            prosthetic.toothNumber,
            prosthetic.prostheticType,
            prosthetic.material,
            JSON.stringify(prosthetic.specifications ?? {}),
          ]);
        }
      }

      // Record status history
      await this.recordStatusChange(client, labCase.id, null, 'RECEIVED', createdBy);

      logger.info({ labCaseId: labCase.id, caseNumber }, 'Lab case created');

      return labCase;
    });
  }

  async update(id: string, input: UpdateLabCase, updatedBy: string): Promise<LabCase> {
    const setClauses: string[] = ['updated_at = NOW()', 'version = version + 1'];
    const params: unknown[] = [id];
    let paramIndex = 2;

    const fieldMap: Record<string, string> = {
      priority: 'priority',
      dueDate: 'due_date',
      shadeGuide: 'shade_guide',
      shadeValue: 'shade_value',
      specialInstructions: 'special_instructions',
      internalNotes: 'internal_notes',
      assignedTechnician: 'assigned_technician',
      assignedDesigner: 'assigned_designer',
      estimatedHours: 'estimated_hours',
      actualHours: 'actual_hours',
      rushFee: 'rush_fee',
      totalCost: 'total_cost',
      notes: 'notes',
      metadata: 'metadata',
    };

    for (const [key, value] of Object.entries(input)) {
      const column = fieldMap[key];
      if (column && value !== undefined) {
        setClauses.push(`${column} = $${paramIndex++}`);
        params.push(value);
      }
    }

    const sql = `
      UPDATE lab_cases
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.query<LabCaseRow>(sql, params);

    if (result.rows.length === 0) {
      throw new RecordNotFoundError('LabCaseRepository', 'LabCase', id);
    }

    logger.info({ labCaseId: id, updatedBy }, 'Lab case updated');

    return LabCaseRowMapper.toLabCase(result.rows[0]!);
  }

  async transitionStatus(
    id: string,
    newStatus: LabCaseStatus,
    changedBy: string,
    reason?: string
  ): Promise<LabCase> {
    const uow = new UnitOfWork(this.pool);

    return uow.execute(async (client) => {
      // Get current status with lock
      const currentSql = `
        SELECT status FROM lab_cases
        WHERE id = $1 AND deleted_at IS NULL
        FOR UPDATE
      `;
      const currentResult = await client.query<{ status: string }>(currentSql, [id]);

      if (currentResult.rows.length === 0) {
        throw new RecordNotFoundError('LabCaseRepository', 'LabCase', id);
      }

      const fromStatus = currentResult.rows[0]!.status as LabCaseStatus;

      // Update status
      const updateSql = `
        UPDATE lab_cases
        SET status = $2,
            completed_at = CASE WHEN $2 = 'COMPLETED' THEN NOW() ELSE completed_at END,
            updated_at = NOW(),
            version = version + 1
        WHERE id = $1
        RETURNING *
      `;

      const result = await client.query<LabCaseRow>(updateSql, [id, newStatus]);

      // Record history
      await this.recordStatusChange(client, id, fromStatus, newStatus, changedBy, reason);

      logger.info(
        { labCaseId: id, fromStatus, toStatus: newStatus, changedBy },
        'Lab case status transitioned'
      );

      return LabCaseRowMapper.toLabCase(result.rows[0]!);
    });
  }

  async list(
    filters: LabCaseQueryFilters,
    pagination: LabCasePagination
  ): Promise<LabCaseListResponse> {
    const builder = new LabCaseQueryBuilder();

    // Apply filters using Strategy Pattern
    if (filters.clinicId) {
      builder.addCondition('clinic_id = ?', filters.clinicId);
    }
    if (filters.patientId) {
      builder.addCondition('patient_id = ?', filters.patientId);
    }
    if (filters.statuses && filters.statuses.length > 0) {
      builder.addArrayCondition('status', filters.statuses);
    }
    if (filters.priorities && filters.priorities.length > 0) {
      builder.addArrayCondition('priority', filters.priorities);
    }
    if (filters.assignedTechnician) {
      builder.addCondition('assigned_technician = ?', filters.assignedTechnician);
    }
    if (filters.assignedDesigner) {
      builder.addCondition('assigned_designer = ?', filters.assignedDesigner);
    }
    if (filters.dueDateFrom || filters.dueDateTo) {
      builder.addRangeCondition('due_date', filters.dueDateFrom, filters.dueDateTo);
    }
    if (filters.receivedFrom || filters.receivedTo) {
      builder.addRangeCondition('received_at', filters.receivedFrom, filters.receivedTo);
    }
    if (filters.searchText) {
      builder.addSearchCondition(
        ['case_number', 'notes', 'special_instructions'],
        filters.searchText
      );
    }

    const whereClause = builder.getWhereClause();
    const params = builder.getParams();
    let paramIndex = builder.getNextParamIndex();

    // Count query
    const countSql = `SELECT COUNT(*) as total FROM lab_cases WHERE ${whereClause}`;
    const countResult = await this.query<{ total: string }>(countSql, params);
    const total = parseInt(countResult.rows[0]?.total ?? '0', 10);

    // Data query with pagination
    const sortColumn = this.mapSortColumn(pagination.sortBy ?? 'receivedAt');
    const sortOrder = (pagination.sortOrder ?? 'desc').toUpperCase();
    const limit = pagination.pageSize ?? this.config.defaultPageSize;
    const offset = ((pagination.page ?? 1) - 1) * limit;

    const dataSql = `
      SELECT * FROM lab_cases
      WHERE ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const dataResult = await this.query<LabCaseRow>(dataSql, [...params, limit, offset]);
    const data = dataResult.rows.map(LabCaseRowMapper.toLabCase);

    return {
      data,
      total,
      page: pagination.page ?? 1,
      pageSize: limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async search(clinicId: string, searchText: string, limit = 20): Promise<LabCase[]> {
    const sql = `
      SELECT * FROM lab_cases
      WHERE clinic_id = $1
        AND deleted_at IS NULL
        AND (
          case_number ILIKE $2
          OR notes ILIKE $2
          OR special_instructions ILIKE $2
        )
      ORDER BY received_at DESC
      LIMIT $3
    `;

    const result = await this.query<LabCaseRow>(sql, [clinicId, `%${searchText}%`, limit]);
    return result.rows.map(LabCaseRowMapper.toLabCase);
  }

  // ===========================================================================
  // DIGITAL SCANS
  // ===========================================================================

  async getScans(labCaseId: string): Promise<DigitalScan[]> {
    const sql = `
      SELECT * FROM lab_case_scans
      WHERE lab_case_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.query<DigitalScanRow>(sql, [labCaseId]);
    return result.rows.map(LabCaseRowMapper.toDigitalScan);
  }

  async addScan(labCaseId: string, scan: CreateDigitalScan): Promise<DigitalScan> {
    const sql = `
      INSERT INTO lab_case_scans (
        id, lab_case_id, scan_type, file_format, storage_path,
        file_size_bytes, checksum, scanner_brand, scanner_model,
        scan_date, uploaded_by, quality_score, notes, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12, NOW()
      )
      RETURNING *
    `;

    const result = await this.query<DigitalScanRow>(sql, [
      labCaseId,
      scan.scanType,
      scan.fileFormat,
      scan.storagePath,
      scan.fileSizeBytes,
      scan.checksum ?? null,
      scan.scannerBrand ?? null,
      scan.scannerModel ?? null,
      scan.scanDate ?? new Date(),
      scan.uploadedBy,
      scan.qualityScore ?? null,
      scan.notes ?? null,
    ]);

    logger.info({ labCaseId, scanId: result.rows[0]!.id }, 'Scan added');

    return LabCaseRowMapper.toDigitalScan(result.rows[0]!);
  }

  // ===========================================================================
  // CAD DESIGNS
  // ===========================================================================

  async getDesigns(labCaseId: string): Promise<CADDesign[]> {
    const sql = `
      SELECT * FROM lab_case_designs
      WHERE lab_case_id = $1
      ORDER BY version DESC
    `;

    const result = await this.query<CADDesignRow>(sql, [labCaseId]);
    return result.rows.map(LabCaseRowMapper.toCADDesign);
  }

  async addDesign(
    labCaseId: string,
    design: CreateCADDesign & { designedBy: string; approvalStatus: string }
  ): Promise<CADDesign> {
    // Get next version number
    const versionSql = `
      SELECT COALESCE(MAX(version), 0) + 1 as next_version
      FROM lab_case_designs
      WHERE lab_case_id = $1
    `;
    const versionResult = await this.query<{ next_version: number }>(versionSql, [labCaseId]);
    const version = versionResult.rows[0]?.next_version ?? 1;

    const sql = `
      INSERT INTO lab_case_designs (
        id, lab_case_id, version, software_name, software_version,
        file_format, storage_path, file_size_bytes, designed_by,
        design_hours, approval_status, notes, metadata,
        created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12,
        NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await this.query<CADDesignRow>(sql, [
      labCaseId,
      version,
      design.softwareName,
      design.softwareVersion ?? null,
      design.fileFormat,
      design.storagePath,
      design.fileSizeBytes,
      design.designedBy,
      design.designHours ?? null,
      design.approvalStatus,
      design.notes ?? null,
      design.metadata ?? {},
    ]);

    logger.info({ labCaseId, designId: result.rows[0]!.id, version }, 'Design added');

    return LabCaseRowMapper.toCADDesign(result.rows[0]!);
  }

  async approveDesign(input: ApproveDesign): Promise<CADDesign> {
    const sql = `
      UPDATE lab_case_designs
      SET approval_status = $2,
          approved_by = $3,
          approved_at = CASE WHEN $2 = 'APPROVED' THEN NOW() ELSE NULL END,
          notes = COALESCE($4, notes),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.query<CADDesignRow>(sql, [
      input.designId,
      input.approvalStatus,
      input.approvedBy,
      input.notes ?? null,
    ]);

    if (result.rows.length === 0) {
      throw new RecordNotFoundError('LabCaseRepository', 'CADDesign', input.designId);
    }

    logger.info(
      { designId: input.designId, approvalStatus: input.approvalStatus },
      'Design approval updated'
    );

    return LabCaseRowMapper.toCADDesign(result.rows[0]!);
  }

  async getDesignsAwaitingReview(clinicId: string): Promise<LabCase[]> {
    const sql = `
      SELECT DISTINCT lc.* FROM lab_cases lc
      JOIN lab_case_designs lcd ON lcd.lab_case_id = lc.id
      WHERE lc.clinic_id = $1
        AND lc.deleted_at IS NULL
        AND lc.status = 'DESIGN_REVIEW'
        AND lcd.approval_status = 'PENDING'
      ORDER BY lc.due_date ASC
    `;

    const result = await this.query<LabCaseRow>(sql, [clinicId]);
    return result.rows.map(LabCaseRowMapper.toLabCase);
  }

  // ===========================================================================
  // FABRICATION RECORDS
  // ===========================================================================

  async getFabricationRecords(labCaseId: string): Promise<FabricationRecord[]> {
    const sql = `
      SELECT * FROM lab_case_fabrication_records
      WHERE lab_case_id = $1
      ORDER BY started_at DESC
    `;

    const result = await this.query<FabricationRecordRow>(sql, [labCaseId]);
    return result.rows.map(LabCaseRowMapper.toFabricationRecord);
  }

  async addFabricationRecord(
    labCaseId: string,
    record: CreateFabricationRecord
  ): Promise<FabricationRecord> {
    const sql = `
      INSERT INTO lab_case_fabrication_records (
        id, lab_case_id, method, equipment_id, material_lot_number,
        material_expiry, technician_id, started_at, parameters, notes, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, NOW(), $7, $8, NOW()
      )
      RETURNING *
    `;

    const result = await this.query<FabricationRecordRow>(sql, [
      labCaseId,
      record.method,
      record.equipmentId ?? null,
      record.materialLotNumber ?? null,
      record.materialExpiry ?? null,
      record.technicianId,
      record.parameters ?? {},
      record.notes ?? null,
    ]);

    logger.info({ labCaseId, recordId: result.rows[0]!.id, method: record.method }, 'Fabrication started');

    return LabCaseRowMapper.toFabricationRecord(result.rows[0]!);
  }

  async completeFabrication(recordId: string): Promise<void> {
    const sql = `
      UPDATE lab_case_fabrication_records
      SET completed_at = NOW()
      WHERE id = $1
    `;

    await this.query(sql, [recordId]);
    logger.info({ recordId }, 'Fabrication completed');
  }

  // ===========================================================================
  // QC INSPECTIONS
  // ===========================================================================

  async getQCInspections(labCaseId: string): Promise<QCInspection[]> {
    const sql = `
      SELECT * FROM lab_case_qc_inspections
      WHERE lab_case_id = $1
      ORDER BY inspected_at DESC
    `;

    const result = await this.query<QCInspectionRow>(sql, [labCaseId]);
    return result.rows.map(LabCaseRowMapper.toQCInspection);
  }

  async addQCInspection(
    labCaseId: string,
    inspection: CreateQCInspection & { passed: boolean }
  ): Promise<QCInspection> {
    const sql = `
      INSERT INTO lab_case_qc_inspections (
        id, lab_case_id, inspection_type, inspected_by, inspected_at,
        passed, overall_score, criteria, defects_found, corrective_actions,
        photos, notes, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, NOW(),
        $4, $5, $6, $7, $8,
        $9, $10, NOW()
      )
      RETURNING *
    `;

    // Calculate overall score from criteria
    const criteriaEntries = Object.entries(inspection.criteria);
    const totalScore = criteriaEntries.reduce((sum, [, value]) => sum + (value as { score: number }).score, 0);
    const overallScore = Math.round(totalScore / criteriaEntries.length);

    const result = await this.query<QCInspectionRow>(sql, [
      labCaseId,
      inspection.inspectionType,
      inspection.inspectedBy,
      inspection.passed,
      overallScore,
      JSON.stringify(inspection.criteria),
      inspection.defectsFound ?? null,
      inspection.correctiveActions ?? null,
      inspection.photos ?? null,
      inspection.notes ?? null,
    ]);

    logger.info(
      { labCaseId, inspectionId: result.rows[0]!.id, passed: inspection.passed },
      'QC inspection recorded'
    );

    return LabCaseRowMapper.toQCInspection(result.rows[0]!);
  }

  // ===========================================================================
  // TRY-IN RECORDS
  // ===========================================================================

  async getTryInRecords(labCaseId: string): Promise<TryInRecord[]> {
    const sql = `
      SELECT * FROM lab_case_try_in_records
      WHERE lab_case_id = $1
      ORDER BY scheduled_at DESC
    `;

    const result = await this.query<TryInRecordRow>(sql, [labCaseId]);
    return result.rows.map(LabCaseRowMapper.toTryInRecord);
  }

  async addTryInRecord(labCaseId: string, record: CreateTryInRecord): Promise<TryInRecord> {
    const sql = `
      INSERT INTO lab_case_try_in_records (
        id, lab_case_id, scheduled_at, clinician_id, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await this.query<TryInRecordRow>(sql, [
      labCaseId,
      record.scheduledAt,
      record.clinicianId,
    ]);

    logger.info({ labCaseId, recordId: result.rows[0]!.id }, 'Try-in scheduled');

    return LabCaseRowMapper.toTryInRecord(result.rows[0]!);
  }

  async updateTryInRecord(
    recordId: string,
    updates: Partial<TryInRecord>
  ): Promise<TryInRecord> {
    const setClauses: string[] = ['updated_at = NOW()'];
    const params: unknown[] = [recordId];
    let paramIndex = 2;

    if (updates.completedAt !== undefined) {
      setClauses.push(`completed_at = $${paramIndex++}`);
      params.push(updates.completedAt);
    }
    if (updates.clinicianNotes !== undefined) {
      setClauses.push(`clinician_notes = $${paramIndex++}`);
      params.push(updates.clinicianNotes);
    }
    if (updates.patientSatisfaction !== undefined) {
      setClauses.push(`patient_satisfaction = $${paramIndex++}`);
      params.push(updates.patientSatisfaction);
    }
    if (updates.adjustmentsRequired !== undefined) {
      setClauses.push(`adjustments_required = $${paramIndex++}`);
      params.push(updates.adjustmentsRequired);
    }
    if (updates.photos !== undefined) {
      setClauses.push(`photos = $${paramIndex++}`);
      params.push(updates.photos);
    }

    const sql = `
      UPDATE lab_case_try_in_records
      SET ${setClauses.join(', ')}
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.query<TryInRecordRow>(sql, params);

    if (result.rows.length === 0) {
      throw new RecordNotFoundError('LabCaseRepository', 'TryInRecord', recordId);
    }

    return LabCaseRowMapper.toTryInRecord(result.rows[0]!);
  }

  // ===========================================================================
  // STATUS HISTORY
  // ===========================================================================

  async getStatusHistory(labCaseId: string): Promise<StatusHistoryEntry[]> {
    const sql = `
      SELECT * FROM lab_case_status_history
      WHERE lab_case_id = $1
      ORDER BY changed_at DESC
    `;

    const result = await this.query<StatusHistoryRow>(sql, [labCaseId]);
    return result.rows.map(LabCaseRowMapper.toStatusHistoryEntry);
  }

  // ===========================================================================
  // SLA TRACKING
  // ===========================================================================

  async getSLATracking(labCaseId: string): Promise<LabSLATracking | null> {
    const sql = `
      SELECT * FROM lab_sla_tracking
      WHERE lab_case_id = $1
    `;

    const result = await this.query<SLATrackingRow>(sql, [labCaseId]);
    return result.rows[0] ? LabCaseRowMapper.toSLATracking(result.rows[0]) : null;
  }

  async updateSLATracking(
    labCaseId: string,
    tracking: Partial<LabSLATracking>
  ): Promise<void> {
    const sql = `
      INSERT INTO lab_sla_tracking (
        id, lab_case_id, sla_type, milestones, overall_status,
        days_remaining, percent_complete, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW(), NOW()
      )
      ON CONFLICT (lab_case_id)
      DO UPDATE SET
        sla_type = COALESCE($2, lab_sla_tracking.sla_type),
        milestones = COALESCE($3, lab_sla_tracking.milestones),
        overall_status = COALESCE($4, lab_sla_tracking.overall_status),
        days_remaining = COALESCE($5, lab_sla_tracking.days_remaining),
        percent_complete = COALESCE($6, lab_sla_tracking.percent_complete),
        updated_at = NOW()
    `;

    const milestones = tracking.milestones?.map((m) => ({
      name: m.name,
      status: m.status,
      expectedBy: m.expectedBy.toISOString(),
      completedAt: m.completedAt?.toISOString(),
    }));

    await this.query(sql, [
      labCaseId,
      tracking.slaType ?? 'STANDARD',
      JSON.stringify(milestones ?? []),
      tracking.overallStatus ?? 'ON_TRACK',
      tracking.daysRemaining ?? 0,
      tracking.percentComplete ?? 0,
    ]);
  }

  async getCasesWithSLAIssues(
    clinicId: string,
    status: SLAStatus
  ): Promise<Array<{ labCase: LabCase; slaTracking: LabSLATracking }>> {
    const sql = `
      SELECT lc.*, lst.*
      FROM lab_cases lc
      JOIN lab_sla_tracking lst ON lst.lab_case_id = lc.id
      WHERE lc.clinic_id = $1
        AND lc.deleted_at IS NULL
        AND lst.overall_status = $2
      ORDER BY lc.due_date ASC
    `;

    const result = await this.query<LabCaseRow & SLATrackingRow>(sql, [clinicId, status]);

    return result.rows.map((row) => ({
      labCase: LabCaseRowMapper.toLabCase(row),
      slaTracking: LabCaseRowMapper.toSLATracking(row),
    }));
  }

  async getUpcomingSLADeadlines(
    clinicId: string,
    hoursAhead: number
  ): Promise<Array<{ labCase: LabCase; deadline: Date; milestone: string }>> {
    const sql = `
      SELECT lc.*, lst.milestones
      FROM lab_cases lc
      JOIN lab_sla_tracking lst ON lst.lab_case_id = lc.id
      WHERE lc.clinic_id = $1
        AND lc.deleted_at IS NULL
        AND lc.due_date <= NOW() + INTERVAL '${hoursAhead} hours'
        AND lc.status NOT IN ('COMPLETED', 'CANCELLED')
      ORDER BY lc.due_date ASC
    `;

    const result = await this.query<LabCaseRow & { milestones: SLATrackingRow['milestones'] }>(
      sql,
      [clinicId]
    );

    return result.rows.map((row) => ({
      labCase: LabCaseRowMapper.toLabCase(row),
      deadline: row.due_date,
      milestone: 'Overall Deadline',
    }));
  }

  // ===========================================================================
  // ASSIGNMENTS
  // ===========================================================================

  async assignTechnician(
    labCaseId: string,
    technicianId: string,
    assignedBy: string
  ): Promise<void> {
    const sql = `
      UPDATE lab_cases
      SET assigned_technician = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;

    await this.query(sql, [labCaseId, technicianId]);
    logger.info({ labCaseId, technicianId, assignedBy }, 'Technician assigned');
  }

  async assignDesigner(
    labCaseId: string,
    designerId: string,
    assignedBy: string
  ): Promise<void> {
    const sql = `
      UPDATE lab_cases
      SET assigned_designer = $2, updated_at = NOW()
      WHERE id = $1 AND deleted_at IS NULL
    `;

    await this.query(sql, [labCaseId, designerId]);
    logger.info({ labCaseId, designerId, assignedBy }, 'Designer assigned');
  }

  async getTechnicianWorkloads(clinicId: string): Promise<TechnicianWorkload[]> {
    const sql = `
      SELECT
        assigned_technician as technician_id,
        COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED')) as active_cases,
        COUNT(*) FILTER (WHERE status IN ('COMPLETED')) as completed_today,
        SUM(COALESCE(estimated_hours, 0)) FILTER (
          WHERE status NOT IN ('COMPLETED', 'CANCELLED')
        ) as total_estimated_hours
      FROM lab_cases
      WHERE clinic_id = $1
        AND assigned_technician IS NOT NULL
        AND deleted_at IS NULL
      GROUP BY assigned_technician
    `;

    const result = await this.query<{
      technician_id: string;
      active_cases: string;
      completed_today: string;
      total_estimated_hours: string;
    }>(sql, [clinicId]);

    return result.rows.map((row) => ({
      technicianId: row.technician_id,
      activeCases: parseInt(row.active_cases, 10),
      completedToday: parseInt(row.completed_today, 10),
      totalEstimatedHours: parseFloat(row.total_estimated_hours),
    }));
  }

  // ===========================================================================
  // ANALYTICS & DASHBOARD
  // ===========================================================================

  async getStats(clinicId: string): Promise<LabCaseStats> {
    const sql = `
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'CANCELLED')) as active,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'CANCELLED') as cancelled,
        COUNT(*) FILTER (WHERE priority = 'STAT') as stat_priority,
        COUNT(*) FILTER (WHERE priority = 'RUSH') as rush_priority,
        AVG(EXTRACT(EPOCH FROM (completed_at - received_at)) / 3600)
          FILTER (WHERE completed_at IS NOT NULL) as avg_completion_hours
      FROM lab_cases
      WHERE clinic_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.query<{
      total: string;
      active: string;
      completed: string;
      cancelled: string;
      stat_priority: string;
      rush_priority: string;
      avg_completion_hours: string | null;
    }>(sql, [clinicId]);

    const row = result.rows[0]!;

    return {
      total: parseInt(row.total, 10),
      active: parseInt(row.active, 10),
      completed: parseInt(row.completed, 10),
      cancelled: parseInt(row.cancelled, 10),
      statPriority: parseInt(row.stat_priority, 10),
      rushPriority: parseInt(row.rush_priority, 10),
      avgCompletionHours: row.avg_completion_hours ? parseFloat(row.avg_completion_hours) : null,
    };
  }

  async getDashboard(clinicId: string): Promise<LabCaseDashboard> {
    // Execute multiple queries in parallel for dashboard data
    const [pipeline, today, slaHealth, urgentItems] = await Promise.all([
      this.getPipelineStats(clinicId),
      this.getTodayStats(clinicId),
      this.getSLAHealthStats(clinicId),
      this.getUrgentItems(clinicId),
    ]);

    return { pipeline, today, slaHealth, urgentItems };
  }

  async getPerformanceMetrics(
    clinicId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<LabPerformanceMetrics> {
    const sql = `
      SELECT
        COUNT(*) as total_cases,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed_cases,
        AVG(EXTRACT(EPOCH FROM (completed_at - received_at)) / 3600)
          FILTER (WHERE completed_at IS NOT NULL) as avg_turnaround_hours,
        COUNT(*) FILTER (
          WHERE completed_at IS NOT NULL AND completed_at <= due_date
        ) as on_time_deliveries,
        COUNT(*) FILTER (
          WHERE status = 'COMPLETED' AND completed_at IS NOT NULL
        ) as total_delivered,
        AVG(
          (SELECT overall_score FROM lab_case_qc_inspections qc
           WHERE qc.lab_case_id = lc.id
           ORDER BY inspected_at DESC LIMIT 1)
        ) as avg_qc_score,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM lab_case_qc_inspections qc
            WHERE qc.lab_case_id = lc.id AND qc.passed = false
          )
        ) as cases_with_rework
      FROM lab_cases lc
      WHERE clinic_id = $1
        AND deleted_at IS NULL
        AND received_at BETWEEN $2 AND $3
    `;

    const result = await this.query<{
      total_cases: string;
      completed_cases: string;
      avg_turnaround_hours: string | null;
      on_time_deliveries: string;
      total_delivered: string;
      avg_qc_score: string | null;
      cases_with_rework: string;
    }>(sql, [clinicId, periodStart, periodEnd]);

    const row = result.rows[0]!;
    const totalDelivered = parseInt(row.total_delivered, 10);
    const onTimeDeliveries = parseInt(row.on_time_deliveries, 10);

    return {
      periodStart,
      periodEnd,
      totalCases: parseInt(row.total_cases, 10),
      completedCases: parseInt(row.completed_cases, 10),
      avgTurnaroundHours: row.avg_turnaround_hours ? parseFloat(row.avg_turnaround_hours) : 0,
      onTimeDeliveryRate: totalDelivered > 0 ? (onTimeDeliveries / totalDelivered) * 100 : 100,
      avgQCScore: row.avg_qc_score ? parseFloat(row.avg_qc_score) : 0,
      reworkRate: parseInt(row.cases_with_rework, 10) / Math.max(parseInt(row.total_cases, 10), 1) * 100,
    };
  }

  // ===========================================================================
  // COLLABORATION REPOSITORY IMPLEMENTATION
  // ===========================================================================

  async createThread(input: CreateCollaborationThread): Promise<CollaborationThread> {
    const sql = `
      INSERT INTO lab_collaboration_threads (
        id, lab_case_id, subject, thread_type, priority, status,
        participants, created_by, created_at, updated_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, 'OPEN',
        $5, $6, NOW(), NOW()
      )
      RETURNING *
    `;

    const result = await this.query<CollaborationThreadRow>(sql, [
      input.labCaseId,
      input.subject,
      input.threadType,
      input.priority ?? 'NORMAL',
      input.participants,
      input.createdBy,
    ]);

    logger.info({ threadId: result.rows[0]!.id, labCaseId: input.labCaseId }, 'Thread created');

    return LabCaseRowMapper.toCollaborationThread(result.rows[0]!);
  }

  async addMessage(input: AddMessageToThread): Promise<CollaborationMessage> {
    const uow = new UnitOfWork(this.pool);

    return uow.execute(async (client) => {
      // Insert message
      const messageSql = `
        INSERT INTO lab_collaboration_messages (
          id, thread_id, sender_id, sender_type, content, attachments, created_at
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, NOW()
        )
        RETURNING *
      `;

      const messageResult = await client.query<CollaborationMessageRow>(messageSql, [
        input.threadId,
        input.senderId,
        input.senderType,
        input.content,
        input.attachments ? JSON.stringify(input.attachments) : null,
      ]);

      // Update thread's last_message_at
      await client.query(
        `UPDATE lab_collaboration_threads SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [input.threadId]
      );

      return LabCaseRowMapper.toCollaborationMessage(messageResult.rows[0]!);
    });
  }

  async getThreadsForCase(labCaseId: string): Promise<CollaborationThread[]> {
    const sql = `
      SELECT * FROM lab_collaboration_threads
      WHERE lab_case_id = $1
      ORDER BY updated_at DESC
    `;

    const result = await this.query<CollaborationThreadRow>(sql, [labCaseId]);
    return result.rows.map(LabCaseRowMapper.toCollaborationThread);
  }

  async getMessagesForThread(threadId: string): Promise<CollaborationMessage[]> {
    const sql = `
      SELECT * FROM lab_collaboration_messages
      WHERE thread_id = $1
      ORDER BY created_at ASC
    `;

    const result = await this.query<CollaborationMessageRow>(sql, [threadId]);
    return result.rows.map(LabCaseRowMapper.toCollaborationMessage);
  }

  async markMessagesRead(threadId: string, userId: string): Promise<void> {
    const sql = `
      INSERT INTO lab_collaboration_read_status (thread_id, user_id, last_read_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (thread_id, user_id)
      DO UPDATE SET last_read_at = NOW()
    `;

    await this.query(sql, [threadId, userId]);
  }

  async addDesignFeedback(input: CreateDesignFeedback): Promise<DesignFeedback> {
    const sql = `
      INSERT INTO lab_design_feedback (
        id, lab_case_id, design_id, feedback_type, provided_by,
        content, annotations, created_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW()
      )
      RETURNING *
    `;

    const result = await this.query<DesignFeedbackRow>(sql, [
      input.labCaseId,
      input.designId,
      input.feedbackType,
      input.providedBy,
      input.content,
      input.annotations ? JSON.stringify(input.annotations) : null,
    ]);

    logger.info({ feedbackId: result.rows[0]!.id, designId: input.designId }, 'Design feedback added');

    return LabCaseRowMapper.toDesignFeedback(result.rows[0]!);
  }

  async getDesignFeedback(designId: string): Promise<DesignFeedback[]> {
    const sql = `
      SELECT * FROM lab_design_feedback
      WHERE design_id = $1
      ORDER BY created_at DESC
    `;

    const result = await this.query<DesignFeedbackRow>(sql, [designId]);
    return result.rows.map(LabCaseRowMapper.toDesignFeedback);
  }

  // ===========================================================================
  // PRIVATE HELPER METHODS
  // ===========================================================================

  private async query<T extends Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }> {
    const startTime = Date.now();

    try {
      const result = await this.pool.query<T>(sql, params);

      if (this.config.enableQueryLogging) {
        logger.debug(
          { sql: sql.substring(0, 100), duration: Date.now() - startTime, rowCount: result.rowCount },
          'Query executed'
        );
      }

      return { rows: result.rows, rowCount: result.rowCount ?? 0 };
    } catch (error) {
      logger.error({ error, sql: sql.substring(0, 100) }, 'Query failed');
      throw error;
    }
  }

  private async generateCaseNumber(client: PoolClient, clinicId: string): Promise<string> {
    const prefix = clinicId.substring(0, 3).toUpperCase();
    const year = new Date().getFullYear();

    const sql = `
      SELECT COALESCE(MAX(
        CAST(SUBSTRING(case_number FROM '${prefix}-${year}-([0-9]+)') AS INTEGER)
      ), 0) + 1 as next_seq
      FROM lab_cases
      WHERE case_number LIKE $1
    `;

    const result = await client.query<{ next_seq: string }>(sql, [`${prefix}-${year}-%`]);
    const nextSeq = parseInt(result.rows[0]?.next_seq ?? '1', 10);

    return `${prefix}-${year}-${nextSeq.toString().padStart(6, '0')}`;
  }

  private async recordStatusChange(
    client: PoolClient,
    labCaseId: string,
    fromStatus: LabCaseStatus | null,
    toStatus: LabCaseStatus,
    changedBy: string,
    reason?: string
  ): Promise<void> {
    const sql = `
      INSERT INTO lab_case_status_history (
        id, lab_case_id, from_status, to_status, changed_by, changed_at, reason, metadata
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4, NOW(), $5, '{}'
      )
    `;

    await client.query(sql, [labCaseId, fromStatus, toStatus, changedBy, reason ?? null]);
  }

  private mapSortColumn(sortBy: string): string {
    const mapping: Record<string, string> = {
      receivedAt: 'received_at',
      dueDate: 'due_date',
      caseNumber: 'case_number',
      status: 'status',
      priority: 'priority',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    };
    return mapping[sortBy] ?? 'received_at';
  }

  private async getPipelineStats(clinicId: string): Promise<LabCaseDashboard['pipeline']> {
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('RECEIVED', 'PENDING_SCAN', 'SCAN_RECEIVED')) as received,
        COUNT(*) FILTER (WHERE status IN ('IN_DESIGN', 'DESIGN_REVIEW', 'DESIGN_APPROVED', 'DESIGN_REVISION')) as in_design,
        COUNT(*) FILTER (WHERE status IN ('QUEUED_FOR_MILLING', 'MILLING', 'POST_PROCESSING', 'FINISHING')) as in_fabrication,
        COUNT(*) FILTER (WHERE status IN ('QC_INSPECTION', 'QC_PASSED', 'QC_FAILED')) as in_qc,
        COUNT(*) FILTER (WHERE status IN ('READY_FOR_PICKUP', 'IN_TRANSIT', 'DELIVERED', 'TRY_IN_SCHEDULED')) as awaiting_delivery
      FROM lab_cases
      WHERE clinic_id = $1 AND deleted_at IS NULL
        AND status NOT IN ('COMPLETED', 'CANCELLED')
    `;

    const result = await this.query<{
      received: string;
      in_design: string;
      in_fabrication: string;
      in_qc: string;
      awaiting_delivery: string;
    }>(sql, [clinicId]);

    const row = result.rows[0]!;
    return {
      received: parseInt(row.received, 10),
      inDesign: parseInt(row.in_design, 10),
      inFabrication: parseInt(row.in_fabrication, 10),
      inQC: parseInt(row.in_qc, 10),
      awaitingDelivery: parseInt(row.awaiting_delivery, 10),
    };
  }

  private async getTodayStats(clinicId: string): Promise<LabCaseDashboard['today']> {
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE DATE(received_at) = CURRENT_DATE) as new_cases,
        COUNT(*) FILTER (WHERE DATE(completed_at) = CURRENT_DATE) as completed_cases,
        COUNT(*) FILTER (WHERE status = 'DESIGN_REVIEW') as designs_awaiting_review,
        COUNT(*) FILTER (WHERE status = 'READY_FOR_PICKUP') as ready_for_pickup
      FROM lab_cases
      WHERE clinic_id = $1 AND deleted_at IS NULL
    `;

    const result = await this.query<{
      new_cases: string;
      completed_cases: string;
      designs_awaiting_review: string;
      ready_for_pickup: string;
    }>(sql, [clinicId]);

    const row = result.rows[0]!;
    return {
      newCases: parseInt(row.new_cases, 10),
      completedCases: parseInt(row.completed_cases, 10),
      designsAwaitingReview: parseInt(row.designs_awaiting_review, 10),
      readyForPickup: parseInt(row.ready_for_pickup, 10),
    };
  }

  private async getSLAHealthStats(clinicId: string): Promise<LabCaseDashboard['slaHealth']> {
    const sql = `
      SELECT
        COUNT(*) FILTER (WHERE lst.overall_status = 'ON_TRACK') as on_track,
        COUNT(*) FILTER (WHERE lst.overall_status = 'AT_RISK') as at_risk,
        COUNT(*) FILTER (WHERE lst.overall_status = 'OVERDUE') as overdue
      FROM lab_cases lc
      LEFT JOIN lab_sla_tracking lst ON lst.lab_case_id = lc.id
      WHERE lc.clinic_id = $1
        AND lc.deleted_at IS NULL
        AND lc.status NOT IN ('COMPLETED', 'CANCELLED')
    `;

    const result = await this.query<{
      on_track: string;
      at_risk: string;
      overdue: string;
    }>(sql, [clinicId]);

    const row = result.rows[0]!;
    return {
      onTrack: parseInt(row.on_track, 10),
      atRisk: parseInt(row.at_risk, 10),
      overdue: parseInt(row.overdue, 10),
    };
  }

  private async getUrgentItems(clinicId: string): Promise<LabCaseDashboard['urgentItems']> {
    const sql = `
      SELECT id as case_id, case_number,
        CASE
          WHEN due_date < NOW() THEN 'OVERDUE'
          WHEN due_date < NOW() + INTERVAL '24 hours' THEN 'DUE_SOON'
          WHEN priority = 'STAT' THEN 'STAT_PRIORITY'
          ELSE 'AT_RISK'
        END as urgency_type,
        CASE
          WHEN due_date < NOW() THEN 'Overdue by ' || EXTRACT(DAY FROM NOW() - due_date)::TEXT || ' days'
          WHEN due_date < NOW() + INTERVAL '24 hours' THEN 'Due in ' || EXTRACT(HOUR FROM due_date - NOW())::TEXT || ' hours'
          WHEN priority = 'STAT' THEN 'STAT priority case'
          ELSE 'At risk of SLA breach'
        END as details
      FROM lab_cases
      WHERE clinic_id = $1
        AND deleted_at IS NULL
        AND status NOT IN ('COMPLETED', 'CANCELLED')
        AND (
          due_date < NOW() + INTERVAL '24 hours'
          OR priority = 'STAT'
        )
      ORDER BY
        CASE WHEN due_date < NOW() THEN 0 ELSE 1 END,
        due_date ASC
      LIMIT 10
    `;

    const result = await this.query<{
      case_id: string;
      case_number: string;
      urgency_type: string;
      details: string;
    }>(sql, [clinicId]);

    return result.rows.map((row) => ({
      caseId: row.case_id,
      caseNumber: row.case_number,
      urgencyType: row.urgency_type as 'OVERDUE' | 'DUE_SOON' | 'STAT_PRIORITY' | 'AT_RISK',
      details: row.details,
    }));
  }

  /**
   * Close the database pool
   */
  async close(): Promise<void> {
    await this.pool.end();
    logger.info('PostgresLabCaseRepository connection pool closed');
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Factory function to create a PostgreSQL Lab Case Repository
 */
export function createPostgresLabCaseRepository(
  config: PostgresLabCaseRepositoryConfig
): PostgresLabCaseRepository {
  return new PostgresLabCaseRepository(config);
}
