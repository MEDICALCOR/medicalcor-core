/**
 * @fileoverview Dental Lab Production API Routes
 *
 * Comprehensive REST API for dental lab case management with full lifecycle support.
 * Implements ISO 22674 dental laboratory standards with HIPAA/GDPR compliance.
 *
 * ## Features
 *
 * - Lab case CRUD operations
 * - Status workflow management
 * - Digital scan upload/download (presigned URLs)
 * - CAD design submission and approval
 * - Fabrication tracking
 * - QC inspection workflow
 * - Real-time collaboration
 * - SLA monitoring
 * - Analytics & reporting
 *
 * ## Authentication
 *
 * All endpoints require Bearer token authentication.
 * Clinic-based RLS is enforced via x-clinic-id header.
 *
 * @module apps/api/routes/dental-lab
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { generateCorrelationId, logger } from '@medicalcor/core';
import {
  CreateLabCaseSchema,
  UpdateLabCaseSchema,
  LabCaseQueryFiltersSchema,
  LabCasePaginationSchema,
  CreateDigitalScanSchema,
  CreateCADDesignSchema,
  ApproveDesignSchema,
  CreateFabricationRecordSchema,
  CreateQCInspectionSchema,
  CreateTryInRecordSchema,
  CreateCollaborationThreadSchema,
  AddMessageToThreadSchema,
  CreateDesignFeedbackSchema,
  LabCaseStatusSchema,
  type LabCaseStatus,
} from '@medicalcor/types';

// =============================================================================
// REQUEST SCHEMAS
// =============================================================================

const IdParamSchema = z.object({
  id: z.string().uuid(),
});

const CaseNumberParamSchema = z.object({
  caseNumber: z.string().regex(/^[A-Z]+-\d{4}-\d{6}$/),
});

const ThreadIdParamSchema = z.object({
  threadId: z.string().uuid(),
});

const DesignIdParamSchema = z.object({
  designId: z.string().uuid(),
});

const TransitionStatusSchema = z.object({
  newStatus: LabCaseStatusSchema,
  reason: z.string().max(500).optional(),
});

const AssignTechnicianSchema = z.object({
  technicianId: z.string().uuid(),
});

const AssignDesignerSchema = z.object({
  designerId: z.string().uuid(),
});

const ScheduleTryInSchema = z.object({
  scheduledAt: z.coerce.date(),
  clinicianId: z.string().uuid(),
});

const TryInResultsSchema = z.object({
  clinicianNotes: z.string().max(2000).optional(),
  patientSatisfaction: z.number().min(1).max(5).optional(),
  adjustmentsRequired: z.array(z.string()).optional(),
  photos: z.array(z.string().url()).optional(),
});

const InitiateScanUploadSchema = z.object({
  scanType: z.enum(['INTRAORAL', 'CBCT', 'FACE_SCAN', 'MODEL_SCAN', 'IMPRESSION_SCAN']),
  fileFormat: z.enum(['STL', 'PLY', 'OBJ', 'DCM', 'DICOM']),
  filename: z.string().min(1).max(255),
  fileSize: z.number().positive().max(500 * 1024 * 1024), // 500MB max
  scannerBrand: z.string().max(100).optional(),
  scannerModel: z.string().max(100).optional(),
});

const DateRangeSchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});

const HoursAheadSchema = z.object({
  hoursAhead: z.coerce.number().int().min(1).max(168).default(24),
});

// =============================================================================
// ROUTE PLUGIN
// =============================================================================

export const dentalLabRoutes: FastifyPluginAsync = async (fastify) => {
  // Dependency injection (would be configured in app setup)
  const getService = () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    return (fastify as any).dentalLabService;
  };

  const getClinicId = (request: FastifyRequest): string => {
    const clinicId = request.headers['x-clinic-id'];
    if (typeof clinicId !== 'string' || !clinicId) {
      throw new Error('x-clinic-id header is required');
    }
    return clinicId;
  };

  const getUserId = (request: FastifyRequest): string => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    return (request as any).user?.id ?? 'system';
  };

  // ===========================================================================
  // LAB CASE CRUD ENDPOINTS
  // ===========================================================================

  /**
   * Create a new lab case
   * POST /dental-lab/cases
   */
  fastify.post<{
    Body: z.infer<typeof CreateLabCaseSchema>;
  }>('/cases', {
    schema: {
      description: 'Create a new dental lab case',
      tags: ['dental-lab'],
      body: CreateLabCaseSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      const result = await service.createLabCase(request.body, userId);

      logger.info(
        { labCaseId: result.labCase.id, caseNumber: result.labCase.caseNumber, correlationId },
        'Lab case created'
      );

      return reply.status(201).send({
        success: true,
        data: result.labCase,
        event: result.event,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to create lab case');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Get lab case by ID
   * GET /dental-lab/cases/:id
   */
  fastify.get<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id', {
    schema: {
      description: 'Get a lab case by ID',
      tags: ['dental-lab'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    const parseResult = IdParamSchema.safeParse(request.params);
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Invalid ID format', correlationId });
    }

    try {
      const labCase = await service.getLabCase(parseResult.data.id);

      if (!labCase) {
        return reply.status(404).send({
          success: false,
          error: 'Lab case not found',
          correlationId,
        });
      }

      return reply.send({
        success: true,
        data: labCase,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get lab case');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * Get lab case by case number
   * GET /dental-lab/cases/by-number/:caseNumber
   */
  fastify.get<{
    Params: z.infer<typeof CaseNumberParamSchema>;
  }>('/cases/by-number/:caseNumber', {
    schema: {
      description: 'Get a lab case by case number',
      tags: ['dental-lab'],
      params: CaseNumberParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const labCase = await service.getLabCaseByCaseNumber(request.params.caseNumber);

      if (!labCase) {
        return reply.status(404).send({
          success: false,
          error: 'Lab case not found',
          correlationId,
        });
      }

      return reply.send({
        success: true,
        data: labCase,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get lab case by number');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * List lab cases with filtering and pagination
   * GET /dental-lab/cases
   */
  fastify.get<{
    Querystring: z.infer<typeof LabCaseQueryFiltersSchema> & z.infer<typeof LabCasePaginationSchema>;
  }>('/cases', {
    schema: {
      description: 'List lab cases with filtering and pagination',
      tags: ['dental-lab'],
      querystring: LabCaseQueryFiltersSchema.merge(LabCasePaginationSchema),
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const { page, pageSize, sortBy, sortOrder, ...filters } = request.query;

      const result = await service.listLabCases(
        { ...filters, clinicId },
        { page, pageSize, sortBy, sortOrder }
      );

      return reply.send({
        success: true,
        ...result,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to list lab cases');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * Update a lab case
   * PATCH /dental-lab/cases/:id
   */
  fastify.patch<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof UpdateLabCaseSchema>;
  }>('/cases/:id', {
    schema: {
      description: 'Update a lab case',
      tags: ['dental-lab'],
      params: IdParamSchema,
      body: UpdateLabCaseSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      const labCase = await service.updateLabCase(
        request.params.id,
        request.body,
        userId
      );

      logger.info({ labCaseId: labCase.id, correlationId }, 'Lab case updated');

      return reply.send({
        success: true,
        data: labCase,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to update lab case');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Cancel a lab case
   * POST /dental-lab/cases/:id/cancel
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: { reason: string };
  }>('/cases/:id/cancel', {
    schema: {
      description: 'Cancel a lab case',
      tags: ['dental-lab'],
      params: IdParamSchema,
      body: z.object({ reason: z.string().min(1).max(500) }),
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      const labCase = await service.cancelLabCase(
        request.params.id,
        request.body.reason,
        userId
      );

      logger.info({ labCaseId: labCase.id, correlationId }, 'Lab case cancelled');

      return reply.send({
        success: true,
        data: labCase,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to cancel lab case');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // STATUS WORKFLOW ENDPOINTS
  // ===========================================================================

  /**
   * Transition lab case status
   * POST /dental-lab/cases/:id/status
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof TransitionStatusSchema>;
  }>('/cases/:id/status', {
    schema: {
      description: 'Transition lab case to a new status',
      tags: ['dental-lab', 'workflow'],
      params: IdParamSchema,
      body: TransitionStatusSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      const result = await service.transitionStatus(
        request.params.id,
        request.body.newStatus as LabCaseStatus,
        userId,
        request.body.reason
      );

      logger.info(
        {
          labCaseId: result.labCase.id,
          newStatus: request.body.newStatus,
          correlationId,
        },
        'Lab case status transitioned'
      );

      return reply.send({
        success: true,
        data: result.labCase,
        historyEntry: result.historyEntry,
        event: result.event,
        nextActions: result.nextActions,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to transition status');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Get status history
   * GET /dental-lab/cases/:id/status-history
   */
  fastify.get<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/status-history', {
    schema: {
      description: 'Get status change history for a lab case',
      tags: ['dental-lab', 'workflow'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const history = await service.getStatusHistory(request.params.id);

      return reply.send({
        success: true,
        data: history,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get status history');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * Get recommended next statuses
   * GET /dental-lab/cases/:id/recommended-statuses
   */
  fastify.get<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/recommended-statuses', {
    schema: {
      description: 'Get recommended next statuses for a lab case',
      tags: ['dental-lab', 'workflow'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const statuses = await service.getRecommendedNextStatuses(request.params.id);

      return reply.send({
        success: true,
        data: statuses,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get recommended statuses');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // DIGITAL SCAN ENDPOINTS
  // ===========================================================================

  /**
   * Initiate scan upload (get presigned URL)
   * POST /dental-lab/cases/:id/scans/initiate-upload
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof InitiateScanUploadSchema>;
  }>('/cases/:id/scans/initiate-upload', {
    schema: {
      description: 'Get presigned URL for scan upload',
      tags: ['dental-lab', 'scans'],
      params: IdParamSchema,
      body: InitiateScanUploadSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      const result = await service.initiateScanUpload(
        request.params.id,
        request.body,
        userId
      );

      return reply.send({
        success: true,
        data: result,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to initiate scan upload');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Get scans for a lab case
   * GET /dental-lab/cases/:id/scans
   */
  fastify.get<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/scans', {
    schema: {
      description: 'Get all scans for a lab case',
      tags: ['dental-lab', 'scans'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const scans = await service.getScans(request.params.id);

      return reply.send({
        success: true,
        data: scans,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get scans');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // CAD DESIGN ENDPOINTS
  // ===========================================================================

  /**
   * Submit design for review
   * POST /dental-lab/cases/:id/designs
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof CreateCADDesignSchema>;
  }>('/cases/:id/designs', {
    schema: {
      description: 'Submit a CAD design for review',
      tags: ['dental-lab', 'designs'],
      params: IdParamSchema,
      body: CreateCADDesignSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      const result = await service.submitDesignForReview(
        request.params.id,
        request.body,
        userId
      );

      logger.info(
        { labCaseId: request.params.id, designId: result.design.id, correlationId },
        'Design submitted for review'
      );

      return reply.status(201).send({
        success: true,
        data: result,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to submit design');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Process design approval
   * POST /dental-lab/designs/:designId/approve
   */
  fastify.post<{
    Params: z.infer<typeof DesignIdParamSchema>;
    Body: Omit<z.infer<typeof ApproveDesignSchema>, 'designId'>;
  }>('/designs/:designId/approve', {
    schema: {
      description: 'Approve or request revision for a design',
      tags: ['dental-lab', 'designs'],
      params: DesignIdParamSchema,
      body: ApproveDesignSchema.omit({ designId: true }),
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const result = await service.processDesignApproval({
        designId: request.params.designId,
        ...request.body,
      });

      logger.info(
        { designId: request.params.designId, status: request.body.approvalStatus, correlationId },
        'Design approval processed'
      );

      return reply.send({
        success: true,
        data: result,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to process design approval');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Get designs awaiting review
   * GET /dental-lab/designs/awaiting-review
   */
  fastify.get('/designs/awaiting-review', {
    schema: {
      description: 'Get all designs awaiting clinician review',
      tags: ['dental-lab', 'designs'],
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const cases = await service.getDesignsAwaitingReview(clinicId);

      return reply.send({
        success: true,
        data: cases,
        count: cases.length,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get designs awaiting review');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // FABRICATION ENDPOINTS
  // ===========================================================================

  /**
   * Start fabrication
   * POST /dental-lab/cases/:id/fabrication
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof CreateFabricationRecordSchema>;
  }>('/cases/:id/fabrication', {
    schema: {
      description: 'Start fabrication process',
      tags: ['dental-lab', 'fabrication'],
      params: IdParamSchema,
      body: CreateFabricationRecordSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const record = await service.startFabrication(request.params.id, request.body);

      logger.info(
        { labCaseId: request.params.id, method: request.body.method, correlationId },
        'Fabrication started'
      );

      return reply.status(201).send({
        success: true,
        data: record,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to start fabrication');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Get fabrication records
   * GET /dental-lab/cases/:id/fabrication
   */
  fastify.get<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/fabrication', {
    schema: {
      description: 'Get fabrication records for a lab case',
      tags: ['dental-lab', 'fabrication'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const records = await service.getFabricationRecords(request.params.id);

      return reply.send({
        success: true,
        data: records,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get fabrication records');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // QC INSPECTION ENDPOINTS
  // ===========================================================================

  /**
   * Perform QC inspection
   * POST /dental-lab/cases/:id/qc-inspections
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof CreateQCInspectionSchema>;
  }>('/cases/:id/qc-inspections', {
    schema: {
      description: 'Record QC inspection results',
      tags: ['dental-lab', 'qc'],
      params: IdParamSchema,
      body: CreateQCInspectionSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const result = await service.performQCInspection(request.params.id, request.body);

      logger.info(
        { labCaseId: request.params.id, passed: result.inspection.passed, correlationId },
        'QC inspection completed'
      );

      return reply.status(201).send({
        success: true,
        data: result,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to perform QC inspection');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Get QC inspections
   * GET /dental-lab/cases/:id/qc-inspections
   */
  fastify.get<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/qc-inspections', {
    schema: {
      description: 'Get QC inspections for a lab case',
      tags: ['dental-lab', 'qc'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const inspections = await service.getQCInspections(request.params.id);

      return reply.send({
        success: true,
        data: inspections,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get QC inspections');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // DELIVERY WORKFLOW ENDPOINTS
  // ===========================================================================

  /**
   * Mark case ready for pickup
   * POST /dental-lab/cases/:id/ready-for-pickup
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/ready-for-pickup', {
    schema: {
      description: 'Mark lab case as ready for pickup',
      tags: ['dental-lab', 'delivery'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      const labCase = await service.markReadyForPickup(request.params.id, userId);

      logger.info({ labCaseId: labCase.id, correlationId }, 'Case marked ready for pickup');

      return reply.send({
        success: true,
        data: labCase,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to mark ready for pickup');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Mark case as delivered
   * POST /dental-lab/cases/:id/delivered
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: { deliveryDate?: string };
  }>('/cases/:id/delivered', {
    schema: {
      description: 'Mark lab case as delivered',
      tags: ['dental-lab', 'delivery'],
      params: IdParamSchema,
      body: z.object({ deliveryDate: z.string().datetime().optional() }),
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const deliveryDate = request.body.deliveryDate
        ? new Date(request.body.deliveryDate)
        : undefined;

      const labCase = await service.markDelivered(request.params.id, deliveryDate);

      logger.info({ labCaseId: labCase.id, correlationId }, 'Case marked as delivered');

      return reply.send({
        success: true,
        data: labCase,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to mark as delivered');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Schedule try-in
   * POST /dental-lab/cases/:id/try-in
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof ScheduleTryInSchema>;
  }>('/cases/:id/try-in', {
    schema: {
      description: 'Schedule try-in appointment',
      tags: ['dental-lab', 'delivery'],
      params: IdParamSchema,
      body: ScheduleTryInSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const record = await service.scheduleTryIn(
        request.params.id,
        request.body.scheduledAt,
        request.body.clinicianId
      );

      logger.info(
        { labCaseId: request.params.id, scheduledAt: request.body.scheduledAt, correlationId },
        'Try-in scheduled'
      );

      return reply.status(201).send({
        success: true,
        data: record,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to schedule try-in');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Complete case
   * POST /dental-lab/cases/:id/complete
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/complete', {
    schema: {
      description: 'Mark lab case as completed',
      tags: ['dental-lab', 'delivery'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      const labCase = await service.completeCase(request.params.id, userId);

      logger.info({ labCaseId: labCase.id, correlationId }, 'Case completed');

      return reply.send({
        success: true,
        data: labCase,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to complete case');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // ASSIGNMENT ENDPOINTS
  // ===========================================================================

  /**
   * Assign technician
   * POST /dental-lab/cases/:id/assign-technician
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof AssignTechnicianSchema>;
  }>('/cases/:id/assign-technician', {
    schema: {
      description: 'Assign technician to lab case',
      tags: ['dental-lab', 'assignments'],
      params: IdParamSchema,
      body: AssignTechnicianSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      await service.assignTechnician(
        request.params.id,
        request.body.technicianId,
        userId
      );

      return reply.send({
        success: true,
        message: 'Technician assigned successfully',
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to assign technician');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Assign designer
   * POST /dental-lab/cases/:id/assign-designer
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: z.infer<typeof AssignDesignerSchema>;
  }>('/cases/:id/assign-designer', {
    schema: {
      description: 'Assign designer to lab case',
      tags: ['dental-lab', 'assignments'],
      params: IdParamSchema,
      body: AssignDesignerSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const userId = getUserId(request);

    try {
      await service.assignDesigner(
        request.params.id,
        request.body.designerId,
        userId
      );

      return reply.send({
        success: true,
        message: 'Designer assigned successfully',
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to assign designer');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Get technician workloads
   * GET /dental-lab/technicians/workloads
   */
  fastify.get('/technicians/workloads', {
    schema: {
      description: 'Get workload for all technicians',
      tags: ['dental-lab', 'assignments'],
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const workloads = await service.getTechnicianWorkloads(clinicId);

      return reply.send({
        success: true,
        data: workloads,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get technician workloads');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // SLA MONITORING ENDPOINTS
  // ===========================================================================

  /**
   * Get SLA tracking for a case
   * GET /dental-lab/cases/:id/sla
   */
  fastify.get<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/sla', {
    schema: {
      description: 'Get SLA tracking for a lab case',
      tags: ['dental-lab', 'sla'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const tracking = await service.getSLATracking(request.params.id);

      return reply.send({
        success: true,
        data: tracking,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get SLA tracking');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * Check SLA breaches
   * GET /dental-lab/sla/breaches
   */
  fastify.get('/sla/breaches', {
    schema: {
      description: 'Get all SLA breaches for the clinic',
      tags: ['dental-lab', 'sla'],
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const breaches = await service.checkSLABreaches(clinicId);

      return reply.send({
        success: true,
        data: breaches,
        count: breaches.length,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to check SLA breaches');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * Get upcoming SLA deadlines
   * GET /dental-lab/sla/upcoming-deadlines
   */
  fastify.get<{
    Querystring: z.infer<typeof HoursAheadSchema>;
  }>('/sla/upcoming-deadlines', {
    schema: {
      description: 'Get upcoming SLA deadlines',
      tags: ['dental-lab', 'sla'],
      querystring: HoursAheadSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const deadlines = await service.getUpcomingSLADeadlines(
        clinicId,
        request.query.hoursAhead
      );

      return reply.send({
        success: true,
        data: deadlines,
        count: deadlines.length,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get upcoming deadlines');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // COLLABORATION ENDPOINTS
  // ===========================================================================

  /**
   * Create collaboration thread
   * POST /dental-lab/cases/:id/threads
   */
  fastify.post<{
    Params: z.infer<typeof IdParamSchema>;
    Body: Omit<z.infer<typeof CreateCollaborationThreadSchema>, 'labCaseId'>;
  }>('/cases/:id/threads', {
    schema: {
      description: 'Create a collaboration thread',
      tags: ['dental-lab', 'collaboration'],
      params: IdParamSchema,
      body: CreateCollaborationThreadSchema.omit({ labCaseId: true }),
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const thread = await service.createCollaborationThread({
        labCaseId: request.params.id,
        ...request.body,
      });

      return reply.status(201).send({
        success: true,
        data: thread,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to create thread');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Add message to thread
   * POST /dental-lab/threads/:threadId/messages
   */
  fastify.post<{
    Params: z.infer<typeof ThreadIdParamSchema>;
    Body: Omit<z.infer<typeof AddMessageToThreadSchema>, 'threadId'>;
  }>('/threads/:threadId/messages', {
    schema: {
      description: 'Add message to collaboration thread',
      tags: ['dental-lab', 'collaboration'],
      params: ThreadIdParamSchema,
      body: AddMessageToThreadSchema.omit({ threadId: true }),
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const message = await service.addMessageToThread({
        threadId: request.params.threadId,
        ...request.body,
      });

      return reply.status(201).send({
        success: true,
        data: message,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to add message');
      return reply.status(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId,
      });
    }
  });

  /**
   * Get threads for case
   * GET /dental-lab/cases/:id/threads
   */
  fastify.get<{
    Params: z.infer<typeof IdParamSchema>;
  }>('/cases/:id/threads', {
    schema: {
      description: 'Get collaboration threads for a lab case',
      tags: ['dental-lab', 'collaboration'],
      params: IdParamSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();

    try {
      const threads = await service.getThreadsForCase(request.params.id);

      return reply.send({
        success: true,
        data: threads,
        count: threads.length,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get threads');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  // ===========================================================================
  // ANALYTICS ENDPOINTS
  // ===========================================================================

  /**
   * Get lab case stats
   * GET /dental-lab/stats
   */
  fastify.get('/stats', {
    schema: {
      description: 'Get lab case statistics',
      tags: ['dental-lab', 'analytics'],
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const stats = await service.getLabCaseStats(clinicId);

      return reply.send({
        success: true,
        data: stats,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get stats');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * Get lab dashboard
   * GET /dental-lab/dashboard
   */
  fastify.get('/dashboard', {
    schema: {
      description: 'Get lab dashboard data',
      tags: ['dental-lab', 'analytics'],
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const dashboard = await service.getLabDashboard(clinicId);

      return reply.send({
        success: true,
        data: dashboard,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get dashboard');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * Get performance metrics
   * GET /dental-lab/performance
   */
  fastify.get<{
    Querystring: z.infer<typeof DateRangeSchema>;
  }>('/performance', {
    schema: {
      description: 'Get lab performance metrics',
      tags: ['dental-lab', 'analytics'],
      querystring: DateRangeSchema,
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const metrics = await service.getPerformanceMetrics(
        clinicId,
        request.query.startDate,
        request.query.endDate
      );

      return reply.send({
        success: true,
        data: metrics,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to get performance metrics');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });

  /**
   * Generate daily report
   * GET /dental-lab/reports/daily
   */
  fastify.get<{
    Querystring: { date?: string };
  }>('/reports/daily', {
    schema: {
      description: 'Generate daily lab report',
      tags: ['dental-lab', 'analytics'],
      querystring: z.object({ date: z.string().datetime().optional() }),
    },
  }, async (request, reply) => {
    const correlationId = generateCorrelationId();
    const service = getService();
    const clinicId = getClinicId(request);

    try {
      const date = request.query.date ? new Date(request.query.date) : new Date();
      const report = await service.generateDailyReport(clinicId, date);

      return reply.send({
        success: true,
        data: report,
        correlationId,
      });
    } catch (error) {
      logger.error({ error, correlationId }, 'Failed to generate daily report');
      return reply.status(500).send({
        success: false,
        error: 'Internal server error',
        correlationId,
      });
    }
  });
};

/**
 * Create dental lab routes with dependency injection
 */
export function createDentalLabRoutes(service: unknown): FastifyPluginAsync {
  return async (fastify) => {
    // Inject service into fastify instance
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (fastify as any).dentalLabService = service;

    // Register routes
    await fastify.register(dentalLabRoutes, { prefix: '/dental-lab' });
  };
}
