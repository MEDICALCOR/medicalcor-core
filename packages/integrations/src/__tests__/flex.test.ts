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

  describe('getWorker', () => {
    it('should fetch a specific worker', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK12345678901234567890123456789012',
              friendly_name: 'Agent Smith',
              activity_name: 'Available',
              activity_sid: 'WA123',
              available: true,
              attributes: JSON.stringify({ skills: ['dental'], languages: ['ro'] }),
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK12345678901234567890123456789012');

      expect(worker.workerSid).toBe('WK12345678901234567890123456789012');
      expect(worker.friendlyName).toBe('Agent Smith');
      expect(worker.skills).toContain('dental');
    });
  });

  describe('updateWorker', () => {
    it('should update worker activity', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Agent Smith',
              activity_name: 'Busy',
              activity_sid: 'WA456',
              available: false,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.updateWorker({
        workerSid: 'WK123',
        activitySid: 'WA456',
      });

      expect(worker.activityName).toBe('busy');
      expect(capturedBody).toContain('ActivitySid=WA456');
    });

    it('should update worker attributes', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Agent Smith',
              activity_name: 'Available',
              activity_sid: 'WA123',
              available: true,
              attributes: JSON.stringify({ skills: ['dental', 'implants'] }),
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      await client.updateWorker({
        workerSid: 'WK123',
        attributes: { skills: ['dental', 'implants'] },
      });

      expect(capturedBody).toContain('Attributes=');
    });
  });

  describe('getQueueStats', () => {
    it('should fetch queue statistics', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues/:queueSid/Statistics',
          () => {
            return HttpResponse.json({
              realtime: {
                tasks_by_status: { pending: 3, reserved: 2, assigned: 5 },
                longest_task_waiting_age: 120,
                average_task_acceptance_time: 45,
                total_tasks: 100,
              },
            });
          }
        )
      );

      const stats = await client.getQueueStats('WQ123');

      expect(stats.queueSid).toBe('WQ123');
      expect(stats.currentSize).toBe(5); // pending + reserved
      expect(stats.longestWaitTime).toBe(120);
      expect(stats.averageWaitTime).toBe(45);
      expect(stats.tasksToday).toBe(100);
    });

    it('should handle missing optional stats fields', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues/:queueSid/Statistics',
          () => {
            return HttpResponse.json({
              realtime: {
                tasks_by_status: {},
              },
            });
          }
        )
      );

      const stats = await client.getQueueStats('WQ123');

      expect(stats.currentSize).toBe(0);
      expect(stats.longestWaitTime).toBe(0);
      expect(stats.averageWaitTime).toBe(0);
    });
  });

  describe('getTask', () => {
    it('should fetch a specific task', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid', () => {
          return HttpResponse.json({
            sid: 'WT123',
            queue_sid: 'WQ123',
            worker_sid: 'WK123',
            attributes: JSON.stringify({ call_sid: 'CA123', customer_phone: '+40123456789' }),
            assignment_status: 'assigned',
            priority: 10,
            reason: null,
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
            timeout: 120,
          });
        })
      );

      const task = await client.getTask('WT123');

      expect(task.taskSid).toBe('WT123');
      expect(task.workerSid).toBe('WK123');
      expect(task.assignmentStatus).toBe('assigned');
      expect(task.callSid).toBe('CA123');
    });
  });

  describe('updateTask', () => {
    it('should update task assignment status', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'completed',
              priority: 10,
              reason: 'Task finished',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      const task = await client.updateTask('WT123', {
        assignmentStatus: 'completed',
        reason: 'Task finished',
      });

      expect(task.assignmentStatus).toBe('completed');
      expect(capturedBody).toContain('AssignmentStatus=completed');
      expect(capturedBody).toContain('Reason=Task');
    });
  });

  describe('removeParticipant', () => {
    it('should remove participant from conference', async () => {
      let capturedUrl = '';
      server.use(
        http.delete(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants/:callSid.json',
          ({ request }) => {
            capturedUrl = request.url;
            return new HttpResponse(null, { status: 204 });
          }
        )
      );

      await client.removeParticipant('CF123', 'CA456');

      expect(capturedUrl).toContain('Participants/CA456');
    });
  });

  describe('initiateWarmTransfer', () => {
    it('should add new participant for warm transfer', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants.json',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({ call_sid: 'CA_TRANSFER' }, { status: 201 });
          }
        )
      );

      const result = await client.initiateWarmTransfer('CF123', '+40123456789');

      expect(result.callSid).toBe('CA_TRANSFER');
      expect(capturedBody).toContain('To=%2B40123456789');
      expect(capturedBody).toContain('EarlyMedia=true');
    });
  });

  describe('initiateColdTransfer', () => {
    it('should redirect call for cold transfer', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Calls/:callSid.json',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({ sid: 'CA123' });
          }
        )
      );

      await client.initiateColdTransfer('CA123', '+40123456789');

      expect(capturedBody).toContain('Twiml=');
      expect(capturedBody).toContain('Dial');
    });
  });

  describe('getDashboardStats', () => {
    it('should aggregate dashboard statistics', async () => {
      // Mock listWorkers
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
                activity_name: 'Offline',
                activity_sid: 'WA2',
                available: false,
                attributes: '{}',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      // Mock listQueues
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues', () => {
          return HttpResponse.json({
            task_queues: [
              {
                sid: 'WQ1',
                friendly_name: 'Queue 1',
                current_size: 3,
              },
              {
                sid: 'WQ2',
                friendly_name: 'Queue 2',
                current_size: 2,
              },
            ],
          });
        })
      );

      // Mock listConferences
      server.use(
        http.get('https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences.json', () => {
          return HttpResponse.json({
            conferences: [
              {
                sid: 'CF1',
                friendly_name: 'Call-1',
                status: 'in-progress',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const stats = await client.getDashboardStats();

      expect(stats.agentsAvailable).toBe(1);
      expect(stats.agentsOffline).toBe(1);
      expect(stats.callsInQueue).toBe(5); // 3 + 2
      expect(stats.activeCalls).toBe(1);
      expect(stats.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('worker activity mapping', () => {
    it('should map reserved activity to busy', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'Reserved',
                activity_sid: 'WA1',
                available: false,
                attributes: '{}',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers[0].activityName).toBe('busy');
    });

    it('should map wrap-up activity correctly', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'WrapUp',
                activity_sid: 'WA1',
                available: false,
                attributes: '{}',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers[0].activityName).toBe('wrap-up');
    });

    it('should default to unavailable for unknown activity', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'CustomActivity',
                activity_sid: 'WA1',
                available: false,
                attributes: '{}',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers[0].activityName).toBe('unavailable');
    });
  });

  describe('task assignment status mapping', () => {
    it('should map all assignment statuses correctly', async () => {
      const statuses = ['pending', 'reserved', 'assigned', 'wrapping', 'completed', 'canceled'];

      for (const status of statuses) {
        server.use(
          http.get(
            'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
            () => {
              return HttpResponse.json({
                sid: 'WT123',
                queue_sid: 'WQ123',
                worker_sid: null,
                attributes: '{}',
                assignment_status: status,
                priority: 10,
                reason: null,
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
                timeout: 120,
              });
            }
          )
        );

        const task = await client.getTask('WT123');
        expect(task.assignmentStatus).toBe(status);
      }
    });

    it('should default to pending for unknown status', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid', () => {
          return HttpResponse.json({
            sid: 'WT123',
            queue_sid: 'WQ123',
            worker_sid: null,
            attributes: '{}',
            assignment_status: 'unknown_status',
            priority: 10,
            reason: null,
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
            timeout: 120,
          });
        })
      );

      const task = await client.getTask('WT123');
      expect(task.assignmentStatus).toBe('pending');
    });
  });

  describe('worker attributes parsing', () => {
    it('should handle invalid JSON attributes', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'Available',
                activity_sid: 'WA1',
                available: true,
                attributes: 'invalid-json',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers[0].skills).toEqual([]);
      expect(workers[0].languages).toEqual([]);
    });

    it('should handle non-array skills and languages', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'Available',
                activity_sid: 'WA1',
                available: true,
                attributes: JSON.stringify({ skills: 'not-an-array', languages: null }),
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers[0].skills).toEqual([]);
      expect(workers[0].languages).toEqual([]);
    });
  });

  describe('task attributes parsing', () => {
    it('should handle invalid JSON task attributes', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid', () => {
          return HttpResponse.json({
            sid: 'WT123',
            queue_sid: 'WQ123',
            worker_sid: null,
            attributes: 'invalid-json',
            assignment_status: 'pending',
            priority: 10,
            reason: null,
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
            timeout: 120,
          });
        })
      );

      const task = await client.getTask('WT123');
      expect(task.callSid).toBeUndefined();
      expect(task.customerPhone).toBeUndefined();
    });
  });

  describe('supervisor barge mode', () => {
    it('should add supervisor in barge mode', async () => {
      let capturedBody = '';
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
        conferenceSid: 'CF123',
        supervisorCallSid: 'CA_AGENT',
        mode: 'barge',
      });

      expect(result.success).toBe(true);
      // In barge mode, muted should be false
      expect(capturedBody).toContain('Muted=false');
      expect(capturedBody).toContain('Coaching=false');
    });
  });

  describe('listWorkers with filters', () => {
    it('should filter by available status', async () => {
      let capturedUrl = '';
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers',
          ({ request }) => {
            capturedUrl = request.url;
            return HttpResponse.json({ workers: [] });
          }
        )
      );

      await client.listWorkers({ available: true });
      expect(capturedUrl).toContain('Available=true');
    });

    it('should filter by target workers expression', async () => {
      let capturedUrl = '';
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers',
          ({ request }) => {
            capturedUrl = request.url;
            return HttpResponse.json({ workers: [] });
          }
        )
      );

      await client.listWorkers({ targetWorkersExpression: 'skills HAS "dental"' });
      expect(capturedUrl).toContain('TargetWorkersExpression=');
    });
  });

  describe('createTask with all options', () => {
    it('should create task with timeout and task channel', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json(
              {
                sid: 'WT123',
                queue_sid: 'WQ123',
                worker_sid: null,
                attributes: '{}',
                assignment_status: 'pending',
                priority: 100,
                reason: null,
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
                timeout: 300,
              },
              { status: 201 }
            );
          }
        )
      );

      await client.createTask({
        workflowSid: 'WW123',
        attributes: { call_sid: 'CA123' },
        priority: 100,
        timeout: 300,
        taskChannel: 'voice',
      });

      expect(capturedBody).toContain('Priority=100');
      expect(capturedBody).toContain('Timeout=300');
      expect(capturedBody).toContain('TaskChannel=voice');
    });
  });

  describe('active call updates', () => {
    it('should not update non-existent call', () => {
      // Update a call that doesn't exist - should not throw
      client.updateActiveCall('CA_NONEXISTENT', { duration: 60 });

      // Verify nothing was added
      expect(client.getActiveCalls()).toHaveLength(0);
    });

    it('should return undefined for non-existent call', () => {
      const call = client.getActiveCall('CA_NONEXISTENT');
      expect(call).toBeUndefined();
    });
  });

  describe('updateParticipant with all options', () => {
    it('should update hold and coaching status', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants/:participantSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({ call_sid: 'CA123' });
          }
        )
      );

      await client.updateParticipant('CF123', 'CA456', {
        muted: false,
        hold: true,
        coaching: true,
      });

      expect(capturedBody).toContain('Muted=false');
      expect(capturedBody).toContain('Hold=true');
      expect(capturedBody).toContain('Coaching=true');
    });
  });

  describe('client configuration', () => {
    it('should use custom base URL', () => {
      const customClient = createFlexClient({
        ...testConfig,
        baseUrl: 'https://custom.taskrouter.twilio.com/v1',
      });
      expect(customClient).toBeInstanceOf(FlexClient);
      customClient.destroy();
    });

    it('should use custom timeout', () => {
      const customClient = createFlexClient({
        ...testConfig,
        timeoutMs: 60000,
      });
      expect(customClient).toBeInstanceOf(FlexClient);
      customClient.destroy();
    });

    it('should use custom retry config', () => {
      const customClient = createFlexClient({
        ...testConfig,
        retryConfig: { maxRetries: 5, baseDelayMs: 2000 },
      });
      expect(customClient).toBeInstanceOf(FlexClient);
      customClient.destroy();
    });
  });

  describe('getWorkerStats edge cases', () => {
    it('should handle wrap-up workers as busy', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'Wrap-Up',
                activity_sid: 'WA1',
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
      expect(stats.busy).toBe(1);
    });

    it('should handle offline workers', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'Offline',
                activity_sid: 'WA1',
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
      expect(stats.offline).toBe(1);
    });
  });

  describe('requestWithTimeout edge cases', () => {
    it('should handle non-JSON responses', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return new HttpResponse('OK', {
            status: 200,
            headers: { 'Content-Type': 'text/plain' },
          });
        })
      );

      await expect(client.listWorkers()).rejects.toThrow();
    });

    it('should handle request timeout', async () => {
      const timeoutClient = new FlexClient({
        ...testConfig,
        timeoutMs: 100,
      });

      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return HttpResponse.json({ workers: [] });
        })
      );

      await expect(timeoutClient.listWorkers()).rejects.toThrow('timeout');
      timeoutClient.destroy();
    });

    it('should handle HTTP error responses', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return new HttpResponse(null, { status: 500 });
        })
      );

      await expect(client.listWorkers()).rejects.toThrow('Request failed with status 500');
    });

    it('should handle network errors', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.error();
        })
      );

      await expect(client.listWorkers()).rejects.toThrow();
    });
  });

  describe('retry configuration', () => {
    it('should use default retry config', () => {
      const retryConfig = (client as any).getRetryConfig();

      expect(retryConfig.maxRetries).toBe(3);
      expect(retryConfig.baseDelayMs).toBe(1000);
      expect(retryConfig.shouldRetry).toBeTypeOf('function');
    });

    it('should use custom retry config', () => {
      const customClient = new FlexClient({
        ...testConfig,
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });

      const retryConfig = (customClient as any).getRetryConfig();

      expect(retryConfig.maxRetries).toBe(5);
      expect(retryConfig.baseDelayMs).toBe(2000);
      customClient.destroy();
    });

    it('should retry on rate_limit errors', () => {
      const retryConfig = (client as any).getRetryConfig();
      const error = new Error('rate_limit exceeded');

      expect(retryConfig.shouldRetry(error)).toBe(true);
    });

    it('should retry on 502 errors', () => {
      const retryConfig = (client as any).getRetryConfig();
      const error = new Error('Request failed with status 502');

      expect(retryConfig.shouldRetry(error)).toBe(true);
    });

    it('should retry on 503 errors', () => {
      const retryConfig = (client as any).getRetryConfig();
      const error = new Error('Request failed with status 503');

      expect(retryConfig.shouldRetry(error)).toBe(true);
    });

    it('should retry on timeout errors', () => {
      const retryConfig = (client as any).getRetryConfig();
      const error = new Error('Request timeout after 30000ms');

      expect(retryConfig.shouldRetry(error)).toBe(true);
    });

    it('should not retry on non-retryable errors', () => {
      const retryConfig = (client as any).getRetryConfig();
      const error = new Error('Bad Request');

      expect(retryConfig.shouldRetry(error)).toBe(false);
    });

    it('should not retry on non-Error objects', () => {
      const retryConfig = (client as any).getRetryConfig();

      expect(retryConfig.shouldRetry('string error')).toBe(false);
      expect(retryConfig.shouldRetry(null)).toBe(false);
      expect(retryConfig.shouldRetry(undefined)).toBe(false);
    });
  });

  describe('encodeFormData edge cases', () => {
    it('should filter out undefined values', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Agent',
              activity_name: 'Available',
              activity_sid: 'WA123',
              available: true,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      await client.updateWorker({ workerSid: 'WK123' });
      expect(capturedBody).not.toContain('ActivitySid');
      expect(capturedBody).not.toContain('Attributes');
    });
  });

  describe('transformWorker edge cases', () => {
    it('should handle non-object parsed JSON', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'Available',
                activity_sid: 'WA1',
                available: true,
                attributes: 'null',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers[0].skills).toEqual([]);
      expect(workers[0].languages).toEqual([]);
      expect(workers[0].attributes).toEqual({});
    });

    it('should extract currentCallSid from attributes', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'Busy',
                activity_sid: 'WA1',
                available: false,
                attributes: JSON.stringify({ current_call_sid: 'CA123456' }),
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers[0].currentCallSid).toBe('CA123456');
    });
  });

  describe('transformQueue edge cases', () => {
    it('should default current_size to 0 when missing', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues', () => {
          return HttpResponse.json({
            task_queues: [
              {
                sid: 'WQ123',
                friendly_name: 'Test Queue',
              },
            ],
          });
        })
      );

      const queues = await client.listQueues();
      expect(queues[0].currentSize).toBe(0);
    });
  });

  describe('createTask without optional parameters', () => {
    it('should create task with only required fields', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json(
              {
                sid: 'WT123',
                queue_sid: 'WQ123',
                worker_sid: null,
                attributes: JSON.stringify({ call_sid: 'CA123' }),
                assignment_status: 'pending',
                priority: 0,
                reason: null,
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
                timeout: 86400,
              },
              { status: 201 }
            );
          }
        )
      );

      await client.createTask({
        workflowSid: 'WW123',
        attributes: { call_sid: 'CA123' },
      });

      expect(capturedBody).not.toContain('Priority');
      expect(capturedBody).not.toContain('Timeout');
      expect(capturedBody).not.toContain('TaskChannel');
    });
  });

  describe('updateTask without optional parameters', () => {
    it('should update task with empty update object', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'pending',
              priority: 10,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      await client.updateTask('WT123', {});
      expect(capturedBody).toBe('');
    });
  });

  describe('updateParticipant without optional parameters', () => {
    it('should update with empty update object', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants/:participantSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({ call_sid: 'CA123' });
          }
        )
      );

      await client.updateParticipant('CF123', 'CA456', {});
      expect(capturedBody).toBe('');
    });
  });

  describe('addSupervisorToConference with CallSidToCoach', () => {
    it('should set CallSidToCoach when in whisper mode', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants.json',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({ call_sid: 'CA_SUPERVISOR' }, { status: 201 });
          }
        )
      );

      await client.addSupervisorToConference({
        conferenceSid: 'CF123',
        supervisorCallSid: 'CA_AGENT_TO_COACH',
        mode: 'whisper',
      });

      expect(capturedBody).toContain('CallSidToCoach=CA_AGENT_TO_COACH');
    });
  });

  describe('cleanupStaleEntries', () => {
    it('should remove stale cache entries', () => {
      const mockCall = {
        callSid: 'CA_OLD',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
        flags: [],
        recentTranscript: [],
      };

      client.registerActiveCall(mockCall);

      const now = Date.now();
      const staleTime = now - 6 * 60 * 1000;
      (client as any).activeCallsCache.get('CA_OLD')!.updatedAt = staleTime;

      const activeCalls = client.getActiveCalls();
      expect(activeCalls).toHaveLength(0);
    });

    it('should keep fresh cache entries', () => {
      const mockCall = {
        callSid: 'CA_FRESH',
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
      expect(activeCalls[0].callSid).toBe('CA_FRESH');
    });
  });

  describe('verifySignature edge cases', () => {
    it('should handle empty param values', () => {
      const authToken = 'test_token';
      const url = 'https://example.com/webhook';
      const params = { CallSid: 'CA123', From: '' };

      const crypto = require('crypto');
      let data = url;
      Object.keys(params)
        .sort()
        .forEach((key) => {
          data += key + (params[key as keyof typeof params] ?? '');
        });
      const signature = crypto.createHmac('sha1', authToken).update(data, 'utf-8').digest('base64');

      const isValid = FlexClient.verifySignature(authToken, signature, url, params);
      expect(isValid).toBe(true);
    });

    it('should handle undefined param values', () => {
      const authToken = 'test_token';
      const url = 'https://example.com/webhook';
      const params: Record<string, string> = { CallSid: 'CA123', From: undefined as any };

      const crypto = require('crypto');
      let data = url;
      Object.keys(params)
        .sort()
        .forEach((key) => {
          data += key + (params[key] ?? '');
        });
      const signature = crypto.createHmac('sha1', authToken).update(data, 'utf-8').digest('base64');

      const isValid = FlexClient.verifySignature(authToken, signature, url, params);
      expect(isValid).toBe(true);
    });

    it('should return false for signature length mismatch', () => {
      const isValid = FlexClient.verifySignature(
        'test_token',
        'short',
        'https://example.com/webhook',
        { CallSid: 'CA123' }
      );
      expect(isValid).toBe(false);
    });
  });

  describe('listConferences without filters', () => {
    it('should list all conferences when no status filter provided', async () => {
      server.use(
        http.get('https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences.json', () => {
          return HttpResponse.json({
            conferences: [
              {
                sid: 'CF1',
                friendly_name: 'Call-1',
                status: 'completed',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
              {
                sid: 'CF2',
                friendly_name: 'Call-2',
                status: 'in-progress',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const conferences = await client.listConferences();
      expect(conferences).toHaveLength(2);
    });
  });

  describe('listWorkers without filters', () => {
    it('should list all workers when no filters provided', async () => {
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
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers).toHaveLength(2);
    });
  });

  describe('transformTask edge cases', () => {
    it('should convert null workerSid to undefined', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid', () => {
          return HttpResponse.json({
            sid: 'WT123',
            queue_sid: 'WQ123',
            worker_sid: null,
            attributes: '{}',
            assignment_status: 'pending',
            priority: 10,
            reason: null,
            date_created: '2024-01-01T00:00:00Z',
            date_updated: '2024-01-01T00:00:00Z',
            timeout: 120,
          });
        })
      );

      const task = await client.getTask('WT123');
      expect(task.workerSid).toBeUndefined();
      expect(task.reason).toBeUndefined();
    });
  });

  describe('mapActivityName edge cases', () => {
    it('should map offline activity', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent',
                activity_name: 'Offline',
                activity_sid: 'WA1',
                available: false,
                attributes: '{}',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const workers = await client.listWorkers();
      expect(workers[0].activityName).toBe('offline');
    });
  });

  describe('getFlexCredentials with missing partial credentials', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should return null when only accountSid is missing', () => {
      process.env.TWILIO_AUTH_TOKEN = 'token123';
      process.env.TWILIO_FLEX_WORKSPACE_SID = 'WS123';

      const credentials = getFlexCredentials();
      expect(credentials).toBeNull();
    });

    it('should return null when only authToken is missing', () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_FLEX_WORKSPACE_SID = 'WS123';

      const credentials = getFlexCredentials();
      expect(credentials).toBeNull();
    });

    it('should return null when only workspaceSid is missing', () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token123';

      const credentials = getFlexCredentials();
      expect(credentials).toBeNull();
    });

    it('should return credentials without flexFlowSid when not set', () => {
      process.env.TWILIO_ACCOUNT_SID = 'AC123';
      process.env.TWILIO_AUTH_TOKEN = 'token123';
      process.env.TWILIO_FLEX_WORKSPACE_SID = 'WS123';
      delete process.env.TWILIO_FLEX_FLOW_SID;

      const credentials = getFlexCredentials();
      expect(credentials).toMatchObject({
        accountSid: 'AC123',
        authToken: 'token123',
        workspaceSid: 'WS123',
      });
      expect(credentials?.flexFlowSid).toBeUndefined();
    });
  });

  describe('getDashboardStats edge cases', () => {
    it('should handle empty queues and conferences', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({ workers: [] });
        }),
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues', () => {
          return HttpResponse.json({ task_queues: [] });
        }),
        http.get('https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences.json', () => {
          return HttpResponse.json({ conferences: [] });
        })
      );

      const stats = await client.getDashboardStats();

      expect(stats.activeCalls).toBe(0);
      expect(stats.callsInQueue).toBe(0);
      expect(stats.averageWaitTime).toBe(0);
      expect(stats.agentsAvailable).toBe(0);
    });

    it('should calculate max wait time across multiple queues', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({ workers: [] });
        }),
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues', () => {
          return HttpResponse.json({
            task_queues: [
              {
                sid: 'WQ1',
                friendly_name: 'Queue 1',
                current_size: 2,
              },
              {
                sid: 'WQ2',
                friendly_name: 'Queue 2',
                current_size: 3,
              },
            ],
          });
        }),
        http.get('https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences.json', () => {
          return HttpResponse.json({ conferences: [] });
        })
      );

      const stats = await client.getDashboardStats();
      expect(stats.callsInQueue).toBe(5);
    });
  });
});
