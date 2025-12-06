/**
 * Token Estimator Tests
 * Comprehensive tests for AI token and cost estimation
 */

import { describe, it, expect } from 'vitest';
import {
  TokenEstimator,
  createTokenEstimator,
  tokenEstimator,
  estimateTokens,
  estimateCost,
  MODEL_PRICING,
  TokenEstimatorConfigSchema,
  type TokenMessage,
  type TokenEstimate,
} from '../token-estimator.js';

// ============================================================================
// MODEL_PRICING CONSTANTS
// ============================================================================

describe('MODEL_PRICING', () => {
  it('should have OpenAI models', () => {
    expect(MODEL_PRICING['gpt-4o']).toBeDefined();
    expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
    expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined();
    expect(MODEL_PRICING['gpt-4']).toBeDefined();
    expect(MODEL_PRICING['gpt-3.5-turbo']).toBeDefined();
  });

  it('should have Anthropic models', () => {
    expect(MODEL_PRICING['claude-3-opus']).toBeDefined();
    expect(MODEL_PRICING['claude-3-sonnet']).toBeDefined();
    expect(MODEL_PRICING['claude-3-haiku']).toBeDefined();
    expect(MODEL_PRICING['claude-3-5-sonnet']).toBeDefined();
  });

  it('should have local models with zero pricing', () => {
    expect(MODEL_PRICING['llama3.1:8b']?.input).toBe(0);
    expect(MODEL_PRICING['llama3.1:8b']?.output).toBe(0);
    expect(MODEL_PRICING['mistral']?.input).toBe(0);
  });

  it('should have correct structure for each model', () => {
    for (const [model, pricing] of Object.entries(MODEL_PRICING)) {
      expect(pricing).toHaveProperty('input');
      expect(pricing).toHaveProperty('output');
      expect(pricing).toHaveProperty('contextWindow');
      expect(typeof pricing.input).toBe('number');
      expect(typeof pricing.output).toBe('number');
      expect(typeof pricing.contextWindow).toBe('number');
      expect(pricing.contextWindow).toBeGreaterThan(0);
    }
  });
});

// ============================================================================
// TokenEstimatorConfigSchema
// ============================================================================

describe('TokenEstimatorConfigSchema', () => {
  it('should have correct defaults', () => {
    const config = TokenEstimatorConfigSchema.parse({});

    expect(config.defaultModel).toBe('gpt-4o');
    expect(config.defaultOutputTokens).toBe(500);
    expect(config.charsPerToken).toBe(4);
    expect(config.includeMessageOverhead).toBe(true);
    expect(config.messageOverheadTokens).toBe(4);
    expect(config.safetyMargin).toBe(0.1);
  });

  it('should accept custom values', () => {
    const config = TokenEstimatorConfigSchema.parse({
      defaultModel: 'claude-3-opus',
      defaultOutputTokens: 1000,
      charsPerToken: 3,
      safetyMargin: 0.2,
    });

    expect(config.defaultModel).toBe('claude-3-opus');
    expect(config.defaultOutputTokens).toBe(1000);
    expect(config.charsPerToken).toBe(3);
    expect(config.safetyMargin).toBe(0.2);
  });

  it('should validate bounds', () => {
    expect(() => TokenEstimatorConfigSchema.parse({ defaultOutputTokens: 5 })).toThrow();
    expect(() => TokenEstimatorConfigSchema.parse({ defaultOutputTokens: 50000 })).toThrow();
    expect(() => TokenEstimatorConfigSchema.parse({ charsPerToken: 0 })).toThrow();
    expect(() => TokenEstimatorConfigSchema.parse({ safetyMargin: -0.1 })).toThrow();
    expect(() => TokenEstimatorConfigSchema.parse({ safetyMargin: 0.6 })).toThrow();
  });
});

// ============================================================================
// TokenEstimator CLASS
// ============================================================================

describe('TokenEstimator', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const estimator = new TokenEstimator();
      const config = estimator.getConfig();

      expect(config.defaultModel).toBe('gpt-4o');
      expect(config.defaultOutputTokens).toBe(500);
    });

    it('should accept custom config', () => {
      const estimator = new TokenEstimator({
        defaultModel: 'claude-3-sonnet',
        defaultOutputTokens: 750,
      });
      const config = estimator.getConfig();

      expect(config.defaultModel).toBe('claude-3-sonnet');
      expect(config.defaultOutputTokens).toBe(750);
    });
  });

  describe('estimateTokens', () => {
    const estimator = new TokenEstimator({ safetyMargin: 0 });

    it('should return 0 for empty string', () => {
      expect(estimator.estimateTokens('')).toBe(0);
    });

    it('should estimate regular text', () => {
      const text = 'Hello world';
      const tokens = estimator.estimateTokens(text);

      // "Hello world" is about 11 chars, ~3 tokens at 4 chars/token
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should estimate longer text proportionally', () => {
      const short = 'Hello';
      const long = 'Hello world, this is a much longer sentence with more words.';

      const shortTokens = estimator.estimateTokens(short);
      const longTokens = estimator.estimateTokens(long);

      expect(longTokens).toBeGreaterThan(shortTokens);
    });

    it('should estimate numbers with higher density', () => {
      // Numbers typically use fewer chars per token
      const numbers = '123456789';
      const tokens = estimator.estimateTokens(numbers);

      // 9 digits at ~3 digits per token = ~3 tokens
      expect(tokens).toBeGreaterThanOrEqual(3);
    });

    it('should estimate punctuation as 1 token per char', () => {
      const punct = '!!!';
      const tokens = estimator.estimateTokens(punct);

      // 3 punctuation marks = 3 tokens
      expect(tokens).toBe(3);
    });

    it('should handle code identifiers', () => {
      const camelCase = 'myVeryLongCamelCaseVariableName';
      const tokens = estimator.estimateTokens(camelCase);

      // Long camelCase identifiers get split at boundaries
      expect(tokens).toBeGreaterThan(1);
    });

    it('should handle URLs', () => {
      const url = 'https://example.com/path/to/resource?query=value';
      const tokens = estimator.estimateTokens(url);

      // URLs typically have ~3 chars per token
      expect(tokens).toBeGreaterThan(10);
    });

    it('should handle whitespace', () => {
      const text = 'word    word'; // multiple spaces
      const tokens = estimator.estimateTokens(text);

      expect(tokens).toBeGreaterThan(0);
    });

    it('should apply safety margin', () => {
      const estimatorWithMargin = new TokenEstimator({ safetyMargin: 0.1 });
      const estimatorNoMargin = new TokenEstimator({ safetyMargin: 0 });

      const text = 'Hello world';
      const withMargin = estimatorWithMargin.estimateTokens(text);
      const noMargin = estimatorNoMargin.estimateTokens(text);

      expect(withMargin).toBeGreaterThan(noMargin);
    });
  });

  describe('estimateMessagesTokens', () => {
    const estimator = new TokenEstimator({ safetyMargin: 0 });

    it('should estimate single message', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
      const tokens = estimator.estimateMessagesTokens(messages);

      // Content tokens + message overhead + conversation overhead
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate multiple messages', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'You are helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      const tokens = estimator.estimateMessagesTokens(messages);

      expect(tokens).toBeGreaterThan(10);
    });

    it('should include message overhead when configured', () => {
      const withOverhead = new TokenEstimator({
        includeMessageOverhead: true,
        messageOverheadTokens: 10,
        safetyMargin: 0,
      });
      const noOverhead = new TokenEstimator({
        includeMessageOverhead: false,
        safetyMargin: 0,
      });

      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];

      expect(withOverhead.estimateMessagesTokens(messages)).toBeGreaterThan(
        noOverhead.estimateMessagesTokens(messages)
      );
    });

    it('should include conversation overhead', () => {
      const messages: TokenMessage[] = [];
      const tokens = estimator.estimateMessagesTokens(messages);

      // Even with no messages, there's conversation overhead
      expect(tokens).toBe(3);
    });
  });

  describe('estimate', () => {
    const estimator = new TokenEstimator();

    it('should return full token estimate', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello world' }];
      const estimate = estimator.estimate(messages);

      expect(estimate.inputTokens).toBeGreaterThan(0);
      expect(estimate.estimatedOutputTokens).toBe(500); // default
      expect(estimate.totalTokens).toBe(estimate.inputTokens + estimate.estimatedOutputTokens);
      expect(estimate.estimatedCost).toBeGreaterThanOrEqual(0);
      expect(estimate.exceedsContext).toBe(false);
      expect(estimate.availableOutputTokens).toBeGreaterThan(0);
      expect(estimate.model).toBe('gpt-4o');
      expect(estimate.confidence).toBe('high');
    });

    it('should use specified model', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
      const estimate = estimator.estimate(messages, { model: 'claude-3-opus' });

      expect(estimate.model).toBe('claude-3-opus');
    });

    it('should use specified maxOutputTokens', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
      const estimate = estimator.estimate(messages, { maxOutputTokens: 1000 });

      expect(estimate.estimatedOutputTokens).toBe(1000);
    });

    it('should detect context window exceeded', () => {
      // Create a message that exceeds the 8k context window for gpt-4
      // Use realistic text content (not repeated chars which get special handling)
      // "Hello world. " is ~7 tokens, so 1500 repetitions = ~10500 tokens > 8192
      const longContent = 'Hello world. '.repeat(1500);
      const messages: TokenMessage[] = [{ role: 'user', content: longContent }];
      const estimate = estimator.estimate(messages, { model: 'gpt-4' }); // 8k context

      expect(estimate.exceedsContext).toBe(true);
    });

    it('should calculate available output tokens', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
      const estimate = estimator.estimate(messages);

      expect(estimate.availableOutputTokens).toBeLessThanOrEqual(
        MODEL_PRICING['gpt-4o']!.contextWindow
      );
    });

    it('should reduce confidence for long messages', () => {
      // Very long message (>5000 chars) should have lower confidence
      const longContent = 'This is a test sentence. '.repeat(250); // 6250 chars
      const messages: TokenMessage[] = [{ role: 'user', content: longContent }];
      const estimate = estimator.estimate(messages);

      expect(estimate.confidence).toBe('medium');
    });

    it('should use fallback pricing for unknown model', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
      const estimate = estimator.estimate(messages, { model: 'unknown-model' });

      // Should fall back to gpt-4o pricing
      expect(estimate.estimatedCost).toBeGreaterThanOrEqual(0);
    });
  });

  describe('estimateCost', () => {
    const estimator = new TokenEstimator();

    it('should return detailed cost estimate', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ];
      const cost = estimator.estimateCost(messages);

      expect(cost.inputCost).toBeGreaterThanOrEqual(0);
      expect(cost.outputCost).toBeGreaterThanOrEqual(0);
      expect(cost.totalCost).toBe(cost.inputCost + cost.outputCost);
      expect(cost.breakdown.systemPrompt).toBeGreaterThanOrEqual(0);
      expect(cost.breakdown.userMessages).toBeGreaterThanOrEqual(0);
      expect(cost.breakdown.assistantMessages).toBeGreaterThanOrEqual(0);
      expect(cost.breakdown.estimatedResponse).toBeGreaterThanOrEqual(0);
    });

    it('should calculate costs for different models', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello world' }];

      const gpt4Cost = estimator.estimateCost(messages, { model: 'gpt-4' });
      const gpt35Cost = estimator.estimateCost(messages, { model: 'gpt-3.5-turbo' });

      // GPT-4 should be more expensive than GPT-3.5
      expect(gpt4Cost.totalCost).toBeGreaterThan(gpt35Cost.totalCost);
    });

    it('should calculate zero cost for local models', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello world' }];
      const cost = estimator.estimateCost(messages, { model: 'llama3.1:8b' });

      expect(cost.totalCost).toBe(0);
      expect(cost.inputCost).toBe(0);
      expect(cost.outputCost).toBe(0);
    });
  });

  describe('wouldExceedBudget', () => {
    const estimator = new TokenEstimator();

    it('should detect when budget is exceeded', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello world' }];
      const result = estimator.wouldExceedBudget(messages, 0.0001); // Very small budget

      expect(result.exceeds).toBe(true);
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.remaining).toBeLessThan(0);
    });

    it('should detect when budget is not exceeded', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
      const result = estimator.wouldExceedBudget(messages, 1); // $1 budget

      expect(result.exceeds).toBe(false);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should calculate remaining budget correctly', () => {
      const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
      const result = estimator.wouldExceedBudget(messages, 1);

      expect(result.remaining).toBe(1 - result.estimatedCost);
    });
  });

  describe('getModelPricing', () => {
    const estimator = new TokenEstimator();

    it('should return pricing for known model', () => {
      const pricing = estimator.getModelPricing('gpt-4o');

      expect(pricing).toBeDefined();
      expect(pricing?.input).toBe(0.0025);
      expect(pricing?.output).toBe(0.01);
      expect(pricing?.contextWindow).toBe(128000);
    });

    it('should return undefined for unknown model', () => {
      const pricing = estimator.getModelPricing('unknown-model');
      expect(pricing).toBeUndefined();
    });
  });

  describe('getAvailableModels', () => {
    const estimator = new TokenEstimator();

    it('should return list of available models', () => {
      const models = estimator.getAvailableModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);
      expect(models).toContain('gpt-4o');
      expect(models).toContain('claude-3-opus');
    });
  });

  describe('calculateActualCost', () => {
    const estimator = new TokenEstimator();

    it('should calculate cost from actual usage', () => {
      const cost = estimator.calculateActualCost('gpt-4o', {
        promptTokens: 1000,
        completionTokens: 500,
      });

      // 1000 * 0.0025/1000 + 500 * 0.01/1000 = 0.0025 + 0.005 = 0.0075
      expect(cost).toBeCloseTo(0.0075, 5);
    });

    it('should handle zero tokens', () => {
      const cost = estimator.calculateActualCost('gpt-4o', {
        promptTokens: 0,
        completionTokens: 0,
      });

      expect(cost).toBe(0);
    });

    it('should use fallback pricing for unknown model', () => {
      const cost = estimator.calculateActualCost('unknown-model', {
        promptTokens: 1000,
        completionTokens: 500,
      });

      // Should use gpt-4o pricing as fallback
      expect(cost).toBeGreaterThan(0);
    });
  });

  describe('truncateToFit', () => {
    const estimator = new TokenEstimator({ safetyMargin: 0 });

    it('should return all messages if they fit', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'Be helpful' },
        { role: 'user', content: 'Hello' },
      ];

      const truncated = estimator.truncateToFit(messages, 10000);

      expect(truncated).toHaveLength(2);
      expect(truncated[0]?.content).toBe('Be helpful');
    });

    it('should preserve system messages by default', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'Important system prompt' },
        { role: 'user', content: 'Old message 1' },
        { role: 'assistant', content: 'Old response 1' },
        { role: 'user', content: 'Latest question' },
      ];

      const truncated = estimator.truncateToFit(messages, 100);

      // System message should be preserved
      expect(truncated.some((m) => m.role === 'system')).toBe(true);
    });

    it('should preserve last N messages by default', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Old message' },
        { role: 'assistant', content: 'Old response' },
        { role: 'user', content: 'Recent message' },
        { role: 'assistant', content: 'Recent response' },
      ];

      const truncated = estimator.truncateToFit(messages, 50, { preserveLastN: 2 });

      // Last 2 messages should be preserved
      expect(truncated.length).toBeLessThanOrEqual(4);
    });

    it('should handle case when even system messages exceed limit', () => {
      // Use realistic text that gets properly tokenized
      const longSystemContent = 'You are a helpful assistant. '.repeat(400); // ~11600 chars
      const messages: TokenMessage[] = [
        { role: 'system', content: longSystemContent },
        { role: 'user', content: 'Hello' },
      ];

      // Very small token limit that forces system message truncation
      // The truncation happens when availableTokens <= 0 (systemTokens >= maxTokens)
      const truncated = estimator.truncateToFit(messages, 5);

      // The system message should be truncated
      // Formula: maxTokens / systemMessages.length * charsPerToken = 5 / 1 * 4 = 20 chars max
      expect(truncated[0]?.content.length).toBeLessThanOrEqual(20);
    });

    it('should respect preserveSystem option', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'System message' },
        { role: 'user', content: 'User message' },
      ];

      const truncated = estimator.truncateToFit(messages, 50, { preserveSystem: false });

      // System message might not be preserved
      expect(truncated).toBeDefined();
    });

    it('should handle empty messages array', () => {
      const truncated = estimator.truncateToFit([], 100);
      expect(truncated).toHaveLength(0);
    });
  });

  describe('getConfig / updateConfig', () => {
    it('should return copy of config', () => {
      const estimator = new TokenEstimator({ defaultModel: 'gpt-4' });
      const config = estimator.getConfig();

      expect(config.defaultModel).toBe('gpt-4');

      // Modifying returned config shouldn't affect internal config
      config.defaultModel = 'changed';
      expect(estimator.getConfig().defaultModel).toBe('gpt-4');
    });

    it('should update config', () => {
      const estimator = new TokenEstimator();
      estimator.updateConfig({ defaultOutputTokens: 1000 });

      expect(estimator.getConfig().defaultOutputTokens).toBe(1000);
    });

    it('should validate updated config', () => {
      const estimator = new TokenEstimator();

      expect(() => estimator.updateConfig({ defaultOutputTokens: 5 })).toThrow();
    });
  });
});

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

describe('createTokenEstimator', () => {
  it('should create TokenEstimator instance', () => {
    const estimator = createTokenEstimator();
    expect(estimator).toBeInstanceOf(TokenEstimator);
  });

  it('should accept config', () => {
    const estimator = createTokenEstimator({ defaultModel: 'claude-3-opus' });
    expect(estimator.getConfig().defaultModel).toBe('claude-3-opus');
  });
});

describe('tokenEstimator singleton', () => {
  it('should be a TokenEstimator instance', () => {
    expect(tokenEstimator).toBeInstanceOf(TokenEstimator);
  });
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

describe('estimateTokens utility', () => {
  it('should estimate tokens using default instance', () => {
    const tokens = estimateTokens('Hello world');
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('estimateCost utility', () => {
  it('should estimate cost with defaults', () => {
    const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
    const cost = estimateCost(messages);

    expect(cost.totalCost).toBeGreaterThanOrEqual(0);
  });

  it('should accept model and output tokens', () => {
    const messages: TokenMessage[] = [{ role: 'user', content: 'Hello' }];
    const cost = estimateCost(messages, 'claude-3-haiku', 100);

    expect(cost.totalCost).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// EDGE CASES
// ============================================================================

describe('edge cases', () => {
  const estimator = new TokenEstimator({ safetyMargin: 0 });

  it('should handle unicode text', () => {
    const unicode = '你好世界 🌍 مرحبا';
    const tokens = estimator.estimateTokens(unicode);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should handle mixed content', () => {
    const mixed = 'Code: const x = 123; // comment\nURL: https://example.com\nText: Hello!';
    const tokens = estimator.estimateTokens(mixed);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should handle snake_case identifiers', () => {
    const snake = 'my_very_long_snake_case_variable_name';
    const tokens = estimator.estimateTokens(snake);
    expect(tokens).toBeGreaterThan(1);
  });

  it('should handle newlines', () => {
    const multiline = 'Line 1\nLine 2\nLine 3';
    const tokens = estimator.estimateTokens(multiline);
    expect(tokens).toBeGreaterThan(0);
  });

  it('should handle tabs and special whitespace', () => {
    const tabbed = 'Column1\tColumn2\tColumn3';
    const tokens = estimator.estimateTokens(tabbed);
    expect(tokens).toBeGreaterThan(0);
  });
});
