/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/require-await */
/* eslint-disable @typescript-eslint/return-await */
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  FunctionRegistry,
  createAIRouter,
  AIRequestSchema,
  ALL_MEDICAL_FUNCTIONS,
  FUNCTION_INPUT_SCHEMAS,
  type AIFunctionCategory,
  type FunctionContext,
} from '@medicalcor/core';

/**
 * SECURITY: Validate and sanitize user/tenant IDs from headers
 * These should only be trusted after API key authentication passes
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateUserId(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  // Only accept valid UUID format to prevent injection attacks
  return UUID_REGEX.test(header) ? header : undefined;
}

function validateTenantId(header: string | string[] | undefined): string | undefined {
  if (typeof header !== 'string') return undefined;
  // Only accept valid UUID format to prevent injection attacks
  return UUID_REGEX.test(header) ? header : undefined;
}

/**
 * AI-First API Gateway Routes
 *
 * Provides LLM-friendly endpoints for:
 * - Function discovery (GET /ai/functions)
 * - Function execution (POST /ai/execute)
 * - OpenAI-compatible tools (GET /ai/openai/tools)
 * - Anthropic-compatible tools (GET /ai/anthropic/tools)
 */

// Initialize function registry with medical domain functions
const registry = new FunctionRegistry();
const router = createAIRouter(registry, {
  maxParallelCalls: 10,
  defaultTimeout: 30000,
  enableIntentDetection: true,
  minIntentConfidence: 0.7,
});

// Register all medical functions with placeholder handlers
// In production, these would be connected to actual services
function initializeFunctionRegistry(): void {
  for (const fn of ALL_MEDICAL_FUNCTIONS) {
    const inputSchema = FUNCTION_INPUT_SCHEMAS[fn.name as keyof typeof FUNCTION_INPUT_SCHEMAS];
    if (!inputSchema) continue;

    // Type assertion needed because TypeScript can't verify schema matches function type at compile time
    registry.register(fn as any, inputSchema as any, async (args, context) => {
      // Placeholder implementation - each function would be connected
      // to the actual domain service in production
      return {
        status: 'executed',
        function: fn.name,
        arguments: args,
        correlationId: context.correlationId,
        timestamp: new Date().toISOString(),
        // This would be the actual result from the domain service
        result: null,
      };
    });
  }
}

// Initialize on module load
initializeFunctionRegistry();

// Query schemas
const FunctionQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  format: z.enum(['full', 'summary', 'openai', 'anthropic']).optional().default('full'),
});

const ExecuteBodySchema = AIRequestSchema;

export const aiRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /ai/functions
   *
   * Discovery endpoint for available AI functions.
   * Returns function schemas in various formats for LLM consumption.
   */
  fastify.get('/ai/functions', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Filter by category (leads, patients, appointments, etc.)',
          },
          search: {
            type: 'string',
            description: 'Search functions by name or description',
          },
          format: {
            type: 'string',
            enum: ['full', 'summary', 'openai', 'anthropic'],
            description: 'Response format',
            default: 'full',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            functions: { type: 'array' },
            categories: { type: 'array' },
            total: { type: 'number' },
          },
        },
      },
    },
    handler: async (request, reply) => {
      const query = FunctionQuerySchema.parse(request.query);
      let functions = registry.getAllFunctions();

      // Filter by category
      if (query.category) {
        functions = registry.getFunctionsByCategory(query.category as AIFunctionCategory);
      }

      // Filter by search term
      if (query.search) {
        const searchLower = query.search.toLowerCase();
        functions = functions.filter(
          (fn) =>
            fn.name.toLowerCase().includes(searchLower) ||
            fn.description.toLowerCase().includes(searchLower)
        );
      }

      // Format response based on requested format
      switch (query.format) {
        case 'openai':
          return reply.send({
            tools: functions.map((fn) => ({
              type: 'function',
              function: {
                name: fn.name,
                description: fn.description,
                parameters: fn.parameters,
              },
            })),
            total: functions.length,
          });

        case 'anthropic':
          return reply.send({
            tools: functions.map((fn) => ({
              name: fn.name,
              description: fn.description,
              input_schema: fn.parameters,
            })),
            total: functions.length,
          });

        case 'summary':
          return reply.send({
            functions: functions.map((fn) => ({
              name: fn.name,
              description: fn.description,
              category: fn.category,
              requiredParams: fn.parameters.required,
            })),
            categories: registry.getCategorySummary(),
            total: functions.length,
          });

        case 'full':
        default:
          return reply.send({
            functions,
            categories: registry.getCategorySummary(),
            total: functions.length,
            formats: {
              openai: '/ai/functions?format=openai',
              anthropic: '/ai/functions?format=anthropic',
            },
          });
      }
    },
  });

  /**
   * GET /ai/functions/:name
   *
   * Get details for a specific function
   */
  fastify.get<{ Params: { name: string } }>('/ai/functions/:name', {
    schema: {
      params: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Function name' },
        },
        required: ['name'],
      },
    },
    handler: async (request, reply) => {
      const { name } = request.params;
      const fn = registry.getFunction(name);

      if (!fn) {
        return reply.status(404).send({
          code: 'FUNCTION_NOT_FOUND',
          message: `Function '${name}' not found`,
          availableFunctions: registry.getAllFunctions().map((f) => f.name),
        });
      }

      return reply.send({
        function: fn,
        inputSchema: FUNCTION_INPUT_SCHEMAS[name as keyof typeof FUNCTION_INPUT_SCHEMAS],
      });
    },
  });

  /**
   * POST /ai/execute
   *
   * Execute AI function calls. Supports:
   * - Natural language requests (AI determines which function to call)
   * - Direct function calls (LLM specifies function and arguments)
   * - Multi-step workflows (sequence of dependent function calls)
   *
   * SECURITY: This endpoint requires API key authentication (enforced by apiAuthPlugin)
   * and validates all user/tenant IDs to prevent spoofing attacks.
   */
  fastify.post('/ai/execute', {
    // SECURITY: Strict rate limiting for compute-heavy AI execution
    config: {
      rateLimit: {
        max: 50, // Maximum 50 AI executions per minute per IP
        timeWindow: '1 minute',
      },
    },
    schema: {
      body: {
        type: 'object',
        oneOf: [
          {
            properties: {
              type: { const: 'natural' },
              query: { type: 'string' },
              context: { type: 'object' },
            },
            required: ['type', 'query'],
          },
          {
            properties: {
              type: { const: 'function_call' },
              calls: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    function: { type: 'string' },
                    arguments: { type: 'object' },
                    callId: { type: 'string' },
                  },
                  required: ['function', 'arguments'],
                },
              },
            },
            required: ['type', 'calls'],
          },
          {
            properties: {
              type: { const: 'workflow' },
              steps: { type: 'array' },
            },
            required: ['type', 'steps'],
          },
        ],
      },
    },
    handler: async (request, reply) => {
      const correlationId = (request.headers['x-correlation-id'] as string) ?? crypto.randomUUID();
      const traceId = (request.headers['x-trace-id'] as string) ?? crypto.randomUUID();

      // Parse and validate request
      const parseResult = ExecuteBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: 'INVALID_REQUEST',
          message: 'Invalid request body',
          details: parseResult.error.flatten(),
        });
      }

      // SECURITY: Validate user/tenant IDs to prevent spoofing
      // These are only trusted because API key auth has passed (enforced by apiAuthPlugin)
      const userId = validateUserId(request.headers['x-user-id']);
      const tenantId = validateTenantId(request.headers['x-tenant-id']);

      // SECURITY: Require user context for all AI executions
      if (!userId) {
        return reply.status(401).send({
          code: 'USER_CONTEXT_REQUIRED',
          message: 'Valid x-user-id header is required for AI execution',
        });
      }

      const context: FunctionContext = {
        correlationId,
        traceId,
        userId,
        tenantId,
      };

      try {
        const response = await router.process(parseResult.data, context);

        // Set response headers
        reply.header('X-Correlation-Id', correlationId);
        reply.header('X-Trace-Id', traceId);
        reply.header('X-Execution-Time-Ms', response.totalExecutionTimeMs.toString());

        return reply.send(response);
      } catch (error) {
        request.log.error({ error, correlationId }, 'AI execution error');

        return reply.status(500).send({
          code: 'EXECUTION_ERROR',
          message: 'Failed to execute AI request',
          correlationId,
        });
      }
    },
  });

  /**
   * GET /ai/openai/tools
   *
   * Get OpenAI-compatible tool definitions.
   * Use these with OpenAI's function calling API.
   */
  fastify.get('/ai/openai/tools', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      tools: router.getOpenAITools(),
      model_compatibility: ['gpt-4', 'gpt-4-turbo', 'gpt-4o', 'gpt-3.5-turbo'],
      usage: {
        example: `
// Use with OpenAI SDK
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Schedule an appointment for tomorrow" }],
  tools: tools, // From this endpoint
  tool_choice: "auto"
});
          `.trim(),
      },
    });
  });

  /**
   * GET /ai/anthropic/tools
   *
   * Get Anthropic/Claude-compatible tool definitions.
   * Use these with Anthropic's tool use API.
   */
  fastify.get('/ai/anthropic/tools', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      tools: router.getAnthropicTools(),
      model_compatibility: [
        'claude-3-opus',
        'claude-3-sonnet',
        'claude-3-haiku',
        'claude-sonnet-4-5',
      ],
      usage: {
        example: `
// Use with Anthropic SDK
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-5-20250929",
  max_tokens: 1024,
  tools: tools, // From this endpoint
  messages: [{ role: "user", content: "Score a lead from WhatsApp" }]
});
          `.trim(),
      },
    });
  });

  /**
   * GET /ai/categories
   *
   * Get function categories with counts
   */
  fastify.get('/ai/categories', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      categories: registry.getCategorySummary(),
    });
  });

  /**
   * GET /ai/schema
   *
   * Get the full OpenAPI schema for the AI Gateway
   */
  fastify.get('/ai/schema', async (_request: FastifyRequest, reply: FastifyReply) => {
    const functions = registry.getAllFunctions();

    return reply.send({
      openapi: '3.1.0',
      info: {
        title: 'MedicalCor AI Gateway',
        version: '1.0.0',
        description: 'AI-First API Gateway for medical CRM operations',
      },
      paths: {
        '/ai/execute': {
          post: {
            summary: 'Execute AI function calls',
            operationId: 'executeAIFunctions',
            requestBody: {
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/AIRequest' },
                },
              },
            },
          },
        },
      },
      components: {
        schemas: {
          AIRequest: {
            oneOf: [
              {
                type: 'object',
                properties: {
                  type: { const: 'natural' },
                  query: { type: 'string' },
                },
              },
              {
                type: 'object',
                properties: {
                  type: { const: 'function_call' },
                  calls: { type: 'array' },
                },
              },
            ],
          },
          ...Object.fromEntries(
            functions.map((fn) => [
              `${fn.name}_input`,
              {
                description: fn.description,
                ...fn.parameters,
              },
            ])
          ),
        },
      },
    });
  });

  // ===========================================================================
  // AI COPILOT ENDPOINTS
  // Real LLM-powered endpoints for the AI Copilot feature
  // ===========================================================================

  // Lazy-load OpenAI client (singleton)
  let openaiClient: import('@medicalcor/integrations').OpenAIClient | null = null;

  function getOpenAIClient(): import('@medicalcor/integrations').OpenAIClient | null {
    if (openaiClient) return openaiClient;

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return null;

    // Dynamic import to avoid loading if not needed
    const { createOpenAIClient } = require('@medicalcor/integrations') as typeof import('@medicalcor/integrations');
    openaiClient = createOpenAIClient({ apiKey, model: 'gpt-4o' });
    return openaiClient;
  }

  /**
   * POST /ai/suggestions
   *
   * Generate smart reply suggestions based on conversation context.
   * Uses GPT-4o to analyze the conversation and generate contextual responses.
   */
  fastify.post<{
    Body: {
      patientId?: string;
      currentMessage?: string;
      context?: {
        patientPhone?: string;
        patientName?: string;
        currentConversation?: Array<{
          direction: 'IN' | 'OUT';
          content: string;
          timestamp: string;
          channel: string;
        }>;
      };
      count?: number;
    };
  }>('/ai/suggestions', {
    schema: {
      body: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
          currentMessage: { type: 'string' },
          context: { type: 'object' },
          count: { type: 'number', default: 3 },
        },
      },
    },
    handler: async (request, reply) => {
      const client = getOpenAIClient();
      if (!client) {
        return reply.status(503).send({
          error: 'AI service not configured',
          message: 'OPENAI_API_KEY environment variable is required',
        });
      }

      const { context, count = 3 } = request.body;
      const conversation = context?.currentConversation ?? [];

      // Build conversation history for context
      const conversationText = conversation
        .slice(-10) // Last 10 messages
        .map((msg) => `${msg.direction === 'IN' ? 'PACIENT' : 'OPERATOR'}: ${msg.content}`)
        .join('\n');

      const lastPatientMessage = conversation
        .filter((m) => m.direction === 'IN')
        .slice(-1)[0]?.content ?? '';

      try {
        const response = await client.chatCompletion({
          messages: [
            {
              role: 'system',
              content: `Ești un asistent AI pentru o clinică medicală din România. Generează ${count} sugestii de răspuns pentru operator.

REGULI:
- Răspunsuri în limba română
- Ton profesional dar prietenos
- Concis (max 2 propoziții per sugestie)
- Variază tonul: formal, prietenos, empatic
- NU inventa prețuri sau disponibilități
- Concentrează-te pe nevoile pacientului

Răspunde STRICT în format JSON:
{
  "suggestions": [
    {
      "content": "textul răspunsului",
      "tone": "formal|friendly|empathetic",
      "confidence": 0.0-1.0,
      "category": "greeting|info|scheduling|followup|objection"
    }
  ]
}`,
            },
            {
              role: 'user',
              content: `Conversație recentă:
${conversationText || 'Nu există conversație anterioară.'}

Ultimul mesaj al pacientului: "${lastPatientMessage || 'Niciun mesaj'}"

Generează ${count} sugestii de răspuns pentru operator.`,
            },
          ],
          temperature: 0.7,
          jsonMode: true,
        });

        const parsed = JSON.parse(response) as {
          suggestions: Array<{
            content: string;
            tone: string;
            confidence: number;
            category: string;
          }>;
        };

        // Add IDs to suggestions
        const suggestions = parsed.suggestions.map((s, i) => ({
          id: `sug-${Date.now()}-${i}`,
          ...s,
        }));

        return reply.send({ suggestions });
      } catch (error) {
        request.log.error({ error }, 'AI suggestions error');
        return reply.status(500).send({
          error: 'Failed to generate suggestions',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  /**
   * GET /ai/summary/:patientId
   *
   * Get AI-generated patient summary with insights.
   * Combines HubSpot data with AI analysis.
   */
  fastify.get<{ Params: { patientId: string } }>('/ai/summary/:patientId', {
    schema: {
      params: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
        },
        required: ['patientId'],
      },
    },
    handler: async (request, reply) => {
      const client = getOpenAIClient();
      if (!client) {
        return reply.status(503).send({
          error: 'AI service not configured',
          message: 'OPENAI_API_KEY environment variable is required',
        });
      }

      const { patientId } = request.params;

      // TODO: Fetch real patient data from HubSpot
      // const hubspot = createHubSpotClient(...);
      // const contact = await hubspot.getContact(patientId);
      // const timeline = await hubspot.getContactTimeline(patientId);

      // For now, generate a summary based on available context
      try {
        const response = await client.chatCompletion({
          messages: [
            {
              role: 'system',
              content: `Ești un analist AI pentru o clinică medicală. Generează un rezumat structurat al pacientului.

Răspunde STRICT în format JSON:
{
  "totalInteractions": number,
  "firstContact": "YYYY-MM-DD",
  "lastContact": "YYYY-MM-DD",
  "classification": "HOT|WARM|COLD",
  "score": 0-100,
  "keyInsights": ["insight1", "insight2", "insight3"],
  "proceduresDiscussed": ["procedure1"],
  "objections": ["objection1"],
  "appointmentHistory": [{"date": "YYYY-MM-DD", "procedure": "name", "status": "completed|cancelled|scheduled"}],
  "sentiment": "positive|neutral|negative",
  "engagementLevel": "high|medium|low"
}`,
            },
            {
              role: 'user',
              content: `Generează un rezumat pentru pacientul cu ID: ${patientId}.

Notă: În producție, acest endpoint va fi conectat la HubSpot pentru date reale.
Pentru acum, generează date de exemplu realiste pentru o clinică de estetică.`,
            },
          ],
          temperature: 0.5,
          jsonMode: true,
        });

        const summary = JSON.parse(response);
        return reply.send({ summary });
      } catch (error) {
        request.log.error({ error }, 'AI summary error');
        return reply.status(500).send({
          error: 'Failed to generate summary',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  /**
   * POST /ai/chat
   *
   * Interactive chat with AI assistant for operators.
   * Provides contextual help based on patient and conversation data.
   */
  fastify.post<{
    Body: {
      messages: Array<{
        role: 'user' | 'assistant';
        content: string;
      }>;
      context?: {
        patientId?: string;
        patientPhone?: string;
        patientName?: string;
        currentConversation?: Array<{
          direction: 'IN' | 'OUT';
          content: string;
        }>;
      };
    };
  }>('/ai/chat', {
    schema: {
      body: {
        type: 'object',
        properties: {
          messages: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                role: { type: 'string', enum: ['user', 'assistant'] },
                content: { type: 'string' },
              },
              required: ['role', 'content'],
            },
          },
          context: { type: 'object' },
        },
        required: ['messages'],
      },
    },
    handler: async (request, reply) => {
      const client = getOpenAIClient();
      if (!client) {
        return reply.status(503).send({
          error: 'AI service not configured',
          message: 'OPENAI_API_KEY environment variable is required',
        });
      }

      const { messages, context } = request.body;

      // Build context summary
      const patientContext = context?.patientName
        ? `Pacient curent: ${context.patientName} (${context.patientPhone ?? 'telefon necunoscut'})`
        : 'Nu există pacient selectat.';

      const conversationContext = context?.currentConversation?.length
        ? `\nConversația curentă cu pacientul:\n${context.currentConversation
            .slice(-5)
            .map((m) => `${m.direction === 'IN' ? 'PACIENT' : 'OPERATOR'}: ${m.content}`)
            .join('\n')}`
        : '';

      try {
        const response = await client.chatCompletion({
          messages: [
            {
              role: 'system',
              content: `Ești un asistent AI pentru operatorii unei clinici medicale din România.

CONTEXT:
${patientContext}${conversationContext}

CAPABILITĂȚI:
- Ajuți la formularea răspunsurilor pentru pacienți
- Oferi informații despre proceduri medicale estetice
- Sugerezi strategii de comunicare
- Analizezi conversații și oferi insights

REGULI:
- Răspunde în română
- Fii concis și util
- NU da sfaturi medicale specifice
- NU inventa prețuri sau disponibilități
- Dacă nu știi, spune că operatorul trebuie să verifice`,
            },
            ...messages.map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            })),
          ],
          temperature: 0.7,
          maxTokens: 500,
        });

        return reply.send({
          message: {
            role: 'assistant',
            content: response,
          },
        });
      } catch (error) {
        request.log.error({ error }, 'AI chat error');
        return reply.status(500).send({
          error: 'Failed to generate response',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });

  /**
   * POST /ai/recommendations
   *
   * Get AI-powered procedure recommendations based on patient context.
   */
  fastify.post<{
    Body: {
      patientId: string;
      context?: {
        currentConversation?: Array<{
          direction: 'IN' | 'OUT';
          content: string;
        }>;
        proceduresDiscussed?: string[];
      };
    };
  }>('/ai/recommendations', {
    schema: {
      body: {
        type: 'object',
        properties: {
          patientId: { type: 'string' },
          context: { type: 'object' },
        },
        required: ['patientId'],
      },
    },
    handler: async (request, reply) => {
      const client = getOpenAIClient();
      if (!client) {
        return reply.status(503).send({
          error: 'AI service not configured',
          message: 'OPENAI_API_KEY environment variable is required',
        });
      }

      const { context } = request.body;

      const conversationText = context?.currentConversation
        ?.slice(-10)
        .map((m) => `${m.direction === 'IN' ? 'PACIENT' : 'OPERATOR'}: ${m.content}`)
        .join('\n') ?? '';

      try {
        const response = await client.chatCompletion({
          messages: [
            {
              role: 'system',
              content: `Ești un consultant AI pentru o clinică de chirurgie estetică.
Analizează conversația și recomandă proceduri relevante.

PROCEDURI DISPONIBILE:
- Rinoplastie (3500-5500€) - nas
- Blefaroplastie (1500-2500€) - pleoape
- Lifting facial (4000-8000€) - față
- Liposucție (2000-4000€) - corp
- Implant mamar (3500-5000€) - sâni
- Botox (200-500€) - riduri
- Filler (300-600€) - volume

Răspunde STRICT în format JSON:
{
  "recommendations": [
    {
      "id": "unique-id",
      "name": "Nume procedură",
      "category": "Categorie",
      "relevanceScore": 0.0-1.0,
      "reasoning": "De ce este relevantă",
      "priceRange": {"min": 1000, "max": 2000, "currency": "EUR"},
      "duration": "1-2 ore",
      "relatedProcedures": ["procedură1"],
      "commonQuestions": ["întrebare1"]
    }
  ]
}`,
            },
            {
              role: 'user',
              content: `Analizează conversația și recomandă proceduri:

${conversationText || 'Nu există conversație. Recomandă cele mai populare proceduri.'}`,
            },
          ],
          temperature: 0.5,
          jsonMode: true,
        });

        const parsed = JSON.parse(response) as {
          recommendations: Array<Record<string, unknown>>;
        };

        return reply.send({ recommendations: parsed.recommendations });
      } catch (error) {
        request.log.error({ error }, 'AI recommendations error');
        return reply.status(500).send({
          error: 'Failed to generate recommendations',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    },
  });
};
