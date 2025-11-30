/**
 * @module architecture/ai-data/ai-hooks
 *
 * AI Integration Hooks
 * ====================
 *
 * Hooks and pipelines for AI integration.
 */

import type { Result } from '../../types/result.js';

// ============================================================================
// AI TYPES
// ============================================================================

export interface AIModel {
  readonly id: string;
  readonly provider: AIProvider;
  readonly name: string;
  readonly capabilities: ModelCapability[];
}

export type AIProvider = 'openai' | 'anthropic' | 'google' | 'local';
export type ModelCapability = 'text_generation' | 'chat' | 'embeddings' | 'classification';

export interface PromptTemplate {
  readonly system?: string;
  readonly user: string;
  readonly examples?: PromptExample[];
}

export interface PromptExample {
  readonly input: string;
  readonly output: string;
}

export interface AIContext {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly traceId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface TokenUsage {
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
}

// ============================================================================
// AI ERROR
// ============================================================================

export class AIError extends Error {
  constructor(
    message: string,
    readonly code: AIErrorCode,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'AIError';
  }
}

export type AIErrorCode =
  | 'MODEL_NOT_FOUND'
  | 'INVALID_INPUT'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'INTERNAL_ERROR';

// ============================================================================
// AI HOOK INTERFACE
// ============================================================================

export interface AIHook<TInput = unknown, TOutput = unknown> {
  readonly id: string;
  readonly name: string;
  readonly model: AIModel;
  readonly prompt: PromptTemplate;
  execute(input: TInput, context?: AIContext): Promise<Result<TOutput, AIError>>;
}

// ============================================================================
// AI SERVICE REGISTRY
// ============================================================================

export class AIServiceRegistry {
  private hooks = new Map<string, AIHook>();
  private models = new Map<string, AIModel>();

  registerHook<TInput, TOutput>(hook: AIHook<TInput, TOutput>): void {
    this.hooks.set(hook.id, hook as AIHook);
  }

  getHook<TInput = unknown, TOutput = unknown>(id: string): AIHook<TInput, TOutput> | undefined {
    return this.hooks.get(id) as AIHook<TInput, TOutput> | undefined;
  }

  registerModel(model: AIModel): void {
    this.models.set(model.id, model);
  }

  getModel(id: string): AIModel | undefined {
    return this.models.get(id);
  }

  listHooks(): AIHook[] {
    return Array.from(this.hooks.values());
  }

  listModels(): AIModel[] {
    return Array.from(this.models.values());
  }
}

// ============================================================================
// PROMPT UTILITIES
// ============================================================================

export function compilePrompt(
  template: PromptTemplate,
  variables: Record<string, unknown>
): string {
  let prompt = template.user;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    prompt = prompt.replace(placeholder, String(value));
  }
  return prompt;
}

export interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export function createChatMessages(
  template: PromptTemplate,
  variables: Record<string, unknown>
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  if (template.system) {
    messages.push({ role: 'system', content: template.system });
  }
  if (template.examples) {
    for (const example of template.examples) {
      messages.push({ role: 'user', content: example.input });
      messages.push({ role: 'assistant', content: example.output });
    }
  }
  messages.push({ role: 'user', content: compilePrompt(template, variables) });
  return messages;
}

export const aiRegistry = new AIServiceRegistry();
