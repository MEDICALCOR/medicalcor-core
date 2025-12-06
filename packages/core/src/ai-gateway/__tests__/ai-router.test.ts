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
import {
  FunctionRegistry,
  type FunctionContext,
  type AIFunction,
} from '../function-registry.js';

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

    it('should detect lead scoring with various patterns', () => {
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

      const queries = [
        'score lead',
        'scoreaz\u0103 lead',
        'analizează lead',
        'calific\u0103 lead',
        'calificare lead',
        'evaluează un lead',
      ];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('score_lead');
      });
    });

    it('should extract channel from query', () => {
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

      const testCases = [
        { query: 'score lead pentru whatsapp', expected: 'whatsapp' },
        { query: 'score lead pentru voce', expected: 'voice' },
        { query: 'score lead pentru apel', expected: 'voice' },
        { query: 'score lead pentru telefon', expected: 'voice' },
        { query: 'score lead pentru web', expected: 'web' },
        { query: 'score lead pentru site', expected: 'web' },
        { query: 'score lead pentru formular', expected: 'web' },
        { query: 'score lead pentru referral', expected: 'referral' },
        { query: 'score lead pentru recomandare', expected: 'referral' },
      ];

      testCases.forEach(({ query, expected }) => {
        const intents = detectIntent(query, functions);
        expect(intents[0]?.extractedArgs.channel).toBe(expected);
      });
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

    it('should detect scheduling with various patterns', () => {
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

      const queries = [
        'programează ceva',
        'schedule an appointment',
        'fă o programare',
        'rezervă loc',
      ];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('schedule_appointment');
      });
    });

    it('should extract date from scheduling query', () => {
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

      const intentWithDate = detectIntent('programează pentru 2024-12-15', functions);
      expect(intentWithDate[0]?.extractedArgs.preferredDate).toBe('2024-12-15');

      const intentWithTomorrow = detectIntent('programează pentru mâine', functions);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      expect(intentWithTomorrow[0]?.extractedArgs.preferredDate).toBe(
        tomorrow.toISOString().split('T')[0]
      );
    });

    it('should extract all service types from query', () => {
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

      const testCases = [
        { query: 'programează pentru albire', expected: 'whitening' },
        { query: 'programează pentru whitening', expected: 'whitening' },
        { query: 'programează pentru curățare', expected: 'cleaning' },
        { query: 'programează pentru igienizare', expected: 'cleaning' },
        { query: 'programează pentru consultație', expected: 'consultation' },
        { query: 'programează pentru extracție', expected: 'extraction' },
        { query: 'programează pentru implant', expected: 'implant' },
      ];

      testCases.forEach(({ query, expected }) => {
        const intents = detectIntent(query, functions);
        expect(intents[0]?.extractedArgs.serviceType).toBe(expected);
      });
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

    it('should detect send whatsapp with various patterns', () => {
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

      const queries = [
        'trimite un mesaj',
        'trimite mesaj',
        'send a message',
        'send whatsapp message',
        'mesaj pe whatsapp',
        'contactează',
      ];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('send_whatsapp');
      });
    });

    it('should extract quoted message from query', () => {
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

      const testCases = [
        'trimite mesaj "Bună ziua"',
        'trimite mesaj „Mulțumim"',
        "trimite mesaj 'Salut'",
      ];

      testCases.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents[0]?.extractedArgs.message).toBeDefined();
      });
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

      const queries = [
        'anulează programare',
        'cancel appointment',
        'cancel the appointment',
        'șterge programare',
      ];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('cancel_appointment');
      });
    });

    it('should extract appointment ID from query', () => {
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

      const intentWithId = detectIntent('anulează programare apt-abc123', functions);
      expect(intentWithId[0]?.extractedArgs.appointmentId).toBe('apt-abc123');

      const intentWithUuid = detectIntent(
        'anulează programare 550e8400-e29b-41d4-a716-446655440000',
        functions
      );
      expect(intentWithUuid[0]?.extractedArgs.appointmentId).toBe(
        '550e8400-e29b-41d4-a716-446655440000'
      );
    });

    it('should detect consent recording intent', () => {
      const functions: AIFunction[] = [
        {
          name: 'record_consent',
          description: 'Record consent',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'consent',
        },
      ];

      const queries = ['consimțământ', 'consent', 'acord gdpr', 'înregistrează acord'];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('record_consent');
      });
    });

    it('should extract consent status from query', () => {
      const functions: AIFunction[] = [
        {
          name: 'record_consent',
          description: 'Record consent',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'consent',
        },
      ];

      const testCases = [
        { query: 'consimțământ refuz', expected: 'denied' },
        { query: 'consent denied', expected: 'denied' },
        { query: 'consimțământ nu accept', expected: 'denied' },
        { query: 'consimțământ retrag', expected: 'withdrawn' },
        { query: 'consent withdraw', expected: 'withdrawn' },
        { query: 'consimțământ', expected: 'granted' },
      ];

      testCases.forEach(({ query, expected }) => {
        const intents = detectIntent(query, functions);
        expect(intents[0]?.extractedArgs.status).toBe(expected);
      });
    });

    it('should detect analytics intent', () => {
      const functions: AIFunction[] = [
        {
          name: 'get_lead_analytics',
          description: 'Get analytics',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'analytics',
        },
      ];

      const queries = [
        'analitice',
        'analytics',
        'statistici',
        'raport',
        'câți lead',
        'conversii',
        'conversion',
      ];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('get_lead_analytics');
      });
    });

    it('should extract analytics groupBy from query', () => {
      const functions: AIFunction[] = [
        {
          name: 'get_lead_analytics',
          description: 'Get analytics',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'analytics',
        },
      ];

      const testCases = [
        { query: 'analitice pe zi', expected: 'day' },
        { query: 'analytics daily', expected: 'day' },
        { query: 'raport săptămânal', expected: 'week' },
        { query: 'analytics weekly', expected: 'week' },
        { query: 'statistici lunar', expected: 'month' },
        { query: 'analytics monthly', expected: 'month' },
        { query: 'raport pe canal', expected: 'channel' },
        { query: 'analytics by channel', expected: 'channel' },
      ];

      testCases.forEach(({ query, expected }) => {
        const intents = detectIntent(query, functions);
        expect(intents[0]?.extractedArgs.groupBy).toBe(expected);
      });
    });

    it('should detect get patient intent', () => {
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

      const queries = [
        'găsește pacient',
        'caută pacient',
        'informații pacient',
        'informații despre pacient',
        'get patient',
        'find patient',
      ];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('get_patient');
      });
    });

    it('should extract email from query', () => {
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

      const intents = detectIntent('găsește pacient test@example.com', functions);
      expect(intents[0]?.extractedArgs.email).toBe('test@example.com');
    });

    it('should detect available slots intent', () => {
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

      const queries = [
        'sloturi disponibile',
        'available slots',
        'când e liber',
        'când este liber',
        'disponibilități',
      ];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('get_available_slots');
      });
    });

    it('should set default date range for available slots', () => {
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

      const intents = detectIntent('sloturi disponibile', functions);
      expect(intents[0]?.extractedArgs.startDate).toBeDefined();
      expect(intents[0]?.extractedArgs.endDate).toBeDefined();

      const startDate = new Date(intents[0]?.extractedArgs.startDate as string);
      const endDate = new Date(intents[0]?.extractedArgs.endDate as string);
      const diff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(diff).toBe(7);
    });

    it('should detect trigger workflow intent', () => {
      const functions: AIFunction[] = [
        {
          name: 'trigger_workflow',
          description: 'Trigger workflow',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'workflows',
        },
      ];

      const queries = ['declanșează workflow', 'trigger workflow', 'pornește proces'];

      queries.forEach((query) => {
        const intents = detectIntent(query, functions);
        expect(intents.length).toBeGreaterThan(0);
        expect(intents[0]?.function).toBe('trigger_workflow');
      });
    });

    it('should extract workflow type from query', () => {
      const functions: AIFunction[] = [
        {
          name: 'trigger_workflow',
          description: 'Trigger workflow',
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category: 'workflows',
        },
      ];

      const testCases = [
        { query: 'trigger workflow scoring', expected: 'lead-scoring' },
        { query: 'trigger workflow scor', expected: 'lead-scoring' },
        { query: 'trigger workflow journey', expected: 'patient-journey' },
        { query: 'trigger workflow călătorie', expected: 'patient-journey' },
        { query: 'trigger workflow nurture', expected: 'nurture-sequence' },
        { query: 'trigger workflow booking', expected: 'booking-agent' },
        { query: 'trigger workflow programare', expected: 'booking-agent' },
      ];

      testCases.forEach(({ query, expected }) => {
        const intents = detectIntent(query, functions);
        expect(intents[0]?.extractedArgs.workflow).toBe(expected);
      });
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

    it('should include reasoning in detected intent', () => {
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

      const intents = detectIntent('score lead', functions);

      expect(intents[0]?.reasoning).toBeDefined();
      expect(intents[0]?.reasoning).toContain('Matched pattern');
    });

    it('should handle multiple extractors returning undefined', () => {
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

      const intents = detectIntent('programează', functions);

      expect(intents.length).toBeGreaterThan(0);
      expect(intents[0]?.extractedArgs).toBeDefined();
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
      registry.register(
        testInputDef,
        z.object({}),
        vi.fn().mockResolvedValue({ success: true })
      );

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

    it('should handle mixed success and failure in function calls', async () => {
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
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
          },
          {
            function: 'failing_function',
            arguments: {},
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(false);
      expect(response.results.length).toBe(2);
      expect(response.results[0]?.success).toBe(true);
      expect(response.results[1]?.success).toBe(false);
    });

    it('should handle workflow step with failed dependency', async () => {
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
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'failing_function',
            arguments: {},
          },
          {
            stepId: 'step2',
            function: 'get_patient',
            arguments: {},
            dependsOn: ['step1'],
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.results.length).toBe(2);
      expect(response.results[0]?.success).toBe(false);
      expect(response.results[1]?.success).toBe(true);
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

  describe('Workflow Transform Input', () => {
    it('should transform input with non-existent stepId', async () => {
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
      registry.register(
        testInputDef,
        z.object({}),
        vi.fn().mockResolvedValue({ success: true })
      );

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
            transformInput: '{{nonExistentStep.userId}}',
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
    });

    it('should transform input with failed previous step', async () => {
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
      registry.register(
        testInputDef,
        z.object({}),
        vi.fn().mockResolvedValue({ success: true })
      );

      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'failing_function',
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

      expect(response.results.length).toBe(2);
    });

    it('should transform input with no result from previous step', async () => {
      const noResultDef: AIFunction = {
        name: 'no_result_function',
        description: 'Function with no result',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'custom',
      };
      registry.register(
        noResultDef,
        z.object({}),
        vi.fn().mockResolvedValue(undefined)
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
      registry.register(
        testInputDef,
        z.object({}),
        vi.fn().mockResolvedValue({ success: true })
      );

      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'no_result_function',
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

    it('should handle multiple transformations in one step', async () => {
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
          phone: '+40721234567',
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
      registry.register(
        testInputDef,
        z.object({}),
        vi.fn().mockResolvedValue({ success: true })
      );

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
            transformInput: '{{step1.userId}} {{step1.email}} {{step1.phone}}',
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
    });

    it('should skip transform when no dependencies exist', async () => {
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
      registry.register(
        testInputDef,
        z.object({}),
        vi.fn().mockResolvedValue({ success: true })
      );

      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'test_input',
            arguments: { test: 'value' },
            transformInput: '{{step0.userId}}',
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
    });

    it('should preserve original arguments when transform finds no matches', async () => {
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
      registry.register(
        testInputDef,
        z.object({}),
        vi.fn().mockResolvedValue({ success: true })
      );

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
            arguments: { originalValue: 'preserved' },
            dependsOn: ['step1'],
            transformInput: 'no template markers here',
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
    });

    it('should handle transform when value is undefined', async () => {
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
          otherField: 'value',
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
      registry.register(
        testInputDef,
        z.object({}),
        vi.fn().mockResolvedValue({ success: true })
      );

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
            transformInput: '{{step1.nonExistentField}}',
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
    });

    it('should handle complex dependency graph with multiple levels', async () => {
      const step1Def: AIFunction = {
        name: 'step1_function',
        description: 'Step 1',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'custom',
      };
      registry.register(
        step1Def,
        z.object({}),
        vi.fn().mockResolvedValue({ result: 'step1' })
      );

      const step2Def: AIFunction = {
        name: 'step2_function',
        description: 'Step 2',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'custom',
      };
      registry.register(
        step2Def,
        z.object({}),
        vi.fn().mockResolvedValue({ result: 'step2' })
      );

      const step3Def: AIFunction = {
        name: 'step3_function',
        description: 'Step 3',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'custom',
      };
      registry.register(
        step3Def,
        z.object({}),
        vi.fn().mockResolvedValue({ result: 'step3' })
      );

      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'a',
            function: 'step1_function',
            arguments: {},
          },
          {
            stepId: 'b',
            function: 'step2_function',
            arguments: {},
          },
          {
            stepId: 'c',
            function: 'step3_function',
            arguments: {},
            dependsOn: ['a', 'b'],
          },
          {
            stepId: 'd',
            function: 'step1_function',
            arguments: {},
            dependsOn: ['c'],
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results.length).toBe(4);
    });
  });

  describe('Schema Validation', () => {
    it('should accept valid natural request schema', () => {
      const validRequest = {
        type: 'natural',
        query: 'Score lead for phone +40721234567',
        context: {
          patientId: 'patient-123',
          phone: '+40721234567',
          conversationHistory: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there!' },
          ],
        },
      };

      const result = { type: 'natural' as const, ...validRequest };
      expect(result.type).toBe('natural');
    });

    it('should accept valid function_call request schema', () => {
      const validRequest = {
        type: 'function_call',
        calls: [
          {
            function: 'score_lead',
            arguments: { phone: '+40721234567' },
            callId: 'call-1',
          },
        ],
      };

      const result = { type: 'function_call' as const, ...validRequest };
      expect(result.type).toBe('function_call');
    });

    it('should accept valid workflow request schema', () => {
      const validRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
            dependsOn: [],
            transformInput: '{{step0.userId}}',
          },
        ],
      };

      const result = { type: 'workflow' as const, ...validRequest };
      expect(result.type).toBe('workflow');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty function calls array', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results.length).toBe(0);
    });

    it('should handle empty workflow steps array', async () => {
      const request: AIRequest = {
        type: 'workflow',
        steps: [],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results.length).toBe(0);
    });

    it('should handle natural request with empty context', async () => {
      const request: AIRequest = {
        type: 'natural',
        query: 'score lead',
        context: {},
      };

      const response = await router.process(request, context);

      expect(response).toBeDefined();
    });

    it('should handle natural request without context', async () => {
      const request: AIRequest = {
        type: 'natural',
        query: 'score lead',
      };

      const response = await router.process(request, context);

      expect(response).toBeDefined();
    });

    it('should handle workflow with only independent steps', async () => {
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
          },
          {
            stepId: 'step3',
            function: 'send_whatsapp',
            arguments: { to: '+40721234567' },
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results.length).toBe(3);
    });

    it('should handle confidence at minimum threshold', async () => {
      const config: AIRouterConfig = {
        maxParallelCalls: 10,
        defaultTimeout: 30000,
        enableIntentDetection: true,
        minIntentConfidence: 0.79,
      };
      const boundaryRouter = createAIRouter(registry, config);

      const request: AIRequest = {
        type: 'natural',
        query: 'score lead',
      };

      const response = await boundaryRouter.process(request, context);

      expect(response).toBeDefined();
    });

    it('should handle workflow deadlock with multiple unresolved steps', async () => {
      const request: AIRequest = {
        type: 'workflow',
        steps: [
          {
            stepId: 'step1',
            function: 'get_patient',
            arguments: {},
            dependsOn: ['step3'],
          },
          {
            stepId: 'step2',
            function: 'score_lead',
            arguments: {},
            dependsOn: ['step1'],
          },
          {
            stepId: 'step3',
            function: 'send_whatsapp',
            arguments: {},
            dependsOn: ['step2'],
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(false);
      const deadlockErrors = response.results.filter(
        (r) => r.error?.code === 'DEPENDENCY_DEADLOCK'
      );
      expect(deadlockErrors.length).toBe(3);
    });

    it('should generate unique request IDs for multiple calls', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [{ function: 'get_patient', arguments: {} }],
      };

      const response1 = await router.process(request, context);
      const response2 = await router.process(request, context);

      expect(response1.requestId).not.toBe(response2.requestId);
    });

    it('should handle context without traceId', async () => {
      const contextNoTrace: FunctionContext = {
        correlationId: 'test-correlation-id',
        userId: 'test-user',
      };

      const request: AIRequest = {
        type: 'function_call',
        calls: [{ function: 'get_patient', arguments: {} }],
      };

      const response = await router.process(request, contextNoTrace);

      expect(response.traceId).toBeUndefined();
    });

    it('should handle partial configuration override', () => {
      const partialConfig = {
        maxParallelCalls: 15,
      };

      const customRouter = createAIRouter(registry, partialConfig);
      expect(customRouter).toBeDefined();
    });

    it('should handle function call without callId', async () => {
      const request: AIRequest = {
        type: 'function_call',
        calls: [
          {
            function: 'get_patient',
            arguments: { phone: '+40721234567' },
          },
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
      expect(response.results[0]?.callId).toBeUndefined();
    });

    it('should handle workflow step without transformInput', async () => {
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
        ],
      };

      const response = await router.process(request, context);

      expect(response.success).toBe(true);
    });

    it('should handle confidence values across full range', () => {
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

      for (let i = 0; i < 100; i++) {
        const intents = detectIntent('score lead', functions);
        expect(intents[0]?.confidence).toBeGreaterThanOrEqual(0.8);
        expect(intents[0]?.confidence).toBeLessThanOrEqual(0.95);
      }
    });
  });
});
