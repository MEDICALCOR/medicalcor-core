/**
 * MSW (Mock Service Worker) request handlers for testing.
 * Add handlers for any API endpoints your app uses.
 */
import { http, HttpResponse } from 'msw';

// Base URL for API requests
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Default handlers for common API endpoints.
 * Override these in individual tests as needed.
 */
export const handlers = [
  // Lead submission endpoint
  http.post(`${API_BASE}/api/leads`, async ({ request }) => {
    const body = await request.json();

    // Simulate successful lead creation
    return HttpResponse.json(
      {
        success: true,
        message: 'Lead submitted successfully',
        referenceId: 'TEST1234',
        data: {
          id: 'lead_test_123',
          phone: body.phone,
          source: body.source ?? 'web',
          createdAt: new Date().toISOString(),
        },
      },
      { status: 201 }
    );
  }),

  // Patient list endpoint
  http.get(`${API_BASE}/api/patients`, ({ request }) => {
    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const pageSize = Number(url.searchParams.get('pageSize') ?? '20');

    return HttpResponse.json({
      data: mockPatients.slice(0, pageSize),
      nextCursor: cursor ? null : 'next_cursor_123',
      hasMore: !cursor,
    });
  }),

  // Single patient endpoint
  http.get(`${API_BASE}/api/patients/:id`, ({ params }) => {
    const { id } = params;
    const patient = mockPatients.find((p) => p.id === id);

    if (!patient) {
      return HttpResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    return HttpResponse.json({ data: patient });
  }),

  // Workflows endpoint
  http.get(`${API_BASE}/api/workflows`, () => {
    return HttpResponse.json({
      data: mockWorkflows,
    });
  }),

  // Analytics endpoint
  http.get(`${API_BASE}/api/analytics`, ({ request }) => {
    const url = new URL(request.url);
    const timeRange = url.searchParams.get('timeRange') ?? '7d';

    return HttpResponse.json({
      data: {
        timeRange,
        totalLeads: 150,
        conversionRate: 0.23,
        appointments: 34,
        revenue: 45000,
      },
    });
  }),

  // WebSocket token endpoint
  http.get(`${API_BASE}/api/ws/token`, () => {
    return HttpResponse.json({
      token: 'mock_ws_token_123',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });
  }),

  // GDPR export endpoint
  http.get(`${API_BASE}/api/gdpr/export`, () => {
    return HttpResponse.json({
      data: {
        personalInfo: { email: 'test@example.com' },
        activity: [],
      },
    });
  }),
];

// Mock data for patients
export const mockPatients = [
  {
    id: 'patient_1',
    firstName: 'Ion',
    lastName: 'Popescu',
    email: 'ion.popescu@example.com',
    phone: '+40721234567',
    status: 'scheduled',
    score: 4,
    classification: 'warm',
    createdAt: '2024-01-15T10:00:00Z',
    lastContactAt: '2024-01-20T14:30:00Z',
  },
  {
    id: 'patient_2',
    firstName: 'Maria',
    lastName: 'Ionescu',
    email: 'maria.ionescu@example.com',
    phone: '+40722345678',
    status: 'lead',
    score: 5,
    classification: 'hot',
    createdAt: '2024-01-18T09:00:00Z',
    lastContactAt: '2024-01-21T11:00:00Z',
  },
  {
    id: 'patient_3',
    firstName: 'Andrei',
    lastName: 'Dumitru',
    email: 'andrei.dumitru@example.com',
    phone: '+40723456789',
    status: 'contacted',
    score: 2,
    classification: 'cold',
    createdAt: '2024-01-10T08:00:00Z',
    lastContactAt: '2024-01-12T16:00:00Z',
  },
];

// Mock data for workflows
export const mockWorkflows = [
  {
    id: 'workflow_1',
    name: 'New Lead Follow-up',
    triggerType: 'new_lead',
    isActive: true,
    steps: [
      {
        id: 'step_1',
        type: 'action',
        action: { type: 'send_whatsapp', template: 'welcome' },
      },
    ],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'workflow_2',
    name: 'Appointment Reminder',
    triggerType: 'appointment_scheduled',
    isActive: true,
    steps: [
      {
        id: 'step_1',
        type: 'delay',
        delay: { value: 1, unit: 'days' },
      },
      {
        id: 'step_2',
        type: 'action',
        action: { type: 'send_whatsapp', template: 'reminder' },
      },
    ],
    createdAt: '2024-01-05T00:00:00Z',
    updatedAt: '2024-01-18T00:00:00Z',
  },
];

// Error handlers for testing error states
export const errorHandlers = {
  serverError: http.get('*', () => {
    return HttpResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }),

  networkError: http.get('*', () => {
    return HttpResponse.error();
  }),

  unauthorized: http.get('*', () => {
    return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }),

  rateLimited: http.post(`${API_BASE}/api/leads`, () => {
    return HttpResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': '3600' } }
    );
  }),
};
