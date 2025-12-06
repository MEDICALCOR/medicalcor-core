import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ScoreLeadUseCase,
  type ScoreLeadInput,
  type ScoreLeadDependencies,
  type EventPublisher,
  type IdempotencyStore,
  type ScoreLeadOutput,
} from '../score-lead.js';
import type {
  IAIGateway,
  LeadScoringContext,
  AIScoringResult,
} from '../../../shared-kernel/repository-interfaces/ai-gateway.js';
import type {
  ILeadRepository,
  Lead,
  ScoringMetadata,
} from '../../../shared-kernel/repository-interfaces/lead-repository.js';
import type { ICrmGateway } from '../../../shared-kernel/repository-interfaces/crm-gateway.js';
import { LeadScore } from '../../../shared-kernel/value-objects/lead-score.js';
import { PhoneNumber } from '../../../shared-kernel/value-objects/phone-number.js';

/**
 * Tests for ScoreLeadUseCase
 *
 * Covers:
 * - Input validation
 * - Idempotency handling
 * - Phone number parsing
 * - AI scoring
 * - Rule-based scoring fallback
 * - CRM updates
 * - Domain event emission
 * - Lead qualification logic
 */

// ============================================================================
// MOCK FACTORIES
// ============================================================================

function createMockLeadRepository(): ILeadRepository {
  return {
    findById: vi.fn().mockResolvedValue({ success: true, value: null }),
    findByPhone: vi.fn().mockResolvedValue({ success: true, value: null }),
    findByHubSpotContactId: vi.fn().mockResolvedValue({ success: true, value: null }),
    findByEmail: vi.fn().mockResolvedValue({ success: true, value: null }),
    findBySpecification: vi.fn().mockResolvedValue({ success: true, value: [] }),
    countBySpecification: vi.fn().mockResolvedValue({ success: true, value: 0 }),
    existsByPhone: vi.fn().mockResolvedValue({ success: true, value: false }),
    create: vi.fn().mockResolvedValue({ success: true, value: {} as Lead }),
    update: vi.fn().mockResolvedValue({ success: true, value: {} as Lead }),
    updateScore: vi.fn().mockResolvedValue({ success: true, value: {} as Lead }),
    addConversationEntry: vi.fn().mockResolvedValue({ success: true, value: {} as Lead }),
    updateStatus: vi.fn().mockResolvedValue({ success: true, value: {} as Lead }),
    softDelete: vi.fn().mockResolvedValue({ success: true, value: undefined }),
    hardDelete: vi.fn().mockResolvedValue({ success: true, value: undefined }),
    findManyByIds: vi.fn().mockResolvedValue({ success: true, value: new Map() }),
    bulkUpdateScores: vi.fn().mockResolvedValue({ success: true, value: 0 }),
    beginTransaction: vi
      .fn()
      .mockResolvedValue({ id: 'tx-1', startedAt: new Date(), operations: [] }),
    commitTransaction: vi.fn().mockResolvedValue(undefined),
    rollbackTransaction: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockCrmGateway(): ICrmGateway {
  return {
    getContact: vi.fn().mockResolvedValue({ success: true, value: null }),
    findContactByPhone: vi.fn().mockResolvedValue({ success: true, value: null }),
    findContactByEmail: vi.fn().mockResolvedValue({ success: true, value: null }),
    createContact: vi.fn().mockResolvedValue({ success: true, value: {} }),
    updateContact: vi.fn().mockResolvedValue({ success: true, value: {} }),
    upsertContact: vi.fn().mockResolvedValue({ success: true, value: {} }),
    updateContactScore: vi.fn().mockResolvedValue({ success: true, value: {} }),
    deleteContact: vi.fn().mockResolvedValue({ success: true, value: undefined }),
    getDeal: vi.fn().mockResolvedValue({ success: true, value: null }),
    findDealsByContact: vi.fn().mockResolvedValue({ success: true, value: [] }),
    createDeal: vi.fn().mockResolvedValue({ success: true, value: {} }),
    updateDealStage: vi.fn().mockResolvedValue({ success: true, value: {} }),
    createTask: vi.fn().mockResolvedValue({ success: true, value: {} }),
    getPendingTasksForContact: vi.fn().mockResolvedValue({ success: true, value: [] }),
    completeTask: vi.fn().mockResolvedValue({ success: true, value: {} }),
    addNote: vi.fn().mockResolvedValue({ success: true, value: {} }),
    getNotesForContact: vi.fn().mockResolvedValue({ success: true, value: [] }),
    getPipelines: vi.fn().mockResolvedValue({ success: true, value: [] }),
    getPipelineStages: vi.fn().mockResolvedValue({ success: true, value: [] }),
    getOwners: vi.fn().mockResolvedValue({ success: true, value: [] }),
    getOwner: vi.fn().mockResolvedValue({ success: true, value: null }),
    healthCheck: vi
      .fn()
      .mockResolvedValue({ success: true, value: { connected: true, latencyMs: 50 } }),
  };
}

function createMockAIGateway(
  options: { available?: boolean; scoringResult?: AIScoringResult } = {}
): IAIGateway {
  const defaultScore = LeadScore.fromNumeric(3, 0.85);
  const defaultResult: AIScoringResult = {
    score: defaultScore,
    reasoning: 'AI analysis: moderate interest detected',
    suggestedAction: 'Send follow-up information',
    urgencyIndicators: [],
    budgetMentioned: false,
    procedureInterest: ['Dental Implants'],
    tokensUsed: 150,
    latencyMs: 200,
  };

  return {
    scoreLead: vi.fn().mockResolvedValue({
      success: true,
      value: options.scoringResult ?? defaultResult,
    }),
    isScoringAvailable: vi.fn().mockResolvedValue(options.available ?? true),
    detectLanguage: vi.fn().mockResolvedValue({
      success: true,
      value: { detectedLanguage: 'ro', confidence: 0.95, alternatives: [] },
    }),
    translate: vi.fn().mockResolvedValue({
      success: true,
      value: { translatedText: '', sourceLanguage: 'ro', targetLanguage: 'en', confidence: 0.9 },
    }),
    generateResponse: vi.fn().mockResolvedValue({
      success: true,
      value: {
        response: '',
        suggestedActions: [],
        sentiment: 'neutral',
        shouldEscalate: false,
        tokensUsed: 0,
      },
    }),
    analyzeSentiment: vi.fn().mockResolvedValue({
      success: true,
      value: { overall: 'neutral', score: 0, emotions: [] },
    }),
    transcribe: vi.fn().mockResolvedValue({
      success: true,
      value: { text: '', language: 'ro', confidence: 0.9, durationSeconds: 0 },
    }),
    healthCheck: vi.fn().mockResolvedValue({
      success: true,
      value: { available: true, latencyMs: 100, model: 'gpt-4', provider: 'openai' },
    }),
    getUsageStats: vi.fn().mockResolvedValue({
      success: true,
      value: {
        tokensUsedToday: 1000,
        tokensLimit: 100000,
        requestsToday: 50,
        averageLatencyMs: 200,
        costEstimateUsd: 0.5,
      },
    }),
  };
}

function createMockEventPublisher(): EventPublisher {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockIdempotencyStore(): IdempotencyStore {
  return {
    exists: vi.fn().mockResolvedValue(false),
    set: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
  };
}

function createDependencies(overrides: Partial<ScoreLeadDependencies> = {}): ScoreLeadDependencies {
  return {
    leadRepository: createMockLeadRepository(),
    crmGateway: createMockCrmGateway(),
    aiGateway: createMockAIGateway(),
    eventPublisher: createMockEventPublisher(),
    ...overrides,
  };
}

function createValidInput(overrides: Partial<ScoreLeadInput> = {}): ScoreLeadInput {
  return {
    phone: '+40700000001',
    message: 'Bună ziua, aș dori informații despre implanturi dentare',
    channel: 'whatsapp',
    correlationId: 'corr-123',
    ...overrides,
  };
}

function createMockLead(overrides: Partial<Lead> = {}): Lead {
  const phoneResult = PhoneNumber.parse('+40700000001');
  if (!phoneResult.success) throw new Error('Invalid phone');

  return {
    id: 'lead-123',
    phone: phoneResult.value,
    source: 'whatsapp',
    status: 'new',
    primarySymptoms: [],
    procedureInterest: [],
    conversationHistory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    version: 1,
    ...overrides,
  };
}

// ============================================================================
// INPUT VALIDATION TESTS
// ============================================================================

describe('ScoreLeadUseCase', () => {
  describe('Input Validation', () => {
    it('should reject missing phone number', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute({
        phone: '',
        message: 'Test message',
        channel: 'whatsapp',
        correlationId: 'corr-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('Phone');
      }
    });

    it('should reject missing message', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute({
        phone: '+40700000001',
        message: '',
        channel: 'whatsapp',
        correlationId: 'corr-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('Message');
      }
    });

    it('should reject missing correlationId', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute({
        phone: '+40700000001',
        message: 'Test message',
        channel: 'whatsapp',
        correlationId: '',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
        expect(result.error.message).toContain('Correlation');
      }
    });

    it('should reject invalid phone number format', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute({
        phone: 'not-a-phone',
        message: 'Test message',
        channel: 'whatsapp',
        correlationId: 'corr-123',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PHONE');
      }
    });

    it('should accept valid input', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);
      const input = createValidInput();

      const result = await useCase.execute(input);

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // IDEMPOTENCY TESTS
  // ============================================================================

  describe('Idempotency', () => {
    it('should return cached result for duplicate idempotency key', async () => {
      const cachedOutput: ScoreLeadOutput = {
        success: true,
        leadId: 'lead-cached',
        score: 4,
        classification: 'HOT',
        confidence: 0.9,
        method: 'ai',
        suggestedAction: 'Contact immediately',
        reasoning: 'Cached result',
        events: [],
        wasQualified: true,
      };

      const idempotencyStore = createMockIdempotencyStore();
      vi.mocked(idempotencyStore.get).mockResolvedValue(cachedOutput);

      const deps = createDependencies({ idempotencyStore });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute({
        ...createValidInput(),
        idempotencyKey: 'idem-123',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.leadId).toBe('lead-cached');
        expect(result.value.reasoning).toBe('Cached result');
      }
      expect(idempotencyStore.get).toHaveBeenCalledWith('idem-123');
    });

    it('should store result for new idempotency key', async () => {
      const idempotencyStore = createMockIdempotencyStore();
      const deps = createDependencies({ idempotencyStore });
      const useCase = new ScoreLeadUseCase(deps);

      await useCase.execute({
        ...createValidInput(),
        idempotencyKey: 'new-idem-key',
      });

      expect(idempotencyStore.set).toHaveBeenCalledWith('new-idem-key', expect.any(Object), 3600);
    });

    it('should process without idempotency store', async () => {
      const deps = createDependencies();
      // No idempotency store
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(createValidInput());

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // AI SCORING TESTS
  // ============================================================================

  describe('AI Scoring', () => {
    it('should use AI scoring when available', async () => {
      const hotScore = LeadScore.fromNumeric(5, 0.95);
      const aiResult: AIScoringResult = {
        score: hotScore,
        reasoning: 'High intent: All-on-4 interest with budget discussion',
        suggestedAction: 'Call immediately',
        detectedIntent: 'all_on_x_interest',
        urgencyIndicators: ['urgent', 'pain'],
        budgetMentioned: true,
        procedureInterest: ['All-on-4', 'Dental Implants'],
        tokensUsed: 200,
        latencyMs: 150,
      };

      const aiGateway = createMockAIGateway({ available: true, scoringResult: aiResult });
      const deps = createDependencies({ aiGateway });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(
        createValidInput({
          message: 'Vreau All-on-4, cat costa? Am dureri si vreau rapid',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.method).toBe('ai');
        expect(result.value.score).toBe(5);
        expect(result.value.classification).toBe('HOT');
        expect(result.value.budgetMentioned).toBe(true);
        expect(result.value.procedureInterest).toContain('All-on-4');
      }
      expect(aiGateway.scoreLead).toHaveBeenCalled();
    });

    it('should fall back to rule-based when AI unavailable', async () => {
      const aiGateway = createMockAIGateway({ available: false });
      const deps = createDependencies({ aiGateway });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(
        createValidInput({
          message: 'Vreau All-on-4',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.method).toBe('rule_based');
      }
      expect(aiGateway.scoreLead).not.toHaveBeenCalled();
    });

    it('should fall back to rule-based when AI fails', async () => {
      const aiGateway = createMockAIGateway({ available: true });
      vi.mocked(aiGateway.scoreLead).mockResolvedValue({
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'AI request timed out',
          retryable: true,
          fallbackAvailable: true,
        },
      });

      const deps = createDependencies({ aiGateway });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(
        createValidInput({
          message: 'Vreau All-on-4',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.method).toBe('rule_based');
      }
    });
  });

  // ============================================================================
  // RULE-BASED SCORING TESTS
  // ============================================================================

  describe('Rule-Based Scoring', () => {
    let deps: ScoreLeadDependencies;
    let useCase: ScoreLeadUseCase;

    beforeEach(() => {
      deps = createDependencies({
        aiGateway: createMockAIGateway({ available: false }),
      });
      useCase = new ScoreLeadUseCase(deps);
    });

    it('should score 5 for All-on-X with budget mention', async () => {
      const result = await useCase.execute(
        createValidInput({
          message: 'Vreau All-on-4, cat costa?',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBe(5);
        expect(result.value.classification).toBe('HOT');
      }
    });

    it('should score 4 for All-on-X without budget', async () => {
      const result = await useCase.execute(
        createValidInput({
          message: 'Sunt interesat de All-on-4',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBe(4);
        expect(result.value.classification).toBe('HOT');
      }
    });

    it('should score 5 for All-on-X with urgency', async () => {
      const result = await useCase.execute(
        createValidInput({
          message: 'Am nevoie urgent de All-on-4',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBe(5);
        expect(result.value.classification).toBe('HOT');
      }
    });

    it('should score 3 for implant interest', async () => {
      const result = await useCase.execute(
        createValidInput({
          message: 'Vreau informatii despre implante',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBe(3);
        expect(result.value.classification).toBe('WARM');
      }
    });

    it('should score 4 for implant with budget', async () => {
      const result = await useCase.execute(
        createValidInput({
          message: 'Cat costa un implant dentar?',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBe(4);
        expect(result.value.classification).toBe('HOT');
      }
    });

    it('should score 3 for other procedure interest', async () => {
      const result = await useCase.execute(
        createValidInput({
          message: 'Vreau fatete dentare',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBe(3);
        expect(result.value.classification).toBe('WARM');
      }
    });

    it('should score 1 for generic message without indicators', async () => {
      const result = await useCase.execute(
        createValidInput({
          message: 'Buna ziua',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.score).toBe(1);
        expect(result.value.classification).toBe('UNQUALIFIED');
      }
    });

    it('should detect budget keywords', async () => {
      const budgetKeywords = ['pret', 'cost', 'euro', 'lei', 'finantare', 'rate'];

      for (const keyword of budgetKeywords) {
        const result = await useCase.execute(
          createValidInput({
            message: `Informatii ${keyword} implant`,
          })
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.budgetMentioned).toBe(true);
        }
      }
    });

    it('should detect urgency keywords', async () => {
      const urgencyKeywords = ['urgent', 'durere', 'imediat', 'maine', 'azi'];

      for (const keyword of urgencyKeywords) {
        const result = await useCase.execute(
          createValidInput({
            message: `${keyword} implant`,
          })
        );

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value.urgencyIndicators).toBeDefined();
          expect(result.value.urgencyIndicators!.length).toBeGreaterThan(0);
        }
      }
    });

    it('should handle message history in scoring', async () => {
      const result = await useCase.execute(
        createValidInput({
          message: 'Da, sunt interesat',
          messageHistory: [
            {
              role: 'assistant',
              content: 'Buna ziua! Cu ce va putem ajuta?',
              timestamp: new Date().toISOString(),
            },
            { role: 'user', content: 'Vreau All-on-4', timestamp: new Date().toISOString() },
          ],
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should score based on full history including All-on-4 mention
        expect(result.value.score).toBeGreaterThanOrEqual(4);
      }
    });
  });

  // ============================================================================
  // LEAD REPOSITORY TESTS
  // ============================================================================

  describe('Lead Repository Integration', () => {
    it('should find existing lead by phone', async () => {
      const existingLead = createMockLead({
        score: LeadScore.fromNumeric(2, 0.7),
      });

      const leadRepository = createMockLeadRepository();
      vi.mocked(leadRepository.findByPhone).mockResolvedValue({
        success: true,
        value: existingLead,
      });

      const deps = createDependencies({ leadRepository });
      const useCase = new ScoreLeadUseCase(deps);

      await useCase.execute(createValidInput());

      expect(leadRepository.findByPhone).toHaveBeenCalled();
      expect(leadRepository.updateScore).toHaveBeenCalledWith(
        existingLead.id,
        expect.any(Object),
        expect.any(Object)
      );
    });

    it('should create new lead ID for new phone numbers', async () => {
      const leadRepository = createMockLeadRepository();
      vi.mocked(leadRepository.findByPhone).mockResolvedValue({
        success: true,
        value: null,
      });

      const deps = createDependencies({ leadRepository });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(createValidInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.leadId).toMatch(/^lead_/);
      }
      // Should not call updateScore for new leads without existing record
      expect(leadRepository.updateScore).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // CRM GATEWAY TESTS
  // ============================================================================

  describe('CRM Gateway Integration', () => {
    it('should update CRM when hubspotContactId provided', async () => {
      const crmGateway = createMockCrmGateway();
      const deps = createDependencies({ crmGateway });
      const useCase = new ScoreLeadUseCase(deps);

      await useCase.execute(
        createValidInput({
          hubspotContactId: 'hs-contact-123',
        })
      );

      expect(crmGateway.updateContactScore).toHaveBeenCalledWith(
        'hs-contact-123',
        expect.any(Object),
        expect.objectContaining({
          method: expect.any(String),
          reasoning: expect.any(String),
        })
      );
    });

    it('should not update CRM when hubspotContactId not provided', async () => {
      const crmGateway = createMockCrmGateway();
      const deps = createDependencies({ crmGateway });
      const useCase = new ScoreLeadUseCase(deps);

      await useCase.execute(createValidInput());

      expect(crmGateway.updateContactScore).not.toHaveBeenCalled();
    });
  });

  // ============================================================================
  // DOMAIN EVENTS TESTS
  // ============================================================================

  describe('Domain Events', () => {
    it('should emit LeadScored event for every scoring', async () => {
      const eventPublisher = createMockEventPublisher();
      const deps = createDependencies({ eventPublisher });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(createValidInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.events.length).toBeGreaterThanOrEqual(1);
        expect(result.value.events[0]!.type).toBe('lead.scored');
      }
      expect(eventPublisher.publish).toHaveBeenCalled();
    });

    it('should emit LeadQualified event when lead becomes HOT', async () => {
      // Use AI to return a HOT score
      const hotScore = LeadScore.fromNumeric(5, 0.95);
      const aiResult: AIScoringResult = {
        score: hotScore,
        reasoning: 'High intent lead',
        suggestedAction: 'Call immediately',
        urgencyIndicators: [],
        budgetMentioned: true,
        procedureInterest: ['All-on-4'],
        tokensUsed: 100,
        latencyMs: 100,
      };

      const eventPublisher = createMockEventPublisher();
      const deps = createDependencies({
        eventPublisher,
        aiGateway: createMockAIGateway({ available: true, scoringResult: aiResult }),
      });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(createValidInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.wasQualified).toBe(true);
        const qualifiedEvent = result.value.events.find((e) => e.type === 'lead.qualified');
        expect(qualifiedEvent).toBeDefined();
      }
    });

    it('should NOT emit LeadQualified when lead was already HOT', async () => {
      // Existing HOT lead
      const existingLead = createMockLead({
        score: LeadScore.fromNumeric(5, 0.9), // Already HOT
      });

      const leadRepository = createMockLeadRepository();
      vi.mocked(leadRepository.findByPhone).mockResolvedValue({
        success: true,
        value: existingLead,
      });

      // New HOT score
      const hotScore = LeadScore.fromNumeric(5, 0.95);
      const aiResult: AIScoringResult = {
        score: hotScore,
        reasoning: 'Still high intent',
        suggestedAction: 'Continue engagement',
        urgencyIndicators: [],
        budgetMentioned: false,
        procedureInterest: [],
        tokensUsed: 100,
        latencyMs: 100,
      };

      const deps = createDependencies({
        leadRepository,
        aiGateway: createMockAIGateway({ available: true, scoringResult: aiResult }),
      });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(createValidInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.wasQualified).toBe(false);
        const qualifiedEvent = result.value.events.find((e) => e.type === 'lead.qualified');
        expect(qualifiedEvent).toBeUndefined();
      }
    });

    it('should include correlation ID in event metadata', async () => {
      const eventPublisher = createMockEventPublisher();
      const deps = createDependencies({ eventPublisher });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(
        createValidInput({
          correlationId: 'trace-abc-123',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        const event = result.value.events[0];
        expect(event?.metadata.correlationId).toBe('trace-abc-123');
      }
    });
  });

  // ============================================================================
  // OUTPUT STRUCTURE TESTS
  // ============================================================================

  describe('Output Structure', () => {
    it('should return complete output structure', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(createValidInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toMatchObject({
          success: true,
          leadId: expect.any(String),
          score: expect.any(Number),
          classification: expect.stringMatching(/^(HOT|WARM|COLD|UNQUALIFIED)$/),
          confidence: expect.any(Number),
          method: expect.stringMatching(/^(ai|rule_based)$/),
          suggestedAction: expect.any(String),
          reasoning: expect.any(String),
          events: expect.any(Array),
          wasQualified: expect.any(Boolean),
        });
      }
    });

    it('should include procedure interest in output', async () => {
      const aiResult: AIScoringResult = {
        score: LeadScore.fromNumeric(4, 0.9),
        reasoning: 'Interest in implants',
        suggestedAction: 'Follow up',
        urgencyIndicators: [],
        budgetMentioned: false,
        procedureInterest: ['Dental Implants', 'All-on-4'],
        tokensUsed: 100,
        latencyMs: 100,
      };

      const deps = createDependencies({
        aiGateway: createMockAIGateway({ available: true, scoringResult: aiResult }),
      });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(createValidInput());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value.procedureInterest).toContain('Dental Implants');
        expect(result.value.procedureInterest).toContain('All-on-4');
      }
    });
  });

  // ============================================================================
  // SUGGESTED ACTION TESTS
  // ============================================================================

  describe('Suggested Actions', () => {
    it('should return Romanian action by default for Romanian phone', async () => {
      const deps = createDependencies({
        aiGateway: createMockAIGateway({ available: false }),
      });
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(
        createValidInput({
          phone: '+40700000001', // Romanian phone
          message: 'Vreau All-on-4',
        })
      );

      expect(result.success).toBe(true);
      if (result.success) {
        // Should be in Romanian for HOT leads
        expect(result.value.suggestedAction).toContain('imediat');
      }
    });
  });

  // ============================================================================
  // EDGE CASES
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle all supported channels', async () => {
      const channels = ['whatsapp', 'voice', 'web', 'hubspot'] as const;
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      for (const channel of channels) {
        const result = await useCase.execute(createValidInput({ channel }));
        expect(result.success).toBe(true);
      }
    });

    it('should handle empty message history', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(
        createValidInput({
          messageHistory: [],
        })
      );

      expect(result.success).toBe(true);
    });

    it('should handle international phone numbers', async () => {
      // Use valid E.164 format phone numbers
      const phones = ['+12025551234', '+442071234567', '+4915123456789'];
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      for (const phone of phones) {
        const result = await useCase.execute(createValidInput({ phone }));
        expect(result.success).toBe(true);
      }
    });

    it('should handle very long messages', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      const longMessage = 'Vreau informatii '.repeat(500);
      const result = await useCase.execute(
        createValidInput({
          message: longMessage,
        })
      );

      expect(result.success).toBe(true);
    });

    it('should handle special characters in message', async () => {
      const deps = createDependencies();
      const useCase = new ScoreLeadUseCase(deps);

      const result = await useCase.execute(
        createValidInput({
          message: 'Vreau All-on-4! 😀 <script>alert("test")</script>',
        })
      );

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // SCORING METADATA TESTS
  // ============================================================================

  describe('Scoring Metadata', () => {
    it('should pass correct metadata to repository', async () => {
      const existingLead = createMockLead();
      const leadRepository = createMockLeadRepository();
      vi.mocked(leadRepository.findByPhone).mockResolvedValue({
        success: true,
        value: existingLead,
      });

      const deps = createDependencies({ leadRepository });
      const useCase = new ScoreLeadUseCase(deps);

      await useCase.execute(createValidInput());

      expect(leadRepository.updateScore).toHaveBeenCalledWith(
        existingLead.id,
        expect.any(Object),
        expect.objectContaining({
          method: expect.any(String),
          reasoning: expect.any(String),
          confidence: expect.any(Number),
        })
      );
    });

    it('should include procedure interest in metadata', async () => {
      const existingLead = createMockLead();
      const leadRepository = createMockLeadRepository();
      vi.mocked(leadRepository.findByPhone).mockResolvedValue({
        success: true,
        value: existingLead,
      });

      const aiResult: AIScoringResult = {
        score: LeadScore.fromNumeric(4, 0.9),
        reasoning: 'Implant interest',
        suggestedAction: 'Follow up',
        urgencyIndicators: ['urgent'],
        budgetMentioned: true,
        procedureInterest: ['Dental Implants'],
        tokensUsed: 100,
        latencyMs: 100,
      };

      const deps = createDependencies({
        leadRepository,
        aiGateway: createMockAIGateway({ available: true, scoringResult: aiResult }),
      });
      const useCase = new ScoreLeadUseCase(deps);

      await useCase.execute(createValidInput());

      expect(leadRepository.updateScore).toHaveBeenCalledWith(
        existingLead.id,
        expect.any(Object),
        expect.objectContaining({
          procedureInterest: ['Dental Implants'],
          urgencyIndicators: ['urgent'],
          budgetMentioned: true,
        })
      );
    });
  });
});
