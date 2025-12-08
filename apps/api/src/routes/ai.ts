/* eslint-disable @typescript-eslint/no-unsafe-argument */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { z } from 'zod';
import {
  FunctionRegistry,
  createAIRouter,
  AIRequestSchema,
  ALL_MEDICAL_FUNCTIONS,
  FUNCTION_INPUT_SCHEMAS,
  type AIFunctionCategory,
  type FunctionContext,
  // New AI Gateway imports
  createUserRateLimiter,
  createTokenEstimator,
  createAIBudgetController,
  createAdaptiveTimeoutManager,
  type UserRateLimiter,
  type TokenEstimator,
  type AIBudgetController,
  type AdaptiveTimeoutManager,
  type UserTier,
  type AIOperationType,
  type SecureRedisClient,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic function registration requires type flexibility
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

// AI Gateway services (lazily initialized with Redis)
let userRateLimiter: UserRateLimiter | null = null;
let budgetController: AIBudgetController | null = null;
const tokenEstimator: TokenEstimator = createTokenEstimator();
const timeoutManager: AdaptiveTimeoutManager = createAdaptiveTimeoutManager();

/**
 * Initialize AI Gateway services with Redis
 * Called when the first request comes in with Redis available
 */
function initializeAIGatewayServices(redis: SecureRedisClient): void {
  if (!userRateLimiter && redis) {
    userRateLimiter = createUserRateLimiter(redis, {
      enabled: true,
      defaultTier: 'basic',
      enableTokenLimiting: true,
      enableConcurrentLimiting: true,
    });
  }

  if (!budgetController && redis) {
    // SECURITY: Budget limits are critical for cost control
    // blockOnExceeded should ALWAYS be true in production
    const isProduction = process.env.NODE_ENV === 'production';

    budgetController = createAIBudgetController(redis, {
      enabled: true,
      defaultDailyBudget: Number(process.env.AI_BUDGET_DAILY_USER) || 50, // $50/day per user
      defaultMonthlyBudget: Number(process.env.AI_BUDGET_MONTHLY_USER) || 1000, // $1000/month per user
      globalDailyBudget: Number(process.env.AI_BUDGET_DAILY_GLOBAL) || 500, // $500/day global
      globalMonthlyBudget: Number(process.env.AI_BUDGET_MONTHLY_GLOBAL) || 10000, // $10000/month global
      alertThresholds: [0.5, 0.75, 0.9],
      // CRITICAL: Block requests when budget exceeded in production
      // Only allow soft limits in development for testing
      blockOnExceeded: process.env.AI_BUDGET_SOFT_LIMIT === 'true' ? false : isProduction,
      onAlert: async (alert) => {
        // SECURITY FIX: Use structured logging instead of console.warn in production
        // Use createLogger from @medicalcor/core since fastify is not in scope
        const { createLogger } = await import('@medicalcor/core');
        const logger = createLogger({ name: 'ai-budget-controller' });

        const alertData = {
          event: 'ai_budget_alert',
          alertId: alert.id,
          scope: alert.scope,
          scopeId: alert.scopeId,
          threshold: alert.threshold,
          percentUsed: alert.percentUsed,
          currentSpend: alert.currentSpend,
          budgetLimit: alert.budgetLimit,
          severity:
            alert.percentUsed >= 0.9 ? 'critical' : alert.percentUsed >= 0.75 ? 'warning' : 'info',
          timestamp: new Date().toISOString(),
        };

        logger.warn(alertData, '[AI Budget Alert] Budget threshold exceeded');

        // Emit event for monitoring systems (Sentry, PagerDuty, Datadog, etc.)
        // This can be picked up by observability infrastructure
        if (typeof process.emit === 'function') {
          (process.emit as (event: string, data: unknown) => boolean)('ai:budget:alert', alertData);
        }

        // For Sentry integration - check if Sentry is available
        // Uses dynamic import and type guard to avoid direct Sentry dependency
        try {
          const SentryModule = await import('@sentry/node').catch(() => null);
          if (
            SentryModule &&
            'captureMessage' in SentryModule &&
            typeof SentryModule.captureMessage === 'function'
          ) {
            SentryModule.captureMessage(
              `AI Budget Alert: ${alert.scope} at ${(alert.percentUsed * 100).toFixed(1)}%`,
              {
                level: alert.percentUsed >= 0.9 ? 'error' : 'warning',
                tags: {
                  scope: alert.scope,
                  scopeId: alert.scopeId ?? 'global',
                },
                extra: alertData,
              }
            );
          }
        } catch {
          // Sentry not configured - alerts still logged
        }
      },
    });
  }
}

/**
 * Determine operation type from request for timeout configuration
 */
function getOperationType(request: z.infer<typeof AIRequestSchema>): AIOperationType {
  if (request.type === 'natural') {
    // Natural language requests - check if it's likely scoring
    const query = request.query.toLowerCase();
    if (query.includes('scor') || query.includes('lead') || query.includes('calific')) {
      return 'scoring';
    }
    return 'function_call';
  }

  if (request.type === 'function_call') {
    const firstCall = request.calls[0];
    if (firstCall?.function.includes('score')) {
      return 'scoring';
    }
    if (firstCall?.function.includes('reply') || firstCall?.function.includes('message')) {
      return 'reply_generation';
    }
    return 'function_call';
  }

  if (request.type === 'workflow') {
    return 'workflow';
  }

  return 'default';
}

/**
 * Get user tier from headers or default
 */
function getUserTier(headers: Record<string, string | string[] | undefined>): UserTier {
  const tierHeader = headers['x-user-tier'];
  if (typeof tierHeader === 'string') {
    const validTiers: UserTier[] = ['free', 'basic', 'pro', 'enterprise', 'unlimited'];
    if (validTiers.includes(tierHeader as UserTier)) {
      return tierHeader as UserTier;
    }
  }
  return 'basic';
}

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
   * FEATURES:
   * - Adaptive timeout (5s for scoring, 30s for others)
   * - User-based rate limiting with token budgets
   * - Pre-call cost estimation
   * - Budget alerts at 50%, 75%, 90%
   * - Instant fallback for critical operations
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
      const startTime = Date.now();

      // Initialize AI Gateway services if Redis is available
      const redis = (fastify as unknown as { redis?: SecureRedisClient }).redis;
      if (redis) {
        initializeAIGatewayServices(redis);
      }

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

      // Get user tier and operation type
      const userTier = getUserTier(request.headers);
      const operationType = getOperationType(parseResult.data);
      const timeoutConfig = timeoutManager.getTimeoutConfig(operationType);

      // Estimate tokens and cost before execution
      let estimatedTokens = { input: 500, output: 500 }; // Default estimate
      if (parseResult.data.type === 'natural') {
        const estimate = tokenEstimator.estimate(
          [{ role: 'user', content: parseResult.data.query }],
          { model: 'gpt-4o', maxOutputTokens: 500 }
        );
        estimatedTokens = { input: estimate.inputTokens, output: estimate.estimatedOutputTokens };
      }
      const estimatedCost = tokenEstimator.estimateCost(
        [{ role: 'user', content: JSON.stringify(parseResult.data) }],
        { model: 'gpt-4o', maxOutputTokens: estimatedTokens.output }
      );

      // Check user rate limit (if rate limiter is available)
      if (userRateLimiter) {
        const rateLimitResult = await userRateLimiter.checkLimit(userId, {
          tier: userTier,
          estimatedTokens: estimatedTokens.input + estimatedTokens.output,
          operationType,
        });

        if (!rateLimitResult.allowed) {
          reply.header('X-RateLimit-Limit', rateLimitResult.limit.toString());
          reply.header('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
          reply.header('X-RateLimit-Reset', rateLimitResult.resetAt.toString());
          reply.header(
            'Retry-After',
            (rateLimitResult.retryAfter ?? rateLimitResult.resetInSeconds).toString()
          );

          return reply.status(429).send({
            code: 'RATE_LIMIT_EXCEEDED',
            message: rateLimitResult.reason ?? 'Too many requests',
            retryAfter: rateLimitResult.retryAfter ?? rateLimitResult.resetInSeconds,
            tier: userTier,
          });
        }

        // Set rate limit headers
        reply.header('X-RateLimit-Limit', rateLimitResult.limit.toString());
        reply.header('X-RateLimit-Remaining', rateLimitResult.remaining.toString());
        reply.header('X-RateLimit-Reset', rateLimitResult.resetAt.toString());
      }

      // Check budget (if budget controller is available)
      let budgetWarning: string | undefined;
      if (budgetController) {
        const budgetResult = await budgetController.checkBudget({
          userId,
          ...(tenantId && { tenantId }),
          estimatedCost: estimatedCost.totalCost,
          model: 'gpt-4o',
          estimatedTokens,
        });

        if (!budgetResult.allowed) {
          return reply.status(402).send({
            code: 'BUDGET_EXCEEDED',
            message: budgetResult.reason ?? 'AI budget exceeded',
            status: budgetResult.status,
            remainingDaily: budgetResult.remainingDaily,
            remainingMonthly: budgetResult.remainingMonthly,
          });
        }

        // Add budget warning header if near limit
        if (budgetResult.status === 'warning' || budgetResult.status === 'critical') {
          budgetWarning = `${budgetResult.status}: Daily $${budgetResult.remainingDaily.toFixed(2)} / Monthly $${budgetResult.remainingMonthly.toFixed(2)} remaining`;
          reply.header('X-Budget-Warning', budgetWarning);
        }

        // Set budget headers
        reply.header('X-Budget-Status', budgetResult.status);
        reply.header('X-Estimated-Cost', estimatedCost.totalCost.toFixed(4));
      }

      const context: FunctionContext = {
        correlationId,
        traceId,
        userId,
        tenantId,
      };

      try {
        // Execute with adaptive timeout and proper cleanup
        const executePromise = router.process(parseResult.data, context);
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`Operation timed out after ${timeoutConfig.timeoutMs}ms`));
          }, timeoutConfig.timeoutMs);
        });

        let response: Awaited<ReturnType<typeof router.process>>;
        let usedFallback = false;

        try {
          response = await Promise.race([executePromise, timeoutPromise]);
        } catch (error) {
          // If instant fallback is enabled and operation timed out
          if (
            timeoutConfig.instantFallback &&
            error instanceof Error &&
            error.message.includes('timed out')
          ) {
            request.log.warn(
              { correlationId, operationType },
              'Operation timed out, using fallback'
            );
            usedFallback = true;

            // Return a fallback response for scoring operations
            if (operationType === 'scoring') {
              response = {
                success: true,
                requestId: crypto.randomUUID(),
                type: parseResult.data.type,
                results: [
                  {
                    function: 'score_lead',
                    success: true,
                    result: {
                      score: 3, // Default mid-range score
                      classification: 'WARM',
                      confidence: 0.5,
                      reasoning: 'Fallback response due to timeout - manual review recommended',
                      suggestedAction: 'Queue for manual scoring',
                      usedFallback: true,
                    },
                    executionTimeMs: Date.now() - startTime,
                  },
                ],
                totalExecutionTimeMs: Date.now() - startTime,
                traceId,
              };
            } else {
              // Re-throw for non-fallback operations
              throw error;
            }
          } else {
            throw error;
          }
        } finally {
          // Clean up timeout to prevent memory leaks
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
        }

        const executionTime = Date.now() - startTime;

        // Record actual cost (if budget controller available)
        // Wrapped in try-catch to avoid failing the request if recording fails
        if (budgetController) {
          try {
            // Use actual tokens if available, otherwise estimate
            const actualCost = estimatedCost.totalCost * (response.success ? 1 : 0.1);
            await budgetController.recordCost(actualCost, {
              userId,
              ...(tenantId && { tenantId }),
              model: 'gpt-4o',
              operation: operationType,
            });
          } catch (recordError) {
            request.log.warn(
              { error: recordError, correlationId },
              'Failed to record cost - continuing with response'
            );
          }
        }

        // Record token usage (if rate limiter available)
        // Wrapped in try-catch to avoid failing the request if recording fails
        if (userRateLimiter) {
          try {
            await userRateLimiter.recordTokenUsage(
              userId,
              estimatedTokens.input + estimatedTokens.output,
              {
                tier: userTier,
                operationType,
              }
            );
          } catch (recordError) {
            request.log.warn(
              { error: recordError, correlationId },
              'Failed to record token usage - continuing with response'
            );
          }
        }

        // Record performance metrics for adaptive timeout
        timeoutManager.recordPerformance(operationType, executionTime, response.success);

        // Set response headers
        reply.header('X-Correlation-Id', correlationId);
        reply.header('X-Trace-Id', traceId);
        reply.header('X-Execution-Time-Ms', executionTime.toString());
        reply.header('X-Operation-Type', operationType);
        reply.header('X-Timeout-Ms', timeoutConfig.timeoutMs.toString());
        if (usedFallback) {
          reply.header('X-Used-Fallback', 'true');
        }

        return reply.send({
          ...response,
          _meta: {
            operationType,
            timeoutMs: timeoutConfig.timeoutMs,
            estimatedCost: estimatedCost.totalCost,
            usedFallback,
            budgetWarning,
          },
        });
      } catch (error) {
        request.log.error({ error, correlationId, operationType }, 'AI execution error');

        // Record failed execution
        timeoutManager.recordPerformance(operationType, Date.now() - startTime, false);

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        const isTimeout = errorMessage.includes('timed out');

        return reply.status(isTimeout ? 504 : 500).send({
          code: isTimeout ? 'TIMEOUT_ERROR' : 'EXECUTION_ERROR',
          message: isTimeout
            ? `AI request timed out after ${timeoutConfig.timeoutMs}ms`
            : 'Failed to execute AI request',
          correlationId,
          operationType,
          timeoutMs: timeoutConfig.timeoutMs,
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
};
