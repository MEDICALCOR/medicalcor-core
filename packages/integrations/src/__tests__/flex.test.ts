/**
 * Twilio Flex Client Tests
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * These tests use MSW handlers for Twilio API mocking (see __mocks__/handlers.ts)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FlexClient, createFlexClient, getFlexCredentials } from '../flex.js';
import { server } from '../__mocks__/server.js';
import { http, HttpResponse } from 'msw';

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
      // Uses default MSW handler from __mocks__/handlers.ts
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
      let capturedUrl = '';
      // Override to capture the URL and return empty response
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers',
          ({ request }) => {
            capturedUrl = request.url;
            return HttpResponse.json({ workers: [] });
          }
        )
      );

      await client.listWorkers({ activityName: 'Busy' });

      expect(capturedUrl).toContain('ActivityName=Busy');
    });
  });

  describe('listQueues', () => {
    it('should fetch task queues', async () => {
      // Override to include currentSize
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues', () => {
          return HttpResponse.json({
            task_queues: [
              {
                sid: 'WQ12345678901234567890123456789012',
                friendly_name: 'Dental Inquiries',
                target_workers: 'skills HAS "dental"',
                current_size: 5,
              },
            ],
          });
        })
      );

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
      // Override to return specific task data
      server.use(
        http.post('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks', () => {
          return HttpResponse.json(
            {
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
            },
            { status: 201 }
          );
        })
      );

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
      // Override to return list of conferences
      server.use(
        http.get('https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences.json', () => {
          return HttpResponse.json({
            conferences: [
              {
                sid: 'CF12345678901234567890123456789012',
                friendly_name: 'Call-123',
                status: 'in-progress',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

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
      // Uses default MSW handler
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
      let capturedBody = '';
      // Override to capture request body and return supervisor call
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants.json',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({ call_sid: 'CA_SUPERVISOR' }, { status: 201 });
          }
        )
      );

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
      expect(capturedBody).toContain('Muted=true');
    });

    it('should add supervisor in whisper mode with coaching', async () => {
      let capturedBody = '';
      // Override to capture request body
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants.json',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({ call_sid: 'CA_SUPERVISOR' }, { status: 201 });
          }
        )
      );

      const result = await client.addSupervisorToConference({
        conferenceSid: 'CF12345678901234567890123456789012',
        supervisorCallSid: 'CA_AGENT',
        mode: 'whisper',
      });

      expect(result.success).toBe(true);

      // Verify coaching=true for whisper mode
      expect(capturedBody).toContain('Coaching=true');
    });
  });

  describe('updateParticipant', () => {
    it('should update participant mute status', async () => {
      let capturedUrl = '';
      let capturedBody = '';
      // Override to capture request details
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants/:participantSid',
          async ({ request }) => {
            capturedUrl = request.url;
            capturedBody = await request.text();
            return HttpResponse.json({
              call_sid: 'CA12345678901234567890123456789012',
              muted: true,
            });
          }
        )
      );

      await client.updateParticipant(
        'CF12345678901234567890123456789012',
        'CA12345678901234567890123456789012',
        { muted: true }
      );

      expect(capturedUrl).toContain('Participants/CA12345678901234567890123456789012');
      expect(capturedBody).toContain('Muted=true');
    });
  });

  describe('getWorkerStats', () => {
    it('should calculate worker statistics', async () => {
      // Override to return multiple workers with different activities
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
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
          });
        })
      );

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
