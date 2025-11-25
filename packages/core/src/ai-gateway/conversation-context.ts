/**
 * AI-First API Gateway - Conversation Context Manager
 *
 * Manages conversation state across multiple AI interactions:
 * - Session tracking with TTL
 * - Message history with context window
 * - Entity extraction and memory
 * - Intent chain tracking for multi-turn conversations
 */

import { z } from 'zod';

// ============================================================================
// CONVERSATION SCHEMAS
// ============================================================================

export const ConversationMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'system', 'function']),
  content: z.string(),
  functionCall: z
    .object({
      name: z.string(),
      arguments: z.record(z.unknown()),
      result: z.unknown().optional(),
    })
    .optional(),
  timestamp: z.date(),
  metadata: z.record(z.unknown()).optional(),
});

export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const ExtractedEntitySchema = z.object({
  type: z.enum([
    'patient_id',
    'phone',
    'email',
    'appointment_id',
    'date',
    'time',
    'service_type',
    'doctor',
    'amount',
    'consent_type',
  ]),
  value: z.string(),
  confidence: z.number(),
  source: z.enum(['user_input', 'function_result', 'context']),
  extractedAt: z.date(),
});

export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

export const ConversationStateSchema = z.object({
  sessionId: z.string(),
  channel: z.enum(['whatsapp', 'voice', 'web', 'api']),
  startedAt: z.date(),
  lastActivityAt: z.date(),
  expiresAt: z.date(),
  userId: z.string().optional(),
  tenantId: z.string().optional(),
  messages: z.array(ConversationMessageSchema),
  entities: z.array(ExtractedEntitySchema),
  intentChain: z.array(
    z.object({
      intent: z.string(),
      confidence: z.number(),
      timestamp: z.date(),
      resolved: z.boolean(),
    })
  ),
  metadata: z.record(z.unknown()),
});

export type ConversationState = z.infer<typeof ConversationStateSchema>;

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface ConversationContextConfig {
  /** Max messages to keep in context window */
  maxMessages: number;
  /** Session TTL in milliseconds */
  sessionTtlMs: number;
  /** Max entities to track per conversation */
  maxEntities: number;
  /** Auto-extract entities from messages */
  autoExtractEntities: boolean;
}

const DEFAULT_CONFIG: ConversationContextConfig = {
  maxMessages: 50,
  sessionTtlMs: 30 * 60 * 1000, // 30 minutes
  maxEntities: 100,
  autoExtractEntities: true,
};

// ============================================================================
// ENTITY EXTRACTION PATTERNS
// ============================================================================

interface EntityPattern {
  type: ExtractedEntity['type'];
  patterns: RegExp[];
  transform?: (match: string) => string;
}

const ENTITY_PATTERNS: EntityPattern[] = [
  {
    type: 'phone',
    patterns: [
      /\+?\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,4}[-.\s]?\d{1,9}/,
      /\+40\s?7\d{2}\s?\d{3}\s?\d{3}/, // Romanian mobile
    ],
    transform: (match) => match.replace(/[-.\s()]/g, ''),
  },
  {
    type: 'email',
    patterns: [/[\w.-]+@[\w.-]+\.\w{2,}/i],
  },
  {
    type: 'date',
    patterns: [
      /\d{4}-\d{2}-\d{2}/, // ISO format
      /\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/, // Common formats
      /(?:azi|mâine|poimâine)/i, // Romanian relative dates
      /(?:today|tomorrow)/i, // English relative dates
      /(?:luni|marți|miercuri|joi|vineri|sâmbătă|duminică)/i, // Romanian weekdays
    ],
  },
  {
    type: 'time',
    patterns: [
      /\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AaPp][Mm])?/, // 10:30, 10:30:00, 10:30 AM
      /(?:dimineață|după-amiază|seară)/i, // Romanian time of day
      /(?:morning|afternoon|evening)/i, // English time of day
    ],
  },
  {
    type: 'service_type',
    patterns: [
      /(?:implant|implante|all-on-[46x]|albire|whitening|curățare|cleaning|extracție|consultație|control)/i,
    ],
  },
  {
    type: 'amount',
    patterns: [
      /\d+(?:[.,]\d+)?\s*(?:lei|ron|euro|eur|€)/i,
      /(?:lei|ron|euro|eur|€)\s*\d+(?:[.,]\d+)?/i,
    ],
  },
  {
    type: 'appointment_id',
    patterns: [/apt-[a-zA-Z0-9]+/i, /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i],
  },
  {
    type: 'patient_id',
    patterns: [/pat-[a-zA-Z0-9]+/i, /patient[:\s]+([a-zA-Z0-9-]+)/i],
  },
  {
    type: 'consent_type',
    patterns: [
      /(?:gdpr|marketing|data_processing|communication|appointment_reminders|treatment_updates)/i,
    ],
  },
];

// ============================================================================
// CONVERSATION CONTEXT MANAGER
// ============================================================================

export class ConversationContextManager {
  private sessions = new Map<string, ConversationState>();
  private config: ConversationContextConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<ConversationContextConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanupTask();
  }

  /**
   * Get or create a conversation session
   */
  getOrCreateSession(
    sessionId: string,
    options: {
      channel?: ConversationState['channel'];
      userId?: string;
      tenantId?: string;
      metadata?: Record<string, unknown>;
    } = {}
  ): ConversationState {
    let session = this.sessions.get(sessionId);

    if (!session || new Date() > session.expiresAt) {
      // Create new session
      session = {
        sessionId,
        channel: options.channel ?? 'api',
        startedAt: new Date(),
        lastActivityAt: new Date(),
        expiresAt: new Date(Date.now() + this.config.sessionTtlMs),
        userId: options.userId,
        tenantId: options.tenantId,
        messages: [],
        entities: [],
        intentChain: [],
        metadata: options.metadata ?? {},
      };
      this.sessions.set(sessionId, session);
    } else {
      // Update activity
      session.lastActivityAt = new Date();
      session.expiresAt = new Date(Date.now() + this.config.sessionTtlMs);
    }

    return session;
  }

  /**
   * Add a message to the conversation
   */
  addMessage(
    sessionId: string,
    message: Omit<ConversationMessage, 'id' | 'timestamp'>
  ): ConversationMessage {
    const session = this.getOrCreateSession(sessionId);

    const fullMessage: ConversationMessage = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    };

    session.messages.push(fullMessage);

    // Trim messages if exceeding limit
    if (session.messages.length > this.config.maxMessages) {
      session.messages = session.messages.slice(-this.config.maxMessages);
    }

    // Auto-extract entities from user messages
    if (this.config.autoExtractEntities && message.role === 'user') {
      const entities = this.extractEntities(message.content);
      for (const entity of entities) {
        this.addEntity(sessionId, entity);
      }
    }

    session.lastActivityAt = new Date();
    session.expiresAt = new Date(Date.now() + this.config.sessionTtlMs);

    return fullMessage;
  }

  /**
   * Add a function result to the conversation
   */
  addFunctionResult(
    sessionId: string,
    functionName: string,
    args: Record<string, unknown>,
    result: unknown
  ): ConversationMessage {
    return this.addMessage(sessionId, {
      role: 'function',
      content: JSON.stringify(result),
      functionCall: {
        name: functionName,
        arguments: args,
        result,
      },
    });
  }

  /**
   * Extract entities from text
   */
  extractEntities(text: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];

    for (const { type, patterns, transform } of ENTITY_PATTERNS) {
      for (const pattern of patterns) {
        const matches = text.matchAll(new RegExp(pattern, 'gi'));
        for (const match of matches) {
          let value = match[0];
          if (transform) {
            value = transform(value);
          }

          // Avoid duplicates
          if (!entities.some((e) => e.type === type && e.value === value)) {
            entities.push({
              type,
              value,
              confidence: 0.9,
              source: 'user_input',
              extractedAt: new Date(),
            });
          }
        }
      }
    }

    return entities;
  }

  /**
   * Add an extracted entity to the session
   */
  addEntity(sessionId: string, entity: Omit<ExtractedEntity, 'extractedAt'>): void {
    const session = this.getOrCreateSession(sessionId);

    const fullEntity: ExtractedEntity = {
      ...entity,
      extractedAt: new Date(),
    };

    // Update existing entity of same type or add new
    const existingIndex = session.entities.findIndex((e) => e.type === entity.type);
    if (existingIndex >= 0) {
      session.entities[existingIndex] = fullEntity;
    } else {
      session.entities.push(fullEntity);
    }

    // Trim entities if exceeding limit
    if (session.entities.length > this.config.maxEntities) {
      session.entities = session.entities.slice(-this.config.maxEntities);
    }
  }

  /**
   * Get entity value by type
   */
  getEntity(sessionId: string, type: ExtractedEntity['type']): ExtractedEntity | undefined {
    const session = this.sessions.get(sessionId);
    return session?.entities.find((e) => e.type === type);
  }

  /**
   * Get all entities of a type
   */
  getEntities(sessionId: string, type?: ExtractedEntity['type']): ExtractedEntity[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    if (type) {
      return session.entities.filter((e) => e.type === type);
    }
    return session.entities;
  }

  /**
   * Track an intent in the conversation
   */
  trackIntent(sessionId: string, intent: string, confidence: number): void {
    const session = this.getOrCreateSession(sessionId);

    session.intentChain.push({
      intent,
      confidence,
      timestamp: new Date(),
      resolved: false,
    });
  }

  /**
   * Mark the last intent as resolved
   */
  resolveIntent(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session || session.intentChain.length === 0) return;

    const lastIntent = session.intentChain[session.intentChain.length - 1];
    if (lastIntent) {
      lastIntent.resolved = true;
    }
  }

  /**
   * Get the current unresolved intent
   */
  getCurrentIntent(
    sessionId: string
  ): { intent: string; confidence: number; timestamp: Date } | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const unresolvedIntents = session.intentChain.filter((i) => !i.resolved);
    return unresolvedIntents[unresolvedIntents.length - 1];
  }

  /**
   * Get conversation context for AI
   */
  getContextForAI(
    sessionId: string,
    maxMessages?: number
  ): {
    messages: { role: string; content: string }[];
    entities: Record<string, string>;
    currentIntent: string | undefined;
    summary: string;
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        messages: [],
        entities: {},
        currentIntent: undefined,
        summary: 'No conversation context available',
      };
    }

    const limit = maxMessages ?? this.config.maxMessages;
    const recentMessages = session.messages.slice(-limit);

    // Convert entities to key-value map
    const entityMap: Record<string, string> = {};
    for (const entity of session.entities) {
      entityMap[entity.type] = entity.value;
    }

    // Get current intent
    const currentIntent = this.getCurrentIntent(sessionId);

    // Generate summary
    const summary = this.generateContextSummary(session);

    return {
      messages: recentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      entities: entityMap,
      currentIntent: currentIntent?.intent,
      summary,
    };
  }

  /**
   * Generate a context summary for the AI
   */
  private generateContextSummary(session: ConversationState): string {
    const parts: string[] = [];

    // Session info
    const duration = Date.now() - session.startedAt.getTime();
    const durationMinutes = Math.floor(duration / 60000);
    parts.push(`Session: ${durationMinutes}min, ${session.messages.length} messages via ${session.channel}`);

    // Key entities
    const keyEntities = session.entities.filter((e) =>
      ['patient_id', 'phone', 'appointment_id', 'service_type'].includes(e.type)
    );
    if (keyEntities.length > 0) {
      const entityStr = keyEntities.map((e) => `${e.type}=${e.value}`).join(', ');
      parts.push(`Context: ${entityStr}`);
    }

    // Intent chain
    const intents = session.intentChain.slice(-3);
    if (intents.length > 0) {
      const intentStr = intents.map((i) => `${i.intent}(${i.resolved ? 'done' : 'pending'})`).join(' -> ');
      parts.push(`Intents: ${intentStr}`);
    }

    return parts.join(' | ');
  }

  /**
   * Build function arguments from context
   */
  buildArgsFromContext(
    sessionId: string,
    requiredArgs: string[]
  ): { args: Record<string, unknown>; missing: string[] } {
    const session = this.sessions.get(sessionId);
    const args: Record<string, unknown> = {};
    const missing: string[] = [];

    // Map entity types to common arg names
    const argToEntityMap: Record<string, ExtractedEntity['type'][]> = {
      phone: ['phone'],
      patientId: ['patient_id'],
      appointmentId: ['appointment_id'],
      email: ['email'],
      serviceType: ['service_type'],
      preferredDate: ['date'],
      preferredTimeSlot: ['time'],
    };

    for (const argName of requiredArgs) {
      const entityTypes = argToEntityMap[argName];

      if (entityTypes && session) {
        for (const entityType of entityTypes) {
          const entity = session.entities.find((e) => e.type === entityType);
          if (entity) {
            args[argName] = entity.value;
            break;
          }
        }
      }

      if (args[argName] === undefined) {
        missing.push(argName);
      }
    }

    return { args, missing };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): ConversationState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Clear all sessions
   */
  clearAll(): void {
    this.sessions.clear();
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Start cleanup task for expired sessions
   */
  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const now = new Date();
      for (const [sessionId, session] of this.sessions) {
        if (now > session.expiresAt) {
          this.sessions.delete(sessionId);
        }
      }
    }, 5 * 60 * 1000);

    // Don't keep process alive just for cleanup
    this.cleanupInterval.unref();
  }

  /**
   * Stop cleanup task
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

export function createConversationContextManager(
  config?: Partial<ConversationContextConfig>
): ConversationContextManager {
  return new ConversationContextManager(config);
}

// Global instance for convenience
export const conversationContext = new ConversationContextManager();
