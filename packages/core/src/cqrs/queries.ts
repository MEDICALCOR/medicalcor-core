/**
 * CQRS Queries - Read Model Query Definitions and Handlers
 *
 * Complete set of queries for reading data from projections:
 * - Lead queries (by phone, by classification, analytics)
 * - Patient queries (lookup, search)
 * - Appointment queries (availability, by patient)
 * - Consent queries (check status)
 * - Analytics queries (metrics, reports)
 */

import { z } from 'zod';
import { defineQuery, type QueryHandler } from './query-bus.js';
import type {
  ProjectionManager,
  LeadStatsState,
  PatientActivityState,
  DailyMetricsState,
} from './projections.js';
import type { EventStore } from '../event-store.js';

// ============================================================================
// LEAD QUERIES
// ============================================================================

export const GetLeadByPhoneQuery = defineQuery(
  'GetLeadByPhone',
  z.object({
    phone: z.string(),
  })
);

export const GetLeadsByClassificationQuery = defineQuery(
  'GetLeadsByClassification',
  z.object({
    classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(20),
  })
);

export const GetLeadStatsQuery = defineQuery(
  'GetLeadStats',
  z.object({
    dateRange: z
      .object({
        start: z.string(),
        end: z.string(),
      })
      .optional(),
  })
);

export const SearchLeadsQuery = defineQuery(
  'SearchLeads',
  z.object({
    searchTerm: z.string().optional(),
    channel: z.enum(['whatsapp', 'voice', 'web', 'referral']).optional(),
    classification: z.enum(['HOT', 'WARM', 'COLD', 'UNQUALIFIED']).optional(),
    status: z.enum(['new', 'contacted', 'qualified', 'converted', 'lost']).optional(),
    assignedTo: z.string().optional(),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(20),
    sortBy: z.enum(['createdAt', 'score', 'lastActivity']).optional().default('createdAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  })
);

// ============================================================================
// PATIENT QUERIES
// ============================================================================

export const GetPatientQuery = defineQuery(
  'GetPatient',
  z.object({
    patientId: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().optional(),
  })
);

export const SearchPatientsQuery = defineQuery(
  'SearchPatients',
  z.object({
    searchTerm: z.string().optional(),
    tags: z.array(z.string()).optional(),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(20),
  })
);

export const GetPatientHistoryQuery = defineQuery(
  'GetPatientHistory',
  z.object({
    patientId: z.string(),
    eventTypes: z.array(z.string()).optional(),
    limit: z.number().optional().default(50),
  })
);

// ============================================================================
// APPOINTMENT QUERIES
// ============================================================================

export const GetAvailableSlotsQuery = defineQuery(
  'GetAvailableSlots',
  z.object({
    startDate: z.string(),
    endDate: z.string(),
    doctorId: z.string().optional(),
    serviceType: z.string().optional(),
    duration: z.number().optional().default(30),
  })
);

export const GetAppointmentsByPatientQuery = defineQuery(
  'GetAppointmentsByPatient',
  z.object({
    patientId: z.string(),
    status: z.enum(['upcoming', 'past', 'all']).optional().default('all'),
    page: z.number().optional().default(1),
    pageSize: z.number().optional().default(20),
  })
);

export const GetAppointmentQuery = defineQuery(
  'GetAppointment',
  z.object({
    appointmentId: z.string(),
  })
);

export const GetDoctorScheduleQuery = defineQuery(
  'GetDoctorSchedule',
  z.object({
    doctorId: z.string(),
    date: z.string(),
  })
);

// ============================================================================
// CONSENT QUERIES
// ============================================================================

export const CheckConsentQuery = defineQuery(
  'CheckConsent',
  z.object({
    patientId: z.string().optional(),
    phone: z.string().optional(),
    consentTypes: z
      .array(
        z.enum([
          'data_processing',
          'marketing_whatsapp',
          'marketing_email',
          'marketing_sms',
          'appointment_reminders',
          'treatment_updates',
          'third_party_sharing',
        ])
      )
      .optional(),
  })
);

export const GetConsentAuditLogQuery = defineQuery(
  'GetConsentAuditLog',
  z.object({
    patientId: z.string(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  })
);

// ============================================================================
// ANALYTICS QUERIES
// ============================================================================

export const GetLeadAnalyticsQuery = defineQuery(
  'GetLeadAnalytics',
  z.object({
    startDate: z.string(),
    endDate: z.string(),
    groupBy: z
      .enum(['day', 'week', 'month', 'channel', 'classification'])
      .optional()
      .default('day'),
    channel: z.enum(['whatsapp', 'voice', 'web', 'referral']).optional(),
  })
);

export const GetConversionFunnelQuery = defineQuery(
  'GetConversionFunnel',
  z.object({
    startDate: z.string(),
    endDate: z.string(),
    channel: z.enum(['whatsapp', 'voice', 'web', 'referral']).optional(),
  })
);

export const GetDailyMetricsQuery = defineQuery(
  'GetDailyMetrics',
  z.object({
    date: z.string(),
  })
);

export const GetWorkflowStatusQuery = defineQuery(
  'GetWorkflowStatus',
  z.object({
    taskId: z.string(),
  })
);

// ============================================================================
// QUERY HANDLER CONTEXT
// ============================================================================

export interface QueryHandlerDeps {
  eventStore: EventStore;
  projectionManager: ProjectionManager;
}

// ============================================================================
// QUERY HANDLERS
// ============================================================================

/**
 * Get Lead Stats query handler
 */
export function createGetLeadStatsHandler(
  deps: QueryHandlerDeps
): QueryHandler<z.infer<typeof GetLeadStatsQuery.schema>, LeadStatsState> {
  return (query, _context) => {
    const projection = deps.projectionManager.get<LeadStatsState>('lead-stats');

    if (!projection) {
      return Promise.resolve({
        success: false,
        queryId: query.metadata.queryId,
        error: {
          code: 'PROJECTION_NOT_FOUND',
          message: 'Lead stats projection not available',
        },
        cached: false,
        executionTimeMs: 0,
      });
    }

    return Promise.resolve({
      success: true,
      queryId: query.metadata.queryId,
      data: projection.state,
      cached: false,
      executionTimeMs: 0,
    });
  };
}

/**
 * Get Lead by Phone query handler
 */
export function createGetLeadByPhoneHandler(
  deps: QueryHandlerDeps
): QueryHandler<z.infer<typeof GetLeadByPhoneQuery.schema>, unknown> {
  return async (query, _context) => {
    const { phone } = query.params;

    // Get events for this lead
    const events = await deps.eventStore.getByAggregateId(phone);

    if (events.length === 0) {
      return {
        success: false,
        queryId: query.metadata.queryId,
        error: {
          code: 'LEAD_NOT_FOUND',
          message: `No lead found with phone ${phone}`,
        },
        cached: false,
        executionTimeMs: 0,
      };
    }

    // Rebuild state from events
    const leadState: Record<string, unknown> = {
      phone,
      version: 0,
      status: 'new',
    };

    for (const event of events) {
      const payload = event.payload;
      switch (event.type) {
        case 'LeadCreated':
          Object.assign(leadState, payload, {
            createdAt: event.metadata.timestamp,
          });
          break;
        case 'LeadScored':
          Object.assign(leadState, {
            score: payload.score,
            classification: payload.classification,
            scoredAt: event.metadata.timestamp,
          });
          break;
        case 'LeadQualified':
          Object.assign(leadState, {
            classification: payload.classification,
            status: 'qualified',
            qualifiedAt: event.metadata.timestamp,
          });
          break;
        case 'LeadAssigned':
          Object.assign(leadState, {
            assignedTo: payload.assignedTo,
            status: 'contacted',
            assignedAt: event.metadata.timestamp,
          });
          break;
        case 'LeadConverted':
          Object.assign(leadState, {
            status: 'converted',
            hubspotContactId: payload.hubspotContactId,
            convertedAt: event.metadata.timestamp,
          });
          break;
        case 'LeadLost':
          Object.assign(leadState, {
            status: 'lost',
            lostReason: payload.reason,
            lostAt: event.metadata.timestamp,
          });
          break;
      }
      leadState.version = event.version ?? (leadState.version as number) + 1;
      leadState.updatedAt = event.metadata.timestamp;
    }

    return {
      success: true,
      queryId: query.metadata.queryId,
      data: leadState,
      cached: false,
      executionTimeMs: 0,
    };
  };
}

/**
 * Get Lead Analytics query handler
 */
export function createGetLeadAnalyticsHandler(deps: QueryHandlerDeps): QueryHandler<
  z.infer<typeof GetLeadAnalyticsQuery.schema>,
  {
    summary: LeadStatsState;
    dailyMetrics: { date: string; [key: string]: unknown }[];
    groupedData: Record<string, number>;
  }
> {
  return (query, _context) => {
    const { startDate, endDate, groupBy, channel: _channel } = query.params;

    // Get lead stats projection
    const leadStats = deps.projectionManager.get<LeadStatsState>('lead-stats');
    const dailyMetrics = deps.projectionManager.get<DailyMetricsState>('daily-metrics');

    if (!leadStats || !dailyMetrics) {
      return Promise.resolve({
        success: false,
        queryId: query.metadata.queryId,
        error: {
          code: 'PROJECTIONS_NOT_AVAILABLE',
          message: 'Analytics projections not available',
        },
        cached: false,
        executionTimeMs: 0,
      });
    }

    // Filter daily metrics by date range
    const filteredMetrics: { date: string; [key: string]: unknown }[] = [];
    for (const [dateKey, metrics] of dailyMetrics.state.metrics) {
      if (dateKey >= startDate && dateKey <= endDate) {
        filteredMetrics.push({ ...metrics, date: dateKey });
      }
    }

    // Group data based on groupBy parameter
    let groupedData: Record<string, number> = {};
    switch (groupBy) {
      case 'channel':
        groupedData = leadStats.state.leadsByChannel;
        break;
      case 'classification':
        groupedData = leadStats.state.leadsByClassification;
        break;
      case 'day':
      case 'week':
      case 'month':
      default:
        // Already have daily metrics
        for (const metric of filteredMetrics) {
          groupedData[metric.date] =
            ((metric as Record<string, unknown>).newLeads as number | undefined) ?? 0;
        }
    }

    return Promise.resolve({
      success: true,
      queryId: query.metadata.queryId,
      data: {
        summary: leadStats.state,
        dailyMetrics: filteredMetrics,
        groupedData,
      },
      cached: false,
      executionTimeMs: 0,
    });
  };
}

/**
 * Check Consent query handler
 */
export function createCheckConsentHandler(deps: QueryHandlerDeps): QueryHandler<
  z.infer<typeof CheckConsentQuery.schema>,
  {
    consents: {
      type: string;
      status: string;
      recordedAt: string;
      source: string;
    }[];
  }
> {
  return async (query, _context) => {
    const { patientId, phone, consentTypes } = query.params;

    // Find consent events for this patient
    const aggregateId = patientId ?? phone;
    if (!aggregateId) {
      return {
        success: false,
        queryId: query.metadata.queryId,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Either patientId or phone is required',
        },
        cached: false,
        executionTimeMs: 0,
      };
    }

    const events = await deps.eventStore.getByAggregateId(aggregateId);
    const consentEvents = events.filter((e) => e.type === 'ConsentRecorded');

    // Build current consent state
    const consentMap = new Map<string, { status: string; recordedAt: string; source: string }>();

    for (const event of consentEvents) {
      const payload = event.payload as {
        consentType: string;
        status: string;
        source: string;
        recordedAt: string;
      };
      consentMap.set(payload.consentType, {
        status: payload.status,
        recordedAt: payload.recordedAt,
        source: payload.source,
      });
    }

    // Filter by requested consent types if specified
    let consents = Array.from(consentMap.entries()).map(([type, data]) => ({
      type,
      ...data,
    }));

    if (consentTypes && consentTypes.length > 0) {
      consents = consents.filter((c) => (consentTypes as string[]).includes(c.type));
    }

    return {
      success: true,
      queryId: query.metadata.queryId,
      data: { consents },
      cached: false,
      executionTimeMs: 0,
    };
  };
}

/**
 * Get Available Slots query handler
 */
export function createGetAvailableSlotsHandler(_deps: QueryHandlerDeps): QueryHandler<
  z.infer<typeof GetAvailableSlotsQuery.schema>,
  {
    slots: {
      slotId: string;
      startTime: string;
      endTime: string;
      doctorId: string;
      available: boolean;
    }[];
  }
> {
  return (query, _context) => {
    const { startDate, endDate, doctorId, duration } = query.params;

    // In production, this would query an actual scheduling system
    // For now, generate sample slots
    const slots: {
      slotId: string;
      startTime: string;
      endTime: string;
      doctorId: string;
      available: boolean;
    }[] = [];

    const start = new Date(startDate);
    const end = new Date(endDate);
    const durationMs = (duration ?? 30) * 60 * 1000;

    // Generate slots for each day
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      // Skip weekends
      if (d.getDay() === 0 || d.getDay() === 6) continue;

      // Morning slots (9-12)
      for (let hour = 9; hour < 12; hour++) {
        const slotStart = new Date(d);
        slotStart.setHours(hour, 0, 0, 0);

        slots.push({
          slotId: `slot-${slotStart.toISOString()}`,
          startTime: slotStart.toISOString(),
          endTime: new Date(slotStart.getTime() + durationMs).toISOString(),
          doctorId: doctorId ?? 'doc-default',
          available: Math.random() > 0.3, // 70% availability
        });
      }

      // Afternoon slots (14-18)
      for (let hour = 14; hour < 18; hour++) {
        const slotStart = new Date(d);
        slotStart.setHours(hour, 0, 0, 0);

        slots.push({
          slotId: `slot-${slotStart.toISOString()}`,
          startTime: slotStart.toISOString(),
          endTime: new Date(slotStart.getTime() + durationMs).toISOString(),
          doctorId: doctorId ?? 'doc-default',
          available: Math.random() > 0.3,
        });
      }
    }

    return Promise.resolve({
      success: true,
      queryId: query.metadata.queryId,
      data: { slots: slots.filter((s) => s.available) },
      cached: false,
      executionTimeMs: 0,
    });
  };
}

/**
 * Get Patient Activity query handler
 */
export function createGetPatientActivityHandler(
  deps: QueryHandlerDeps
): QueryHandler<z.infer<typeof GetPatientHistoryQuery.schema>, PatientActivityState> {
  return (query, _context) => {
    const projection = deps.projectionManager.get<PatientActivityState>('patient-activity');

    if (!projection) {
      return Promise.resolve({
        success: false,
        queryId: query.metadata.queryId,
        error: {
          code: 'PROJECTION_NOT_FOUND',
          message: 'Patient activity projection not available',
        },
        cached: false,
        executionTimeMs: 0,
      });
    }

    // Filter activities for the specific patient
    const patientActivities = projection.state.recentActivities.filter(
      (a) => a.patientId === query.params.patientId
    );

    return Promise.resolve({
      success: true,
      queryId: query.metadata.queryId,
      data: {
        ...projection.state,
        recentActivities: patientActivities.slice(0, query.params.limit),
      },
      cached: false,
      executionTimeMs: 0,
    });
  };
}

// ============================================================================
// QUERY HANDLER REGISTRATION
// ============================================================================

export interface QueryHandlerRegistry {
  handlers: Map<string, QueryHandler<unknown, unknown>>;
  schemas: Map<string, z.ZodSchema>;
}

/**
 * Get all query handlers for registration
 */
export function createQueryHandlers(deps: QueryHandlerDeps): QueryHandlerRegistry {
  return {
    handlers: new Map<string, QueryHandler<unknown, unknown>>([
      ['GetLeadStats', createGetLeadStatsHandler(deps) as QueryHandler<unknown, unknown>],
      ['GetLeadByPhone', createGetLeadByPhoneHandler(deps) as QueryHandler<unknown, unknown>],
      ['GetLeadAnalytics', createGetLeadAnalyticsHandler(deps) as QueryHandler<unknown, unknown>],
      ['CheckConsent', createCheckConsentHandler(deps) as QueryHandler<unknown, unknown>],
      ['GetAvailableSlots', createGetAvailableSlotsHandler(deps) as QueryHandler<unknown, unknown>],
      [
        'GetPatientHistory',
        createGetPatientActivityHandler(deps) as QueryHandler<unknown, unknown>,
      ],
    ]),
    schemas: new Map<string, z.ZodSchema>([
      ['GetLeadStats', GetLeadStatsQuery.schema],
      ['GetLeadByPhone', GetLeadByPhoneQuery.schema],
      ['GetLeadAnalytics', GetLeadAnalyticsQuery.schema],
      ['CheckConsent', CheckConsentQuery.schema],
      ['GetAvailableSlots', GetAvailableSlotsQuery.schema],
      ['GetPatientHistory', GetPatientHistoryQuery.schema],
    ]),
  };
}
