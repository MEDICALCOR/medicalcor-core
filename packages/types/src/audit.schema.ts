/**
 * Unified Audit Log Schemas (M1)
 *
 * Provides type-safe schemas for the consolidated audit_log table that
 * combines compliance, general, consent, and replay audit types.
 *
 * @see supabase/migrations/20251207100000_consolidate_audit_tables.sql
 */

import { z } from 'zod';

// =============================================================================
// AUDIT TYPE ENUM
// =============================================================================

/**
 * Audit type categories for the unified audit log
 */
export const AuditTypeSchema = z.enum(['compliance', 'general', 'consent', 'replay']);
export type AuditType = z.infer<typeof AuditTypeSchema>;

// =============================================================================
// COMMON AUDIT FIELDS
// =============================================================================

/**
 * Actor type - who performed the action
 */
export const AuditActorTypeSchema = z.enum(['user', 'system', 'api', 'integration', 'cron']);
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;

/**
 * Audit action categories
 */
export const AuditActionSchema = z.enum([
  'create',
  'read',
  'update',
  'delete',
  'export',
  'import',
  'access',
  'consent',
  'authenticate',
  'authorize',
  'score',
  'assign',
  'transfer',
  'schedule',
  'cancel',
  'complete',
  'escalate',
  'archive',
  'restore',
]);
export type AuditAction = z.infer<typeof AuditActionSchema>;

/**
 * Audit severity levels
 */
export const AuditSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type AuditSeverity = z.infer<typeof AuditSeveritySchema>;

/**
 * General audit status (for general audit type)
 */
export const GeneralAuditStatusSchema = z.enum(['success', 'failure', 'warning']);
export type GeneralAuditStatus = z.infer<typeof GeneralAuditStatusSchema>;

/**
 * General audit categories
 */
export const GeneralAuditCategorySchema = z.enum([
  'patient',
  'document',
  'settings',
  'auth',
  'billing',
  'system',
]);
export type GeneralAuditCategory = z.infer<typeof GeneralAuditCategorySchema>;

/**
 * Replay operation types
 */
export const ReplayOperationTypeSchema = z.enum([
  'state_reconstruction',
  'projection_rebuild',
  'event_timeline_query',
  'state_verification',
  'state_diff',
  'full_replay',
  'partial_replay',
]);
export type ReplayOperationType = z.infer<typeof ReplayOperationTypeSchema>;

/**
 * Replay operation status
 */
export const ReplayStatusSchema = z.enum([
  'started',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
]);
export type ReplayStatus = z.infer<typeof ReplayStatusSchema>;

/**
 * Consent audit actions
 */
export const ConsentAuditActionSchema = z.enum([
  'created',
  'granted',
  'denied',
  'withdrawn',
  'expired',
  'updated',
]);
export type ConsentAuditAction = z.infer<typeof ConsentAuditActionSchema>;

// =============================================================================
// ACTOR SCHEMA
// =============================================================================

/**
 * Actor information for audit entries
 */
export const AuditActorSchema = z.object({
  id: z.string(),
  type: AuditActorTypeSchema,
  name: z.string().optional(),
  email: z.string().email().optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  clinicId: z.string().uuid().optional(),
});
export type AuditActor = z.infer<typeof AuditActorSchema>;

// =============================================================================
// BASE AUDIT ENTRY SCHEMA
// =============================================================================

/**
 * Base fields common to all audit entries
 */
export const BaseAuditEntrySchema = z.object({
  id: z.string().uuid(),
  timestamp: z.coerce.date(),
  auditType: AuditTypeSchema,
  actorId: z.string(),
  actorType: AuditActorTypeSchema,
  actorName: z.string().optional(),
  actorEmail: z.string().email().optional(),
  actorIpAddress: z.string().optional(),
  actorUserAgent: z.string().optional(),
  actorClinicId: z.string().uuid().optional(),
  action: AuditActionSchema,
  reason: z.string().optional(),
  previousState: z.unknown().optional(),
  newState: z.unknown().optional(),
  changedFields: z.array(z.string()).optional(),
  correlationId: z.string(),
  causationId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  complianceTags: z.array(z.string()).optional(),
  severity: AuditSeveritySchema,
  retentionUntil: z.coerce.date().optional(),
  isRedacted: z.boolean().default(false),
  eventType: z.string(),
  eventId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  aggregateType: z.string(),
});

// =============================================================================
// COMPLIANCE AUDIT SCHEMA
// =============================================================================

/**
 * Compliance audit entry (HIPAA/GDPR compliance tracking)
 */
export const ComplianceAuditEntrySchema = BaseAuditEntrySchema.extend({
  auditType: z.literal('compliance'),
});
export type ComplianceAuditEntry = z.infer<typeof ComplianceAuditEntrySchema>;

// =============================================================================
// GENERAL AUDIT SCHEMA
// =============================================================================

/**
 * General audit entry (clinic UI actions)
 */
export const GeneralAuditEntrySchema = BaseAuditEntrySchema.extend({
  auditType: z.literal('general'),
  clinicId: z.string().uuid().optional(),
  category: GeneralAuditCategorySchema.optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  entityName: z.string().optional(),
  details: z.string().optional(),
  status: GeneralAuditStatusSchema.optional(),
});
export type GeneralAuditEntry = z.infer<typeof GeneralAuditEntrySchema>;

// =============================================================================
// CONSENT AUDIT SCHEMA
// =============================================================================

/**
 * Consent audit entry (GDPR consent changes)
 */
export const ConsentAuditEntrySchema = BaseAuditEntrySchema.extend({
  auditType: z.literal('consent'),
  consentId: z.string(),
  previousStatus: z.string().optional(),
  newStatus: z.string(),
});
export type ConsentAuditEntry = z.infer<typeof ConsentAuditEntrySchema>;

// =============================================================================
// REPLAY AUDIT SCHEMA
// =============================================================================

/**
 * Replay progress information
 */
export const ReplayProgressSchema = z.object({
  phase: z.enum(['initializing', 'loading_snapshot', 'replaying_events', 'finalizing']),
  eventsProcessed: z.number(),
  totalEvents: z.number().optional(),
  currentEventId: z.string().optional(),
  percentComplete: z.number().min(0).max(100),
  estimatedTimeRemainingMs: z.number().optional(),
});
export type ReplayProgress = z.infer<typeof ReplayProgressSchema>;

/**
 * Replay result information
 */
export const ReplayResultSchema = z.object({
  eventsProcessed: z.number(),
  eventsSkipped: z.number(),
  errorCount: z.number(),
  durationMs: z.number(),
  finalVersion: z.number().optional(),
  stateHash: z.string().optional(),
  success: z.boolean(),
  summary: z.string(),
});
export type ReplayResult = z.infer<typeof ReplayResultSchema>;

/**
 * Replay error information
 */
export const ReplayErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  eventId: z.string().optional(),
  eventType: z.string().optional(),
  stack: z.string().optional(),
});
export type ReplayError = z.infer<typeof ReplayErrorSchema>;

/**
 * Replay audit entry (event sourcing operations)
 */
export const ReplayAuditEntrySchema = BaseAuditEntrySchema.extend({
  auditType: z.literal('replay'),
  operationType: ReplayOperationTypeSchema,
  replayStatus: ReplayStatusSchema,
  projectionName: z.string().optional(),
  tenantId: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  result: ReplayResultSchema.optional(),
  error: ReplayErrorSchema.optional(),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  lastProgressAt: z.coerce.date().optional(),
  progress: ReplayProgressSchema.optional(),
});
export type ReplayAuditEntry = z.infer<typeof ReplayAuditEntrySchema>;

// =============================================================================
// UNIFIED AUDIT ENTRY SCHEMA
// =============================================================================

/**
 * Unified audit entry that can be any audit type
 */
export const UnifiedAuditEntrySchema = z.discriminatedUnion('auditType', [
  ComplianceAuditEntrySchema,
  GeneralAuditEntrySchema,
  ConsentAuditEntrySchema,
  ReplayAuditEntrySchema,
]);
export type UnifiedAuditEntry = z.infer<typeof UnifiedAuditEntrySchema>;

// =============================================================================
// CREATE AUDIT ENTRY SCHEMAS
// =============================================================================

/**
 * Create compliance audit entry request
 */
export const CreateComplianceAuditSchema = z.object({
  actorId: z.string(),
  actorType: AuditActorTypeSchema,
  actorName: z.string().optional(),
  actorEmail: z.string().email().optional(),
  actorIpAddress: z.string().optional(),
  actorUserAgent: z.string().optional(),
  actorClinicId: z.string().uuid().optional(),
  action: AuditActionSchema,
  reason: z.string().optional(),
  previousState: z.unknown().optional(),
  newState: z.unknown().optional(),
  changedFields: z.array(z.string()).optional(),
  correlationId: z.string(),
  causationId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  complianceTags: z.array(z.string()).optional(),
  severity: AuditSeveritySchema.default('low'),
  eventType: z.string(),
  eventId: z.string().uuid(),
  aggregateId: z.string().uuid(),
  aggregateType: z.string(),
});
export type CreateComplianceAudit = z.infer<typeof CreateComplianceAuditSchema>;

/**
 * Create general audit entry request
 */
export const CreateGeneralAuditSchema = z.object({
  clinicId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  userName: z.string().optional(),
  userRole: z.string().optional(),
  action: z.string(),
  category: GeneralAuditCategorySchema,
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  entityName: z.string().optional(),
  oldValue: z.unknown().optional(),
  newValue: z.unknown().optional(),
  details: z.string().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  status: GeneralAuditStatusSchema.default('success'),
});
export type CreateGeneralAudit = z.infer<typeof CreateGeneralAuditSchema>;

/**
 * Create consent audit entry request
 */
export const CreateConsentAuditSchema = z.object({
  consentId: z.string(),
  action: ConsentAuditActionSchema,
  previousStatus: z.string().optional(),
  newStatus: z.string(),
  performedBy: z.string(),
  reason: z.string().optional(),
  ipAddress: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});
export type CreateConsentAudit = z.infer<typeof CreateConsentAuditSchema>;

/**
 * Create replay audit entry request
 */
export const CreateReplayAuditSchema = z.object({
  operationType: ReplayOperationTypeSchema,
  initiatedBy: z.string(),
  correlationId: z.string(),
  aggregateId: z.string().optional(),
  aggregateType: z.string().optional(),
  projectionName: z.string().optional(),
  tenantId: z.string().optional(),
  parameters: z.record(z.unknown()).optional(),
  reason: z.string().optional(),
});
export type CreateReplayAudit = z.infer<typeof CreateReplayAuditSchema>;

// =============================================================================
// QUERY SCHEMAS
// =============================================================================

/**
 * Unified audit log query filters
 */
export const AuditQueryFiltersSchema = z.object({
  auditType: AuditTypeSchema.optional(),
  startTime: z.coerce.date().optional(),
  endTime: z.coerce.date().optional(),
  actorId: z.string().optional(),
  actorType: AuditActorTypeSchema.optional(),
  action: AuditActionSchema.optional(),
  severity: AuditSeveritySchema.optional(),
  aggregateId: z.string().uuid().optional(),
  aggregateType: z.string().optional(),
  correlationId: z.string().optional(),
  complianceTags: z.array(z.string()).optional(),
  // General audit filters
  clinicId: z.string().uuid().optional(),
  category: GeneralAuditCategorySchema.optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  status: GeneralAuditStatusSchema.optional(),
  // Consent audit filters
  consentId: z.string().optional(),
  // Replay audit filters
  operationType: ReplayOperationTypeSchema.optional(),
  replayStatus: ReplayStatusSchema.optional(),
  projectionName: z.string().optional(),
  tenantId: z.string().optional(),
  // Pagination
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  // Search
  search: z.string().optional(),
});
export type AuditQueryFilters = z.infer<typeof AuditQueryFiltersSchema>;

/**
 * Audit query result
 */
export const AuditQueryResultSchema = z.object({
  entries: z.array(UnifiedAuditEntrySchema),
  total: z.number(),
  hasMore: z.boolean(),
  queryTime: z.coerce.date(),
});
export type AuditQueryResult = z.infer<typeof AuditQueryResultSchema>;

// =============================================================================
// STATS SCHEMAS
// =============================================================================

/**
 * Audit statistics by type
 */
export const AuditTypeStatsSchema = z.object({
  auditType: AuditTypeSchema,
  totalEntries: z.number(),
  bySeverity: z.record(AuditSeveritySchema, z.number()),
  byAction: z.record(AuditActionSchema, z.number()),
  uniqueActors: z.number(),
});
export type AuditTypeStats = z.infer<typeof AuditTypeStatsSchema>;

/**
 * Overall audit statistics
 */
export const AuditStatsSchema = z.object({
  totalLogs: z.number(),
  todayLogs: z.number(),
  failedActions: z.number(),
  uniqueUsers: z.number(),
  byAuditType: z.array(AuditTypeStatsSchema),
  // Aliases for backward compatibility
  successCount: z.number(),
  warningCount: z.number(),
  errorCount: z.number(),
  activeUsers: z.number(),
});
export type AuditStats = z.infer<typeof AuditStatsSchema>;
