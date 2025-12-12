/**
 * @fileoverview Dental Lab Production Schemas
 *
 * Comprehensive Zod schemas for dental laboratory case management.
 * Follows ISO 22674 standards for dental materials and prosthetics.
 *
 * @module types/schemas/dental-lab
 */

import { z } from 'zod';
import { UUIDSchema, TimestampSchema } from './common.js';

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

/**
 * Lab case lifecycle statuses following ISO 22674 dental laboratory standards
 */
export const LAB_CASE_STATUSES = [
  // Initial states
  'RECEIVED',
  'PENDING_SCAN',
  'SCAN_RECEIVED',
  // Design phase (CAD)
  'IN_DESIGN',
  'DESIGN_REVIEW',
  'DESIGN_APPROVED',
  'DESIGN_REVISION',
  // Fabrication phase (CAM)
  'QUEUED_FOR_MILLING',
  'MILLING',
  'POST_PROCESSING',
  'FINISHING',
  // Quality control
  'QC_INSPECTION',
  'QC_FAILED',
  'QC_PASSED',
  // Delivery
  'READY_FOR_PICKUP',
  'IN_TRANSIT',
  'DELIVERED',
  // Try-in and adjustment
  'TRY_IN_SCHEDULED',
  'ADJUSTMENT_REQUIRED',
  'ADJUSTMENT_IN_PROGRESS',
  // Final states
  'COMPLETED',
  'CANCELLED',
  'ON_HOLD',
] as const;

export const LabCaseStatusSchema = z.enum(LAB_CASE_STATUSES);
export type LabCaseStatus = z.infer<typeof LabCaseStatusSchema>;

/**
 * Priority levels for lab cases
 */
export const LAB_CASE_PRIORITIES = ['STANDARD', 'RUSH', 'EMERGENCY', 'VIP'] as const;
export const LabCasePrioritySchema = z.enum(LAB_CASE_PRIORITIES);
export type LabCasePriority = z.infer<typeof LabCasePrioritySchema>;

/**
 * Prosthetic types per ISO 22674 classification
 */
export const PROSTHETIC_TYPES = [
  // Fixed prosthetics
  'CROWN',
  'BRIDGE',
  'VENEER',
  'INLAY',
  'ONLAY',
  'OVERLAY',
  // Implant prosthetics
  'IMPLANT_CROWN',
  'IMPLANT_BRIDGE',
  'IMPLANT_ABUTMENT',
  'SCREW_RETAINED_CROWN',
  'CEMENT_RETAINED_CROWN',
  'HYBRID_PROSTHESIS',
  'OVERDENTURE',
  'BAR_ATTACHMENT',
  // Removable prosthetics
  'COMPLETE_DENTURE',
  'PARTIAL_DENTURE',
  'IMMEDIATE_DENTURE',
  'FLIPPER',
  'NIGHT_GUARD',
  'SPORTS_GUARD',
  'SLEEP_APPLIANCE',
  // Orthodontic appliances
  'RETAINER',
  'ALIGNER',
  'SPACE_MAINTAINER',
  // Surgical guides
  'SURGICAL_GUIDE',
  'BONE_GRAFT_TEMPLATE',
  // Temporaries
  'PROVISIONAL_CROWN',
  'PROVISIONAL_BRIDGE',
  'PROVISIONAL_ALLON',
] as const;

export const ProstheticTypeSchema = z.enum(PROSTHETIC_TYPES);
export type ProstheticType = z.infer<typeof ProstheticTypeSchema>;

/**
 * Dental materials per ISO 22674 classification
 */
export const PROSTHETIC_MATERIALS = [
  // Ceramics
  'ZIRCONIA',
  'ZIRCONIA_TRANSLUCENT',
  'ZIRCONIA_MULTI',
  'EMAX',
  'FELDSPATHIC',
  'EMPRESS',
  // Metals
  'TITANIUM',
  'TITANIUM_BASE',
  'COBALT_CHROME',
  'GOLD',
  'PRECIOUS_METAL',
  'BASE_METAL',
  // Polymers
  'PMMA',
  'PEEK',
  'ACRYLIC',
  'COMPOSITE',
  'FLEXIBLE_NYLON',
  'TEMP_COMPOSITE',
  // Hybrid materials
  'ZIRCONIA_PORCELAIN',
  'METAL_CERAMIC',
  'METAL_ACRYLIC',
] as const;

export const ProstheticMaterialSchema = z.enum(PROSTHETIC_MATERIALS);
export type ProstheticMaterial = z.infer<typeof ProstheticMaterialSchema>;

/**
 * Shade systems
 */
export const SHADE_SYSTEMS = [
  'VITA_CLASSICAL',
  'VITA_3D_MASTER',
  'VITA_BLEACH',
  'IVOCLAR',
  'CUSTOM',
] as const;

export const ShadeSystemSchema = z.enum(SHADE_SYSTEMS);
export type ShadeSystem = z.infer<typeof ShadeSystemSchema>;

/**
 * FDI tooth notation (ISO 3950)
 */
export const FDI_TOOTH_NUMBERS = [
  // Upper right quadrant (1)
  '18', '17', '16', '15', '14', '13', '12', '11',
  // Upper left quadrant (2)
  '21', '22', '23', '24', '25', '26', '27', '28',
  // Lower left quadrant (3)
  '38', '37', '36', '35', '34', '33', '32', '31',
  // Lower right quadrant (4)
  '41', '42', '43', '44', '45', '46', '47', '48',
] as const;

export const FDIToothNumberSchema = z.enum(FDI_TOOTH_NUMBERS);
export type FDIToothNumber = z.infer<typeof FDIToothNumberSchema>;

/**
 * Digital scan types
 */
export const SCAN_TYPES = ['INTRAORAL', 'MODEL', 'CBCT', 'FACIAL'] as const;
export const ScanTypeSchema = z.enum(SCAN_TYPES);
export type ScanType = z.infer<typeof ScanTypeSchema>;

/**
 * File formats for digital assets
 */
export const DIGITAL_FILE_FORMATS = ['STL', 'PLY', 'OBJ', 'DCM', 'DICOM'] as const;
export const DigitalFileFormatSchema = z.enum(DIGITAL_FILE_FORMATS);
export type DigitalFileFormat = z.infer<typeof DigitalFileFormatSchema>;

/**
 * Scan quality ratings
 */
export const SCAN_QUALITY_LEVELS = ['EXCELLENT', 'GOOD', 'ACCEPTABLE', 'POOR'] as const;
export const ScanQualitySchema = z.enum(SCAN_QUALITY_LEVELS);
export type ScanQuality = z.infer<typeof ScanQualitySchema>;

/**
 * Fabrication methods
 */
export const FABRICATION_METHODS = ['MILLING', 'PRINTING', 'CASTING', 'PRESSING', 'LAYERING'] as const;
export const FabricationMethodSchema = z.enum(FABRICATION_METHODS);
export type FabricationMethod = z.infer<typeof FabricationMethodSchema>;

/**
 * CAD software systems
 */
export const CAD_SOFTWARE = ['EXOCAD', '3SHAPE', 'DENTAL_WINGS', 'CEREC', 'PLANMECA', 'OTHER'] as const;
export const CADSoftwareSchema = z.enum(CAD_SOFTWARE);
export type CADSoftware = z.infer<typeof CADSoftwareSchema>;

/**
 * Occlusal schemes
 */
export const OCCLUSAL_SCHEMES = ['CANINE_GUIDANCE', 'GROUP_FUNCTION', 'MUTUALLY_PROTECTED'] as const;
export const OcclusalSchemeSchema = z.enum(OCCLUSAL_SCHEMES);
export type OcclusalScheme = z.infer<typeof OcclusalSchemeSchema>;

/**
 * Margin types
 */
export const MARGIN_TYPES = ['CHAMFER', 'SHOULDER', 'KNIFE_EDGE', 'FEATHER_EDGE'] as const;
export const MarginTypeSchema = z.enum(MARGIN_TYPES);
export type MarginType = z.infer<typeof MarginTypeSchema>;

/**
 * Contact types
 */
export const CONTACT_TYPES = ['POINT', 'AREA', 'MODIFIED_RIDGE_LAP'] as const;
export const ContactTypeSchema = z.enum(CONTACT_TYPES);
export type ContactType = z.infer<typeof ContactTypeSchema>;

/**
 * Implant connection types
 */
export const IMPLANT_CONNECTION_TYPES = ['INTERNAL_HEX', 'EXTERNAL_HEX', 'CONICAL', 'TRI_LOBE'] as const;
export const ImplantConnectionTypeSchema = z.enum(IMPLANT_CONNECTION_TYPES);
export type ImplantConnectionType = z.infer<typeof ImplantConnectionTypeSchema>;

/**
 * Abutment types
 */
export const ABUTMENT_TYPES = ['STOCK', 'CUSTOM_MILLED', 'TI_BASE_HYBRID'] as const;
export const AbutmentTypeSchema = z.enum(ABUTMENT_TYPES);
export type AbutmentType = z.infer<typeof AbutmentTypeSchema>;

/**
 * Design approval statuses
 */
export const DESIGN_APPROVAL_STATUSES = ['PENDING', 'APPROVED', 'REVISION_REQUESTED', 'REJECTED'] as const;
export const DesignApprovalStatusSchema = z.enum(DESIGN_APPROVAL_STATUSES);
export type DesignApprovalStatus = z.infer<typeof DesignApprovalStatusSchema>;

/**
 * Design feedback types
 */
export const DESIGN_FEEDBACK_TYPES = ['APPROVAL', 'MINOR_REVISION', 'MAJOR_REVISION', 'REJECTION'] as const;
export const DesignFeedbackTypeSchema = z.enum(DESIGN_FEEDBACK_TYPES);
export type DesignFeedbackType = z.infer<typeof DesignFeedbackTypeSchema>;

/**
 * Collaboration roles
 */
export const COLLABORATION_ROLES = ['CLINICIAN', 'LAB_TECHNICIAN', 'LAB_DESIGNER', 'QC_INSPECTOR', 'COORDINATOR'] as const;
export const CollaborationRoleSchema = z.enum(COLLABORATION_ROLES);
export type CollaborationRole = z.infer<typeof CollaborationRoleSchema>;

/**
 * Organizations
 */
export const ORGANIZATIONS = ['CLINIC', 'LAB'] as const;
export const OrganizationSchema = z.enum(ORGANIZATIONS);
export type Organization = z.infer<typeof OrganizationSchema>;

/**
 * Thread statuses
 */
export const THREAD_STATUSES = ['OPEN', 'PENDING_RESPONSE', 'RESOLVED', 'ESCALATED'] as const;
export const ThreadStatusSchema = z.enum(THREAD_STATUSES);
export type ThreadStatus = z.infer<typeof ThreadStatusSchema>;

/**
 * Message types
 */
export const MESSAGE_TYPES = [
  'TEXT',
  'DESIGN_FEEDBACK',
  'APPROVAL_REQUEST',
  'REVISION_REQUEST',
  'QUESTION',
  'URGENT',
  'STATUS_UPDATE',
] as const;
export const MessageTypeSchema = z.enum(MESSAGE_TYPES);
export type MessageType = z.infer<typeof MessageTypeSchema>;

/**
 * SLA types
 */
export const SLA_TYPES = ['STANDARD', 'RUSH', 'EMERGENCY'] as const;
export const SLATypeSchema = z.enum(SLA_TYPES);
export type SLAType = z.infer<typeof SLATypeSchema>;

/**
 * SLA milestone statuses
 */
export const SLA_MILESTONE_STATUSES = ['PENDING', 'ON_TRACK', 'AT_RISK', 'OVERDUE', 'COMPLETED'] as const;
export const SLAMilestoneStatusSchema = z.enum(SLA_MILESTONE_STATUSES);
export type SLAMilestoneStatus = z.infer<typeof SLAMilestoneStatusSchema>;

/**
 * Overall SLA statuses
 */
export const SLA_OVERALL_STATUSES = ['ON_TRACK', 'AT_RISK', 'OVERDUE'] as const;
export const SLAOverallStatusSchema = z.enum(SLA_OVERALL_STATUSES);
export type SLAOverallStatus = z.infer<typeof SLAOverallStatusSchema>;

/**
 * Adjustment types
 */
export const ADJUSTMENT_TYPES = ['OCCLUSION', 'CONTACT', 'SHADE', 'CONTOUR', 'MARGIN', 'FIT', 'TEXTURE', 'OTHER'] as const;
export const AdjustmentTypeSchema = z.enum(ADJUSTMENT_TYPES);
export type AdjustmentType = z.infer<typeof AdjustmentTypeSchema>;

/**
 * Annotation types
 */
export const ANNOTATION_TYPES = ['ARROW', 'CIRCLE', 'RECTANGLE', 'FREEFORM', 'TEXT'] as const;
export const AnnotationTypeSchema = z.enum(ANNOTATION_TYPES);
export type AnnotationType = z.infer<typeof AnnotationTypeSchema>;

/**
 * QC criteria types
 */
export const QC_CRITERIA = [
  'MARGINAL_FIT',
  'OCCLUSION',
  'CONTACTS',
  'AESTHETICS',
  'CONTOUR',
  'EMERGENCE',
  'SHADE_MATCH',
  'SURFACE_FINISH',
] as const;
export const QCCriterionSchema = z.enum(QC_CRITERIA);
export type QCCriterion = z.infer<typeof QCCriterionSchema>;

/**
 * Performance trend
 */
export const PERFORMANCE_TRENDS = ['IMPROVING', 'STABLE', 'DECLINING'] as const;
export const PerformanceTrendSchema = z.enum(PERFORMANCE_TRENDS);
export type PerformanceTrend = z.infer<typeof PerformanceTrendSchema>;

// =============================================================================
// PROSTHETIC SPECIFICATION SCHEMAS
// =============================================================================

/**
 * Prosthetic specification for a single prosthetic in a lab case
 */
export const ProstheticSpecSchema = z.object({
  id: UUIDSchema.optional(),
  type: ProstheticTypeSchema,
  material: ProstheticMaterialSchema,
  toothNumbers: z.array(FDIToothNumberSchema).min(1).max(32),
  shadeSystem: ShadeSystemSchema.optional(),
  shade: z.string().max(20).optional(),
  stumpShade: z.string().max(20).optional(),
  occlusalScheme: OcclusalSchemeSchema.optional(),
  marginType: MarginTypeSchema.optional(),
  contactType: ContactTypeSchema.optional(),
  specialInstructions: z.string().max(2000).optional(),
});
export type ProstheticSpec = z.infer<typeof ProstheticSpecSchema>;

/**
 * Implant component specification
 */
export const ImplantComponentSpecSchema = z.object({
  id: UUIDSchema.optional(),
  implantSystem: z.string().min(1).max(100),
  implantPlatform: z.string().min(1).max(100),
  platformDiameter: z.number().positive().max(10),
  abutmentType: AbutmentTypeSchema.optional(),
  screwType: z.string().max(100).optional(),
  torqueNcm: z.number().positive().max(100).optional(),
  connectionType: ImplantConnectionTypeSchema.optional(),
  toothPosition: FDIToothNumberSchema.optional(),
});
export type ImplantComponentSpec = z.infer<typeof ImplantComponentSpecSchema>;

// =============================================================================
// DIGITAL SCAN SCHEMAS
// =============================================================================

/**
 * Digital scan file metadata
 */
export const DigitalScanSchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  scanType: ScanTypeSchema,
  fileFormat: DigitalFileFormatSchema,
  filePath: z.string().min(1).max(500),
  fileSize: z.number().int().positive(),
  checksum: z.string().optional(),
  scannerBrand: z.string().max(100).optional(),
  scannerModel: z.string().max(100).optional(),
  quality: ScanQualitySchema.optional(),
  notes: z.string().max(2000).optional(),
  processed: z.boolean().default(false),
  processingErrors: z.array(z.string()).optional(),
  uploadedBy: UUIDSchema.optional(),
  uploadedAt: TimestampSchema,
  createdAt: TimestampSchema,
});
export type DigitalScan = z.infer<typeof DigitalScanSchema>;

export const CreateDigitalScanSchema = DigitalScanSchema.omit({
  id: true,
  createdAt: true,
}).partial({
  uploadedAt: true,
  processed: true,
});
export type CreateDigitalScan = z.infer<typeof CreateDigitalScanSchema>;

// =============================================================================
// CAD DESIGN SCHEMAS
// =============================================================================

/**
 * CAD design file and approval workflow
 */
export const CADDesignSchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  softwareUsed: z.string().min(1).max(100),
  softwareVersion: z.string().max(50).optional(),
  filePath: z.string().min(1).max(500),
  fileSize: z.number().int().positive().optional(),
  thumbnailPath: z.string().max(500).optional(),
  designedBy: UUIDSchema,
  designedAt: TimestampSchema,
  revisionNumber: z.number().int().positive().default(1),
  approvedBy: UUIDSchema.optional(),
  approvedAt: TimestampSchema.optional(),
  approvalStatus: DesignApprovalStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type CADDesign = z.infer<typeof CADDesignSchema>;

export const CreateCADDesignSchema = CADDesignSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  designedAt: true,
  revisionNumber: true,
});
export type CreateCADDesign = z.infer<typeof CreateCADDesignSchema>;

export const ApproveDesignSchema = z.object({
  designId: UUIDSchema,
  approvedBy: UUIDSchema,
  approvalStatus: z.enum(['APPROVED', 'REVISION_REQUESTED', 'REJECTED']),
  notes: z.string().max(2000).optional(),
});
export type ApproveDesign = z.infer<typeof ApproveDesignSchema>;

// =============================================================================
// FABRICATION RECORD SCHEMAS
// =============================================================================

/**
 * Fabrication record for tracking manufacturing
 */
export const FabricationRecordSchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  method: FabricationMethodSchema,
  machineId: z.string().max(100).optional(),
  machineName: z.string().max(200).optional(),
  materialBatch: z.string().max(100).optional(),
  materialLotNumber: z.string().max(100).optional(),
  startedAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  durationMinutes: z.number().int().positive().optional(),
  technicianId: UUIDSchema,
  parameters: z.record(z.unknown()).default({}),
  notes: z.string().max(2000).optional(),
  createdAt: TimestampSchema,
});
export type FabricationRecord = z.infer<typeof FabricationRecordSchema>;

export const CreateFabricationRecordSchema = FabricationRecordSchema.omit({
  id: true,
  createdAt: true,
}).partial({
  startedAt: true,
  parameters: true,
});
export type CreateFabricationRecord = z.infer<typeof CreateFabricationRecordSchema>;

// =============================================================================
// QUALITY CONTROL SCHEMAS
// =============================================================================

/**
 * Individual QC criterion result
 */
export const QCCriteriaResultSchema = z.object({
  criterion: QCCriterionSchema,
  passed: z.boolean(),
  score: z.number().int().min(0).max(10),
  notes: z.string().max(500).optional(),
});
export type QCCriteriaResult = z.infer<typeof QCCriteriaResultSchema>;

/**
 * Quality control inspection record
 */
export const QCInspectionSchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  inspectedBy: UUIDSchema,
  inspectedAt: TimestampSchema,
  passed: z.boolean(),
  overallScore: z.number().int().min(0).max(100),
  criteria: z.array(QCCriteriaResultSchema),
  notes: z.string().max(2000).optional(),
  photos: z.array(z.string().max(500)).max(20).optional(),
  createdAt: TimestampSchema,
});
export type QCInspection = z.infer<typeof QCInspectionSchema>;

export const CreateQCInspectionSchema = QCInspectionSchema.omit({
  id: true,
  createdAt: true,
}).partial({
  inspectedAt: true,
});
export type CreateQCInspection = z.infer<typeof CreateQCInspectionSchema>;

// =============================================================================
// TRY-IN RECORD SCHEMAS
// =============================================================================

/**
 * Adjustment request from try-in
 */
export const AdjustmentRequestSchema = z.object({
  type: AdjustmentTypeSchema,
  description: z.string().min(1).max(1000),
  toothNumbers: z.array(FDIToothNumberSchema).optional(),
  resolved: z.boolean().default(false),
});
export type AdjustmentRequest = z.infer<typeof AdjustmentRequestSchema>;

/**
 * Try-in and adjustment record
 */
export const TryInRecordSchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  scheduledAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  clinicianId: UUIDSchema.optional(),
  clinicianNotes: z.string().max(2000).optional(),
  adjustmentsRequired: z.array(AdjustmentRequestSchema).default([]),
  patientSatisfaction: z.number().int().min(1).max(5).optional(),
  photos: z.array(z.string().max(500)).max(20).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type TryInRecord = z.infer<typeof TryInRecordSchema>;

export const CreateTryInRecordSchema = TryInRecordSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).partial({
  adjustmentsRequired: true,
});
export type CreateTryInRecord = z.infer<typeof CreateTryInRecordSchema>;

// =============================================================================
// STATUS HISTORY SCHEMAS
// =============================================================================

/**
 * Status history entry for event sourcing
 */
export const StatusHistoryEntrySchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  previousStatus: LabCaseStatusSchema.optional(),
  newStatus: LabCaseStatusSchema,
  changedBy: UUIDSchema,
  changedAt: TimestampSchema,
  reason: z.string().max(500).optional(),
  slaDeadline: TimestampSchema,
  eventType: z.string().default('STATUS_CHANGE'),
  eventData: z.record(z.unknown()).default({}),
});
export type StatusHistoryEntry = z.infer<typeof StatusHistoryEntrySchema>;

// =============================================================================
// LAB CASE SCHEMAS
// =============================================================================

/**
 * Complete lab case entity
 */
export const LabCaseSchema = z.object({
  id: UUIDSchema,
  caseNumber: z.string().regex(/^[A-Z]+-\d{4}-\d{6}$/, 'Invalid case number format'),
  clinicId: UUIDSchema,
  patientId: UUIDSchema,
  allOnXCaseId: UUIDSchema.optional(),

  // Status
  status: LabCaseStatusSchema,
  priority: LabCasePrioritySchema,
  statusHistory: z.array(StatusHistoryEntrySchema).optional(),

  // Prescription
  prescribingDentist: z.string().min(1).max(200),
  prescriptionDate: TimestampSchema,
  prosthetics: z.array(ProstheticSpecSchema).min(1).max(32),
  implantComponents: z.array(ImplantComponentSpecSchema).optional(),
  specialInstructions: z.string().max(5000).optional(),
  antagonistInfo: z.string().max(2000).optional(),

  // Digital assets
  scans: z.array(DigitalScanSchema).optional(),
  designs: z.array(CADDesignSchema).optional(),
  currentDesignId: UUIDSchema.optional(),

  // Fabrication
  fabricationRecords: z.array(FabricationRecordSchema).optional(),

  // Quality Control
  qcInspections: z.array(QCInspectionSchema).optional(),

  // Try-in and delivery
  tryInRecords: z.array(TryInRecordSchema).optional(),
  deliveryDate: TimestampSchema.optional(),
  deliveredBy: UUIDSchema.optional(),
  trackingNumber: z.string().max(100).optional(),

  // Assignment
  assignedTechnician: UUIDSchema.optional(),
  assignedDesigner: UUIDSchema.optional(),

  // Financials
  estimatedCost: z.number().nonnegative().optional(),
  actualCost: z.number().nonnegative().optional(),
  currency: z.string().length(3).default('RON'),

  // Dates
  receivedAt: TimestampSchema,
  dueDate: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  currentSLADeadline: TimestampSchema,

  // Metadata
  notes: z.string().max(5000).optional(),
  version: z.number().int().positive().default(1),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  deletedAt: TimestampSchema.optional(),
});
export type LabCase = z.infer<typeof LabCaseSchema>;

/**
 * Create lab case input
 */
export const CreateLabCaseSchema = z.object({
  clinicId: UUIDSchema,
  patientId: UUIDSchema,
  allOnXCaseId: UUIDSchema.optional(),
  prescribingDentist: z.string().min(1).max(200),
  prosthetics: z.array(ProstheticSpecSchema).min(1).max(32),
  implantComponents: z.array(ImplantComponentSpecSchema).optional(),
  priority: LabCasePrioritySchema.default('STANDARD'),
  dueDate: TimestampSchema,
  specialInstructions: z.string().max(5000).optional(),
  antagonistInfo: z.string().max(2000).optional(),
  currency: z.string().length(3).default('RON'),
  estimatedCost: z.number().nonnegative().optional(),
});
export type CreateLabCase = z.infer<typeof CreateLabCaseSchema>;

/**
 * Update lab case input
 */
export const UpdateLabCaseSchema = z.object({
  status: LabCaseStatusSchema.optional(),
  priority: LabCasePrioritySchema.optional(),
  assignedTechnician: UUIDSchema.optional(),
  assignedDesigner: UUIDSchema.optional(),
  dueDate: TimestampSchema.optional(),
  specialInstructions: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
});
export type UpdateLabCase = z.infer<typeof UpdateLabCaseSchema>;

/**
 * Lab case status transition
 */
export const TransitionLabCaseStatusSchema = z.object({
  labCaseId: UUIDSchema,
  newStatus: LabCaseStatusSchema,
  reason: z.string().max(500).optional(),
  changedBy: UUIDSchema,
});
export type TransitionLabCaseStatus = z.infer<typeof TransitionLabCaseStatusSchema>;

// =============================================================================
// COLLABORATION SCHEMAS
// =============================================================================

/**
 * Message sender info
 */
export const MessageSenderSchema = z.object({
  id: UUIDSchema,
  name: z.string().min(1).max(200),
  role: CollaborationRoleSchema,
  organization: OrganizationSchema,
});
export type MessageSender = z.infer<typeof MessageSenderSchema>;

/**
 * Message attachment
 */
export const MessageAttachmentSchema = z.object({
  id: UUIDSchema,
  filename: z.string().min(1).max(255),
  fileType: z.enum(['IMAGE', 'STL', 'PLY', 'PDF', 'DICOM', 'VIDEO']),
  fileSize: z.number().int().positive(),
  url: z.string().url(),
  thumbnailUrl: z.string().url().optional(),
});
export type MessageAttachment = z.infer<typeof MessageAttachmentSchema>;

/**
 * Message reference
 */
export const MessageReferenceSchema = z.object({
  type: z.enum(['DESIGN', 'SCAN', 'PHOTO', 'DOCUMENT']),
  id: UUIDSchema,
  description: z.string().max(500),
});
export type MessageReference = z.infer<typeof MessageReferenceSchema>;

/**
 * Collaboration message
 */
export const CollaborationMessageSchema = z.object({
  id: UUIDSchema,
  threadId: UUIDSchema,
  labCaseId: UUIDSchema,
  sender: MessageSenderSchema,
  content: z.string().min(1).max(10000),
  messageType: MessageTypeSchema,
  attachments: z.array(MessageAttachmentSchema).max(10).default([]),
  references: z.array(MessageReferenceSchema).max(10).default([]),
  readBy: z.array(z.object({
    userId: UUIDSchema,
    readAt: TimestampSchema,
  })).default([]),
  createdAt: TimestampSchema,
});
export type CollaborationMessage = z.infer<typeof CollaborationMessageSchema>;

/**
 * Thread participant
 */
export const ThreadParticipantSchema = z.object({
  userId: UUIDSchema,
  role: CollaborationRoleSchema,
  organization: OrganizationSchema,
  lastSeen: TimestampSchema.optional(),
});
export type ThreadParticipant = z.infer<typeof ThreadParticipantSchema>;

/**
 * Collaboration thread
 */
export const CollaborationThreadSchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  subject: z.string().min(1).max(500),
  status: ThreadStatusSchema,
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']),
  participants: z.array(ThreadParticipantSchema),
  messages: z.array(CollaborationMessageSchema).optional(),
  unreadCount: z.record(UUIDSchema, z.number().int().nonnegative()).default({}),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  resolvedAt: TimestampSchema.optional(),
});
export type CollaborationThread = z.infer<typeof CollaborationThreadSchema>;

/**
 * Create thread input
 */
export const CreateCollaborationThreadSchema = z.object({
  labCaseId: UUIDSchema,
  subject: z.string().min(1).max(500),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  initialMessage: z.string().min(1).max(10000),
  sender: MessageSenderSchema,
});
export type CreateCollaborationThread = z.infer<typeof CreateCollaborationThreadSchema>;

/**
 * Add message to thread input
 */
export const AddMessageToThreadSchema = z.object({
  threadId: UUIDSchema,
  content: z.string().min(1).max(10000),
  sender: MessageSenderSchema,
  messageType: MessageTypeSchema.default('TEXT'),
  attachments: z.array(MessageAttachmentSchema).max(10).optional(),
  references: z.array(MessageReferenceSchema).max(10).optional(),
});
export type AddMessageToThread = z.infer<typeof AddMessageToThreadSchema>;

// =============================================================================
// DESIGN FEEDBACK SCHEMAS
// =============================================================================

/**
 * Design annotation for 3D markup
 */
export const DesignAnnotationSchema = z.object({
  id: UUIDSchema,
  type: AnnotationTypeSchema,
  coordinates: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number().optional(),
  }),
  description: z.string().min(1).max(500),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  resolved: z.boolean().default(false),
});
export type DesignAnnotation = z.infer<typeof DesignAnnotationSchema>;

/**
 * Criteria score for design feedback
 */
export const CriteriaScoreSchema = z.object({
  criterion: QCCriterionSchema,
  score: z.number().int().min(1).max(5),
  notes: z.string().max(500).optional(),
});
export type CriteriaScore = z.infer<typeof CriteriaScoreSchema>;

/**
 * Design feedback from clinician
 */
export const DesignFeedbackSchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  designId: UUIDSchema,
  feedbackType: DesignFeedbackTypeSchema,
  overallRating: z.number().int().min(1).max(5),
  criteriaScores: z.array(CriteriaScoreSchema),
  annotations: z.array(DesignAnnotationSchema).default([]),
  generalNotes: z.string().min(1).max(5000),
  reviewedBy: UUIDSchema,
  reviewedAt: TimestampSchema,
  responseDeadline: TimestampSchema.optional(),
});
export type DesignFeedback = z.infer<typeof DesignFeedbackSchema>;

/**
 * Create design feedback input
 */
export const CreateDesignFeedbackSchema = DesignFeedbackSchema.omit({
  id: true,
}).partial({
  reviewedAt: true,
  annotations: true,
});
export type CreateDesignFeedback = z.infer<typeof CreateDesignFeedbackSchema>;

// =============================================================================
// SLA TRACKING SCHEMAS
// =============================================================================

/**
 * SLA milestone
 */
export const SLAMilestoneSchema = z.object({
  name: z.string().min(1).max(100),
  expectedBy: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  status: SLAMilestoneStatusSchema,
});
export type SLAMilestone = z.infer<typeof SLAMilestoneSchema>;

/**
 * Lab SLA tracking
 */
export const LabSLATrackingSchema = z.object({
  id: UUIDSchema,
  labCaseId: UUIDSchema,
  slaType: SLATypeSchema,
  milestones: z.array(SLAMilestoneSchema),
  overallStatus: SLAOverallStatusSchema,
  daysRemaining: z.number().int(),
  percentComplete: z.number().int().min(0).max(100),
  lastCalculatedAt: TimestampSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type LabSLATracking = z.infer<typeof LabSLATrackingSchema>;

// =============================================================================
// PERFORMANCE METRICS SCHEMAS
// =============================================================================

/**
 * Lab performance metrics
 */
export const LabPerformanceMetricsSchema = z.object({
  id: UUIDSchema,
  clinicId: UUIDSchema,
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totalCases: z.number().int().nonnegative(),
  completedCases: z.number().int().nonnegative(),
  onTimeDeliveryRate: z.number().min(0).max(100).optional(),
  avgTurnaroundDays: z.number().nonnegative().optional(),
  firstTimeQCPassRate: z.number().min(0).max(100).optional(),
  avgRevisions: z.number().nonnegative().optional(),
  avgPatientSatisfaction: z.number().min(0).max(5).optional(),
  performanceTrend: PerformanceTrendSchema.optional(),
  breakdownByType: z.record(z.number()).default({}),
  breakdownByMaterial: z.record(z.number()).default({}),
  calculatedAt: TimestampSchema,
});
export type LabPerformanceMetrics = z.infer<typeof LabPerformanceMetricsSchema>;

// =============================================================================
// NOTIFICATION PREFERENCES SCHEMAS
// =============================================================================

/**
 * Lab notification preferences
 */
export const LabNotificationPreferencesSchema = z.object({
  id: UUIDSchema,
  userId: UUIDSchema,
  channels: z.object({
    email: z.boolean().default(true),
    sms: z.boolean().default(false),
    whatsapp: z.boolean().default(true),
    inApp: z.boolean().default(true),
    push: z.boolean().default(true),
  }),
  triggers: z.object({
    statusChange: z.boolean().default(true),
    designReady: z.boolean().default(true),
    revisionRequested: z.boolean().default(true),
    qcComplete: z.boolean().default(true),
    readyForPickup: z.boolean().default(true),
    urgentMessage: z.boolean().default(true),
    deliveryUpdate: z.boolean().default(true),
  }),
  quietHours: z.object({
    start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  }).optional(),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
});
export type LabNotificationPreferences = z.infer<typeof LabNotificationPreferencesSchema>;

// =============================================================================
// QUERY & FILTER SCHEMAS
// =============================================================================

/**
 * Lab case query filters
 */
export const LabCaseQueryFiltersSchema = z.object({
  clinicId: UUIDSchema.optional(),
  patientId: UUIDSchema.optional(),
  status: z.array(LabCaseStatusSchema).optional(),
  priority: z.array(LabCasePrioritySchema).optional(),
  assignedTechnician: UUIDSchema.optional(),
  assignedDesigner: UUIDSchema.optional(),
  prostheticType: z.array(ProstheticTypeSchema).optional(),
  material: z.array(ProstheticMaterialSchema).optional(),
  dueDateFrom: TimestampSchema.optional(),
  dueDateTo: TimestampSchema.optional(),
  receivedFrom: TimestampSchema.optional(),
  receivedTo: TimestampSchema.optional(),
  slaStatus: z.array(SLAOverallStatusSchema).optional(),
  search: z.string().max(100).optional(),
});
export type LabCaseQueryFilters = z.infer<typeof LabCaseQueryFiltersSchema>;

/**
 * Lab case pagination
 */
export const LabCasePaginationSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
  sortBy: z.enum([
    'caseNumber',
    'receivedAt',
    'dueDate',
    'status',
    'priority',
    'currentSLADeadline',
  ]).default('receivedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type LabCasePagination = z.infer<typeof LabCasePaginationSchema>;

/**
 * Lab case list response
 */
export const LabCaseListResponseSchema = z.object({
  cases: z.array(LabCaseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type LabCaseListResponse = z.infer<typeof LabCaseListResponseSchema>;

// =============================================================================
// EVENT SCHEMAS
// =============================================================================

/**
 * Lab case status changed event
 */
export const LabCaseStatusChangedEventSchema = z.object({
  eventType: z.literal('LAB_CASE_STATUS_CHANGED'),
  labCaseId: UUIDSchema,
  caseNumber: z.string(),
  previousStatus: LabCaseStatusSchema.optional(),
  newStatus: LabCaseStatusSchema,
  changedBy: UUIDSchema,
  changedAt: TimestampSchema,
  reason: z.string().optional(),
  clinicId: UUIDSchema,
  patientId: UUIDSchema,
});
export type LabCaseStatusChangedEvent = z.infer<typeof LabCaseStatusChangedEventSchema>;

/**
 * Lab case SLA breach event
 */
export const LabCaseSLABreachEventSchema = z.object({
  eventType: z.literal('LAB_CASE_SLA_BREACH'),
  labCaseId: UUIDSchema,
  caseNumber: z.string(),
  milestone: z.string(),
  expectedBy: TimestampSchema,
  currentStatus: LabCaseStatusSchema,
  clinicId: UUIDSchema,
  priority: LabCasePrioritySchema,
});
export type LabCaseSLABreachEvent = z.infer<typeof LabCaseSLABreachEventSchema>;

/**
 * Design review required event
 */
export const DesignReviewRequiredEventSchema = z.object({
  eventType: z.literal('DESIGN_REVIEW_REQUIRED'),
  labCaseId: UUIDSchema,
  caseNumber: z.string(),
  designId: UUIDSchema,
  clinicId: UUIDSchema,
  clinicianId: UUIDSchema,
  deadline: TimestampSchema,
});
export type DesignReviewRequiredEvent = z.infer<typeof DesignReviewRequiredEventSchema>;

/**
 * QC inspection completed event
 */
export const QCInspectionCompletedEventSchema = z.object({
  eventType: z.literal('QC_INSPECTION_COMPLETED'),
  labCaseId: UUIDSchema,
  caseNumber: z.string(),
  inspectionId: UUIDSchema,
  passed: z.boolean(),
  overallScore: z.number(),
  inspectedBy: UUIDSchema,
  clinicId: UUIDSchema,
});
export type QCInspectionCompletedEvent = z.infer<typeof QCInspectionCompletedEventSchema>;

/**
 * Lab case ready for pickup event
 */
export const LabCaseReadyForPickupEventSchema = z.object({
  eventType: z.literal('LAB_CASE_READY_FOR_PICKUP'),
  labCaseId: UUIDSchema,
  caseNumber: z.string(),
  clinicId: UUIDSchema,
  patientId: UUIDSchema,
  completedAt: TimestampSchema,
});
export type LabCaseReadyForPickupEvent = z.infer<typeof LabCaseReadyForPickupEventSchema>;

/**
 * Union of all lab events
 */
export const LabEventSchema = z.discriminatedUnion('eventType', [
  LabCaseStatusChangedEventSchema,
  LabCaseSLABreachEventSchema,
  DesignReviewRequiredEventSchema,
  QCInspectionCompletedEventSchema,
  LabCaseReadyForPickupEventSchema,
]);
export type LabEvent = z.infer<typeof LabEventSchema>;

// =============================================================================
// WORKFLOW PAYLOAD SCHEMAS
// =============================================================================

/**
 * Monitor SLA workflow payload
 */
export const MonitorSLAWorkflowPayloadSchema = z.object({
  clinicId: UUIDSchema.optional(),
  checkOverdueOnly: z.boolean().default(false),
  notifyOnAtRisk: z.boolean().default(true),
});
export type MonitorSLAWorkflowPayload = z.infer<typeof MonitorSLAWorkflowPayloadSchema>;

/**
 * Calculate performance metrics workflow payload
 */
export const CalculatePerformanceMetricsPayloadSchema = z.object({
  clinicId: UUIDSchema,
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type CalculatePerformanceMetricsPayload = z.infer<typeof CalculatePerformanceMetricsPayloadSchema>;

/**
 * Send status notification payload
 */
export const SendStatusNotificationPayloadSchema = z.object({
  labCaseId: UUIDSchema,
  newStatus: LabCaseStatusSchema,
  recipientIds: z.array(UUIDSchema),
  customMessage: z.string().max(1000).optional(),
});
export type SendStatusNotificationPayload = z.infer<typeof SendStatusNotificationPayloadSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Checks if a status transition is valid
 */
export function isValidStatusTransition(from: LabCaseStatus, to: LabCaseStatus): boolean {
  const validTransitions: Record<LabCaseStatus, readonly LabCaseStatus[]> = {
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

  return validTransitions[from]?.includes(to) ?? false;
}

/**
 * Gets SLA deadline hours for a status
 */
export function getSLAHours(status: LabCaseStatus): number {
  const slaHours: Record<LabCaseStatus, number> = {
    RECEIVED: 4,
    PENDING_SCAN: 24,
    SCAN_RECEIVED: 8,
    IN_DESIGN: 48,
    DESIGN_REVIEW: 24,
    DESIGN_APPROVED: 4,
    DESIGN_REVISION: 24,
    QUEUED_FOR_MILLING: 8,
    MILLING: 24,
    POST_PROCESSING: 12,
    FINISHING: 8,
    QC_INSPECTION: 4,
    QC_FAILED: 24,
    QC_PASSED: 2,
    READY_FOR_PICKUP: 48,
    IN_TRANSIT: 24,
    DELIVERED: 0,
    TRY_IN_SCHEDULED: 0,
    ADJUSTMENT_REQUIRED: 24,
    ADJUSTMENT_IN_PROGRESS: 48,
    COMPLETED: 0,
    CANCELLED: 0,
    ON_HOLD: 0,
  };

  return slaHours[status];
}

/**
 * Calculates SLA deadline from status change time
 */
export function calculateSLADeadline(status: LabCaseStatus, fromTime: Date): Date {
  const hours = getSLAHours(status);
  return new Date(fromTime.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Checks if a lab case is in an active (non-terminal) status
 */
export function isActiveStatus(status: LabCaseStatus): boolean {
  return !['COMPLETED', 'CANCELLED'].includes(status);
}

/**
 * Checks if a lab case is in design phase
 */
export function isDesignPhase(status: LabCaseStatus): boolean {
  return ['IN_DESIGN', 'DESIGN_REVIEW', 'DESIGN_APPROVED', 'DESIGN_REVISION'].includes(status);
}

/**
 * Checks if a lab case is in fabrication phase
 */
export function isFabricationPhase(status: LabCaseStatus): boolean {
  return ['QUEUED_FOR_MILLING', 'MILLING', 'POST_PROCESSING', 'FINISHING'].includes(status);
}

/**
 * Calculates overall QC score from criteria
 */
export function calculateQCScore(criteria: QCCriteriaResult[]): number {
  if (criteria.length === 0) return 0;

  const weights: Record<QCCriterion, number> = {
    MARGINAL_FIT: 20,
    OCCLUSION: 20,
    CONTACTS: 15,
    AESTHETICS: 15,
    CONTOUR: 10,
    EMERGENCE: 10,
    SHADE_MATCH: 5,
    SURFACE_FINISH: 5,
  };

  let totalWeight = 0;
  let weightedScore = 0;

  for (const c of criteria) {
    const weight = weights[c.criterion] ?? 10;
    totalWeight += weight;
    weightedScore += (c.score / 10) * weight;
  }

  return Math.round((weightedScore / totalWeight) * 100);
}

/**
 * Determines if QC passed based on criteria
 */
export function didQCPass(criteria: QCCriteriaResult[]): boolean {
  // All criteria must pass, and overall score must be >= 70
  const allPassed = criteria.every(c => c.passed);
  const score = calculateQCScore(criteria);
  return allPassed && score >= 70;
}

/**
 * Gets days until due date
 */
export function getDaysUntilDue(dueDate: Date): number {
  const now = new Date();
  const diff = dueDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Checks if case is overdue
 */
export function isCaseOverdue(dueDate: Date, status: LabCaseStatus): boolean {
  if (!isActiveStatus(status)) return false;
  return new Date() > dueDate;
}

/**
 * Gets priority multiplier for SLA calculations
 */
export function getPriorityMultiplier(priority: LabCasePriority): number {
  const multipliers: Record<LabCasePriority, number> = {
    STANDARD: 1,
    RUSH: 0.5,
    EMERGENCY: 0.25,
    VIP: 0.75,
  };
  return multipliers[priority];
}

/**
 * Formats case number display
 */
export function formatCaseNumber(caseNumber: string): string {
  return caseNumber;
}

/**
 * Generates a summary string for a lab case
 */
export function generateCaseSummary(labCase: Pick<LabCase, 'caseNumber' | 'prosthetics' | 'status'>): string {
  const units = labCase.prosthetics.reduce((sum, p) => sum + p.toothNumbers.length, 0);
  const types = [...new Set(labCase.prosthetics.map(p => p.type))].join(', ');
  return `${labCase.caseNumber}: ${units} unit(s) - ${types} [${labCase.status}]`;
}
