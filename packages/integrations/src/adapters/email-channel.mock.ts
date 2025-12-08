/**
 * @fileoverview Mock Email Channel Adapter
 *
 * Mock implementation for testing email notifications without
 * actually sending emails. Supports various testing scenarios.
 *
 * @module integrations/adapters/email-channel.mock
 */

import { ok, err, type Result } from '../lib/index.js';
import type {
  INotificationChannel,
  SendNotificationOptions,
  SendNotificationResult,
  ChannelStats,
  ChannelHealthStatus,
  EmailChannelConfig,
} from './notification-channel.js';

// ============================================
// Types
// ============================================

/**
 * Recorded email for inspection during tests
 */
export interface RecordedEmail {
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  htmlBody?: string;
  priority?: string;
  templateId?: string;
  templateVars?: Record<string, string>;
  attachments?: {
    filename: string;
    contentType: string;
    content: string;
  }[];
  correlationId?: string;
  timestamp: Date;
  messageId: string;
}

/**
 * Mock behavior configuration
 */
export interface MockEmailBehavior {
  /** Whether to simulate success (default: true) */
  shouldSucceed?: boolean;
  /** Delay in milliseconds before responding */
  latencyMs?: number;
  /** Custom error message for failures */
  errorMessage?: string;
  /** Error code for failures */
  errorCode?: string;
  /** Whether error is retryable */
  retryable?: boolean;
  /** Simulate rate limiting after N emails */
  rateLimitAfter?: number;
  /** Custom validator for recipients */
  recipientValidator?: (recipient: string) => boolean;
  /** Simulate network timeout */
  simulateTimeout?: boolean;
}

/**
 * Mock email channel configuration
 */
export interface MockEmailChannelConfig {
  /** Base configuration (optional) */
  config?: Partial<EmailChannelConfig>;
  /** Mock behavior settings */
  behavior?: MockEmailBehavior;
}

// ============================================
// Implementation
// ============================================

/**
 * Mock Email Channel Adapter for Testing
 *
 * Provides a test-friendly email adapter that records all sent
 * emails for inspection and supports various failure scenarios.
 */
export class MockEmailChannelAdapter implements INotificationChannel {
  readonly channelType = 'email' as const;

  private sentEmails: RecordedEmail[] = [];
  private behavior: MockEmailBehavior;
  private config: Partial<EmailChannelConfig>;
  private messageCounter = 0;
  private stats = {
    sent: 0,
    failed: 0,
    totalLatencyMs: 0,
    lastHourTimestamps: [] as number[],
  };

  constructor(options: MockEmailChannelConfig = {}) {
    this.config = options.config ?? {
      provider: 'sendgrid',
      apiKey: 'mock-api-key',
      fromEmail: 'test@medicalcor.com',
      fromName: 'Test Notifications',
    };
    this.behavior = options.behavior ?? { shouldSucceed: true };
  }

  /**
   * Send (mock) email notification
   */
  async send(options: SendNotificationOptions): Promise<Result<SendNotificationResult, Error>> {
    const startTime = Date.now();

    // Simulate latency if configured
    if (this.behavior.latencyMs) {
      await this.delay(this.behavior.latencyMs);
    }

    // Simulate timeout
    if (this.behavior.simulateTimeout) {
      return err(new Error('Request timeout'));
    }

    // Check rate limiting
    if (this.behavior.rateLimitAfter && this.sentEmails.length >= this.behavior.rateLimitAfter) {
      this.stats.failed++;
      return err(new Error('Rate limit exceeded'));
    }

    // Validate recipient if custom validator provided
    if (this.behavior.recipientValidator && !this.behavior.recipientValidator(options.recipient)) {
      this.stats.failed++;
      return err(new Error(`Invalid recipient: ${options.recipient}`));
    }

    // Check if should fail
    if (this.behavior.shouldSucceed === false) {
      this.stats.failed++;
      return err(
        new MockEmailError(
          this.behavior.errorMessage ?? 'Mock email send failed',
          this.behavior.errorCode ?? 'MOCK_ERROR',
          this.behavior.retryable ?? false
        )
      );
    }

    // Record the email
    const messageId = `mock-${++this.messageCounter}-${Date.now()}`;
    const recordedEmail: RecordedEmail = {
      to: options.recipient,
      cc: options.cc,
      bcc: options.bcc,
      subject: options.title ?? 'Notification',
      body: options.body,
      htmlBody: options.htmlBody,
      priority: options.priority,
      templateId: options.templateId,
      templateVars: options.templateVars,
      attachments: options.attachments?.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        content: a.content,
      })),
      correlationId: options.correlationId,
      timestamp: new Date(),
      messageId,
    };

    this.sentEmails.push(recordedEmail);

    const latencyMs = Date.now() - startTime;
    this.stats.sent++;
    this.stats.totalLatencyMs += latencyMs;
    this.stats.lastHourTimestamps.push(Date.now());

    return ok({
      success: true,
      messageId,
      acceptedAt: new Date(),
      providerResponse: { mock: true },
    });
  }

  /**
   * Check if configured
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.fromEmail);
  }

  /**
   * Get health status
   */
  getHealth(): Promise<ChannelHealthStatus> {
    return Promise.resolve({
      healthy: this.behavior.shouldSucceed !== false,
      message:
        this.behavior.shouldSucceed !== false
          ? 'Mock email channel operational'
          : 'Mock email channel configured to fail',
      lastSuccessAt: this.sentEmails.length > 0 ? this.sentEmails.at(-1)?.timestamp : undefined,
    });
  }

  /**
   * Get statistics
   */
  getStats(): Promise<ChannelStats> {
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const recentTimestamps = this.stats.lastHourTimestamps.filter((t) => t > oneHourAgo);
    const total = this.stats.sent + this.stats.failed;

    return Promise.resolve({
      sent: this.stats.sent,
      failed: this.stats.failed,
      avgLatencyMs: this.stats.sent > 0 ? this.stats.totalLatencyMs / this.stats.sent : 0,
      lastHourCount: recentTimestamps.length,
      successRate: total > 0 ? this.stats.sent / total : 1,
    });
  }

  /**
   * Validate recipient
   */
  validateRecipient(recipient: string): boolean {
    if (this.behavior.recipientValidator) {
      return this.behavior.recipientValidator(recipient);
    }
    return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(recipient);
  }

  // ============================================
  // Test Helper Methods
  // ============================================

  /**
   * Get all sent emails
   */
  getSentEmails(): RecordedEmail[] {
    return [...this.sentEmails];
  }

  /**
   * Get the last sent email
   */
  getLastEmail(): RecordedEmail | undefined {
    return this.sentEmails[this.sentEmails.length - 1];
  }

  /**
   * Get emails sent to a specific recipient
   */
  getEmailsTo(recipient: string): RecordedEmail[] {
    return this.sentEmails.filter((e) => e.to === recipient);
  }

  /**
   * Get emails with a specific subject
   */
  getEmailsWithSubject(subject: string): RecordedEmail[] {
    return this.sentEmails.filter((e) => e.subject.includes(subject));
  }

  /**
   * Get emails by priority
   */
  getEmailsByPriority(priority: string): RecordedEmail[] {
    return this.sentEmails.filter((e) => e.priority === priority);
  }

  /**
   * Get email count
   */
  getEmailCount(): number {
    return this.sentEmails.length;
  }

  /**
   * Clear all recorded emails
   */
  clearEmails(): void {
    this.sentEmails = [];
    this.messageCounter = 0;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      sent: 0,
      failed: 0,
      totalLatencyMs: 0,
      lastHourTimestamps: [],
    };
  }

  /**
   * Update behavior configuration
   */
  setBehavior(behavior: MockEmailBehavior): void {
    this.behavior = { ...this.behavior, ...behavior };
  }

  /**
   * Set to success mode
   */
  setSuccessMode(): void {
    this.behavior.shouldSucceed = true;
    this.behavior.errorMessage = undefined;
    this.behavior.errorCode = undefined;
  }

  /**
   * Set to failure mode
   */
  setFailureMode(options?: {
    errorMessage?: string;
    errorCode?: string;
    retryable?: boolean;
  }): void {
    this.behavior.shouldSucceed = false;
    if (options) {
      this.behavior.errorMessage = options.errorMessage;
      this.behavior.errorCode = options.errorCode;
      this.behavior.retryable = options.retryable;
    }
  }

  /**
   * Set latency simulation
   */
  setLatency(ms: number): void {
    this.behavior.latencyMs = ms;
  }

  /**
   * Set rate limit
   */
  setRateLimit(maxEmails: number): void {
    this.behavior.rateLimitAfter = maxEmails;
  }

  /**
   * Assert that an email was sent to a recipient
   */
  assertEmailSentTo(recipient: string, message?: string): void {
    const found = this.sentEmails.some((e) => e.to === recipient);
    if (!found) {
      throw new Error(message ?? `Expected email to be sent to ${recipient}, but none was found`);
    }
  }

  /**
   * Assert email count
   */
  assertEmailCount(count: number, message?: string): void {
    if (this.sentEmails.length !== count) {
      throw new Error(
        message ?? `Expected ${count} emails to be sent, but ${this.sentEmails.length} were sent`
      );
    }
  }

  /**
   * Assert no emails sent
   */
  assertNoEmailsSent(message?: string): void {
    if (this.sentEmails.length > 0) {
      throw new Error(
        message ?? `Expected no emails to be sent, but ${this.sentEmails.length} were sent`
      );
    }
  }

  // ============================================
  // Private Methods
  // ============================================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================
// Error Types
// ============================================

/**
 * Mock email error for testing
 */
export class MockEmailError extends Error {
  constructor(
    message: string,
    public readonly errorCode: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = 'MockEmailError';
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a mock email channel adapter
 *
 * @param options - Mock configuration options
 * @returns Mock email channel adapter
 *
 * @example
 * ```typescript
 * // Basic usage
 * const mockEmail = createMockEmailChannelAdapter();
 *
 * // With custom behavior
 * const failingMock = createMockEmailChannelAdapter({
 *   behavior: { shouldSucceed: false, errorMessage: 'Service unavailable' }
 * });
 *
 * // With latency simulation
 * const slowMock = createMockEmailChannelAdapter({
 *   behavior: { latencyMs: 500 }
 * });
 * ```
 */
export function createMockEmailChannelAdapter(
  options?: MockEmailChannelConfig
): MockEmailChannelAdapter {
  return new MockEmailChannelAdapter(options);
}

/**
 * Create a pre-configured success mock
 */
export function createSuccessMockEmailAdapter(): MockEmailChannelAdapter {
  return new MockEmailChannelAdapter({ behavior: { shouldSucceed: true } });
}

/**
 * Create a pre-configured failure mock
 */
export function createFailureMockEmailAdapter(
  errorMessage = 'Email service unavailable',
  retryable = false
): MockEmailChannelAdapter {
  return new MockEmailChannelAdapter({
    behavior: {
      shouldSucceed: false,
      errorMessage,
      retryable,
    },
  });
}

/**
 * Create a pre-configured slow mock with latency
 */
export function createSlowMockEmailAdapter(latencyMs = 1000): MockEmailChannelAdapter {
  return new MockEmailChannelAdapter({
    behavior: {
      shouldSucceed: true,
      latencyMs,
    },
  });
}

/**
 * Create a pre-configured flaky mock that fails randomly
 */
export function createFlakyMockEmailAdapter(failureRate = 0.3): MockEmailChannelAdapter {
  const adapter = new MockEmailChannelAdapter();

  // Override the send method to randomly fail
  const originalSend = adapter.send.bind(adapter);
  adapter.send = async (options) => {
    if (Math.random() < failureRate) {
      adapter.setBehavior({
        shouldSucceed: false,
        errorMessage: 'Random failure',
        retryable: true,
      });
      const result = await originalSend(options);
      adapter.setBehavior({ shouldSucceed: true });
      return result;
    }
    adapter.setBehavior({ shouldSucceed: true });
    return originalSend(options);
  };

  return adapter;
}
