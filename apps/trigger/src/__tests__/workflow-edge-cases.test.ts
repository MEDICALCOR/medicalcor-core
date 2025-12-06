import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Workflow Edge Cases and Failure Scenarios
 *
 * Tests critical edge cases not covered by main workflow tests:
 * - Network failures and retries
 * - Timeout handling
 * - Idempotency guarantees
 * - Rate limiting scenarios
 * - Payload validation
 * - Concurrency and race conditions
 */

// Mock environment
vi.stubEnv('HUBSPOT_ACCESS_TOKEN', 'test-token');
vi.stubEnv('WHATSAPP_API_KEY', 'test-key');
vi.stubEnv('OPENAI_API_KEY', 'test-key');

describe('Workflow Retry and Failure Handling', () => {
  describe('Network Failure Recovery', () => {
    it('should retry on transient network errors', async () => {
      let attempts = 0;
      const mockApiCall = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          throw new Error('ECONNRESET');
        }
        return { success: true };
      });

      // Simulate retry logic
      const maxRetries = 3;
      let result;
      let lastError;

      for (let i = 0; i < maxRetries; i++) {
        try {
          result = mockApiCall();
          break;
        } catch (error) {
          lastError = error;
        }
      }

      expect(result).toEqual({ success: true });
      expect(attempts).toBe(3);
    });

    it('should classify retryable vs non-retryable errors', () => {
      function isRetryable(error: Error): boolean {
        const retryablePatterns = [
          'ECONNRESET',
          'ETIMEDOUT',
          'rate limit',
          '429',
          '502',
          '503',
          '504',
          'timeout',
        ];
        return retryablePatterns.some((p) => error.message.toLowerCase().includes(p.toLowerCase()));
      }

      expect(isRetryable(new Error('ECONNRESET'))).toBe(true);
      expect(isRetryable(new Error('Rate limit exceeded'))).toBe(true);
      expect(isRetryable(new Error('502 Bad Gateway'))).toBe(true);
      expect(isRetryable(new Error('Request timeout'))).toBe(true);
      expect(isRetryable(new Error('Invalid input'))).toBe(false);
      expect(isRetryable(new Error('Not found'))).toBe(false);
      expect(isRetryable(new Error('Unauthorized'))).toBe(false);
    });

    it('should implement exponential backoff', async () => {
      function calculateBackoff(attempt: number, baseMs = 1000, maxMs = 30000): number {
        const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
        // Add jitter (±10%)
        const jitter = delay * (0.9 + Math.random() * 0.2);
        return Math.floor(jitter);
      }

      const attempt0 = calculateBackoff(0, 1000, 30000);
      const attempt1 = calculateBackoff(1, 1000, 30000);
      const attempt2 = calculateBackoff(2, 1000, 30000);
      const attempt5 = calculateBackoff(5, 1000, 30000);

      // Each should be roughly double the previous (within jitter)
      expect(attempt0).toBeGreaterThanOrEqual(900);
      expect(attempt0).toBeLessThanOrEqual(1100);
      expect(attempt1).toBeGreaterThanOrEqual(1800);
      expect(attempt1).toBeLessThanOrEqual(2200);
      expect(attempt2).toBeGreaterThanOrEqual(3600);
      expect(attempt2).toBeLessThanOrEqual(4400);
      // Should be capped at maxMs
      expect(attempt5).toBeLessThanOrEqual(33000);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      const timeoutMs = 100;

      async function withTimeout<T>(
        promise: Promise<T>,
        ms: number,
        message = 'Operation timed out'
      ): Promise<T> {
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(message)), ms);
        });
        return Promise.race([promise, timeout]);
      }

      const slowOperation = new Promise((resolve) => setTimeout(resolve, 500));

      await expect(withTimeout(slowOperation, timeoutMs)).rejects.toThrow('timed out');
    });

    it('should complete fast operations before timeout', async () => {
      const timeoutMs = 500;

      async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        const timeout = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), ms);
        });
        return Promise.race([promise, timeout]);
      }

      const fastOperation = Promise.resolve('done');
      const result = await withTimeout(fastOperation, timeoutMs);

      expect(result).toBe('done');
    });
  });

  describe('Idempotency', () => {
    it('should detect duplicate processing using idempotency key', () => {
      const processedKeys = new Set<string>();

      function isDuplicate(idempotencyKey: string): boolean {
        if (processedKeys.has(idempotencyKey)) {
          return true;
        }
        processedKeys.add(idempotencyKey);
        return false;
      }

      expect(isDuplicate('msg-123')).toBe(false);
      expect(isDuplicate('msg-456')).toBe(false);
      expect(isDuplicate('msg-123')).toBe(true); // Duplicate
      expect(isDuplicate('msg-789')).toBe(false);
      expect(isDuplicate('msg-456')).toBe(true); // Duplicate
    });

    it('should generate consistent idempotency key from payload', () => {
      function generateIdempotencyKey(payload: {
        phone: string;
        messageId: string;
        timestamp: string;
      }): string {
        return `${payload.phone}:${payload.messageId}:${payload.timestamp}`;
      }

      const payload = {
        phone: '+40721000001',
        messageId: 'wamid.123',
        timestamp: '2025-01-15T10:00:00Z',
      };

      const key1 = generateIdempotencyKey(payload);
      const key2 = generateIdempotencyKey(payload);

      expect(key1).toBe(key2);
      expect(key1).toBe('+40721000001:wamid.123:2025-01-15T10:00:00Z');
    });

    it('should handle webhook replay attacks', () => {
      const seenWebhooks = new Map<string, number>();
      const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

      function checkReplayAttack(
        signature: string,
        timestamp: number
      ): { isReplay: boolean; reason?: string } {
        const now = Date.now();

        // Check timestamp freshness
        if (now - timestamp > REPLAY_WINDOW_MS) {
          return { isReplay: true, reason: 'Timestamp too old' };
        }

        // Check if we've seen this signature
        if (seenWebhooks.has(signature)) {
          return { isReplay: true, reason: 'Duplicate signature' };
        }

        // Record this signature
        seenWebhooks.set(signature, timestamp);
        return { isReplay: false };
      }

      const now = Date.now();
      const validSignature = 'sig-abc123';
      const oldTimestamp = now - 10 * 60 * 1000; // 10 minutes ago

      expect(checkReplayAttack(validSignature, now).isReplay).toBe(false);
      expect(checkReplayAttack(validSignature, now).isReplay).toBe(true); // Duplicate
      expect(checkReplayAttack('sig-different', now).isReplay).toBe(false);
      expect(checkReplayAttack('sig-old', oldTimestamp).isReplay).toBe(true); // Too old
    });
  });

  describe('Rate Limiting', () => {
    it('should implement token bucket rate limiting', () => {
      class TokenBucket {
        private tokens: number;
        private lastRefill: number;

        constructor(
          private maxTokens: number,
          private refillRatePerSecond: number
        ) {
          this.tokens = maxTokens;
          this.lastRefill = Date.now();
        }

        private refill(): void {
          const now = Date.now();
          const elapsed = (now - this.lastRefill) / 1000;
          this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerSecond);
          this.lastRefill = now;
        }

        tryConsume(tokens = 1): boolean {
          this.refill();
          if (this.tokens >= tokens) {
            this.tokens -= tokens;
            return true;
          }
          return false;
        }

        getTokens(): number {
          this.refill();
          return this.tokens;
        }
      }

      // 10 requests per second max
      const bucket = new TokenBucket(10, 10);

      // Should allow first 10 requests
      for (let i = 0; i < 10; i++) {
        expect(bucket.tryConsume()).toBe(true);
      }

      // 11th should be blocked
      expect(bucket.tryConsume()).toBe(false);
    });

    it('should handle WhatsApp 24-hour messaging window', () => {
      function isWithinMessagingWindow(lastUserMessageTime: Date): boolean {
        const now = new Date();
        const hoursSinceLastMessage =
          (now.getTime() - lastUserMessageTime.getTime()) / (1000 * 60 * 60);
        return hoursSinceLastMessage <= 24;
      }

      // Recent message - within window
      const recentMessage = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
      expect(isWithinMessagingWindow(recentMessage)).toBe(true);

      // Old message - outside window
      const oldMessage = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      expect(isWithinMessagingWindow(oldMessage)).toBe(false);

      // Edge case - exactly 24 hours
      const edgeMessage = new Date(Date.now() - 24 * 60 * 60 * 1000);
      expect(isWithinMessagingWindow(edgeMessage)).toBe(true);
    });
  });

  describe('Payload Validation', () => {
    it('should validate lead scoring payload structure', () => {
      interface LeadScoringPayload {
        phone: string;
        message: string;
        channel: 'whatsapp' | 'voice' | 'web';
        correlationId: string;
        hubspotContactId?: string;
        messageHistory?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
      }

      function validateLeadScoringPayload(payload: unknown): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (!payload || typeof payload !== 'object') {
          return { valid: false, errors: ['Payload must be an object'] };
        }

        const p = payload as Record<string, unknown>;

        if (typeof p.phone !== 'string' || !p.phone.match(/^\+\d{10,15}$/)) {
          errors.push('Invalid phone number format');
        }

        if (typeof p.message !== 'string' || p.message.length === 0) {
          errors.push('Message is required');
        }

        if (!['whatsapp', 'voice', 'web'].includes(p.channel as string)) {
          errors.push('Channel must be whatsapp, voice, or web');
        }

        if (typeof p.correlationId !== 'string') {
          errors.push('Correlation ID is required');
        }

        return { valid: errors.length === 0, errors };
      }

      // Valid payload
      const validPayload = {
        phone: '+40721000001',
        message: 'Hello',
        channel: 'whatsapp',
        correlationId: 'corr-123',
      };
      expect(validateLeadScoringPayload(validPayload).valid).toBe(true);

      // Invalid phone
      const invalidPhone = { ...validPayload, phone: 'invalid' };
      expect(validateLeadScoringPayload(invalidPhone).errors).toContain(
        'Invalid phone number format'
      );

      // Missing channel
      const missingChannel = { phone: '+40721000001', message: 'Hi', correlationId: 'c' };
      expect(validateLeadScoringPayload(missingChannel).errors).toContain(
        'Channel must be whatsapp, voice, or web'
      );
    });

    it('should sanitize XSS in message content', () => {
      function sanitizeHtml(input: string): string {
        return input
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      const xssPayload = '<script>alert("XSS")</script>';
      const sanitized = sanitizeHtml(xssPayload);

      expect(sanitized).not.toContain('<script>');
      expect(sanitized).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
    });

    it('should handle oversized payloads', () => {
      const MAX_MESSAGE_LENGTH = 10000;

      function validateMessageLength(message: string): boolean {
        return message.length <= MAX_MESSAGE_LENGTH;
      }

      expect(validateMessageLength('Short message')).toBe(true);
      expect(validateMessageLength('x'.repeat(10000))).toBe(true);
      expect(validateMessageLength('x'.repeat(10001))).toBe(false);
    });
  });

  describe('Concurrency and Race Conditions', () => {
    it('should handle concurrent scoring requests for same lead', async () => {
      const leadScores = new Map<string, { score: number; version: number }>();

      async function updateLeadScore(
        leadId: string,
        newScore: number
      ): Promise<{ success: boolean; error?: string }> {
        const current = leadScores.get(leadId);
        const currentVersion = current?.version ?? 0;

        // Simulate database update with optimistic locking
        // In reality, this would be an atomic operation
        await new Promise((r) => setTimeout(r, 10)); // Simulate network delay

        const afterDelay = leadScores.get(leadId);
        if (afterDelay && afterDelay.version !== currentVersion) {
          return { success: false, error: 'Optimistic lock failed' };
        }

        leadScores.set(leadId, { score: newScore, version: currentVersion + 1 });
        return { success: true };
      }

      // First update succeeds
      const result1 = await updateLeadScore('lead-123', 5);
      expect(result1.success).toBe(true);

      // Update to get new version
      const result2 = await updateLeadScore('lead-123', 3);
      expect(result2.success).toBe(true);
      expect(leadScores.get('lead-123')?.version).toBe(2);
    });

    it('should implement distributed lock for critical sections', async () => {
      const locks = new Map<string, { holder: string; expiresAt: number }>();

      function acquireLock(key: string, holder: string, ttlMs = 30000): boolean {
        const existing = locks.get(key);
        const now = Date.now();

        // Check if lock exists and is not expired
        if (existing && existing.expiresAt > now) {
          return false;
        }

        // Acquire lock
        locks.set(key, { holder, expiresAt: now + ttlMs });
        return true;
      }

      function releaseLock(key: string, holder: string): boolean {
        const existing = locks.get(key);
        if (existing && existing.holder === holder) {
          locks.delete(key);
          return true;
        }
        return false;
      }

      // Worker 1 acquires lock
      expect(acquireLock('process-lead-123', 'worker-1')).toBe(true);

      // Worker 2 cannot acquire same lock
      expect(acquireLock('process-lead-123', 'worker-2')).toBe(false);

      // Worker 1 releases lock
      expect(releaseLock('process-lead-123', 'worker-1')).toBe(true);

      // Now worker 2 can acquire
      expect(acquireLock('process-lead-123', 'worker-2')).toBe(true);
    });
  });

  describe('Circuit Breaker Pattern', () => {
    it('should open circuit after consecutive failures', () => {
      class CircuitBreaker {
        private failures = 0;
        private lastFailure = 0;
        private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

        constructor(
          private threshold: number,
          private resetTimeoutMs: number
        ) {}

        canExecute(): boolean {
          if (this.state === 'CLOSED') return true;
          if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailure > this.resetTimeoutMs) {
              this.state = 'HALF_OPEN';
              return true;
            }
            return false;
          }
          return true; // HALF_OPEN allows one request
        }

        recordSuccess(): void {
          this.failures = 0;
          this.state = 'CLOSED';
        }

        recordFailure(): void {
          this.failures++;
          this.lastFailure = Date.now();
          if (this.failures >= this.threshold) {
            this.state = 'OPEN';
          }
        }

        getState(): string {
          return this.state;
        }
      }

      const breaker = new CircuitBreaker(3, 5000);

      // Initially closed
      expect(breaker.getState()).toBe('CLOSED');
      expect(breaker.canExecute()).toBe(true);

      // Record failures
      breaker.recordFailure();
      breaker.recordFailure();
      expect(breaker.getState()).toBe('CLOSED');

      breaker.recordFailure(); // 3rd failure opens circuit
      expect(breaker.getState()).toBe('OPEN');
      expect(breaker.canExecute()).toBe(false);
    });
  });

  describe('Dead Letter Queue Handling', () => {
    it('should route failed messages to DLQ after max retries', () => {
      interface Message {
        id: string;
        payload: unknown;
        attempts: number;
        lastError?: string;
      }

      const dlq: Message[] = [];
      const MAX_ATTEMPTS = 3;

      function processWithDLQ(
        message: Message,
        processor: (m: Message) => boolean
      ): { processed: boolean; sentToDLQ: boolean } {
        message.attempts++;

        try {
          if (processor(message)) {
            return { processed: true, sentToDLQ: false };
          }
          throw new Error('Processing failed');
        } catch (error) {
          message.lastError = (error as Error).message;

          if (message.attempts >= MAX_ATTEMPTS) {
            dlq.push(message);
            return { processed: false, sentToDLQ: true };
          }

          return { processed: false, sentToDLQ: false };
        }
      }

      const failingMessage: Message = { id: 'msg-1', payload: {}, attempts: 0 };
      const failingProcessor = () => false;

      // First two attempts - still retryable
      let result = processWithDLQ(failingMessage, failingProcessor);
      expect(result.sentToDLQ).toBe(false);
      expect(failingMessage.attempts).toBe(1);

      result = processWithDLQ(failingMessage, failingProcessor);
      expect(result.sentToDLQ).toBe(false);
      expect(failingMessage.attempts).toBe(2);

      // Third attempt - goes to DLQ
      result = processWithDLQ(failingMessage, failingProcessor);
      expect(result.sentToDLQ).toBe(true);
      expect(dlq.length).toBe(1);
      expect(dlq[0]?.id).toBe('msg-1');
    });
  });

  describe('Graceful Degradation', () => {
    it('should use fallback when primary service fails', async () => {
      interface ScoringResult {
        score: number;
        source: 'ai' | 'rules';
      }

      async function scoreWithFallback(
        message: string,
        aiAvailable: boolean
      ): Promise<ScoringResult> {
        if (aiAvailable) {
          // Primary AI scoring
          return { score: 5, source: 'ai' };
        } else {
          // Fallback rule-based scoring
          const hasUrgency = message.toLowerCase().includes('urgent');
          const hasProcedure = message.toLowerCase().includes('implant');
          const score = 1 + (hasUrgency ? 2 : 0) + (hasProcedure ? 2 : 0);
          return { score: Math.min(score, 5), source: 'rules' };
        }
      }

      // AI available
      const aiResult = await scoreWithFallback('Hello', true);
      expect(aiResult.source).toBe('ai');

      // AI unavailable - fallback
      const fallbackResult = await scoreWithFallback('urgent implant needed', false);
      expect(fallbackResult.source).toBe('rules');
      expect(fallbackResult.score).toBe(5);
    });

    it('should cache results when external services are slow', async () => {
      const cache = new Map<string, { value: number; expiresAt: number }>();
      const CACHE_TTL_MS = 60000;

      async function cachedLookup(
        key: string,
        fetcher: () => Promise<number>
      ): Promise<{ value: number; fromCache: boolean }> {
        const cached = cache.get(key);
        const now = Date.now();

        if (cached && cached.expiresAt > now) {
          return { value: cached.value, fromCache: true };
        }

        const value = await fetcher();
        cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
        return { value, fromCache: false };
      }

      // First call - cache miss
      const result1 = await cachedLookup('key-1', async () => 42);
      expect(result1.fromCache).toBe(false);
      expect(result1.value).toBe(42);

      // Second call - cache hit
      const result2 = await cachedLookup('key-1', async () => 99);
      expect(result2.fromCache).toBe(true);
      expect(result2.value).toBe(42); // Still cached value
    });
  });
});
