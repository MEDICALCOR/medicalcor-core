/**
 * @module architecture/ports/inbound
 *
 * Inbound (Driving) Ports
 * =======================
 *
 * Inbound ports define how external actors interact with the application.
 * These are implemented by the application layer (use cases).
 */

import type { Result } from '../../types/result.js';
import type {
  Command,
  CommandMetadata,
  Query,
  QueryMetadata,
  UseCaseError,
} from '../layers/contracts.js';

// ============================================================================
// HTTP/REST PORT
// ============================================================================

/**
 * HTTP Request port - handles incoming HTTP requests
 */
export interface HttpRequestPort {
  readonly portName: 'http-request';
  readonly portType: 'inbound';

  handleRequest<TRequest, TResponse>(
    request: HttpInboundRequest<TRequest>
  ): Promise<HttpInboundResponse<TResponse>>;
}

export interface HttpInboundRequest<T = unknown> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly headers: Record<string, string>;
  readonly query: Record<string, string>;
  readonly body: T;
  readonly params: Record<string, string>;
  readonly context: RequestContext;
}

export interface HttpInboundResponse<T = unknown> {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: T;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface RequestContext {
  readonly correlationId: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly permissions: string[];
  readonly ip?: string;
  readonly userAgent?: string;
}

// ============================================================================
// GRAPHQL PORT
// ============================================================================

/**
 * GraphQL port - handles GraphQL queries and mutations
 */
export interface GraphQLPort {
  readonly portName: 'graphql';
  readonly portType: 'inbound';

  executeQuery<TVariables, TResult>(
    request: GraphQLRequest<TVariables>
  ): Promise<GraphQLResponse<TResult>>;

  executeMutation<TVariables, TResult>(
    request: GraphQLRequest<TVariables>
  ): Promise<GraphQLResponse<TResult>>;

  executeSubscription<TVariables, TResult>(
    request: GraphQLRequest<TVariables>
  ): AsyncIterable<GraphQLResponse<TResult>>;
}

export interface GraphQLRequest<TVariables = Record<string, unknown>> {
  readonly query: string;
  readonly operationName?: string;
  readonly variables?: TVariables;
  readonly context: RequestContext;
}

export interface GraphQLResponse<TResult = unknown> {
  readonly data?: TResult;
  readonly errors?: GraphQLError[];
  readonly extensions?: Record<string, unknown>;
}

export interface GraphQLError {
  readonly message: string;
  readonly locations?: { line: number; column: number }[];
  readonly path?: (string | number)[];
  readonly extensions?: Record<string, unknown>;
}

// ============================================================================
// MESSAGE/EVENT PORT
// ============================================================================

/**
 * Message consumer port - handles incoming messages/events
 */
export interface MessageConsumerPort {
  readonly portName: 'message-consumer';
  readonly portType: 'inbound';

  handleMessage<TPayload>(message: InboundMessage<TPayload>): Promise<InboundMessageHandleResult>;
  acknowledgeMessage(messageId: string): Promise<void>;
  rejectMessage(messageId: string, reason: string): Promise<void>;
}

export interface InboundMessage<TPayload = unknown> {
  readonly messageId: string;
  readonly messageType: string;
  readonly payload: TPayload;
  readonly metadata: InboundMessageMetadata;
  readonly receivedAt: string;
}

export interface InboundMessageMetadata {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly source: string;
  readonly timestamp: string;
  readonly retryCount: number;
  readonly headers: Record<string, string>;
}

export interface InboundMessageHandleResult {
  readonly success: boolean;
  readonly messageId: string;
  readonly action: 'ack' | 'nack' | 'requeue' | 'dead-letter';
  readonly error?: string;
}

// ============================================================================
// WEBSOCKET PORT
// ============================================================================

/**
 * WebSocket port - handles real-time bidirectional communication
 */
export interface WebSocketPort {
  readonly portName: 'websocket';
  readonly portType: 'inbound';

  onConnection(handler: (connection: WebSocketConnection) => void): void;
  onDisconnection(handler: (connectionId: string) => void): void;
  onMessage<TPayload>(
    handler: (connectionId: string, message: WebSocketMessage<TPayload>) => void
  ): void;
}

export interface WebSocketConnection {
  readonly connectionId: string;
  readonly userId?: string;
  readonly tenantId?: string;
  readonly connectedAt: string;
  readonly metadata: Record<string, unknown>;

  send<TPayload>(message: WebSocketMessage<TPayload>): Promise<void>;
  close(code?: number, reason?: string): void;
}

export interface WebSocketMessage<TPayload = unknown> {
  readonly type: string;
  readonly payload: TPayload;
  readonly metadata?: Record<string, unknown>;
}

// ============================================================================
// CLI PORT
// ============================================================================

/**
 * CLI port - handles command-line interface interactions
 */
export interface CLIPort {
  readonly portName: 'cli';
  readonly portType: 'inbound';

  executeCommand(command: CLICommand): Promise<CLIResult>;
}

export interface CLICommand {
  readonly name: string;
  readonly args: string[];
  readonly options: Record<string, unknown>;
  readonly context: CLIContext;
}

export interface CLIContext {
  readonly workingDirectory: string;
  readonly environment: Record<string, string>;
  readonly interactive: boolean;
}

export interface CLIResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

// ============================================================================
// SCHEDULER PORT
// ============================================================================

/**
 * Scheduler port - handles scheduled/cron jobs
 */
export interface SchedulerPort {
  readonly portName: 'scheduler';
  readonly portType: 'inbound';

  onScheduledJob(handler: (job: ScheduledJob) => Promise<JobResult>): void;
}

export interface ScheduledJob {
  readonly jobId: string;
  readonly jobType: string;
  readonly scheduledAt: string;
  readonly payload: Record<string, unknown>;
  readonly metadata: JobMetadata;
}

export interface JobMetadata {
  readonly correlationId: string;
  readonly retryCount: number;
  readonly maxRetries: number;
  readonly timeout: number;
}

export interface JobResult {
  readonly success: boolean;
  readonly jobId: string;
  readonly executionTimeMs: number;
  readonly output?: unknown;
  readonly error?: string;
}

// ============================================================================
// WEBHOOK PORT
// ============================================================================

/**
 * Webhook port - handles incoming webhooks from external services
 */
export interface WebhookPort {
  readonly portName: 'webhook';
  readonly portType: 'inbound';

  handleWebhook<TPayload>(webhook: IncomingWebhook<TPayload>): Promise<WebhookResponse>;
  verifySignature(webhook: IncomingWebhook, secret: string): boolean;
}

export interface IncomingWebhook<TPayload = unknown> {
  readonly source: string;
  readonly eventType: string;
  readonly payload: TPayload;
  readonly headers: Record<string, string>;
  readonly signature?: string;
  readonly timestamp: string;
}

export interface WebhookResponse {
  readonly acknowledged: boolean;
  readonly status: number;
  readonly body?: unknown;
}

// ============================================================================
// USE CASE PORTS (Application Layer Interface)
// ============================================================================

/**
 * Command Port - Entry point for write operations
 */
export interface CommandPort {
  readonly portName: 'command';
  readonly portType: 'inbound';

  dispatch<TPayload, TResult>(command: Command<TPayload>): Promise<Result<TResult, UseCaseError>>;
}

/**
 * Query Port - Entry point for read operations
 */
export interface QueryPort {
  readonly portName: 'query';
  readonly portType: 'inbound';

  execute<TPayload, TResult>(query: Query<TPayload>): Promise<Result<TResult, UseCaseError>>;
}

// ============================================================================
// INBOUND PORT FACTORY
// ============================================================================

/**
 * Type map of all inbound ports
 */
export interface InboundPortMap {
  'http-request': HttpRequestPort;
  graphql: GraphQLPort;
  'message-consumer': MessageConsumerPort;
  websocket: WebSocketPort;
  cli: CLIPort;
  scheduler: SchedulerPort;
  webhook: WebhookPort;
  command: CommandPort;
  query: QueryPort;
}

/**
 * Get an inbound port by name (type-safe)
 */
export type InboundPortName = keyof InboundPortMap;

/**
 * Generic inbound port type
 */
export type AnyInboundPort = InboundPortMap[InboundPortName];
