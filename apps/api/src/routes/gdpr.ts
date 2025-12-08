/**
 * GDPR Data Export Routes
 *
 * Implements GDPR Article 20: Right to Data Portability
 * Provides programmatic access to personal data export for authenticated API consumers.
 *
 * SECURITY: All endpoints require API key authentication via X-API-Key header.
 * Authentication is enforced by the apiAuthPlugin configured in app.ts.
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import {
  createDatabaseClient,
  generateCorrelationId,
  maskPhone,
  maskEmail,
  createUnifiedGDPRErasureService,
} from '@medicalcor/core';

/**
 * GDPR Export Response Type
 */
interface GdprExportResponse {
  exportedAt: string;
  dataController: string;
  dataProtectionOfficer: string;
  exportFormat: string;
  requestId: string;
  user?: Record<string, unknown>;
  leadData?: Record<string, unknown>[];
  interactions?: Record<string, unknown>[];
  consentRecords?: Record<string, unknown>[];
  appointments?: Record<string, unknown>[];
  communications?: Record<string, unknown>[];
}

/**
 * GDPR Export Request Schema
 */
interface GdprExportRequest {
  phone?: string;
  email?: string;
  hubspotContactId?: string;
}

/**
 * GDPR Deletion Request Schema
 */
interface GdprDeletionRequest {
  phone?: string;
  email?: string;
  hubspotContactId?: string;
  reason: string;
  confirmDeletion: boolean;
}

/**
 * GDPR Routes
 *
 * Provides GDPR-compliant data export and deletion endpoints.
 */
// eslint-disable-next-line max-lines-per-function
export const gdprRoutes: FastifyPluginAsync = async (fastify): Promise<void> => {
  /**
   * POST /gdpr/export
   *
   * Export all personal data for a given identifier (phone, email, or HubSpot contact ID)
   * GDPR Article 20 compliance - Right to Data Portability
   *
   * SECURITY: Requires API key authentication (X-API-Key header)
   */
  fastify.post<{ Body: GdprExportRequest }>('/gdpr/export', {
    schema: {
      description: 'Export all personal data for GDPR Article 20 compliance',
      tags: ['GDPR'],
      security: [{ ApiKeyAuth: [] }],
      body: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Phone number (E.164 format)' },
          email: { type: 'string', format: 'email', description: 'Email address' },
          hubspotContactId: { type: 'string', description: 'HubSpot contact ID' },
        },
        anyOf: [
          { required: ['phone'] },
          { required: ['email'] },
          { required: ['hubspotContactId'] },
        ],
      },
      response: {
        200: {
          type: 'object',
          description: 'GDPR-compliant data export',
          properties: {
            exportedAt: { type: 'string' },
            dataController: { type: 'string' },
            dataProtectionOfficer: { type: 'string' },
            exportFormat: { type: 'string' },
            requestId: { type: 'string' },
            user: { type: 'object' },
            leadData: { type: 'array' },
            interactions: { type: 'array' },
            consentRecords: { type: 'array' },
            appointments: { type: 'array' },
            communications: { type: 'array' },
          },
        },
        400: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
     
    handler: async (request: FastifyRequest<{ Body: GdprExportRequest }>, reply: FastifyReply) => {
      const correlationId = generateCorrelationId();
      const { phone, email, hubspotContactId } = request.body;

      // Validate at least one identifier is provided
      if (!phone && !email && !hubspotContactId) {
        return reply.status(400).send({
          code: 'MISSING_IDENTIFIER',
          message: 'At least one identifier (phone, email, or hubspotContactId) is required',
        });
      }

      try {
        const db = createDatabaseClient();

        const exportData: GdprExportResponse = {
          exportedAt: new Date().toISOString(),
          dataController: 'MedicalCor SRL',
          dataProtectionOfficer: 'dpo@medicalcor.ro',
          exportFormat: 'GDPR Article 20 compliant JSON',
          requestId: correlationId,
          user: undefined,
          leadData: [],
          interactions: [],
          consentRecords: [],
          appointments: [],
          communications: [],
        };

        // Build query conditions
        const conditions: string[] = [];
        const params: (string | undefined)[] = [];
        let paramIndex = 1;

        if (phone) {
          conditions.push(`phone = $${paramIndex++}`);
          params.push(phone);
        }
        if (email) {
          conditions.push(`email = $${paramIndex++}`);
          params.push(email);
        }
        if (hubspotContactId) {
          conditions.push(`hubspot_contact_id = $${paramIndex++}`);
          params.push(hubspotContactId);
        }

        const whereClause = conditions.join(' OR ');

        // 1. Lead/Patient data
        const leadsResult = await db.query(
          `SELECT id, phone, email, name, source, channel, status,
                  lead_score, lead_status, utm_source, utm_medium, utm_campaign,
                  hubspot_contact_id, language, created_at, updated_at
           FROM leads
           WHERE (${whereClause}) AND deleted_at IS NULL`,
          params.filter(Boolean) as string[]
        );
        exportData.leadData = leadsResult.rows;

        // If no data found, return 404
        if (leadsResult.rows.length === 0) {
          fastify.log.info(
            {
              correlationId,
              phone: phone ? maskPhone(phone) : undefined,
              email: email ? maskEmail(email) : undefined,
            },
            'GDPR export - no data found'
          );
          return await reply.status(404).send({
            code: 'NO_DATA_FOUND',
            message: 'No personal data found for the provided identifier(s)',
          });
        }

        // Get lead IDs for related queries
        const leadIds = leadsResult.rows.map((r) => r.id as string);

        // 2. Interaction history
        if (leadIds.length > 0) {
          const interactionsResult = await db.query(
            `SELECT type, channel, direction, status, content_preview,
                    sentiment, created_at
             FROM interactions
             WHERE lead_id = ANY($1) AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 500`,
            [leadIds]
          );
          exportData.interactions = interactionsResult.rows;
        }

        // 3. Consent records
        if (phone) {
          const consentResult = await db.query(
            `SELECT consent_type, granted, source, ip_address,
                    granted_at, withdrawn_at, created_at
             FROM consent_records
             WHERE phone = $1 AND deleted_at IS NULL
             ORDER BY created_at DESC`,
            [phone]
          );
          exportData.consentRecords = consentResult.rows;
        }

        // 4. Appointments
        if (leadIds.length > 0) {
          const appointmentsResult = await db.query(
            `SELECT id, appointment_type, scheduled_at, status,
                    procedure_type, location, notes, created_at
             FROM appointments
             WHERE lead_id = ANY($1) AND deleted_at IS NULL
             ORDER BY scheduled_at DESC LIMIT 100`,
            [leadIds]
          );
          exportData.appointments = appointmentsResult.rows;
        }

        // 5. Communications (messages sent/received)
        if (leadIds.length > 0) {
          const communicationsResult = await db.query(
            `SELECT channel, direction, template_name, status,
                    sent_at, delivered_at, read_at, created_at
             FROM communications
             WHERE lead_id = ANY($1) AND deleted_at IS NULL
             ORDER BY created_at DESC LIMIT 500`,
            [leadIds]
          );
          exportData.communications = communicationsResult.rows;
        }

        // Log the export request for audit compliance
        await db.query(
          `INSERT INTO sensitive_data_access_log
           (correlation_id, entity_type, entity_id, field_names, access_type, access_reason, accessed_by, ip_address)
           VALUES ($1, 'gdpr_export', $2, ARRAY['all'], 'export', 'GDPR Article 20 data export request', 'api', $3)`,
          [correlationId, leadIds[0] ?? 'unknown', request.ip]
        );

        fastify.log.info(
          {
            correlationId,
            leadCount: leadsResult.rows.length,
            interactionCount: exportData.interactions?.length ?? 0,
            consentCount: exportData.consentRecords?.length ?? 0,
          },
          'GDPR data export completed'
        );

        // Set appropriate headers
        reply.header('X-GDPR-Export', 'true');
        reply.header('X-Export-Date', exportData.exportedAt);
        reply.header('X-Correlation-Id', correlationId);

        return await reply.send(exportData);
      } catch (error) {
        fastify.log.error({ error, correlationId }, 'GDPR export failed');
        return reply.status(500).send({
          code: 'EXPORT_FAILED',
          message: 'Failed to export data. Please contact support.',
        });
      }
    },
  });

  /**
   * POST /gdpr/delete-request
   *
   * Request deletion of personal data (Right to Erasure / Right to be Forgotten)
   * GDPR Article 17 compliance
   *
   * SECURITY: Requires API key authentication (X-API-Key header)
   * NOTE: This initiates a soft-delete process. Hard deletion occurs after retention period.
   */
  fastify.post<{ Body: GdprDeletionRequest }>('/gdpr/delete-request', {
    schema: {
      description: 'Request deletion of personal data (GDPR Article 17)',
      tags: ['GDPR'],
      security: [{ ApiKeyAuth: [] }],
      body: {
        type: 'object',
        required: ['reason', 'confirmDeletion'],
        properties: {
          phone: { type: 'string', description: 'Phone number (E.164 format)' },
          email: { type: 'string', format: 'email', description: 'Email address' },
          hubspotContactId: { type: 'string', description: 'HubSpot contact ID' },
          reason: { type: 'string', description: 'Reason for deletion request' },
          confirmDeletion: {
            type: 'boolean',
            description: 'Must be true to confirm deletion intent',
          },
        },
        anyOf: [
          { required: ['phone'] },
          { required: ['email'] },
          { required: ['hubspotContactId'] },
        ],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            requestId: { type: 'string' },
            message: { type: 'string' },
            deletionType: { type: 'string' },
            recordsAffected: { type: 'number' },
            auditTrailPreserved: { type: 'boolean' },
            retentionPeriodDays: { type: 'number' },
            estimatedPermanentDeletion: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            code: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: async (
      request: FastifyRequest<{ Body: GdprDeletionRequest }>,
      reply: FastifyReply
    ) => {
      const correlationId = generateCorrelationId();
      const { phone, email, hubspotContactId, reason, confirmDeletion } = request.body;

      // Require explicit confirmation
      if (!confirmDeletion) {
        return reply.status(400).send({
          code: 'CONFIRMATION_REQUIRED',
          message: 'confirmDeletion must be true to proceed with deletion request',
        });
      }

      // Validate at least one identifier is provided
      if (!phone && !email && !hubspotContactId) {
        return reply.status(400).send({
          code: 'MISSING_IDENTIFIER',
          message: 'At least one identifier (phone, email, or hubspotContactId) is required',
        });
      }

      try {
        // Use unified GDPR erasure service (H7 fix - comprehensive erasure)
        const db = createDatabaseClient();
        const erasureService = createUnifiedGDPRErasureService(db);

        // Determine identifier type and value (validated above - at least one exists)
        const identifierType: 'phone' | 'email' | 'hubspot_id' = phone
          ? 'phone'
          : email
            ? 'email'
            : 'hubspot_id';
        const identifier: string = phone ?? email ?? hubspotContactId ?? '';

        // Execute unified erasure across all tables with PII
        const result = await erasureService.eraseSubject(
          { identifierType, identifier },
          {
            reason: `GDPR Article 17: ${reason}`,
            requestedBy: 'api',
            correlationId,
            hardDelete: false, // Soft delete with retention period
          }
        );

        fastify.log.info(
          {
            correlationId,
            recordsAffected: result.totalRecordsAffected,
            tableCount: result.tableResults.length,
            phone: phone ? maskPhone(phone) : undefined,
            email: email ? maskEmail(email) : undefined,
          },
          'GDPR deletion request processed via unified erasure service'
        );

        return await reply.send({
          success: result.success,
          requestId: correlationId,
          message: result.success
            ? 'Deletion request processed. Data has been soft-deleted and will be permanently removed after the retention period.'
            : `Deletion partially completed with ${result.errors.length} errors`,
          deletionType: 'SOFT',
          recordsAffected: result.totalRecordsAffected,
          auditTrailPreserved: true,
          retentionPeriodDays: result.retentionPeriodDays,
          estimatedPermanentDeletion: result.estimatedPermanentDeletion?.toISOString(),
          tableDetails: result.tableResults.map((t) => ({
            table: t.tableName,
            records: t.recordsAffected,
            action: t.erasureType,
          })),
        });
      } catch (error) {
        fastify.log.error({ error, correlationId }, 'GDPR deletion request failed');
        return reply.status(500).send({
          code: 'DELETION_FAILED',
          message: 'Failed to process deletion request. Please contact support.',
        });
      }
    },
  });

  /**
   * GET /gdpr/consent-status
   *
   * Get consent status for a given identifier
   * Useful for verifying consent before processing
   */
  fastify.get<{ Querystring: { phone?: string; email?: string } }>('/gdpr/consent-status', {
    schema: {
      description: 'Get consent status for a contact',
      tags: ['GDPR'],
      security: [{ ApiKeyAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Phone number (E.164 format)' },
          email: { type: 'string', format: 'email', description: 'Email address' },
        },
        anyOf: [{ required: ['phone'] }, { required: ['email'] }],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            hasConsent: { type: 'boolean' },
            consents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  granted: { type: 'boolean' },
                  grantedAt: { type: 'string' },
                  withdrawnAt: { type: 'string', nullable: true },
                  source: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    handler: async (
      request: FastifyRequest<{ Querystring: { phone?: string; email?: string } }>,
      reply: FastifyReply
    ) => {
      const { phone, email } = request.query;

      if (!phone && !email) {
        return reply.status(400).send({
          code: 'MISSING_IDENTIFIER',
          message: 'Either phone or email is required',
        });
      }

      try {
        const db = createDatabaseClient();

        let query: string;
        let params: string[];

        if (phone) {
          query = `SELECT consent_type, granted, granted_at, withdrawn_at, source
                   FROM consent_records
                   WHERE phone = $1 AND deleted_at IS NULL
                   ORDER BY created_at DESC`;
          params = [phone];
        } else if (email) {
          query = `SELECT cr.consent_type, cr.granted, cr.granted_at, cr.withdrawn_at, cr.source
                   FROM consent_records cr
                   INNER JOIN leads l ON l.phone = cr.phone
                   WHERE l.email = $1 AND cr.deleted_at IS NULL AND l.deleted_at IS NULL
                   ORDER BY cr.created_at DESC`;
          params = [email];
        } else {
          // This should never happen due to earlier validation, but TypeScript needs it
          return await reply.status(400).send({
            code: 'MISSING_IDENTIFIER',
            message: 'Either phone or email is required',
          });
        }

        const result = await db.query(query, params);

        const consents = result.rows.map((row) => ({
          type: row.consent_type,
          granted: row.granted,
          grantedAt: row.granted_at,
          withdrawnAt: row.withdrawn_at,
          source: row.source,
        }));

        // Check if there's valid consent for data processing
        const hasValidConsent = consents.some(
          (c) => c.granted && !c.withdrawnAt && c.type === 'data_processing'
        );

        return await reply.send({
          hasConsent: hasValidConsent,
          consents,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Failed to get consent status');
        return reply.status(500).send({
          code: 'CONSENT_CHECK_FAILED',
          message: 'Failed to retrieve consent status',
        });
      }
    },
  });
};

export default gdprRoutes;
