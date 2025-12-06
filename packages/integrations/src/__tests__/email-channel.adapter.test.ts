/**
 * @file Email Channel Adapter Tests
 * @description Comprehensive tests for email notification channel adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EmailChannelAdapter,
  createEmailChannelAdapter,
  EmailSendError,
} from '../adapters/email-channel.adapter.js';
import {
  MockEmailChannelAdapter,
  createMockEmailChannelAdapter,
  createSuccessMockEmailAdapter,
  createFailureMockEmailAdapter,
  createSlowMockEmailAdapter,
  MockEmailError,
} from '../adapters/email-channel.mock.js';
import { isOk, isErr } from '../lib/index.js';
import type { EmailChannelConfig } from '../adapters/notification-channel.js';

// ============================================
// Test Helpers
// ============================================

function mockFetch(response: { status: number; body?: unknown; ok?: boolean }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok ?? (response.status >= 200 && response.status < 300),
    status: response.status,
    statusText: response.status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(response.body ?? {}),
    text: () => Promise.resolve(JSON.stringify(response.body ?? {})),
  });
}

function createTestConfig(overrides: Partial<EmailChannelConfig> = {}): EmailChannelConfig {
  return {
    provider: 'sendgrid',
    apiKey: 'test-api-key',
    fromEmail: 'notifications@medicalcor.com',
    fromName: 'MedicalCor Notifications',
    ...overrides,
  };
}

// ============================================
// EmailChannelAdapter Tests
// ============================================

describe('EmailChannelAdapter', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create adapter with valid config', () => {
      const adapter = createEmailChannelAdapter(createTestConfig());

      expect(adapter).toBeDefined();
      expect(adapter.channelType).toBe('email');
      expect(adapter.isConfigured()).toBe(true);
    });

    it('should use default timeout when not specified', () => {
      const adapter = createEmailChannelAdapter(createTestConfig());
      expect(adapter.isConfigured()).toBe(true);
    });

    it('should allow custom timeout', () => {
      const adapter = createEmailChannelAdapter(createTestConfig({ timeoutMs: 5000 }));
      expect(adapter.isConfigured()).toBe(true);
    });

    it('should support all providers', () => {
      const providers: EmailChannelConfig['provider'][] = [
        'sendgrid',
        'resend',
        'postmark',
        'mailgun',
        'ses',
        'smtp',
      ];

      for (const provider of providers) {
        const adapter = createEmailChannelAdapter(createTestConfig({ provider }));
        expect(adapter.isConfigured()).toBe(true);
      }
    });
  });

  describe('isConfigured', () => {
    it('should return true when fully configured', () => {
      const adapter = createEmailChannelAdapter(createTestConfig());
      expect(adapter.isConfigured()).toBe(true);
    });

    it('should return false when apiKey is missing', () => {
      const adapter = createEmailChannelAdapter(createTestConfig({ apiKey: '' }));
      expect(adapter.isConfigured()).toBe(false);
    });

    it('should return false when fromEmail is missing', () => {
      const adapter = createEmailChannelAdapter(createTestConfig({ fromEmail: '' }));
      expect(adapter.isConfigured()).toBe(false);
    });
  });

  describe('validateRecipient', () => {
    it('should validate correct email addresses', () => {
      const adapter = createEmailChannelAdapter(createTestConfig());

      expect(adapter.validateRecipient('user@example.com')).toBe(true);
      expect(adapter.validateRecipient('user.name@domain.co.uk')).toBe(true);
      expect(adapter.validateRecipient('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      const adapter = createEmailChannelAdapter(createTestConfig());

      expect(adapter.validateRecipient('invalid')).toBe(false);
      expect(adapter.validateRecipient('missing@')).toBe(false);
      expect(adapter.validateRecipient('@nodomain.com')).toBe(false);
      expect(adapter.validateRecipient('spaces in@email.com')).toBe(false);
    });
  });

  describe('send', () => {
    it('should send email successfully via SendGrid', async () => {
      const fetchMock = mockFetch({
        status: 202,
        ok: true,
        body: { 'x-message-id': 'sg-123' },
      });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig({ provider: 'sendgrid' }));

      const result = await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Patient Alert',
        body: 'A patient requires attention.',
        correlationId: 'test-correlation-123',
      });

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.success).toBe(true);
        expect(result.value.acceptedAt).toBeInstanceOf(Date);
      }

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.sendgrid.com/v3/mail/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-api-key',
            'X-Correlation-ID': 'test-correlation-123',
          }),
        })
      );
    });

    it('should send email via Resend', async () => {
      const fetchMock = mockFetch({
        status: 200,
        ok: true,
        body: { id: 'resend-123' },
      });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig({ provider: 'resend' }));

      const result = await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      expect(isOk(result)).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', expect.any(Object));
    });

    it('should send email via Postmark', async () => {
      const fetchMock = mockFetch({
        status: 200,
        ok: true,
        body: { MessageID: 'pm-123' },
      });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig({ provider: 'postmark' }));

      const result = await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      expect(isOk(result)).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.postmarkapp.com/email',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Postmark-Server-Token': 'test-api-key',
          }),
        })
      );
    });

    it('should return error for invalid recipient', async () => {
      const adapter = createEmailChannelAdapter(createTestConfig());

      const result = await adapter.send({
        recipient: 'not-an-email',
        title: 'Test',
        body: 'Test body',
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Invalid email recipient');
      }
    });

    it('should handle provider errors gracefully', async () => {
      const fetchMock = mockFetch({
        status: 500,
        ok: false,
        body: { error: 'Internal server error' },
      });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig());

      const result = await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Email provider error');
      }
    });

    it('should handle network errors', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const adapter = createEmailChannelAdapter(createTestConfig());

      const result = await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Network error');
      }
    });

    it('should handle CC and BCC recipients', async () => {
      const fetchMock = mockFetch({ status: 202, ok: true, body: {} });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig({ provider: 'sendgrid' }));

      await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
        cc: ['cc1@example.com', 'cc2@example.com'],
        bcc: ['bcc@example.com'],
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.personalizations[0].cc).toEqual([
        { email: 'cc1@example.com' },
        { email: 'cc2@example.com' },
      ]);
      expect(callBody.personalizations[0].bcc).toEqual([{ email: 'bcc@example.com' }]);
    });

    it('should handle HTML content', async () => {
      const fetchMock = mockFetch({ status: 202, ok: true, body: {} });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig({ provider: 'sendgrid' }));

      await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Plain text',
        htmlBody: '<h1>HTML Content</h1>',
      });

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.content).toContainEqual({ type: 'text/plain', value: 'Plain text' });
      expect(callBody.content).toContainEqual({
        type: 'text/html',
        value: '<h1>HTML Content</h1>',
      });
    });

    it('should use sandbox mode when enabled', async () => {
      const adapter = createEmailChannelAdapter(createTestConfig({ sandbox: true }));

      const result = await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      // Should succeed without making actual API call
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.messageId).toContain('sandbox-');
      }
    });

    it('should generate correlationId if not provided', async () => {
      const fetchMock = mockFetch({ status: 202, ok: true, body: {} });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig());

      await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Correlation-ID': expect.any(String),
          }),
        })
      );
    });
  });

  describe('getHealth', () => {
    it('should return healthy status when configured', async () => {
      const adapter = createEmailChannelAdapter(createTestConfig());

      const health = await adapter.getHealth();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('operational');
    });

    it('should return unhealthy status when not configured', async () => {
      const adapter = createEmailChannelAdapter(createTestConfig({ apiKey: '' }));

      const health = await adapter.getHealth();

      expect(health.healthy).toBe(false);
      expect(health.message).toContain('not configured');
    });

    it('should track last success and error times', async () => {
      const fetchMock = mockFetch({ status: 202, ok: true, body: {} });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig());

      await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      const health = await adapter.getHealth();

      expect(health.lastSuccessAt).toBeInstanceOf(Date);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', async () => {
      const adapter = createEmailChannelAdapter(createTestConfig());

      const stats = await adapter.getStats();

      expect(stats.sent).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.avgLatencyMs).toBe(0);
      expect(stats.successRate).toBe(1);
    });

    it('should track sent emails', async () => {
      const fetchMock = mockFetch({ status: 202, ok: true, body: {} });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig());

      await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      const stats = await adapter.getStats();

      expect(stats.sent).toBe(1);
      expect(stats.successRate).toBe(1);
    });

    it('should track failed emails', async () => {
      const fetchMock = mockFetch({ status: 500, ok: false, body: {} });
      global.fetch = fetchMock;

      const adapter = createEmailChannelAdapter(createTestConfig());

      await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Test body',
      });

      const stats = await adapter.getStats();

      expect(stats.failed).toBe(1);
      expect(stats.successRate).toBe(0);
    });
  });
});

// ============================================
// MockEmailChannelAdapter Tests
// ============================================

describe('MockEmailChannelAdapter', () => {
  describe('initialization', () => {
    it('should create mock adapter with defaults', () => {
      const adapter = createMockEmailChannelAdapter();

      expect(adapter.channelType).toBe('email');
      expect(adapter.isConfigured()).toBe(true);
    });

    it('should create mock with custom config', () => {
      const adapter = createMockEmailChannelAdapter({
        config: {
          provider: 'resend',
          apiKey: 'custom-key',
          fromEmail: 'custom@example.com',
        },
      });

      expect(adapter.isConfigured()).toBe(true);
    });
  });

  describe('send', () => {
    it('should record sent emails', async () => {
      const adapter = createMockEmailChannelAdapter();

      await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test Subject',
        body: 'Test body content',
        priority: 'high',
      });

      const emails = adapter.getSentEmails();
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toBe('doctor@clinic.com');
      expect(emails[0].subject).toBe('Test Subject');
      expect(emails[0].body).toBe('Test body content');
      expect(emails[0].priority).toBe('high');
    });

    it('should generate unique message IDs', async () => {
      const adapter = createMockEmailChannelAdapter();

      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
      await adapter.send({ recipient: 'c@d.com', title: 'Test', body: 'Body' });

      const emails = adapter.getSentEmails();
      expect(emails[0].messageId).not.toBe(emails[1].messageId);
    });

    it('should fail when configured to fail', async () => {
      const adapter = createMockEmailChannelAdapter({
        behavior: {
          shouldSucceed: false,
          errorMessage: 'Simulated failure',
          errorCode: 'SIM_ERROR',
        },
      });

      const result = await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Body',
      });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toBe('Simulated failure');
        expect((result.error as MockEmailError).errorCode).toBe('SIM_ERROR');
      }
    });

    it('should simulate latency', async () => {
      const adapter = createMockEmailChannelAdapter({
        behavior: { latencyMs: 50 },
      });

      const start = Date.now();
      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some margin
    });

    it('should enforce rate limits', async () => {
      const adapter = createMockEmailChannelAdapter({
        behavior: { rateLimitAfter: 2 },
      });

      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
      await adapter.send({ recipient: 'b@c.com', title: 'Test', body: 'Body' });
      const result = await adapter.send({ recipient: 'c@d.com', title: 'Test', body: 'Body' });

      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.message).toContain('Rate limit');
      }
    });

    it('should use custom recipient validator', async () => {
      const adapter = createMockEmailChannelAdapter({
        behavior: {
          recipientValidator: (r) => r.endsWith('@clinic.com'),
        },
      });

      const validResult = await adapter.send({
        recipient: 'doctor@clinic.com',
        title: 'Test',
        body: 'Body',
      });
      const invalidResult = await adapter.send({
        recipient: 'user@other.com',
        title: 'Test',
        body: 'Body',
      });

      expect(isOk(validResult)).toBe(true);
      expect(isErr(invalidResult)).toBe(true);
    });
  });

  describe('helper methods', () => {
    let adapter: MockEmailChannelAdapter;

    beforeEach(() => {
      adapter = createMockEmailChannelAdapter();
    });

    it('should get last email', async () => {
      await adapter.send({ recipient: 'first@test.com', title: 'First', body: 'Body' });
      await adapter.send({ recipient: 'last@test.com', title: 'Last', body: 'Body' });

      const lastEmail = adapter.getLastEmail();
      expect(lastEmail?.to).toBe('last@test.com');
    });

    it('should get emails to specific recipient', async () => {
      await adapter.send({ recipient: 'doctor@clinic.com', title: 'A', body: 'Body' });
      await adapter.send({ recipient: 'nurse@clinic.com', title: 'B', body: 'Body' });
      await adapter.send({ recipient: 'doctor@clinic.com', title: 'C', body: 'Body' });

      const doctorEmails = adapter.getEmailsTo('doctor@clinic.com');
      expect(doctorEmails).toHaveLength(2);
    });

    it('should get emails with specific subject', async () => {
      await adapter.send({ recipient: 'a@b.com', title: 'Urgent Alert', body: 'Body' });
      await adapter.send({ recipient: 'a@b.com', title: 'Weekly Report', body: 'Body' });
      await adapter.send({ recipient: 'a@b.com', title: 'Urgent Notice', body: 'Body' });

      const urgentEmails = adapter.getEmailsWithSubject('Urgent');
      expect(urgentEmails).toHaveLength(2);
    });

    it('should get emails by priority', async () => {
      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body', priority: 'high' });
      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body', priority: 'low' });
      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body', priority: 'high' });

      const highPriority = adapter.getEmailsByPriority('high');
      expect(highPriority).toHaveLength(2);
    });

    it('should clear emails', async () => {
      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });

      adapter.clearEmails();

      expect(adapter.getEmailCount()).toBe(0);
    });

    it('should update behavior dynamically', async () => {
      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
      expect(isOk(await adapter.send({ recipient: 'b@c.com', title: 'Test', body: 'Body' }))).toBe(
        true
      );

      adapter.setFailureMode({ errorMessage: 'Now failing' });

      const result = await adapter.send({ recipient: 'c@d.com', title: 'Test', body: 'Body' });
      expect(isErr(result)).toBe(true);

      adapter.setSuccessMode();

      const result2 = await adapter.send({ recipient: 'd@e.com', title: 'Test', body: 'Body' });
      expect(isOk(result2)).toBe(true);
    });
  });

  describe('assertions', () => {
    let adapter: MockEmailChannelAdapter;

    beforeEach(() => {
      adapter = createMockEmailChannelAdapter();
    });

    it('should assert email sent to recipient', async () => {
      await adapter.send({ recipient: 'doctor@clinic.com', title: 'Test', body: 'Body' });

      expect(() => adapter.assertEmailSentTo('doctor@clinic.com')).not.toThrow();
      expect(() => adapter.assertEmailSentTo('nurse@clinic.com')).toThrow();
    });

    it('should assert email count', async () => {
      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
      await adapter.send({ recipient: 'b@c.com', title: 'Test', body: 'Body' });

      expect(() => adapter.assertEmailCount(2)).not.toThrow();
      expect(() => adapter.assertEmailCount(3)).toThrow();
    });

    it('should assert no emails sent', () => {
      expect(() => adapter.assertNoEmailsSent()).not.toThrow();
    });
  });

  describe('statistics', () => {
    it('should track success stats', async () => {
      const adapter = createMockEmailChannelAdapter();

      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
      await adapter.send({ recipient: 'b@c.com', title: 'Test', body: 'Body' });

      const stats = await adapter.getStats();
      expect(stats.sent).toBe(2);
      expect(stats.failed).toBe(0);
      expect(stats.successRate).toBe(1);
    });

    it('should track failure stats', async () => {
      const adapter = createMockEmailChannelAdapter({
        behavior: { shouldSucceed: false },
      });

      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
      await adapter.send({ recipient: 'b@c.com', title: 'Test', body: 'Body' });

      const stats = await adapter.getStats();
      expect(stats.sent).toBe(0);
      expect(stats.failed).toBe(2);
      expect(stats.successRate).toBe(0);
    });

    it('should reset stats', async () => {
      const adapter = createMockEmailChannelAdapter();

      await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });

      adapter.resetStats();

      const stats = await adapter.getStats();
      expect(stats.sent).toBe(0);
    });
  });
});

// ============================================
// Factory Functions Tests
// ============================================

describe('Factory Functions', () => {
  it('should create success mock', async () => {
    const adapter = createSuccessMockEmailAdapter();
    const result = await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });

    expect(isOk(result)).toBe(true);
  });

  it('should create failure mock', async () => {
    const adapter = createFailureMockEmailAdapter('Custom error');
    const result = await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.message).toBe('Custom error');
    }
  });

  it('should create slow mock', async () => {
    const adapter = createSlowMockEmailAdapter(30);

    const start = Date.now();
    await adapter.send({ recipient: 'a@b.com', title: 'Test', body: 'Body' });
    const elapsed = Date.now() - start;

    expect(elapsed).toBeGreaterThanOrEqual(25);
  });
});

// ============================================
// EmailSendError Tests
// ============================================

describe('EmailSendError', () => {
  it('should create error with all properties', () => {
    const error = new EmailSendError('Test error', 'ERR_001', true);

    expect(error.message).toBe('Test error');
    expect(error.errorCode).toBe('ERR_001');
    expect(error.retryable).toBe(true);
    expect(error.name).toBe('EmailSendError');
  });

  it('should be instance of Error', () => {
    const error = new EmailSendError('Test', 'ERR', false);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(EmailSendError);
  });
});
