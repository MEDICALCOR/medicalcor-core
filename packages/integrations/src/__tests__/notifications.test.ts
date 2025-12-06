/**
 * @file Notifications Service Tests
 * @description Comprehensive tests for multi-channel notification service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createNotificationsService,
  createMockNotificationsService,
  NotificationPayload,
  NotificationsService,
  MockNotificationsService,
} from '../notifications';

// ============================================
// Test Helpers
// ============================================

function createValidPayload(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  return {
    type: 'urgency.new',
    priority: 'high',
    timestamp: new Date().toISOString(),
    correlationId: 'test-correlation-id',
    ...overrides,
  };
}

function mockFetch(response: { status: number; body?: unknown; ok?: boolean }) {
  return vi.fn().mockResolvedValue({
    ok: response.ok ?? (response.status >= 200 && response.status < 300),
    status: response.status,
    statusText: response.status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(response.body ?? {}),
  });
}

// ============================================
// createNotificationsService Tests
// ============================================

describe('createNotificationsService', () => {
  let originalFetch: typeof global.fetch;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalFetch = global.fetch;
    originalEnv = { ...process.env };
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should create service with explicit config', () => {
      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      expect(service).toBeDefined();
      expect(service.broadcastToSupervisors).toBeInstanceOf(Function);
      expect(service.notifySupervisor).toBeInstanceOf(Function);
      expect(service.sendPushNotification).toBeInstanceOf(Function);
      expect(service.sendEmailNotification).toBeInstanceOf(Function);
      expect(service.isConfigured).toBeInstanceOf(Function);
    });

    it('should read config from environment variables', () => {
      process.env.API_GATEWAY_URL = 'https://env.api.com';
      process.env.INTERNAL_API_KEY = 'env-key';

      const service = createNotificationsService();

      expect(service.isConfigured()).toBe(true);
    });

    it('should return false from isConfigured when not configured', () => {
      delete process.env.API_GATEWAY_URL;
      delete process.env.INTERNAL_API_KEY;

      const service = createNotificationsService({});

      expect(service.isConfigured()).toBe(false);
    });

    it('should return true from isConfigured when fully configured', () => {
      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('broadcastToSupervisors', () => {
    it('should broadcast notification successfully', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      const payload = createValidPayload();
      await service.broadcastToSupervisors(payload);

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/internal/notifications/broadcast',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Internal-API-Key': 'test-key',
            'X-Correlation-ID': 'test-correlation-id',
          }),
        })
      );
    });

    it('should skip broadcast when API gateway is not configured', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      delete process.env.API_GATEWAY_URL;
      delete process.env.INTERNAL_API_KEY;

      const service = createNotificationsService({});
      const payload = createValidPayload();

      await service.broadcastToSupervisors(payload);

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle broadcast failure gracefully', async () => {
      const fetchMock = mockFetch({ status: 500, ok: false });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      const payload = createValidPayload();

      // Should not throw
      await expect(service.broadcastToSupervisors(payload)).resolves.toBeUndefined();
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      const payload = createValidPayload();

      // Should not throw
      await expect(service.broadcastToSupervisors(payload)).resolves.toBeUndefined();
    });

    it('should generate correlationId if not provided', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      const payload = {
        type: 'urgency.new' as const,
        priority: 'high' as const,
        timestamp: new Date().toISOString(),
      } as NotificationPayload;

      await service.broadcastToSupervisors(payload);

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Correlation-ID': expect.any(String),
          }),
        })
      );
    });

    it('should sanitize payload before sending', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      const payload = createValidPayload({
        phone: '+40712345678',
        reason: 'Contact: test@example.com',
        keywords: ['email: user@domain.com'],
      });

      await service.broadcastToSupervisors(payload);

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.payload.phone).toBe('+4071234****');
      expect(callBody.payload.reason).toBe('Contact: [EMAIL]');
      expect(callBody.payload.keywords).toContain('email: [EMAIL]');
    });

    it('should include signal with 5 second timeout', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      await service.broadcastToSupervisors(createValidPayload());

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });

  describe('notifySupervisor', () => {
    it('should send notification to specific supervisor', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      const payload = createValidPayload();
      await service.notifySupervisor('supervisor-123', payload);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/internal/notifications/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Internal-API-Key': 'test-key',
          }),
        })
      );

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.supervisorId).toBe('supervisor-123');
    });

    it('should skip when API gateway is not configured', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      delete process.env.API_GATEWAY_URL;
      delete process.env.INTERNAL_API_KEY;

      const service = createNotificationsService({});

      await service.notifySupervisor('supervisor-123', createValidPayload());

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle failure gracefully', async () => {
      const fetchMock = mockFetch({ status: 500, ok: false });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      // Should not throw
      await expect(
        service.notifySupervisor('supervisor-123', createValidPayload())
      ).resolves.toBeUndefined();
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      await expect(
        service.notifySupervisor('supervisor-123', createValidPayload())
      ).resolves.toBeUndefined();
    });

    it('should generate correlationId if not provided', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
      });

      const payload = {
        type: 'urgency.new' as const,
        priority: 'high' as const,
        timestamp: new Date().toISOString(),
      } as NotificationPayload;

      await service.notifySupervisor('supervisor-123', payload);

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

  describe('sendPushNotification', () => {
    it('should send push notification when enabled', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
        pushEnabled: true,
      });

      await service.sendPushNotification('subscription-123', 'Test Title', 'Test Body', {
        action: 'view',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/internal/push/send',
        expect.objectContaining({
          method: 'POST',
        })
      );

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.subscriptionId).toBe('subscription-123');
      expect(callBody.notification.title).toBe('Test Title');
      expect(callBody.notification.body).toBe('Test Body');
      expect(callBody.notification.data).toEqual({ action: 'view' });
    });

    it('should skip when push is disabled', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
        pushEnabled: false,
      });

      await service.sendPushNotification('subscription-123', 'Title', 'Body');

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should skip when API gateway is not configured', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      delete process.env.API_GATEWAY_URL;
      delete process.env.INTERNAL_API_KEY;

      const service = createNotificationsService({
        pushEnabled: true,
      });

      await service.sendPushNotification('subscription-123', 'Title', 'Body');

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle push failure gracefully', async () => {
      const fetchMock = mockFetch({ status: 500, ok: false });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
        pushEnabled: true,
      });

      await expect(
        service.sendPushNotification('subscription-123', 'Title', 'Body')
      ).resolves.toBeUndefined();
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
        pushEnabled: true,
      });

      await expect(
        service.sendPushNotification('subscription-123', 'Title', 'Body')
      ).resolves.toBeUndefined();
    });

    it('should include icons in push notification', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        apiGatewayUrl: 'https://api.test.com',
        internalApiKey: 'test-key',
        pushEnabled: true,
      });

      await service.sendPushNotification('subscription-123', 'Title', 'Body');

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.notification.icon).toBe('/icons/notification-icon.png');
      expect(callBody.notification.badge).toBe('/icons/badge-icon.png');
    });
  });

  describe('sendEmailNotification', () => {
    it('should send text email successfully', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        emailServiceUrl: 'https://email.test.com',
        emailApiKey: 'email-key',
      });

      await service.sendEmailNotification('user@example.com', 'Test Subject', 'Test body content');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://email.test.com/send',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer email-key',
          }),
        })
      );

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.to).toBe('user@example.com');
      expect(callBody.subject).toBe('Test Subject');
      expect(callBody.text).toBe('Test body content');
      expect(callBody.from).toBe('notifications@medicalcor.com');
    });

    it('should send HTML email when isHtml is true', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        emailServiceUrl: 'https://email.test.com',
        emailApiKey: 'email-key',
      });

      await service.sendEmailNotification(
        'user@example.com',
        'Test Subject',
        '<h1>HTML Content</h1>',
        true
      );

      const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
      expect(callBody.html).toBe('<h1>HTML Content</h1>');
      expect(callBody.text).toBeUndefined();
    });

    it('should skip when email service is not configured', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      delete process.env.EMAIL_SERVICE_URL;
      delete process.env.EMAIL_API_KEY;

      const service = createNotificationsService({});

      await service.sendEmailNotification('user@example.com', 'Subject', 'Body');

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('should handle email failure gracefully', async () => {
      const fetchMock = mockFetch({ status: 500, ok: false });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        emailServiceUrl: 'https://email.test.com',
        emailApiKey: 'email-key',
      });

      await expect(
        service.sendEmailNotification('user@example.com', 'Subject', 'Body')
      ).resolves.toBeUndefined();
    });

    it('should handle network errors gracefully', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const service = createNotificationsService({
        emailServiceUrl: 'https://email.test.com',
        emailApiKey: 'email-key',
      });

      await expect(
        service.sendEmailNotification('user@example.com', 'Subject', 'Body')
      ).resolves.toBeUndefined();
    });

    it('should use 10 second timeout for email', async () => {
      const fetchMock = mockFetch({ status: 200, ok: true });
      global.fetch = fetchMock;

      const service = createNotificationsService({
        emailServiceUrl: 'https://email.test.com',
        emailApiKey: 'email-key',
      });

      await service.sendEmailNotification('user@example.com', 'Subject', 'Body');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        })
      );
    });
  });
});

// ============================================
// Payload Sanitization Tests
// ============================================

describe('Payload Sanitization', () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('should mask phone numbers that are not already masked', async () => {
    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService({
      apiGatewayUrl: 'https://api.test.com',
      internalApiKey: 'test-key',
    });

    const payload = createValidPayload({ phone: '+40712345678' });
    await service.broadcastToSupervisors(payload);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.payload.phone).toBe('+4071234****');
  });

  it('should not double-mask already masked phone numbers', async () => {
    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService({
      apiGatewayUrl: 'https://api.test.com',
      internalApiKey: 'test-key',
    });

    const payload = createValidPayload({ phone: '+407123****' });
    await service.broadcastToSupervisors(payload);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.payload.phone).toBe('+407123****');
  });

  it('should redact email addresses from reason', async () => {
    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService({
      apiGatewayUrl: 'https://api.test.com',
      internalApiKey: 'test-key',
    });

    const payload = createValidPayload({
      reason: 'Patient contact: john.doe@example.com requested callback',
    });
    await service.broadcastToSupervisors(payload);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.payload.reason).toBe('Patient contact: [EMAIL] requested callback');
  });

  it('should redact Romanian CNP from reason', async () => {
    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService({
      apiGatewayUrl: 'https://api.test.com',
      internalApiKey: 'test-key',
    });

    const payload = createValidPayload({
      reason: 'Patient CNP: 1900101123456',
    });
    await service.broadcastToSupervisors(payload);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.payload.reason).toBe('Patient CNP: [CNP]');
  });

  it('should redact phone numbers from reason', async () => {
    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService({
      apiGatewayUrl: 'https://api.test.com',
      internalApiKey: 'test-key',
    });

    const payload = createValidPayload({
      reason: 'Call from +40 712 345 678 about appointment',
    });
    await service.broadcastToSupervisors(payload);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.payload.reason).toBe('Call from [PHONE] about appointment');
  });

  it('should redact credit card numbers from reason', async () => {
    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService({
      apiGatewayUrl: 'https://api.test.com',
      internalApiKey: 'test-key',
    });

    const payload = createValidPayload({
      reason: 'Payment with card 4111-1111-1111-1111',
    });
    await service.broadcastToSupervisors(payload);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.payload.reason).toBe('Payment with card [CARD]');
  });

  it('should redact PII from keywords array', async () => {
    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService({
      apiGatewayUrl: 'https://api.test.com',
      internalApiKey: 'test-key',
    });

    const payload = createValidPayload({
      keywords: ['contact: test@domain.com', 'phone: 0712345678', 'cnp: 2900101123456'],
    });
    await service.broadcastToSupervisors(payload);

    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(callBody.payload.keywords).toEqual(['contact: [EMAIL]', 'phone: [PHONE]', 'cnp: [CNP]']);
  });
});

// ============================================
// Mock Notifications Service Tests
// ============================================

describe('createMockNotificationsService', () => {
  let mockService: MockNotificationsService;

  beforeEach(() => {
    mockService = createMockNotificationsService();
  });

  describe('broadcastToSupervisors', () => {
    it('should record broadcast notification', async () => {
      const payload = createValidPayload();
      await mockService.broadcastToSupervisors(payload);

      const notifications = mockService.getSentNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('broadcast');
      expect(notifications[0].payload).toEqual(payload);
      expect(notifications[0].timestamp).toBeInstanceOf(Date);
    });
  });

  describe('notifySupervisor', () => {
    it('should record direct notification with supervisor ID', async () => {
      const payload = createValidPayload();
      await mockService.notifySupervisor('supervisor-456', payload);

      const notifications = mockService.getSentNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('direct');
      expect((notifications[0].payload as Record<string, unknown>).supervisorId).toBe(
        'supervisor-456'
      );
    });
  });

  describe('sendPushNotification', () => {
    it('should record push notification', async () => {
      await mockService.sendPushNotification('sub-123', 'Push Title', 'Push Body', {
        action: 'open',
      });

      const notifications = mockService.getSentNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('push');
      expect(notifications[0].payload).toEqual({
        subscriptionId: 'sub-123',
        title: 'Push Title',
        body: 'Push Body',
        data: { action: 'open' },
      });
    });

    it('should handle push notification without data', async () => {
      await mockService.sendPushNotification('sub-123', 'Title', 'Body');

      const notifications = mockService.getSentNotifications();
      expect(notifications[0].payload).toEqual({
        subscriptionId: 'sub-123',
        title: 'Title',
        body: 'Body',
        data: undefined,
      });
    });
  });

  describe('sendEmailNotification', () => {
    it('should record email notification', async () => {
      await mockService.sendEmailNotification(
        'test@example.com',
        'Email Subject',
        'Email Body',
        false
      );

      const notifications = mockService.getSentNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].type).toBe('email');
      expect(notifications[0].payload).toEqual({
        to: 'test@example.com',
        subject: 'Email Subject',
        body: 'Email Body',
        isHtml: false,
      });
    });

    it('should handle email notification without isHtml parameter', async () => {
      await mockService.sendEmailNotification('test@example.com', 'Subject', 'Body');

      const notifications = mockService.getSentNotifications();
      expect(notifications[0].payload).toEqual({
        to: 'test@example.com',
        subject: 'Subject',
        body: 'Body',
        isHtml: undefined,
      });
    });
  });

  describe('isConfigured', () => {
    it('should always return true for mock service', () => {
      expect(mockService.isConfigured()).toBe(true);
    });
  });

  describe('getSentNotifications', () => {
    it('should return copy of notifications array', async () => {
      await mockService.broadcastToSupervisors(createValidPayload());

      const notifications1 = mockService.getSentNotifications();
      const notifications2 = mockService.getSentNotifications();

      expect(notifications1).not.toBe(notifications2);
      expect(notifications1).toEqual(notifications2);
    });

    it('should return empty array when no notifications sent', () => {
      expect(mockService.getSentNotifications()).toEqual([]);
    });

    it('should track multiple notifications in order', async () => {
      await mockService.broadcastToSupervisors(createValidPayload({ type: 'urgency.new' }));
      await mockService.notifySupervisor(
        'sup-1',
        createValidPayload({ type: 'urgency.escalated' })
      );
      await mockService.sendPushNotification('sub-1', 'Title', 'Body');
      await mockService.sendEmailNotification('test@example.com', 'Subject', 'Body');

      const notifications = mockService.getSentNotifications();
      expect(notifications).toHaveLength(4);
      expect(notifications[0].type).toBe('broadcast');
      expect(notifications[1].type).toBe('direct');
      expect(notifications[2].type).toBe('push');
      expect(notifications[3].type).toBe('email');
    });
  });

  describe('clearNotifications', () => {
    it('should clear all notifications', async () => {
      await mockService.broadcastToSupervisors(createValidPayload());
      await mockService.notifySupervisor('sup-1', createValidPayload());

      expect(mockService.getSentNotifications()).toHaveLength(2);

      mockService.clearNotifications();

      expect(mockService.getSentNotifications()).toHaveLength(0);
    });

    it('should allow new notifications after clear', async () => {
      await mockService.broadcastToSupervisors(createValidPayload());
      mockService.clearNotifications();

      await mockService.broadcastToSupervisors(createValidPayload({ type: 'lead.hot' }));

      const notifications = mockService.getSentNotifications();
      expect(notifications).toHaveLength(1);
      expect((notifications[0].payload as NotificationPayload).type).toBe('lead.hot');
    });
  });
});

// ============================================
// Notification Type Tests
// ============================================

describe('Notification Types', () => {
  let mockService: MockNotificationsService;

  beforeEach(() => {
    mockService = createMockNotificationsService();
  });

  it.each([
    'urgency.new',
    'urgency.escalated',
    'urgency.resolved',
    'urgency.critical_unresolved',
    'lead.hot',
    'appointment.cancelled',
    'system.alert',
  ] as const)('should handle notification type: %s', async (notificationType) => {
    const payload = createValidPayload({ type: notificationType });
    await mockService.broadcastToSupervisors(payload);

    const notifications = mockService.getSentNotifications();
    expect((notifications[0].payload as NotificationPayload).type).toBe(notificationType);
  });

  it.each(['critical', 'high', 'medium', 'low'] as const)(
    'should handle priority: %s',
    async (priority) => {
      const payload = createValidPayload({ priority });
      await mockService.broadcastToSupervisors(payload);

      const notifications = mockService.getSentNotifications();
      expect((notifications[0].payload as NotificationPayload).priority).toBe(priority);
    }
  );
});

// ============================================
// Channel-specific Payload Tests
// ============================================

describe('Channel-specific Payloads', () => {
  let mockService: MockNotificationsService;

  beforeEach(() => {
    mockService = createMockNotificationsService();
  });

  it('should handle WhatsApp channel payload', async () => {
    const payload = createValidPayload({
      channel: 'whatsapp',
      phone: '+40712345678',
      patientName: 'John Doe',
    });
    await mockService.broadcastToSupervisors(payload);

    const notifications = mockService.getSentNotifications();
    const sentPayload = notifications[0].payload as NotificationPayload;
    expect(sentPayload.channel).toBe('whatsapp');
    expect(sentPayload.phone).toBe('+40712345678');
  });

  it('should handle voice channel payload', async () => {
    const payload = createValidPayload({
      channel: 'voice',
      callSid: 'CA1234567890',
      phone: '+40712345678',
    });
    await mockService.broadcastToSupervisors(payload);

    const notifications = mockService.getSentNotifications();
    const sentPayload = notifications[0].payload as NotificationPayload;
    expect(sentPayload.channel).toBe('voice');
    expect(sentPayload.callSid).toBe('CA1234567890');
  });

  it('should handle web channel payload', async () => {
    const payload = createValidPayload({
      channel: 'web',
      sentimentScore: 0.85,
      keywords: ['appointment', 'urgent'],
    });
    await mockService.broadcastToSupervisors(payload);

    const notifications = mockService.getSentNotifications();
    const sentPayload = notifications[0].payload as NotificationPayload;
    expect(sentPayload.channel).toBe('web');
    expect(sentPayload.sentimentScore).toBe(0.85);
    expect(sentPayload.keywords).toEqual(['appointment', 'urgent']);
  });

  it('should handle escalation payload', async () => {
    const payload = createValidPayload({
      type: 'urgency.escalated',
      escalationTier: 2,
      tierName: 'Supervisor',
    });
    await mockService.broadcastToSupervisors(payload);

    const notifications = mockService.getSentNotifications();
    const sentPayload = notifications[0].payload as NotificationPayload;
    expect(sentPayload.escalationTier).toBe(2);
    expect(sentPayload.tierName).toBe('Supervisor');
  });

  it('should handle resolution payload', async () => {
    const payload = createValidPayload({
      type: 'urgency.resolved',
      resolvedBy: 'admin@clinic.com',
      resolutionTime: '15 minutes',
    });
    await mockService.broadcastToSupervisors(payload);

    const notifications = mockService.getSentNotifications();
    const sentPayload = notifications[0].payload as NotificationPayload;
    expect(sentPayload.resolvedBy).toBe('admin@clinic.com');
    expect(sentPayload.resolutionTime).toBe('15 minutes');
  });
});

// ============================================
// Environment Variable Tests
// ============================================

describe('Environment Variable Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalEnv = { ...process.env };
    originalFetch = global.fetch;
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('should use API_GATEWAY_URL from environment', async () => {
    process.env.API_GATEWAY_URL = 'https://env-gateway.com';
    process.env.INTERNAL_API_KEY = 'env-key';

    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService();
    await service.broadcastToSupervisors(createValidPayload());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://env-gateway.com/internal/notifications/broadcast',
      expect.any(Object)
    );
  });

  it('should use EMAIL_SERVICE_URL from environment', async () => {
    process.env.EMAIL_SERVICE_URL = 'https://env-email.com';
    process.env.EMAIL_API_KEY = 'env-email-key';

    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService();
    await service.sendEmailNotification('test@test.com', 'Subject', 'Body');

    expect(fetchMock).toHaveBeenCalledWith('https://env-email.com/send', expect.any(Object));
  });

  it('should prefer explicit config over environment variables', async () => {
    process.env.API_GATEWAY_URL = 'https://env-gateway.com';
    process.env.INTERNAL_API_KEY = 'env-key';

    const fetchMock = mockFetch({ status: 200, ok: true });
    global.fetch = fetchMock;

    const service = createNotificationsService({
      apiGatewayUrl: 'https://explicit-gateway.com',
      internalApiKey: 'explicit-key',
    });
    await service.broadcastToSupervisors(createValidPayload());

    expect(fetchMock).toHaveBeenCalledWith(
      'https://explicit-gateway.com/internal/notifications/broadcast',
      expect.any(Object)
    );
  });
});
