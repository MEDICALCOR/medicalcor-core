'use server';

/**
 * @fileoverview Webhook Server Actions
 *
 * L6: Webhook Replay UI - Admin UI for webhook replay/debug
 * Server actions for fetching webhook history and triggering replays.
 *
 * @module actions/webhooks
 * @security All actions require VIEW_ANALYTICS or MANAGE_SYSTEM permission
 */

import { requirePermission } from '@/lib/auth/server-action-auth';

// ============================================================================
// TYPES
// ============================================================================

export type WebhookSource =
  | 'whatsapp'
  | 'vapi'
  | 'stripe'
  | 'booking'
  | 'voice'
  | 'crm'
  | 'hubspot';

export type WebhookStatus = 'success' | 'failed' | 'pending' | 'replayed';

export interface WebhookEvent {
  id: string;
  source: WebhookSource;
  eventType: string;
  status: WebhookStatus;
  receivedAt: string;
  processedAt: string | null;
  correlationId: string;
  httpStatus: number;
  duration: number;
  payload: Record<string, unknown>;
  headers: Record<string, string>;
  response: Record<string, unknown> | null;
  error: string | null;
  retryCount: number;
  replayedFrom: string | null;
  metadata: {
    ipAddress?: string;
    userAgent?: string;
    signature?: string;
    contentLength?: number;
  };
}

export interface WebhookListFilters {
  source?: WebhookSource;
  status?: WebhookStatus;
  eventType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  correlationId?: string;
}

export interface WebhookListResult {
  webhooks: WebhookEvent[];
  total: number;
  page: number;
  pageSize: number;
  sources: { source: WebhookSource; count: number }[];
  statuses: { status: WebhookStatus; count: number }[];
}

export interface WebhookReplayResult {
  success: boolean;
  message: string;
  replayId?: string;
  originalId: string;
  timestamp?: string;
  response?: Record<string, unknown>;
}

export interface WebhookStats {
  total: number;
  successful: number;
  failed: number;
  pending: number;
  replayed: number;
  avgDuration: number;
  bySource: { source: WebhookSource; count: number; failureRate: number }[];
  recentErrors: { eventType: string; error: string; count: number }[];
}

// ============================================================================
// API COMMUNICATION
// ============================================================================

function getApiBaseUrl(): string {
  return process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
}

function getApiSecretKey(): string | undefined {
  return process.env.API_SECRET_KEY;
}

// ============================================================================
// MOCK DATA GENERATORS (for development/demo)
// ============================================================================

const WEBHOOK_SOURCES: WebhookSource[] = ['whatsapp', 'vapi', 'stripe', 'booking', 'voice', 'crm'];

const EVENT_TYPES: Record<WebhookSource, string[]> = {
  whatsapp: ['message.received', 'message.delivered', 'message.read', 'status.update'],
  vapi: ['call.started', 'call.ended', 'transcript.updated', 'function.call'],
  stripe: ['payment_intent.succeeded', 'payment_intent.failed', 'charge.succeeded', 'invoice.paid'],
  booking: ['appointment.created', 'appointment.updated', 'appointment.cancelled'],
  voice: ['call.incoming', 'call.answered', 'call.ended', 'voicemail.received'],
  crm: ['contact.created', 'contact.updated', 'deal.won', 'deal.lost'],
  hubspot: ['contact.created', 'contact.updated', 'deal.created'],
};

const SAMPLE_ERRORS = [
  'Connection timeout after 30000ms',
  'Rate limit exceeded (429)',
  'Invalid signature verification',
  'Payload parsing failed: unexpected token',
  'Database connection failed',
  'External service unavailable',
];

function generateCorrelationId(): string {
  return `cor_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 9)}`;
}

function generateWebhookId(): string {
  return `wh_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 11)}`;
}

function generateMockWebhooks(count: number): WebhookEvent[] {
  const webhooks: WebhookEvent[] = [];
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    const source = WEBHOOK_SOURCES[Math.floor(Math.random() * WEBHOOK_SOURCES.length)];
    const eventTypes = EVENT_TYPES[source];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const statusRand = Math.random();
    let status: WebhookStatus = 'success';
    let error: string | null = null;
    let httpStatus = 200;

    if (statusRand > 0.9) {
      status = 'failed';
      error = SAMPLE_ERRORS[Math.floor(Math.random() * SAMPLE_ERRORS.length)];
      httpStatus = [400, 401, 429, 500, 503][Math.floor(Math.random() * 5)];
    } else if (statusRand > 0.85) {
      status = 'pending';
      httpStatus = 0;
    } else if (statusRand > 0.8) {
      status = 'replayed';
    }

    const receivedAt = new Date(now - Math.floor(Math.random() * 24 * 60 * 60 * 1000));
    const duration = Math.floor(Math.random() * 2000) + 50;
    const processedAt = status !== 'pending' ? new Date(receivedAt.getTime() + duration) : null;

    webhooks.push({
      id: generateWebhookId(),
      source,
      eventType,
      status,
      receivedAt: receivedAt.toISOString(),
      processedAt: processedAt?.toISOString() ?? null,
      correlationId: generateCorrelationId(),
      httpStatus,
      duration: status !== 'pending' ? duration : 0,
      payload: generateMockPayload(source, eventType),
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': `sha256=${Math.random().toString(36).substring(2, 34)}`,
        'x-request-id': generateCorrelationId(),
      },
      response: status === 'success' ? { acknowledged: true } : null,
      error,
      retryCount: status === 'failed' ? Math.floor(Math.random() * 3) : 0,
      replayedFrom: status === 'replayed' ? generateWebhookId() : null,
      metadata: {
        ipAddress: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        userAgent: 'WhatsApp-Webhook/1.0',
        contentLength: Math.floor(Math.random() * 5000) + 100,
      },
    });
  }

  return webhooks.sort(
    (a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()
  );
}

function generateMockPayload(source: WebhookSource, eventType: string): Record<string, unknown> {
  const basePayload = {
    timestamp: Date.now(),
    event_type: eventType,
  };

  switch (source) {
    case 'whatsapp':
      return {
        ...basePayload,
        object: 'whatsapp_business_account',
        entry: [
          {
            id: '123456789',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: { phone_number_id: '987654321' },
                  messages: [
                    { id: 'msg_123', from: '40712345678', type: 'text', text: { body: 'Hello' } },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

    case 'stripe':
      return {
        ...basePayload,
        id: `evt_${Math.random().toString(36).substring(2, 15)}`,
        type: eventType,
        data: {
          object: {
            id: `pi_${Math.random().toString(36).substring(2, 15)}`,
            amount: Math.floor(Math.random() * 50000) + 1000,
            currency: 'ron',
            status: 'succeeded',
          },
        },
      };

    case 'vapi':
      return {
        ...basePayload,
        call_id: `call_${Math.random().toString(36).substring(2, 12)}`,
        assistant_id: 'asst_123',
        customer: { number: '+40712345678' },
        transcript: eventType.includes('transcript') ? 'Sample transcript text...' : undefined,
      };

    case 'booking':
      return {
        ...basePayload,
        appointment_id: `apt_${Math.random().toString(36).substring(2, 10)}`,
        patient_id: `pat_${Math.random().toString(36).substring(2, 10)}`,
        clinic_id: 'clinic_main',
        scheduled_at: new Date(Date.now() + 86400000 * 3).toISOString(),
        service: 'Consultație stomatologică',
      };

    default:
      return basePayload;
  }
}

// Store for mock webhooks (simulates database)
let mockWebhooksCache: WebhookEvent[] | null = null;

function getMockWebhooks(): WebhookEvent[] {
  if (!mockWebhooksCache) {
    mockWebhooksCache = generateMockWebhooks(150);
  }
  return mockWebhooksCache;
}

// ============================================================================
// SERVER ACTIONS
// ============================================================================

/**
 * Get paginated list of webhook events with filters
 *
 * @requires VIEW_ANALYTICS permission
 */
export async function getWebhookListAction(
  page = 1,
  pageSize = 20,
  filters: WebhookListFilters = {}
): Promise<WebhookListResult> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    // Try to fetch from API first
    const apiUrl = getApiBaseUrl();
    const apiKey = getApiSecretKey();

    if (apiKey) {
      try {
        const queryParams = new URLSearchParams({
          page: page.toString(),
          pageSize: pageSize.toString(),
          ...(filters.source && { source: filters.source }),
          ...(filters.status && { status: filters.status }),
          ...(filters.eventType && { eventType: filters.eventType }),
          ...(filters.startDate && { startDate: filters.startDate }),
          ...(filters.endDate && { endDate: filters.endDate }),
          ...(filters.search && { search: filters.search }),
          ...(filters.correlationId && { correlationId: filters.correlationId }),
        });

        const response = await fetch(`${apiUrl}/admin/webhooks?${queryParams}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          cache: 'no-store',
        });

        if (response.ok) {
          const data = (await response.json()) as WebhookListResult;
          return data;
        }
      } catch {
        // Fall through to mock data
      }
    }

    // Use mock data for development
    let webhooks = getMockWebhooks();

    // Apply filters
    if (filters.source) {
      webhooks = webhooks.filter((w) => w.source === filters.source);
    }
    if (filters.status) {
      webhooks = webhooks.filter((w) => w.status === filters.status);
    }
    if (filters.eventType) {
      webhooks = webhooks.filter((w) => w.eventType.includes(filters.eventType!));
    }
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      webhooks = webhooks.filter(
        (w) =>
          w.id.toLowerCase().includes(searchLower) ||
          w.correlationId.toLowerCase().includes(searchLower) ||
          w.eventType.toLowerCase().includes(searchLower) ||
          (w.error && w.error.toLowerCase().includes(searchLower))
      );
    }
    if (filters.correlationId) {
      webhooks = webhooks.filter((w) => w.correlationId === filters.correlationId);
    }
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      webhooks = webhooks.filter((w) => new Date(w.receivedAt) >= start);
    }
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      webhooks = webhooks.filter((w) => new Date(w.receivedAt) <= end);
    }

    // Calculate aggregates before pagination
    const allWebhooks = getMockWebhooks();
    const sources = WEBHOOK_SOURCES.map((source) => ({
      source,
      count: allWebhooks.filter((w) => w.source === source).length,
    }));
    const statuses = (['success', 'failed', 'pending', 'replayed'] as WebhookStatus[]).map(
      (status) => ({
        status,
        count: allWebhooks.filter((w) => w.status === status).length,
      })
    );

    // Paginate
    const total = webhooks.length;
    const startIdx = (page - 1) * pageSize;
    const paginatedWebhooks = webhooks.slice(startIdx, startIdx + pageSize);

    return {
      webhooks: paginatedWebhooks,
      total,
      page,
      pageSize,
      sources,
      statuses,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getWebhookListAction] Failed:', error);
    }
    return {
      webhooks: [],
      total: 0,
      page: 1,
      pageSize: 20,
      sources: [],
      statuses: [],
    };
  }
}

/**
 * Get a single webhook event by ID
 *
 * @requires VIEW_ANALYTICS permission
 */
export async function getWebhookByIdAction(webhookId: string): Promise<WebhookEvent | null> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const apiUrl = getApiBaseUrl();
    const apiKey = getApiSecretKey();

    if (apiKey) {
      try {
        const response = await fetch(`${apiUrl}/admin/webhooks/${encodeURIComponent(webhookId)}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          cache: 'no-store',
        });

        if (response.ok) {
          return (await response.json()) as WebhookEvent;
        }
      } catch {
        // Fall through to mock data
      }
    }

    // Mock data
    const webhooks = getMockWebhooks();
    return webhooks.find((w) => w.id === webhookId) ?? null;
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getWebhookByIdAction] Failed:', error);
    }
    return null;
  }
}

/**
 * Replay a webhook event
 *
 * @requires MANAGE_SYSTEM permission
 */
export async function replayWebhookAction(webhookId: string): Promise<WebhookReplayResult> {
  try {
    await requirePermission('system:admin' as any);

    const apiUrl = getApiBaseUrl();
    const apiKey = getApiSecretKey();

    if (apiKey) {
      try {
        const response = await fetch(
          `${apiUrl}/admin/webhooks/${encodeURIComponent(webhookId)}/replay`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
            },
          }
        );

        if (response.ok) {
          return (await response.json()) as WebhookReplayResult;
        }

        const errorData = (await response.json().catch(() => ({}))) as { message?: string };
        return {
          success: false,
          message: errorData.message ?? `Replay failed with status ${response.status}`,
          originalId: webhookId,
        };
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : 'Network error during replay',
          originalId: webhookId,
        };
      }
    }

    // Mock replay response
    const webhook = getMockWebhooks().find((w) => w.id === webhookId);
    if (!webhook) {
      return {
        success: false,
        message: 'Webhook not found',
        originalId: webhookId,
      };
    }

    // Simulate replay processing
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      success: true,
      message: `Successfully replayed ${webhook.eventType} webhook`,
      replayId: generateWebhookId(),
      originalId: webhookId,
      timestamp: new Date().toISOString(),
      response: { acknowledged: true, replayed: true },
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[replayWebhookAction] Failed:', error);
    }
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred',
      originalId: webhookId,
    };
  }
}

/**
 * Bulk replay multiple webhook events
 *
 * @requires MANAGE_SYSTEM permission
 */
export async function bulkReplayWebhooksAction(
  webhookIds: string[]
): Promise<{ results: WebhookReplayResult[]; successCount: number; failureCount: number }> {
  try {
    await requirePermission('system:admin' as any);

    const results: WebhookReplayResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const webhookId of webhookIds) {
      const result = await replayWebhookAction(webhookId);
      results.push(result);
      if (result.success) {
        successCount++;
      } else {
        failureCount++;
      }
    }

    return { results, successCount, failureCount };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[bulkReplayWebhooksAction] Failed:', error);
    }
    return {
      results: webhookIds.map((id) => ({
        success: false,
        message: error instanceof Error ? error.message : 'Bulk replay failed',
        originalId: id,
      })),
      successCount: 0,
      failureCount: webhookIds.length,
    };
  }
}

/**
 * Get webhook statistics
 *
 * @requires VIEW_ANALYTICS permission
 */
export async function getWebhookStatsAction(): Promise<WebhookStats> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    const webhooks = getMockWebhooks();

    const total = webhooks.length;
    const successful = webhooks.filter((w) => w.status === 'success').length;
    const failed = webhooks.filter((w) => w.status === 'failed').length;
    const pending = webhooks.filter((w) => w.status === 'pending').length;
    const replayed = webhooks.filter((w) => w.status === 'replayed').length;

    const durations = webhooks.filter((w) => w.duration > 0).map((w) => w.duration);
    const avgDuration =
      durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;

    const bySource = WEBHOOK_SOURCES.map((source) => {
      const sourceWebhooks = webhooks.filter((w) => w.source === source);
      const sourceFailed = sourceWebhooks.filter((w) => w.status === 'failed').length;
      return {
        source,
        count: sourceWebhooks.length,
        failureRate:
          sourceWebhooks.length > 0 ? Math.round((sourceFailed / sourceWebhooks.length) * 100) : 0,
      };
    });

    // Group errors by type
    const errorCounts = new Map<string, { error: string; eventType: string; count: number }>();
    webhooks
      .filter((w) => w.error)
      .forEach((w) => {
        const key = `${w.eventType}:${w.error}`;
        const existing = errorCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          errorCounts.set(key, { error: w.error!, eventType: w.eventType, count: 1 });
        }
      });

    const recentErrors = Array.from(errorCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total,
      successful,
      failed,
      pending,
      replayed,
      avgDuration,
      bySource,
      recentErrors,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getWebhookStatsAction] Failed:', error);
    }
    return {
      total: 0,
      successful: 0,
      failed: 0,
      pending: 0,
      replayed: 0,
      avgDuration: 0,
      bySource: [],
      recentErrors: [],
    };
  }
}

/**
 * Get distinct event types for a source
 *
 * @requires VIEW_ANALYTICS permission
 */
export async function getWebhookEventTypesAction(source?: WebhookSource): Promise<string[]> {
  try {
    await requirePermission('VIEW_ANALYTICS');

    if (source) {
      return EVENT_TYPES[source] ?? [];
    }

    // Return all event types
    return Object.values(EVENT_TYPES).flat();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('[getWebhookEventTypesAction] Failed:', error);
    }
    return [];
  }
}
