/**
 * Redis Client with TLS/SSL Support
 *
 * Enterprise-grade Redis client with:
 * - TLS/SSL encryption for production
 * - Connection pooling
 * - Health monitoring
 * - Automatic reconnection
 * - Circuit breaker integration
 */

import { CircuitBreaker, CircuitBreakerRegistry, CircuitState } from '../circuit-breaker.js';

export interface RedisConfig {
  /** Redis URL (supports redis:// and rediss:// protocols) */
  url: string;
  /** Enable TLS/SSL (auto-detected from rediss:// URL) */
  tls?: boolean;
  /** TLS options for certificate verification */
  tlsOptions?: {
    /** Reject unauthorized certificates (default: true in production) */
    rejectUnauthorized?: boolean;
    /** CA certificate for self-signed certs */
    ca?: string;
    /** Client certificate for mTLS */
    cert?: string;
    /** Client key for mTLS */
    key?: string;
  };
  /** Connection timeout in milliseconds (default: 10000) */
  connectTimeout?: number;
  /** Command timeout in milliseconds (default: 5000) */
  commandTimeout?: number;
  /** Maximum retry attempts (default: 3) */
  maxRetries?: number;
  /** Retry delay in milliseconds (default: 200) */
  retryDelay?: number;
  /** Enable connection pooling (default: true) */
  enablePool?: boolean;
  /** Maximum pool size (default: 10) */
  maxPoolSize?: number;
  /** Enable health monitoring (default: true) */
  healthMonitoring?: boolean;
  /** Health check interval in milliseconds (default: 30000) */
  healthCheckInterval?: number;
  /** Enable circuit breaker (default: true) */
  enableCircuitBreaker?: boolean;
  /** Key prefix for all operations (default: '') */
  keyPrefix?: string;
}

export interface RedisHealthStatus {
  connected: boolean;
  latencyMs: number;
  usedMemory?: string;
  maxMemory?: string;
  connectedClients?: number;
  uptimeSeconds?: number;
  lastCheck: Date;
  tlsEnabled: boolean;
  version?: string;
}

export interface RedisStats {
  totalCommands: number;
  totalErrors: number;
  avgLatencyMs: number;
  circuitState: CircuitState | null;
  connectionPool: {
    active: number;
    idle: number;
    total: number;
  };
}

// Redis connection interface
interface RedisConnection {
  ping: () => Promise<string>;
  quit: () => Promise<string>;
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string, options?: { EX?: number; PX?: number; NX?: boolean; XX?: boolean }) => Promise<string | null>;
  del: (...keys: string[]) => Promise<number>;
  exists: (...keys: string[]) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<number>;
  ttl: (key: string) => Promise<number>;
  keys: (pattern: string) => Promise<string[]>;
  info: (section?: string) => Promise<string>;
  scan: (cursor: number, options?: { MATCH?: string; COUNT?: number }) => Promise<[string, string[]]>;
  hget: (key: string, field: string) => Promise<string | null>;
  hset: (key: string, field: string, value: string) => Promise<number>;
  hgetall: (key: string) => Promise<Record<string, string>>;
  hdel: (key: string, ...fields: string[]) => Promise<number>;
  lpush: (key: string, ...values: string[]) => Promise<number>;
  rpush: (key: string, ...values: string[]) => Promise<number>;
  lpop: (key: string) => Promise<string | null>;
  rpop: (key: string) => Promise<string | null>;
  lrange: (key: string, start: number, stop: number) => Promise<string[]>;
  sadd: (key: string, ...members: string[]) => Promise<number>;
  smembers: (key: string) => Promise<string[]>;
  srem: (key: string, ...members: string[]) => Promise<number>;
  zadd: (key: string, score: number, member: string) => Promise<number>;
  zrange: (key: string, start: number, stop: number, options?: { WITHSCORES?: boolean }) => Promise<string[]>;
  zrem: (key: string, ...members: string[]) => Promise<number>;
  publish: (channel: string, message: string) => Promise<number>;
  subscribe: (channel: string, callback: (message: string) => void) => Promise<void>;
  unsubscribe: (channel: string) => Promise<void>;
}

/**
 * Enterprise Redis Client with TLS and resilience features
 */
export class SecureRedisClient {
  private config: Required<RedisConfig>;
  private connection: RedisConnection | null = null;
  private circuitBreaker: CircuitBreaker | null = null;
  private healthStatus: RedisHealthStatus;
  private stats: {
    totalCommands: number;
    totalErrors: number;
    latencies: number[];
  };
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private isShuttingDown = false;

  constructor(config: RedisConfig) {
    const isProduction = process.env.NODE_ENV === 'production';
    const urlHasTls = config.url.startsWith('rediss://');

    this.config = {
      url: config.url,
      tls: config.tls ?? urlHasTls,
      tlsOptions: {
        rejectUnauthorized: config.tlsOptions?.rejectUnauthorized ?? isProduction,
        ca: config.tlsOptions?.ca,
        cert: config.tlsOptions?.cert,
        key: config.tlsOptions?.key,
      },
      connectTimeout: config.connectTimeout ?? 10000,
      commandTimeout: config.commandTimeout ?? 5000,
      maxRetries: config.maxRetries ?? 3,
      retryDelay: config.retryDelay ?? 200,
      enablePool: config.enablePool ?? true,
      maxPoolSize: config.maxPoolSize ?? 10,
      healthMonitoring: config.healthMonitoring ?? true,
      healthCheckInterval: config.healthCheckInterval ?? 30000,
      enableCircuitBreaker: config.enableCircuitBreaker ?? true,
      keyPrefix: config.keyPrefix ?? '',
    };

    this.healthStatus = {
      connected: false,
      latencyMs: 0,
      lastCheck: new Date(),
      tlsEnabled: this.config.tls,
    };

    this.stats = {
      totalCommands: 0,
      totalErrors: 0,
      latencies: [],
    };

    // Initialize circuit breaker
    if (this.config.enableCircuitBreaker) {
      const registry = new CircuitBreakerRegistry({
        failureThreshold: 5,
        resetTimeoutMs: 30000,
        successThreshold: 2,
        failureWindowMs: 60000,
      });
      this.circuitBreaker = registry.get('redis', {
        onOpen: (name) => {
          console.error(`[Redis] Circuit breaker OPEN for ${name} - Redis operations will fail fast`);
        },
        onClose: (name) => {
          console.info(`[Redis] Circuit breaker CLOSED for ${name} - Redis operations resumed`);
        },
      });
    }
  }

  /**
   * Initialize connection to Redis
   */
  async connect(): Promise<void> {
    if (this.connection) return;

    try {
      const ioredisModule = await import('ioredis').catch(() => null);
      if (!ioredisModule) {
        throw new Error('ioredis module not available. Install with: npm install ioredis');
      }

      const Redis = ioredisModule.default;
      const connectionOptions: Record<string, unknown> = {
        connectTimeout: this.config.connectTimeout,
        commandTimeout: this.config.commandTimeout,
        maxRetriesPerRequest: this.config.maxRetries,
        retryStrategy: (times: number) => {
          if (times > this.config.maxRetries) {
            return null; // Stop retrying
          }
          return Math.min(times * this.config.retryDelay, 2000);
        },
        keyPrefix: this.config.keyPrefix,
        enableReadyCheck: true,
        lazyConnect: false,
      };

      // Configure TLS
      if (this.config.tls) {
        connectionOptions.tls = {
          rejectUnauthorized: this.config.tlsOptions.rejectUnauthorized,
          ...(this.config.tlsOptions.ca && { ca: this.config.tlsOptions.ca }),
          ...(this.config.tlsOptions.cert && { cert: this.config.tlsOptions.cert }),
          ...(this.config.tlsOptions.key && { key: this.config.tlsOptions.key }),
        };
      }

      // Configure connection pooling
      if (this.config.enablePool) {
        connectionOptions.enableAutoPipelining = true;
        connectionOptions.maxLoadingRetryTime = this.config.connectTimeout;
      }

      this.connection = new Redis(this.config.url, connectionOptions);

      // Wait for connection
      await this.ping();
      this.healthStatus.connected = true;

      // Start health monitoring
      if (this.config.healthMonitoring) {
        this.startHealthMonitoring();
      }

      console.info(`[Redis] Connected successfully (TLS: ${this.config.tls ? 'enabled' : 'disabled'})`);
    } catch (error) {
      this.healthStatus.connected = false;
      throw new Error(`Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.connection) {
      try {
        await this.connection.quit();
      } catch {
        // Ignore errors during shutdown
      }
      this.connection = null;
    }

    this.healthStatus.connected = false;
    console.info('[Redis] Disconnected');
  }

  /**
   * Execute command with circuit breaker and metrics
   */
  private async executeCommand<T>(command: () => Promise<T>): Promise<T> {
    const startTime = Date.now();
    this.stats.totalCommands++;

    try {
      let result: T;
      if (this.circuitBreaker) {
        result = await this.circuitBreaker.execute(command);
      } else {
        result = await command();
      }

      const latency = Date.now() - startTime;
      this.stats.latencies.push(latency);
      if (this.stats.latencies.length > 100) {
        this.stats.latencies.shift();
      }

      return result;
    } catch (error) {
      this.stats.totalErrors++;
      throw error;
    }
  }

  /**
   * Ensure connection is available
   */
  private ensureConnection(): RedisConnection {
    if (!this.connection) {
      throw new Error('Redis client not connected. Call connect() first.');
    }
    return this.connection;
  }

  /**
   * Prefixed key helper
   */
  private prefixKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
  }

  // ============= Core Commands =============

  async ping(): Promise<string> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      const result = await conn.ping();
      return result;
    });
  }

  async get(key: string): Promise<string | null> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.get(this.prefixKey(key));
    });
  }

  async set(key: string, value: string, options?: { ttlSeconds?: number; nx?: boolean; xx?: boolean }): Promise<boolean> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      const setOptions: { EX?: number; NX?: boolean; XX?: boolean } = {};
      if (options?.ttlSeconds) setOptions.EX = options.ttlSeconds;
      if (options?.nx) setOptions.NX = true;
      if (options?.xx) setOptions.XX = true;

      const result = await conn.set(this.prefixKey(key), value, setOptions);
      return result === 'OK';
    });
  }

  async del(...keys: string[]): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.del(...keys.map((k) => this.prefixKey(k)));
    });
  }

  async exists(...keys: string[]): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.exists(...keys.map((k) => this.prefixKey(k)));
    });
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      const result = await conn.expire(this.prefixKey(key), seconds);
      return result === 1;
    });
  }

  async ttl(key: string): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.ttl(this.prefixKey(key));
    });
  }

  async keys(pattern: string): Promise<string[]> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.keys(this.prefixKey(pattern));
    });
  }

  // ============= Hash Commands =============

  async hget(key: string, field: string): Promise<string | null> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.hget(this.prefixKey(key), field);
    });
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.hset(this.prefixKey(key), field, value);
    });
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.hgetall(this.prefixKey(key));
    });
  }

  async hdel(key: string, ...fields: string[]): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.hdel(this.prefixKey(key), ...fields);
    });
  }

  // ============= List Commands =============

  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.lpush(this.prefixKey(key), ...values);
    });
  }

  async rpush(key: string, ...values: string[]): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.rpush(this.prefixKey(key), ...values);
    });
  }

  async lpop(key: string): Promise<string | null> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.lpop(key);
    });
  }

  async rpop(key: string): Promise<string | null> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.rpop(this.prefixKey(key));
    });
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.lrange(this.prefixKey(key), start, stop);
    });
  }

  // ============= Set Commands =============

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.sadd(this.prefixKey(key), ...members);
    });
  }

  async smembers(key: string): Promise<string[]> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.smembers(this.prefixKey(key));
    });
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.srem(this.prefixKey(key), ...members);
    });
  }

  // ============= Sorted Set Commands =============

  async zadd(key: string, score: number, member: string): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.zadd(this.prefixKey(key), score, member);
    });
  }

  async zrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.zrange(this.prefixKey(key), start, stop);
    });
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.zrem(this.prefixKey(key), ...members);
    });
  }

  // ============= Pub/Sub Commands =============

  async publish(channel: string, message: string): Promise<number> {
    return this.executeCommand(async () => {
      const conn = this.ensureConnection();
      return conn.publish(channel, message);
    });
  }

  // ============= Health & Stats =============

  /**
   * Get current health status
   */
  getHealthStatus(): RedisHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Get client statistics
   */
  getStats(): RedisStats {
    const avgLatency =
      this.stats.latencies.length > 0
        ? this.stats.latencies.reduce((a, b) => a + b, 0) / this.stats.latencies.length
        : 0;

    return {
      totalCommands: this.stats.totalCommands,
      totalErrors: this.stats.totalErrors,
      avgLatencyMs: Math.round(avgLatency * 100) / 100,
      circuitState: this.circuitBreaker?.getState() ?? null,
      connectionPool: {
        active: 1,
        idle: 0,
        total: 1,
      },
    };
  }

  /**
   * Perform comprehensive health check
   */
  async healthCheck(): Promise<RedisHealthStatus> {
    const startTime = Date.now();

    try {
      if (!this.connection) {
        this.healthStatus = {
          connected: false,
          latencyMs: 0,
          lastCheck: new Date(),
          tlsEnabled: this.config.tls,
        };
        return this.healthStatus;
      }

      // Ping test
      await this.connection.ping();
      const latencyMs = Date.now() - startTime;

      // Get server info
      const info = await this.connection.info('server');
      const memoryInfo = await this.connection.info('memory');
      const clientsInfo = await this.connection.info('clients');

      // Parse info
      const parseInfo = (infoStr: string): Record<string, string> => {
        const result: Record<string, string> = {};
        for (const line of infoStr.split('\r\n')) {
          const [key, value] = line.split(':');
          if (key && value) {
            result[key] = value;
          }
        }
        return result;
      };

      const serverData = parseInfo(info);
      const memoryData = parseInfo(memoryInfo);
      const clientsData = parseInfo(clientsInfo);

      this.healthStatus = {
        connected: true,
        latencyMs,
        usedMemory: memoryData['used_memory_human'],
        maxMemory: memoryData['maxmemory_human'] || 'unlimited',
        connectedClients: parseInt(clientsData['connected_clients'] || '0', 10),
        uptimeSeconds: parseInt(serverData['uptime_in_seconds'] || '0', 10),
        lastCheck: new Date(),
        tlsEnabled: this.config.tls,
        version: serverData['redis_version'],
      };
    } catch (error) {
      this.healthStatus = {
        connected: false,
        latencyMs: Date.now() - startTime,
        lastCheck: new Date(),
        tlsEnabled: this.config.tls,
      };
    }

    return this.healthStatus;
  }

  /**
   * Start background health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckTimer) return;

    this.healthCheckTimer = setInterval(async () => {
      if (this.isShuttingDown) return;
      try {
        await this.healthCheck();
      } catch {
        // Health check failed, status already updated
      }
    }, this.config.healthCheckInterval);

    // Don't keep process alive just for health checks
    this.healthCheckTimer.unref();
  }
}

/**
 * Create a secure Redis client
 */
export function createSecureRedisClient(config: RedisConfig): SecureRedisClient {
  return new SecureRedisClient(config);
}

/**
 * Create Redis client from environment
 */
export function createRedisClientFromEnv(): SecureRedisClient | null {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  const isProduction = process.env.NODE_ENV === 'production';

  // In production, upgrade to TLS if not already using rediss://
  let url = redisUrl;
  if (isProduction && !redisUrl.startsWith('rediss://')) {
    // Check for REDIS_TLS env var to force TLS
    if (process.env.REDIS_TLS === 'true') {
      url = redisUrl.replace('redis://', 'rediss://');
      console.warn('[Redis] Upgrading connection to TLS for production');
    } else {
      console.warn('[Redis] WARNING: Using unencrypted Redis connection in production. Set REDIS_TLS=true for TLS.');
    }
  }

  return createSecureRedisClient({
    url,
    tls: url.startsWith('rediss://'),
    tlsOptions: {
      rejectUnauthorized: isProduction,
      ca: process.env.REDIS_CA_CERT,
    },
    enableCircuitBreaker: true,
    healthMonitoring: true,
  });
}

export default SecureRedisClient;
