import { z } from 'zod';
import { withRetry, ExternalServiceError } from '@medicalcor/core';

/**
 * Vapi.ai Voice AI Integration Client
 * Handles voice transcription, call management, and AI assistant interactions
 */

// =============================================================================
// Types and Schemas
// =============================================================================

export interface VapiClientConfig {
  apiKey: string;
  assistantId?: string | undefined;
  phoneNumberId?: string | undefined;
  baseUrl?: string | undefined;
  /**
   * Request timeout in milliseconds
   * CRITICAL FIX: Default 30000ms (30s) to prevent hanging requests
   */
  timeoutMs?: number | undefined;
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}

export const VapiCallStatusSchema = z.enum([
  'queued',
  'ringing',
  'in-progress',
  'forwarding',
  'ended',
]);

export type VapiCallStatus = z.infer<typeof VapiCallStatusSchema>;

export const VapiEndedReasonSchema = z.enum([
  'assistant-ended-call',
  'customer-ended-call',
  'call-timeout',
  'assistant-error',
  'customer-did-not-answer',
  'voicemail',
  'silence-timeout',
  'pipeline-error',
]);

export type VapiEndedReason = z.infer<typeof VapiEndedReasonSchema>;

// Zod schemas for webhook validation
export const VapiMessageSchema = z.object({
  role: z.enum(['assistant', 'user', 'system', 'function_call']),
  message: z.string(),
  timestamp: z.number(),
  duration: z.number().optional(),
  name: z.string().optional(),
  arguments: z.string().optional(),
});

export const VapiCallSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  assistantId: z.string(),
  status: VapiCallStatusSchema,
  type: z.enum(['inbound', 'outbound']),
  phoneNumber: z
    .object({
      id: z.string(),
      number: z.string(),
    })
    .optional(),
  customer: z
    .object({
      number: z.string(),
      name: z.string().optional(),
    })
    .optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  endedReason: VapiEndedReasonSchema.optional(),
  cost: z.number().optional(),
});

export const VapiTranscriptSchema = z.object({
  callId: z.string(),
  messages: z.array(VapiMessageSchema),
  duration: z.number(),
  startedAt: z.string(),
  endedAt: z.string(),
});

// Webhook payload schemas
export const VapiWebhookPayloadSchema = z.union([
  z.object({
    type: z.literal('call.started'),
    call: VapiCallSchema,
  }),
  z.object({
    type: z.literal('call.ended'),
    call: VapiCallSchema,
  }),
  z.object({
    type: z.literal('transcript.updated'),
    transcript: VapiTranscriptSchema,
  }),
  z.object({
    type: z.literal('function.call'),
    message: VapiMessageSchema,
  }),
]);

export interface VapiCall {
  id: string;
  orgId: string;
  assistantId: string;
  status: VapiCallStatus;
  type: 'inbound' | 'outbound';
  phoneNumber?: {
    id: string;
    number: string;
  };
  customer?: {
    number: string;
    name?: string;
  };
  startedAt?: string;
  endedAt?: string;
  endedReason?: VapiEndedReason;
  cost?: number;
}

export interface VapiTranscript {
  callId: string;
  messages: VapiMessage[];
  duration: number;
  startedAt: string;
  endedAt: string;
}

export interface VapiMessage {
  role: 'assistant' | 'user' | 'system' | 'function_call';
  message: string;
  timestamp: number;
  duration?: number;
  name?: string; // For function calls
  arguments?: string; // For function calls
}

export interface VapiCallSummary {
  callId: string;
  summary: string;
  topics: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  keyPhrases: string[];
  actionItems: string[];
  procedureInterest: string[];
  urgencyLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface TranscriptAnalysis {
  fullTranscript: string;
  customerMessages: string[];
  assistantMessages: string[];
  wordCount: number;
  durationSeconds: number;
  speakingRatio: {
    customer: number;
    assistant: number;
  };
  keywords: string[];
  procedureMentions: string[];
  questions: string[];
}

export interface CreateOutboundCallInput {
  phoneNumber: string;
  assistantId?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface GetCallInput {
  callId: string;
}

export interface ListCallsInput {
  assistantId?: string;
  limit?: number;
  createdAtGte?: string;
  createdAtLte?: string;
}

// =============================================================================
// Vapi Client Implementation
// =============================================================================

export class VapiClient {
  private config: VapiClientConfig;
  private baseUrl: string;

  // Procedure keywords for dental clinic
  private readonly PROCEDURE_KEYWORDS = [
    'implant',
    'implanturi',
    'all-on-4',
    'all-on-6',
    'all on 4',
    'all on 6',
    'fatete',
    'coroane',
    'punti',
    'extractie',
    'albire',
    'detartraj',
    'ortodontie',
    'aparat dentar',
    'invisalign',
    'proteza',
    'consultatie',
    'radiografie',
    'ct dentar',
    'panoramica',
    'carie',
    'plomba',
    'canal',
    'tratament canal',
    'endodontie',
    'parodontoza',
    'gingivita',
    'periaj',
  ];

  // Urgency indicators
  private readonly URGENCY_KEYWORDS = [
    'urgent',
    'durere',
    'doare',
    'sangereaza',
    'umflat',
    'inflamat',
    'nu pot manca',
    'nu pot dormi',
    'problema',
    'urgenta',
    'cat mai repede',
    'azi',
    'maine',
    'imediat',
  ];

  constructor(config: VapiClientConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://api.vapi.ai';
  }

  /**
   * CRITICAL FIX: Make HTTP request with timeout
   * Prevents requests from hanging indefinitely
   */
  private async requestWithTimeout<T>(url: string, options: RequestInit = {}): Promise<T> {
    const timeoutMs = this.config.timeoutMs ?? 30000; // Default 30 second timeout

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.getHeaders(),
          ...(options.headers as Record<string, string> | undefined),
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error('[Vapi] API error:', {
          status: response.status,
          url,
          errorBody,
        });
        throw new ExternalServiceError('Vapi', `Request failed with status ${response.status}`);
      }

      // Handle empty responses (e.g., DELETE)
      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ExternalServiceError('Vapi', `Request timeout after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  // =============================================================================
  // API Methods
  // =============================================================================

  /**
   * Create an outbound call
   * CRITICAL FIX: Uses requestWithTimeout to prevent hanging
   */
  async createOutboundCall(input: CreateOutboundCallInput): Promise<VapiCall> {
    const makeRequest = async () => {
      return this.requestWithTimeout<VapiCall>(`${this.baseUrl}/call`, {
        method: 'POST',
        body: JSON.stringify({
          assistantId: input.assistantId ?? this.config.assistantId,
          phoneNumberId: this.config.phoneNumberId,
          customer: {
            number: input.phoneNumber,
            name: input.name,
          },
          metadata: input.metadata,
        }),
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Get call details
   * CRITICAL FIX: Uses requestWithTimeout to prevent hanging
   */
  async getCall(input: GetCallInput): Promise<VapiCall> {
    const makeRequest = async () => {
      return this.requestWithTimeout<VapiCall>(`${this.baseUrl}/call/${input.callId}`, {
        method: 'GET',
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * List calls with optional filters
   * CRITICAL FIX: Uses requestWithTimeout to prevent hanging
   */
  async listCalls(input?: ListCallsInput): Promise<VapiCall[]> {
    const params = new URLSearchParams();
    if (input?.assistantId) params.append('assistantId', input.assistantId);
    if (input?.limit) params.append('limit', String(input.limit));
    if (input?.createdAtGte) params.append('createdAtGte', input.createdAtGte);
    if (input?.createdAtLte) params.append('createdAtLte', input.createdAtLte);

    const makeRequest = async () => {
      const url = `${this.baseUrl}/call${params.toString() ? `?${params.toString()}` : ''}`;
      return this.requestWithTimeout<VapiCall[]>(url, { method: 'GET' });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * Get call transcript
   * CRITICAL FIX: Uses requestWithTimeout to prevent hanging
   */
  async getTranscript(callId: string): Promise<VapiTranscript> {
    const makeRequest = async () => {
      return this.requestWithTimeout<VapiTranscript>(`${this.baseUrl}/call/${callId}/transcript`, {
        method: 'GET',
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  /**
   * End an active call
   * CRITICAL FIX: Uses requestWithTimeout to prevent hanging
   */
  async endCall(callId: string): Promise<void> {
    const makeRequest = async (): Promise<void> => {
      await this.requestWithTimeout<undefined>(`${this.baseUrl}/call/${callId}`, {
        method: 'DELETE',
      });
    };

    return withRetry(makeRequest, this.getRetryConfig());
  }

  // =============================================================================
  // Transcript Analysis Methods
  // =============================================================================

  /**
   * Analyze a transcript for insights
   */
  analyzeTranscript(transcript: VapiTranscript): TranscriptAnalysis {
    const customerMessages = transcript.messages
      .filter((m) => m.role === 'user')
      .map((m) => m.message);

    const assistantMessages = transcript.messages
      .filter((m) => m.role === 'assistant')
      .map((m) => m.message);

    const fullTranscript = transcript.messages
      .map((m) => `${m.role.toUpperCase()}: ${m.message}`)
      .join('\n');

    const allText = fullTranscript.toLowerCase();

    // Extract keywords
    const keywords = this.extractKeywords(allText);

    // Find procedure mentions
    const procedureMentions = this.PROCEDURE_KEYWORDS.filter((kw) =>
      allText.includes(kw.toLowerCase())
    );

    // Extract questions (Romanian question patterns)
    const questions = customerMessages.filter(
      (msg) => msg.includes('?') || /^(cum|cand|cat|de ce|unde|care|ce|cine|al cui)/i.test(msg)
    );

    // Calculate speaking ratio based on message count
    const totalMessages = customerMessages.length + assistantMessages.length;
    const customerRatio = totalMessages > 0 ? customerMessages.length / totalMessages : 0.5;

    return {
      fullTranscript,
      customerMessages,
      assistantMessages,
      wordCount: fullTranscript.split(/\s+/).length,
      durationSeconds: transcript.duration,
      speakingRatio: {
        customer: customerRatio,
        assistant: 1 - customerRatio,
      },
      keywords,
      procedureMentions,
      questions,
    };
  }

  /**
   * Generate call summary from transcript
   */
  generateCallSummary(transcript: VapiTranscript, analysis: TranscriptAnalysis): VapiCallSummary {
    const allText = analysis.fullTranscript.toLowerCase();

    // Detect sentiment based on keywords
    const positiveWords = ['multumesc', 'perfect', 'bine', 'excelent', 'super', 'minunat'];
    const negativeWords = ['nu', 'problema', 'nemultumit', 'dezamagit', 'rau', 'gresit'];

    const positiveCount = positiveWords.filter((w) => allText.includes(w)).length;
    const negativeCount = negativeWords.filter((w) => allText.includes(w)).length;

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (positiveCount > negativeCount + 1) sentiment = 'positive';
    if (negativeCount > positiveCount + 1) sentiment = 'negative';

    // Detect urgency level
    const urgencyCount = this.URGENCY_KEYWORDS.filter((kw) =>
      allText.includes(kw.toLowerCase())
    ).length;

    let urgencyLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    if (urgencyCount >= 3) urgencyLevel = 'critical';
    else if (urgencyCount === 2) urgencyLevel = 'high';
    else if (urgencyCount === 1) urgencyLevel = 'medium';

    // Extract action items from assistant messages
    const actionItems = analysis.assistantMessages
      .filter((msg) => /vom|veti|trebuie|programare|contact|sun|trimitem/i.test(msg))
      .slice(0, 3);

    // Build summary
    const topics = [...new Set([...analysis.procedureMentions, ...analysis.keywords])].slice(0, 5);

    return {
      callId: transcript.callId,
      summary: this.buildSummaryText(analysis),
      topics,
      sentiment,
      keyPhrases: analysis.keywords.slice(0, 10),
      actionItems,
      procedureInterest: analysis.procedureMentions,
      urgencyLevel,
    };
  }

  /**
   * Parse and validate incoming webhook payload using Zod
   * Returns null if payload is invalid
   * @throws {z.ZodError} if validation fails and throwOnError is true
   */
  parseWebhookPayload(
    payload: unknown,
    options: { throwOnError?: boolean } = {}
  ): {
    type: 'call.started' | 'call.ended' | 'transcript.updated' | 'function.call';
    data: VapiCall | VapiTranscript | VapiMessage;
  } | null {
    const parseResult = VapiWebhookPayloadSchema.safeParse(payload);

    if (!parseResult.success) {
      if (options.throwOnError) {
        throw parseResult.error;
      }
      return null;
    }

    const validated = parseResult.data;

    switch (validated.type) {
      case 'call.started':
      case 'call.ended':
        return {
          type: validated.type,
          data: validated.call as VapiCall,
        };
      case 'transcript.updated':
        return {
          type: 'transcript.updated',
          data: validated.transcript as VapiTranscript,
        };
      case 'function.call':
        return {
          type: 'function.call',
          data: validated.message as VapiMessage,
        };
    }
  }

  // =============================================================================
  // Transcript Buffer for Real-time Processing
  // =============================================================================

  private transcriptBuffer = new Map<string, VapiMessage[]>();

  /**
   * Buffer transcript message for real-time calls
   */
  bufferTranscriptMessage(callId: string, message: VapiMessage): void {
    const existing = this.transcriptBuffer.get(callId) ?? [];
    existing.push(message);
    this.transcriptBuffer.set(callId, existing);
  }

  /**
   * Get buffered transcript for a call
   */
  getBufferedTranscript(callId: string): VapiMessage[] {
    return this.transcriptBuffer.get(callId) ?? [];
  }

  /**
   * Clear transcript buffer for a call
   */
  clearTranscriptBuffer(callId: string): void {
    this.transcriptBuffer.delete(callId);
  }

  /**
   * Convert buffered messages to full transcript string
   */
  getBufferedTranscriptText(callId: string): string {
    const messages = this.getBufferedTranscript(callId);
    return messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.message}`)
      .join('\n');
  }

  // =============================================================================
  // Helper Methods
  // =============================================================================

  private getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private getRetryConfig() {
    return {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error: unknown) => {
        if (error instanceof Error) {
          if (error.message.includes('rate_limit')) return true;
          if (error.message.includes('502')) return true;
          if (error.message.includes('503')) return true;
          if (error.message.includes('timeout')) return true;
        }
        return false;
      },
    };
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - important terms for dental clinic
    const importantTerms = [
      'pret',
      'cost',
      'programare',
      'consultatie',
      'tratament',
      'implant',
      'fateta',
      'coroana',
      'extractie',
      'durere',
      'asigurare',
      'rate',
      'finantare',
      'garantie',
    ];

    return importantTerms.filter((term) => text.includes(term));
  }

  private buildSummaryText(analysis: TranscriptAnalysis): string {
    const parts: string[] = [];

    if (analysis.procedureMentions.length > 0) {
      parts.push(`Patient interested in: ${analysis.procedureMentions.join(', ')}`);
    }

    if (analysis.questions.length > 0) {
      parts.push(`Asked ${analysis.questions.length} questions`);
    }

    parts.push(`Call duration: ${Math.round(analysis.durationSeconds / 60)} minutes`);
    parts.push(`Total word count: ${analysis.wordCount}`);

    return parts.join('. ');
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a configured Vapi client
 */
export function createVapiClient(config: VapiClientConfig): VapiClient {
  return new VapiClient(config);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format transcript for HubSpot timeline
 */
export function formatTranscriptForCRM(transcript: VapiTranscript): string {
  const lines: string[] = [
    `Call ID: ${transcript.callId}`,
    `Duration: ${Math.round(transcript.duration / 60)} minutes`,
    `Started: ${transcript.startedAt}`,
    '',
    '--- Transcript ---',
    '',
  ];

  for (const msg of transcript.messages) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      const speaker = msg.role === 'user' ? 'Patient' : 'AI Assistant';
      lines.push(`[${speaker}]: ${msg.message}`);
    }
  }

  return lines.join('\n');
}

/**
 * Extract lead qualification data from call summary
 */
export function extractLeadQualification(summary: VapiCallSummary): {
  score: number;
  classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  reason: string;
} {
  // Score based on procedure interest, urgency, and sentiment
  let score = 2; // Base score

  // Procedure interest increases score
  if (summary.procedureInterest.length > 0) {
    score += 1;
    if (summary.procedureInterest.some((p) => p.includes('implant') || p.includes('all-on'))) {
      score += 1; // High-value procedures
    }
  }

  // Urgency increases score
  if (summary.urgencyLevel === 'critical') score += 1;
  else if (summary.urgencyLevel === 'high') score += 0.5;

  // Positive sentiment slight boost
  if (summary.sentiment === 'positive') score += 0.5;
  if (summary.sentiment === 'negative') score -= 0.5;

  // Clamp score
  score = Math.min(5, Math.max(1, Math.round(score)));

  // Determine classification
  let classification: 'HOT' | 'WARM' | 'COLD' | 'UNQUALIFIED';
  if (score >= 4) classification = 'HOT';
  else if (score >= 3) classification = 'WARM';
  else if (score >= 2) classification = 'COLD';
  else classification = 'UNQUALIFIED';

  // Build reason
  const reasons: string[] = [];
  if (summary.procedureInterest.length > 0) {
    reasons.push(`Interested in: ${summary.procedureInterest.join(', ')}`);
  }
  if (summary.urgencyLevel !== 'low') {
    reasons.push(`Urgency: ${summary.urgencyLevel}`);
  }
  if (summary.actionItems.length > 0) {
    reasons.push(`${summary.actionItems.length} action items identified`);
  }

  return {
    score,
    classification,
    reason: reasons.join('; ') || 'General inquiry',
  };
}
