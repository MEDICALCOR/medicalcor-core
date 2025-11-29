/**
 * @fileoverview IAIGateway Interface
 *
 * Banking/Medical Grade Gateway Interface for AI Operations.
 * Abstracts AI providers (OpenAI, Anthropic, etc.).
 *
 * @module domain/shared-kernel/repository-interfaces/ai-gateway
 *
 * DESIGN PRINCIPLES:
 * 1. ANTI-CORRUPTION LAYER - Protects domain from AI provider models
 * 2. PORT/ADAPTER PATTERN - Domain defines the port, adapters implement
 * 3. VENDOR AGNOSTIC - Can switch AI providers without changing domain code
 * 4. FALLBACK SUPPORT - Graceful degradation when AI unavailable
 */

import type { LeadScore, LeadClassification } from '../value-objects/lead-score.js';

// ============================================================================
// AI SCORING TYPES
// ============================================================================

/**
 * Lead scoring context - Domain representation
 */
export interface LeadScoringContext {
  readonly phone: string;
  readonly channel: 'whatsapp' | 'voice' | 'web' | 'hubspot';
  readonly language?: 'ro' | 'en' | 'de';
  readonly messageHistory: readonly MessageEntry[];
  readonly utmSource?: string;
  readonly utmCampaign?: string;
  readonly previousScore?: LeadScore;
}

/**
 * Message entry for conversation context
 */
export interface MessageEntry {
  readonly role: 'user' | 'assistant' | 'system';
  readonly content: string;
  readonly timestamp: Date;
}

/**
 * AI Scoring result - Domain representation
 */
export interface AIScoringResult {
  readonly score: LeadScore;
  readonly reasoning: string;
  readonly suggestedAction: string;
  readonly detectedIntent?: string;
  readonly urgencyIndicators: readonly string[];
  readonly budgetMentioned: boolean;
  readonly procedureInterest: readonly string[];
  readonly tokensUsed: number;
  readonly latencyMs: number;
}

// ============================================================================
// AI LANGUAGE TYPES
// ============================================================================

/**
 * Language detection request
 */
export interface LanguageDetectionRequest {
  readonly text: string;
  readonly possibleLanguages?: readonly string[];
}

/**
 * Language detection result
 */
export interface LanguageDetectionResult {
  readonly detectedLanguage: string;
  readonly confidence: number;
  readonly alternatives: readonly {
    language: string;
    confidence: number;
  }[];
}

/**
 * Translation request
 */
export interface TranslationRequest {
  readonly text: string;
  readonly sourceLanguage?: string;
  readonly targetLanguage: string;
}

/**
 * Translation result
 */
export interface TranslationResult {
  readonly translatedText: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly confidence: number;
}

// ============================================================================
// AI CONVERSATION TYPES
// ============================================================================

/**
 * Conversation response request
 */
export interface ConversationResponseRequest {
  readonly context: readonly MessageEntry[];
  readonly patientName?: string;
  readonly language: 'ro' | 'en' | 'de';
  readonly leadClassification?: LeadClassification;
  readonly procedureInterest?: readonly string[];
  readonly maxTokens?: number;
}

/**
 * Conversation response result
 */
export interface ConversationResponseResult {
  readonly response: string;
  readonly suggestedActions: readonly string[];
  readonly sentiment: 'positive' | 'neutral' | 'negative';
  readonly shouldEscalate: boolean;
  readonly escalationReason?: string;
  readonly tokensUsed: number;
}

// ============================================================================
// AI TRANSCRIPTION TYPES
// ============================================================================

/**
 * Audio transcription request
 */
export interface TranscriptionRequest {
  readonly audioUrl: string;
  readonly audioFormat: 'mp3' | 'wav' | 'ogg' | 'webm';
  readonly language?: string;
  readonly speakerDiarization?: boolean;
}

/**
 * Audio transcription result
 */
export interface TranscriptionResult {
  readonly text: string;
  readonly language: string;
  readonly confidence: number;
  readonly durationSeconds: number;
  readonly segments?: readonly TranscriptionSegment[];
}

/**
 * Transcription segment (for speaker diarization)
 */
export interface TranscriptionSegment {
  readonly text: string;
  readonly speaker?: string;
  readonly startTime: number;
  readonly endTime: number;
  readonly confidence: number;
}

// ============================================================================
// GATEWAY INTERFACE
// ============================================================================

/**
 * IAIGateway - Banking Grade AI Gateway
 *
 * This interface defines the contract for AI operations.
 * Implementations can be OpenAI, Anthropic, local models, etc.
 *
 * DESIGN:
 * - All operations return Result types for error handling
 * - Fallback support when AI is unavailable
 * - Token usage tracking for cost management
 *
 * @example
 * ```typescript
 * // Score a lead message
 * const result = await aiGateway.scoreLead({
 *   phone: '+40721234567',
 *   channel: 'whatsapp',
 *   language: 'ro',
 *   messageHistory: [
 *     { role: 'user', content: 'Vreau All-on-4', timestamp: new Date() }
 *   ]
 * });
 *
 * if (result.success) {
 *   console.log(result.value.score.classification); // 'HOT'
 *   console.log(result.value.reasoning);
 * }
 *
 * // Detect language
 * const langResult = await aiGateway.detectLanguage({
 *   text: 'Bună ziua, aș dori informații'
 * });
 * // Returns: { detectedLanguage: 'ro', confidence: 0.95 }
 * ```
 */
export interface IAIGateway {
  // ============================================================================
  // LEAD SCORING
  // ============================================================================

  /**
   * Score a lead based on conversation context
   *
   * Uses AI to analyze conversation and determine lead quality.
   * Returns LeadScore value object with classification.
   *
   * @param context - Lead scoring context
   */
  scoreLead(context: LeadScoringContext): Promise<AIGatewayResult<AIScoringResult>>;

  /**
   * Check if AI scoring is available
   *
   * Use this to determine if fallback should be used.
   */
  isScoringAvailable(): Promise<boolean>;

  // ============================================================================
  // LANGUAGE OPERATIONS
  // ============================================================================

  /**
   * Detect language of text
   *
   * @param request - Detection request
   */
  detectLanguage(
    request: LanguageDetectionRequest
  ): Promise<AIGatewayResult<LanguageDetectionResult>>;

  /**
   * Translate text
   *
   * @param request - Translation request
   */
  translate(request: TranslationRequest): Promise<AIGatewayResult<TranslationResult>>;

  // ============================================================================
  // CONVERSATION
  // ============================================================================

  /**
   * Generate conversation response
   *
   * AI-powered response generation for patient conversations.
   *
   * @param request - Conversation request
   */
  generateResponse(
    request: ConversationResponseRequest
  ): Promise<AIGatewayResult<ConversationResponseResult>>;

  /**
   * Analyze conversation sentiment
   *
   * @param messages - Conversation history
   */
  analyzeSentiment(
    messages: readonly MessageEntry[]
  ): Promise<AIGatewayResult<SentimentAnalysisResult>>;

  // ============================================================================
  // TRANSCRIPTION
  // ============================================================================

  /**
   * Transcribe audio
   *
   * @param request - Transcription request
   */
  transcribe(request: TranscriptionRequest): Promise<AIGatewayResult<TranscriptionResult>>;

  // ============================================================================
  // HEALTH & USAGE
  // ============================================================================

  /**
   * Check AI service health
   */
  healthCheck(): Promise<AIGatewayResult<AIHealthStatus>>;

  /**
   * Get current usage statistics
   */
  getUsageStats(): Promise<AIGatewayResult<AIUsageStats>>;
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Gateway operation result
 */
export type AIGatewayResult<T> =
  | { success: true; value: T }
  | { success: false; error: AIGatewayError };

/**
 * Gateway error types
 */
export interface AIGatewayError {
  readonly code: AIGatewayErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
  readonly retryable: boolean;
  readonly fallbackAvailable: boolean;
  readonly cause?: Error;
}

/**
 * Gateway error codes
 */
export type AIGatewayErrorCode =
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'MODEL_UNAVAILABLE'
  | 'CONTENT_FILTERED'
  | 'TIMEOUT'
  | 'CONNECTION_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Sentiment analysis result
 */
export interface SentimentAnalysisResult {
  readonly overall: 'positive' | 'neutral' | 'negative';
  readonly score: number; // -1 to 1
  readonly emotions: readonly {
    emotion: string;
    intensity: number;
  }[];
}

/**
 * AI Health Status
 */
export interface AIHealthStatus {
  readonly available: boolean;
  readonly latencyMs: number;
  readonly model: string;
  readonly provider: string;
}

/**
 * AI Usage Statistics
 */
export interface AIUsageStats {
  readonly tokensUsedToday: number;
  readonly tokensLimit: number;
  readonly requestsToday: number;
  readonly averageLatencyMs: number;
  readonly costEstimateUsd: number;
}

// ============================================================================
// ERROR FACTORY FUNCTIONS
// ============================================================================

/**
 * Create rate limited error
 */
export function aiRateLimitedError(retryAfterMs?: number): AIGatewayError {
  const baseError: AIGatewayError = {
    code: 'RATE_LIMITED',
    message: 'AI service rate limit exceeded',
    retryable: true,
    fallbackAvailable: true,
  };

  if (retryAfterMs !== undefined) {
    return { ...baseError, details: { retryAfterMs } };
  }

  return baseError;
}

/**
 * Create quota exceeded error
 */
export function aiQuotaExceededError(): AIGatewayError {
  return {
    code: 'QUOTA_EXCEEDED',
    message: 'AI service quota exceeded for this period',
    retryable: false,
    fallbackAvailable: true,
  };
}

/**
 * Create model unavailable error
 */
export function aiModelUnavailableError(model: string): AIGatewayError {
  return {
    code: 'MODEL_UNAVAILABLE',
    message: `AI model ${model} is currently unavailable`,
    retryable: true,
    fallbackAvailable: true,
    details: { model },
  };
}

/**
 * Create content filtered error
 */
export function aiContentFilteredError(): AIGatewayError {
  return {
    code: 'CONTENT_FILTERED',
    message: 'Content was filtered by AI safety systems',
    retryable: false,
    fallbackAvailable: true,
  };
}
