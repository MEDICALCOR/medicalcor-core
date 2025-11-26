/**
 * Fine-Tuning Data Export Service
 *
 * Exports clinic conversation data for model fine-tuning with:
 * - OpenAI JSONL format (chat completions)
 * - Anthropic format support
 * - PII redaction
 * - Quality filtering
 * - Conversation formatting
 */

import type { Pool } from 'pg';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Conversation message for export
 */
export interface ExportMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Fine-tuning example in OpenAI format
 */
export interface FineTuningExample {
  messages: ExportMessage[];
}

/**
 * Export statistics
 */
export interface ExportStats {
  /** Total conversations exported */
  totalConversations: number;
  /** Total messages exported */
  totalMessages: number;
  /** Conversations filtered out */
  filteredOut: number;
  /** Average conversation length */
  avgConversationLength: number;
  /** Export duration in ms */
  exportDurationMs: number;
  /** Output file size (if applicable) */
  fileSizeBytes?: number;
}

/**
 * Quality criteria for conversation filtering
 */
export interface QualityCriteria {
  /** Minimum messages in conversation */
  minMessages: number;
  /** Maximum messages in conversation */
  maxMessages: number;
  /** Minimum user messages */
  minUserMessages: number;
  /** Minimum assistant messages */
  minAssistantMessages: number;
  /** Exclude conversations with certain intents */
  excludeIntents?: string[];
  /** Only include conversations with certain intents */
  includeIntents?: string[];
  /** Exclude conversations with negative sentiment */
  excludeNegativeSentiment?: boolean;
  /** Only include high-scoring leads */
  minLeadScore?: number;
  /** Only include successful outcomes */
  requireSuccessfulOutcome?: boolean;
}

/**
 * Export configuration
 */
export const FineTuningExportConfigSchema = z.object({
  /** Output format */
  format: z.enum(['openai', 'anthropic', 'custom']).default('openai'),
  /** System prompt to prepend to all conversations */
  systemPrompt: z.string().optional(),
  /** Enable PII redaction */
  redactPII: z.boolean().default(true),
  /** PII patterns to redact */
  piiPatterns: z
    .array(
      z.object({
        name: z.string(),
        pattern: z.string(),
        replacement: z.string(),
      })
    )
    .default([]),
  /** Quality filtering criteria */
  qualityCriteria: z
    .object({
      minMessages: z.number().int().min(1).default(4),
      maxMessages: z.number().int().min(1).default(50),
      minUserMessages: z.number().int().min(1).default(2),
      minAssistantMessages: z.number().int().min(1).default(2),
      excludeIntents: z.array(z.string()).optional(),
      includeIntents: z.array(z.string()).optional(),
      excludeNegativeSentiment: z.boolean().default(false),
      minLeadScore: z.number().int().min(1).max(5).optional(),
      requireSuccessfulOutcome: z.boolean().default(false),
    })
    .default({}),
  /** Maximum examples to export */
  maxExamples: z.number().int().min(1).max(100000).default(10000),
  /** Batch size for database queries */
  batchSize: z.number().int().min(10).max(1000).default(100),
  /** Include metadata in export */
  includeMetadata: z.boolean().default(false),
  /** Shuffle examples for training */
  shuffleExamples: z.boolean().default(true),
  /** Train/validation split ratio */
  validationSplit: z.number().min(0).max(0.5).default(0.1),
});

export type FineTuningExportConfig = z.infer<typeof FineTuningExportConfigSchema>;

/**
 * Default PII patterns for redaction
 */
export const DEFAULT_PII_PATTERNS = [
  { name: 'phone', pattern: '\\+?\\d{10,15}', replacement: '[PHONE]' },
  {
    name: 'email',
    pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
    replacement: '[EMAIL]',
  },
  { name: 'cnp', pattern: '\\b[1-8]\\d{12}\\b', replacement: '[CNP]' }, // Romanian CNP
  { name: 'iban', pattern: '\\b[A-Z]{2}\\d{2}[A-Z0-9]{4,30}\\b', replacement: '[IBAN]' },
  {
    name: 'creditCard',
    pattern: '\\b\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}\\b',
    replacement: '[CARD]',
  },
  { name: 'date', pattern: '\\b\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4}\\b', replacement: '[DATE]' },
  {
    name: 'address',
    pattern: '\\b(str\\.|strada|bd\\.|bulevardul|nr\\.)\\s*[^,\\n]+',
    replacement: '[ADDRESS]',
  },
];

/**
 * Default system prompt for dental clinic fine-tuning
 */
export const DEFAULT_SYSTEM_PROMPT = `You are a helpful dental clinic assistant specializing in implant procedures, particularly All-on-X treatments. Your role is to:

1. Answer patient questions about dental implant procedures
2. Provide accurate information about treatment options and timelines
3. Help schedule consultations and appointments
4. Address concerns with empathy and professionalism
5. Collect relevant information for lead qualification

Always be professional, empathetic, and informative. Direct patients to schedule a consultation for specific pricing and personalized treatment plans.`;

/**
 * Fine-Tuning Export Service
 */
export class FineTuningExportService {
  private pool: Pool;
  private config: FineTuningExportConfig;
  private piiRegexes: { name: string; regex: RegExp; replacement: string }[];

  constructor(pool: Pool, config: Partial<FineTuningExportConfig> = {}) {
    this.pool = pool;
    this.config = FineTuningExportConfigSchema.parse(config);

    // Compile PII regex patterns
    const patterns =
      this.config.piiPatterns.length > 0 ? this.config.piiPatterns : DEFAULT_PII_PATTERNS;

    this.piiRegexes = patterns.map((p) => ({
      name: p.name,
      regex: new RegExp(p.pattern, 'gi'),
      replacement: p.replacement,
    }));
  }

  /**
   * Export conversations for fine-tuning
   */
  async exportConversations(
    options: {
      clinicId?: string;
      startDate?: Date;
      endDate?: Date;
      language?: string;
    } = {}
  ): Promise<{
    examples: FineTuningExample[];
    stats: ExportStats;
  }> {
    const startTime = Date.now();

    // Fetch conversations from database
    const conversations = await this.fetchConversations(options);

    // Filter by quality criteria
    const filtered = this.filterConversations(conversations);

    // Format for fine-tuning
    let examples = this.formatExamples(filtered);

    // Shuffle if enabled
    if (this.config.shuffleExamples) {
      examples = this.shuffleArray(examples);
    }

    // Limit to max examples
    examples = examples.slice(0, this.config.maxExamples);

    // Calculate stats
    const totalMessages = examples.reduce((sum, ex) => sum + ex.messages.length, 0);
    const stats: ExportStats = {
      totalConversations: examples.length,
      totalMessages,
      filteredOut: conversations.length - filtered.length,
      avgConversationLength: examples.length > 0 ? totalMessages / examples.length : 0,
      exportDurationMs: Date.now() - startTime,
    };

    return { examples, stats };
  }

  /**
   * Export to JSONL file format (OpenAI compatible)
   */
  async exportToJSONL(
    options: {
      clinicId?: string;
      startDate?: Date;
      endDate?: Date;
      language?: string;
    } = {}
  ): Promise<{
    training: string;
    validation: string;
    stats: ExportStats;
  }> {
    const { examples, stats } = await this.exportConversations(options);

    // Split into training and validation sets
    const validationSize = Math.floor(examples.length * this.config.validationSplit);
    const validationExamples = examples.slice(0, validationSize);
    const trainingExamples = examples.slice(validationSize);

    // Convert to JSONL format
    const training = trainingExamples.map((ex) => JSON.stringify(ex)).join('\n');
    const validation = validationExamples.map((ex) => JSON.stringify(ex)).join('\n');

    // Update stats with file sizes
    stats.fileSizeBytes = training.length + validation.length;

    return { training, validation, stats };
  }

  /**
   * Export in Anthropic format
   */
  async exportForAnthropic(
    options: {
      clinicId?: string;
      startDate?: Date;
      endDate?: Date;
      language?: string;
    } = {}
  ): Promise<{
    examples: { human: string; assistant: string }[];
    stats: ExportStats;
  }> {
    const { examples, stats } = await this.exportConversations(options);

    // Convert to Anthropic format (Human/Assistant pairs)
    const anthropicExamples: { human: string; assistant: string }[] = [];

    for (const example of examples) {
      const messages = example.messages.filter((m) => m.role !== 'system');

      for (let i = 0; i < messages.length - 1; i += 2) {
        if (messages[i]?.role === 'user' && messages[i + 1]?.role === 'assistant') {
          anthropicExamples.push({
            human: messages[i]!.content,
            assistant: messages[i + 1]!.content,
          });
        }
      }
    }

    return { examples: anthropicExamples, stats };
  }

  /**
   * Fetch conversations from database
   */
  private async fetchConversations(filters: {
    clinicId?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    language?: string | undefined;
  }): Promise<
    {
      phone: string;
      messages: {
        role: 'user' | 'assistant';
        content: string;
        intent?: string;
        sentiment?: string;
        timestamp: Date;
      }[];
      metadata: {
        leadScore?: number;
        outcome?: string;
        language?: string;
      };
    }[]
  > {
    let query = `
      SELECT
        phone,
        direction,
        content_sanitized as content,
        intent,
        sentiment,
        message_timestamp as timestamp,
        metadata
      FROM message_embeddings
      WHERE 1=1
    `;
    const params: (string | Date)[] = [];
    let paramIndex = 1;

    if (filters.clinicId) {
      query += ` AND clinic_id = $${paramIndex}`;
      params.push(filters.clinicId);
      paramIndex++;
    }

    if (filters.startDate) {
      query += ` AND message_timestamp >= $${paramIndex}`;
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters.endDate) {
      query += ` AND message_timestamp <= $${paramIndex}`;
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters.language) {
      query += ` AND language = $${paramIndex}`;
      params.push(filters.language);
      paramIndex++;
    }

    query += ' ORDER BY phone, message_timestamp';

    interface ConversationRow {
      phone: string;
      direction: 'IN' | 'OUT';
      content: string;
      intent?: string;
      sentiment?: string;
      timestamp: Date;
      metadata?: Record<string, unknown>;
    }

    const result = await this.pool.query<ConversationRow>(query, params);

    // Group by phone (conversation)
    const conversationMap = new Map<
      string,
      {
        phone: string;
        messages: {
          role: 'user' | 'assistant';
          content: string;
          intent?: string;
          sentiment?: string;
          timestamp: Date;
        }[];
        metadata: {
          leadScore?: number;
          outcome?: string;
          language?: string;
        };
      }
    >();

    for (const row of result.rows) {
      const phone = row.phone;
      if (!conversationMap.has(phone)) {
        conversationMap.set(phone, {
          phone,
          messages: [],
          metadata: (row.metadata ?? {}) as {
            leadScore?: number;
            outcome?: string;
            language?: string;
          },
        });
      }

      const conv = conversationMap.get(phone);
      if (conv) {
        conv.messages.push({
          role: row.direction === 'IN' ? 'user' : 'assistant',
          content: row.content,
          intent: row.intent,
          sentiment: row.sentiment,
          timestamp: row.timestamp,
        });
      }
    }

    return Array.from(conversationMap.values());
  }

  /**
   * Filter conversations by quality criteria
   */
  private filterConversations(
    conversations: {
      phone: string;
      messages: {
        role: 'user' | 'assistant';
        content: string;
        intent?: string;
        sentiment?: string;
        timestamp: Date;
      }[];
      metadata: {
        leadScore?: number;
        outcome?: string;
        language?: string;
      };
    }[]
  ): typeof conversations {
    const criteria = this.config.qualityCriteria;

    return conversations.filter((conv) => {
      // Check message count
      if (conv.messages.length < criteria.minMessages) return false;
      if (conv.messages.length > criteria.maxMessages) return false;

      // Check user/assistant message counts
      const userMessages = conv.messages.filter((m) => m.role === 'user');
      const assistantMessages = conv.messages.filter((m) => m.role === 'assistant');

      if (userMessages.length < criteria.minUserMessages) return false;
      if (assistantMessages.length < criteria.minAssistantMessages) return false;

      // Check intents
      if (criteria.excludeIntents && criteria.excludeIntents.length > 0) {
        const hasExcludedIntent = conv.messages.some(
          (m) => m.intent && criteria.excludeIntents!.includes(m.intent)
        );
        if (hasExcludedIntent) return false;
      }

      if (criteria.includeIntents && criteria.includeIntents.length > 0) {
        const hasIncludedIntent = conv.messages.some(
          (m) => m.intent && criteria.includeIntents!.includes(m.intent)
        );
        if (!hasIncludedIntent) return false;
      }

      // Check sentiment
      if (criteria.excludeNegativeSentiment) {
        const hasNegative = conv.messages.some((m) => m.sentiment === 'negative');
        if (hasNegative) return false;
      }

      // Check lead score
      if (criteria.minLeadScore && conv.metadata.leadScore !== undefined) {
        if (conv.metadata.leadScore < criteria.minLeadScore) return false;
      }

      // Check successful outcome
      if (criteria.requireSuccessfulOutcome) {
        const successfulOutcomes = ['booked', 'converted', 'scheduled', 'paid'];
        if (!conv.metadata.outcome || !successfulOutcomes.includes(conv.metadata.outcome)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Format conversations as fine-tuning examples
   */
  private formatExamples(
    conversations: {
      phone: string;
      messages: {
        role: 'user' | 'assistant';
        content: string;
        intent?: string;
        sentiment?: string;
        timestamp: Date;
      }[];
      metadata: Record<string, unknown>;
    }[]
  ): FineTuningExample[] {
    const examples: FineTuningExample[] = [];
    const systemPrompt = this.config.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

    for (const conv of conversations) {
      const messages: ExportMessage[] = [];

      // Add system prompt
      messages.push({
        role: 'system',
        content: systemPrompt,
      });

      // Add conversation messages
      for (const msg of conv.messages) {
        let content = msg.content;

        // Redact PII if enabled
        if (this.config.redactPII) {
          content = this.redactPII(content);
        }

        messages.push({
          role: msg.role,
          content,
        });
      }

      examples.push({ messages });
    }

    return examples;
  }

  /**
   * Redact PII from text
   */
  private redactPII(text: string): string {
    let result = text;

    for (const { regex, replacement } of this.piiRegexes) {
      result = result.replace(regex, replacement);
    }

    return result;
  }

  /**
   * Shuffle array (Fisher-Yates)
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    return shuffled;
  }

  /**
   * Create data augmentation variations
   */
  createAugmentations(
    examples: FineTuningExample[],
    _options: {
      paraphrase?: boolean;
      translateLanguages?: string[];
      addNoise?: boolean;
    } = {}
  ): FineTuningExample[] {
    // For now, return original examples
    // In production, this would integrate with translation/paraphrase APIs
    console.warn('[FineTuningExport] Augmentation not implemented, returning original examples');
    return examples;
  }

  /**
   * Validate exported data quality
   */
  validateExamples(examples: FineTuningExample[]): {
    valid: boolean;
    issues: string[];
    warnings: string[];
  } {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check minimum examples
    if (examples.length < 10) {
      issues.push(`Too few examples: ${examples.length} (minimum 10 recommended)`);
    } else if (examples.length < 100) {
      warnings.push(`Low example count: ${examples.length} (100+ recommended for best results)`);
    }

    // Check for empty messages
    const emptyMessages = examples.filter((ex) =>
      ex.messages.some((m) => !m.content || m.content.trim().length === 0)
    );
    if (emptyMessages.length > 0) {
      issues.push(`${emptyMessages.length} examples have empty messages`);
    }

    // Check message sequence
    const badSequence = examples.filter((ex) => {
      const nonSystem = ex.messages.filter((m) => m.role !== 'system');
      for (let i = 0; i < nonSystem.length - 1; i++) {
        if (nonSystem[i]?.role === nonSystem[i + 1]?.role) {
          return true;
        }
      }
      return false;
    });
    if (badSequence.length > 0) {
      warnings.push(`${badSequence.length} examples have consecutive same-role messages`);
    }

    // Check average length
    const totalLength = examples.reduce(
      (sum, ex) => sum + ex.messages.reduce((msum, m) => msum + m.content.length, 0),
      0
    );
    const avgLength = totalLength / examples.length;
    if (avgLength < 100) {
      warnings.push(`Low average message length: ${avgLength.toFixed(0)} chars`);
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Get export checksum for version tracking
   */
  getExportChecksum(examples: FineTuningExample[]): string {
    const data = JSON.stringify(examples);
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Get configuration
   */
  getConfig(): FineTuningExportConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<FineTuningExportConfig>): void {
    this.config = FineTuningExportConfigSchema.parse({ ...this.config, ...updates });
  }
}

/**
 * Factory function
 */
export function createFineTuningExportService(
  pool: Pool,
  config?: Partial<FineTuningExportConfig>
): FineTuningExportService {
  return new FineTuningExportService(pool, config);
}
