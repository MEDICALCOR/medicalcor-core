/**
 * Twilio Flex Client Tests
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * Uses MSW handlers defined in __mocks__/handlers.ts for HTTP mocking
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlexClient, createFlexClient, getFlexCredentials } from '../flex.js';

describe('FlexClient', () => {
  let client: FlexClient;

  const testConfig = {
    accountSid: 'AC12345678901234567890123456789012',
    authToken: 'test_auth_token',
    workspaceSid: 'WS12345678901234567890123456789012',
  };

  beforeEach(() => {
    client = new FlexClient(testConfig);
  });

  afterEach(() => {
    client.destroy();
  });

  describe('constructor', () => {
    it('should create client with required config', () => {
      expect(client).toBeInstanceOf(FlexClient);
    });

    it('should use default base URL', () => {
      const clientWithDefaults = createFlexClient(testConfig);
      expect(clientWithDefaults).toBeInstanceOf(FlexClient);
      clientWithDefaults.destroy();
    });
  });

  describe('listWorkers', () => {
    it('should fetch workers from TaskRouter API', async () => {
      const workers = await client.listWorkers();

      expect(workers).toHaveLength(1);
      expect(workers[0]).toMatchObject({
        workerSid: 'WK12345678901234567890123456789012',
        friendlyName: 'Agent Smith',
        activityName: 'available',
        available: true,
        skills: ['dental'],
        languages: ['ro', 'en'],
      });
    });
  });

  describe('listQueues', () => {
    it('should fetch task queues', async () => {
      const queues = await client.listQueues();

      expect(queues).toHaveLength(1);
      expect(queues[0]).toMatchObject({
        queueSid: 'WQ12345678901234567890123456789012',
        friendlyName: 'Dental Inquiries',
        currentSize: 3,
      });
    });
  });

  describe('createTask', () => {
    it('should create a new task', async () => {
      const task = await client.createTask({
        workflowSid: 'WW12345678901234567890123456789012',
        attributes: { call_sid: 'CA123', customer_phone: '+40123456789' },
        priority: 50,
      });

      expect(task).toMatchObject({
        queueSid: 'WQ12345678901234567890123456789012',
        assignmentStatus: 'pending',
      });
      expect(task.taskSid).toBeDefined();
    });
  });

  describe('listConferences', () => {
    it('should fetch active conferences', async () => {
      const conferences = await client.listConferences({ status: 'in-progress' });

      expect(conferences).toHaveLength(1);
      expect(conferences[0]).toMatchObject({
        conferenceSid: 'CF12345678901234567890123456789012',
        friendlyName: 'Call-123',
        status: 'in-progress',
      });
    });
  });

  describe('getConferenceParticipants', () => {
    it('should fetch conference participants', async () => {
      const participants = await client.getConferenceParticipants(
        'CF12345678901234567890123456789012'
      );

      expect(participants).toHaveLength(1);
      expect(participants[0]).toMatchObject({
        callSid: 'CA12345678901234567890123456789012',
        muted: false,
        coaching: false,
      });
    });
  });

  describe('addSupervisorToConference', () => {
    it('should add supervisor to conference in listen mode', async () => {
      const result = await client.addSupervisorToConference({
        conferenceSid: 'CF12345678901234567890123456789012',
        supervisorCallSid: 'CA_AGENT',
        mode: 'listen',
      });

      expect(result).toMatchObject({
        callSid: 'CA_SUPERVISOR',
        success: true,
      });
    });

    it('should add supervisor in whisper mode', async () => {
      const result = await client.addSupervisorToConference({
        conferenceSid: 'CF12345678901234567890123456789012',
        supervisorCallSid: 'CA_AGENT',
        mode: 'whisper',
      });

      expect(result.success).toBe(true);
    });

    it('should add supervisor in barge mode', async () => {
      const result = await client.addSupervisorToConference({
        conferenceSid: 'CF12345678901234567890123456789012',
        supervisorCallSid: 'CA_AGENT',
        mode: 'barge',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('updateParticipant', () => {
    it('should update participant mute status', async () => {
      // This should not throw - MSW handler returns success
      await expect(
        client.updateParticipant(
          'CF12345678901234567890123456789012',
          'CA12345678901234567890123456789012',
          {
            muted: true,
          }
        )
      ).resolves.not.toThrow();
    });
  });

  describe('getWorkerStats', () => {
    it('should calculate worker statistics', async () => {
      const stats = await client.getWorkerStats();

      // MSW returns 1 worker (Available), so stats should reflect that
      expect(stats).toMatchObject({
        totalWorkers: 1,
        available: 1,
        busy: 0,
        onBreak: 0,
        offline: 0,
      });
    });
  });

  describe('updateWorker', () => {
    it('should update worker activity', async () => {
      const result = await client.updateWorker({
        workerSid: 'WK12345678901234567890123456789012',
        activitySid: 'WA1',
      });

      expect(result).toMatchObject({
        workerSid: 'WK12345678901234567890123456789012',
      });
    });
  });

  describe('Active Calls Cache', () => {
    it('should register and retrieve active calls', () => {
      const mockCall = {
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
        flags: [],
        recentTranscript: [],
      };

      client.registerActiveCall(mockCall);

      const activeCalls = client.getActiveCalls();
      expect(activeCalls).toHaveLength(1);
      expect(activeCalls[0].callSid).toBe('CA123');
    });

    it('should update active call', () => {
      const mockCall = {
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
        flags: [],
        recentTranscript: [],
      };

      client.registerActiveCall(mockCall);
      client.updateActiveCall('CA123', { duration: 60 });

      const call = client.getActiveCall('CA123');
      expect(call?.duration).toBe(60);
    });

    it('should remove active call', () => {
      const mockCall = {
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
        flags: [],
        recentTranscript: [],
      };

      client.registerActiveCall(mockCall);
      client.removeActiveCall('CA123');

      expect(client.getActiveCalls()).toHaveLength(0);
    });
  });

  describe('verifySignature', () => {
    it('should verify valid Twilio signature', () => {
      const authToken = 'test_token';
      const url = 'https://example.com/webhook';
      const params = { CallSid: 'CA123', From: '+1234567890' };

      // Generate valid signature
      const crypto = require('crypto');
      let data = url;
      Object.keys(params)
        .sort()
        .forEach((key) => {
          data += key + params[key as keyof typeof params];
        });
      const signature = crypto.createHmac('sha1', authToken).update(data, 'utf-8').digest('base64');

      const isValid = FlexClient.verifySignature(authToken, signature, url, params);
      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const isValid = FlexClient.verifySignature(
        'test_token',
        'invalid_signature',
        'https://example.com/webhook',
        { CallSid: 'CA123' }
      );
      expect(isValid).toBe(false);
    });
  });

  describe('getFlexCredentials', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return null when credentials are missing', () => {
      delete process.env.TWILIO_ACCOUNT_SID;
      delete process.env.TWILIO_AUTH_TOKEN;
      delete process.env.TWILIO_FLEX_WORKSPACE_SID;

      const credentials = getFlexCredentials();
      expect(credentials).toBeNull();
    });

    it('should return credentials when all required vars are set', () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token123';
      process.env.TWILIO_FLEX_WORKSPACE_SID = 'WS123';
      process.env.TWILIO_FLEX_FLOW_SID = 'FW123';

      const credentials = getFlexCredentials();
      expect(credentials).toMatchObject({
        accountSid: 'AC123',
        authToken: 'token123',
        workspaceSid: 'WS123',
        flexFlowSid: 'FW123',
      });
    });
  });
});
