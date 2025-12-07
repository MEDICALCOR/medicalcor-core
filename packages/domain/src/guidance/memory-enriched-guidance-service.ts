/**
 * Memory-Enriched Guidance Service
 *
 * Integrates cognitive episodic memory with agent guidance to provide
 * context-aware, personalized coaching suggestions during calls.
 *
 * ADR-004: Wire cognitive memory to agent flows
 */
import { EventEmitter } from 'events';
import type {
  AgentGuidance,
  CreateGuidance,
  UpdateGuidance,
  GuidanceQuery,
  GuidanceSuggestion,
  ScriptStep,
} from '@medicalcor/types';
import {
  createLogger,
  type MemoryRetrievalService,
  type SubjectMemorySummary,
  type EpisodicEvent,
  type BehavioralPattern,
  type SubjectType,
  type SentimentTrend,
  type MemoryContext,
  type KeyEntity,
} from '@medicalcor/core';

import {
  GuidanceService,
  type GuidanceServiceConfig,
  type ScriptCompletionStats,
} from './guidance-service.js';
import type {
  IGuidanceRepository,
  GuidanceRepositoryResult,
  PaginatedGuidance,
  GuidanceForCallSpec,
} from './repositories/GuidanceRepository.js';

const logger = createLogger({ name: 'memory-enriched-guidance' });

// =============================================================================
// Memory Context Types
// =============================================================================

/**
 * Memory context for a call subject (lead/patient)
 */
export interface CallMemoryContext {
  subjectType: SubjectType;
  subjectId: string;
  summary: SubjectMemorySummary | null;
  recentEvents: EpisodicEvent[];
  patterns: BehavioralPattern[];
  sentimentTrend: SentimentTrend;
}

/**
 * Extended call specification with subject identification
 */
export interface MemoryEnrichedCallSpec extends GuidanceForCallSpec {
  /** Subject type for memory retrieval */
  subjectType?: SubjectType;
  /** Subject ID (lead/patient/contact UUID) for memory retrieval */
  subjectId?: string;
  /** Enable memory retrieval (default: true) */
  enableMemory?: boolean;
  /** Maximum recent events to retrieve (default: 10) */
  maxRecentEvents?: number;
  /** Days to look back for recent events (default: 30) */
  recentEventsDays?: number;
}

/**
 * Memory-enriched suggestion with additional context
 */
export interface MemoryEnrichedSuggestion extends GuidanceSuggestion {
  /** Memory-derived context that informed this suggestion */
  memoryContext?: {
    basedOnPattern?: string;
    similarPastInteraction?: string;
    sentimentConsideration?: string;
  };
}

// =============================================================================
// Extended Service Configuration
// =============================================================================

export interface MemoryEnrichedGuidanceConfig extends GuidanceServiceConfig {
  /** Enable memory integration (default: true) */
  enableMemoryIntegration?: boolean;
  /** Default days to retrieve for recent events */
  defaultRecentEventsDays?: number;
  /** Default max recent events */
  defaultMaxRecentEvents?: number;
  /** Minimum pattern confidence for suggestions */
  minPatternConfidenceForSuggestion?: number;
  /** Enable sentiment-aware suggestions */
  enableSentimentAwareness?: boolean;
  /** Enable pattern-based suggestions */
  enablePatternBasedSuggestions?: boolean;
  /** Enable semantic search for relevant history */
  enableSemanticHistory?: boolean;
  /** Max similar interactions to retrieve */
  maxSimilarInteractions?: number;
}

interface ResolvedMemoryConfig {
  enableMemoryIntegration: boolean;
  defaultRecentEventsDays: number;
  defaultMaxRecentEvents: number;
  minPatternConfidenceForSuggestion: number;
  enableSentimentAwareness: boolean;
  enablePatternBasedSuggestions: boolean;
  enableSemanticHistory: boolean;
  maxSimilarInteractions: number;
}

// =============================================================================
// Extended Events
// =============================================================================

export interface MemoryEnrichedGuidanceEvents {
  'guidance:loaded': (callSid: string, guidance: AgentGuidance) => void;
  'guidance:memory-loaded': (callSid: string, context: CallMemoryContext) => void;
  'guidance:step-complete': (callSid: string, stepId: string, nextStepId?: string) => void;
  'guidance:suggestion': (callSid: string, suggestion: MemoryEnrichedSuggestion) => void;
  'guidance:memory-suggestion': (callSid: string, suggestion: MemoryEnrichedSuggestion) => void;
  'guidance:objection-detected': (
    callSid: string,
    objection: string,
    suggestedResponse: string
  ) => void;
  'guidance:script-complete': (
    callSid: string,
    guidanceId: string,
    stats: ScriptCompletionStats
  ) => void;
  'guidance:pattern-detected': (callSid: string, pattern: BehavioralPattern) => void;
}

// =============================================================================
// Extended Call State
// =============================================================================

interface MemoryEnrichedCallState {
  callSid: string;
  subjectType: SubjectType | null;
  subjectId: string | null;
  memoryContext: CallMemoryContext | null;
  memorySuggestions: MemoryEnrichedSuggestion[];
  semanticSearchCache: Map<string, EpisodicEvent[]>;
}

// =============================================================================
// Memory-Enriched Guidance Service
// =============================================================================

/**
 * Extends GuidanceService with cognitive memory integration
 *
 * Provides context-aware coaching suggestions based on:
 * - Episodic memory (past interactions)
 * - Behavioral patterns (detected tendencies)
 * - Sentiment trends (emotional trajectory)
 * - Semantic similarity (related past conversations)
 *
 * @example
 * ```typescript
 * const service = createMemoryEnrichedGuidanceService(
 *   repository,
 *   memoryRetrieval,
 *   { enablePatternBasedSuggestions: true }
 * );
 *
 * // Load guidance with memory context
 * await service.loadGuidanceForCall('call_123', {
 *   clinicId: 'clinic_abc',
 *   subjectType: 'lead',
 *   subjectId: 'lead_xyz',
 * });
 *
 * // Process message with memory-aware suggestions
 * const suggestions = await service.processMessageWithMemory(
 *   'call_123',
 *   'customer',
 *   'I already told you last month I want the cheaper option'
 * );
 * ```
 */
export class MemoryEnrichedGuidanceService extends EventEmitter {
  private baseService: GuidanceService;
  private memoryRetrieval: MemoryRetrievalService | null;
  private memoryConfig: ResolvedMemoryConfig;
  private callMemoryState = new Map<string, MemoryEnrichedCallState>();

  constructor(
    repository: IGuidanceRepository,
    memoryRetrieval: MemoryRetrievalService | null,
    config: MemoryEnrichedGuidanceConfig = {}
  ) {
    super();
    this.baseService = new GuidanceService(repository, config);
    this.memoryRetrieval = memoryRetrieval;

    this.memoryConfig = {
      enableMemoryIntegration: config.enableMemoryIntegration ?? true,
      defaultRecentEventsDays: config.defaultRecentEventsDays ?? 30,
      defaultMaxRecentEvents: config.defaultMaxRecentEvents ?? 10,
      minPatternConfidenceForSuggestion: config.minPatternConfidenceForSuggestion ?? 0.6,
      enableSentimentAwareness: config.enableSentimentAwareness ?? true,
      enablePatternBasedSuggestions: config.enablePatternBasedSuggestions ?? true,
      enableSemanticHistory: config.enableSemanticHistory ?? true,
      maxSimilarInteractions: config.maxSimilarInteractions ?? 3,
    };

    // Forward base service events
    this.baseService.on('guidance:loaded', (callSid, guidance) => {
      this.emit('guidance:loaded', callSid, guidance);
    });
    this.baseService.on('guidance:step-complete', (callSid, stepId, nextStepId) => {
      this.emit('guidance:step-complete', callSid, stepId, nextStepId);
    });
    this.baseService.on('guidance:suggestion', (callSid, suggestion) => {
      this.emit('guidance:suggestion', callSid, suggestion);
    });
    this.baseService.on('guidance:objection-detected', (callSid, objection, response) => {
      this.emit('guidance:objection-detected', callSid, objection, response);
    });
    this.baseService.on('guidance:script-complete', (callSid, guidanceId, stats) => {
      this.emit('guidance:script-complete', callSid, guidanceId, stats);
    });
  }

  // ==========================================================================
  // CRUD Operations (delegated to base service)
  // ==========================================================================

  async createGuidance(input: CreateGuidance): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.baseService.createGuidance(input);
  }

  async updateGuidance(
    id: string,
    updates: Partial<UpdateGuidance>
  ): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.baseService.updateGuidance(id, updates);
  }

  async deleteGuidance(id: string): Promise<GuidanceRepositoryResult<void>> {
    return this.baseService.deleteGuidance(id);
  }

  async getGuidance(id: string): Promise<GuidanceRepositoryResult<AgentGuidance | null>> {
    return this.baseService.getGuidance(id);
  }

  async listGuidance(
    query: GuidanceQuery & { clinicId: string }
  ): Promise<GuidanceRepositoryResult<PaginatedGuidance>> {
    return this.baseService.listGuidance(query);
  }

  async searchGuidance(
    clinicId: string,
    searchTerm: string,
    tags?: string[]
  ): Promise<GuidanceRepositoryResult<AgentGuidance[]>> {
    return this.baseService.searchGuidance(clinicId, searchTerm, tags);
  }

  // ==========================================================================
  // Status Management (delegated to base service)
  // ==========================================================================

  async activateGuidance(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.baseService.activateGuidance(id);
  }

  async deactivateGuidance(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.baseService.deactivateGuidance(id);
  }

  async publishGuidance(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.baseService.publishGuidance(id);
  }

  // ==========================================================================
  // Versioning (delegated to base service)
  // ==========================================================================

  async createNewVersion(
    id: string,
    updates: Partial<UpdateGuidance>
  ): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.baseService.createNewVersion(id, updates);
  }

  async getVersionHistory(id: string): Promise<GuidanceRepositoryResult<AgentGuidance[]>> {
    return this.baseService.getVersionHistory(id);
  }

  // ==========================================================================
  // Memory-Enriched Call Management
  // ==========================================================================

  /**
   * Load guidance for a call with memory context retrieval
   */
  async loadGuidanceForCall(
    callSid: string,
    spec: MemoryEnrichedCallSpec
  ): Promise<GuidanceRepositoryResult<AgentGuidance | null>> {
    // Load base guidance
    const result = await this.baseService.loadGuidanceForCall(callSid, spec);

    if (!result.success || !result.data) {
      return result;
    }

    // Initialize memory state
    const memoryState: MemoryEnrichedCallState = {
      callSid,
      subjectType: spec.subjectType ?? null,
      subjectId: spec.subjectId ?? null,
      memoryContext: null,
      memorySuggestions: [],
      semanticSearchCache: new Map(),
    };

    this.callMemoryState.set(callSid, memoryState);

    // Retrieve memory context if enabled and subject provided
    const enableMemory = spec.enableMemory !== false;
    if (
      enableMemory &&
      this.memoryConfig.enableMemoryIntegration &&
      this.memoryRetrieval &&
      spec.subjectType &&
      spec.subjectId
    ) {
      try {
        const memoryContext = await this.retrieveMemoryContext(
          spec.subjectType,
          spec.subjectId,
          spec.maxRecentEvents ?? this.memoryConfig.defaultMaxRecentEvents,
          spec.recentEventsDays ?? this.memoryConfig.defaultRecentEventsDays
        );

        memoryState.memoryContext = memoryContext;

        logger.info({
          msg: 'Memory context loaded for call',
          callSid,
          subjectType: spec.subjectType,
          subjectId: spec.subjectId,
          totalEvents: memoryContext.summary?.totalEvents ?? 0,
          patternsFound: memoryContext.patterns.length,
          sentimentTrend: memoryContext.sentimentTrend,
        });

        this.emit('guidance:memory-loaded', callSid, memoryContext);
      } catch (error) {
        logger.warn({
          msg: 'Failed to retrieve memory context',
          callSid,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return result;
  }

  /**
   * Retrieve memory context for a subject
   */
  private async retrieveMemoryContext(
    subjectType: SubjectType,
    subjectId: string,
    maxRecentEvents: number,
    recentEventsDays: number
  ): Promise<CallMemoryContext> {
    if (!this.memoryRetrieval) {
      return {
        subjectType,
        subjectId,
        summary: null,
        recentEvents: [],
        patterns: [],
        sentimentTrend: 'stable',
      };
    }

    // Fetch summary (includes patterns and recent summary)
    const summary = await this.memoryRetrieval.getSubjectSummary(subjectType, subjectId);

    // Fetch recent events
    const recentEvents = await this.memoryRetrieval.getRecentEvents(
      subjectType,
      subjectId,
      recentEventsDays,
      maxRecentEvents
    );

    return {
      subjectType,
      subjectId,
      summary,
      recentEvents,
      patterns: summary.patterns,
      sentimentTrend: summary.sentimentTrend,
    };
  }

  /**
   * Get memory context for a call
   */
  getCallMemoryContext(callSid: string): CallMemoryContext | null {
    return this.callMemoryState.get(callSid)?.memoryContext ?? null;
  }

  // ==========================================================================
  // Delegated Call State Methods
  // ==========================================================================

  getCallGuidance(callSid: string): AgentGuidance | null {
    return this.baseService.getCallGuidance(callSid);
  }

  getCurrentStep(callSid: string): ScriptStep | null {
    return this.baseService.getCurrentStep(callSid);
  }

  completeStep(callSid: string, stepId: string, data?: Record<string, unknown>): ScriptStep | null {
    return this.baseService.completeStep(callSid, stepId, data);
  }

  skipStep(callSid: string, stepId: string): ScriptStep | null {
    return this.baseService.skipStep(callSid, stepId);
  }

  /**
   * End guidance for a call and cleanup memory state
   */
  endCallGuidance(callSid: string): void {
    this.baseService.endCallGuidance(callSid);
    this.callMemoryState.delete(callSid);
  }

  // ==========================================================================
  // Memory-Enriched Message Processing
  // ==========================================================================

  /**
   * Process transcript message and generate memory-enriched suggestions
   *
   * This enhances the base suggestion generation with:
   * - Sentiment-aware coaching tips
   * - Pattern-based personalization
   * - Semantic search for similar past interactions
   */
  async processMessageWithMemory(
    callSid: string,
    speaker: 'customer' | 'agent' | 'assistant',
    text: string
  ): Promise<MemoryEnrichedSuggestion[]> {
    // Get base suggestions
    const baseSuggestions = this.baseService.processMessage(callSid, speaker, text);

    const memoryState = this.callMemoryState.get(callSid);
    if (!memoryState?.memoryContext || !this.memoryRetrieval) {
      return baseSuggestions;
    }

    const memorySuggestions: MemoryEnrichedSuggestion[] = [];
    const memoryContext = memoryState.memoryContext;

    // Generate sentiment-aware suggestions
    if (this.memoryConfig.enableSentimentAwareness && speaker === 'customer') {
      const sentimentSuggestions = this.generateSentimentAwareSuggestions(
        callSid,
        memoryContext,
        text
      );
      memorySuggestions.push(...sentimentSuggestions);
    }

    // Generate pattern-based suggestions
    if (this.memoryConfig.enablePatternBasedSuggestions && speaker === 'customer') {
      const patternSuggestions = this.generatePatternBasedSuggestions(callSid, memoryContext, text);
      memorySuggestions.push(...patternSuggestions);
    }

    // Find semantically similar past interactions
    if (this.memoryConfig.enableSemanticHistory && speaker === 'customer') {
      const semanticSuggestions = await this.generateSemanticSuggestions(
        callSid,
        memoryState,
        text
      );
      memorySuggestions.push(...semanticSuggestions);
    }

    // Store memory suggestions
    for (const suggestion of memorySuggestions) {
      if (memoryState.memorySuggestions.length < 50) {
        memoryState.memorySuggestions.push(suggestion);
        this.emit('guidance:memory-suggestion', callSid, suggestion);
      }
    }

    // Combine and deduplicate suggestions
    return [...baseSuggestions, ...memorySuggestions];
  }

  /**
   * Process message without async memory operations (for compatibility)
   */
  processMessage(
    callSid: string,
    speaker: 'customer' | 'agent' | 'assistant',
    text: string
  ): GuidanceSuggestion[] {
    return this.baseService.processMessage(callSid, speaker, text);
  }

  /**
   * Generate suggestions based on sentiment trend
   */
  private generateSentimentAwareSuggestions(
    callSid: string,
    memoryContext: CallMemoryContext,
    _text: string
  ): MemoryEnrichedSuggestion[] {
    const suggestions: MemoryEnrichedSuggestion[] = [];
    const { sentimentTrend, summary } = memoryContext;

    if (!summary) return suggestions;

    // Handle declining sentiment
    if (sentimentTrend === 'declining') {
      const negativeCount = summary.sentimentCounts.negative;
      const totalInteractions = summary.totalEvents;

      if (negativeCount > 0 && totalInteractions > 3) {
        suggestions.push(
          this.createMemoryEnrichedSuggestion(callSid, {
            type: 'coaching-tip',
            content:
              'Recent interactions show declining sentiment. Use empathetic language and address any unresolved concerns.',
            contentRo:
              'Interacțiunile recente arată o scădere a sentimentului. Folosiți un limbaj empatic și abordați orice preocupări nerezolvate.',
            priority: 'high',
            confidence: 0.8,
            memoryContext: {
              sentimentConsideration: `Sentiment trend: declining (${negativeCount}/${totalInteractions} negative)`,
            },
          })
        );
      }
    }

    // Handle improving sentiment
    if (sentimentTrend === 'improving') {
      suggestions.push(
        this.createMemoryEnrichedSuggestion(callSid, {
          type: 'coaching-tip',
          content:
            'Patient shows positive engagement trend. This is a good moment to discuss additional services or referrals.',
          contentRo:
            'Pacientul arată o tendință de angajament pozitiv. Acesta este un moment bun pentru a discuta servicii suplimentare sau recomandări.',
          priority: 'low',
          confidence: 0.7,
          memoryContext: {
            sentimentConsideration: 'Sentiment trend: improving - opportunity for expansion',
          },
        })
      );
    }

    return suggestions;
  }

  /**
   * Generate suggestions based on behavioral patterns
   */
  private generatePatternBasedSuggestions(
    callSid: string,
    memoryContext: CallMemoryContext,
    text: string
  ): MemoryEnrichedSuggestion[] {
    const suggestions: MemoryEnrichedSuggestion[] = [];
    const { patterns } = memoryContext;

    for (const pattern of patterns) {
      if (pattern.confidence < this.memoryConfig.minPatternConfidenceForSuggestion) {
        continue;
      }

      const suggestion = this.createSuggestionForPattern(callSid, pattern, text);
      if (suggestion) {
        suggestions.push(suggestion);
        this.emit('guidance:pattern-detected', callSid, pattern);
      }
    }

    return suggestions;
  }

  /**
   * Create a suggestion based on a specific behavioral pattern
   */
  private createSuggestionForPattern(
    callSid: string,
    pattern: BehavioralPattern,
    text: string
  ): MemoryEnrichedSuggestion | null {
    const lowerText = text.toLowerCase();

    switch (pattern.patternType) {
      case 'price_sensitive':
        if (
          lowerText.includes('cost') ||
          lowerText.includes('price') ||
          lowerText.includes('pret') ||
          lowerText.includes('scump')
        ) {
          return this.createMemoryEnrichedSuggestion(callSid, {
            type: 'coaching-tip',
            content: `Known price-sensitive patient. Consider offering: payment plans, insurance options, or highlighting value vs. cost.`,
            contentRo: `Pacient sensibil la preț. Considerați: planuri de plată, opțiuni de asigurare, sau evidențierea valorii vs. cost.`,
            priority: 'high',
            confidence: pattern.confidence,
            memoryContext: {
              basedOnPattern: `price_sensitive (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
            },
          });
        }
        break;

      case 'quality_focused':
        return this.createMemoryEnrichedSuggestion(callSid, {
          type: 'coaching-tip',
          content: `Quality-focused patient. Emphasize: expertise, technology, outcomes, and patient testimonials.`,
          contentRo: `Pacient orientat spre calitate. Subliniați: expertiză, tehnologie, rezultate și mărturii ale pacienților.`,
          priority: 'medium',
          confidence: pattern.confidence,
          memoryContext: {
            basedOnPattern: `quality_focused (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
          },
        });

      case 'appointment_rescheduler':
        if (
          lowerText.includes('schedule') ||
          lowerText.includes('appointment') ||
          lowerText.includes('programare')
        ) {
          return this.createMemoryEnrichedSuggestion(callSid, {
            type: 'coaching-tip',
            content: `Patient has history of rescheduling. Confirm commitment and send reminders. Consider flexible scheduling options.`,
            contentRo: `Pacientul are istoric de reprogramări. Confirmați angajamentul și trimiteți memento-uri. Considerați opțiuni flexibile de programare.`,
            priority: 'medium',
            confidence: pattern.confidence,
            memoryContext: {
              basedOnPattern: `appointment_rescheduler (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
            },
          });
        }
        break;

      case 'monday_avoider':
        if (
          lowerText.includes('monday') ||
          lowerText.includes('luni') ||
          lowerText.includes('week')
        ) {
          return this.createMemoryEnrichedSuggestion(callSid, {
            type: 'coaching-tip',
            content: `Patient typically avoids Monday appointments. Suggest alternative days for better attendance.`,
            contentRo: `Pacientul evită de obicei programările de luni. Sugerați zile alternative pentru o prezență mai bună.`,
            priority: 'low',
            confidence: pattern.confidence,
            memoryContext: {
              basedOnPattern: `monday_avoider (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
            },
          });
        }
        break;

      case 'quick_responder':
        return this.createMemoryEnrichedSuggestion(callSid, {
          type: 'coaching-tip',
          content: `Fast-responding patient. They appreciate quick follow-ups and timely information.`,
          contentRo: `Pacient care răspunde rapid. Apreciază urmăririle rapide și informațiile la timp.`,
          priority: 'low',
          confidence: pattern.confidence,
          memoryContext: {
            basedOnPattern: `quick_responder (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
          },
        });

      case 'slow_responder':
        return this.createMemoryEnrichedSuggestion(callSid, {
          type: 'coaching-tip',
          content: `Patient typically takes time to respond. Be patient and avoid pressure. Consider scheduled follow-ups.`,
          contentRo: `Pacientul de obicei ia timp să răspundă. Fiți răbdător și evitați presiunea. Considerați urmăriri programate.`,
          priority: 'low',
          confidence: pattern.confidence,
          memoryContext: {
            basedOnPattern: `slow_responder (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
          },
        });

      case 'declining_engagement':
        return this.createMemoryEnrichedSuggestion(callSid, {
          type: 'warning',
          content: `Warning: Declining engagement detected. Focus on rebuilding rapport and addressing any dissatisfaction.`,
          contentRo: `Atenție: Angajament în scădere detectat. Concentrați-vă pe refacerea raportului și abordarea oricărei nemulțumiri.`,
          priority: 'high',
          confidence: pattern.confidence,
          memoryContext: {
            basedOnPattern: `declining_engagement (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
          },
        });

      case 'high_engagement':
        return this.createMemoryEnrichedSuggestion(callSid, {
          type: 'coaching-tip',
          content: `Highly engaged patient. Great candidate for referral program or premium services.`,
          contentRo: `Pacient foarte angajat. Candidat excelent pentru programul de recomandări sau servicii premium.`,
          priority: 'low',
          confidence: pattern.confidence,
          memoryContext: {
            basedOnPattern: `high_engagement (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`,
          },
        });
    }

    return null;
  }

  /**
   * Generate suggestions from semantically similar past interactions
   */
  private async generateSemanticSuggestions(
    callSid: string,
    memoryState: MemoryEnrichedCallState,
    text: string
  ): Promise<MemoryEnrichedSuggestion[]> {
    const suggestions: MemoryEnrichedSuggestion[] = [];

    if (!this.memoryRetrieval || !memoryState.subjectId) {
      return suggestions;
    }

    // Check cache first
    const cachedResults = memoryState.semanticSearchCache.get(text);
    if (cachedResults) {
      return this.createSuggestionsFromSimilarEvents(callSid, cachedResults);
    }

    try {
      const similarEvents = await this.memoryRetrieval.findSimilarInteractions(text, {
        subjectId: memoryState.subjectId,
        subjectType: memoryState.subjectType ?? undefined,
        limit: this.memoryConfig.maxSimilarInteractions,
        minSimilarity: 0.75,
      });

      // Cache results
      memoryState.semanticSearchCache.set(text, similarEvents);

      return this.createSuggestionsFromSimilarEvents(callSid, similarEvents);
    } catch (error) {
      logger.warn({
        msg: 'Semantic search failed',
        callSid,
        error: error instanceof Error ? error.message : String(error),
      });
      return suggestions;
    }
  }

  /**
   * Create suggestions from similar past events
   */
  private createSuggestionsFromSimilarEvents(
    callSid: string,
    events: EpisodicEvent[]
  ): MemoryEnrichedSuggestion[] {
    const suggestions: MemoryEnrichedSuggestion[] = [];

    for (const event of events) {
      if (!event.summary) continue;

      // Extract actionable context from past interaction
      const pastContext = this.extractActionableContext(event);
      if (!pastContext) continue;

      suggestions.push(
        this.createMemoryEnrichedSuggestion(callSid, {
          type: 'coaching-tip',
          content: pastContext,
          priority: 'medium',
          confidence: 0.7,
          memoryContext: {
            similarPastInteraction: `Similar topic discussed on ${event.occurredAt.toLocaleDateString()}`,
          },
        })
      );
    }

    return suggestions;
  }

  /**
   * Extract actionable context from a past event
   */
  private extractActionableContext(event: EpisodicEvent): string | null {
    const { summary, sentiment, intent, keyEntities } = event;

    // Build context based on event type and content
    const parts: string[] = [];

    // Add sentiment context if negative/positive
    if (sentiment === 'negative') {
      parts.push('Previous similar conversation had negative outcome.');
    } else if (sentiment === 'positive') {
      parts.push('Previous similar conversation was successful.');
    }

    // Add intent context
    if (intent) {
      parts.push(`Previous intent: ${intent}.`);
    }

    // Add key entities
    const procedureEntities = keyEntities.filter((e: KeyEntity) => e.type === 'procedure');
    if (procedureEntities.length > 0) {
      parts.push(
        `Previously discussed procedures: ${procedureEntities.map((e: KeyEntity) => e.value).join(', ')}.`
      );
    }

    // Add summary excerpt
    if (summary && parts.length < 2) {
      const shortSummary = summary.length > 100 ? summary.substring(0, 100) + '...' : summary;
      parts.push(`Context: ${shortSummary}`);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  /**
   * Create a memory-enriched suggestion
   */
  private createMemoryEnrichedSuggestion(
    callSid: string,
    data: {
      type: GuidanceSuggestion['type'];
      content: string;
      contentRo?: string;
      priority?: GuidanceSuggestion['priority'];
      confidence?: number;
      memoryContext?: MemoryEnrichedSuggestion['memoryContext'];
    }
  ): MemoryEnrichedSuggestion {
    const guidance = this.baseService.getCallGuidance(callSid);

    return {
      id: crypto.randomUUID(),
      callSid,
      guidanceId: guidance?.id ?? '',
      type: data.type,
      content: data.content,
      contentRo: data.contentRo,
      priority: data.priority ?? 'medium',
      confidence: data.confidence ?? 0.7,
      timestamp: new Date(),
      acknowledged: false,
      memoryContext: data.memoryContext,
    };
  }

  // ==========================================================================
  // Suggestion Management
  // ==========================================================================

  acknowledgeSuggestion(callSid: string, suggestionId: string): boolean {
    // Check base suggestions
    if (this.baseService.acknowledgeSuggestion(callSid, suggestionId)) {
      return true;
    }

    // Check memory suggestions
    const memoryState = this.callMemoryState.get(callSid);
    if (memoryState) {
      const suggestion = memoryState.memorySuggestions.find((s) => s.id === suggestionId);
      if (suggestion) {
        suggestion.acknowledged = true;
        return true;
      }
    }

    return false;
  }

  getSuggestions(callSid: string): GuidanceSuggestion[] {
    return this.baseService.getSuggestions(callSid);
  }

  getMemorySuggestions(callSid: string): MemoryEnrichedSuggestion[] {
    return this.callMemoryState.get(callSid)?.memorySuggestions ?? [];
  }

  getAllSuggestions(callSid: string): GuidanceSuggestion[] {
    const baseSuggestions = this.baseService.getSuggestions(callSid);
    const memorySuggestions = this.getMemorySuggestions(callSid);
    return [...baseSuggestions, ...memorySuggestions];
  }

  getPendingSuggestions(callSid: string): GuidanceSuggestion[] {
    return this.baseService.getPendingSuggestions(callSid);
  }

  getPendingMemorySuggestions(callSid: string): MemoryEnrichedSuggestion[] {
    return this.getMemorySuggestions(callSid).filter((s) => !s.acknowledged);
  }

  // ==========================================================================
  // Memory Context Utilities
  // ==========================================================================

  /**
   * Build markdown context for AI prompt enrichment
   */
  buildMemoryContextMarkdown(callSid: string): MemoryContext | null {
    const memoryContext = this.getCallMemoryContext(callSid);
    if (!memoryContext?.summary) {
      return null;
    }

    const { summary, recentEvents, patterns, sentimentTrend } = memoryContext;

    const recentHistory = recentEvents
      .slice(0, 5)
      .map((e) => `[${e.occurredAt.toLocaleDateString()}] ${e.summary}`);

    const knownPatterns = patterns
      .filter((p) => p.confidence >= this.memoryConfig.minPatternConfidenceForSuggestion)
      .map(
        (p) => `${p.patternType}: ${p.patternDescription} (${(p.confidence * 100).toFixed(0)}%)`
      );

    // Build markdown
    const markdownParts: string[] = [];

    markdownParts.push('## Patient Memory Context');
    markdownParts.push('');
    markdownParts.push(
      `- **Total interactions**: ${summary.totalEvents} since ${summary.firstInteraction?.toLocaleDateString() ?? 'N/A'}`
    );
    markdownParts.push(`- **Sentiment trend**: ${sentimentTrend}`);
    markdownParts.push(
      `- **Sentiment breakdown**: ${summary.sentimentCounts.positive} positive, ${summary.sentimentCounts.neutral} neutral, ${summary.sentimentCounts.negative} negative`
    );
    markdownParts.push('');

    if (knownPatterns.length > 0) {
      markdownParts.push('### Behavioral Patterns');
      for (const pattern of knownPatterns) {
        markdownParts.push(`- ${pattern}`);
      }
      markdownParts.push('');
    }

    if (recentHistory.length > 0) {
      markdownParts.push('### Recent Interaction History');
      for (const history of recentHistory) {
        markdownParts.push(`- ${history}`);
      }
      markdownParts.push('');
    }

    if (summary.recentSummary) {
      markdownParts.push('### Summary');
      markdownParts.push(summary.recentSummary);
    }

    return {
      recentHistory,
      similarInteractions: [],
      knownPatterns,
      contextMarkdown: markdownParts.join('\n'),
    };
  }

  // ==========================================================================
  // Collected Data (delegated)
  // ==========================================================================

  getCollectedData(callSid: string): Record<string, unknown> {
    return this.baseService.getCollectedData(callSid);
  }

  updateCollectedData(callSid: string, data: Record<string, unknown>): void {
    this.baseService.updateCollectedData(callSid, data);
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  getActiveCallCount(): number {
    return this.baseService.getActiveCallCount();
  }

  getActiveCallSids(): string[] {
    return this.baseService.getActiveCallSids();
  }

  hasGuidance(callSid: string): boolean {
    return this.baseService.hasGuidance(callSid);
  }

  hasMemoryContext(callSid: string): boolean {
    return this.callMemoryState.get(callSid)?.memoryContext !== null;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.baseService.destroy();
    this.callMemoryState.clear();
    this.removeAllListeners();
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

let memoryEnrichedServiceInstance: MemoryEnrichedGuidanceService | null = null;

/**
 * Create or get the memory-enriched guidance service singleton
 */
export function getMemoryEnrichedGuidanceService(
  repository: IGuidanceRepository,
  memoryRetrieval: MemoryRetrievalService | null,
  config?: MemoryEnrichedGuidanceConfig
): MemoryEnrichedGuidanceService {
  memoryEnrichedServiceInstance ??= new MemoryEnrichedGuidanceService(
    repository,
    memoryRetrieval,
    config
  );
  return memoryEnrichedServiceInstance;
}

/**
 * Create a new memory-enriched guidance service instance (non-singleton)
 */
export function createMemoryEnrichedGuidanceService(
  repository: IGuidanceRepository,
  memoryRetrieval: MemoryRetrievalService | null,
  config?: MemoryEnrichedGuidanceConfig
): MemoryEnrichedGuidanceService {
  return new MemoryEnrichedGuidanceService(repository, memoryRetrieval, config);
}

/**
 * Reset the memory-enriched guidance service (for testing)
 */
export function resetMemoryEnrichedGuidanceService(): void {
  if (memoryEnrichedServiceInstance) {
    memoryEnrichedServiceInstance.destroy();
    memoryEnrichedServiceInstance = null;
  }
}
