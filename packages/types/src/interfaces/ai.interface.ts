/**
 * AI/LLM Universal Interface
 *
 * Abstracts AI model access to support multiple providers:
 * - OpenAI (GPT-4, GPT-4o - current)
 * - Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
 * - Azure OpenAI (for compliance requirements)
 * - Google Vertex AI (Gemini)
 * - Local/Self-hosted (Llama 3, Mistral via Ollama)
 * - Groq (fast inference)
 *
 * Usage:
 * ```typescript
 * const llm = LLMFactory.getProvider();
 * const response = await llm.chatComplete(systemPrompt, userMessage, true);
 *
 * const embeddings = await llm.embedText('Patient inquiry about implants');
 * ```
 */

import type { IBaseAdapter } from './base.interface.js';

/**
 * Supported LLM providers
 */
export type LLMProvider =
  | 'openai'
  | 'anthropic'
  | 'azure_openai'
  | 'google_vertex'
  | 'groq'
  | 'ollama'
  | 'together'
  | 'mistral';

/**
 * Chat message role
 */
export type ChatRole = 'system' | 'user' | 'assistant';

/**
 * Chat message
 */
export interface IChatMessage {
  /** Message role */
  role: ChatRole;

  /** Message content */
  content: string;

  /** Optional name for multi-agent scenarios */
  name?: string | undefined;
}

/**
 * Chat completion options
 */
export interface IChatCompletionOptions {
  /** Messages to send */
  messages: IChatMessage[];

  /** Model to use (provider-specific) */
  model?: string | undefined;

  /** Maximum tokens to generate */
  maxTokens?: number | undefined;

  /** Temperature (0-2, lower = more deterministic) */
  temperature?: number | undefined;

  /** Enable JSON mode for structured output */
  jsonMode?: boolean | undefined;

  /** Stop sequences */
  stopSequences?: string[] | undefined;

  /** Seed for reproducibility */
  seed?: number | undefined;
}

/**
 * Chat completion result
 */
export interface IChatCompletionResult {
  /** Generated content */
  content: string;

  /** Model used */
  model: string;

  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  /** Finish reason */
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls';

  /** Provider-specific data */
  providerData?: Record<string, unknown> | undefined;
}

/**
 * Embedding result
 */
export interface IEmbeddingResult {
  /** Embedding vector */
  embedding: number[];

  /** Model used */
  model: string;

  /** Token count */
  tokenCount: number;
}

/**
 * Lead scoring context (for AI-based scoring)
 */
export interface ILeadScoringContext {
  /** Customer phone */
  phone: string;

  /** Communication channel */
  channel: 'whatsapp' | 'voice' | 'web' | 'email';

  /** Message history */
  messageHistory: {
    role: 'user' | 'assistant';
    content: string;
    timestamp?: string | undefined;
  }[];

  /** Customer name if known */
  name?: string | undefined;

  /** Detected language */
  language?: 'ro' | 'en' | 'de' | undefined;

  /** UTM parameters */
  utm?:
    | {
        source?: string | undefined;
        medium?: string | undefined;
        campaign?: string | undefined;
      }
    | undefined;

  /** Additional metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Lead scoring result
 */
export interface ILeadScoringResult {
  /** Score 1-5 */
  score: number;

  /** Classification */
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';

  /** Confidence 0-1 */
  confidence: number;

  /** Reasoning */
  reasoning: string;

  /** Suggested next action */
  suggestedAction: string;

  /** Detected intent */
  detectedIntent?: string | undefined;

  /** Urgency indicators found */
  urgencyIndicators: string[];

  /** Whether budget was mentioned */
  budgetMentioned: boolean;

  /** Procedures of interest */
  procedureInterest: string[];
}

/**
 * Sentiment analysis result
 */
export interface ISentimentResult {
  /** Sentiment */
  sentiment: 'positive' | 'neutral' | 'negative';

  /** Confidence 0-1 */
  confidence: number;

  /** Reasoning */
  reasoning?: string | undefined;
}

/**
 * Language detection result
 */
export interface ILanguageDetectionResult {
  /** Detected language code */
  language: string;

  /** Confidence 0-1 */
  confidence: number;

  /** All detected languages with confidence */
  alternatives?: { language: string; confidence: number }[] | undefined;
}

/**
 * Text generation options
 */
export interface ITextGenerationOptions {
  /** Prompt to complete */
  prompt: string;

  /** Maximum tokens */
  maxTokens?: number | undefined;

  /** Temperature */
  temperature?: number | undefined;

  /** Model to use */
  model?: string | undefined;
}

/**
 * Universal LLM Provider Interface
 *
 * All LLM providers must implement this interface to be
 * compatible with the MedicalCor platform.
 */
export interface ILLMProvider extends IBaseAdapter {
  /**
   * Provider identifier
   */
  readonly providerName: LLMProvider;

  /**
   * Default model for this provider
   */
  readonly defaultModel: string;

  /**
   * Create a chat completion
   */
  chatComplete(options: IChatCompletionOptions): Promise<IChatCompletionResult>;

  /**
   * Simplified chat completion with system/user prompt
   * Returns just the content string
   */
  chat(systemPrompt: string, userMessage: string, jsonMode?: boolean): Promise<string>;

  /**
   * Generate embeddings for text (for RAG)
   */
  embedText(text: string, model?: string): Promise<IEmbeddingResult>;

  /**
   * Generate embeddings for multiple texts (batch)
   */
  embedTexts(texts: string[], model?: string): Promise<IEmbeddingResult[]>;

  /**
   * Score a lead using AI analysis
   */
  scoreLead(context: ILeadScoringContext): Promise<ILeadScoringResult>;

  /**
   * Analyze sentiment of text
   */
  analyzeSentiment(text: string): Promise<ISentimentResult>;

  /**
   * Detect language of text
   */
  detectLanguage(text: string): Promise<ILanguageDetectionResult>;

  /**
   * Summarize text
   */
  summarize(text: string, language?: string, maxLength?: number): Promise<string>;

  /**
   * Generate a response for a conversation
   */
  generateReply(options: {
    context: ILeadScoringContext;
    tone?: 'professional' | 'friendly' | 'empathetic';
    maxLength?: number;
    language?: string;
  }): Promise<string>;

  /**
   * Count tokens in text (for cost estimation)
   */
  countTokens(text: string, model?: string): Promise<number>;

  /**
   * List available models
   */
  listModels(): Promise<
    {
      id: string;
      name: string;
      contextLength: number;
      supportsJson?: boolean | undefined;
    }[]
  >;
}

/**
 * LLM Provider Factory configuration
 */
export interface ILLMProviderConfig {
  /** Provider to use */
  provider: LLMProvider;

  /** API key */
  apiKey: string;

  /** Default model to use */
  defaultModel?: string | undefined;

  /** Organization ID (for OpenAI) */
  organization?: string | undefined;

  /** Base URL (for Azure, self-hosted) */
  baseUrl?: string | undefined;

  /** Azure deployment name */
  azureDeployment?: string | undefined;

  /** Request timeout in ms */
  timeoutMs?: number | undefined;

  /** Retry configuration */
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}

/**
 * Embedding Provider Interface (subset for dedicated embedding services)
 */
export interface IEmbeddingProvider extends IBaseAdapter {
  /**
   * Generate embeddings for text
   */
  embedText(text: string, model?: string): Promise<IEmbeddingResult>;

  /**
   * Generate embeddings for multiple texts
   */
  embedTexts(texts: string[], model?: string): Promise<IEmbeddingResult[]>;

  /**
   * Get embedding dimension for model
   */
  getDimension(model?: string): number;
}
