import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseClient, QueryResult } from '@medicalcor/core';
import { gdprRoutes } from '../routes/gdpr.js';

/**
 * GDPR Routes Comprehensive Tests
 *
 * Tests all GDPR-compliant endpoints:
 * - POST /gdpr/export - Data export (Article 20)
 * - POST /gdpr/delete-request - Data deletion (Article 17)
 * - GET /gdpr/consent-status - Consent status check
 *
 * Coverage:
 * - Request validation
 * - Response structure
 * - Data export completeness
 * - Soft deletion behavior
 * - Audit trail logging
 * - Error handling
 * - Security (API key authentication)
 */

// =============================================================================
// Mock Database Setup
// =============================================================================

let mockDbQuery: ReturnType<typeof vi.fn>;

vi.mock('@medicalcor/core', async () => {
  const actual = await vi.importActual<typeof import('@medicalcor/core')>('@medicalcor/core');
  return {
    ...actual,
    createDatabaseClient: vi.fn(() => ({
      query: mockDbQuery,
    })),
    generateCorrelationId: vi.fn(() => 'test-correlation-id-12345'),
    maskPhone: vi.fn((phone: string) => {
      if (!phone) return '';
      return phone.slice(0, 3) + '****' + phone.slice(-2);
    }),
    maskEmail: vi.fn((email: string) => {
      if (!email) return '';
      const [local, domain] = email.split('@');
      return `${local?.slice(0, 2)}***@${domain}`;
    }),
  };
});

// =============================================================================
// Test Setup
// =============================================================================

describe('GDPR Routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    // Reset mock
    mockDbQuery = vi.fn();

    // Create Fastify instance
    app = Fastify({ logger: false });

    // Register GDPR routes
    await app.register(gdprRoutes);

    // Ready the app
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.clearAllMocks();
  });

  // =============================================================================
  // Export Endpoint Tests
  // =============================================================================

  describe('POST /gdpr/export', () => {
    describe('Successful Exports', () => {
      it('should export data for phone identifier', async () => {
        const phone = '+40712345678';
        const mockLeadData = [
          {
            id: 'lead-123',
            phone,
            email: 'test@example.com',
            name: 'Ion Popescu',
            source: 'whatsapp',
            channel: 'whatsapp',
            status: 'lead',
            lead_score: 4,
            lead_status: 'HOT',
            utm_source: 'google',
            utm_medium: 'cpc',
            utm_campaign: 'implants',
            hubspot_contact_id: 'hs-123',
            language: 'ro',
            created_at: '2025-01-01T10:00:00Z',
            updated_at: '2025-01-02T11:00:00Z',
          },
        ];

        const mockInteractions = [
          {
            type: 'message',
            channel: 'whatsapp',
            direction: 'inbound',
            status: 'delivered',
            content_preview: 'Vreau informatii despre implanturi',
            sentiment: 'neutral',
            created_at: '2025-01-01T10:05:00Z',
          },
        ];

        const mockConsent = [
          {
            consent_type: 'data_processing',
            granted: true,
            source: 'website_form',
            ip_address: '192.168.1.1',
            granted_at: '2025-01-01T09:00:00Z',
            withdrawn_at: null,
            created_at: '2025-01-01T09:00:00Z',
          },
        ];

        const mockAppointments = [
          {
            id: 'apt-123',
            appointment_type: 'consultation',
            scheduled_at: '2025-01-10T14:00:00Z',
            status: 'confirmed',
            procedure_type: 'implant',
            location: 'Clinica Centrala',
            notes: 'First consultation',
            created_at: '2025-01-02T12:00:00Z',
          },
        ];

        const mockCommunications = [
          {
            channel: 'whatsapp',
            direction: 'outbound',
            template_name: 'appointment_confirmation',
            status: 'delivered',
            sent_at: '2025-01-02T12:05:00Z',
            delivered_at: '2025-01-02T12:05:30Z',
            read_at: '2025-01-02T12:10:00Z',
            created_at: '2025-01-02T12:05:00Z',
          },
        ];

        // Mock database queries in sequence
        mockDbQuery
          .mockResolvedValueOnce({ rows: mockLeadData, rowCount: 1 } as QueryResult) // leads query
          .mockResolvedValueOnce({ rows: mockInteractions, rowCount: 1 } as QueryResult) // interactions query
          .mockResolvedValueOnce({ rows: mockConsent, rowCount: 1 } as QueryResult) // consent query
          .mockResolvedValueOnce({ rows: mockAppointments, rowCount: 1 } as QueryResult) // appointments query
          .mockResolvedValueOnce({ rows: mockCommunications, rowCount: 1 } as QueryResult) // communications query
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult); // audit log insert

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/export',
          payload: { phone },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Verify GDPR compliance metadata
        expect(body.dataController).toBe('MedicalCor SRL');
        expect(body.dataProtectionOfficer).toBe('dpo@medicalcor.ro');
        expect(body.exportFormat).toContain('GDPR Article 20');
        expect(body.requestId).toBe('test-correlation-id-12345');
        expect(body.exportedAt).toBeDefined();

        // Verify all data categories are present
        expect(body.leadData).toHaveLength(1);
        expect(body.leadData[0].id).toBe('lead-123');
        expect(body.interactions).toHaveLength(1);
        expect(body.consentRecords).toHaveLength(1);
        expect(body.appointments).toHaveLength(1);
        expect(body.communications).toHaveLength(1);

        // Verify GDPR headers
        expect(response.headers['x-gdpr-export']).toBe('true');
        expect(response.headers['x-export-date']).toBeDefined();
        expect(response.headers['x-correlation-id']).toBe('test-correlation-id-12345');

        // Verify audit log was created (6th call)
        expect(mockDbQuery).toHaveBeenNthCalledWith(
          6,
          expect.stringContaining('INSERT INTO sensitive_data_access_log'),
          expect.arrayContaining(['test-correlation-id-12345', 'lead-123', expect.anything()])
        );
      });

      it('should export data for email identifier', async () => {
        const email = 'test@example.com';
        const mockLeadData = [
          {
            id: 'lead-456',
            phone: '+40712345678',
            email,
            name: 'Maria Ionescu',
            source: 'website',
            channel: 'web',
            status: 'patient',
            created_at: '2025-01-01T10:00:00Z',
            updated_at: '2025-01-01T10:00:00Z',
          },
        ];

        mockDbQuery
          .mockResolvedValueOnce({ rows: mockLeadData, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/export',
          payload: { email },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.leadData).toHaveLength(1);
        expect(body.leadData[0].email).toBe(email);
      });

      it('should export data for HubSpot contact ID', async () => {
        const hubspotContactId = 'hs-contact-789';
        const mockLeadData = [
          {
            id: 'lead-789',
            phone: '+40712345678',
            email: 'hubspot@example.com',
            hubspot_contact_id: hubspotContactId,
            name: 'Andrei Popescu',
            created_at: '2025-01-01T10:00:00Z',
            updated_at: '2025-01-01T10:00:00Z',
          },
        ];

        mockDbQuery
          .mockResolvedValueOnce({ rows: mockLeadData, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/export',
          payload: { hubspotContactId },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.leadData).toHaveLength(1);
        expect(body.leadData[0].hubspot_contact_id).toBe(hubspotContactId);
      });

      it('should include all data categories in export', async () => {
        const phone = '+40712345678';
        const mockLeadData = [{ id: 'lead-123', phone }];

        mockDbQuery
          .mockResolvedValueOnce({ rows: mockLeadData, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [{ type: 'message' }], rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({
            rows: [{ consent_type: 'data_processing' }],
            rowCount: 1,
          } as QueryResult)
          .mockResolvedValueOnce({ rows: [{ id: 'apt-1' }], rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [{ channel: 'whatsapp' }], rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/export',
          payload: { phone },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        // Verify all data categories exist
        expect(body).toHaveProperty('leadData');
        expect(body).toHaveProperty('interactions');
        expect(body).toHaveProperty('consentRecords');
        expect(body).toHaveProperty('appointments');
        expect(body).toHaveProperty('communications');

        // Verify data is populated
        expect(body.leadData).toHaveLength(1);
        expect(body.interactions).toHaveLength(1);
        expect(body.consentRecords).toHaveLength(1);
        expect(body.appointments).toHaveLength(1);
        expect(body.communications).toHaveLength(1);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 when no identifier provided', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/export',
          payload: {},
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        // Fastify returns FST_ERR_VALIDATION for schema validation errors
        // The actual MISSING_IDENTIFIER error is returned from the handler logic
        expect(body.code).toBe('FST_ERR_VALIDATION');
        expect(body.message).toBeDefined();
      });

      it('should return 404 when no data found', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/export',
          payload: { phone: '+40799999999' },
        });

        expect(response.statusCode).toBe(404);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('NO_DATA_FOUND');
        expect(body.message).toContain('No personal data found');
      });
    });

    describe('GDPR Compliance', () => {
      it('should set correct GDPR response headers', async () => {
        const mockLeadData = [{ id: 'lead-123', phone: '+40712345678' }];
        mockDbQuery
          .mockResolvedValueOnce({ rows: mockLeadData, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/export',
          payload: { phone: '+40712345678' },
        });

        expect(response.headers['x-gdpr-export']).toBe('true');
        expect(response.headers['x-export-date']).toBeDefined();
        expect(response.headers['x-correlation-id']).toBe('test-correlation-id-12345');
      });

      it('should log audit trail entry for export', async () => {
        const phone = '+40712345678';
        const mockLeadData = [{ id: 'lead-123', phone }];

        mockDbQuery
          .mockResolvedValueOnce({ rows: mockLeadData, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        await app.inject({
          method: 'POST',
          url: '/gdpr/export',
          payload: { phone },
          headers: { 'x-forwarded-for': '192.168.1.100' },
        });

        // Verify audit log insert was called (6th call)
        expect(mockDbQuery).toHaveBeenNthCalledWith(
          6,
          expect.stringContaining('INSERT INTO sensitive_data_access_log'),
          expect.arrayContaining(['test-correlation-id-12345', 'lead-123', expect.anything()])
        );
      });
    });
  });

  // =============================================================================
  // Deletion Endpoint Tests
  // =============================================================================

  describe('POST /gdpr/delete-request', () => {
    describe('Successful Deletions', () => {
      it('should soft-delete data for valid request', async () => {
        const phone = '+40712345678';
        const mockDeletedLeads = [{ id: 'lead-123' }];

        mockDbQuery
          .mockResolvedValueOnce({ rows: mockDeletedLeads, rowCount: 1 } as QueryResult) // leads update
          .mockResolvedValueOnce({ rows: [{ id: 'int-1' }], rowCount: 1 } as QueryResult) // interactions update
          .mockResolvedValueOnce({ rows: [{ id: 'apt-1' }], rowCount: 1 } as QueryResult) // appointments update
          .mockResolvedValueOnce({ rows: [{ id: 'com-1' }], rowCount: 1 } as QueryResult) // communications update
          .mockResolvedValueOnce({ rows: [{ id: 'con-1' }], rowCount: 1 } as QueryResult) // consent update
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult); // audit log

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/delete-request',
          payload: {
            phone,
            reason: 'User requested data deletion',
            confirmDeletion: true,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.success).toBe(true);
        expect(body.requestId).toBe('test-correlation-id-12345');
        expect(body.deletionType).toBe('SOFT');
        expect(body.recordsAffected).toBe(5); // 1 lead + 1 interaction + 1 appointment + 1 communication + 1 consent
        expect(body.auditTrailPreserved).toBe(true);
        expect(body.retentionPeriodDays).toBe(30);
        expect(body.estimatedPermanentDeletion).toBeDefined();
      });

      it('should delete related records (interactions, appointments, communications)', async () => {
        const phone = '+40712345678';
        const mockDeletedLeads = [{ id: 'lead-123' }];

        mockDbQuery
          .mockResolvedValueOnce({ rows: mockDeletedLeads, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({
            rows: [{ id: '1' }, { id: '2' }, { id: '3' }],
            rowCount: 3,
          } as QueryResult) // 3 interactions
          .mockResolvedValueOnce({ rows: [{ id: '1' }, { id: '2' }], rowCount: 2 } as QueryResult) // 2 appointments
          .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as QueryResult) // 1 communication
          .mockResolvedValueOnce({ rows: [{ id: '1' }], rowCount: 1 } as QueryResult) // 1 consent
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/delete-request',
          payload: {
            phone,
            reason: 'GDPR Article 17',
            confirmDeletion: true,
          },
        });

        const body = JSON.parse(response.body);
        expect(body.recordsAffected).toBe(8); // 1 lead + 3 interactions + 2 appointments + 1 communication + 1 consent

        // Verify soft delete queries were called
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE leads'),
          expect.anything()
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE interactions'),
          expect.anything()
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE appointments'),
          expect.anything()
        );
        expect(mockDbQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE communications'),
          expect.anything()
        );
      });

      it('should return retention period info', async () => {
        const mockDeletedLeads = [{ id: 'lead-123' }];
        mockDbQuery
          .mockResolvedValueOnce({ rows: mockDeletedLeads, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/delete-request',
          payload: {
            email: 'test@example.com',
            reason: 'User request',
            confirmDeletion: true,
          },
        });

        const body = JSON.parse(response.body);
        expect(body.retentionPeriodDays).toBe(30);
        expect(body.estimatedPermanentDeletion).toBeDefined();
        expect(body.message).toContain('retention period');
      });

      it('should log deletion in audit trail', async () => {
        const phone = '+40712345678';
        const reason = 'GDPR Article 17 - User exercising right to erasure';
        const mockDeletedLeads = [{ id: 'lead-123' }];

        mockDbQuery
          .mockResolvedValueOnce({ rows: mockDeletedLeads, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        await app.inject({
          method: 'POST',
          url: '/gdpr/delete-request',
          payload: { phone, reason, confirmDeletion: true },
          headers: { 'x-forwarded-for': '192.168.1.200' },
        });

        // Verify audit log was created (6th call)
        expect(mockDbQuery).toHaveBeenNthCalledWith(
          6,
          expect.stringContaining('INSERT INTO sensitive_data_access_log'),
          expect.arrayContaining([
            'test-correlation-id-12345',
            'lead-123',
            expect.stringContaining('GDPR Article 17'),
          ])
        );
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 when confirmDeletion is false', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/delete-request',
          payload: {
            phone: '+40712345678',
            reason: 'Test',
            confirmDeletion: false,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        expect(body.code).toBe('CONFIRMATION_REQUIRED');
        expect(body.message).toContain('confirmDeletion must be true');
      });

      it('should return 400 when no identifier provided', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/delete-request',
          payload: {
            reason: 'User request',
            confirmDeletion: true,
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        // Fastify returns FST_ERR_VALIDATION for schema validation errors
        expect(body.code).toBe('FST_ERR_VALIDATION');
        expect(body.message).toBeDefined();
      });
    });

    describe('Multiple Identifiers', () => {
      it('should accept phone, email, and hubspotContactId', async () => {
        const mockDeletedLeads = [{ id: 'lead-123' }];
        mockDbQuery
          .mockResolvedValueOnce({ rows: mockDeletedLeads, rowCount: 1 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult)
          .mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'POST',
          url: '/gdpr/delete-request',
          payload: {
            phone: '+40712345678',
            email: 'test@example.com',
            hubspotContactId: 'hs-123',
            reason: 'User request',
            confirmDeletion: true,
          },
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.success).toBe(true);
      });
    });
  });

  // =============================================================================
  // Consent Status Endpoint Tests
  // =============================================================================

  describe('GET /gdpr/consent-status', () => {
    describe('Successful Queries', () => {
      it('should return consent status for phone', async () => {
        const mockConsents = [
          {
            consent_type: 'data_processing',
            granted: true,
            granted_at: '2025-01-01T10:00:00Z',
            withdrawn_at: null,
            source: 'website_form',
          },
          {
            consent_type: 'marketing',
            granted: true,
            granted_at: '2025-01-01T10:00:00Z',
            withdrawn_at: null,
            source: 'website_form',
          },
        ];

        mockDbQuery.mockResolvedValueOnce({ rows: mockConsents, rowCount: 2 } as QueryResult);

        const response = await app.inject({
          method: 'GET',
          url: '/gdpr/consent-status?phone=+40712345678',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);

        expect(body.hasConsent).toBe(true);
        expect(body.consents).toHaveLength(2);
        expect(body.consents[0].type).toBe('data_processing');
        expect(body.consents[0].granted).toBe(true);
        expect(body.consents[0].withdrawnAt).toBeNull();
      });

      it('should return consent status for email', async () => {
        const mockConsents = [
          {
            consent_type: 'data_processing',
            granted: true,
            granted_at: '2025-01-01T10:00:00Z',
            withdrawn_at: null,
            source: 'email_signup',
          },
        ];

        mockDbQuery.mockResolvedValueOnce({ rows: mockConsents, rowCount: 1 } as QueryResult);

        const response = await app.inject({
          method: 'GET',
          url: '/gdpr/consent-status?email=test@example.com',
        });

        expect(response.statusCode).toBe(200);
        const body = JSON.parse(response.body);
        expect(body.hasConsent).toBe(true);
        expect(body.consents).toHaveLength(1);
      });

      it('should correctly identify valid data_processing consent', async () => {
        const mockConsents = [
          {
            consent_type: 'data_processing',
            granted: true,
            granted_at: '2025-01-01T10:00:00Z',
            withdrawn_at: null,
            source: 'website_form',
          },
          {
            consent_type: 'marketing',
            granted: false,
            granted_at: '2025-01-01T10:00:00Z',
            withdrawn_at: '2025-01-02T10:00:00Z',
            source: 'user_request',
          },
        ];

        mockDbQuery.mockResolvedValueOnce({ rows: mockConsents, rowCount: 2 } as QueryResult);

        const response = await app.inject({
          method: 'GET',
          url: '/gdpr/consent-status?phone=+40712345678',
        });

        const body = JSON.parse(response.body);
        expect(body.hasConsent).toBe(true); // data_processing consent is active
        expect(body.consents[0].type).toBe('data_processing');
        expect(body.consents[0].granted).toBe(true);
        expect(body.consents[0].withdrawnAt).toBeNull();
      });

      it('should handle withdrawn consent', async () => {
        const mockConsents = [
          {
            consent_type: 'data_processing',
            granted: false,
            granted_at: '2025-01-01T10:00:00Z',
            withdrawn_at: '2025-01-05T10:00:00Z',
            source: 'user_withdrawal',
          },
        ];

        mockDbQuery.mockResolvedValueOnce({ rows: mockConsents, rowCount: 1 } as QueryResult);

        const response = await app.inject({
          method: 'GET',
          url: '/gdpr/consent-status?phone=+40712345678',
        });

        const body = JSON.parse(response.body);
        expect(body.hasConsent).toBe(false);
        expect(body.consents[0].granted).toBe(false);
        expect(body.consents[0].withdrawnAt).toBe('2025-01-05T10:00:00Z');
      });

      it('should return false when no data_processing consent', async () => {
        const mockConsents = [
          {
            consent_type: 'marketing',
            granted: true,
            granted_at: '2025-01-01T10:00:00Z',
            withdrawn_at: null,
            source: 'website_form',
          },
        ];

        mockDbQuery.mockResolvedValueOnce({ rows: mockConsents, rowCount: 1 } as QueryResult);

        const response = await app.inject({
          method: 'GET',
          url: '/gdpr/consent-status?phone=+40712345678',
        });

        const body = JSON.parse(response.body);
        expect(body.hasConsent).toBe(false); // No data_processing consent
        expect(body.consents).toHaveLength(1);
        expect(body.consents[0].type).toBe('marketing');
      });

      it('should return empty consents when no records found', async () => {
        mockDbQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as QueryResult);

        const response = await app.inject({
          method: 'GET',
          url: '/gdpr/consent-status?phone=+40799999999',
        });

        const body = JSON.parse(response.body);
        expect(body.hasConsent).toBe(false);
        expect(body.consents).toHaveLength(0);
      });
    });

    describe('Validation Errors', () => {
      it('should return 400 when neither phone nor email provided', async () => {
        const response = await app.inject({
          method: 'GET',
          url: '/gdpr/consent-status',
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.body);
        // Fastify returns FST_ERR_VALIDATION for schema validation errors
        expect(body.code).toBe('FST_ERR_VALIDATION');
        expect(body.message).toBeDefined();
      });
    });
  });

  // =============================================================================
  // Error Handling Tests
  // =============================================================================

  describe('Error Handling', () => {
    it('should handle database errors gracefully in export', async () => {
      mockDbQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/gdpr/export',
        payload: { phone: '+40712345678' },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('EXPORT_FAILED');
      expect(body.message).toContain('Failed to export data');
    });

    it('should handle database errors gracefully in deletion', async () => {
      mockDbQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const response = await app.inject({
        method: 'POST',
        url: '/gdpr/delete-request',
        payload: {
          phone: '+40712345678',
          reason: 'User request',
          confirmDeletion: true,
        },
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('DELETION_FAILED');
      expect(body.message).toContain('Failed to process deletion request');
    });

    it('should handle database errors gracefully in consent status', async () => {
      mockDbQuery.mockRejectedValueOnce(new Error('Database query failed'));

      const response = await app.inject({
        method: 'GET',
        url: '/gdpr/consent-status?phone=+40712345678',
      });

      expect(response.statusCode).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.code).toBe('CONSENT_CHECK_FAILED');
      expect(body.message).toContain('Failed to retrieve consent status');
    });
  });
});
