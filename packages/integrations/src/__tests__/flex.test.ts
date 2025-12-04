/**
 * Twilio Flex Client Tests
 * W3 Milestone: Voice AI + Realtime Supervisor
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FlexClient, createFlexClient, getFlexCredentials } from '../flex.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('FlexClient', () => {
  let client: FlexClient;

  const testConfig = {
    accountSid: 'AC12345678901234567890123456789012',
    authToken: 'test_auth_token',
    workspaceSid: 'WS12345678901234567890123456789012',
  };

  beforeEach(() => {
    client = new FlexClient(testConfig);
    mockFetch.mockReset();
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
      const mockWorkers = {
        workers: [
          {
            sid: 'WK12345678901234567890123456789012',
            friendly_name: 'Agent Smith',
            activity_name: 'Available',
            activity_sid: 'WA12345678901234567890123456789012',
            available: true,
            attributes: JSON.stringify({ skills: ['dental'], languages: ['ro', 'en'] }),
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockWorkers,
      });

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

    it('should filter workers by activity', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ workers: [] }),
      });

      await client.listWorkers({ activityName: 'Busy' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('ActivityName=Busy'),
        expect.any(Object)
      );
    });
  });

  describe('listQueues', () => {
    it('should fetch task queues', async () => {
      const mockQueues = {
        task_queues: [
          {
            sid: 'WQ12345678901234567890123456789012',
            friendly_name: 'Dental Inquiries',
            target_workers: 'skills HAS "dental"',
            current_size: 5,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockQueues,
      });

      const queues = await client.listQueues();

      expect(queues).toHaveLength(1);
      expect(queues[0]).toMatchObject({
        queueSid: 'WQ12345678901234567890123456789012',
        friendlyName: 'Dental Inquiries',
        currentSize: 5,
      });
    });
  });

  describe('createTask', () => {
    it('should create a new task', async () => {
      const mockTask = {
        sid: 'WT12345678901234567890123456789012',
        queue_sid: 'WQ12345678901234567890123456789012',
        worker_sid: null,
        attributes: JSON.stringify({ call_sid: 'CA123', customer_phone: '+40123456789' }),
        assignment_status: 'pending',
        priority: 50,
        reason: null,
        date_created: '2024-01-01T00:00:00Z',
        date_updated: '2024-01-01T00:00:00Z',
        timeout: 120,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockTask,
      });

      const task = await client.createTask({
        workflowSid: 'WW12345678901234567890123456789012',
        attributes: { call_sid: 'CA123', customer_phone: '+40123456789' },
        priority: 50,
      });

      expect(task).toMatchObject({
        taskSid: 'WT12345678901234567890123456789012',
        queueSid: 'WQ12345678901234567890123456789012',
        assignmentStatus: 'pending',
        priority: 50,
      });
    });
  });

  describe('listConferences', () => {
    it('should fetch active conferences', async () => {
      const mockConferences = {
        conferences: [
          {
            sid: 'CF12345678901234567890123456789012',
            friendly_name: 'Call-123',
            status: 'in-progress',
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockConferences,
      });

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
      const mockParticipants = {
        participants: [
          {
            call_sid: 'CA12345678901234567890123456789012',
            conference_sid: 'CF12345678901234567890123456789012',
            muted: false,
            hold: false,
            coaching: false,
            status: 'connected',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockParticipants,
      });

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
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ call_sid: 'CA_SUPERVISOR' }),
      });

      const result = await client.addSupervisorToConference({
        conferenceSid: 'CF12345678901234567890123456789012',
        supervisorCallSid: 'CA_AGENT',
        mode: 'listen',
      });

      expect(result).toMatchObject({
        callSid: 'CA_SUPERVISOR',
        success: true,
      });

      // Verify muted=true for listen mode
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('Muted=true'),
        })
      );
    });

    it('should add supervisor in whisper mode with coaching', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ call_sid: 'CA_SUPERVISOR' }),
      });

      const result = await client.addSupervisorToConference({
        conferenceSid: 'CF12345678901234567890123456789012',
        supervisorCallSid: 'CA_AGENT',
        mode: 'whisper',
      });

      expect(result.success).toBe(true);

      // Verify coaching=true for whisper mode
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('Coaching=true'),
        })
      );
    });
  });

  describe('updateParticipant', () => {
    it('should update participant mute status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({}),
      });

      await client.updateParticipant(
        'CF12345678901234567890123456789012',
        'CA12345678901234567890123456789012',
        { muted: true }
      );

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('Participants/CA12345678901234567890123456789012'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Muted=true'),
        })
      );
    });
  });

  describe('getWorkerStats', () => {
    it('should calculate worker statistics', async () => {
      const mockWorkers = {
        workers: [
          {
            sid: 'WK1',
            friendly_name: 'Agent 1',
            activity_name: 'Available',
            activity_sid: 'WA1',
            available: true,
            attributes: '{}',
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
          },
          {
            sid: 'WK2',
            friendly_name: 'Agent 2',
            activity_name: 'Busy',
            activity_sid: 'WA2',
            available: false,
            attributes: '{}',
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
          },
          {
            sid: 'WK3',
            friendly_name: 'Agent 3',
            activity_name: 'Break',
            activity_sid: 'WA3',
            available: false,
            attributes: '{}',
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => mockWorkers,
      });

      const stats = await client.getWorkerStats();

      expect(stats).toMatchObject({
        totalWorkers: 3,
        available: 1,
        busy: 1,
        onBreak: 1,
        offline: 0,
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
