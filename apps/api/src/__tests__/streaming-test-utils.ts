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
