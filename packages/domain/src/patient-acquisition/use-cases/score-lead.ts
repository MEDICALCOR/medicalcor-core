/**
 * @fileoverview ScoreLeadUseCase
 *
 * Banking/Medical Grade Use Case for Lead Scoring.
 * Pure domain logic extracted from Trigger.dev workflows.
 *
 * @module domain/patient-acquisition/use-cases/score-lead
 *
 * DESIGN PRINCIPLES:
 * 1. SINGLE RESPONSIBILITY - Only handles lead scoring orchestration
 * 2. DEPENDENCY INVERSION - Depends on interfaces, not implementations
 * 3. TESTABLE IN ISOLATION - No infrastructure dependencies
 * 4. IDEMPOTENT - Safe to retry with same correlation ID
 */

import crypto from 'crypto';
import type { IAIGateway, LeadScoringContext, AIScoringResult } from '../../shared-kernel/repository-interfaces/ai-gateway.js';
import type { ILeadRepository, Lead, ScoringMetadata } from '../../shared-kernel/repository-interfaces/lead-repository.js';
import type { ICrmGateway } from '../../shared-kernel/repository-interfaces/crm-gateway.js';
import { LeadScore, type LeadClassification } from '../../shared-kernel/value-objects/lead-score.js';
import { PhoneNumber } from '../../shared-kernel/value-objects/phone-number.js';
import type {
  LeadScoredEvent,
  LeadQualifiedEvent,
  LeadScoredPayload,
  LeadQualifiedPayload,
} from '../../shared-kernel/domain-events/lead-events.js';
import {
  createLeadScoredEvent,
  createLeadQualifiedEvent,
  createEventMetadata,
} from '../../shared-kernel/domain-events/lead-events.js';

// ============================================================================
// USE CASE INPUT/OUTPUT TYPES
// ============================================================================

/**
 * Score Lead Use Case Input
 */
export interface ScoreLeadInput {
  /** Phone number in E.164 format */
  readonly phone: string;

  /** Current message content */
  readonly message: string;

  /** Message channel */
  readonly channel: 'whatsapp' | 'voice' | 'web' | 'hubspot';

  /** HubSpot contact ID (optional) */
  readonly hubspotContactId?: string;

  /** Previous message history */
  readonly messageHistory?: readonly MessageHistoryEntry[];

  /** Correlation ID for tracing */
  readonly correlationId: string;

  /** Idempotency key (prevents duplicate processing) */
  readonly idempotencyKey?: string;
}

/**
 * Message history entry
 */
export interface MessageHistoryEntry {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
}

/**
 * Score Lead Use Case Output
 */
export interface ScoreLeadOutput {
  /** Whether scoring was successful */
  readonly success: boolean;

  /** Lead's unique identifier */
  readonly leadId: string;

  /** Numeric score (1-5) */
  readonly score: number;

  /** Classification */
  readonly classification: LeadClassification;

  /** Scoring confidence */
  readonly confidence: number;

  /** Scoring method used */
  readonly method: 'ai' | 'rule_based';

  /** Suggested next action */
  readonly suggestedAction: string;

  /** Reasoning for the score */
  readonly reasoning: string;

  /** Detected procedures of interest */
  readonly procedureInterest?: string[];

  /** Whether budget was mentioned */
  readonly budgetMentioned?: boolean;

  /** Urgency indicators found */
  readonly urgencyIndicators?: string[];

  /** Domain events emitted */
  readonly events: readonly (LeadScoredEvent | LeadQualifiedEvent)[];

  /** Whether lead was newly qualified */
  readonly wasQualified: boolean;
}

/**
 * Score Lead Use Case Error
 */
export interface ScoreLeadError {
  readonly code: ScoreLeadErrorCode;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

export type ScoreLeadErrorCode =
  | 'INVALID_PHONE'
  | 'LEAD_NOT_FOUND'
  | 'SCORING_FAILED'
  | 'CRM_UPDATE_FAILED'
  | 'DUPLICATE_REQUEST'
  | 'VALIDATION_ERROR';

/**
 * Score Lead Result
 */
export type ScoreLeadResult =
  | { success: true; value: ScoreLeadOutput }
  | { success: false; error: ScoreLeadError };

// ============================================================================
// USE CASE DEPENDENCIES
// ============================================================================

/**
 * Use case dependencies (injected via constructor)
 */
export interface ScoreLeadDependencies {
  readonly leadRepository: ILeadRepository;
  readonly crmGateway: ICrmGateway;
  readonly aiGateway: IAIGateway;
  readonly eventPublisher: EventPublisher;
  readonly idempotencyStore?: IdempotencyStore;
}

/**
 * Event publisher interface
 */
export interface EventPublisher {
  publish(event: LeadScoredEvent | LeadQualifiedEvent): Promise<void>;
}

/**
 * Idempotency store interface
 */
export interface IdempotencyStore {
  exists(key: string): Promise<boolean>;
  set(key: string, result: ScoreLeadOutput, ttlSeconds: number): Promise<void>;
  get(key: string): Promise<ScoreLeadOutput | null>;
}

// ============================================================================
// USE CASE IMPLEMENTATION
// ============================================================================

/**
 * ScoreLeadUseCase - Banking Grade Lead Scoring
 *
 * Orchestrates lead scoring with AI or rule-based fallback.
 * This is a pure domain use case with no infrastructure dependencies.
 *
 * @example
 * ```typescript
 * const useCase = new ScoreLeadUseCase({
 *   leadRepository: postgresLeadRepository,
 *   crmGateway: hubspotGateway,
 *   aiGateway: openaiGateway,
 *   eventPublisher: kafkaPublisher
 * });
 *
 * const result = await useCase.execute({
 *   phone: '+40721234567',
 *   message: 'Vreau All-on-4, cat costa?',
 *   channel: 'whatsapp',
 *   correlationId: 'trace-123'
 * });
 *
 * if (result.success) {
 *   console.log(result.value.classification); // 'HOT'
 *   console.log(result.value.wasQualified); // true
 * }
 * ```
 */
export class ScoreLeadUseCase {
  private readonly leadRepository: ILeadRepository;
  private readonly crmGateway: ICrmGateway;
  private readonly aiGateway: IAIGateway;
  private readonly eventPublisher: EventPublisher;
  private readonly idempotencyStore?: IdempotencyStore;

  constructor(deps: ScoreLeadDependencies) {
    this.leadRepository = deps.leadRepository;
    this.crmGateway = deps.crmGateway;
    this.aiGateway = deps.aiGateway;
    this.eventPublisher = deps.eventPublisher;
    // Only assign idempotencyStore if defined (exactOptionalPropertyTypes compliance)
    if (deps.idempotencyStore !== undefined) {
      this.idempotencyStore = deps.idempotencyStore;
    }
  }

  /**
   * Execute the use case
   */
  async execute(input: ScoreLeadInput): Promise<ScoreLeadResult> {
    // =========================================================================
    // STEP 1: Validate Input
    // =========================================================================
    const validationResult = this.validateInput(input);
    if (!validationResult.success) {
      return validationResult;
    }

    // =========================================================================
    // STEP 2: Check Idempotency
    // =========================================================================
    if (input.idempotencyKey && this.idempotencyStore) {
      const existingResult = await this.idempotencyStore.get(input.idempotencyKey);
      if (existingResult) {
        return { success: true, value: existingResult };
      }
    }

    // =========================================================================
    // STEP 3: Parse Phone Number
    // =========================================================================
    const phoneResult = PhoneNumber.parse(input.phone);
    if (!phoneResult.success) {
      return {
        success: false,
        error: {
          code: 'INVALID_PHONE',
          message: phoneResult.error,
          details: { phone: input.phone },
        },
      };
    }
    const phone = phoneResult.value;

    // =========================================================================
    // STEP 4: Find or Create Lead
    // =========================================================================
    let lead: Lead | null = null;
    const leadResult = await this.leadRepository.findByPhone(phone);
    if (leadResult.success) {
      lead = leadResult.value;
    }

    // Get previous score for comparison
    const previousScore = lead?.score;

    // =========================================================================
    // STEP 5: Build Scoring Context
    // =========================================================================
    const scoringContext: LeadScoringContext = {
      phone: phone.e164,
      channel: input.channel,
      language: phone.getPreferredLanguage(),
      messageHistory: this.buildMessageHistory(input),
    };
    
    // Only add optional properties if defined (exactOptionalPropertyTypes compliance)
    if (lead?.utmSource !== undefined) {
      (scoringContext as { utmSource: string }).utmSource = lead.utmSource;
    }
    if (lead?.utmCampaign !== undefined) {
      (scoringContext as { utmCampaign: string }).utmCampaign = lead.utmCampaign;
    }
    if (previousScore !== undefined) {
      (scoringContext as { previousScore: LeadScore }).previousScore = previousScore;
    }

    // =========================================================================
    // STEP 6: Perform Scoring (AI or Rule-based)
    // =========================================================================
    let scoringResult: AIScoringResult;
    let scoringMethod: 'ai' | 'rule_based' = 'ai';

    const aiAvailable = await this.aiGateway.isScoringAvailable();

    if (aiAvailable) {
      const aiResult = await this.aiGateway.scoreLead(scoringContext);
      if (aiResult.success) {
        scoringResult = aiResult.value;
      } else {
        // Fallback to rule-based
        scoringMethod = 'rule_based';
        scoringResult = this.ruleBasedScoring(scoringContext);
      }
    } else {
      scoringMethod = 'rule_based';
      scoringResult = this.ruleBasedScoring(scoringContext);
    }

    // =========================================================================
    // STEP 7: Update Lead Score in Repository
    // =========================================================================
    // GDPR/Privacy: Generate UUID for new leads instead of using phone number as ID
    const leadId = lead?.id ?? `lead_${crypto.randomUUID()}`;

    const scoringMetadata: ScoringMetadata = {
      method: scoringMethod,
      reasoning: scoringResult.reasoning,
      confidence: scoringResult.score.confidence,
      procedureInterest: [...scoringResult.procedureInterest],
      urgencyIndicators: [...scoringResult.urgencyIndicators],
      budgetMentioned: scoringResult.budgetMentioned,
    };

    if (lead) {
      await this.leadRepository.updateScore(lead.id, scoringResult.score, scoringMetadata);
    }

    // =========================================================================
    // STEP 8: Update CRM (HubSpot)
    // =========================================================================
    if (input.hubspotContactId) {
      await this.crmGateway.updateContactScore(
        input.hubspotContactId,
        scoringResult.score,
        {
          method: scoringMethod,
          reasoning: scoringResult.reasoning,
          procedureInterest: [...scoringResult.procedureInterest],
          urgencyIndicators: [...scoringResult.urgencyIndicators],
          budgetMentioned: scoringResult.budgetMentioned,
        }
      );
    }

    // =========================================================================
    // STEP 9: Emit Domain Events
    // =========================================================================
    const events: (LeadScoredEvent | LeadQualifiedEvent)[] = [];
    const metadata = createEventMetadata(input.correlationId, 'score-lead-use-case');

    // LeadScored event (always)
    // Build payload using object spread with conditional properties (exactOptionalPropertyTypes compliance)
    const scoredPayload: LeadScoredPayload = {
      phone: phone.e164,
      channel: input.channel,
      score: scoringResult.score.numericValue,
      classification: scoringResult.score.classification,
      confidence: scoringResult.score.confidence,
      method: scoringMethod,
      reasoning: scoringResult.reasoning,
      suggestedAction: scoringResult.suggestedAction,
      budgetMentioned: scoringResult.budgetMentioned,
      ...(input.hubspotContactId !== undefined && { hubspotContactId: input.hubspotContactId }),
      ...(scoringResult.detectedIntent !== undefined && { detectedIntent: scoringResult.detectedIntent }),
      ...(scoringResult.urgencyIndicators.length > 0 && { urgencyIndicators: scoringResult.urgencyIndicators }),
      ...(scoringResult.procedureInterest.length > 0 && { procedureInterest: scoringResult.procedureInterest }),
      ...(previousScore?.numericValue !== undefined && { previousScore: previousScore.numericValue }),
      ...(previousScore?.classification !== undefined && { previousClassification: previousScore.classification }),
    };
    
    const scoredEvent = createLeadScoredEvent(leadId, scoredPayload, metadata);

    events.push(scoredEvent);
    await this.eventPublisher.publish(scoredEvent);

    // LeadQualified event (only if newly qualified)
    const wasQualified = scoringResult.score.isHot() && (!previousScore || !previousScore.isHot());
    if (wasQualified) {
      // Build qualified payload using object spread with conditional properties
      const qualifiedPayload: LeadQualifiedPayload = {
        phone: phone.e164,
        score: scoringResult.score.numericValue,
        classification: 'HOT',
        qualificationReason: scoringResult.reasoning,
        procedureInterest: scoringResult.procedureInterest,
        ...(input.hubspotContactId !== undefined && { hubspotContactId: input.hubspotContactId }),
      };
      
      const qualifiedEvent = createLeadQualifiedEvent(leadId, qualifiedPayload, metadata);

      events.push(qualifiedEvent);
      await this.eventPublisher.publish(qualifiedEvent);
    }

    // =========================================================================
    // STEP 10: Build Output
    // =========================================================================
    const output: ScoreLeadOutput = {
      success: true,
      leadId,
      score: scoringResult.score.numericValue,
      classification: scoringResult.score.classification,
      confidence: scoringResult.score.confidence,
      method: scoringMethod,
      suggestedAction: scoringResult.suggestedAction,
      reasoning: scoringResult.reasoning,
      procedureInterest: [...scoringResult.procedureInterest],
      budgetMentioned: scoringResult.budgetMentioned,
      urgencyIndicators: [...scoringResult.urgencyIndicators],
      events,
      wasQualified,
    };

    // =========================================================================
    // STEP 11: Store for Idempotency
    // =========================================================================
    if (input.idempotencyKey && this.idempotencyStore) {
      await this.idempotencyStore.set(input.idempotencyKey, output, 3600); // 1 hour TTL
    }

    return { success: true, value: output };
  }

  /**
   * Validate input
   */
  private validateInput(input: ScoreLeadInput): ScoreLeadResult | { success: true } {
    if (!input.phone) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Phone number is required',
        },
      };
    }

    if (!input.message) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message content is required',
        },
      };
    }

    if (!input.correlationId) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Correlation ID is required for tracing',
        },
      };
    }

    return { success: true };
  }

  /**
   * Build message history for scoring context
   */
  private buildMessageHistory(input: ScoreLeadInput): Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: Date;
  }> {
    const history: Array<{
      role: 'user' | 'assistant' | 'system';
      content: string;
      timestamp: Date;
    }> = [];

    // Add previous messages
    if (input.messageHistory) {
      for (const msg of input.messageHistory) {
        history.push({
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        });
      }
    }

    // Add current message
    history.push({
      role: 'user',
      content: input.message,
      timestamp: new Date(),
    });

    return history;
  }

  /**
   * Rule-based scoring fallback
   *
   * BUSINESS RULES:
   * - Score 5 (HOT): All-on-X + budget mentioned
   * - Score 4 (HOT): All-on-X OR implant + urgency/budget
   * - Score 3 (WARM): Procedure interest
   * - Score 2 (COLD): General inquiry
   * - Score 1 (UNQUALIFIED): No clear intent
   */
  private ruleBasedScoring(context: LeadScoringContext): AIScoringResult {
    const allMessages = context.messageHistory.map((m) => m.content).join(' ');
    const lowerContent = allMessages.toLowerCase();

    let score = 1;
    const indicators: string[] = [];
    const procedures: string[] = [];

    // HOT indicators
    const allOnXKeywords = ['all-on-4', 'all-on-x', 'all on 4', 'all on x', 'all-on-6', 'arcada completa'];
    const implantKeywords = ['implant', 'implante', 'implantologie'];
    const budgetKeywords = ['pret', 'cost', 'buget', 'cat costa', 'finantare', 'rate', 'euro', 'lei'];
    const urgencyKeywords = ['urgent', 'durere', 'imediat', 'cat mai repede', 'maine', 'azi', 'acum'];
    const procedureKeywords = ['fatete', 'veneer', 'albire', 'whitening', 'extractie', 'coroana'];

    // Check for All-on-X interest
    const hasAllOnX = allOnXKeywords.some((k) => lowerContent.includes(k));
    if (hasAllOnX) {
      score = 4;
      indicators.push('all_on_x_interest');
      procedures.push('All-on-X');
    }

    // Check for implant interest
    const hasImplant = implantKeywords.some((k) => lowerContent.includes(k));
    if (hasImplant && !hasAllOnX) {
      score = Math.max(score, 3);
      indicators.push('implant_interest');
      procedures.push('Dental Implants');
    }

    // Check for other procedures
    if (procedureKeywords.some((k) => lowerContent.includes(k))) {
      score = Math.max(score, 3);
      indicators.push('procedure_interest');
    }

    // Budget mention boosts score
    const hasBudget = budgetKeywords.some((k) => lowerContent.includes(k));
    if (hasBudget) {
      if (hasAllOnX) {
        score = 5; // Max score for All-on-X + budget
      } else {
        score = Math.min(score + 1, 5);
      }
      indicators.push('budget_mentioned');
    }

    // Urgency boosts score
    const hasUrgency = urgencyKeywords.some((k) => lowerContent.includes(k));
    if (hasUrgency) {
      score = Math.min(score + 1, 5);
      indicators.push('urgency_detected');
    }

    // Create LeadScore value object
    const leadScore = LeadScore.fromNumeric(score, 0.7);

    // Build result with only defined optional properties (exactOptionalPropertyTypes compliance)
    const result: AIScoringResult = {
      score: leadScore,
      reasoning: `Rule-based scoring: ${indicators.join(', ') || 'no specific indicators detected'}`,
      suggestedAction: this.getSuggestedAction(leadScore.classification, context.language),
      urgencyIndicators: hasUrgency ? ['priority_scheduling_requested'] : [],
      budgetMentioned: hasBudget,
      procedureInterest: procedures,
      tokensUsed: 0,
      latencyMs: 0,
    };
    
    // Add detectedIntent only if there are indicators
    if (indicators.length > 0 && indicators[0] !== undefined) {
      (result as { detectedIntent: string }).detectedIntent = indicators[0];
    }
    
    return result;
  }

  /**
   * Get suggested action based on classification
   */
  private getSuggestedAction(classification: LeadClassification, language?: 'ro' | 'en' | 'de'): string {
    const actions: Record<LeadClassification, Record<string, string>> = {
      HOT: {
        ro: 'Contactați imediat! Lead calificat cu interes explicit. Oferiți detalii despre prețuri și programare.',
        en: 'Contact immediately! Qualified lead with explicit interest. Offer pricing details and scheduling.',
        de: 'Sofort kontaktieren! Qualifizierter Lead mit explizitem Interesse. Preisdetails und Terminierung anbieten.',
      },
      WARM: {
        ro: 'Trimiteți informații suplimentare despre proceduri. Programați follow-up în 24h.',
        en: 'Send additional procedure information. Schedule follow-up in 24h.',
        de: 'Zusätzliche Verfahrensinformationen senden. Follow-up in 24h planen.',
      },
      COLD: {
        ro: 'Adăugați în secvența de nurture. Monitorizați activitatea.',
        en: 'Add to nurture sequence. Monitor activity.',
        de: 'Zur Nurture-Sequenz hinzufügen. Aktivität überwachen.',
      },
      UNQUALIFIED: {
        ro: 'Răspundeți politicos cu informații generale. Nu prioritizați.',
        en: 'Respond politely with general information. Do not prioritize.',
        de: 'Höflich mit allgemeinen Informationen antworten. Nicht priorisieren.',
      },
    };

    const lang = language ?? 'ro';
    return actions[classification][lang] ?? actions[classification]['ro']!;
  }
}
