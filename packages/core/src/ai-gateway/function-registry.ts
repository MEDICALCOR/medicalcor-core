/**
 * AI-First API Gateway - Function Registry
 *
 * Provides a registry of callable functions for LLMs with OpenAI-compatible
 * function calling format. Makes the API 10x easier for LLMs to use.
 */

import type { ZodSchema } from 'zod';

// OpenAI-compatible function definition
export interface AIFunction {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required: string[];
  };
  returns?: {
    type: string;
    description: string;
  };
  category: AIFunctionCategory;
  examples?: AIFunctionExample[];
  rateLimit?: {
    maxCalls: number;
    windowMs: number;
  };
}

export interface JSONSchemaProperty {
  type: string;
  description: string;
  enum?: string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  format?: string;
  minimum?: number;
  maximum?: number;
  pattern?: string;
  default?: unknown;
}

export interface AIFunctionExample {
  description: string;
  input: Record<string, unknown>;
  output: unknown;
}

export type AIFunctionCategory =
  | 'leads'
  | 'patients'
  | 'appointments'
  | 'messaging'
  | 'payments'
  | 'analytics'
  | 'consent'
  | 'workflows';

export interface AIFunctionCall {
  function: string;
  arguments: Record<string, unknown>;
  callId?: string | undefined;
}

export interface AIFunctionResult {
  callId?: string | undefined;
  function: string;
  success: boolean;
  result?: unknown;
  error?:
    | {
        code: string;
        message: string;
        details?: unknown;
      }
    | undefined;
  executionTimeMs: number;
  traceId?: string | undefined;
}

type FunctionHandler<T, R> = (args: T, context: FunctionContext) => Promise<R>;

export interface FunctionContext {
  correlationId: string;
  userId?: string | undefined;
  tenantId?: string | undefined;
  traceId?: string | undefined;
  spanId?: string | undefined;
}

interface RegisteredFunction {
  definition: AIFunction;
  inputSchema: ZodSchema;
  outputSchema?: ZodSchema | undefined;
  handler: FunctionHandler<unknown, unknown>;
}

/**
 * Central registry for AI-callable functions
 */
export class FunctionRegistry {
  private functions = new Map<string, RegisteredFunction>();
  private categories = new Map<AIFunctionCategory, Set<string>>();

  /**
   * Register a new function for AI calling
   */
  register<TInput, TOutput>(
    definition: AIFunction,
    inputSchema: ZodSchema<TInput>,
    handler: FunctionHandler<TInput, TOutput>,
    outputSchema?: ZodSchema<TOutput>
  ): void {
    if (this.functions.has(definition.name)) {
      throw new Error(`Function '${definition.name}' is already registered`);
    }

    this.functions.set(definition.name, {
      definition,
      inputSchema,
      outputSchema,
      handler: handler as FunctionHandler<unknown, unknown>,
    });

    // Add to category index
    if (!this.categories.has(definition.category)) {
      this.categories.set(definition.category, new Set());
    }
    this.categories.get(definition.category)!.add(definition.name);
  }

  /**
   * Execute a function by name with arguments
   */
  async execute(call: AIFunctionCall, context: FunctionContext): Promise<AIFunctionResult> {
    const startTime = Date.now();
    const fn = this.functions.get(call.function);

    if (!fn) {
      return {
        callId: call.callId,
        function: call.function,
        success: false,
        error: {
          code: 'FUNCTION_NOT_FOUND',
          message: `Function '${call.function}' is not registered`,
        },
        executionTimeMs: Date.now() - startTime,
        traceId: context.traceId,
      };
    }

    // Validate input
    const validation = fn.inputSchema.safeParse(call.arguments);
    if (!validation.success) {
      return {
        callId: call.callId,
        function: call.function,
        success: false,
        error: {
          code: 'INVALID_ARGUMENTS',
          message: 'Function arguments validation failed',
          details: validation.error.flatten(),
        },
        executionTimeMs: Date.now() - startTime,
        traceId: context.traceId,
      };
    }

    try {
      const result = await fn.handler(validation.data, context);

      // Validate output if schema provided
      if (fn.outputSchema) {
        const outputValidation = fn.outputSchema.safeParse(result);
        if (!outputValidation.success) {
          return {
            callId: call.callId,
            function: call.function,
            success: false,
            error: {
              code: 'INVALID_OUTPUT',
              message: 'Function output validation failed',
              details: outputValidation.error.flatten(),
            },
            executionTimeMs: Date.now() - startTime,
            traceId: context.traceId,
          };
        }
      }

      return {
        callId: call.callId,
        function: call.function,
        success: true,
        result,
        executionTimeMs: Date.now() - startTime,
        traceId: context.traceId,
      };
    } catch (error) {
      return {
        callId: call.callId,
        function: call.function,
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        executionTimeMs: Date.now() - startTime,
        traceId: context.traceId,
      };
    }
  }

  /**
   * Execute multiple function calls (for parallel tool use)
   */
  async executeMany(
    calls: AIFunctionCall[],
    context: FunctionContext
  ): Promise<AIFunctionResult[]> {
    return Promise.all(calls.map((call) => this.execute(call, context)));
  }

  /**
   * Get all function definitions (for LLM tool discovery)
   */
  getAllFunctions(): AIFunction[] {
    return Array.from(this.functions.values()).map((f) => f.definition);
  }

  /**
   * Get functions by category
   */
  getFunctionsByCategory(category: AIFunctionCategory): AIFunction[] {
    const functionNames = this.categories.get(category) ?? new Set();
    return Array.from(functionNames)
      .map((name) => this.functions.get(name)?.definition)
      .filter((f): f is AIFunction => f !== undefined);
  }

  /**
   * Get OpenAI-compatible tools array
   */
  getOpenAITools(): {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: AIFunction['parameters'];
    };
  }[] {
    return this.getAllFunctions().map((fn) => ({
      type: 'function' as const,
      function: {
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters,
      },
    }));
  }

  /**
   * Get Claude/Anthropic-compatible tools array
   */
  getAnthropicTools(): {
    name: string;
    description: string;
    input_schema: {
      type: 'object';
      properties: Record<string, JSONSchemaProperty>;
      required: string[];
    };
  }[] {
    return this.getAllFunctions().map((fn) => ({
      name: fn.name,
      description: fn.description,
      input_schema: fn.parameters,
    }));
  }

  /**
   * Check if a function exists
   */
  has(name: string): boolean {
    return this.functions.has(name);
  }

  /**
   * Get function definition by name
   */
  getFunction(name: string): AIFunction | undefined {
    return this.functions.get(name)?.definition;
  }

  /**
   * Get categories with function counts
   */
  getCategorySummary(): {
    category: AIFunctionCategory;
    count: number;
    functions: string[];
  }[] {
    return Array.from(this.categories.entries()).map(([category, names]) => ({
      category,
      count: names.size,
      functions: Array.from(names),
    }));
  }
}

// Global function registry instance
export const functionRegistry = new FunctionRegistry();

/**
 * Decorator for registering functions
 */
export function RegisterFunction(_definition: AIFunction, _inputSchema: ZodSchema) {
  return function <T extends new (...args: unknown[]) => unknown>(
    target: T,
    _context: ClassDecoratorContext
  ) {
    return target;
  };
}

// ============================================================================
// ZOD INTERNAL TYPES - Type definitions for Zod's internal structure
// ============================================================================

/**
 * Zod's internal definition structure.
 * This is intentionally loosely typed because Zod's internals are not public API,
 * but we use specific type narrowing for safety.
 */
interface ZodDefBase {
  typeName: string;
  description?: string;
}

interface ZodStringDef extends ZodDefBase {
  typeName: 'ZodString';
}

interface ZodNumberDef extends ZodDefBase {
  typeName: 'ZodNumber';
}

interface ZodBooleanDef extends ZodDefBase {
  typeName: 'ZodBoolean';
}

interface ZodArrayDef extends ZodDefBase {
  typeName: 'ZodArray';
  type: ZodSchema;
}

interface ZodObjectDef extends ZodDefBase {
  typeName: 'ZodObject';
  shape: (() => Record<string, ZodSchema>) | Record<string, ZodSchema>;
}

interface ZodEnumDef extends ZodDefBase {
  typeName: 'ZodEnum';
  values: string[];
}

interface ZodOptionalDef extends ZodDefBase {
  typeName: 'ZodOptional';
  innerType: ZodSchema;
}

interface ZodDefaultDef extends ZodDefBase {
  typeName: 'ZodDefault';
  innerType: ZodSchema;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  defaultValue: Function | string | number | boolean | null | undefined | object;
}

type ZodDef =
  | ZodStringDef
  | ZodNumberDef
  | ZodBooleanDef
  | ZodArrayDef
  | ZodObjectDef
  | ZodEnumDef
  | ZodOptionalDef
  | ZodDefaultDef
  | ZodDefBase;

/**
 * Type guard to check if schema has internal definition
 */
function hasZodDef(schema: ZodSchema): schema is ZodSchema & { _def: ZodDef } {
  return '_def' in schema && typeof (schema as { _def?: unknown })._def === 'object';
}

/**
 * Type guard helpers for specific Zod types
 */
function isZodArrayDef(def: ZodDef): def is ZodArrayDef {
  return def.typeName === 'ZodArray';
}

function isZodObjectDef(def: ZodDef): def is ZodObjectDef {
  return def.typeName === 'ZodObject';
}

function isZodEnumDef(def: ZodDef): def is ZodEnumDef {
  return def.typeName === 'ZodEnum';
}

function isZodOptionalDef(def: ZodDef): def is ZodOptionalDef {
  return def.typeName === 'ZodOptional';
}

function isZodDefaultDef(def: ZodDef): def is ZodDefaultDef {
  return def.typeName === 'ZodDefault';
}

/**
 * Helper to convert Zod schema to JSON Schema for function parameters.
 * Uses type guards and discriminated unions for type safety.
 */
export function zodToJsonSchema(schema: ZodSchema): JSONSchemaProperty {
  // Safely access Zod's internal definition
  if (!hasZodDef(schema)) {
    return { type: 'unknown', description: '' };
  }

  const def = schema._def;

  switch (def.typeName) {
    case 'ZodString':
      return {
        type: 'string',
        description: def.description ?? '',
      };

    case 'ZodNumber':
      return {
        type: 'number',
        description: def.description ?? '',
      };

    case 'ZodBoolean':
      return {
        type: 'boolean',
        description: def.description ?? '',
      };

    case 'ZodArray':
      if (isZodArrayDef(def)) {
        return {
          type: 'array',
          description: def.description ?? '',
          items: zodToJsonSchema(def.type),
        };
      }
      return { type: 'array', description: def.description ?? '' };

    case 'ZodObject': {
      if (isZodObjectDef(def)) {
        const shape = typeof def.shape === 'function' ? def.shape() : def.shape;
        const properties: Record<string, JSONSchemaProperty> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          properties[key] = zodToJsonSchema(value);
          // Check if field is optional by examining inner type
          if (hasZodDef(value) && value._def.typeName !== 'ZodOptional') {
            required.push(key);
          }
        }

        return {
          type: 'object',
          description: def.description ?? '',
          properties,
          required,
        };
      }
      return { type: 'object', description: def.description ?? '' };
    }

    case 'ZodEnum':
      if (isZodEnumDef(def)) {
        return {
          type: 'string',
          description: def.description ?? '',
          enum: def.values,
        };
      }
      return { type: 'string', description: def.description ?? '' };

    case 'ZodOptional':
      if (isZodOptionalDef(def)) {
        return zodToJsonSchema(def.innerType);
      }
      return { type: 'unknown', description: def.description ?? '' };

    case 'ZodDefault':
      if (isZodDefaultDef(def)) {
        const defaultValue =
          typeof def.defaultValue === 'function'
            ? (def.defaultValue as () => unknown)()
            : def.defaultValue;
        return {
          ...zodToJsonSchema(def.innerType),
          default: defaultValue,
        };
      }
      return { type: 'unknown', description: def.description ?? '' };

    default:
      // Fallback for unhandled Zod types
      return {
        type: 'string',
        description: def.description ?? '',
      };
  }
}
