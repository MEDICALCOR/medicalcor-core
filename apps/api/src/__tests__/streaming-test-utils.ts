/**
 * Streaming Test Utilities
 *
 * Provides utilities for testing SSE (Server-Sent Events) endpoints
 * using Node.js native http module instead of Fastify's inject().
 *
 * This enables testing of long-lived streaming connections that
 * cannot be tested with fastify.inject().
 */
import * as http from 'node:http';

// =============================================================================
// Types
// =============================================================================

export interface SSEEvent {
  eventId?: string;
  eventType: string;
  timestamp?: string;
  data: Record<string, unknown>;
}

export interface SSEClientOptions {
  port: number;
  path: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface SSEClientResult {
  events: SSEEvent[];
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  close: () => void;
  waitForEvents: (count: number, timeoutMs?: number) => Promise<SSEEvent[]>;
  waitForEventType: (eventType: string, timeoutMs?: number) => Promise<SSEEvent>;
}

// =============================================================================
// SSE Parser
// =============================================================================

/**
 * Parse SSE data lines into structured events
 */
export function parseSSEChunk(chunk: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const messages = chunk.split('\n\n').filter(Boolean);

  for (const message of messages) {
    const lines = message.split('\n');
    let data: string | null = null;
    let eventType: string | null = null;
    let eventId: string | null = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        data = line.slice(6);
      } else if (line.startsWith('event: ')) {
        eventType = line.slice(7);
      } else if (line.startsWith('id: ')) {
        eventId = line.slice(4);
      }
    }

    if (data) {
      try {
        const parsed = JSON.parse(data) as Record<string, unknown>;
        events.push({
          eventId: eventId ?? (parsed.eventId as string | undefined),
          eventType: eventType ?? (parsed.eventType as string) ?? 'message',
          timestamp: parsed.timestamp as string | undefined,
          data: parsed,
        });
      } catch {
        // Skip malformed JSON - could be partial chunk
      }
    }
  }

  return events;
}

// =============================================================================
// SSE Client
// =============================================================================

/**
 * Create an SSE client connection using native http module
 *
 * This is necessary because Fastify's inject() waits for the response
 * to complete, but SSE connections are long-lived streams.
 */
export function createSSEClient(options: SSEClientOptions): Promise<SSEClientResult> {
  return new Promise((resolve, reject) => {
    const { port, path, headers = {}, timeout = 5000 } = options;

    const events: SSEEvent[] = [];
    let isResolved = false;
    let pendingResolvers: Array<{
      resolve: (events: SSEEvent[]) => void;
      reject: (err: Error) => void;
      count?: number;
      eventType?: string;
    }> = [];

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          ...headers,
        },
      },
      (res) => {
        if (!isResolved) {
          isResolved = true;

          const close = () => {
            req.destroy();
          };

          const waitForEvents = (count: number, waitTimeout = 5000): Promise<SSEEvent[]> => {
            return new Promise((resolveWait, rejectWait) => {
              // Check if we already have enough events
              if (events.length >= count) {
                resolveWait([...events]);
                return;
              }

              const timer = setTimeout(() => {
                rejectWait(
                  new Error(`Timeout waiting for ${count} events, received ${events.length}`)
                );
              }, waitTimeout);

              pendingResolvers.push({
                resolve: (evts) => {
                  clearTimeout(timer);
                  resolveWait(evts);
                },
                reject: (err) => {
                  clearTimeout(timer);
                  rejectWait(err);
                },
                count,
              });
            });
          };

          const waitForEventType = (eventType: string, waitTimeout = 5000): Promise<SSEEvent> => {
            return new Promise((resolveWait, rejectWait) => {
              // Check if we already have the event type
              const existing = events.find((e) => e.eventType === eventType);
              if (existing) {
                resolveWait(existing);
                return;
              }

              const timer = setTimeout(() => {
                rejectWait(
                  new Error(
                    `Timeout waiting for event type "${eventType}", received: ${events.map((e) => e.eventType).join(', ')}`
                  )
                );
              }, waitTimeout);

              pendingResolvers.push({
                resolve: () => {
                  const found = events.find((e) => e.eventType === eventType);
                  if (found) {
                    clearTimeout(timer);
                    resolveWait(found);
                  }
                },
                reject: (err) => {
                  clearTimeout(timer);
                  rejectWait(err);
                },
                eventType,
              });
            });
          };

          resolve({
            events,
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            close,
            waitForEvents,
            waitForEventType,
          });
        }

        // Process incoming data
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          const newEvents = parseSSEChunk(chunk);
          events.push(...newEvents);

          // Check pending resolvers
          pendingResolvers = pendingResolvers.filter((resolver) => {
            if (resolver.count !== undefined && events.length >= resolver.count) {
              resolver.resolve([...events]);
              return false;
            }
            if (resolver.eventType !== undefined) {
              const found = events.find((e) => e.eventType === resolver.eventType);
              if (found) {
                resolver.resolve([...events]);
                return false;
              }
            }
            return true;
          });
        });

        res.on('end', () => {
          // Connection closed by server
          pendingResolvers.forEach((resolver) => {
            resolver.reject(new Error('Connection closed by server'));
          });
          pendingResolvers = [];
        });
      }
    );

    req.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        reject(err);
      }
      pendingResolvers.forEach((resolver) => {
        resolver.reject(err);
      });
      pendingResolvers = [];
    });

    // Connection timeout for initial connection
    const connectionTimer = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        req.destroy();
        reject(new Error('Connection timeout'));
      }
    }, timeout);

    req.on('response', () => {
      clearTimeout(connectionTimer);
    });

    req.end();
  });
}

// =============================================================================
// HTTP Request Helper
// =============================================================================

export interface HttpRequestOptions {
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  json: <T = unknown>() => T;
}

/**
 * Make an HTTP request using native http module
 */
export function httpRequest(options: HttpRequestOptions): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const { port, path, method = 'GET', headers = {}, body, timeout = 5000 } = options;

    const reqHeaders: Record<string, string> = { ...headers };
    let reqBody: string | undefined;

    if (body !== undefined) {
      reqBody = typeof body === 'string' ? body : JSON.stringify(body);
      reqHeaders['Content-Type'] = reqHeaders['Content-Type'] ?? 'application/json';
      reqHeaders['Content-Length'] = Buffer.byteLength(reqBody).toString();
    }

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: reqHeaders,
      },
      (res) => {
        let responseBody = '';

        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          responseBody += chunk;
        });

        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            headers: res.headers,
            body: responseBody,
            json: <T = unknown>() => JSON.parse(responseBody) as T,
          });
        });
      }
    );

    req.on('error', reject);

    const timer = setTimeout(() => {
      req.destroy();
      reject(new Error('Request timeout'));
    }, timeout);

    req.on('response', () => {
      clearTimeout(timer);
    });

    if (reqBody) {
      req.write(reqBody);
    }

    req.end();
  });
}

// =============================================================================
// Test Helpers
// =============================================================================

/**
 * Wait for a specified duration
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Get an available port for testing
 */
export async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error('Could not get port')));
      }
    });
  });
}

/**
 * Create multiple SSE clients in parallel
 */
export async function createMultipleSSEClients(
  count: number,
  options: SSEClientOptions,
  headersFn?: (index: number) => Record<string, string>
): Promise<SSEClientResult[]> {
  const promises = Array.from({ length: count }, (_, i) =>
    createSSEClient({
      ...options,
      headers: {
        ...options.headers,
        ...(headersFn ? headersFn(i) : {}),
      },
    })
  );

  return Promise.all(promises);
}

// =============================================================================
// Enhanced SSE Client with Retry Support
// =============================================================================

export interface SSEClientWithRetryOptions extends SSEClientOptions {
  maxRetries?: number;
  retryDelayMs?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

/**
 * Create an SSE client with automatic retry on connection failure
 */
export async function createSSEClientWithRetry(
  options: SSEClientWithRetryOptions
): Promise<SSEClientResult> {
  const { maxRetries = 3, retryDelayMs = 1000, onRetry, ...clientOptions } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await createSSEClient(clientOptions);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        onRetry?.(attempt, lastError);
        await delay(retryDelayMs * attempt); // Exponential backoff
      }
    }
  }

  throw lastError ?? new Error('Failed to connect after retries');
}

// =============================================================================
// Event Filtering Utilities
// =============================================================================

/**
 * Filter events by type
 */
export function filterEventsByType(events: SSEEvent[], eventType: string): SSEEvent[] {
  return events.filter((e) => e.eventType === eventType);
}

/**
 * Filter events by multiple types
 */
export function filterEventsByTypes(events: SSEEvent[], eventTypes: string[]): SSEEvent[] {
  return events.filter((e) => eventTypes.includes(e.eventType));
}

/**
 * Filter events by data predicate
 */
export function filterEventsByData(
  events: SSEEvent[],
  predicate: (data: Record<string, unknown>) => boolean
): SSEEvent[] {
  return events.filter((e) => predicate(e.data));
}

/**
 * Find first event matching a condition
 */
export function findEvent(
  events: SSEEvent[],
  predicate: (event: SSEEvent) => boolean
): SSEEvent | undefined {
  return events.find(predicate);
}

/**
 * Check if any event matches a condition
 */
export function hasEvent(events: SSEEvent[], predicate: (event: SSEEvent) => boolean): boolean {
  return events.some(predicate);
}

// =============================================================================
// Statistics and Metrics
// =============================================================================

export interface SSEClientStats {
  totalEvents: number;
  eventsByType: Record<string, number>;
  firstEventTime?: Date;
  lastEventTime?: Date;
  connectionDurationMs: number;
  eventsPerSecond: number;
}

/**
 * Calculate statistics for SSE client events
 */
export function calculateClientStats(client: SSEClientResult, connectedAt: Date): SSEClientStats {
  const now = new Date();
  const connectionDurationMs = now.getTime() - connectedAt.getTime();

  const eventsByType: Record<string, number> = {};
  for (const event of client.events) {
    eventsByType[event.eventType] = (eventsByType[event.eventType] ?? 0) + 1;
  }

  let firstEventTime: Date | undefined;
  let lastEventTime: Date | undefined;

  if (client.events.length > 0) {
    const firstTimestamp = client.events[0]?.timestamp;
    const lastTimestamp = client.events[client.events.length - 1]?.timestamp;

    if (firstTimestamp) firstEventTime = new Date(firstTimestamp);
    if (lastTimestamp) lastEventTime = new Date(lastTimestamp);
  }

  return {
    totalEvents: client.events.length,
    eventsByType,
    firstEventTime,
    lastEventTime,
    connectionDurationMs,
    eventsPerSecond:
      connectionDurationMs > 0 ? (client.events.length / connectionDurationMs) * 1000 : 0,
  };
}

// =============================================================================
// Advanced Waiting Utilities
// =============================================================================

/**
 * Wait for a condition to be true based on events
 */
export async function waitForCondition(
  client: SSEClientResult,
  predicate: (events: SSEEvent[]) => boolean,
  options: { timeoutMs?: number; pollIntervalMs?: number } = {}
): Promise<SSEEvent[]> {
  const { timeoutMs = 5000, pollIntervalMs = 50 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    if (predicate(client.events)) {
      return [...client.events];
    }
    await delay(pollIntervalMs);
  }

  throw new Error(`Timeout waiting for condition after ${timeoutMs}ms`);
}

/**
 * Wait for an event with specific data
 */
export async function waitForEventWithData(
  client: SSEClientResult,
  eventType: string,
  dataPredicate: (data: Record<string, unknown>) => boolean,
  timeoutMs = 5000
): Promise<SSEEvent> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const event = client.events.find((e) => e.eventType === eventType && dataPredicate(e.data));
    if (event) {
      return event;
    }
    await delay(50);
  }

  throw new Error(`Timeout waiting for event "${eventType}" with matching data`);
}

/**
 * Wait for N events of a specific type
 */
export async function waitForEventCount(
  client: SSEClientResult,
  eventType: string,
  count: number,
  timeoutMs = 5000
): Promise<SSEEvent[]> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const matchingEvents = filterEventsByType(client.events, eventType);
    if (matchingEvents.length >= count) {
      return matchingEvents.slice(0, count);
    }
    await delay(50);
  }

  const found = filterEventsByType(client.events, eventType).length;
  throw new Error(`Timeout waiting for ${count} "${eventType}" events, found ${found}`);
}

// =============================================================================
// Connection Health Monitoring
// =============================================================================

export interface HealthCheckResult {
  connected: boolean;
  eventsReceived: number;
  lastEventAge?: number; // milliseconds since last event
  healthy: boolean;
}

/**
 * Check health of an SSE connection
 */
export function checkConnectionHealth(
  client: SSEClientResult,
  maxEventAgeMs = 60000
): HealthCheckResult {
  const eventsReceived = client.events.length;
  const lastEvent = client.events[client.events.length - 1];

  let lastEventAge: number | undefined;
  let healthy = eventsReceived > 0;

  if (lastEvent?.timestamp) {
    lastEventAge = Date.now() - new Date(lastEvent.timestamp).getTime();
    healthy = lastEventAge < maxEventAgeMs;
  }

  return {
    connected: client.statusCode === 200,
    eventsReceived,
    lastEventAge,
    healthy,
  };
}

// =============================================================================
// Event Recording and Replay
// =============================================================================

export interface EventRecording {
  events: Array<{
    event: SSEEvent;
    receivedAt: number; // timestamp
  }>;
  startedAt: number;
}

/**
 * Create an event recorder for tracking event timing
 */
export function createEventRecorder(): {
  record: (event: SSEEvent) => void;
  getRecording: () => EventRecording;
  getEventDeltas: () => number[];
} {
  const recording: EventRecording = {
    events: [],
    startedAt: Date.now(),
  };

  return {
    record: (event: SSEEvent) => {
      recording.events.push({
        event,
        receivedAt: Date.now(),
      });
    },
    getRecording: () => ({ ...recording }),
    getEventDeltas: () => {
      const deltas: number[] = [];
      for (let i = 1; i < recording.events.length; i++) {
        const prev = recording.events[i - 1];
        const curr = recording.events[i];
        if (prev && curr) {
          deltas.push(curr.receivedAt - prev.receivedAt);
        }
      }
      return deltas;
    },
  };
}

// =============================================================================
// Batch Operations
// =============================================================================

/**
 * Close multiple SSE clients
 */
export function closeAllClients(clients: SSEClientResult[]): void {
  for (const client of clients) {
    try {
      client.close();
    } catch {
      // Ignore errors when closing
    }
  }
}

/**
 * Wait for all clients to receive a specific event type
 */
export async function waitForAllClientsEventType(
  clients: SSEClientResult[],
  eventType: string,
  timeoutMs = 5000
): Promise<SSEEvent[]> {
  const promises = clients.map((client) => client.waitForEventType(eventType, timeoutMs));
  return Promise.all(promises);
}

/**
 * Get combined stats for multiple clients
 */
export function getCombinedStats(
  clients: SSEClientResult[],
  connectedAt: Date
): {
  totalClients: number;
  totalEvents: number;
  avgEventsPerClient: number;
  eventsByType: Record<string, number>;
} {
  const eventsByType: Record<string, number> = {};
  let totalEvents = 0;

  for (const client of clients) {
    const stats = calculateClientStats(client, connectedAt);
    totalEvents += stats.totalEvents;

    for (const [type, count] of Object.entries(stats.eventsByType)) {
      eventsByType[type] = (eventsByType[type] ?? 0) + count;
    }
  }

  return {
    totalClients: clients.length,
    totalEvents,
    avgEventsPerClient: clients.length > 0 ? totalEvents / clients.length : 0,
    eventsByType,
  };
}

// =============================================================================
// Test Assertions Helpers
// =============================================================================

/**
 * Assert that events were received in order
 */
export function assertEventsInOrder(events: SSEEvent[], expectedTypes: string[]): void {
  const actualTypes = events.map((e) => e.eventType);

  for (let i = 0; i < expectedTypes.length; i++) {
    if (actualTypes[i] !== expectedTypes[i]) {
      throw new Error(
        `Event order mismatch at index ${i}: expected "${expectedTypes[i]}", got "${actualTypes[i]}"`
      );
    }
  }
}

/**
 * Assert that all events have required fields
 */
export function assertEventStructure(event: SSEEvent, requiredFields: string[]): void {
  for (const field of requiredFields) {
    if (!(field in event.data)) {
      throw new Error(`Event missing required field: ${field}`);
    }
  }
}

/**
 * Assert event latency is within bounds
 */
export function assertLatency(sendTime: number, receiveTime: number, maxLatencyMs: number): void {
  const latency = receiveTime - sendTime;
  if (latency > maxLatencyMs) {
    throw new Error(`Latency ${latency}ms exceeds maximum ${maxLatencyMs}ms`);
  }
}
