/**
 * @module architecture/ports/outbound
 *
 * Outbound (Driven) Ports
 * =======================
 *
 * Outbound ports define how the application interacts with external systems.
 * These are defined in the application/domain layer and implemented by infrastructure.
 */

import type { Result } from '../../types/result.js';
import type { DomainEvent, AuditEntry } from '../layers/contracts.js';

// ============================================================================
// PERSISTENCE PORT
// ============================================================================

/**
 * Generic persistence port for data storage
 */
export interface PersistencePort<TEntity, TId> {
  readonly portName: string;
  readonly portType: 'outbound';

  findById(id: TId): Promise<TEntity | null>;
  findAll(criteria?: QueryCriteria): Promise<TEntity[]>;
  findOne(criteria: QueryCriteria): Promise<TEntity | null>;
  count(criteria?: QueryCriteria): Promise<number>;
  exists(id: TId): Promise<boolean>;

  save(entity: TEntity): Promise<void>;
  saveAll(entities: TEntity[]): Promise<void>;
  update(id: TId, updates: Partial<TEntity>): Promise<void>;
  delete(id: TId): Promise<void>;
  deleteAll(criteria: QueryCriteria): Promise<number>;
}

export interface QueryCriteria {
  readonly filters?: FilterCondition[];
  readonly orderBy?: OrderByClause[];
  readonly limit?: number;
  readonly offset?: number;
  readonly include?: string[];
}

export interface FilterCondition {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: unknown;
}

export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'isNull'
  | 'isNotNull';

export interface OrderByClause {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

// ============================================================================
// EVENT STORE PORT
// ============================================================================

/**
 * Event store port for event sourcing
 */
export interface EventStorePort {
  readonly portName: 'event-store';
  readonly portType: 'outbound';

  append(event: DomainEvent): Promise<void>;
  appendAll(events: DomainEvent[]): Promise<void>;

  getByAggregateId(aggregateId: string, afterVersion?: number): Promise<DomainEvent[]>;
  getByCorrelationId(correlationId: string): Promise<DomainEvent[]>;
  getByEventType(eventType: string, options?: EventQueryOptions): Promise<DomainEvent[]>;
  getAll(options?: EventQueryOptions): Promise<DomainEvent[]>;

  getLatestVersion(aggregateId: string): Promise<number>;
  getSnapshot<TState>(aggregateId: string): Promise<AggregateSnapshot<TState> | null>;
  saveSnapshot<TState>(snapshot: AggregateSnapshot<TState>): Promise<void>;
}

export interface EventQueryOptions {
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AggregateSnapshot<TState = unknown> {
  readonly aggregateId: string;
  readonly aggregateType: string;
  readonly version: number;
  readonly state: TState;
  readonly createdAt: string;
}

// ============================================================================
// MESSAGE BROKER PORT
// ============================================================================

/**
 * Message broker port for async messaging
 */
export interface MessageBrokerPort {
  readonly portName: 'message-broker';
  readonly portType: 'outbound';

  publish<TPayload>(message: OutboundMessage<TPayload>): Promise<void>;
  publishBatch<TPayload>(messages: OutboundMessage<TPayload>[]): Promise<void>;

  subscribe(
    topic: string,
    handler: MessageHandler,
    options?: SubscriptionOptions
  ): Promise<Subscription>;
  unsubscribe(subscription: Subscription): Promise<void>;

  createTopic(topic: string, options?: TopicOptions): Promise<void>;
  deleteTopic(topic: string): Promise<void>;
}

export interface OutboundMessage<TPayload = unknown> {
  readonly topic: string;
  readonly key?: string;
  readonly payload: TPayload;
  readonly headers?: Record<string, string>;
  readonly metadata: OutboundMessageMetadata;
}

export interface OutboundMessageMetadata {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly timestamp: string;
  readonly source: string;
  readonly ttl?: number;
  readonly priority?: 'low' | 'normal' | 'high';
}

export type MessageHandler = (message: ReceivedMessage) => Promise<MessageHandleResult>;

export interface ReceivedMessage {
  readonly messageId: string;
  readonly topic: string;
  readonly key?: string;
  readonly payload: unknown;
  readonly headers: Record<string, string>;
  readonly metadata: ReceivedMessageMetadata;
}

export interface ReceivedMessageMetadata {
  readonly correlationId: string;
  readonly causationId?: string;
  readonly timestamp: string;
  readonly source: string;
  readonly partition?: number;
  readonly offset?: number;
  readonly retryCount: number;
}

export interface MessageHandleResult {
  readonly success: boolean;
  readonly action: 'ack' | 'nack' | 'requeue';
  readonly error?: string;
}

export interface Subscription {
  readonly id: string;
  readonly topic: string;
  unsubscribe(): Promise<void>;
}

export interface SubscriptionOptions {
  readonly groupId?: string;
  readonly startFrom?: 'beginning' | 'latest' | 'timestamp';
  readonly startTimestamp?: string;
  readonly maxConcurrency?: number;
  readonly autoAck?: boolean;
}

export interface TopicOptions {
  readonly partitions?: number;
  readonly replicationFactor?: number;
  readonly retentionMs?: number;
}

// ============================================================================
// CACHE PORT
// ============================================================================

/**
 * Cache port for caching
 */
export interface CachePort {
  readonly portName: 'cache';
  readonly portType: 'outbound';

  get<T>(key: string): Promise<T | null>;
  getMany<T>(keys: string[]): Promise<Map<string, T>>;

  set<T>(key: string, value: T, options?: CacheSetOptions): Promise<void>;
  setMany<T>(entries: { key: string; value: T }[], options?: CacheSetOptions): Promise<void>;

  delete(key: string): Promise<boolean>;
  deleteMany(keys: string[]): Promise<number>;
  deleteByPattern(pattern: string): Promise<number>;

  exists(key: string): Promise<boolean>;
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;

  increment(key: string, delta?: number): Promise<number>;
  decrement(key: string, delta?: number): Promise<number>;
}

export interface CacheSetOptions {
  readonly ttl?: number;
  readonly nx?: boolean; // Only set if not exists
  readonly xx?: boolean; // Only set if exists
}

// ============================================================================
// EXTERNAL SERVICE PORT
// ============================================================================

/**
 * Generic external service port
 */
export interface ExternalServicePort<TRequest, TResponse> {
  readonly portName: string;
  readonly portType: 'outbound';
  readonly serviceName: string;
  readonly serviceVersion: string;

  call(request: TRequest): Promise<Result<TResponse, ExternalServiceError>>;
  healthCheck(): Promise<ServiceHealthStatus>;
}

export interface ExternalServiceError {
  readonly code: string;
  readonly message: string;
  readonly serviceName: string;
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
}

export interface ServiceHealthStatus {
  readonly healthy: boolean;
  readonly serviceName: string;
  readonly latencyMs: number;
  readonly lastCheckedAt: string;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// NOTIFICATION PORT
// ============================================================================

/**
 * Notification port for sending notifications
 */
export interface NotificationPort {
  readonly portName: 'notification';
  readonly portType: 'outbound';

  send(notification: Notification): Promise<NotificationResult>;
  sendBatch(notifications: Notification[]): Promise<NotificationResult[]>;
  getStatus(notificationId: string): Promise<NotificationStatus>;
}

export interface Notification {
  readonly id?: string;
  readonly channel: NotificationChannel;
  readonly recipient: NotificationRecipient;
  readonly template: string;
  readonly data: Record<string, unknown>;
  readonly priority: 'low' | 'normal' | 'high' | 'urgent';
  readonly scheduledFor?: string;
  readonly metadata?: Record<string, unknown>;
}

export type NotificationChannel = 'email' | 'sms' | 'push' | 'whatsapp' | 'slack' | 'webhook';

export interface NotificationRecipient {
  readonly type: 'user' | 'email' | 'phone' | 'deviceToken' | 'webhook';
  readonly value: string;
  readonly name?: string;
}

export interface NotificationResult {
  readonly notificationId: string;
  readonly success: boolean;
  readonly channel: NotificationChannel;
  readonly sentAt?: string;
  readonly error?: string;
}

export interface NotificationStatus {
  readonly notificationId: string;
  readonly status: 'pending' | 'sent' | 'delivered' | 'failed' | 'bounced';
  readonly channel: NotificationChannel;
  readonly sentAt?: string;
  readonly deliveredAt?: string;
  readonly failedAt?: string;
  readonly error?: string;
}

// ============================================================================
// FILE STORAGE PORT
// ============================================================================

/**
 * File storage port for file operations
 */
export interface FileStoragePort {
  readonly portName: 'file-storage';
  readonly portType: 'outbound';

  upload(file: FileUploadRequest): Promise<FileUploadResult>;
  download(fileId: string): Promise<FileDownloadResult>;
  delete(fileId: string): Promise<void>;
  getMetadata(fileId: string): Promise<FileMetadata>;
  getSignedUrl(fileId: string, options?: SignedUrlOptions): Promise<string>;
  listFiles(path: string, options?: ListFilesOptions): Promise<FileListResult>;
}

export interface FileUploadRequest {
  readonly filename: string;
  readonly content: Buffer | ReadableStream;
  readonly contentType: string;
  readonly path?: string;
  readonly metadata?: Record<string, string>;
  readonly acl?: 'private' | 'public-read';
}

export interface FileUploadResult {
  readonly fileId: string;
  readonly url: string;
  readonly size: number;
  readonly contentType: string;
  readonly uploadedAt: string;
}

export interface FileDownloadResult {
  readonly content: Buffer | ReadableStream;
  readonly contentType: string;
  readonly size: number;
  readonly filename: string;
}

export interface FileMetadata {
  readonly fileId: string;
  readonly filename: string;
  readonly contentType: string;
  readonly size: number;
  readonly path: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata: Record<string, string>;
}

export interface SignedUrlOptions {
  readonly expiresIn?: number;
  readonly contentType?: string;
  readonly contentDisposition?: string;
}

export interface ListFilesOptions {
  readonly prefix?: string;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface FileListResult {
  readonly files: FileMetadata[];
  readonly nextCursor?: string;
  readonly hasMore: boolean;
}

// ============================================================================
// AUDIT PORT
// ============================================================================

/**
 * Audit port for compliance and auditing
 */
export interface AuditPort {
  readonly portName: 'audit';
  readonly portType: 'outbound';

  log(entry: AuditEntry): Promise<void>;
  logBatch(entries: AuditEntry[]): Promise<void>;
  query(criteria: AuditQueryCriteria): Promise<AuditQueryResult>;
  getByEntityId(entityType: string, entityId: string): Promise<AuditEntry[]>;
}

export interface AuditQueryCriteria {
  readonly entityType?: string;
  readonly entityId?: string;
  readonly userId?: string;
  readonly action?: string;
  readonly fromTimestamp?: string;
  readonly toTimestamp?: string;
  readonly limit?: number;
  readonly offset?: number;
}

export interface AuditQueryResult {
  readonly entries: AuditEntry[];
  readonly total: number;
  readonly hasMore: boolean;
}

// ============================================================================
// ENCRYPTION PORT
// ============================================================================

/**
 * Encryption port for data encryption
 */
export interface EncryptionPort {
  readonly portName: 'encryption';
  readonly portType: 'outbound';

  encrypt(data: Buffer | string, keyId?: string): Promise<EncryptedData>;
  decrypt(encrypted: EncryptedData): Promise<Buffer>;

  hash(data: string, algorithm?: HashAlgorithm): Promise<string>;
  verify(data: string, hash: string, algorithm?: HashAlgorithm): Promise<boolean>;

  generateKey(options?: KeyGenerationOptions): Promise<CryptoKey>;
  rotateKey(keyId: string): Promise<CryptoKey>;
}

export interface EncryptedData {
  readonly ciphertext: string;
  readonly iv: string;
  readonly keyId: string;
  readonly algorithm: string;
  readonly encryptedAt: string;
}

export type HashAlgorithm = 'sha256' | 'sha384' | 'sha512' | 'bcrypt' | 'argon2';

export interface KeyGenerationOptions {
  readonly algorithm?: 'aes-256-gcm' | 'rsa-oaep';
  readonly keySize?: number;
  readonly expiresAt?: string;
}

export interface CryptoKey {
  readonly keyId: string;
  readonly algorithm: string;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly rotatedFrom?: string;
}

// ============================================================================
// OUTBOUND PORT TYPE MAP
// ============================================================================

/**
 * Type map of all outbound ports
 */
export interface OutboundPortMap {
  'event-store': EventStorePort;
  'message-broker': MessageBrokerPort;
  cache: CachePort;
  notification: NotificationPort;
  'file-storage': FileStoragePort;
  audit: AuditPort;
  encryption: EncryptionPort;
}

export type OutboundPortName = keyof OutboundPortMap;
export type AnyOutboundPort = OutboundPortMap[OutboundPortName];
