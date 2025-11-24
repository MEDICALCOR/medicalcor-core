/**
 * AI-First API Gateway - AI Router
 *
 * Intelligent router that can:
 * 1. Accept natural language requests and route to appropriate functions
 * 2. Process structured function calls from LLMs
 * 3. Handle multi-step workflows with function chaining
 */

import { z } from 'zod';
import type {
  AIFunction,
  AIFunctionCall,
  AIFunctionResult,
  FunctionContext,
  FunctionRegistry,
} from './function-registry.js';

// ============================================================================
// REQUEST/RESPONSE SCHEMAS
// ============================================================================

export const AIRequestSchema = z.discriminatedUnion('type', [
  // Natural language request - AI will determine which function(s) to call
  z.object({
    type: z.literal('natural'),
    query: z.string().describe('Natural language request'),
    context: z
      .object({
        patientId: z.string().optional(),
        phone: z.string().optional(),
        conversationHistory: z
          .array(
            z.object({
              role: z.enum(['user', 'assistant', 'system']),
              content: z.string(),
            })
          )
          .optional(),
      })
      .optional()
      .describe('Additional context for the request'),
  }),

  // Direct function call - LLM already knows which function to call
  z.object({
    type: z.literal('function_call'),
    calls: z.array(
      z.object({
        function: z.string().describe('Function name'),
        arguments: z.record(z.unknown()).describe('Function arguments'),
        callId: z.string().optional().describe('Optional call ID for tracking'),
      })
    ),
  }),

  // Multi-step workflow - Execute a sequence of functions
  z.object({
    type: z.literal('workflow'),
    steps: z.array(
      z.object({
        function: z.string(),
        arguments: z.record(z.unknown()),
        dependsOn: z.array(z.string()).optional().describe('Step IDs this step depends on'),
        stepId: z.string().describe('Unique step identifier'),
        transformInput: z.string().optional().describe('JSONPath expression to transform input from previous steps'),
      })
    ),
  }),
]);

export type AIRequest = z.infer<typeof AIRequestSchema>;

export interface AIResponse {
  success: boolean;
  requestId: string;
  type: AIRequest['type'];
  results: AIFunctionResult[];
  totalExecutionTimeMs: number;
  suggestedFollowUp?: {
    message: string;
    functions: string[];
  };
  traceId?: string;
}

// ============================================================================
// INTENT DETECTION
// ============================================================================

export interface DetectedIntent {
  function: string;
  confidence: number;
  extractedArgs: Record<string, unknown>;
  reasoning?: string;
}

const INTENT_PATTERNS: Array<{
  patterns: RegExp[];
  function: string;
  argExtractors: Record<string, (match: RegExpMatchArray, query: string) => unknown>;
}> = [
  {
    patterns: [
      /scor(?:e|ează|ui|ează-mi)\s+lead/i,
      /analizează\s+lead/i,
      /calific(?:ă|are)\s+lead/i,
      /evalueaz(?:ă|a)\s+(?:un\s+)?lead/i,
    ],
    function: 'score_lead',
    argExtractors: {
      phone: (_match, query) => {
        const phoneMatch = query.match(/\+?\d{10,14}/);
        return phoneMatch?.[0];
      },
      channel: (_match, query) => {
        if (/whatsapp/i.test(query)) return 'whatsapp';
        if (/voce|apel|telefon/i.test(query)) return 'voice';
        if (/web|site|formular/i.test(query)) return 'web';
        if (/referral|recomandare/i.test(query)) return 'referral';
        return undefined;
      },
    },
  },
  {
    patterns: [
      /programeaz(?:ă|a|are)/i,
      /schedule\s+(?:an?\s+)?appointment/i,
      /f(?:ă|a)\s+(?:o\s+)?programare/i,
      /rezerv(?:ă|a|are)/i,
    ],
    function: 'schedule_appointment',
    argExtractors: {
      preferredDate: (_match, query) => {
        // Extract date patterns like "2024-12-15" or "mâine" or "săptămâna viitoare"
        const dateMatch = query.match(/\d{4}-\d{2}-\d{2}/);
        if (dateMatch) return dateMatch[0];

        if (/mâine/i.test(query)) {
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          return tomorrow.toISOString().split('T')[0];
        }
        return undefined;
      },
      serviceType: (_match, query) => {
        if (/albire|whitening/i.test(query)) return 'whitening';
        if (/curăț|cleaning|igienizare/i.test(query)) return 'cleaning';
        if (/consult/i.test(query)) return 'consultation';
        if (/extracție|extraction/i.test(query)) return 'extraction';
        if (/implant/i.test(query)) return 'implant';
        return 'consultation';
      },
    },
  },
  {
    patterns: [
      /trimite\s+(?:un\s+)?mesaj/i,
      /send\s+(?:a\s+)?(?:whatsapp\s+)?message/i,
      /mesaj\s+pe\s+whatsapp/i,
      /contacteaz(?:ă|a)/i,
    ],
    function: 'send_whatsapp',
    argExtractors: {
      to: (_match, query) => {
        const phoneMatch = query.match(/\+?\d{10,14}/);
        return phoneMatch?.[0];
      },
      message: (_match, query) => {
        // Try to extract quoted message
        const quotedMatch = query.match(/[„"']([^„"']+)[„"']/);
        return quotedMatch?.[1];
      },
    },
  },
  {
    patterns: [
      /anulează\s+programare/i,
      /cancel\s+(?:the\s+)?appointment/i,
      /șterge\s+programare/i,
    ],
    function: 'cancel_appointment',
    argExtractors: {
      appointmentId: (_match, query) => {
        const idMatch = query.match(/apt-\w+|[a-f0-9-]{36}/i);
        return idMatch?.[0];
      },
    },
  },
  {
    patterns: [
      /consimțământ|consent/i,
      /acord\s+gdpr/i,
      /înregistrează\s+acord/i,
    ],
    function: 'record_consent',
    argExtractors: {
      status: (_match, query) => {
        if (/refuz|denied|nu\s+accept/i.test(query)) return 'denied';
        if (/retrag|withdraw/i.test(query)) return 'withdrawn';
        return 'granted';
      },
    },
  },
  {
    patterns: [
      /analitice|analytics|statistici|raport/i,
      /câți\s+lead/i,
      /conversii|conversion/i,
    ],
    function: 'get_lead_analytics',
    argExtractors: {
      groupBy: (_match, query) => {
        if (/zi|daily/i.test(query)) return 'day';
        if (/săptămân|week/i.test(query)) return 'week';
        if (/lun|month/i.test(query)) return 'month';
        if (/canal|channel/i.test(query)) return 'channel';
        return 'day';
      },
    },
  },
  {
    patterns: [
      /găsește\s+pacient/i,
      /caută\s+pacient/i,
      /informații\s+(?:despre\s+)?pacient/i,
      /get\s+patient/i,
      /find\s+patient/i,
    ],
    function: 'get_patient',
    argExtractors: {
      phone: (_match, query) => {
        const phoneMatch = query.match(/\+?\d{10,14}/);
        return phoneMatch?.[0];
      },
      email: (_match, query) => {
        const emailMatch = query.match(/[\w.-]+@[\w.-]+\.\w+/);
        return emailMatch?.[0];
      },
    },
  },
  {
    patterns: [
      /sloturi\s+disponibile/i,
      /available\s+slots/i,
      /când\s+(?:e|este)\s+liber/i,
      /disponibilități/i,
    ],
    function: 'get_available_slots',
    argExtractors: {
      startDate: () => new Date().toISOString().split('T')[0],
      endDate: () => {
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        return nextWeek.toISOString().split('T')[0];
      },
    },
  },
  {
    patterns: [
      /declanșează\s+workflow/i,
      /trigger\s+workflow/i,
      /pornește\s+proces/i,
    ],
    function: 'trigger_workflow',
    argExtractors: {
      workflow: (_match, query) => {
        if (/scoring|scor/i.test(query)) return 'lead-scoring';
        if (/journey|călătorie/i.test(query)) return 'patient-journey';
        if (/nurture/i.test(query)) return 'nurture-sequence';
        if (/booking|programare/i.test(query)) return 'booking-agent';
        return 'lead-scoring';
      },
    },
  },
];

/**
 * Detect intent from natural language query
 */
export function detectIntent(
  query: string,
  availableFunctions: AIFunction[]
): DetectedIntent[] {
  const detectedIntents: DetectedIntent[] = [];
  const availableFunctionNames = new Set(availableFunctions.map((f) => f.name));

  for (const { patterns, function: fnName, argExtractors } of INTENT_PATTERNS) {
    // Skip if function not available
    if (!availableFunctionNames.has(fnName)) continue;

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match) {
        const extractedArgs: Record<string, unknown> = {};

        // Extract arguments using extractors
        for (const [argName, extractor] of Object.entries(argExtractors)) {
          const value = extractor(match, query);
          if (value !== undefined) {
            extractedArgs[argName] = value;
          }
        }

        detectedIntents.push({
          function: fnName,
          confidence: 0.8 + Math.random() * 0.15, // 0.8-0.95
          extractedArgs,
          reasoning: `Matched pattern: ${pattern.source}`,
        });

        break; // Only match first pattern per function
      }
    }
  }

  // Sort by confidence
  return detectedIntents.sort((a, b) => b.confidence - a.confidence);
}

// ============================================================================
// AI ROUTER CLASS
// ============================================================================

export interface AIRouterConfig {
  maxParallelCalls: number;
  defaultTimeout: number;
  enableIntentDetection: boolean;
  minIntentConfidence: number;
}

const DEFAULT_CONFIG: AIRouterConfig = {
  maxParallelCalls: 10,
  defaultTimeout: 30000,
  enableIntentDetection: true,
  minIntentConfidence: 0.7,
};

export class AIRouter {
  constructor(
    private registry: FunctionRegistry,
    private config: AIRouterConfig = DEFAULT_CONFIG
  ) {}

  /**
   * Process an AI request
   */
  async process(request: AIRequest, context: FunctionContext): Promise<AIResponse> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    switch (request.type) {
      case 'natural':
        return this.processNaturalRequest(request, context, requestId, startTime);
      case 'function_call':
        return this.processFunctionCalls(request, context, requestId, startTime);
      case 'workflow':
        return this.processWorkflow(request, context, requestId, startTime);
    }
  }

  /**
   * Process natural language request
   */
  private async processNaturalRequest(
    request: Extract<AIRequest, { type: 'natural' }>,
    context: FunctionContext,
    requestId: string,
    startTime: number
  ): Promise<AIResponse> {
    if (!this.config.enableIntentDetection) {
      return {
        success: false,
        requestId,
        type: 'natural',
        results: [
          {
            function: 'intent_detection',
            success: false,
            error: {
              code: 'INTENT_DETECTION_DISABLED',
              message: 'Natural language processing is disabled',
            },
            executionTimeMs: Date.now() - startTime,
          },
        ],
        totalExecutionTimeMs: Date.now() - startTime,
      };
    }

    // Detect intents from query
    const intents = detectIntent(request.query, this.registry.getAllFunctions());

    if (intents.length === 0 || intents[0]!.confidence < this.config.minIntentConfidence) {
      return {
        success: false,
        requestId,
        type: 'natural',
        results: [
          {
            function: 'intent_detection',
            success: false,
            error: {
              code: 'NO_INTENT_DETECTED',
              message: 'Could not determine which function to call from the query',
            },
            executionTimeMs: Date.now() - startTime,
          },
        ],
        totalExecutionTimeMs: Date.now() - startTime,
        suggestedFollowUp: {
          message: 'Try being more specific or use a direct function call',
          functions: this.registry.getAllFunctions().slice(0, 5).map((f) => f.name),
        },
      };
    }

    // Execute top intent
    const topIntent = intents[0]!;

    // Merge extracted args with context
    const mergedArgs = {
      ...topIntent.extractedArgs,
      ...(request.context?.patientId && { patientId: request.context.patientId }),
      ...(request.context?.phone && { phone: request.context.phone }),
    };

    const result = await this.registry.execute(
      {
        function: topIntent.function,
        arguments: mergedArgs,
      },
      context
    );

    return {
      success: result.success,
      requestId,
      type: 'natural',
      results: [result],
      totalExecutionTimeMs: Date.now() - startTime,
      traceId: context.traceId,
    };
  }

  /**
   * Process direct function calls
   */
  private async processFunctionCalls(
    request: Extract<AIRequest, { type: 'function_call' }>,
    context: FunctionContext,
    requestId: string,
    startTime: number
  ): Promise<AIResponse> {
    // Limit parallel calls
    const calls = request.calls.slice(0, this.config.maxParallelCalls);

    const results = await this.registry.executeMany(calls, context);

    return {
      success: results.every((r) => r.success),
      requestId,
      type: 'function_call',
      results,
      totalExecutionTimeMs: Date.now() - startTime,
      traceId: context.traceId,
    };
  }

  /**
   * Process multi-step workflow
   */
  private async processWorkflow(
    request: Extract<AIRequest, { type: 'workflow' }>,
    context: FunctionContext,
    requestId: string,
    startTime: number
  ): Promise<AIResponse> {
    const stepResults = new Map<string, AIFunctionResult>();
    const results: AIFunctionResult[] = [];

    // Build dependency graph
    const pendingSteps = new Set(request.steps.map((s) => s.stepId));
    const completedSteps = new Set<string>();

    while (pendingSteps.size > 0) {
      // Find steps that can be executed (all dependencies met)
      const executableSteps = request.steps.filter(
        (step) =>
          pendingSteps.has(step.stepId) &&
          (step.dependsOn ?? []).every((dep) => completedSteps.has(dep))
      );

      if (executableSteps.length === 0) {
        // Deadlock - remaining steps have unmet dependencies
        for (const stepId of pendingSteps) {
          results.push({
            function: 'workflow_step',
            success: false,
            error: {
              code: 'DEPENDENCY_DEADLOCK',
              message: `Step ${stepId} has unresolvable dependencies`,
            },
            executionTimeMs: 0,
          });
        }
        break;
      }

      // Execute all executable steps in parallel
      const stepPromises = executableSteps.map(async (step) => {
        let args = step.arguments;

        // Apply input transformation if specified
        if (step.transformInput && step.dependsOn?.length) {
          args = this.transformStepInput(step, stepResults);
        }

        const result = await this.registry.execute(
          {
            function: step.function,
            arguments: args,
            callId: step.stepId,
          },
          context
        );

        return { stepId: step.stepId, result };
      });

      const stepOutcomes = await Promise.all(stepPromises);

      for (const { stepId, result } of stepOutcomes) {
        stepResults.set(stepId, result);
        results.push(result);
        pendingSteps.delete(stepId);
        completedSteps.add(stepId);
      }
    }

    return {
      success: results.every((r) => r.success),
      requestId,
      type: 'workflow',
      results,
      totalExecutionTimeMs: Date.now() - startTime,
      traceId: context.traceId,
    };
  }

  /**
   * Transform step input based on previous results
   */
  private transformStepInput(
    step: { arguments: Record<string, unknown>; dependsOn?: string[]; transformInput?: string },
    previousResults: Map<string, AIFunctionResult>
  ): Record<string, unknown> {
    const args = { ...step.arguments };

    // Simple transformation: replace {{stepId.path}} with values from previous results
    const transform = step.transformInput ?? '';
    const matches = transform.matchAll(/\{\{(\w+)\.(\w+)\}\}/g);

    for (const match of matches) {
      const [, stepId, path] = match as unknown as [string, string, string];
      const previousResult = previousResults.get(stepId);
      if (previousResult?.success && previousResult.result) {
        const value = (previousResult.result as Record<string, unknown>)[path];
        if (value !== undefined) {
          args[path] = value;
        }
      }
    }

    return args;
  }

  /**
   * Get OpenAI-compatible function schemas
   */
  getOpenAITools() {
    return this.registry.getOpenAITools();
  }

  /**
   * Get Anthropic-compatible tool schemas
   */
  getAnthropicTools() {
    return this.registry.getAnthropicTools();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createAIRouter(
  registry: FunctionRegistry,
  config?: Partial<AIRouterConfig>
): AIRouter {
  return new AIRouter(registry, { ...DEFAULT_CONFIG, ...config });
}
