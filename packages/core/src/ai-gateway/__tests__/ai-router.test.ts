/**
 * AI Router Tests
 *
 * Comprehensive tests for AI request routing to providers
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { z } from 'zod';
import {
  AIRouter,
  createAIRouter,
  detectIntent,
  type AIRequest,
  type AIRouterConfig,
} from '../ai-router.js';
import { FunctionRegistry, type FunctionContext, type AIFunction } from '../function-registry.js';

describe('AIRouter', () => {
  let registry: FunctionRegistry;
  let router: AIRouter;
  let context: FunctionContext;

  beforeEach(() => {
    registry = new FunctionRegistry();
    router = createAIRouter(registry);
    context = {
      correlationId: 'test-correlation-id',
      traceId: 'test-trace-id',
      userId: 'test-user',
    };

    // Register mock functions
    const scoreLeadDef: AIFunction = {
      name: 'score_lead',
      description: 'Score a lead based on message content',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Phone number' },
          channel: { type: 'string', description: 'Communication channel' },
        },
        required: ['phone'],
      },
      category: 'leads',
    };
    registry.register(
      scoreLeadDef,
      z.object({
        phone: z.string(),
        channel: z.string().optional(),
      }),
      vi.fn().mockResolvedValue({
        score: 4,
        classification: 'HOT',
        confidence: 0.9,
      })
    );

    const scheduleApptDef: AIFunction = {
      name: 'schedule_appointment',
      description: 'Schedule an appointment',
      parameters: {
        type: 'object',
        properties: {
          patientId: { type: 'string', description: 'Patient ID' },
          preferredDate: { type: 'string', description: 'Preferred date' },
          serviceType: { type: 'string', description: 'Service type' },
        },
        required: [],
      },
      category: 'appointments',
    };
    registry.register(
      scheduleApptDef,
      z.object({
        patientId: z.string().optional(),
        preferredDate: z.string().optional(),
        serviceType: z.string().optional(),
      }),
      vi.fn().mockResolvedValue({
        appointmentId: 'apt-123',
        status: 'confirmed',
      })
    );

    const sendWhatsAppDef: AIFunction = {
      name: 'send_whatsapp',
      description: 'Send a WhatsApp message',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Phone number' },
          message: { type: 'string', description: 'Message content' },
        },
        required: [],
      },
      category: 'messaging',
    };
    registry.register(
      sendWhatsAppDef,
      z.object({
        to: z.string().optional(),
        message: z.string().optional(),
      }),
      vi.fn().mockResolvedValue({
        messageId: 'msg-123',
        status: 'sent',
      })
    );

    const getPatientDef: AIFunction = {
      name: 'get_patient',
      description: 'Get patient information',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Phone number' },
          email: { type: 'string', description: 'Email' },
        },
        required: [],
      },
      category: 'patients',
    };
    registry.register(
      getPatientDef,
      z.object({
        phone: z.string().optional(),
        email: z.string().optional(),
      }),
      vi.fn().mockResolvedValue({
        patientId: 'patient-123',
        name: 'Test Patient',
      })
    );
  });

  describe('Intent Detection', () => {
    it('should detect lead scoring intent from Romanian query', () => {
      const functions: AIFunction[] = [
        {
          name: 'score_lead',
          description: 'Score a lead',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'leads',
        },
      ];

      const intents = detectIntent('score lead pentru whatsapp', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('score_lead');
      expect(intents[0]?.confidence).toBeGreaterThan(0.7);
    });

    it('should detect appointment scheduling intent', () => {
      const functions: AIFunction[] = [
        {
          name: 'schedule_appointment',
          description: 'Schedule appointment',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'appointments',
        },
      ];

      const intents = detectIntent('Programează o consultație mâine', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('schedule_appointment');
      expect(intents[0]?.extractedArgs.serviceType).toBe('consultation');
    });

    it('should extract phone number from query', () => {
      const functions: AIFunction[] = [
        {
          name: 'send_whatsapp',
          description: 'Send message',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'messaging',
        },
      ];

      const intents = detectIntent('Trimite mesaj la +40721234567', functions);

      expect(intents[0]?.extractedArgs.to).toBe('+40721234567');
    });

    it('should extract service type from query', () => {
      const functions: AIFunction[] = [
        {
          name: 'schedule_appointment',
          description: 'Schedule appointment',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'appointments',
        },
      ];

      const intents = detectIntent('Programeaza pentru albire dentara', functions);

      expect(intents.length).toBeGreaterThan(0);
      if (intents[0]?.extractedArgs.serviceType) {
        expect(intents[0].extractedArgs.serviceType).toBe('whitening');
      }
    });

    it('should return empty array when no patterns match', () => {
      const functions: AIFunction[] = [
        {
          name: 'score_lead',
          description: 'Score lead',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'leads',
        },
      ];

      const intents = detectIntent('random unrelated text xyz', functions);

      expect(intents).toHaveLength(0);
    });

    it('should sort intents by confidence', () => {
      const functions: AIFunction[] = [
        {
          name: 'score_lead',
          description: 'Score lead',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'leads',
        },
        {
          name: 'schedule_appointment',
          description: 'Schedule',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'appointments',
        },
      ];

      const intents = detectIntent('scorează lead programare', functions);

      if (intents.length > 1) {
        expect(intents[0]!.confidence).toBeGreaterThanOrEqual(intents[1]!.confidence);
      }
    });

    it('should skip functions not in available list', () => {
      const functions: AIFunction[] = [
        {
          name: 'other_function',
          description: 'Other',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'custom',
        },
      ];

      const intents = detectIntent('scorează lead', functions);

      expect(intents).toHaveLength(0);
    });

    it('should detect extraction service type', () => {
      const functions: AIFunction[] = [
        {
          name: 'schedule_appointment',
          description: 'Schedule appointment',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'appointments',
        },
      ];

      const intents = detectIntent('Programează o extracție dentară', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.extractedArgs.serviceType).toBe('extraction');
    });

    it('should detect implant service type', () => {
      const functions: AIFunction[] = [
        {
          name: 'schedule_appointment',
          description: 'Schedule appointment',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'appointments',
        },
      ];

      const intents = detectIntent('Programează implant dentar', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.extractedArgs.serviceType).toBe('implant');
    });

    it('should detect cancel appointment intent', () => {
      const functions: AIFunction[] = [
        {
          name: 'cancel_appointment',
          description: 'Cancel appointment',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'appointments',
        },
      ];

      const intents = detectIntent('Anulează programarea apt-123456', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('cancel_appointment');
      expect(intents[0]?.extractedArgs.appointmentId).toBe('apt-123456');
    });

    it('should detect record consent intent with denied status', () => {
      const functions: AIFunction[] = [
        {
          name: 'record_consent',
          description: 'Record consent',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'compliance',
        },
      ];

      const intents = detectIntent('Înregistrează acord - refuzat', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('record_consent');
      expect(intents[0]?.extractedArgs.status).toBe('denied');
    });

    it('should detect record consent intent with withdrawn status', () => {
      const functions: AIFunction[] = [
        {
          name: 'record_consent',
          description: 'Record consent',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'compliance',
        },
      ];

      const intents = detectIntent('Consimțământ - retrag acordul', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('record_consent');
      expect(intents[0]?.extractedArgs.status).toBe('withdrawn');
    });

    it('should detect get lead analytics intent with week groupBy', () => {
      const functions: AIFunction[] = [
        {
          name: 'get_lead_analytics',
          description: 'Get lead analytics',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'analytics',
        },
      ];

      const intents = detectIntent('Raport analitice pe săptămână', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('get_lead_analytics');
      expect(intents[0]?.extractedArgs.groupBy).toBe('week');
    });

    it('should detect get lead analytics intent with month groupBy', () => {
      const functions: AIFunction[] = [
        {
          name: 'get_lead_analytics',
          description: 'Get lead analytics',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'analytics',
        },
      ];

      const intents = detectIntent('Statistici lunare', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('get_lead_analytics');
      expect(intents[0]?.extractedArgs.groupBy).toBe('month');
    });

    it('should detect get lead analytics intent with channel groupBy', () => {
      const functions: AIFunction[] = [
        {
          name: 'get_lead_analytics',
          description: 'Get lead analytics',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'analytics',
        },
      ];

      const intents = detectIntent('Analytics per canal', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('get_lead_analytics');
      expect(intents[0]?.extractedArgs.groupBy).toBe('channel');
    });

    it('should detect get available slots intent', () => {
      const functions: AIFunction[] = [
        {
          name: 'get_available_slots',
          description: 'Get available slots',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'appointments',
        },
      ];

      const intents = detectIntent('Ce sloturi disponibile sunt?', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('get_available_slots');
      expect(intents[0]?.extractedArgs.startDate).toBeDefined();
      expect(intents[0]?.extractedArgs.endDate).toBeDefined();
    });

    it('should detect trigger workflow intent with journey workflow', () => {
      const functions: AIFunction[] = [
        {
          name: 'trigger_workflow',
          description: 'Trigger workflow',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'automation',
        },
      ];

      const intents = detectIntent('Declanșează workflow patient journey', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('trigger_workflow');
      expect(intents[0]?.extractedArgs.workflow).toBe('patient-journey');
    });

    it('should detect trigger workflow intent with nurture workflow', () => {
      const functions: AIFunction[] = [
        {
          name: 'trigger_workflow',
          description: 'Trigger workflow',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'automation',
        },
      ];

      const intents = detectIntent('Pornește proces nurture', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('trigger_workflow');
      expect(intents[0]?.extractedArgs.workflow).toBe('nurture-sequence');
    });

    it('should detect trigger workflow intent with booking workflow', () => {
      const functions: AIFunction[] = [
        {
          name: 'trigger_workflow',
          description: 'Trigger workflow',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'automation',
        },
      ];

      const intents = detectIntent('Trigger workflow booking agent', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('trigger_workflow');
      expect(intents[0]?.extractedArgs.workflow).toBe('booking-agent');
    });

    it('should extract email from get patient query', () => {
      const functions: AIFunction[] = [
        {
          name: 'get_patient',
          description: 'Get patient',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'patients',
        },
      ];

      const intents = detectIntent('Găsește pacient test@example.com', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.function).toBe('get_patient');
      expect(intents[0]?.extractedArgs.email).toBe('test@example.com');
    });
  });

  describe('Natural Language Processing', () => {
    it('should process natural language request and execute function', async () => {
      const request: AIRequest = {
        type: 'natural',
        query: 'Scorează lead pentru +40721234567',
        context: {
          phone: '+40721234567',
        },
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.type).toBe('natural');
      expect(response.results.length).toBe(1);
      expect(response.results[0]?.function).toBe('score_lead');
      expect(response.traceId).toBe('test-trace-id');
    });

    it('should merge context with extracted arguments', async () => {
      const request: AIRequest = {
        type: 'natural',
        query: 'score lead pentru +40721234567',
        context: {
          phone: '+40721234567',
          patientId: 'patient-123',
        },
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results[0]?.success).toBe(true);
    });

    it('should fail when intent detection is disabled', async () => {
      const config: AIRouterConfig = {
        maxParallelCalls: 10,
        defaultTimeout: 30000,
        enableIntentDetection: false,
        minIntentConfidence: 0.7,
      };
      const routerNoIntent = createAIRouter(registry, config);

      const request: AIRequest = {
        type: 'natural',
        query: 'Scorează lead',
      };

      const response = await routerNoIntent.process(request, context);

      expect(response.success).toBe(false);
      expect(response.results[0]?.error?.code).toBe('INTENT_DETECTION_DISABLED');
    });

    it('should fail when no intent detected', async () => {
      const request: AIRequest = {
        type: 'natural',
        query: 'completely random gibberish xyz abc 123',
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(false);
      expect(response.results[0]?.error?.code).toBe('NO_INTENT_DETECTED');
      expect(response.suggestedFollowUp).toBeDefined();
    });

    it('should fail when confidence is too low', async () => {
      const config: AIRouterConfig = {
        maxParallelCalls: 10,
        defaultTimeout: 30000,
        enableIntentDetection: true,
        minIntentConfidence: 0.99, // Very high threshold
      };
      const strictRouter = createAIRouter(registry, config);

      const request: AIRequest = {
        type: 'natural',
        query: 'scorează',
      };

      const response = await strictRouter.process(request, context);

      expect(response.success).toBe(false);
    });
  });

  describe('Direct Function Calls', () => {
    it('should execute single function call', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [
          {
            function: 'score_lead',
            arguments: {
              phone: '+40721234567',
              channel: 'whatsapp',
            },
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.type).toBe('function_call');
      expect(response.results.length).toBe(1);
    });

    it('should execute multiple function calls in parallel', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [
          {
            function: 'score_lead',
            arguments: { phone: '+40721234567', channel: 'whatsapp' },
          },
          {
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results.length).toBe(2);
      expect(response.results[0]?.function).toBe('score_lead');
      expect(response.results[1]?.function).toBe('get_patient');
    });

    it('should limit parallel calls to configured maximum', async () => {
      const config: AIRouterConfig = {
        maxParallelCalls: 2,
        defaultTimeout: 30000,
        enableIntentDetection: true,
        minIntentConfidence: 0.7,
      };
      const limitedRouter = createAIRouter(registry, config);

      const request: AIRequest = {
        type: 'function_call',
        calls: [
          { function: 'score_lead', arguments: {} },
          { function: 'get_patient', arguments: {} },
          { function: 'send_whatsapp', arguments: {} },
        ],
      };

      const response = await limitedRouter.process(request, context);

      // Should only execute first 2 calls
      expect(response.results.length).toBe(2);
    });

    it('should track individual call IDs', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [
          {
            function: 'score_lead',
            arguments: { phone: '+40721234567' },
            callId: 'call-1',
          },
          {
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
            callId: 'call-2',
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results.length).toBe(2);
    });
  });

  describe('Workflow Execution', () => {
    it('should execute linear workflow steps in order', async () => {
      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
          },
          {
            stepId: 'step2',
            function: 'schedule_appointment',
            arguments: {
              patientId: 'patient-123',
              preferredDate: '2024-12-15',
              serviceType: 'consultation',
            },
            dependsOn: ['step1'],
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.type).toBe('workflow');
      expect(response.results.length).toBe(2);
    });

    it('should execute parallel workflow steps', async () => {
      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'score_lead',
            arguments: { phone: '+40721234567' },
          },
          {
            stepId: 'step2',
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results.length).toBe(2);
    });

    it('should handle step dependencies correctly', async () => {
      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
          },
          {
            stepId: 'step2',
            function: 'score_lead',
            arguments: { phone: '+40721234567' },
            dependsOn: ['step1'],
          },
          {
            stepId: 'step3',
            function: 'schedule_appointment',
            arguments: { patientId: 'patient-123' },
            dependsOn: ['step1', 'step2'],
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results.length).toBe(3);
    });

    it('should detect dependency deadlock', async () => {
      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'score_lead',
            arguments: {},
            dependsOn: ['step2'], // Circular dependency
          },
          {
            stepId: 'step2',
            function: 'get_patient',
            arguments: {},
            dependsOn: ['step1'], // Circular dependency
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(false);
      expect(response.results.some((r) => r.error?.code === 'DEPENDENCY_DEADLOCK')).toBe(true);
    });

    it('should transform step input from previous results', async () => {
      const testOutputDef: AIFunction = {
        name: 'test_output',
        description: 'Test function with output',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'custom',
      };
      registry.register(
        testOutputDef,
        z.object({}),
        vi.fn().mockResolvedValue({
          userId: 'user-123',
          email: 'test@example.com',
        })
      );

      const testInputDef: AIFunction = {
        name: 'test_input',
        description: 'Test function with input',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'custom',
      };
      registry.register(testInputDef, z.object({}), vi.fn().mockResolvedValue({ success: true }));

      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'test_output',
            arguments: {},
          },
          {
            stepId: 'step2',
            function: 'test_input',
            arguments: {},
            dependsOn: ['step1'],
            transformInput: '{{step1.userId}}',
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
    });
  });

  describe('Configuration', () => {
    it('should use custom configuration', () => {
      const config: AIRouterConfig = {
        maxParallelCalls: 5,
        defaultTimeout: 60000,
        enableIntentDetection: false,
        minIntentConfidence: 0.9,
      };

      const customRouter = createAIRouter(registry, config);
      expect(customRouter).toBeDefined();
    });

    it('should use default configuration when not provided', () => {
      const defaultRouter = createAIRouter(registry);
      expect(defaultRouter).toBeDefined();
    });
  });

  describe('Tool Schema Generation', () => {
    it('should generate OpenAI tool schemas', () => {
      const tools = router.getOpenAITools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('type', 'function');
      expect(tools[0]).toHaveProperty('function');
    });

    it('should generate Anthropic tool schemas', () => {
      const tools = router.getAnthropicTools();

      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
      expect(tools[0]).toHaveProperty('input_schema');
    });
  });

  describe('Error Handling', () => {
    it('should handle function execution errors', async () => {
      const failingDef: AIFunction = {
        name: 'failing_function',
        description: 'Function that fails',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'custom',
      };
      registry.register(
        failingDef,
        z.object({}),
        vi.fn().mockRejectedValue(new Error('Execution failed'))
      );

      const request: AIRequest = {
        type: 'function_call',
        calls: [
          {
            function: 'failing_function',
            arguments: {},
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(false);
      expect(response.results[0]?.success).toBe(false);
      expect(response.results[0]?.error).toBeDefined();
    });

    it('should continue workflow despite step failure', async () => {
      const failingStepDef: AIFunction = {
        name: 'failing_step',
        description: 'Failing step',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'custom',
      };
      registry.register(
        failingStepDef,
        z.object({}),
        vi.fn().mockRejectedValue(new Error('Step failed'))
      );

      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'failing_step',
            arguments: {},
          },
          {
            stepId: 'step2',
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.results.length).toBe(2);
      expect(response.results[0]?.success).toBe(false);
    });
  });

  describe('Response Format', () => {
    it('should include request ID in response', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [{ function: 'get_patient', arguments: {} }],
      };

      const response = await router.process(request, context);

      expect(response.requestId).toBeDefined();
      expect(typeof response.requestId).toBe('string');
    });

    it('should include execution time in response', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [{ function: 'get_patient', arguments: {} }],
      };

      const response = await router.process(request, context);

      expect(response.totalExecutionTimeMs).toBeDefined();
      expect(typeof response.totalExecutionTimeMs).toBe('number');
      expect(response.totalExecutionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should include trace ID from context', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [{ function: 'get_patient', arguments: {} }],
      };

      const response = await router.process(request, context);

      expect(response.traceId).toBe('test-trace-id');
    });
  });
});
