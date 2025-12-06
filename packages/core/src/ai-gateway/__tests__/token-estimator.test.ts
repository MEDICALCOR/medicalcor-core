/**
 * Token Estimator Tests
 *
 * Comprehensive tests for token estimation and cost calculation
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  type CostEstimate,
  type TokenEstimatorConfig,
} from '../token-estimator.js';

describe('TokenEstimator', () => {
  let estimator: TokenEstimator;

  beforeEach(() => {
    estimator = new TokenEstimator();
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const instance = new TokenEstimator();
      const config = instance.getConfig();

      expect(config.defaultModel).toBe('gpt-4o');
      expect(config.defaultOutputTokens).toBe(500);
      expect(config.charsPerToken).toBe(4);
      expect(config.includeMessageOverhead).toBe(true);
      expect(config.messageOverheadTokens).toBe(4);
      expect(config.safetyMargin).toBe(0.1);
    });

    it('should create instance with custom config', () => {
      const instance = new TokenEstimator({
        defaultModel: 'gpt-4-turbo',
        defaultOutputTokens: 1000,
        charsPerToken: 3,
        includeMessageOverhead: false,
        messageOverheadTokens: 2,
        safetyMargin: 0.2,
      });

      const config = instance.getConfig();

      expect(config.defaultModel).toBe('gpt-4-turbo');
      expect(config.defaultOutputTokens).toBe(1000);
      expect(config.charsPerToken).toBe(3);
      expect(config.includeMessageOverhead).toBe(false);
      expect(config.messageOverheadTokens).toBe(2);
      expect(config.safetyMargin).toBe(0.2);
    });

    it('should validate config with Zod schema', () => {
      expect(() => {
        new TokenEstimator({
          defaultOutputTokens: -10, // Invalid: must be positive
        });
      }).toThrow();
    });

    it('should apply default values for partial config', () => {
      const instance = new TokenEstimator({
        defaultModel: 'claude-3-opus',
      });

      const config = instance.getConfig();

      expect(config.defaultModel).toBe('claude-3-opus');
      expect(config.defaultOutputTokens).toBe(500); // Default
    });
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimator.estimateTokens('')).toBe(0);
    });

    it('should estimate tokens for simple text', () => {
      const result = estimator.estimateTokens('Hello World');
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(10);
    });

    it('should handle whitespace', () => {
      const result = estimator.estimateTokens('   \n  \t  ');
      expect(result).toBeGreaterThan(0);
    });

    it('should handle numbers', () => {
      const result = estimator.estimateTokens('1234567890');
      // Numbers are ~3 digits per token
      expect(result).toBeGreaterThan(0);
    });

    it('should handle punctuation', () => {
      const result = estimator.estimateTokens('!!!???...,,,');
      // Punctuation is 1 token per character
      expect(result).toBeGreaterThan(10);
    });

    it('should handle code-like identifiers', () => {
      // Long camelCase identifier should be split
      const result = estimator.estimateTokens('myVeryLongCamelCaseIdentifier');
      expect(result).toBeGreaterThan(3);
    });

    it('should handle snake_case identifiers', () => {
      const result = estimator.estimateTokens('my_long_snake_case_identifier');
      expect(result).toBeGreaterThan(3);
    });

    it('should handle URLs', () => {
      const result = estimator.estimateTokens('https://example.com/very/long/path');
      expect(result).toBeGreaterThan(0);
    });

    it('should handle http URLs', () => {
      const result = estimator.estimateTokens('http://example.com');
      expect(result).toBeGreaterThan(0);
    });

    it('should handle mixed content', () => {
      const text = 'Hello 123 !!! https://example.com myLongIdentifier';
      const result = estimator.estimateTokens(text);
      expect(result).toBeGreaterThan(5);
    });

    it('should apply safety margin', () => {
      const estimatorNoMargin = new TokenEstimator({ safetyMargin: 0 });
      const estimatorWithMargin = new TokenEstimator({ safetyMargin: 0.1 });

      const text = 'Hello World';
      const noMargin = estimatorNoMargin.estimateTokens(text);
      const withMargin = estimatorWithMargin.estimateTokens(text);

      expect(withMargin).toBeGreaterThan(noMargin);
    });

    it('should use custom charsPerToken', () => {
      const estimator3 = new TokenEstimator({ charsPerToken: 3 });
      const estimator5 = new TokenEstimator({ charsPerToken: 5 });

      const text = 'Hello World Testing';
      const result3 = estimator3.estimateTokens(text);
      const result5 = estimator5.estimateTokens(text);

      expect(result3).toBeGreaterThan(result5);
    });

    it('should handle short identifiers as regular words', () => {
      // Short identifier (<=10 chars) should be treated as regular word
      const result = estimator.estimateTokens('shortId');
      expect(result).toBeGreaterThan(0);
    });

    it('should handle empty parts in split', () => {
      const result = estimator.estimateTokens('word1  word2');
      expect(result).toBeGreaterThan(0);
    });

    it('should handle standalone URL as part', () => {
      // This test ensures the URL regex branch is hit for a URL that appears as a standalone part
      const result = estimator.estimateTokens('Check this: https://example.com/path and then http://test.com');
      expect(result).toBeGreaterThan(5);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('should estimate tokens for single message', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Hello, how are you?' },
      ];

      const result = estimator.estimateMessagesTokens(messages);
      expect(result).toBeGreaterThan(0);
    });

    it('should estimate tokens for multiple messages', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is the weather?' },
        { role: 'assistant', content: 'I do not have access to weather data.' },
      ];

      const result = estimator.estimateMessagesTokens(messages);
      expect(result).toBeGreaterThan(0);
    });

    it('should include message overhead when enabled', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const withOverhead = estimator.estimateMessagesTokens(messages);

      const estimatorNoOverhead = new TokenEstimator({ includeMessageOverhead: false });
      const withoutOverhead = estimatorNoOverhead.estimateMessagesTokens(messages);

      expect(withOverhead).toBeGreaterThan(withoutOverhead);
    });

    it('should add conversation overhead', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Hi' },
      ];

      const result = estimator.estimateMessagesTokens(messages);
      // Should include +3 for conversation overhead
      expect(result).toBeGreaterThanOrEqual(3);
    });

    it('should handle empty messages array', () => {
      const result = estimator.estimateMessagesTokens([]);
      expect(result).toBe(3); // Only conversation overhead
    });

    it('should use custom message overhead tokens', () => {
      const estimator2 = new TokenEstimator({ messageOverheadTokens: 2 });
      const estimator10 = new TokenEstimator({ messageOverheadTokens: 10 });

      const messages: TokenMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const result2 = estimator2.estimateMessagesTokens(messages);
      const result10 = estimator10.estimateMessagesTokens(messages);

      expect(result10).toBeGreaterThan(result2);
    });
  });

  describe('estimate', () => {
    const messages: TokenMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];

    it('should return complete estimate with default model', () => {
      const result = estimator.estimate(messages);

      expect(result).toHaveProperty('inputTokens');
      expect(result).toHaveProperty('estimatedOutputTokens');
      expect(result).toHaveProperty('totalTokens');
      expect(result).toHaveProperty('estimatedCost');
      expect(result).toHaveProperty('exceedsContext');
      expect(result).toHaveProperty('availableOutputTokens');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('confidence');

      expect(result.model).toBe('gpt-4o');
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.estimatedOutputTokens).toBe(500); // Default
      expect(result.totalTokens).toBe(result.inputTokens + result.estimatedOutputTokens);
    });

    it('should use custom model', () => {
      const result = estimator.estimate(messages, { model: 'claude-3-opus' });

      expect(result.model).toBe('claude-3-opus');
    });

    it('should fall back to gpt-4o for unknown model', () => {
      const result = estimator.estimate(messages, { model: 'unknown-model' });

      expect(result.model).toBe('unknown-model');
      // Should still calculate cost using gpt-4o pricing
      expect(result.estimatedCost).toBeGreaterThan(0);
    });

    it('should use custom maxOutputTokens', () => {
      const result = estimator.estimate(messages, { maxOutputTokens: 1000 });

      expect(result.estimatedOutputTokens).toBe(1000);
    });

    it('should calculate cost correctly', () => {
      const result = estimator.estimate(messages, {
        model: 'gpt-4o',
        maxOutputTokens: 100,
      });

      const pricing = MODEL_PRICING['gpt-4o']!;
      const expectedInputCost = (result.inputTokens / 1000) * pricing.input;
      const expectedOutputCost = (100 / 1000) * pricing.output;
      const expectedTotal = expectedInputCost + expectedOutputCost;

      expect(result.estimatedCost).toBeCloseTo(expectedTotal, 5);
    });

    it('should detect when context is exceeded', () => {
      // Create messages that exceed context window
      const longMessage = 'word '.repeat(50000);
      const longMessages: TokenMessage[] = [
        { role: 'user', content: longMessage },
      ];

      const result = estimator.estimate(longMessages, { model: 'gpt-3.5-turbo' });

      expect(result.exceedsContext).toBe(true);
      expect(result.availableOutputTokens).toBe(0);
    });

    it('should calculate available output tokens', () => {
      const result = estimator.estimate(messages, { model: 'gpt-4o' });
      const pricing = MODEL_PRICING['gpt-4o']!;

      expect(result.availableOutputTokens).toBe(
        pricing.contextWindow - result.inputTokens
      );
    });

    it('should determine high confidence for short messages', () => {
      const shortMessages: TokenMessage[] = [
        { role: 'user', content: 'Hi' },
      ];

      const result = estimator.estimate(shortMessages);
      expect(result.confidence).toBe('high');
    });

    it('should determine medium confidence for medium messages', () => {
      const mediumMessage = 'word '.repeat(2000); // ~10000 chars
      const mediumMessages: TokenMessage[] = [
        { role: 'user', content: mediumMessage },
      ];

      const result = estimator.estimate(mediumMessages);
      expect(result.confidence).toBe('medium');
    });

    it('should determine low confidence for long messages', () => {
      const longMessage = 'word '.repeat(5000); // ~25000 chars
      const longMessages: TokenMessage[] = [
        { role: 'user', content: longMessage },
      ];

      const result = estimator.estimate(longMessages);
      expect(result.confidence).toBe('low');
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost by message type', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'System prompt here.' },
        { role: 'user', content: 'User message.' },
        { role: 'assistant', content: 'Assistant response.' },
      ];

      const result = estimator.estimateCost(messages);

      expect(result).toHaveProperty('inputCost');
      expect(result).toHaveProperty('outputCost');
      expect(result).toHaveProperty('totalCost');
      expect(result).toHaveProperty('breakdown');

      expect(result.breakdown.systemPrompt).toBeGreaterThan(0);
      expect(result.breakdown.userMessages).toBeGreaterThan(0);
      expect(result.breakdown.assistantMessages).toBeGreaterThan(0);
      expect(result.breakdown.estimatedResponse).toBeGreaterThan(0);

      expect(result.totalCost).toBe(result.inputCost + result.outputCost);
    });

    it('should handle only system messages', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'System prompt only.' },
      ];

      const result = estimator.estimateCost(messages);

      expect(result.breakdown.systemPrompt).toBeGreaterThan(0);
      expect(result.breakdown.userMessages).toBe(0);
      expect(result.breakdown.assistantMessages).toBe(0);
    });

    it('should handle only user messages', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'User message only.' },
      ];

      const result = estimator.estimateCost(messages);

      expect(result.breakdown.systemPrompt).toBe(0);
      expect(result.breakdown.userMessages).toBeGreaterThan(0);
      expect(result.breakdown.assistantMessages).toBe(0);
    });

    it('should handle only assistant messages', () => {
      const messages: TokenMessage[] = [
        { role: 'assistant', content: 'Assistant message only.' },
      ];

      const result = estimator.estimateCost(messages);

      expect(result.breakdown.systemPrompt).toBe(0);
      expect(result.breakdown.userMessages).toBe(0);
      expect(result.breakdown.assistantMessages).toBeGreaterThan(0);
    });

    it('should use custom model pricing', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const resultGPT = estimator.estimateCost(messages, { model: 'gpt-4o' });
      const resultClaude = estimator.estimateCost(messages, { model: 'claude-3-opus' });

      expect(resultGPT.totalCost).not.toBe(resultClaude.totalCost);
    });

    it('should use custom maxOutputTokens', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const result100 = estimator.estimateCost(messages, { maxOutputTokens: 100 });
      const result1000 = estimator.estimateCost(messages, { maxOutputTokens: 1000 });

      expect(result1000.outputCost).toBeGreaterThan(result100.outputCost);
    });

    it('should handle free models', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const result = estimator.estimateCost(messages, { model: 'llama3.1:8b' });

      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it('should calculate input cost from all message types', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User' },
        { role: 'assistant', content: 'Assistant' },
      ];

      const result = estimator.estimateCost(messages);

      const expectedInputCost =
        result.breakdown.systemPrompt +
        result.breakdown.userMessages +
        result.breakdown.assistantMessages;

      expect(result.inputCost).toBeCloseTo(expectedInputCost, 5);
    });

    it('should calculate output cost correctly', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const result = estimator.estimateCost(messages);

      expect(result.outputCost).toBe(result.breakdown.estimatedResponse);
    });
  });

  describe('wouldExceedBudget', () => {
    const messages: TokenMessage[] = [
      { role: 'user', content: 'Test message' },
    ];

    it('should return false when within budget', () => {
      const result = estimator.wouldExceedBudget(messages, 1.0);

      expect(result.exceeds).toBe(false);
      expect(result.estimatedCost).toBeGreaterThan(0);
      expect(result.remaining).toBeGreaterThan(0);
    });

    it('should return true when exceeds budget', () => {
      const result = estimator.wouldExceedBudget(messages, 0.000001);

      expect(result.exceeds).toBe(true);
      expect(result.remaining).toBeLessThan(0);
    });

    it('should calculate remaining budget correctly', () => {
      const budget = 1.0;
      const result = estimator.wouldExceedBudget(messages, budget);

      expect(result.remaining).toBeCloseTo(budget - result.estimatedCost, 5);
    });

    it('should pass options to estimateCost', () => {
      const result = estimator.wouldExceedBudget(messages, 1.0, {
        model: 'claude-3-haiku',
        maxOutputTokens: 100,
      });

      expect(result.estimatedCost).toBeGreaterThan(0);
    });
  });

  describe('getModelPricing', () => {
    it('should return pricing for existing model', () => {
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

    it('should return correct pricing for all models', () => {
      const models = [
        'gpt-4o',
        'gpt-4o-mini',
        'gpt-4-turbo',
        'gpt-4',
        'gpt-3.5-turbo',
        'claude-3-opus',
        'claude-3-sonnet',
        'claude-3-haiku',
        'llama3.1:8b',
      ];

      models.forEach((model) => {
        const pricing = estimator.getModelPricing(model);
        expect(pricing).toBeDefined();
        expect(pricing?.input).toBeGreaterThanOrEqual(0);
        expect(pricing?.output).toBeGreaterThanOrEqual(0);
        expect(pricing?.contextWindow).toBeGreaterThan(0);
      });
    });
  });

  describe('getAvailableModels', () => {
    it('should return all available models', () => {
      const models = estimator.getAvailableModels();

      expect(models).toBeInstanceOf(Array);
      expect(models.length).toBeGreaterThan(0);
    });

    it('should include OpenAI models', () => {
      const models = estimator.getAvailableModels();

      expect(models).toContain('gpt-4o');
      expect(models).toContain('gpt-4-turbo');
      expect(models).toContain('gpt-3.5-turbo');
    });

    it('should include Anthropic models', () => {
      const models = estimator.getAvailableModels();

      expect(models).toContain('claude-3-opus');
      expect(models).toContain('claude-3-sonnet');
      expect(models).toContain('claude-3-haiku');
    });

    it('should include local models', () => {
      const models = estimator.getAvailableModels();

      expect(models).toContain('llama3.1:8b');
      expect(models).toContain('mistral');
    });
  });

  describe('calculateActualCost', () => {
    it('should calculate cost from actual usage', () => {
      const usage = {
        promptTokens: 100,
        completionTokens: 50,
      };

      const cost = estimator.calculateActualCost('gpt-4o', usage);
      const pricing = MODEL_PRICING['gpt-4o']!;

      const expectedCost =
        (100 / 1000) * pricing.input + (50 / 1000) * pricing.output;

      expect(cost).toBeCloseTo(expectedCost, 5);
    });

    it('should handle zero usage', () => {
      const usage = {
        promptTokens: 0,
        completionTokens: 0,
      };

      const cost = estimator.calculateActualCost('gpt-4o', usage);
      expect(cost).toBe(0);
    });

    it('should fall back to gpt-4o for unknown model', () => {
      const usage = {
        promptTokens: 100,
        completionTokens: 50,
      };

      const cost = estimator.calculateActualCost('unknown-model', usage);
      expect(cost).toBeGreaterThan(0);
    });

    it('should calculate correctly for free models', () => {
      const usage = {
        promptTokens: 100,
        completionTokens: 50,
      };

      const cost = estimator.calculateActualCost('llama3.1:8b', usage);
      expect(cost).toBe(0);
    });

    it('should handle large token counts', () => {
      const usage = {
        promptTokens: 100000,
        completionTokens: 50000,
      };

      const cost = estimator.calculateActualCost('gpt-4o', usage);
      expect(cost).toBeCloseTo(0.75, 2);
      expect(cost).toBeGreaterThan(0.5);
    });
  });

  describe('truncateToFit', () => {
    it('should keep all messages when within limit', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'Short' },
        { role: 'user', content: 'Hi' },
      ];

      const result = estimator.truncateToFit(messages, 1000);

      expect(result.length).toBe(2);
      expect(result).toEqual(messages);
    });

    it('should preserve system messages by default', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'Old message 1' },
        { role: 'user', content: 'Old message 2' },
        { role: 'user', content: 'Recent message' },
      ];

      const result = estimator.truncateToFit(messages, 50, {
        preserveSystem: true,
        preserveLastN: 1,
      });

      expect(result[0]?.role).toBe('system');
      expect(result[result.length - 1]?.content).toBe('Recent message');
    });

    it('should not preserve system messages when disabled', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'System prompt that is very long' },
        { role: 'user', content: 'Old message' },
        { role: 'user', content: 'Recent' },
      ];

      const result = estimator.truncateToFit(messages, 50, {
        preserveSystem: false,
        preserveLastN: 1,
      });

      // When preserveSystem is false, system messages are not guaranteed to be preserved
      // They are treated like any other message and may be dropped if not recent enough
      expect(result.length).toBeGreaterThan(0);
      // The last message should be preserved (preserveLastN: 1)
      expect(result[result.length - 1]?.content).toBe('Recent');
    });

    it('should preserve last N messages', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Message 1' },
        { role: 'user', content: 'Message 2' },
        { role: 'user', content: 'Message 3' },
        { role: 'user', content: 'Message 4' },
      ];

      const result = estimator.truncateToFit(messages, 100, {
        preserveSystem: false,
        preserveLastN: 2,
      });

      expect(result[result.length - 1]?.content).toBe('Message 4');
      expect(result[result.length - 2]?.content).toBe('Message 3');
    });

    it('should truncate system messages when they exceed limit', () => {
      const longSystem = 'word '.repeat(10000);
      const messages: TokenMessage[] = [
        { role: 'system', content: longSystem },
        { role: 'user', content: 'User message' },
      ];

      const result = estimator.truncateToFit(messages, 50, {
        preserveSystem: true,
      });

      expect(result.length).toBe(1);
      expect(result[0]?.role).toBe('system');
      expect(result[0]?.content.length).toBeLessThan(longSystem.length);
    });

    it('should fit older messages when space available', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Old 1' },
        { role: 'user', content: 'Old 2' },
        { role: 'user', content: 'Old 3' },
        { role: 'user', content: 'Recent' },
      ];

      const result = estimator.truncateToFit(messages, 1000, {
        preserveSystem: false,
        preserveLastN: 1,
      });

      expect(result.length).toBeGreaterThan(1);
      expect(result[result.length - 1]?.content).toBe('Recent');
    });

    it('should work backwards from oldest when fitting messages', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'First' },
        { role: 'user', content: 'Second' },
        { role: 'user', content: 'Third' },
        { role: 'user', content: 'Last' },
      ];

      const result = estimator.truncateToFit(messages, 100, {
        preserveSystem: false,
        preserveLastN: 1,
      });

      // Should keep last message and work backwards
      expect(result[result.length - 1]?.content).toBe('Last');
    });

    it('should handle case where last messages exceed available tokens', () => {
      const longMessage = 'word '.repeat(5000);
      const messages: TokenMessage[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Old' },
        { role: 'user', content: longMessage },
      ];

      const result = estimator.truncateToFit(messages, 100, {
        preserveSystem: true,
        preserveLastN: 1,
      });

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]?.role).toBe('system');
    });

    it('should truncate multiple system messages proportionally', () => {
      const longContent = 'word '.repeat(1000);
      const messages: TokenMessage[] = [
        { role: 'system', content: longContent },
        { role: 'system', content: longContent },
      ];

      const result = estimator.truncateToFit(messages, 50, {
        preserveSystem: true,
      });

      expect(result.length).toBe(2);
      expect(result[0]?.content.length).toBeLessThan(longContent.length);
      expect(result[1]?.content.length).toBeLessThan(longContent.length);
    });

    it('should use default options when not provided', () => {
      const messages: TokenMessage[] = [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'User' },
      ];

      const result = estimator.truncateToFit(messages, 100);

      expect(result).toBeDefined();
    });

    it('should break when older message does not fit', () => {
      const longMessage = 'word '.repeat(1000);
      const messages: TokenMessage[] = [
        { role: 'user', content: longMessage }, // Very long, won't fit
        { role: 'user', content: 'Medium message here' }, // Will try to fit
        { role: 'user', content: 'Recent' }, // Last message, preserved
      ];

      const result = estimator.truncateToFit(messages, 100, {
        preserveSystem: false,
        preserveLastN: 1,
      });

      // Should preserve the last message but not all older messages
      expect(result[result.length - 1]?.content).toBe('Recent');
      // Should not include all messages since the long one won't fit
      expect(result.length).toBeLessThan(messages.length);
    });
  });

  describe('getConfig', () => {
    it('should return current configuration', () => {
      const config = estimator.getConfig();

      expect(config).toBeDefined();
      expect(config.defaultModel).toBe('gpt-4o');
      expect(config.defaultOutputTokens).toBe(500);
    });

    it('should return a copy of config', () => {
      const config1 = estimator.getConfig();
      const config2 = estimator.getConfig();

      expect(config1).not.toBe(config2); // Different objects
      expect(config1).toEqual(config2); // Same values
    });
  });

  describe('updateConfig', () => {
    it('should update configuration', () => {
      estimator.updateConfig({ defaultModel: 'claude-3-opus' });

      const config = estimator.getConfig();
      expect(config.defaultModel).toBe('claude-3-opus');
    });

    it('should validate updated config', () => {
      expect(() => {
        estimator.updateConfig({ defaultOutputTokens: -10 });
      }).toThrow();
    });

    it('should merge with existing config', () => {
      const original = estimator.getConfig();

      estimator.updateConfig({ defaultModel: 'gpt-4-turbo' });

      const updated = estimator.getConfig();
      expect(updated.defaultModel).toBe('gpt-4-turbo');
      expect(updated.defaultOutputTokens).toBe(original.defaultOutputTokens);
    });

    it('should validate all constraints', () => {
      expect(() => {
        estimator.updateConfig({ charsPerToken: 0 });
      }).toThrow();

      expect(() => {
        estimator.updateConfig({ charsPerToken: 11 });
      }).toThrow();

      expect(() => {
        estimator.updateConfig({ safetyMargin: -0.1 });
      }).toThrow();

      expect(() => {
        estimator.updateConfig({ safetyMargin: 0.6 });
      }).toThrow();
    });
  });
});

describe('TokenEstimatorConfigSchema', () => {
  it('should validate correct config', () => {
    const validConfig = {
      defaultModel: 'gpt-4o',
      defaultOutputTokens: 500,
      charsPerToken: 4,
      includeMessageOverhead: true,
      messageOverheadTokens: 4,
      safetyMargin: 0.1,
    };

    const result = TokenEstimatorConfigSchema.parse(validConfig);
    expect(result).toEqual(validConfig);
  });

  it('should apply defaults', () => {
    const result = TokenEstimatorConfigSchema.parse({});

    expect(result.defaultModel).toBe('gpt-4o');
    expect(result.defaultOutputTokens).toBe(500);
    expect(result.charsPerToken).toBe(4);
    expect(result.includeMessageOverhead).toBe(true);
    expect(result.messageOverheadTokens).toBe(4);
    expect(result.safetyMargin).toBe(0.1);
  });

  it('should reject invalid defaultOutputTokens', () => {
    expect(() => {
      TokenEstimatorConfigSchema.parse({ defaultOutputTokens: 5 });
    }).toThrow();

    expect(() => {
      TokenEstimatorConfigSchema.parse({ defaultOutputTokens: 40000 });
    }).toThrow();
  });

  it('should reject invalid charsPerToken', () => {
    expect(() => {
      TokenEstimatorConfigSchema.parse({ charsPerToken: 0.5 });
    }).toThrow();

    expect(() => {
      TokenEstimatorConfigSchema.parse({ charsPerToken: 15 });
    }).toThrow();
  });

  it('should reject invalid safetyMargin', () => {
    expect(() => {
      TokenEstimatorConfigSchema.parse({ safetyMargin: -0.1 });
    }).toThrow();

    expect(() => {
      TokenEstimatorConfigSchema.parse({ safetyMargin: 0.6 });
    }).toThrow();
  });

  it('should reject invalid messageOverheadTokens', () => {
    expect(() => {
      TokenEstimatorConfigSchema.parse({ messageOverheadTokens: -1 });
    }).toThrow();

    expect(() => {
      TokenEstimatorConfigSchema.parse({ messageOverheadTokens: 100 });
    }).toThrow();
  });
});

describe('Factory functions and utilities', () => {
  describe('createTokenEstimator', () => {
    it('should create instance with default config', () => {
      const instance = createTokenEstimator();

      expect(instance).toBeInstanceOf(TokenEstimator);
      expect(instance.getConfig().defaultModel).toBe('gpt-4o');
    });

    it('should create instance with custom config', () => {
      const instance = createTokenEstimator({
        defaultModel: 'claude-3-opus',
        defaultOutputTokens: 1000,
      });

      const config = instance.getConfig();
      expect(config.defaultModel).toBe('claude-3-opus');
      expect(config.defaultOutputTokens).toBe(1000);
    });
  });

  describe('tokenEstimator singleton', () => {
    it('should be a TokenEstimator instance', () => {
      expect(tokenEstimator).toBeInstanceOf(TokenEstimator);
    });

    it('should have default config', () => {
      const config = tokenEstimator.getConfig();
      expect(config.defaultModel).toBe('gpt-4o');
    });
  });

  describe('estimateTokens utility', () => {
    it('should estimate tokens for text', () => {
      const result = estimateTokens('Hello World');
      expect(result).toBeGreaterThan(0);
    });

    it('should return 0 for empty string', () => {
      const result = estimateTokens('');
      expect(result).toBe(0);
    });

    it('should use singleton instance', () => {
      const text = 'Test message';
      const utilityResult = estimateTokens(text);
      const singletonResult = tokenEstimator.estimateTokens(text);

      expect(utilityResult).toBe(singletonResult);
    });
  });

  describe('estimateCost utility', () => {
    it('should estimate cost with default parameters', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const result = estimateCost(messages);

      expect(result).toHaveProperty('inputCost');
      expect(result).toHaveProperty('outputCost');
      expect(result).toHaveProperty('totalCost');
      expect(result).toHaveProperty('breakdown');
    });

    it('should use custom model', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const result = estimateCost(messages, 'claude-3-opus');

      expect(result.totalCost).toBeGreaterThan(0);
    });

    it('should use custom maxOutputTokens', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Hello' },
      ];

      const result = estimateCost(messages, 'gpt-4o', 1000);

      expect(result.breakdown.estimatedResponse).toBeGreaterThan(0);
    });

    it('should use singleton instance', () => {
      const messages: TokenMessage[] = [
        { role: 'user', content: 'Test' },
      ];

      const utilityResult = estimateCost(messages, 'gpt-4o', 500);
      const singletonResult = tokenEstimator.estimateCost(messages, {
        model: 'gpt-4o',
        maxOutputTokens: 500,
      });

      expect(utilityResult.totalCost).toBeCloseTo(singletonResult.totalCost, 5);
    });
  });
});

describe('MODEL_PRICING', () => {
  it('should contain OpenAI models', () => {
    expect(MODEL_PRICING['gpt-4o']).toBeDefined();
    expect(MODEL_PRICING['gpt-4o-mini']).toBeDefined();
    expect(MODEL_PRICING['gpt-4-turbo']).toBeDefined();
    expect(MODEL_PRICING['gpt-4']).toBeDefined();
    expect(MODEL_PRICING['gpt-3.5-turbo']).toBeDefined();
  });

  it('should contain Anthropic models', () => {
    expect(MODEL_PRICING['claude-3-opus']).toBeDefined();
    expect(MODEL_PRICING['claude-3-sonnet']).toBeDefined();
    expect(MODEL_PRICING['claude-3-haiku']).toBeDefined();
    expect(MODEL_PRICING['claude-3-5-sonnet']).toBeDefined();
  });

  it('should contain local models', () => {
    expect(MODEL_PRICING['llama3.1:8b']).toBeDefined();
    expect(MODEL_PRICING['llama3.1:70b']).toBeDefined();
    expect(MODEL_PRICING['llama3:8b']).toBeDefined();
    expect(MODEL_PRICING['mistral']).toBeDefined();
    expect(MODEL_PRICING['mixtral:8x7b']).toBeDefined();
  });

  it('should have valid pricing structure for all models', () => {
    Object.entries(MODEL_PRICING).forEach(([model, pricing]) => {
      expect(pricing.input).toBeGreaterThanOrEqual(0);
      expect(pricing.output).toBeGreaterThanOrEqual(0);
      expect(pricing.contextWindow).toBeGreaterThan(0);
    });
  });

  it('should have zero cost for local models', () => {
    expect(MODEL_PRICING['llama3.1:8b']?.input).toBe(0);
    expect(MODEL_PRICING['llama3.1:8b']?.output).toBe(0);
    expect(MODEL_PRICING['mistral']?.input).toBe(0);
    expect(MODEL_PRICING['mistral']?.output).toBe(0);
  });

  it('should have non-zero cost for commercial models', () => {
    expect(MODEL_PRICING['gpt-4o']?.input).toBeGreaterThan(0);
    expect(MODEL_PRICING['gpt-4o']?.output).toBeGreaterThan(0);
    expect(MODEL_PRICING['claude-3-opus']?.input).toBeGreaterThan(0);
    expect(MODEL_PRICING['claude-3-opus']?.output).toBeGreaterThan(0);
  });
});
