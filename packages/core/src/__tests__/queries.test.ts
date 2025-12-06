import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GetLeadByPhoneQuery,
  GetLeadsByClassificationQuery,
  GetLeadStatsQuery,
  SearchLeadsQuery,
  GetPatientQuery,
  SearchPatientsQuery,
  GetPatientHistoryQuery,
  GetAvailableSlotsQuery,
  GetAppointmentsByPatientQuery,
  GetAppointmentQuery,
  GetDoctorScheduleQuery,
  CheckConsentQuery,
  GetConsentAuditLogQuery,
  GetLeadAnalyticsQuery,
  GetConversionFunnelQuery,
  GetDailyMetricsQuery,
  GetWorkflowStatusQuery,
  createGetLeadStatsHandler,
  createGetLeadByPhoneHandler,
  createGetLeadAnalyticsHandler,
  createCheckConsentHandler,
  createGetAvailableSlotsHandler,
  createGetPatientActivityHandler,
  createQueryHandlers,
  type QueryHandlerDeps,
} from '../cqrs/queries.js';

describe('CQRS Queries', () => {
  describe('Query Definitions', () => {
    describe('Lead Queries', () => {
      it('should validate GetLeadByPhoneQuery', () => {
        const result = GetLeadByPhoneQuery.schema.safeParse({ phone: '+40721123456' });
        expect(result.success).toBe(true);
      });

      it('should reject invalid GetLeadByPhoneQuery', () => {
        const result = GetLeadByPhoneQuery.schema.safeParse({});
        expect(result.success).toBe(false);
      });

      it('should validate GetLeadsByClassificationQuery with defaults', () => {
        const result = GetLeadsByClassificationQuery.schema.safeParse({
          classification: 'HOT',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(1);
          expect(result.data.pageSize).toBe(20);
        }
      });

      it('should validate GetLeadStatsQuery', () => {
        const result = GetLeadStatsQuery.schema.safeParse({
          dateRange: { start: '2024-01-01', end: '2024-01-31' },
        });
        expect(result.success).toBe(true);
      });

      it('should validate GetLeadStatsQuery without dateRange', () => {
        const result = GetLeadStatsQuery.schema.safeParse({});
        expect(result.success).toBe(true);
      });

      it('should validate SearchLeadsQuery with all options', () => {
        const result = SearchLeadsQuery.schema.safeParse({
          searchTerm: 'john',
          channel: 'whatsapp',
          classification: 'HOT',
          status: 'qualified',
          assignedTo: 'agent-123',
          page: 2,
          pageSize: 10,
          sortBy: 'score',
          sortOrder: 'desc',
        });
        expect(result.success).toBe(true);
      });

      it('should use defaults for SearchLeadsQuery', () => {
        const result = SearchLeadsQuery.schema.safeParse({});
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.page).toBe(1);
          expect(result.data.pageSize).toBe(20);
          expect(result.data.sortBy).toBe('createdAt');
          expect(result.data.sortOrder).toBe('desc');
        }
      });
    });

    describe('Patient Queries', () => {
      it('should validate GetPatientQuery', () => {
        const result = GetPatientQuery.schema.safeParse({ patientId: 'patient-123' });
        expect(result.success).toBe(true);
      });

      it('should validate GetPatientQuery with phone', () => {
        const result = GetPatientQuery.schema.safeParse({ phone: '+40721123456' });
        expect(result.success).toBe(true);
      });

      it('should validate GetPatientQuery with email', () => {
        const result = GetPatientQuery.schema.safeParse({ email: 'test@example.com' });
        expect(result.success).toBe(true);
      });

      it('should validate SearchPatientsQuery', () => {
        const result = SearchPatientsQuery.schema.safeParse({
          searchTerm: 'john',
          tags: ['vip', 'returning'],
          page: 1,
          pageSize: 10,
        });
        expect(result.success).toBe(true);
      });

      it('should validate GetPatientHistoryQuery', () => {
        const result = GetPatientHistoryQuery.schema.safeParse({
          patientId: 'patient-123',
          eventTypes: ['LeadCreated', 'LeadScored'],
          limit: 100,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('Appointment Queries', () => {
      it('should validate GetAvailableSlotsQuery', () => {
        const result = GetAvailableSlotsQuery.schema.safeParse({
          startDate: '2024-06-01',
          endDate: '2024-06-30',
          doctorId: 'doc-123',
          serviceType: 'consultation',
          duration: 60,
        });
        expect(result.success).toBe(true);
      });

      it('should use default duration for GetAvailableSlotsQuery', () => {
        const result = GetAvailableSlotsQuery.schema.safeParse({
          startDate: '2024-06-01',
          endDate: '2024-06-30',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.duration).toBe(30);
        }
      });

      it('should validate GetAppointmentsByPatientQuery', () => {
        const result = GetAppointmentsByPatientQuery.schema.safeParse({
          patientId: 'patient-123',
          status: 'upcoming',
        });
        expect(result.success).toBe(true);
      });

      it('should validate GetAppointmentQuery', () => {
        const result = GetAppointmentQuery.schema.safeParse({
          appointmentId: 'apt-123',
        });
        expect(result.success).toBe(true);
      });

      it('should validate GetDoctorScheduleQuery', () => {
        const result = GetDoctorScheduleQuery.schema.safeParse({
          doctorId: 'doc-123',
          date: '2024-06-15',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('Consent Queries', () => {
      it('should validate CheckConsentQuery with patientId', () => {
        const result = CheckConsentQuery.schema.safeParse({
          patientId: 'patient-123',
          consentTypes: ['data_processing', 'marketing_whatsapp'],
        });
        expect(result.success).toBe(true);
      });

      it('should validate CheckConsentQuery with phone', () => {
        const result = CheckConsentQuery.schema.safeParse({
          phone: '+40721123456',
        });
        expect(result.success).toBe(true);
      });

      it('should validate GetConsentAuditLogQuery', () => {
        const result = GetConsentAuditLogQuery.schema.safeParse({
          patientId: 'patient-123',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('Analytics Queries', () => {
      it('should validate GetLeadAnalyticsQuery', () => {
        const result = GetLeadAnalyticsQuery.schema.safeParse({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          groupBy: 'channel',
          channel: 'whatsapp',
        });
        expect(result.success).toBe(true);
      });

      it('should validate GetConversionFunnelQuery', () => {
        const result = GetConversionFunnelQuery.schema.safeParse({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          channel: 'voice',
        });
        expect(result.success).toBe(true);
      });

      it('should validate GetDailyMetricsQuery', () => {
        const result = GetDailyMetricsQuery.schema.safeParse({
          date: '2024-06-15',
        });
        expect(result.success).toBe(true);
      });

      it('should validate GetWorkflowStatusQuery', () => {
        const result = GetWorkflowStatusQuery.schema.safeParse({
          taskId: 'task-abc123',
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Query Handlers', () => {
    let mockDeps: QueryHandlerDeps;
    let mockEventStore: QueryHandlerDeps['eventStore'];
    let mockProjectionManager: QueryHandlerDeps['projectionManager'];

    beforeEach(() => {
      mockEventStore = {
        getByAggregateId: vi.fn(),
        append: vi.fn(),
        getAll: vi.fn(),
      } as unknown as QueryHandlerDeps['eventStore'];

      mockProjectionManager = {
        get: vi.fn(),
        register: vi.fn(),
        apply: vi.fn(),
      } as unknown as QueryHandlerDeps['projectionManager'];

      mockDeps = {
        eventStore: mockEventStore,
        projectionManager: mockProjectionManager,
      };
    });

    describe('createGetLeadStatsHandler', () => {
      it('should return lead stats when projection exists', async () => {
        const mockState = {
          totalLeads: 100,
          leadsByClassification: { HOT: 30, WARM: 40, COLD: 20, UNQUALIFIED: 10 },
          leadsByChannel: { whatsapp: 50, voice: 30, web: 20 },
        };

        vi.mocked(mockProjectionManager.get).mockReturnValue({
          name: 'lead-stats',
          state: mockState,
          version: 1,
        });

        const handler = createGetLeadStatsHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadStats',
            params: {},
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual(mockState);
        }
      });

      it('should return error when projection not found', async () => {
        vi.mocked(mockProjectionManager.get).mockReturnValue(undefined);

        const handler = createGetLeadStatsHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadStats',
            params: {},
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('PROJECTION_NOT_FOUND');
        }
      });
    });

    describe('createGetLeadByPhoneHandler', () => {
      it('should rebuild lead state from events', async () => {
        const events = [
          {
            type: 'LeadCreated',
            payload: { name: 'John', channel: 'whatsapp' },
            metadata: { timestamp: new Date().toISOString() },
            version: 1,
          },
          {
            type: 'LeadScored',
            payload: { score: 85, classification: 'HOT' },
            metadata: { timestamp: new Date().toISOString() },
            version: 2,
          },
        ];

        vi.mocked(mockEventStore.getByAggregateId).mockResolvedValue(events);

        const handler = createGetLeadByPhoneHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadByPhone',
            params: { phone: '+40721123456' },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject({
            phone: '+40721123456',
            score: 85,
            classification: 'HOT',
          });
        }
      });

      it('should return error when lead not found', async () => {
        vi.mocked(mockEventStore.getByAggregateId).mockResolvedValue([]);

        const handler = createGetLeadByPhoneHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadByPhone',
            params: { phone: '+40000000000' },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('LEAD_NOT_FOUND');
        }
      });

      it('should handle all lead event types', async () => {
        const events = [
          { type: 'LeadCreated', payload: {}, metadata: { timestamp: new Date().toISOString() } },
          {
            type: 'LeadQualified',
            payload: { classification: 'HOT' },
            metadata: { timestamp: new Date().toISOString() },
          },
          {
            type: 'LeadAssigned',
            payload: { assignedTo: 'agent-1' },
            metadata: { timestamp: new Date().toISOString() },
          },
          {
            type: 'LeadConverted',
            payload: { hubspotContactId: 'hs-123' },
            metadata: { timestamp: new Date().toISOString() },
          },
        ];

        vi.mocked(mockEventStore.getByAggregateId).mockResolvedValue(events);

        const handler = createGetLeadByPhoneHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadByPhone',
            params: { phone: '+40721123456' },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject({
            status: 'converted',
            assignedTo: 'agent-1',
            hubspotContactId: 'hs-123',
          });
        }
      });

      it('should handle LeadLost event', async () => {
        const events = [
          { type: 'LeadCreated', payload: {}, metadata: { timestamp: new Date().toISOString() } },
          {
            type: 'LeadLost',
            payload: { reason: 'No response' },
            metadata: { timestamp: new Date().toISOString() },
          },
        ];

        vi.mocked(mockEventStore.getByAggregateId).mockResolvedValue(events);

        const handler = createGetLeadByPhoneHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadByPhone',
            params: { phone: '+40721123456' },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toMatchObject({
            status: 'lost',
            lostReason: 'No response',
          });
        }
      });
    });

    describe('createGetLeadAnalyticsHandler', () => {
      it('should aggregate analytics data', async () => {
        const leadStatsState = {
          totalLeads: 100,
          leadsByClassification: { HOT: 30, WARM: 40 },
          leadsByChannel: { whatsapp: 50, voice: 30 },
        };

        const dailyMetricsState = {
          metrics: new Map([
            ['2024-01-15', { newLeads: 10, conversions: 5 }],
            ['2024-01-16', { newLeads: 15, conversions: 8 }],
          ]),
        };

        vi.mocked(mockProjectionManager.get).mockImplementation((name) => {
          if (name === 'lead-stats') {
            return { name: 'lead-stats', state: leadStatsState, version: 1 };
          }
          if (name === 'daily-metrics') {
            return { name: 'daily-metrics', state: dailyMetricsState, version: 1 };
          }
          return undefined;
        });

        const handler = createGetLeadAnalyticsHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadAnalytics',
            params: {
              startDate: '2024-01-01',
              endDate: '2024-01-31',
              groupBy: 'channel',
            },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.groupedData).toEqual({ whatsapp: 50, voice: 30 });
        }
      });

      it('should return error when projections not available', async () => {
        vi.mocked(mockProjectionManager.get).mockReturnValue(undefined);

        const handler = createGetLeadAnalyticsHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadAnalytics',
            params: { startDate: '2024-01-01', endDate: '2024-01-31' },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('PROJECTIONS_NOT_AVAILABLE');
        }
      });

      it('should group by classification', async () => {
        const leadStatsState = {
          totalLeads: 100,
          leadsByClassification: { HOT: 30, WARM: 40 },
          leadsByChannel: { whatsapp: 50 },
        };

        vi.mocked(mockProjectionManager.get).mockImplementation((name) => {
          if (name === 'lead-stats') {
            return { name: 'lead-stats', state: leadStatsState, version: 1 };
          }
          if (name === 'daily-metrics') {
            return { name: 'daily-metrics', state: { metrics: new Map() }, version: 1 };
          }
          return undefined;
        });

        const handler = createGetLeadAnalyticsHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetLeadAnalytics',
            params: {
              startDate: '2024-01-01',
              endDate: '2024-01-31',
              groupBy: 'classification',
            },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.groupedData).toEqual({ HOT: 30, WARM: 40 });
        }
      });
    });

    describe('createCheckConsentHandler', () => {
      it('should return consent status', async () => {
        const events = [
          {
            type: 'ConsentRecorded',
            payload: {
              consentType: 'data_processing',
              status: 'granted',
              source: 'form',
              recordedAt: '2024-01-15T10:00:00Z',
            },
          },
          {
            type: 'ConsentRecorded',
            payload: {
              consentType: 'marketing_whatsapp',
              status: 'granted',
              source: 'chatbot',
              recordedAt: '2024-01-15T10:01:00Z',
            },
          },
        ];

        vi.mocked(mockEventStore.getByAggregateId).mockResolvedValue(events);

        const handler = createCheckConsentHandler(mockDeps);
        const result = await handler(
          {
            name: 'CheckConsent',
            params: { patientId: 'patient-123' },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.consents).toHaveLength(2);
        }
      });

      it('should filter by consent types', async () => {
        const events = [
          {
            type: 'ConsentRecorded',
            payload: {
              consentType: 'data_processing',
              status: 'granted',
              source: 'form',
              recordedAt: '2024-01-15T10:00:00Z',
            },
          },
          {
            type: 'ConsentRecorded',
            payload: {
              consentType: 'marketing_email',
              status: 'denied',
              source: 'form',
              recordedAt: '2024-01-15T10:01:00Z',
            },
          },
        ];

        vi.mocked(mockEventStore.getByAggregateId).mockResolvedValue(events);

        const handler = createCheckConsentHandler(mockDeps);
        const result = await handler(
          {
            name: 'CheckConsent',
            params: { patientId: 'patient-123', consentTypes: ['data_processing'] },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.consents).toHaveLength(1);
          expect(result.data.consents[0].type).toBe('data_processing');
        }
      });

      it('should return error when neither patientId nor phone provided', async () => {
        const handler = createCheckConsentHandler(mockDeps);
        const result = await handler(
          {
            name: 'CheckConsent',
            params: {},
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('INVALID_PARAMS');
        }
      });
    });

    describe('createGetAvailableSlotsHandler', () => {
      it('should generate available slots', async () => {
        const handler = createGetAvailableSlotsHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetAvailableSlots',
            params: {
              startDate: '2024-06-17',
              endDate: '2024-06-17',
              doctorId: 'doc-123',
              duration: 30,
            },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          // Should have generated some slots
          expect(Array.isArray(result.data.slots)).toBe(true);
        }
      });
    });

    describe('createGetPatientActivityHandler', () => {
      it('should return patient activity', async () => {
        const mockState = {
          recentActivities: [
            { patientId: 'patient-123', type: 'appointment', timestamp: new Date() },
            { patientId: 'patient-123', type: 'call', timestamp: new Date() },
            { patientId: 'other-patient', type: 'visit', timestamp: new Date() },
          ],
        };

        vi.mocked(mockProjectionManager.get).mockReturnValue({
          name: 'patient-activity',
          state: mockState,
          version: 1,
        });

        const handler = createGetPatientActivityHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetPatientHistory',
            params: { patientId: 'patient-123', limit: 50 },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.recentActivities).toHaveLength(2);
        }
      });

      it('should return error when projection not found', async () => {
        vi.mocked(mockProjectionManager.get).mockReturnValue(undefined);

        const handler = createGetPatientActivityHandler(mockDeps);
        const result = await handler(
          {
            name: 'GetPatientHistory',
            params: { patientId: 'patient-123', limit: 50 },
            metadata: { queryId: 'q-1', timestamp: new Date().toISOString() },
          },
          {}
        );

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe('PROJECTION_NOT_FOUND');
        }
      });
    });
  });

  describe('createQueryHandlers', () => {
    it('should create handler registry', () => {
      const mockDeps = {
        eventStore: {} as QueryHandlerDeps['eventStore'],
        projectionManager: {} as QueryHandlerDeps['projectionManager'],
      };

      const registry = createQueryHandlers(mockDeps);

      expect(registry.handlers.has('GetLeadStats')).toBe(true);
      expect(registry.handlers.has('GetLeadByPhone')).toBe(true);
      expect(registry.handlers.has('GetLeadAnalytics')).toBe(true);
      expect(registry.handlers.has('CheckConsent')).toBe(true);
      expect(registry.handlers.has('GetAvailableSlots')).toBe(true);
      expect(registry.handlers.has('GetPatientHistory')).toBe(true);
    });

    it('should include schemas in registry', () => {
      const mockDeps = {
        eventStore: {} as QueryHandlerDeps['eventStore'],
        projectionManager: {} as QueryHandlerDeps['projectionManager'],
      };

      const registry = createQueryHandlers(mockDeps);

      expect(registry.schemas.has('GetLeadStats')).toBe(true);
      expect(registry.schemas.has('GetLeadByPhone')).toBe(true);
    });
  });
});
