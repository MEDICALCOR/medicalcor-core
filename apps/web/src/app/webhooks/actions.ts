'use server';

// =============================================================================
// Types
// =============================================================================

export type WebhookStatus = 'success' | 'failed' | 'pending' | 'retrying';
export type WebhookSource = 'whatsapp' | 'stripe' | 'hubspot' | 'twilio' | 'vapi' | 'custom';

export interface WebhookEvent {
  id: string;
  source: WebhookSource;
  eventType: string;
  status: WebhookStatus;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  responseCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  duration: number | null; // ms
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  processedAt: Date | null;
  correlationId: string;
  endpoint: string;
}

export interface WebhookStats {
  total: number;
  success: number;
  failed: number;
  pending: number;
  retrying: number;
  avgResponseTime: number;
  successRate: number;
}

export interface WebhookFilter {
  source?: WebhookSource;
  status?: WebhookStatus;
  eventType?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface ReplayResult {
  success: boolean;
  webhookId: string;
  newStatus: WebhookStatus;
  responseCode: number | null;
  responseBody: string | null;
  errorMessage: string | null;
  duration: number;
}

// =============================================================================
// Mock Data
// =============================================================================

const mockWebhooks: WebhookEvent[] = [
  {
    id: 'wh_1',
    source: 'whatsapp',
    eventType: 'message.received',
    status: 'success',
    payload: {
      from: '+40721123456',
      to: '+40722000000',
      body: 'Bună ziua, aș dori să fac o programare pentru albire dentară.',
      timestamp: '2024-01-15T10:30:00Z',
    },
    headers: {
      'x-whatsapp-signature': 'sha256=abc123...',
      'content-type': 'application/json',
    },
    responseCode: 200,
    responseBody: '{"status":"received"}',
    errorMessage: null,
    duration: 145,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date('2024-01-15T10:30:00Z'),
    processedAt: new Date('2024-01-15T10:30:00.145Z'),
    correlationId: 'cor_abc123',
    endpoint: '/api/webhooks/whatsapp',
  },
  {
    id: 'wh_2',
    source: 'stripe',
    eventType: 'payment_intent.succeeded',
    status: 'success',
    payload: {
      id: 'pi_3MqR1234567890',
      amount: 50000,
      currency: 'ron',
      customer: 'cus_abc123',
      metadata: { appointment_id: 'apt_456' },
    },
    headers: {
      'stripe-signature': 't=1234567890,v1=xyz...',
      'content-type': 'application/json',
    },
    responseCode: 200,
    responseBody: '{"received":true}',
    errorMessage: null,
    duration: 89,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date('2024-01-15T09:15:00Z'),
    processedAt: new Date('2024-01-15T09:15:00.089Z'),
    correlationId: 'cor_def456',
    endpoint: '/api/webhooks/stripe',
  },
  {
    id: 'wh_3',
    source: 'hubspot',
    eventType: 'contact.created',
    status: 'failed',
    payload: {
      objectId: 12345,
      properties: {
        email: 'ion.popescu@email.ro',
        firstname: 'Ion',
        lastname: 'Popescu',
        phone: '+40721555666',
      },
    },
    headers: {
      'x-hubspot-signature': 'v2:abc...',
      'content-type': 'application/json',
    },
    responseCode: 500,
    responseBody: '{"error":"Internal server error"}',
    errorMessage: 'Database connection timeout after 30000ms',
    duration: 30000,
    retryCount: 3,
    maxRetries: 3,
    createdAt: new Date('2024-01-15T08:00:00Z'),
    processedAt: new Date('2024-01-15T08:00:30Z'),
    correlationId: 'cor_ghi789',
    endpoint: '/api/webhooks/hubspot',
  },
  {
    id: 'wh_4',
    source: 'twilio',
    eventType: 'call.completed',
    status: 'retrying',
    payload: {
      CallSid: 'CA1234567890abcdef',
      CallStatus: 'completed',
      CallDuration: '180',
      From: '+40721111222',
      To: '+40722333444',
      RecordingUrl: 'https://api.twilio.com/recordings/RE123',
    },
    headers: {
      'x-twilio-signature': 'xyz123...',
      'content-type': 'application/x-www-form-urlencoded',
    },
    responseCode: 503,
    responseBody: null,
    errorMessage: 'Service temporarily unavailable',
    duration: 5000,
    retryCount: 1,
    maxRetries: 3,
    createdAt: new Date('2024-01-15T11:45:00Z'),
    processedAt: null,
    correlationId: 'cor_jkl012',
    endpoint: '/api/webhooks/twilio',
  },
  {
    id: 'wh_5',
    source: 'vapi',
    eventType: 'assistant.speech.update',
    status: 'pending',
    payload: {
      call_id: 'call_xyz789',
      transcript: 'Pacientul a confirmat programarea pentru mâine la ora 14:00.',
      sentiment: 'positive',
    },
    headers: {
      'x-vapi-secret': 'secret123...',
      'content-type': 'application/json',
    },
    responseCode: null,
    responseBody: null,
    errorMessage: null,
    duration: null,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date('2024-01-15T12:00:00Z'),
    processedAt: null,
    correlationId: 'cor_mno345',
    endpoint: '/api/webhooks/vapi',
  },
  {
    id: 'wh_6',
    source: 'stripe',
    eventType: 'invoice.payment_failed',
    status: 'success',
    payload: {
      id: 'in_1234567890',
      customer: 'cus_def456',
      amount_due: 25000,
      currency: 'ron',
      attempt_count: 1,
    },
    headers: {
      'stripe-signature': 't=9876543210,v1=abc...',
      'content-type': 'application/json',
    },
    responseCode: 200,
    responseBody: '{"received":true}',
    errorMessage: null,
    duration: 156,
    retryCount: 0,
    maxRetries: 3,
    createdAt: new Date('2024-01-14T16:30:00Z'),
    processedAt: new Date('2024-01-14T16:30:00.156Z'),
    correlationId: 'cor_pqr678',
    endpoint: '/api/webhooks/stripe',
  },
];

// =============================================================================
// Server Actions
// =============================================================================

export async function getWebhooksAction(
  filter?: WebhookFilter,
  page = 1,
  pageSize = 20
): Promise<{ webhooks: WebhookEvent[]; total: number; page: number; pageSize: number }> {
  // Simulate network delay
  await new Promise((resolve) => setTimeout(resolve, 200));

  let filtered = [...mockWebhooks];

  if (filter?.source) {
    filtered = filtered.filter((w) => w.source === filter.source);
  }
  if (filter?.status) {
    filtered = filtered.filter((w) => w.status === filter.status);
  }
  if (filter?.eventType) {
    filtered = filtered.filter((w) =>
      w.eventType.toLowerCase().includes(filter.eventType!.toLowerCase())
    );
  }
  if (filter?.search) {
    const search = filter.search.toLowerCase();
    filtered = filtered.filter(
      (w) =>
        w.id.toLowerCase().includes(search) ||
        w.correlationId.toLowerCase().includes(search) ||
        w.eventType.toLowerCase().includes(search) ||
        JSON.stringify(w.payload).toLowerCase().includes(search)
    );
  }

  // Sort by createdAt descending
  filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const paged = filtered.slice(start, start + pageSize);

  return { webhooks: paged, total, page, pageSize };
}

export async function getWebhookByIdAction(id: string): Promise<WebhookEvent | null> {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return mockWebhooks.find((w) => w.id === id) ?? null;
}

export async function getWebhookStatsAction(): Promise<WebhookStats> {
  await new Promise((resolve) => setTimeout(resolve, 150));

  const total = mockWebhooks.length;
  const success = mockWebhooks.filter((w) => w.status === 'success').length;
  const failed = mockWebhooks.filter((w) => w.status === 'failed').length;
  const pending = mockWebhooks.filter((w) => w.status === 'pending').length;
  const retrying = mockWebhooks.filter((w) => w.status === 'retrying').length;

  const completedWebhooks = mockWebhooks.filter((w) => w.duration !== null);
  const avgResponseTime =
    completedWebhooks.length > 0
      ? Math.round(
          completedWebhooks.reduce((sum, w) => sum + (w.duration ?? 0), 0) / completedWebhooks.length
        )
      : 0;

  const successRate = total > 0 ? Math.round((success / total) * 100) : 0;

  return { total, success, failed, pending, retrying, avgResponseTime, successRate };
}

export async function replayWebhookAction(webhookId: string): Promise<ReplayResult> {
  await new Promise((resolve) => setTimeout(resolve, 500 + Math.random() * 1000));

  // Simulate replay - 80% success rate
  const success = Math.random() > 0.2;

  return {
    success,
    webhookId,
    newStatus: success ? 'success' : 'failed',
    responseCode: success ? 200 : 500,
    responseBody: success ? '{"status":"processed"}' : '{"error":"Processing failed"}',
    errorMessage: success ? null : 'Simulated replay failure',
    duration: Math.round(100 + Math.random() * 400),
  };
}

export async function replayMultipleWebhooksAction(
  webhookIds: string[]
): Promise<{ results: ReplayResult[]; successCount: number; failedCount: number }> {
  const results: ReplayResult[] = [];

  for (const id of webhookIds) {
    const result = await replayWebhookAction(id);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return { results, successCount, failedCount };
}

export async function getEventTypesAction(): Promise<string[]> {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const types = [...new Set(mockWebhooks.map((w) => w.eventType))];
  return types.sort();
}
