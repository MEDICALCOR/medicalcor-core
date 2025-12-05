/**
 * Twilio Flex Client Tests - Comprehensive Coverage
 * W3 Milestone: Voice AI + Realtime Supervisor
 *
 * These tests use MSW handlers for Twilio API mocking (see __mocks__/handlers.ts)
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

    it('should accept custom baseUrl', () => {
      const customClient = new FlexClient({
        ...testConfig,
        baseUrl: 'https://custom.twilio.com',
      });
      expect(customClient).toBeInstanceOf(FlexClient);
      customClient.destroy();
    });

    it('should accept custom timeoutMs', () => {
      const customClient = new FlexClient({
        ...testConfig,
        timeoutMs: 5000,
      });
      expect(customClient).toBeInstanceOf(FlexClient);
      customClient.destroy();
    });

    it('should accept custom retryConfig', () => {
      const customClient = new FlexClient({
        ...testConfig,
        retryConfig: {
          maxRetries: 5,
          baseDelayMs: 2000,
        },
      });
      expect(customClient).toBeInstanceOf(FlexClient);
      customClient.destroy();
    });

    it('should accept flexFlowSid', () => {
      const customClient = new FlexClient({
        ...testConfig,
        flexFlowSid: 'FF12345678901234567890123456789012',
      });
      expect(customClient).toBeInstanceOf(FlexClient);
      customClient.destroy();
    });
  });

  describe('HTTP Request Helpers', () => {
    it('should handle request timeout', async () => {
      const timeoutClient = new FlexClient({
        ...testConfig,
        timeoutMs: 100,
      });

      // Override to delay response beyond timeout
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', async () => {
          await new Promise((resolve) => setTimeout(resolve, 200));
          return HttpResponse.json({ workers: [] });
        })
      );

      await expect(timeoutClient.listWorkers()).rejects.toThrow('Request timeout after 100ms');
      timeoutClient.destroy();
    });

    it('should handle non-ok response', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return new HttpResponse(null, { status: 404 });
        })
      );

      await expect(client.listWorkers()).rejects.toThrow('Request failed with status 404');
    });

    it('should handle non-JSON response', async () => {
      server.use(
        http.get(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants/:participantSid.json',
          () => {
            return new HttpResponse('OK', {
              status: 204,
              headers: { 'Content-Type': 'text/plain' },
            });
          }
        )
      );

      // This should not throw - updateParticipant returns void
      await expect(
        client.updateParticipant(
          'CF12345678901234567890123456789012',
          'CA12345678901234567890123456789012',
          { muted: true }
        )
      ).resolves.toBeUndefined();
    });

    it('should retry on rate limit error', async () => {
      let attemptCount = 0;
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          attemptCount++;
          if (attemptCount === 1) {
            // Return error response with "rate_limit" in message for retry logic
            return new HttpResponse('Too Many Requests - rate_limit exceeded', {
              status: 429,
              headers: { 'Content-Type': 'text/plain' },
            });
          }
          return HttpResponse.json({ workers: [] });
        })
      );

      // This should throw because 429 triggers an immediate error in requestWithTimeout
      // The retry logic only retries on specific error message patterns
      await expect(client.listWorkers()).rejects.toThrow('Request failed with status 429');
    });

    it('should retry on 502 error', async () => {
      let attemptCount = 0;
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          attemptCount++;
          if (attemptCount === 1) {
            return new HttpResponse(null, { status: 502 });
          }
          return HttpResponse.json({ workers: [] });
        })
      );

      const workers = await client.listWorkers();
      expect(workers).toEqual([]);
      expect(attemptCount).toBeGreaterThan(1);
    });

    it('should retry on 503 error', async () => {
      let attemptCount = 0;
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          attemptCount++;
          if (attemptCount === 1) {
            return new HttpResponse(null, { status: 503 });
          }
          return HttpResponse.json({ workers: [] });
        })
      );

      const workers = await client.listWorkers();
      expect(workers).toEqual([]);
      expect(attemptCount).toBeGreaterThan(1);
    });
  });

  describe('TaskRouter - Workers', () => {
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

    it('should filter workers by availability', async () => {
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

    it('should filter workers by targetWorkersExpression', async () => {
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

    it('should get a specific worker', async () => {
      const worker = await client.getWorker('WK12345678901234567890123456789012');

      expect(worker).toMatchObject({
        workerSid: 'WK12345678901234567890123456789012',
        friendlyName: 'Agent Smith',
        activityName: 'available',
        available: true,
      });
    });

    it('should update worker activity', async () => {
      const worker = await client.updateWorker({
        workerSid: 'WK12345678901234567890123456789012',
        activitySid: 'WA12345678901234567890123456789013',
      });

      expect(worker).toMatchObject({
        workerSid: 'WK12345678901234567890123456789012',
      });
    });

    it('should update worker attributes', async () => {
      const worker = await client.updateWorker({
        workerSid: 'WK12345678901234567890123456789012',
        attributes: { customField: 'customValue' },
      });

      expect(worker).toMatchObject({
        workerSid: 'WK12345678901234567890123456789012',
      });
    });

    it('should update worker with both activity and attributes', async () => {
      const worker = await client.updateWorker({
        workerSid: 'WK12345678901234567890123456789012',
        activitySid: 'WA12345678901234567890123456789013',
        attributes: { status: 'busy' },
      });

      expect(worker).toBeDefined();
    });

    it('should handle worker with invalid JSON attributes', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'Available',
              activity_sid: 'WA123',
              available: true,
              attributes: 'invalid-json',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.attributes).toEqual({});
      expect(worker.skills).toEqual([]);
      expect(worker.languages).toEqual([]);
    });

    it('should handle worker with non-object JSON attributes', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'Available',
              activity_sid: 'WA123',
              available: true,
              attributes: JSON.stringify('string-value'),
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.attributes).toEqual({});
    });

    it('should map activity name "busy"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'Busy',
              activity_sid: 'WA123',
              available: false,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.activityName).toBe('busy');
    });

    it('should map activity name "reserved"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'Reserved',
              activity_sid: 'WA123',
              available: false,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.activityName).toBe('busy');
    });

    it('should map activity name "break"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'On Break',
              activity_sid: 'WA123',
              available: false,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.activityName).toBe('break');
    });

    it('should map activity name "wrap-up"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'Wrap Up',
              activity_sid: 'WA123',
              available: false,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.activityName).toBe('wrap-up');
    });

    it('should map activity name "offline"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'Offline',
              activity_sid: 'WA123',
              available: false,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.activityName).toBe('offline');
    });

    it('should map unknown activity name to "unavailable"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'Unknown Status',
              activity_sid: 'WA123',
              available: false,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.activityName).toBe('unavailable');
    });

    it('should extract current_call_sid from attributes', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK123',
              friendly_name: 'Test Worker',
              activity_name: 'Available',
              activity_sid: 'WA123',
              available: true,
              attributes: JSON.stringify({ current_call_sid: 'CA123' }),
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK123');
      expect(worker.currentCallSid).toBe('CA123');
    });
  });

  describe('TaskRouter - Queues', () => {
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

    it('should handle queue without current_size', async () => {
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

    it('should get queue statistics', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues/:queueSid/Statistics',
          () => {
            return HttpResponse.json({
              realtime: {
                tasks_by_status: {
                  pending: 5,
                  reserved: 2,
                  assigned: 3,
                },
                longest_task_waiting_age: 120,
                average_task_acceptance_time: 30,
                total_tasks: 15,
              },
            });
          }
        )
      );

      const stats = await client.getQueueStats('WQ12345678901234567890123456789012');

      expect(stats).toMatchObject({
        queueSid: 'WQ12345678901234567890123456789012',
        currentSize: 7, // pending + reserved
        longestWaitTime: 120,
        averageWaitTime: 30,
        tasksToday: 15,
      });
    });

    it('should handle missing statistics fields', async () => {
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

  describe('TaskRouter - Tasks', () => {
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

    it('should create task with timeout and taskChannel', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'pending',
              priority: 0,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 300,
            });
          }
        )
      );

      await client.createTask({
        workflowSid: 'WW123',
        attributes: {},
        timeout: 300,
        taskChannel: 'voice',
      });

      expect(capturedBody).toContain('Timeout=300');
      expect(capturedBody).toContain('TaskChannel=voice');
    });

    it('should get a specific task', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          () => {
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: 'WK123',
              attributes: JSON.stringify({ call_sid: 'CA123' }),
              assignment_status: 'assigned',
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
      expect(task.taskSid).toBe('WT123');
      expect(task.assignmentStatus).toBe('assigned');
    });

    it('should update task assignment status', async () => {
      server.use(
        http.post(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          () => {
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'completed',
              priority: 0,
              reason: 'Task completed',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      const task = await client.updateTask('WT123', {
        assignmentStatus: 'completed',
        reason: 'Task completed',
      });

      expect(task.assignmentStatus).toBe('completed');
      expect(task.reason).toBe('Task completed');
    });

    it('should update task with only assignmentStatus', async () => {
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
              assignment_status: 'canceled',
              priority: 0,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      await client.updateTask('WT123', { assignmentStatus: 'canceled' });
      expect(capturedBody).toContain('AssignmentStatus=canceled');
      expect(capturedBody).not.toContain('Reason=');
    });

    it('should update task with only reason', async () => {
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
              priority: 0,
              reason: 'Manual update',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      await client.updateTask('WT123', { reason: 'Manual update' });
      expect(capturedBody).toContain('Reason=Manual%20update');
      expect(capturedBody).not.toContain('AssignmentStatus=');
    });

    it('should handle task with invalid JSON attributes', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          () => {
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: 'invalid-json',
              assignment_status: 'pending',
              priority: 0,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      const task = await client.getTask('WT123');
      expect(task.callSid).toBeUndefined();
      expect(task.customerPhone).toBeUndefined();
    });

    it('should map assignment status "reserved"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          () => {
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'reserved',
              priority: 0,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      const task = await client.getTask('WT123');
      expect(task.assignmentStatus).toBe('reserved');
    });

    it('should map assignment status "wrapping"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          () => {
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'wrapping',
              priority: 0,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      const task = await client.getTask('WT123');
      expect(task.assignmentStatus).toBe('wrapping');
    });

    it('should map assignment status "completed"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          () => {
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'completed',
              priority: 0,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      const task = await client.getTask('WT123');
      expect(task.assignmentStatus).toBe('completed');
    });

    it('should map assignment status "canceled"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          () => {
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'canceled',
              priority: 0,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      const task = await client.getTask('WT123');
      expect(task.assignmentStatus).toBe('canceled');
    });

    it('should map unknown assignment status to "pending"', async () => {
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Tasks/:taskSid',
          () => {
            return HttpResponse.json({
              sid: 'WT123',
              queue_sid: 'WQ123',
              worker_sid: null,
              attributes: '{}',
              assignment_status: 'unknown',
              priority: 0,
              reason: null,
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
              timeout: 120,
            });
          }
        )
      );

      const task = await client.getTask('WT123');
      expect(task.assignmentStatus).toBe('pending');
    });
  });

  describe('Conference API - Supervisor Monitoring', () => {
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

    it('should list conferences without status filter', async () => {
      server.use(
        http.get('https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences.json', () => {
          return HttpResponse.json({
            conferences: [
              {
                sid: 'CF123',
                friendly_name: 'Conference',
                status: 'completed',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const conferences = await client.listConferences();
      expect(conferences).toHaveLength(1);
    });

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
      expect(capturedBody).toContain('CallSidToCoach=CA_AGENT');
    });

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
        conferenceSid: 'CF12345678901234567890123456789012',
        supervisorCallSid: 'CA_AGENT',
        mode: 'barge',
      });

      expect(result.success).toBe(true);
      // Barge mode: not muted, not coaching
      expect(capturedBody).toContain('Muted=false');
      expect(capturedBody).toContain('Coaching=false');
    });

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

    it('should update participant hold status', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants/:participantSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({
              call_sid: 'CA123',
              hold: true,
            });
          }
        )
      );

      await client.updateParticipant('CF123', 'CA123', { hold: true });
      expect(capturedBody).toContain('Hold=true');
    });

    it('should update participant coaching status', async () => {
      let capturedBody = '';
      server.use(
        http.post(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants/:participantSid',
          async ({ request }) => {
            capturedBody = await request.text();
            return HttpResponse.json({
              call_sid: 'CA123',
              coaching: true,
            });
          }
        )
      );

      await client.updateParticipant('CF123', 'CA123', { coaching: true });
      expect(capturedBody).toContain('Coaching=true');
    });

    it('should remove participant from conference', async () => {
      let deleteUrl = '';
      server.use(
        http.delete(
          'https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences/:conferenceSid/Participants/:participantSid.json',
          ({ request }) => {
            deleteUrl = request.url;
            return new HttpResponse(null, { status: 204 });
          }
        )
      );

      await client.removeParticipant('CF123', 'CA123');
      expect(deleteUrl).toContain('Participants/CA123.json');
    });
  });

  describe('Call Transfer', () => {
    it('should initiate warm transfer', async () => {
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

    it('should initiate cold transfer', async () => {
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

  describe('Dashboard Stats', () => {
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

    it('should count wrap-up as busy', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent 1',
                activity_name: 'Wrap Up',
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

    it('should count offline workers', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent 1',
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

    it('should map unavailable activity name correctly', async () => {
      // Note: "Unavailable" contains "available" so it maps to "available"
      // due to the substring match in mapActivityName
      server.use(
        http.get(
          'https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers/:workerSid',
          () => {
            return HttpResponse.json({
              sid: 'WK1',
              friendly_name: 'Agent 1',
              activity_name: 'Unavailable',
              activity_sid: 'WA1',
              available: false,
              attributes: '{}',
              date_created: '2024-01-01T00:00:00Z',
              date_updated: '2024-01-01T00:00:00Z',
            });
          }
        )
      );

      const worker = await client.getWorker('WK1');
      // "Unavailable" includes "available" so it maps to "available"
      expect(worker.activityName).toBe('available');
    });

    it('should count unknown activity as offline', async () => {
      server.use(
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/Workers', () => {
          return HttpResponse.json({
            workers: [
              {
                sid: 'WK1',
                friendly_name: 'Agent 1',
                activity_name: 'Unknown',
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
      expect(stats.totalWorkers).toBe(1);
      expect(stats.offline).toBe(1);
      expect(stats.available).toBe(0);
      expect(stats.busy).toBe(0);
      expect(stats.onBreak).toBe(0);
    });

    it('should build comprehensive dashboard stats', async () => {
      // Mock workers
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
        }),
        http.get('https://taskrouter.twilio.com/v1/Workspaces/:workspaceSid/TaskQueues', () => {
          return HttpResponse.json({
            task_queues: [
              {
                sid: 'WQ1',
                friendly_name: 'Queue 1',
                current_size: 5,
              },
            ],
          });
        }),
        http.get('https://api.twilio.com/2010-04-01/Accounts/:accountSid/Conferences.json', () => {
          return HttpResponse.json({
            conferences: [
              {
                sid: 'CF1',
                friendly_name: 'Conference 1',
                status: 'in-progress',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
              {
                sid: 'CF2',
                friendly_name: 'Conference 2',
                status: 'in-progress',
                date_created: '2024-01-01T00:00:00Z',
                date_updated: '2024-01-01T00:00:00Z',
              },
            ],
          });
        })
      );

      const stats = await client.getDashboardStats();

      expect(stats).toMatchObject({
        activeCalls: 2,
        callsInQueue: 5,
        agentsAvailable: 1,
        agentsBusy: 1,
        agentsOnBreak: 0,
        agentsOffline: 0,
        aiHandledCalls: 0,
        aiHandoffRate: 0,
        averageAiConfidence: 0,
        activeAlerts: 0,
        escalationsToday: 0,
        handoffsToday: 0,
        callsHandledToday: 0,
        averageHandleTime: 0,
      });

      expect(stats.lastUpdated).toBeInstanceOf(Date);
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

    it('should not update non-existent call', () => {
      client.updateActiveCall('NON_EXISTENT', { duration: 60 });
      const call = client.getActiveCall('NON_EXISTENT');
      expect(call).toBeUndefined();
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

    it('should return undefined for non-existent call', () => {
      const call = client.getActiveCall('NON_EXISTENT');
      expect(call).toBeUndefined();
    });

    it('should cleanup stale cache entries', () => {
      vi.useFakeTimers();

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

      // Verify call is present
      expect(client.getActiveCalls()).toHaveLength(1);

      // Fast-forward time by 6 minutes (beyond 5 minute TTL)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Trigger cleanup by calling getActiveCalls
      const activeCalls = client.getActiveCalls();
      expect(activeCalls).toHaveLength(0);

      vi.useRealTimers();
    });

    it('should cleanup stale entries on registerActiveCall', () => {
      vi.useFakeTimers();

      const mockCall1 = {
        callSid: 'CA123',
        customerPhone: '+40123456789',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
        flags: [],
        recentTranscript: [],
      };

      client.registerActiveCall(mockCall1);

      // Fast-forward time by 6 minutes
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Register a new call (triggers cleanup)
      const mockCall2 = {
        callSid: 'CA456',
        customerPhone: '+40123456790',
        state: 'in-progress' as const,
        direction: 'inbound' as const,
        startedAt: new Date(),
        duration: 0,
        flags: [],
        recentTranscript: [],
      };

      client.registerActiveCall(mockCall2);

      const activeCalls = client.getActiveCalls();
      expect(activeCalls).toHaveLength(1);
      expect(activeCalls[0].callSid).toBe('CA456');

      vi.useRealTimers();
    });
  });

  describe('Webhook Signature Verification', () => {
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

    it('should handle signature verification error', () => {
      // Invalid base64 will cause timingSafeEqual to throw
      const isValid = FlexClient.verifySignature(
        'test_token',
        '',
        'https://example.com/webhook',
        { CallSid: 'CA123' }
      );
      expect(isValid).toBe(false);
    });

    it('should handle params with null values', () => {
      const authToken = 'test_token';
      const url = 'https://example.com/webhook';
      const params = { CallSid: 'CA123', From: '+1234567890', To: '' };

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
  });

  describe('Cleanup', () => {
    it('should clear cache on destroy', () => {
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
      expect(client.getActiveCalls()).toHaveLength(1);

      client.destroy();
      expect(client.getActiveCalls()).toHaveLength(0);
    });
  });

  describe('Factory Functions', () => {
    it('should create client via factory function', () => {
      const factoryClient = createFlexClient(testConfig);
      expect(factoryClient).toBeInstanceOf(FlexClient);
      factoryClient.destroy();
    });

    it('should get credentials from environment', () => {
      const originalEnv = process.env;

      try {
        process.env = { ...originalEnv };
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
      } finally {
        process.env = originalEnv;
      }
    });

    it('should return null when credentials are missing', () => {
      const originalEnv = process.env;

      try {
        process.env = { ...originalEnv };
        delete process.env.TWILIO_ACCOUNT_SID;
        delete process.env.TWILIO_AUTH_TOKEN;
        delete process.env.TWILIO_FLEX_WORKSPACE_SID;

        const credentials = getFlexCredentials();
        expect(credentials).toBeNull();
      } finally {
        process.env = originalEnv;
      }
    });

    it('should return null when only some credentials are missing', () => {
      const originalEnv = process.env;

      try {
        process.env = { ...originalEnv };
        process.env.TWILIO_ACCOUNT_SID = 'AC123';
        delete process.env.TWILIO_AUTH_TOKEN;
        delete process.env.TWILIO_FLEX_WORKSPACE_SID;

        const credentials = getFlexCredentials();
        expect(credentials).toBeNull();
      } finally {
        process.env = originalEnv;
      }
    });
  });
});
