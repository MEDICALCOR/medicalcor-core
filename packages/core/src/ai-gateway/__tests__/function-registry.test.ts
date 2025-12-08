/**
 * Function Registry Tests
 *
 * Tests for AI function registration and execution
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FunctionRegistry,
  zodToJsonSchema,
  type AIFunction,
  type AIFunctionCall,
  type FunctionContext,
} from '../function-registry.js';
import { z } from 'zod';

describe('FunctionRegistry', () => {
  let registry: FunctionRegistry;
  let context: FunctionContext;

  beforeEach(() => {
    registry = new FunctionRegistry();
    context = {
      correlationId: 'test-correlation',
      userId: 'user-123',
      tenantId: 'tenant-456',
      traceId: 'trace-789',
    };
  });

  describe('register', () => {
    it('should register a function', () => {
      const definition: AIFunction = {
        name: 'test_function',
        description: 'Test function',
        parameters: {
          type: 'object',
          properties: {
            arg1: { type: 'string', description: 'First argument' },
          },
          required: ['arg1'],
        },
        category: 'leads',
      };

      const inputSchema = z.object({ arg1: z.string() });
      const handler = vi.fn().mockResolvedValue({ success: true });

      registry.register(definition, inputSchema, handler);

      expect(registry.has('test_function')).toBe(true);
    });

    it('should throw when registering duplicate function', () => {
      const definition: AIFunction = {
        name: 'duplicate',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'leads',
      };

      const schema = z.object({});
      const handler = vi.fn();

      registry.register(definition, schema, handler);

      expect(() => {
        registry.register(definition, schema, handler);
      }).toThrow(/already registered/);
    });

    it('should register function with output schema', () => {
      const definition: AIFunction = {
        name: 'with_output',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'leads',
      };

      const inputSchema = z.object({});
      const outputSchema = z.object({ result: z.string() });
      const handler = vi.fn().mockResolvedValue({ result: 'success' });

      registry.register(definition, inputSchema, handler, outputSchema);

      expect(registry.has('with_output')).toBe(true);
    });

    it('should add function to category index', () => {
      const definition: AIFunction = {
        name: 'categorized',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'appointments',
      };

      registry.register(definition, z.object({}), vi.fn());

      const categoryFunctions = registry.getFunctionsByCategory('appointments');
      expect(categoryFunctions.some((f) => f.name === 'categorized')).toBe(true);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      const definition: AIFunction = {
        name: 'test_function',
        description: 'Test function',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name' },
            age: { type: 'number', description: 'Age' },
          },
          required: ['name'],
        },
        category: 'leads',
      };

      const inputSchema = z.object({
        name: z.string(),
        age: z.number().optional(),
      });

      const handler = vi.fn().mockResolvedValue({ success: true });

      registry.register(definition, inputSchema, handler);
    });

    it('should execute registered function', async () => {
      const call: AIFunctionCall = {
        function: 'test_function',
        arguments: { name: 'John', age: 30 },
      };

      const result = await registry.execute(call, context);

      expect(result.success).toBe(true);
      expect(result.function).toBe('test_function');
      expect(result.result).toEqual({ success: true });
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return error for nonexistent function', async () => {
      const call: AIFunctionCall = {
        function: 'nonexistent',
        arguments: {},
      };

      const result = await registry.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('FUNCTION_NOT_FOUND');
    });

    it('should validate input arguments', async () => {
      const call: AIFunctionCall = {
        function: 'test_function',
        arguments: { age: 30 }, // Missing required 'name'
      };

      const result = await registry.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_ARGUMENTS');
    });

    it('should handle execution errors', async () => {
      const definition: AIFunction = {
        name: 'failing_function',
        description: 'Fails',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'leads',
      };

      const handler = vi.fn().mockRejectedValue(new Error('Execution failed'));

      registry.register(definition, z.object({}), handler);

      const call: AIFunctionCall = {
        function: 'failing_function',
        arguments: {},
      };

      const result = await registry.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('Execution failed');
    });

    it('should validate output when schema provided', async () => {
      const definition: AIFunction = {
        name: 'validated_output',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'leads',
      };

      const inputSchema = z.object({});
      const outputSchema = z.object({ status: z.string() });
      const handler = vi.fn().mockResolvedValue({ wrong: 'format' });

      registry.register(definition, inputSchema, handler, outputSchema);

      const call: AIFunctionCall = {
        function: 'validated_output',
        arguments: {},
      };

      const result = await registry.execute(call, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_OUTPUT');
    });

    it('should include traceId in result', async () => {
      const call: AIFunctionCall = {
        function: 'test_function',
        arguments: { name: 'John' },
      };

      const result = await registry.execute(call, context);

      expect(result.traceId).toBe('trace-789');
    });

    it('should track callId', async () => {
      const call: AIFunctionCall = {
        function: 'test_function',
        arguments: { name: 'John' },
        callId: 'call-123',
      };

      const result = await registry.execute(call, context);

      expect(result.callId).toBe('call-123');
    });

    it('should measure execution time', async () => {
      const call: AIFunctionCall = {
        function: 'test_function',
        arguments: { name: 'John' },
      };

      const result = await registry.execute(call, context);

      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('executeMany', () => {
    beforeEach(() => {
      const definition: AIFunction = {
        name: 'test_function',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {
            value: { type: 'number', description: 'Value' },
          },
          required: ['value'],
        },
        category: 'leads',
      };

      const handler = vi.fn().mockImplementation(async (args: { value: number }) => ({
        doubled: args.value * 2,
      }));

      registry.register(definition, z.object({ value: z.number() }), handler);
    });

    it('should execute multiple functions in parallel', async () => {
      const calls: AIFunctionCall[] = [
        { function: 'test_function', arguments: { value: 1 } },
        { function: 'test_function', arguments: { value: 2 } },
        { function: 'test_function', arguments: { value: 3 } },
      ];

      const results = await registry.executeMany(calls, context);

      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle partial failures', async () => {
      const calls: AIFunctionCall[] = [
        { function: 'test_function', arguments: { value: 1 } },
        { function: 'nonexistent', arguments: {} },
        { function: 'test_function', arguments: { value: 3 } },
      ];

      const results = await registry.executeMany(calls, context);

      expect(results).toHaveLength(3);
      expect(results[0]?.success).toBe(true);
      expect(results[1]?.success).toBe(false);
      expect(results[2]?.success).toBe(true);
    });
  });

  describe('getAllFunctions', () => {
    it('should return all registered functions', () => {
      const def1: AIFunction = {
        name: 'func1',
        description: 'Function 1',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'leads',
      };

      const def2: AIFunction = {
        name: 'func2',
        description: 'Function 2',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'patients',
      };

      registry.register(def1, z.object({}), vi.fn());
      registry.register(def2, z.object({}), vi.fn());

      const functions = registry.getAllFunctions();

      expect(functions).toHaveLength(2);
      expect(functions.map((f) => f.name)).toContain('func1');
      expect(functions.map((f) => f.name)).toContain('func2');
    });

    it('should return empty array when no functions registered', () => {
      const functions = registry.getAllFunctions();
      expect(functions).toEqual([]);
    });
  });

  describe('getFunctionsByCategory', () => {
    beforeEach(() => {
      const categories: Array<AIFunction['category']> = ['leads', 'patients', 'appointments'];

      categories.forEach((category, i) => {
        const def: AIFunction = {
          name: `func_${category}`,
          description: `Function for ${category}`,
          parameters: {
            type: 'object',
            properties: {},
            required: [],
          },
          category,
        };

        registry.register(def, z.object({}), vi.fn());
      });
    });

    it('should return functions in category', () => {
      const leadFunctions = registry.getFunctionsByCategory('leads');
      expect(leadFunctions).toHaveLength(1);
      expect(leadFunctions[0]?.name).toBe('func_leads');
    });

    it('should return empty array for category with no functions', () => {
      const analyticsFunctions = registry.getFunctionsByCategory('analytics');
      expect(analyticsFunctions).toEqual([]);
    });

    it('should not include functions from other categories', () => {
      const leadFunctions = registry.getFunctionsByCategory('leads');
      expect(leadFunctions.every((f) => f.category === 'leads')).toBe(true);
    });
  });

  describe('getOpenAITools', () => {
    it('should return OpenAI-compatible format', () => {
      const definition: AIFunction = {
        name: 'test_function',
        description: 'Test function',
        parameters: {
          type: 'object',
          properties: {
            param: { type: 'string', description: 'Parameter' },
          },
          required: ['param'],
        },
        category: 'leads',
      };

      registry.register(definition, z.object({ param: z.string() }), vi.fn());

      const tools = registry.getOpenAITools();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        type: 'function',
        function: {
          name: 'test_function',
          description: 'Test function',
          parameters: definition.parameters,
        },
      });
    });

    it('should return empty array when no functions', () => {
      const tools = registry.getOpenAITools();
      expect(tools).toEqual([]);
    });
  });

  describe('getAnthropicTools', () => {
    it('should return Anthropic-compatible format', () => {
      const definition: AIFunction = {
        name: 'test_function',
        description: 'Test function',
        parameters: {
          type: 'object',
          properties: {
            param: { type: 'string', description: 'Parameter' },
          },
          required: ['param'],
        },
        category: 'leads',
      };

      registry.register(definition, z.object({ param: z.string() }), vi.fn());

      const tools = registry.getAnthropicTools();

      expect(tools).toHaveLength(1);
      expect(tools[0]).toEqual({
        name: 'test_function',
        description: 'Test function',
        input_schema: definition.parameters,
      });
    });
  });

  describe('has', () => {
    it('should return true for registered function', () => {
      const definition: AIFunction = {
        name: 'existing',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'leads',
      };

      registry.register(definition, z.object({}), vi.fn());

      expect(registry.has('existing')).toBe(true);
    });

    it('should return false for non-registered function', () => {
      expect(registry.has('nonexistent')).toBe(false);
    });
  });

  describe('getFunction', () => {
    it('should return function definition', () => {
      const definition: AIFunction = {
        name: 'test',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'leads',
      };

      registry.register(definition, z.object({}), vi.fn());

      const retrieved = registry.getFunction('test');

      expect(retrieved).toEqual(definition);
    });

    it('should return undefined for nonexistent function', () => {
      const retrieved = registry.getFunction('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getCategorySummary', () => {
    it('should return category summary', () => {
      const def1: AIFunction = {
        name: 'lead_func',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'leads',
      };

      const def2: AIFunction = {
        name: 'patient_func',
        description: 'Test',
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
        category: 'patients',
      };

      registry.register(def1, z.object({}), vi.fn());
      registry.register(def2, z.object({}), vi.fn());

      const summary = registry.getCategorySummary();

      expect(summary).toHaveLength(2);
      expect(summary.some((s) => s.category === 'leads' && s.count === 1)).toBe(true);
      expect(summary.some((s) => s.category === 'patients' && s.count === 1)).toBe(true);
    });
  });

  describe('zodToJsonSchema', () => {
    it('should convert ZodString', () => {
      const schema = z.string().describe('A string');
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('string');
      expect(jsonSchema.description).toBe('A string');
    });

    it('should convert ZodNumber', () => {
      const schema = z.number().describe('A number');
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('number');
    });

    it('should convert ZodBoolean', () => {
      const schema = z.boolean();
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('boolean');
    });

    it('should convert ZodArray', () => {
      const schema = z.array(z.string());
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('array');
      expect(jsonSchema.items).toBeDefined();
      expect(jsonSchema.items?.type).toBe('string');
    });

    it('should convert ZodObject', () => {
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      });
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.properties).toBeDefined();
      expect(jsonSchema.properties?.name).toBeDefined();
      expect(jsonSchema.properties?.age).toBeDefined();
      expect(jsonSchema.required).toContain('name');
      expect(jsonSchema.required).toContain('age');
    });

    it('should convert ZodEnum', () => {
      const schema = z.enum(['a', 'b', 'c']);
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('string');
      expect(jsonSchema.enum).toEqual(['a', 'b', 'c']);
    });

    it('should convert ZodOptional', () => {
      const schema = z.string().optional();
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('string');
    });

    it('should convert ZodDefault', () => {
      const schema = z.string().default('default-value');
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('string');
      expect(jsonSchema.default).toBe('default-value');
    });

    it('should handle nested objects', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string(),
        }),
      });
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.type).toBe('object');
      expect(jsonSchema.properties?.user?.type).toBe('object');
    });

    it('should handle optional fields', () => {
      const schema = z.object({
        required: z.string(),
        optional: z.string().optional(),
      });
      const jsonSchema = zodToJsonSchema(schema);

      expect(jsonSchema.required).toContain('required');
      expect(jsonSchema.required).not.toContain('optional');
    });
  });
});
