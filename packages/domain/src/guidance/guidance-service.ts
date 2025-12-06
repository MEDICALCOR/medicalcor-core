/**
 * Agent Guidance Service
 * M2 Milestone: Agent Guidance Call Scripts
 *
 * Domain service for managing call scripts and providing real-time
 * guidance suggestions during calls.
 */
import { EventEmitter } from 'events';
import type {
  AgentGuidance,
  CreateGuidance,
  UpdateGuidance,
  GuidanceQuery,
  GuidanceSuggestion,
  ScriptStep,
  ObjectionHandler,
} from '@medicalcor/types';
import { CreateGuidanceSchema, GuidanceSuggestionSchema } from '@medicalcor/types';

import type {
  IGuidanceRepository,
  GuidanceRepositoryResult,
  PaginatedGuidance,
  GuidanceForCallSpec,
} from './repositories/GuidanceRepository.js';

// =============================================================================
// Service Configuration
// =============================================================================

export interface GuidanceServiceConfig {
  /** Maximum number of suggestions to cache per call */
  maxSuggestionsPerCall?: number;
  /** Enable objection detection */
  enableObjectionDetection?: boolean;
  /** Minimum confidence for suggestions */
  minSuggestionConfidence?: number;
  /** Default language */
  defaultLanguage?: 'en' | 'ro';
}

interface ResolvedGuidanceServiceConfig {
  maxSuggestionsPerCall: number;
  enableObjectionDetection: boolean;
  minSuggestionConfidence: number;
  defaultLanguage: 'en' | 'ro';
}

// =============================================================================
// Service Events
// =============================================================================

export interface GuidanceServiceEvents {
  'guidance:loaded': (callSid: string, guidance: AgentGuidance) => void;
  'guidance:step-complete': (callSid: string, stepId: string, nextStepId?: string) => void;
  'guidance:suggestion': (callSid: string, suggestion: GuidanceSuggestion) => void;
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
}

export interface ScriptCompletionStats {
  completedSteps: number;
  totalSteps: number;
  duration: number;
  skippedSteps: number;
}

// =============================================================================
// Call Guidance State
// =============================================================================

interface CallGuidanceState {
  callSid: string;
  guidanceId: string;
  guidance: AgentGuidance;
  currentStepIndex: number;
  completedSteps: Set<string>;
  skippedSteps: Set<string>;
  startedAt: Date;
  collectedData: Record<string, unknown>;
  suggestions: GuidanceSuggestion[];
  language: 'en' | 'ro';
}

// =============================================================================
// Guidance Service Implementation
// =============================================================================

export class GuidanceService extends EventEmitter {
  private config: ResolvedGuidanceServiceConfig;
  private repository: IGuidanceRepository;
  private activeCallGuidance = new Map<string, CallGuidanceState>();

  // Common objection patterns (Romanian + English)
  private readonly OBJECTION_PATTERNS: { pattern: RegExp; category: string }[] = [
    // Price objections
    { pattern: /prea scump|costă prea mult|nu îmi permit/i, category: 'price' },
    { pattern: /too expensive|can't afford|costs too much/i, category: 'price' },
    // Time objections
    { pattern: /nu am timp|sunt ocupat|mai târziu/i, category: 'time' },
    { pattern: /don't have time|too busy|maybe later/i, category: 'time' },
    // Trust objections
    { pattern: /nu sunt sigur|trebuie să mă gândesc|vreau să verific/i, category: 'trust' },
    { pattern: /not sure|need to think|want to check/i, category: 'trust' },
    // Need objections
    { pattern: /nu am nevoie|nu cred că|poate nu/i, category: 'need' },
    { pattern: /don't need|don't think|maybe not/i, category: 'need' },
    // Competitor objections
    { pattern: /altă clinică|alt doctor|am un dentist/i, category: 'competitor' },
    { pattern: /another clinic|other doctor|have a dentist/i, category: 'competitor' },
  ];

  constructor(repository: IGuidanceRepository, config: GuidanceServiceConfig = {}) {
    super();
    this.repository = repository;
    this.config = {
      maxSuggestionsPerCall: config.maxSuggestionsPerCall ?? 50,
      enableObjectionDetection: config.enableObjectionDetection ?? true,
      minSuggestionConfidence: config.minSuggestionConfidence ?? 0.5,
      defaultLanguage: config.defaultLanguage ?? 'ro',
    };
  }

  // ==========================================================================
  // CRUD Operations (delegated to repository)
  // ==========================================================================

  async createGuidance(input: CreateGuidance): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    // Validate input
    const parseResult = CreateGuidanceSchema.safeParse(input);
    if (!parseResult.success) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid guidance data',
          details: parseResult.error.flatten(),
        },
      };
    }

    return this.repository.create(parseResult.data);
  }

  async updateGuidance(
    id: string,
    updates: Partial<UpdateGuidance>
  ): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.repository.update(id, updates);
  }

  async deleteGuidance(id: string): Promise<GuidanceRepositoryResult<void>> {
    return this.repository.delete(id);
  }

  async getGuidance(id: string): Promise<GuidanceRepositoryResult<AgentGuidance | null>> {
    return this.repository.findById(id);
  }

  async listGuidance(
    query: GuidanceQuery & { clinicId: string }
  ): Promise<GuidanceRepositoryResult<PaginatedGuidance>> {
    return this.repository.list(query);
  }

  async searchGuidance(
    clinicId: string,
    searchTerm: string,
    tags?: string[]
  ): Promise<GuidanceRepositoryResult<AgentGuidance[]>> {
    return this.repository.search({ clinicId, searchTerm, tags });
  }

  // ==========================================================================
  // Status Management
  // ==========================================================================

  async activateGuidance(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.repository.activate(id);
  }

  async deactivateGuidance(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.repository.deactivate(id);
  }

  async publishGuidance(id: string): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.repository.publish(id);
  }

  // ==========================================================================
  // Versioning
  // ==========================================================================

  async createNewVersion(
    id: string,
    updates: Partial<UpdateGuidance>
  ): Promise<GuidanceRepositoryResult<AgentGuidance>> {
    return this.repository.createVersion(id, updates);
  }

  async getVersionHistory(id: string): Promise<GuidanceRepositoryResult<AgentGuidance[]>> {
    return this.repository.getVersionHistory(id);
  }

  // ==========================================================================
  // Call Guidance Management
  // ==========================================================================

  /**
   * Load guidance for a call
   */
  async loadGuidanceForCall(
    callSid: string,
    spec: GuidanceForCallSpec
  ): Promise<GuidanceRepositoryResult<AgentGuidance | null>> {
    // Find appropriate guidance
    const result = await this.repository.findForCall(spec);

    if (!result.success) {
      return result;
    }

    const guidance = result.data;
    if (!guidance) {
      return { success: true, data: null };
    }

    // Initialize call state
    const state: CallGuidanceState = {
      callSid,
      guidanceId: guidance.id,
      guidance,
      currentStepIndex: 0,
      completedSteps: new Set(),
      skippedSteps: new Set(),
      startedAt: new Date(),
      collectedData: {},
      suggestions: [],
      language: spec.language ?? this.config.defaultLanguage,
    };

    this.activeCallGuidance.set(callSid, state);

    // Track usage
    void this.repository.incrementUsage(guidance.id);

    this.emit('guidance:loaded', callSid, guidance);

    return { success: true, data: guidance };
  }

  /**
   * Get current guidance for a call
   */
  getCallGuidance(callSid: string): AgentGuidance | null {
    const state = this.activeCallGuidance.get(callSid);
    return state?.guidance ?? null;
  }

  /**
   * Get current step for a call
   */
  getCurrentStep(callSid: string): ScriptStep | null {
    const state = this.activeCallGuidance.get(callSid);
    if (!state?.guidance.steps.length) {
      return null;
    }

    return state.guidance.steps[state.currentStepIndex] ?? null;
  }

  /**
   * Complete current step and move to next
   */
  completeStep(callSid: string, stepId: string, data?: Record<string, unknown>): ScriptStep | null {
    const state = this.activeCallGuidance.get(callSid);
    if (!state) {
      return null;
    }

    // Mark step as completed
    state.completedSteps.add(stepId);

    // Store collected data
    if (data) {
      Object.assign(state.collectedData, data);
    }

    // Find next step
    const currentStep = state.guidance.steps.find((s) => s.id === stepId);
    let nextStep: ScriptStep | null = null;

    if (currentStep?.expectedResponses?.length) {
      // Check for conditional branching based on collected data
      for (const response of currentStep.expectedResponses) {
        if (response.nextStepId) {
          nextStep = state.guidance.steps.find((s) => s.id === response.nextStepId) ?? null;
          break;
        }
      }
    }

    // Default to next step in sequence
    if (!nextStep) {
      state.currentStepIndex++;
      nextStep = state.guidance.steps[state.currentStepIndex] ?? null;
    } else {
      const foundStep = nextStep;
      state.currentStepIndex = state.guidance.steps.findIndex((s) => s.id === foundStep.id);
    }

    this.emit('guidance:step-complete', callSid, stepId, nextStep?.id);

    // Check if script is complete
    if (!nextStep || state.currentStepIndex >= state.guidance.steps.length) {
      this.completeScript(callSid);
    }

    return nextStep;
  }

  /**
   * Skip a step
   */
  skipStep(callSid: string, stepId: string): ScriptStep | null {
    const state = this.activeCallGuidance.get(callSid);
    if (!state) {
      return null;
    }

    state.skippedSteps.add(stepId);
    state.currentStepIndex++;

    return state.guidance.steps[state.currentStepIndex] ?? null;
  }

  /**
   * Complete the script
   */
  private completeScript(callSid: string): void {
    const state = this.activeCallGuidance.get(callSid);
    if (!state) {
      return;
    }

    const duration = (Date.now() - state.startedAt.getTime()) / 1000;
    const stats: ScriptCompletionStats = {
      completedSteps: state.completedSteps.size,
      totalSteps: state.guidance.steps.length,
      duration,
      skippedSteps: state.skippedSteps.size,
    };

    this.emit('guidance:script-complete', callSid, state.guidanceId, stats);

    // Update metrics
    void this.repository.updateMetrics(state.guidanceId, {
      avgCallDuration: duration,
    });
  }

  /**
   * End guidance for a call
   */
  endCallGuidance(callSid: string): void {
    const state = this.activeCallGuidance.get(callSid);
    if (state && state.completedSteps.size > 0) {
      this.completeScript(callSid);
    }
    this.activeCallGuidance.delete(callSid);
  }

  // ==========================================================================
  // Real-time Suggestions
  // ==========================================================================

  /**
   * Process transcript message and generate suggestions
   */
  processMessage(
    callSid: string,
    speaker: 'customer' | 'agent' | 'assistant',
    text: string
  ): GuidanceSuggestion[] {
    const state = this.activeCallGuidance.get(callSid);
    if (!state) {
      return [];
    }

    const suggestions: GuidanceSuggestion[] = [];

    // Check for objections (customer messages only)
    if (speaker === 'customer' && this.config.enableObjectionDetection) {
      const objectionSuggestions = this.detectObjections(callSid, text, state);
      suggestions.push(...objectionSuggestions);
    }

    // Check for relevant talking points
    const talkingPointSuggestions = this.findRelevantTalkingPoints(callSid, text, state);
    suggestions.push(...talkingPointSuggestions);

    // Store suggestions
    for (const suggestion of suggestions) {
      if (state.suggestions.length < this.config.maxSuggestionsPerCall) {
        state.suggestions.push(suggestion);
        this.emit('guidance:suggestion', callSid, suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Detect objections in customer message
   */
  private detectObjections(
    callSid: string,
    text: string,
    state: CallGuidanceState
  ): GuidanceSuggestion[] {
    const suggestions: GuidanceSuggestion[] = [];

    // Check built-in patterns
    for (const { pattern, category } of this.OBJECTION_PATTERNS) {
      if (pattern.test(text)) {
        // Find matching handler
        const handler = this.findObjectionHandler(category, state.guidance.objectionHandlers);

        if (handler) {
          const suggestion = this.createSuggestion(callSid, state.guidanceId, {
            type: 'objection-response',
            content:
              state.language === 'ro' ? (handler.responseRo ?? handler.response) : handler.response,
            trigger: text,
            priority: 'high',
          });

          suggestions.push(suggestion);
          this.emit('guidance:objection-detected', callSid, text, handler.response);
        }
      }
    }

    // Check custom objection patterns from guidance
    for (const handler of state.guidance.objectionHandlers) {
      const matchedSuggestion = this.checkCustomObjection(
        handler,
        text,
        callSid,
        state,
        suggestions
      );
      if (matchedSuggestion) {
        suggestions.push(matchedSuggestion);
        this.emit('guidance:objection-detected', callSid, text, handler.response);
      }
    }

    return suggestions;
  }

  /**
   * Check custom objection patterns for a handler
   */
  private checkCustomObjection(
    handler: ObjectionHandler,
    text: string,
    callSid: string,
    state: CallGuidanceState,
    existingSuggestions: GuidanceSuggestion[]
  ): GuidanceSuggestion | null {
    for (const patternStr of handler.objectionPatterns) {
      try {
        const pattern = new RegExp(patternStr, 'i');
        if (!pattern.test(text)) continue;

        const suggestion = this.createSuggestion(callSid, state.guidanceId, {
          type: 'objection-response',
          content:
            state.language === 'ro' ? (handler.responseRo ?? handler.response) : handler.response,
          trigger: text,
          priority: 'high',
        });

        if (!existingSuggestions.some((s) => s.content === suggestion.content)) {
          return suggestion;
        }
      } catch {
        // Invalid regex pattern, skip
      }
    }
    return null;
  }

  /**
   * Find objection handler by category
   */
  private findObjectionHandler(
    category: string,
    handlers: ObjectionHandler[]
  ): ObjectionHandler | null {
    return handlers.find((h) => h.category === category) ?? null;
  }

  /**
   * Find relevant talking points based on message content
   */
  private findRelevantTalkingPoints(
    callSid: string,
    text: string,
    state: CallGuidanceState
  ): GuidanceSuggestion[] {
    const suggestions: GuidanceSuggestion[] = [];
    const lowerText = text.toLowerCase();

    for (const point of state.guidance.keyPoints) {
      if (!point.triggers?.length) {
        continue;
      }

      const triggered = point.triggers.some((trigger) => lowerText.includes(trigger.toLowerCase()));

      if (triggered) {
        const suggestion = this.createSuggestion(callSid, state.guidanceId, {
          type: 'talking-point',
          content: state.language === 'ro' ? (point.contentRo ?? point.content) : point.content,
          trigger: text,
          priority: point.priority,
        });

        suggestions.push(suggestion);
      }
    }

    return suggestions;
  }

  /**
   * Create a suggestion object
   */
  private createSuggestion(
    callSid: string,
    guidanceId: string,
    data: {
      type: GuidanceSuggestion['type'];
      content: string;
      trigger?: string;
      priority?: GuidanceSuggestion['priority'];
    }
  ): GuidanceSuggestion {
    const suggestion: GuidanceSuggestion = {
      id: crypto.randomUUID(),
      callSid,
      guidanceId,
      type: data.type,
      content: data.content,
      trigger: data.trigger,
      priority: data.priority ?? 'medium',
      confidence: 1,
      timestamp: new Date(),
      acknowledged: false,
    };

    GuidanceSuggestionSchema.parse(suggestion);
    return suggestion;
  }

  /**
   * Acknowledge a suggestion
   */
  acknowledgeSuggestion(callSid: string, suggestionId: string): boolean {
    const state = this.activeCallGuidance.get(callSid);
    if (!state) {
      return false;
    }

    const suggestion = state.suggestions.find((s) => s.id === suggestionId);
    if (suggestion) {
      suggestion.acknowledged = true;
      return true;
    }

    return false;
  }

  /**
   * Get all suggestions for a call
   */
  getSuggestions(callSid: string): GuidanceSuggestion[] {
    const state = this.activeCallGuidance.get(callSid);
    return state?.suggestions ?? [];
  }

  /**
   * Get pending (unacknowledged) suggestions
   */
  getPendingSuggestions(callSid: string): GuidanceSuggestion[] {
    const state = this.activeCallGuidance.get(callSid);
    return state?.suggestions.filter((s) => !s.acknowledged) ?? [];
  }

  // ==========================================================================
  // Collected Data
  // ==========================================================================

  /**
   * Get collected data for a call
   */
  getCollectedData(callSid: string): Record<string, unknown> {
    const state = this.activeCallGuidance.get(callSid);
    return state?.collectedData ?? {};
  }

  /**
   * Update collected data
   */
  updateCollectedData(callSid: string, data: Record<string, unknown>): void {
    const state = this.activeCallGuidance.get(callSid);
    if (state) {
      Object.assign(state.collectedData, data);
    }
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Get active call count
   */
  getActiveCallCount(): number {
    return this.activeCallGuidance.size;
  }

  /**
   * Get all active call SIDs
   */
  getActiveCallSids(): string[] {
    return Array.from(this.activeCallGuidance.keys());
  }

  /**
   * Check if a call has guidance loaded
   */
  hasGuidance(callSid: string): boolean {
    return this.activeCallGuidance.has(callSid);
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.activeCallGuidance.clear();
    this.removeAllListeners();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

let guidanceServiceInstance: GuidanceService | null = null;

/**
 * Create or get the guidance service singleton
 */
export function getGuidanceService(
  repository: IGuidanceRepository,
  config?: GuidanceServiceConfig
): GuidanceService {
  guidanceServiceInstance ??= new GuidanceService(repository, config);
  return guidanceServiceInstance;
}

/**
 * Reset the guidance service (for testing)
 */
export function resetGuidanceService(): void {
  if (guidanceServiceInstance) {
    guidanceServiceInstance.destroy();
    guidanceServiceInstance = null;
  }
}
