/**
 * Guidance Repository Interface
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * Repository contract for persisting and retrieving agent guidance/call scripts.
 */
import type {
  AgentGuidance,
  CreateGuidance,
  UpdateGuidance,
  GuidanceQuery,
  GuidanceType,
  GuidanceCategory,
} from '@medicalcor/types';

// =============================================================================
// Repository Result Types
// =============================================================================

export type GuidanceRepositoryErrorCode =
  | 'NOT_FOUND'
  | 'DUPLICATE_NAME'
  | 'VALIDATION_ERROR'
  | 'DATABASE_ERROR'
  | 'PERMISSION_DENIED';

export interface GuidanceRepositoryError {
  code: GuidanceRepositoryErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type GuidanceRepositoryResult<T> =
  | { success: true; data: T }
  | { success: false; error: GuidanceRepositoryError };

// =============================================================================
// Query Specifications
// =============================================================================

/**
 * Find guidance for a specific call context
 */
export interface GuidanceForCallSpec {
  clinicId: string;
  procedure?: string;
  category?: GuidanceCategory;
  language?: 'en' | 'ro';
  audience?: 'new-patient' | 'existing-patient' | 'referral' | 'emergency' | 'all';
  type?: GuidanceType;
}

/**
 * Search specification
 */
export interface GuidanceSearchSpec {
  clinicId: string;
  searchTerm?: string;
  tags?: string[];
  includeInactive?: boolean;
  includeDrafts?: boolean;
}

// =============================================================================
// Paginated Result
// =============================================================================

export interface PaginatedGuidance {
  items: AgentGuidance[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// =============================================================================
// Repository Interface
// =============================================================================

/**
 * Guidance Repository Interface
 *
 * Follows the repository pattern for clean architecture.
 * All methods return Result types for explicit error handling.
 */
export interface IGuidanceRepository {
  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  /**
   * Create a new guidance/call script
   */
  create(guidance: CreateGuidance): Promise<GuidanceRepositoryResult<AgentGuidance>>;

  /**
   * Update an existing guidance
   * @param id Guidance ID
   * @param updates Partial update fields
   */
  update(
    id: string,
    updates: Partial<UpdateGuidance>
  ): Promise<GuidanceRepositoryResult<AgentGuidance>>;

  /**
   * Soft delete a guidance (sets deletedAt)
   */
  delete(id: string): Promise<GuidanceRepositoryResult<void>>;

  /**
   * Hard delete a guidance (permanent)
   */
  hardDelete(id: string): Promise<GuidanceRepositoryResult<void>>;

  // ==========================================================================
  // Read Operations
  // ==========================================================================

  /**
   * Find guidance by ID
   */
  findById(id: string): Promise<GuidanceRepositoryResult<AgentGuidance | null>>;

  /**
   * Find guidance by name within a clinic
   */
  findByName(
    clinicId: string,
    name: string
  ): Promise<GuidanceRepositoryResult<AgentGuidance | null>>;

  /**
   * List guidance with filtering and pagination
   */
  list(
    query: GuidanceQuery & { clinicId: string }
  ): Promise<GuidanceRepositoryResult<PaginatedGuidance>>;

  /**
   * Find guidance suitable for a specific call context
   * Returns the best matching active guidance
   */
  findForCall(spec: GuidanceForCallSpec): Promise<GuidanceRepositoryResult<AgentGuidance | null>>;

  /**
   * Search guidance by text and tags
   */
  search(spec: GuidanceSearchSpec): Promise<GuidanceRepositoryResult<AgentGuidance[]>>;

  /**
   * Get all active guidance for a clinic
   */
  getActiveForClinic(clinicId: string): Promise<GuidanceRepositoryResult<AgentGuidance[]>>;

  // ==========================================================================
  // Versioning
  // ==========================================================================

  /**
   * Create a new version of guidance (preserves history)
   */
  createVersion(
    id: string,
    updates: Partial<UpdateGuidance>
  ): Promise<GuidanceRepositoryResult<AgentGuidance>>;

  /**
   * Get version history for a guidance
   */
  getVersionHistory(id: string): Promise<GuidanceRepositoryResult<AgentGuidance[]>>;

  // ==========================================================================
  // Status Management
  // ==========================================================================

  /**
   * Activate a guidance (set isActive = true)
   */
  activate(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>>;

  /**
   * Deactivate a guidance (set isActive = false)
   */
  deactivate(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>>;

  /**
   * Publish a draft (set isDraft = false)
   */
  publish(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>>;

  // ==========================================================================
  // Metrics
  // ==========================================================================

  /**
   * Increment usage count
   */
  incrementUsage(id: string): Promise<GuidanceRepositoryResult<void>>;

  /**
   * Update effectiveness metrics
   */
  updateMetrics(
    id: string,
    metrics: {
      avgCallDuration?: number;
      conversionRate?: number;
      satisfactionScore?: number;
    }
  ): Promise<GuidanceRepositoryResult<void>>;

  // ==========================================================================
  // Bulk Operations
  // ==========================================================================

  /**
   * Get guidance IDs by procedure
   */
  findByProcedure(
    clinicId: string,
    procedure: string
  ): Promise<GuidanceRepositoryResult<AgentGuidance[]>>;

  /**
   * Get guidance by category
   */
  findByCategory(
    clinicId: string,
    category: GuidanceCategory
  ): Promise<GuidanceRepositoryResult<AgentGuidance[]>>;
}

// =============================================================================
// Error Helpers
// =============================================================================

export function notFoundError(id: string): GuidanceRepositoryError {
  return {
    code: 'NOT_FOUND',
    message: `Guidance not found: ${id}`,
  };
}

export function duplicateNameError(name: string): GuidanceRepositoryError {
  return {
    code: 'DUPLICATE_NAME',
    message: `Guidance with name "${name}" already exists`,
  };
}

export function validationError(
  message: string,
  details?: Record<string, unknown>
): GuidanceRepositoryError {
  return {
    code: 'VALIDATION_ERROR',
    message,
    details,
  };
}

export function databaseError(message: string): GuidanceRepositoryError {
  return {
    code: 'DATABASE_ERROR',
    message,
  };
}
