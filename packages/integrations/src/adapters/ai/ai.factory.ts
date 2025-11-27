/**
 * AI/LLM Provider Factory
 *
 * Creates the appropriate LLM provider adapter based on environment configuration.
 *
 * Environment Variables:
 * - AI_PROVIDER: 'openai' | 'anthropic' | 'azure_openai' | 'groq' | 'ollama'
 * - Provider-specific keys (e.g., OPENAI_API_KEY, ANTHROPIC_API_KEY)
 */

import type { ILLMProvider, LLMProvider } from '@medicalcor/types';
import { OpenAIAdapter, type OpenAIAdapterConfig } from './openai.adapter.js';

export interface AIFactoryConfig {
  provider?: LLMProvider;
  openai?: OpenAIAdapterConfig;
  anthropic?: {
    apiKey: string;
    model?: string;
  };
  azure?: {
    apiKey: string;
    endpoint: string;
    deployment: string;
  };
  groq?: {
    apiKey: string;
    model?: string;
  };
  ollama?: {
    baseUrl: string;
    model: string;
  };
  timeoutMs?: number;
  retryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
  };
}

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AIFactory {
  private static instance: ILLMProvider | null = null;

  static getProvider(config?: AIFactoryConfig): ILLMProvider {
    if (AIFactory.instance && !config) {
      return AIFactory.instance;
    }

    const provider =
      config?.provider ?? (process.env.AI_PROVIDER as LLMProvider | undefined) ?? 'openai';
    const adapter = AIFactory.createAdapter(provider, config);

    if (!config) {
      AIFactory.instance = adapter;
    }

    return adapter;
  }

  static createAdapter(provider: LLMProvider, config?: AIFactoryConfig): ILLMProvider {
    switch (provider) {
      case 'openai':
        return AIFactory.createOpenAIAdapter(config);

      case 'anthropic':
        throw new Error(
          'Anthropic adapter not yet implemented. ' +
            'Create an AnthropicAdapter class implementing ILLMProvider.'
        );

      case 'azure_openai':
        throw new Error(
          'Azure OpenAI adapter not yet implemented. ' +
            'Create an AzureOpenAIAdapter class implementing ILLMProvider.'
        );

      case 'groq':
        throw new Error(
          'Groq adapter not yet implemented. ' +
            'Create a GroqAdapter class implementing ILLMProvider.'
        );

      case 'ollama':
        throw new Error(
          'Ollama adapter not yet implemented. ' +
            'Create an OllamaAdapter class implementing ILLMProvider.'
        );

      case 'google_vertex':
        throw new Error(
          'Google Vertex AI adapter not yet implemented. ' +
            'Create a VertexAIAdapter class implementing ILLMProvider.'
        );

      default:
        throw new Error(`Unknown AI provider: ${provider}`);
    }
  }

  private static createOpenAIAdapter(config?: AIFactoryConfig): ILLMProvider {
    if (config?.openai) {
      if (!config.openai.apiKey) {
        throw new Error('OPENAI_API_KEY not configured');
      }
      return new OpenAIAdapter(config.openai);
    }

    const apiKey = process.env.OPENAI_API_KEY ?? '';
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    return new OpenAIAdapter({
      apiKey,
      model: process.env.OPENAI_MODEL ?? 'gpt-4o',
      organization: process.env.OPENAI_ORGANIZATION ?? undefined,
      timeoutMs: config?.timeoutMs ?? 60000,
      retryConfig: config?.retryConfig ?? undefined,
    });
  }

  static clearInstance(): void {
    AIFactory.instance = null;
  }

  static isProviderAvailable(provider: LLMProvider): boolean {
    switch (provider) {
      case 'openai':
        return !!process.env.OPENAI_API_KEY;
      case 'anthropic':
        return !!process.env.ANTHROPIC_API_KEY;
      case 'azure_openai':
        return !!(process.env.AZURE_OPENAI_KEY && process.env.AZURE_OPENAI_ENDPOINT);
      case 'groq':
        return !!process.env.GROQ_API_KEY;
      case 'ollama':
        return !!process.env.OLLAMA_BASE_URL;
      case 'google_vertex':
        return !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
      default:
        return false;
    }
  }
}

export function getAIProvider(config?: AIFactoryConfig): ILLMProvider {
  return AIFactory.getProvider(config);
}
