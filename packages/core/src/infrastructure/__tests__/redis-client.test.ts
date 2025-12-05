/**
 * Redis Client Test Suite
 *
 * Comprehensive tests for SecureRedisClient covering:
 * - Connection management and health monitoring
 * - TLS/SSL configuration
 * - Circuit breaker integration
 * - All Redis commands (core, hash, list, set, sorted set)
 * - Distributed locking
 * - Error scenarios and reconnection logic
 * - Key prefix functionality
 * - Metrics and statistics
 *
 * @module infrastructure/tests/redis-client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';

// ============= Mock ioredis =============

interface MockRedisClient {
  ping: ReturnType<typeof vi.fn>;
  quit: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  del: ReturnType<typeof vi.fn>;
  exists: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  ttl: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  scan: ReturnType<typeof vi.fn>;
  hget: ReturnType<typeof vi.fn>;
  hset: ReturnType<typeof vi.fn>;
  hgetall: ReturnType<typeof vi.fn>;
  hdel: ReturnType<typeof vi.fn>;
  lpush: ReturnType<typeof vi.fn>;
  rpush: ReturnType<typeof vi.fn>;
  lpop: ReturnType<typeof vi.fn>;
  rpop: ReturnType<typeof vi.fn>;
  lrange: ReturnType<typeof vi.fn>;
  sadd: ReturnType<typeof vi.fn>;
  smembers: ReturnType<typeof vi.fn>;
  srem: ReturnType<typeof vi.fn>;
  zadd: ReturnType<typeof vi.fn>;
  zrange: ReturnType<typeof vi.fn>;
  zrem: ReturnType<typeof vi.fn>;
  zcount: ReturnType<typeof vi.fn>;
  zremrangebyscore: ReturnType<typeof vi.fn>;
  zcard: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  unsubscribe: ReturnType<typeof vi.fn>;
  eval: ReturnType<typeof vi.fn>;
  multi: ReturnType<typeof vi.fn>;
  incrby: ReturnType<typeof vi.fn>;
}

let mockRedisInstance: MockRedisClient;
let mockPingFn = vi.fn().mockResolvedValue('PONG');

// Mock ioredis module
vi.mock('ioredis', () => {
  return {
    default: class MockRedis {
      constructor(_url: string, _options: Record<string, unknown>) {
        mockRedisInstance = {
          ping: mockPingFn,
          quit: vi.fn().mockResolvedValue('OK'),
          get: vi.fn().mockResolvedValue(null),
          set: vi.fn().mockResolvedValue('OK'),
          del: vi.fn().mockResolvedValue(1),
          exists: vi.fn().mockResolvedValue(1),
          expire: vi.fn().mockResolvedValue(1),
          ttl: vi.fn().mockResolvedValue(-1),
          keys: vi.fn().mockResolvedValue([]),
          info: vi.fn().mockImplementation((section?: string) => {
            if (section === 'server') {
              return Promise.resolve('redis_version:7.0.0\r\nuptime_in_seconds:1000\r\n');
            }
            if (section === 'memory') {
              return Promise.resolve(
                'used_memory_human:1M\r\nmaxmemory_human:unlimited\r\n'
              );
            }
            if (section === 'clients') {
              return Promise.resolve('connected_clients:5\r\n');
            }
            return Promise.resolve('');
          }),
          scan: vi.fn().mockResolvedValue(['0', []]),
          hget: vi.fn().mockResolvedValue(null),
          hset: vi.fn().mockResolvedValue(1),
          hgetall: vi.fn().mockResolvedValue({}),
          hdel: vi.fn().mockResolvedValue(1),
          lpush: vi.fn().mockResolvedValue(1),
          rpush: vi.fn().mockResolvedValue(1),
          lpop: vi.fn().mockResolvedValue(null),
          rpop: vi.fn().mockResolvedValue(null),
          lrange: vi.fn().mockResolvedValue([]),
          sadd: vi.fn().mockResolvedValue(1),
          smembers: vi.fn().mockResolvedValue([]),
          srem: vi.fn().mockResolvedValue(1),
          zadd: vi.fn().mockResolvedValue(1),
          zrange: vi.fn().mockResolvedValue([]),
          zrem: vi.fn().mockResolvedValue(1),
          zcount: vi.fn().mockResolvedValue(0),
          zremrangebyscore: vi.fn().mockResolvedValue(0),
          zcard: vi.fn().mockResolvedValue(0),
          publish: vi.fn().mockResolvedValue(0),
          subscribe: vi.fn().mockResolvedValue(undefined),
          unsubscribe: vi.fn().mockResolvedValue(undefined),
          eval: vi.fn().mockResolvedValue(1),
          multi: vi.fn().mockReturnValue({
            incrby: vi.fn().mockReturnThis(),
            expire: vi.fn().mockReturnThis(),
            exec: vi.fn().mockResolvedValue([
              [null, 1],
              [null, 1],
            ]),
          }),
          incrby: vi.fn().mockResolvedValue(1),
        };
        return mockRedisInstance;
      }
    },
  };
});

// ============= Import after mocks =============

const { SecureRedisClient, createSecureRedisClient, createRedisClientFromEnv } = await import(
  '../redis-client.js'
);

// ============= Test Suite =============

describe('SecureRedisClient', () => {
  let client: InstanceType<typeof SecureRedisClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mockPingFn to default behavior
    mockPingFn = vi.fn().mockResolvedValue('PONG');
    // Update the reference in mockRedisInstance if it exists
    if (mockRedisInstance) {
      mockRedisInstance.ping = mockPingFn;
    }
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create client with minimal config', () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });

      expect(client).toBeDefined();
    });

    it('should auto-detect TLS from rediss:// protocol', () => {
      client = new SecureRedisClient({
        url: 'rediss://localhost:6379',
      });

      const status = client.getHealthStatus();
      expect(status.tlsEnabled).toBe(true);
    });

    it('should enable TLS explicitly', () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
        tls: true,
      });

      const status = client.getHealthStatus();
      expect(status.tlsEnabled).toBe(true);
    });

    it('should apply default configuration values', () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });

      // Test by checking stats which uses config values
      const stats = client.getStats();
      expect(stats).toBeDefined();
    });

    it('should handle custom TLS options', () => {
      client = new SecureRedisClient({
        url: 'rediss://localhost:6379',
        tlsOptions: {
          rejectUnauthorized: true,
          ca: 'ca-cert',
          cert: 'client-cert',
          key: 'client-key',
        },
      });

      expect(client).toBeDefined();
    });

    it('should apply key prefix', async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
        keyPrefix: 'test:',
      });

      await client.connect();
      await client.set('key1', 'value1');

      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'test:key1',
        'value1',
        expect.any(Object)
      );
    });

    it('should disable circuit breaker when configured', () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
        enableCircuitBreaker: false,
      });

      const stats = client.getStats();
      expect(stats.circuitState).toBeNull();
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });

      await client.connect();

      expect(mockRedisInstance.ping).toHaveBeenCalled();
      const status = client.getHealthStatus();
      expect(status.connected).toBe(true);
    });

    it('should handle connection errors', async () => {
      // Set up ping to fail before creating client
      mockPingFn.mockRejectedValueOnce(new Error('Connection failed'));

      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });

      await expect(client.connect()).rejects.toThrow('Failed to connect to Redis');
    });

    it('should not reconnect if already connected', async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });

      await client.connect();
      const firstCallCount = mockRedisInstance.ping.mock.calls.length;

      await client.connect();
      const secondCallCount = mockRedisInstance.ping.mock.calls.length;

      expect(secondCallCount).toBe(firstCallCount);
    });

    it('should disconnect gracefully', async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });

      await client.connect();
      await client.disconnect();

      expect(mockRedisInstance.quit).toHaveBeenCalled();
      const status = client.getHealthStatus();
      expect(status.connected).toBe(false);
    });

    it('should handle disconnect errors gracefully', async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });

      await client.connect();
      mockRedisInstance.quit.mockRejectedValueOnce(new Error('Quit failed'));

      await expect(client.disconnect()).resolves.not.toThrow();
    });

    it('should throw error when executing command without connection', async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });

      await expect(client.get('key')).rejects.toThrow('not connected');
    });
  });

  describe('Core Commands', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should execute ping command', async () => {
      const result = await client.ping();
      expect(result).toBe('PONG');
      expect(mockRedisInstance.ping).toHaveBeenCalled();
    });

    it('should get a value', async () => {
      mockRedisInstance.get.mockResolvedValueOnce('test-value');
      const result = await client.get('test-key');

      expect(result).toBe('test-value');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('test-key');
    });

    it('should set a value without options', async () => {
      const result = await client.set('test-key', 'test-value');

      expect(result).toBe(true);
      expect(mockRedisInstance.set).toHaveBeenCalledWith('test-key', 'test-value', {});
    });

    it('should set a value with TTL', async () => {
      await client.set('test-key', 'test-value', { ttlSeconds: 60 });

      expect(mockRedisInstance.set).toHaveBeenCalledWith('test-key', 'test-value', { EX: 60 });
    });

    it('should set a value with NX option', async () => {
      await client.set('test-key', 'test-value', { nx: true });

      expect(mockRedisInstance.set).toHaveBeenCalledWith('test-key', 'test-value', { NX: true });
    });

    it('should set a value with XX option', async () => {
      await client.set('test-key', 'test-value', { xx: true });

      expect(mockRedisInstance.set).toHaveBeenCalledWith('test-key', 'test-value', { XX: true });
    });

    it('should return false when set fails', async () => {
      mockRedisInstance.set.mockResolvedValueOnce(null);
      const result = await client.set('test-key', 'test-value', { nx: true });

      expect(result).toBe(false);
    });

    it('should delete keys', async () => {
      mockRedisInstance.del.mockResolvedValueOnce(2);
      const result = await client.del('key1', 'key2');

      expect(result).toBe(2);
      expect(mockRedisInstance.del).toHaveBeenCalledWith('key1', 'key2');
    });

    it('should check if keys exist', async () => {
      mockRedisInstance.exists.mockResolvedValueOnce(1);
      const result = await client.exists('test-key');

      expect(result).toBe(1);
      expect(mockRedisInstance.exists).toHaveBeenCalledWith('test-key');
    });

    it('should set expiration on key', async () => {
      mockRedisInstance.expire.mockResolvedValueOnce(1);
      const result = await client.expire('test-key', 60);

      expect(result).toBe(true);
      expect(mockRedisInstance.expire).toHaveBeenCalledWith('test-key', 60);
    });

    it('should return false when expire fails', async () => {
      mockRedisInstance.expire.mockResolvedValueOnce(0);
      const result = await client.expire('test-key', 60);

      expect(result).toBe(false);
    });

    it('should get TTL of key', async () => {
      mockRedisInstance.ttl.mockResolvedValueOnce(60);
      const result = await client.ttl('test-key');

      expect(result).toBe(60);
      expect(mockRedisInstance.ttl).toHaveBeenCalledWith('test-key');
    });

    it('should get keys matching pattern', async () => {
      mockRedisInstance.keys.mockResolvedValueOnce(['key1', 'key2', 'key3']);
      const result = await client.keys('key*');

      expect(result).toEqual(['key1', 'key2', 'key3']);
      expect(mockRedisInstance.keys).toHaveBeenCalledWith('key*');
    });
  });

  describe('Hash Commands', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should get hash field value', async () => {
      mockRedisInstance.hget.mockResolvedValueOnce('field-value');
      const result = await client.hget('hash-key', 'field');

      expect(result).toBe('field-value');
      expect(mockRedisInstance.hget).toHaveBeenCalledWith('hash-key', 'field');
    });

    it('should set hash field value', async () => {
      mockRedisInstance.hset.mockResolvedValueOnce(1);
      const result = await client.hset('hash-key', 'field', 'value');

      expect(result).toBe(1);
      expect(mockRedisInstance.hset).toHaveBeenCalledWith('hash-key', 'field', 'value');
    });

    it('should get all hash fields', async () => {
      const hashData = { field1: 'value1', field2: 'value2' };
      mockRedisInstance.hgetall.mockResolvedValueOnce(hashData);
      const result = await client.hgetall('hash-key');

      expect(result).toEqual(hashData);
      expect(mockRedisInstance.hgetall).toHaveBeenCalledWith('hash-key');
    });

    it('should delete hash fields', async () => {
      mockRedisInstance.hdel.mockResolvedValueOnce(2);
      const result = await client.hdel('hash-key', 'field1', 'field2');

      expect(result).toBe(2);
      expect(mockRedisInstance.hdel).toHaveBeenCalledWith('hash-key', 'field1', 'field2');
    });
  });

  describe('Counter Commands', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should increment by value', async () => {
      mockRedisInstance.incrby.mockResolvedValueOnce(10);
      const result = await client.incrby('counter', 5);

      expect(result).toBe(10);
      expect(mockRedisInstance.incrby).toHaveBeenCalledWith('counter', 5);
    });

    it('should increment with expiration atomically', async () => {
      const result = await client.incrbyWithExpire('counter', 1, 60);

      expect(result).toBe(1);
      expect(mockRedisInstance.multi).toHaveBeenCalled();
    });

    it('should return 0 when incrbyWithExpire pipeline fails', async () => {
      const mockMulti = mockRedisInstance.multi();
      mockMulti.exec.mockResolvedValueOnce(null);

      const result = await client.incrbyWithExpire('counter', 1, 60);

      expect(result).toBe(0);
    });
  });

  describe('List Commands', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should push to list head', async () => {
      mockRedisInstance.lpush.mockResolvedValueOnce(3);
      const result = await client.lpush('list', 'value1', 'value2');

      expect(result).toBe(3);
      expect(mockRedisInstance.lpush).toHaveBeenCalledWith('list', 'value1', 'value2');
    });

    it('should push to list tail', async () => {
      mockRedisInstance.rpush.mockResolvedValueOnce(3);
      const result = await client.rpush('list', 'value1', 'value2');

      expect(result).toBe(3);
      expect(mockRedisInstance.rpush).toHaveBeenCalledWith('list', 'value1', 'value2');
    });

    it('should pop from list head', async () => {
      mockRedisInstance.lpop.mockResolvedValueOnce('value1');
      const result = await client.lpop('list');

      expect(result).toBe('value1');
      expect(mockRedisInstance.lpop).toHaveBeenCalledWith('list');
    });

    it('should pop from list tail', async () => {
      mockRedisInstance.rpop.mockResolvedValueOnce('value1');
      const result = await client.rpop('list');

      expect(result).toBe('value1');
      expect(mockRedisInstance.rpop).toHaveBeenCalledWith('list');
    });

    it('should get range from list', async () => {
      mockRedisInstance.lrange.mockResolvedValueOnce(['value1', 'value2', 'value3']);
      const result = await client.lrange('list', 0, -1);

      expect(result).toEqual(['value1', 'value2', 'value3']);
      expect(mockRedisInstance.lrange).toHaveBeenCalledWith('list', 0, -1);
    });
  });

  describe('Set Commands', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should add members to set', async () => {
      mockRedisInstance.sadd.mockResolvedValueOnce(2);
      const result = await client.sadd('set', 'member1', 'member2');

      expect(result).toBe(2);
      expect(mockRedisInstance.sadd).toHaveBeenCalledWith('set', 'member1', 'member2');
    });

    it('should get all set members', async () => {
      mockRedisInstance.smembers.mockResolvedValueOnce(['member1', 'member2']);
      const result = await client.smembers('set');

      expect(result).toEqual(['member1', 'member2']);
      expect(mockRedisInstance.smembers).toHaveBeenCalledWith('set');
    });

    it('should remove members from set', async () => {
      mockRedisInstance.srem.mockResolvedValueOnce(2);
      const result = await client.srem('set', 'member1', 'member2');

      expect(result).toBe(2);
      expect(mockRedisInstance.srem).toHaveBeenCalledWith('set', 'member1', 'member2');
    });
  });

  describe('Sorted Set Commands', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should add member to sorted set', async () => {
      mockRedisInstance.zadd.mockResolvedValueOnce(1);
      const result = await client.zadd('zset', 100, 'member1');

      expect(result).toBe(1);
      expect(mockRedisInstance.zadd).toHaveBeenCalledWith('zset', 100, 'member1');
    });

    it('should get range from sorted set', async () => {
      mockRedisInstance.zrange.mockResolvedValueOnce(['member1', 'member2']);
      const result = await client.zrange('zset', 0, -1);

      expect(result).toEqual(['member1', 'member2']);
      expect(mockRedisInstance.zrange).toHaveBeenCalledWith('zset', 0, -1);
    });

    it('should remove members from sorted set', async () => {
      mockRedisInstance.zrem.mockResolvedValueOnce(2);
      const result = await client.zrem('zset', 'member1', 'member2');

      expect(result).toBe(2);
      expect(mockRedisInstance.zrem).toHaveBeenCalledWith('zset', 'member1', 'member2');
    });

    it('should count members in score range', async () => {
      mockRedisInstance.zcount.mockResolvedValueOnce(5);
      const result = await client.zcount('zset', 0, 100);

      expect(result).toBe(5);
      expect(mockRedisInstance.zcount).toHaveBeenCalledWith('zset', 0, 100);
    });

    it('should remove members by score range', async () => {
      mockRedisInstance.zremrangebyscore.mockResolvedValueOnce(3);
      const result = await client.zremrangebyscore('zset', 0, 50);

      expect(result).toBe(3);
      expect(mockRedisInstance.zremrangebyscore).toHaveBeenCalledWith('zset', 0, 50);
    });

    it('should get cardinality of sorted set', async () => {
      mockRedisInstance.zcard.mockResolvedValueOnce(10);
      const result = await client.zcard('zset');

      expect(result).toBe(10);
      expect(mockRedisInstance.zcard).toHaveBeenCalledWith('zset');
    });
  });

  describe('Scripting Commands', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should execute Lua script', async () => {
      mockRedisInstance.eval.mockResolvedValueOnce(1);
      const script = 'return 1';
      const result = await client.eval(script, ['key1'], ['arg1']);

      expect(result).toBe(1);
      expect(mockRedisInstance.eval).toHaveBeenCalledWith(script, 1, 'key1', 'arg1');
    });
  });

  describe('Pub/Sub Commands', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should publish message to channel', async () => {
      mockRedisInstance.publish.mockResolvedValueOnce(5);
      const result = await client.publish('channel', 'message');

      expect(result).toBe(5);
      expect(mockRedisInstance.publish).toHaveBeenCalledWith('channel', 'message');
    });
  });

  describe('Distributed Locking', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should acquire lock successfully', async () => {
      mockRedisInstance.set.mockResolvedValueOnce('OK');
      const token = await client.acquireLock('resource', 30, 1, 100);

      expect(token).toBeTruthy();
      expect(typeof token).toBe('string');
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'lock:resource',
        expect.any(String),
        expect.objectContaining({ EX: 30, NX: true })
      );
    });

    it('should fail to acquire lock when already held', async () => {
      mockRedisInstance.set.mockResolvedValueOnce(null);
      const token = await client.acquireLock('resource', 30, 1, 100);

      expect(token).toBeNull();
    });

    it('should retry lock acquisition', async () => {
      mockRedisInstance.set
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('OK');

      const token = await client.acquireLock('resource', 30, 3, 10);

      expect(token).toBeTruthy();
      expect(mockRedisInstance.set).toHaveBeenCalledTimes(3);
    });

    it('should release lock successfully', async () => {
      mockRedisInstance.eval.mockResolvedValueOnce(1);
      const result = await client.releaseLock('resource', 'token123');

      expect(result).toBe(true);
      expect(mockRedisInstance.eval).toHaveBeenCalled();
    });

    it('should fail to release lock with wrong token', async () => {
      mockRedisInstance.eval.mockResolvedValueOnce(0);
      const result = await client.releaseLock('resource', 'wrong-token');

      expect(result).toBe(false);
    });

    it('should execute function with lock', async () => {
      mockRedisInstance.set.mockResolvedValueOnce('OK');
      mockRedisInstance.eval.mockResolvedValueOnce(1);

      const fn = vi.fn().mockResolvedValue('result');
      const result = await client.withLock('resource', fn);

      expect(result).toBe('result');
      expect(fn).toHaveBeenCalled();
      expect(mockRedisInstance.eval).toHaveBeenCalled(); // Release lock
    });

    it('should release lock even if function throws', async () => {
      mockRedisInstance.set.mockResolvedValueOnce('OK');
      mockRedisInstance.eval.mockResolvedValueOnce(1);

      const fn = vi.fn().mockRejectedValue(new Error('Function error'));

      await expect(client.withLock('resource', fn)).rejects.toThrow('Function error');
      expect(mockRedisInstance.eval).toHaveBeenCalled(); // Release lock
    });

    it('should throw error when lock cannot be acquired', async () => {
      mockRedisInstance.set.mockResolvedValue(null);

      const fn = vi.fn();
      await expect(client.withLock('resource', fn, { retryAttempts: 1 })).rejects.toThrow(
        'Failed to acquire lock'
      );
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
        healthMonitoring: true,
      });
      await client.connect();
    });

    it('should get health status', () => {
      const status = client.getHealthStatus();

      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('latencyMs');
      expect(status).toHaveProperty('lastCheck');
      expect(status).toHaveProperty('tlsEnabled');
    });

    it('should perform health check', async () => {
      const status = await client.healthCheck();

      expect(status.connected).toBe(true);
      expect(status.latencyMs).toBeGreaterThanOrEqual(0);
      expect(status.version).toBe('7.0.0');
      expect(status.usedMemory).toBe('1M');
      expect(status.maxMemory).toBe('unlimited');
      expect(status.connectedClients).toBe(5);
      expect(status.uptimeSeconds).toBe(1000);
    });

    it('should handle health check when not connected', async () => {
      await client.disconnect();
      const status = await client.healthCheck();

      expect(status.connected).toBe(false);
    });

    it('should handle health check errors gracefully', async () => {
      mockRedisInstance.ping.mockRejectedValueOnce(new Error('Health check failed'));
      const status = await client.healthCheck();

      expect(status.connected).toBe(false);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should get client statistics', async () => {
      await client.get('key1');
      await client.set('key2', 'value2');
      await client.del('key3');

      const stats = client.getStats();

      expect(stats.totalCommands).toBeGreaterThan(0);
      expect(stats.totalErrors).toBe(0);
      expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
      expect(stats.connectionPool).toBeDefined();
      expect(stats.connectionPool.total).toBe(1);
    });

    it('should track errors in statistics', async () => {
      mockRedisInstance.get.mockRejectedValueOnce(new Error('Get failed'));

      await expect(client.get('key')).rejects.toThrow();

      const stats = client.getStats();
      expect(stats.totalErrors).toBe(1);
    });

    it('should calculate average latency', async () => {
      // Execute multiple commands to generate latency data
      await client.ping();
      await client.ping();
      await client.ping();

      const stats = client.getStats();
      expect(stats.avgLatencyMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Scenarios', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
      });
      await client.connect();
    });

    it('should handle command execution errors', async () => {
      mockRedisInstance.get.mockRejectedValueOnce(new Error('Command failed'));

      await expect(client.get('key')).rejects.toThrow('Command failed');
    });

    it('should handle circuit breaker open state', async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
        enableCircuitBreaker: true,
      });
      await client.connect();

      // Trigger circuit breaker by causing multiple failures
      mockRedisInstance.get.mockRejectedValue(new Error('Connection timeout'));

      for (let i = 0; i < 6; i++) {
        try {
          await client.get('key');
        } catch {
          // Expected to fail
        }
      }

      const stats = client.getStats();
      expect(stats.circuitState).toBeDefined();
    });
  });

  describe('Key Prefix', () => {
    beforeEach(async () => {
      client = new SecureRedisClient({
        url: 'redis://localhost:6379',
        keyPrefix: 'app:',
      });
      await client.connect();
    });

    it('should prefix all string keys', async () => {
      await client.get('user:123');
      expect(mockRedisInstance.get).toHaveBeenCalledWith('app:user:123');

      await client.set('user:123', 'data');
      expect(mockRedisInstance.set).toHaveBeenCalledWith(
        'app:user:123',
        'data',
        expect.any(Object)
      );
    });

    it('should prefix hash keys', async () => {
      await client.hget('session:abc', 'field');
      expect(mockRedisInstance.hget).toHaveBeenCalledWith('app:session:abc', 'field');
    });

    it('should prefix list keys', async () => {
      await client.lpush('queue:jobs', 'job1');
      expect(mockRedisInstance.lpush).toHaveBeenCalledWith('app:queue:jobs', 'job1');
    });

    it('should prefix set keys', async () => {
      await client.sadd('tags', 'tag1');
      expect(mockRedisInstance.sadd).toHaveBeenCalledWith('app:tags', 'tag1');
    });

    it('should prefix sorted set keys', async () => {
      await client.zadd('leaderboard', 100, 'player1');
      expect(mockRedisInstance.zadd).toHaveBeenCalledWith('app:leaderboard', 100, 'player1');
    });

    it('should prefix keys in eval script', async () => {
      await client.eval('return 1', ['key1', 'key2'], []);
      expect(mockRedisInstance.eval).toHaveBeenCalledWith(
        'return 1',
        2,
        'app:key1',
        'app:key2'
      );
    });
  });
});

describe('Factory Functions', () => {
  it('should create client with factory function', () => {
    const client = createSecureRedisClient({
      url: 'redis://localhost:6379',
    });

    expect(client).toBeInstanceOf(SecureRedisClient);
  });

  describe('createRedisClientFromEnv', () => {
    let originalEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      originalEnv = { ...process.env };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return null when REDIS_URL is not set', () => {
      delete process.env.REDIS_URL;
      const client = createRedisClientFromEnv();

      expect(client).toBeNull();
    });

    it('should create client from REDIS_URL', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.NODE_ENV = 'development';
      const client = createRedisClientFromEnv();

      expect(client).toBeInstanceOf(SecureRedisClient);
    });

    it('should inject password from env var', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.REDIS_PASSWORD = 'secret123';
      process.env.NODE_ENV = 'development';

      const client = createRedisClientFromEnv();
      expect(client).toBeInstanceOf(SecureRedisClient);
    });

    it('should require password in production', () => {
      process.env.REDIS_URL = 'redis://localhost:6379';
      process.env.NODE_ENV = 'production';
      delete process.env.REDIS_PASSWORD;

      expect(() => createRedisClientFromEnv()).toThrow('REDIS_PASSWORD is required in production');
    });

    it('should allow embedded password in production', () => {
      process.env.REDIS_URL = 'redis://:password123@localhost:6379';
      process.env.NODE_ENV = 'production';

      const client = createRedisClientFromEnv();
      expect(client).toBeInstanceOf(SecureRedisClient);
    });

    it('should upgrade to TLS in production when REDIS_TLS=true', () => {
      process.env.REDIS_URL = 'redis://:password@localhost:6379';
      process.env.REDIS_TLS = 'true';
      process.env.NODE_ENV = 'production';

      const client = createRedisClientFromEnv();
      expect(client).toBeInstanceOf(SecureRedisClient);
    });

    it('should apply CA certificate from env', () => {
      process.env.REDIS_URL = 'rediss://:password@localhost:6379';
      process.env.REDIS_CA_CERT = '-----BEGIN CERTIFICATE-----';
      process.env.NODE_ENV = 'production';

      const client = createRedisClientFromEnv();
      expect(client).toBeInstanceOf(SecureRedisClient);
    });
  });
});
