/**
 * Vapi Voice Provider Adapter
 *
 * Implements the IVoiceProvider interface for Vapi.ai.
 * Provides AI-powered voice calls with transcript analysis.
 */

import { z } from 'zod';
import type {
  IVoiceProvider,
  ICall,
  IOutboundCallOptions,
  ICallTranscript,
  ITranscriptMessage,
  ITranscriptAnalysis,
  ICallSummary,
  IHealthCheckResult,
  IWebhookVerification,
  IVoiceWebhookPayload,
  IPaginationParams,
  IPaginatedResponse,
  CallStatus,
  CommunicationDirection,
  Sentiment,
  UrgencyLevel,
} from '@medicalcor/types';
import { withRetry, ExternalServiceError } from '@medicalcor/core';

export interface VapiAdapterConfig {
  apiKey: string;
  assistantId?: string | undefined;
  phoneNumberId?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  retryConfig?:
    | {
        maxRetries: number;
        baseDelayMs: number;
      }
    | undefined;
}

// Webhook validation schemas
const VapiMessageSchema = z.object({
  role: z.enum(['assistant', 'user', 'system', 'function_call']),
  message: z.string(),
  timestamp: z.number(),
  duration: z.number().optional(),
});

const VapiCallSchema = z.object({
  id: z.string(),
  orgId: z.string(),
  assistantId: z.string(),
  status: z.enum(['queued', 'ringing', 'in-progress', 'forwarding', 'ended']),
  type: z.enum(['inbound', 'outbound']),
  phoneNumber: z.object({ id: z.string(), number: z.string() }).optional(),
  customer: z.object({ number: z.string(), name: z.string().optional() }).optional(),
  startedAt: z.string().optional(),
  endedAt: z.string().optional(),
  endedReason: z.string().optional(),
  cost: z.number().optional(),
});

const VapiTranscriptSchema = z.object({
  callId: z.string(),
  messages: z.array(VapiMessageSchema),
  duration: z.number(),
  startedAt: z.string(),
  endedAt: z.string(),
});

const VapiWebhookPayloadSchema = z.union([
  z.object({ type: z.literal('call.started'), call: VapiCallSchema }),
  z.object({ type: z.literal('call.ended'), call: VapiCallSchema }),
  z.object({ type: z.literal('transcript.updated'), transcript: VapiTranscriptSchema }),
]);

/**
 * Vapi implementation of the universal Voice Provider interface
 */
export class VapiAdapter implements IVoiceProvider {
  readonly providerName = 'vapi' as const;
  private config: VapiAdapterConfig;
  private baseUrl: string;

  // Dental procedure keywords (Romanian)
  private readonly PROCEDURE_KEYWORDS = [
    'implant',
    'implanturi',
    'all-on-4',
    'all-on-6',
    'fatete',
    'coroane',
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
    'carie',
    'plomba',
    'canal',
    'tratament canal',
    'parodontoza',
    'gingivita',
  ];

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

  // Transcript buffer for real-time processing
  private transcriptBuffer = new Map<
    string,
    { messages: { role: string; message: string; timestamp: number }[]; createdAt: number }
  >();
  private static readonly MAX_MESSAGES_PER_CALL = 1000;
  private static readonly MAX_TRACKED_CALLS = 100;

  constructor(config: VapiAdapterConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl ?? 'https://api.vapi.ai';
  }

  // ===========================================================================
  // Health Check
  // ===========================================================================

  async healthCheck(): Promise<IHealthCheckResult> {
    const startTime = Date.now();
    try {
      // List calls to verify API key
      await this.request<unknown[]>('/call?limit=1');
      return {
        healthy: true,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        timestamp: new Date(),
      };
    } catch (error) {
      return {
        healthy: false,
        provider: this.providerName,
        latencyMs: Date.now() - startTime,
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date(),
      };
    }
  }

  // ===========================================================================
  // Call Operations
  // ===========================================================================

  async makeOutboundCall(options: IOutboundCallOptions): Promise<ICall> {
    const response = await this.request<{
      id: string;
      orgId: string;
      assistantId: string;
      status: string;
      type: string;
      phoneNumber?: { id: string; number: string };
      customer?: { number: string; name?: string };
      startedAt?: string;
      cost?: number;
    }>('/call', {
      method: 'POST',
      body: JSON.stringify({
        assistantId: options.assistantId ?? this.config.assistantId,
        phoneNumberId: this.config.phoneNumberId,
        customer: {
          number: options.phoneNumber,
          name: options.name,
        },
        metadata: options.metadata,
      }),
    });

    return this.mapVapiCall(response);
  }

  async getCall(callId: string): Promise<ICall> {
    const response = await this.request<{
      id: string;
      orgId: string;
      assistantId: string;
      status: string;
      type: string;
      phoneNumber?: { id: string; number: string };
      customer?: { number: string; name?: string };
      startedAt?: string;
      endedAt?: string;
      endedReason?: string;
      cost?: number;
    }>(`/call/${callId}`);

    return this.mapVapiCall(response);
  }

  async listCalls(options?: {
    direction?: CommunicationDirection;
    status?: CallStatus;
    startDate?: Date;
    endDate?: Date;
    pagination?: IPaginationParams;
  }): Promise<IPaginatedResponse<ICall>> {
    const params = new URLSearchParams();
    if (options?.pagination?.limit) params.append('limit', options.pagination.limit.toString());
    if (options?.startDate) params.append('createdAtGte', options.startDate.toISOString());
    if (options?.endDate) params.append('createdAtLte', options.endDate.toISOString());

    const url = `/call${params.toString() ? `?${params.toString()}` : ''}`;
    const response = await this.request<
      {
        id: string;
        orgId: string;
        assistantId: string;
        status: string;
        type: string;
        phoneNumber?: { id: string; number: string };
        customer?: { number: string; name?: string };
        startedAt?: string;
        endedAt?: string;
        endedReason?: string;
        cost?: number;
      }[]
    >(url);

    let calls = response.map((c) => this.mapVapiCall(c));

    // Apply client-side filters
    if (options?.direction) {
      calls = calls.filter((c) => c.direction === options.direction);
    }
    if (options?.status) {
      calls = calls.filter((c) => c.status === options.status);
    }

    return {
      items: calls,
      hasMore: false, // Vapi doesn't support pagination cursors
    };
  }

  async endCall(callId: string): Promise<void> {
    await this.request<undefined>(`/call/${callId}`, { method: 'DELETE' });
  }

  async getTranscript(callId: string): Promise<ICallTranscript> {
    const response = await this.request<{
      callId: string;
      messages: { role: string; message: string; timestamp: number; duration?: number }[];
      duration: number;
      startedAt: string;
      endedAt: string;
    }>(`/call/${callId}/transcript`);

    return {
      callId: response.callId,
      messages: response.messages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system',
        message: m.message,
        timestamp: m.timestamp,
        duration: m.duration,
      })),
      duration: response.duration,
      startedAt: new Date(response.startedAt),
      endedAt: new Date(response.endedAt),
      fullText: response.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => `${m.role === 'user' ? 'Patient' : 'Assistant'}: ${m.message}`)
        .join('\n'),
    };
  }

  // ===========================================================================
  // Transcript Analysis
  // ===========================================================================

  analyzeTranscript(transcript: ICallTranscript): ITranscriptAnalysis {
    const customerMessages = transcript.messages
      .filter((m: ITranscriptMessage) => m.role === 'user')
      .map((m: ITranscriptMessage) => m.message);

    const assistantMessages = transcript.messages
      .filter((m: ITranscriptMessage) => m.role === 'assistant')
      .map((m: ITranscriptMessage) => m.message);

    const fullTranscript = transcript.messages
      .map((m: ITranscriptMessage) => `${m.role.toUpperCase()}: ${m.message}`)
      .join('\n');

    const allText = fullTranscript.toLowerCase();

    // Find procedure mentions
    const procedureMentions = this.PROCEDURE_KEYWORDS.filter((kw) =>
      allText.includes(kw.toLowerCase())
    );

    // Extract questions
    const questions = customerMessages.filter(
      (msg: string) => msg.includes('?') || /^(cum|cand|cat|de ce|unde|care|ce|cine)/i.test(msg)
    );

    // Detect urgency
    const urgencyCount = this.URGENCY_KEYWORDS.filter((kw) =>
      allText.includes(kw.toLowerCase())
    ).length;

    let urgencyLevel: UrgencyLevel = 'low';
    if (urgencyCount >= 3) urgencyLevel = 'critical';
    else if (urgencyCount === 2) urgencyLevel = 'high';
    else if (urgencyCount === 1) urgencyLevel = 'medium';

    // Detect sentiment
    const positiveWords = ['multumesc', 'perfect', 'bine', 'excelent', 'super'];
    const negativeWords = ['nu', 'problema', 'nemultumit', 'dezamagit', 'rau'];
    const positiveCount = positiveWords.filter((w) => allText.includes(w)).length;
    const negativeCount = negativeWords.filter((w) => allText.includes(w)).length;

    let sentiment: Sentiment = 'neutral';
    if (positiveCount > negativeCount + 1) sentiment = 'positive';
    if (negativeCount > positiveCount + 1) sentiment = 'negative';

    // Calculate speaking ratio
    const totalMessages = customerMessages.length + assistantMessages.length;
    const customerRatio = totalMessages > 0 ? customerMessages.length / totalMessages : 0.5;

    // Extract keywords
    const importantTerms = [
      'pret',
      'cost',
      'programare',
      'tratament',
      'asigurare',
      'rate',
      'garantie',
    ];
    const keywords = importantTerms.filter((term) => allText.includes(term));

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
      sentiment,
      urgencyLevel,
    };
  }

  generateCallSummary(transcript: ICallTranscript): ICallSummary {
    const analysis = this.analyzeTranscript(transcript);

    // Extract action items
    const actionItems = analysis.assistantMessages
      .filter((msg: string) => /vom|veti|trebuie|programare|contact|sun|trimitem/i.test(msg))
      .slice(0, 3);

    // Build topics
    const topics = [...new Set([...analysis.procedureMentions, ...analysis.keywords])].slice(0, 5);

    // Build summary
    const summaryParts: string[] = [];
    if (analysis.procedureMentions.length > 0) {
      summaryParts.push(`Patient interested in: ${analysis.procedureMentions.join(', ')}`);
    }
    if (analysis.questions.length > 0) {
      summaryParts.push(`Asked ${analysis.questions.length} questions`);
    }
    summaryParts.push(`Call duration: ${Math.round(analysis.durationSeconds / 60)} minutes`);

    return {
      callId: transcript.callId,
      summary: summaryParts.join('. '),
      topics,
      sentiment: analysis.sentiment ?? 'neutral',
      keyPhrases: analysis.keywords.slice(0, 10),
      actionItems,
      procedureInterest: analysis.procedureMentions,
      urgencyLevel: analysis.urgencyLevel ?? 'low',
    };
  }

  // ===========================================================================
  // Webhook Operations
  // ===========================================================================

  verifyWebhook(_payload: string, _signature: string): IWebhookVerification {
    // Vapi doesn't use signature verification by default
    // Custom implementation can be added if webhook secrets are configured
    return { valid: true };
  }

  parseWebhookPayload(payload: unknown): IVoiceWebhookPayload | null {
    const parseResult = VapiWebhookPayloadSchema.safeParse(payload);
    if (!parseResult.success) return null;

    const data = parseResult.data;

    if (data.type === 'transcript.updated') {
      const transcript = data.transcript;
      return {
        eventType: 'transcript.updated',
        eventId: `${transcript.callId}-${Date.now()}`,
        call: {
          id: transcript.callId,
          direction: 'inbound',
          status: 'in-progress',
          customerPhone: '',
        },
        transcript: {
          callId: transcript.callId,
          messages: transcript.messages.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            message: m.message,
            timestamp: m.timestamp,
            duration: m.duration,
          })),
          duration: transcript.duration,
          startedAt: new Date(transcript.startedAt),
          endedAt: new Date(transcript.endedAt),
        },
        rawPayload: payload,
        timestamp: new Date(),
      };
    }

    const call = data.call;
    const eventType = data.type === 'call.started' ? 'call.started' : 'call.completed';

    return {
      eventType,
      eventId: `${call.id}-${Date.now()}`,
      call: this.mapVapiCall(call),
      rawPayload: payload,
      timestamp: new Date(),
    };
  }

  formatTranscriptForCRM(transcript: ICallTranscript): string {
    const lines: string[] = [
      `Call ID: ${transcript.callId}`,
      `Duration: ${Math.round(transcript.duration / 60)} minutes`,
      `Started: ${transcript.startedAt.toISOString()}`,
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

  // ===========================================================================
  // Transcript Buffer (for real-time processing)
  // ===========================================================================

  bufferTranscriptMessage(
    callId: string,
    message: { role: string; message: string; timestamp: number }
  ): void {
    if (
      !this.transcriptBuffer.has(callId) &&
      this.transcriptBuffer.size >= VapiAdapter.MAX_TRACKED_CALLS
    ) {
      const oldestKey = this.transcriptBuffer.keys().next().value;
      if (oldestKey) this.transcriptBuffer.delete(oldestKey);
    }

    const existing = this.transcriptBuffer.get(callId);
    if (existing) {
      if (existing.messages.length >= VapiAdapter.MAX_MESSAGES_PER_CALL) {
        existing.messages = existing.messages.slice(
          -Math.floor(VapiAdapter.MAX_MESSAGES_PER_CALL * 0.8)
        );
      }
      existing.messages.push(message);
    } else {
      this.transcriptBuffer.set(callId, { messages: [message], createdAt: Date.now() });
    }
  }

  getBufferedTranscript(callId: string): { role: string; message: string; timestamp: number }[] {
    return this.transcriptBuffer.get(callId)?.messages ?? [];
  }

  clearTranscriptBuffer(callId: string): void {
    this.transcriptBuffer.delete(callId);
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutMs = this.config.timeoutMs ?? 30000;

    const makeRequest = async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            ...(options.headers as Record<string, string> | undefined),
          },
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new ExternalServiceError('Vapi', `Request failed with status ${response.status}`);
        }

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
    };

    return withRetry(makeRequest, {
      maxRetries: this.config.retryConfig?.maxRetries ?? 3,
      baseDelayMs: this.config.retryConfig?.baseDelayMs ?? 1000,
      shouldRetry: (error) => {
        if (error instanceof Error) {
          if (error.message.includes('rate_limit')) return true;
          if (error.message.includes('502')) return true;
          if (error.message.includes('503')) return true;
          if (error.message.includes('timeout')) return true;
        }
        return false;
      },
    });
  }

  private mapVapiCall(call: {
    id: string;
    status: string;
    type: string;
    phoneNumber?: { id: string; number: string } | undefined;
    customer?: { number: string; name?: string | undefined } | undefined;
    startedAt?: string | undefined;
    endedAt?: string | undefined;
    endedReason?: string | undefined;
    cost?: number | undefined;
  }): ICall {
    return {
      id: call.id,
      providerCallId: call.id,
      direction: call.type as CommunicationDirection,
      status: this.mapVapiStatus(call.status),
      customerPhone: call.customer?.number ?? '',
      customerName: call.customer?.name,
      systemPhone: call.phoneNumber?.number,
      startedAt: call.startedAt ? new Date(call.startedAt) : undefined,
      endedAt: call.endedAt ? new Date(call.endedAt) : undefined,
      endedReason: call.endedReason as ICall['endedReason'],
      cost: call.cost,
    };
  }

  private mapVapiStatus(status: string): CallStatus {
    switch (status) {
      case 'queued':
        return 'queued';
      case 'ringing':
        return 'ringing';
      case 'in-progress':
        return 'in-progress';
      case 'ended':
        return 'completed';
      default:
        return 'queued';
    }
  }
}

/**
 * Create Vapi adapter
 */
export function createVapiAdapter(config: VapiAdapterConfig): IVoiceProvider {
  return new VapiAdapter(config);
}
