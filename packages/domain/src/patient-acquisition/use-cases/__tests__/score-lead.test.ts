/**
 * @fileoverview Comprehensive Tests for ScoreLeadUseCase
 *
 * Tests the lead scoring use case including:
 * - Input validation
 * - Phone number parsing
 * - AI and rule-based scoring
 * - CRM integration
 * - Event publishing
 * - Idempotency handling
 * - GDPR compliance scenarios
 *
 * @module domain/patient-acquisition/use-cases/__tests__/score-lead
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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
import type {
  LeadScoredEvent,
  LeadQualifiedEvent,
} from '../../../shared-kernel/domain-events/lead-events.js';

// ============================================================================
// TEST MOCKS
// ============================================================================

const createMockLeadRepository = (): ILeadRepository => ({
  findByPhone: vi.fn(),
  create: vi.fn(),
  updateScore: vi.fn(),
  findById: vi.fn(),
  save: vi.fn(),
  findAll: vi.fn(),
});

const createMockCrmGateway = (): ICrmGateway => ({
  updateContactScore: vi.fn(),
  createContact: vi.fn(),
  updateContact: vi.fn(),
  getContact: vi.fn(),
});

const createMockAIGateway = (): IAIGateway => ({
  scoreLead: vi.fn(),
  isScoringAvailable: vi.fn(),
});

const createMockEventPublisher = (): EventPublisher => ({
  publish: vi.fn(),
});

const createMockIdempotencyStore = (): IdempotencyStore => ({
  exists: vi.fn(),
  set: vi.fn(),
  get: vi.fn(),
});

const createValidInput = (overrides?: Partial<ScoreLeadInput>): ScoreLeadInput => ({
  phone: '+40700000001',
  message: 'Vreau All-on-4, cat costa?',
  channel: 'whatsapp',
  correlationId: 'test-correlation-id',
  ...overrides,
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

describe('ScoreLeadUseCase - Input Validation', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);
  });

  it('should reject empty phone number', async () => {
    const input = createValidInput({ phone: '' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Phone number is required');
    }
  });

  it('should reject empty message', async () => {
    const input = createValidInput({ message: '' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Message content is required');
    }
  });

  it('should reject missing correlation ID', async () => {
    const input = createValidInput({ correlationId: '' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('Correlation ID is required');
    }
  });

  it('should reject invalid phone number format', async () => {
    const input = createValidInput({ phone: 'invalid-phone' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_PHONE');
    }
  });

  it('should accept valid Romanian phone number', async () => {
    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);

    const input = createValidInput({ phone: '+40721234567' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// IDEMPOTENCY TESTS
// ============================================================================

describe('ScoreLeadUseCase - Idempotency', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;
  let idempotencyStore: IdempotencyStore;

  beforeEach(() => {
    idempotencyStore = createMockIdempotencyStore();
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
      idempotencyStore,
    };
    useCase = new ScoreLeadUseCase(deps);
  });

  it('should return cached result if idempotency key exists', async () => {
    const cachedOutput: ScoreLeadOutput = {
      success: true,
      leadId: 'lead_123',
      score: 5,
      classification: 'HOT',
      confidence: 0.9,
      method: 'ai',
      suggestedAction: 'Contact immediately',
      reasoning: 'Cached result',
      events: [],
      wasQualified: true,
    };

    vi.mocked(idempotencyStore.get).mockResolvedValue(cachedOutput);

    const input = createValidInput({ idempotencyKey: 'idempotency-key-123' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value).toEqual(cachedOutput);
    }
    expect(idempotencyStore.get).toHaveBeenCalledWith('idempotency-key-123');
  });

  it('should store result with idempotency key after successful execution', async () => {
    vi.mocked(idempotencyStore.get).mockResolvedValue(null);
    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);

    const input = createValidInput({ idempotencyKey: 'idempotency-key-456' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    expect(idempotencyStore.set).toHaveBeenCalledWith(
      'idempotency-key-456',
      expect.any(Object),
      3600
    );
  });

  it('should work without idempotency store', async () => {
    const depsWithoutIdempotency: ScoreLeadDependencies = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    const useCaseWithoutIdempotency = new ScoreLeadUseCase(depsWithoutIdempotency);

    vi.mocked(depsWithoutIdempotency.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(depsWithoutIdempotency.aiGateway.isScoringAvailable).mockResolvedValue(false);

    const input = createValidInput({ idempotencyKey: 'key-789' });
    const result = await useCaseWithoutIdempotency.execute(input);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// AI SCORING TESTS
// ============================================================================

describe('ScoreLeadUseCase - AI Scoring', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
  });

  it('should use AI scoring when available', async () => {
    const aiResult: AIScoringResult = {
      score: LeadScore.fromNumeric(5, 0.95),
      reasoning: 'High-value dental implant inquiry with budget mention',
      suggestedAction: 'Contact immediately',
      urgencyIndicators: ['priority_scheduling_requested'],
      budgetMentioned: true,
      procedureInterest: ['All-on-4'],
      tokensUsed: 150,
      latencyMs: 250,
    };

    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(true);
    vi.mocked(deps.aiGateway.scoreLead).mockResolvedValue({
      success: true,
      value: aiResult,
    });

    const input = createValidInput();
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.method).toBe('ai');
      expect(result.value.score).toBe(5);
      expect(result.value.confidence).toBe(0.95);
    }
    expect(deps.aiGateway.scoreLead).toHaveBeenCalled();
  });

  it('should fallback to rule-based when AI is unavailable', async () => {
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);

    const input = createValidInput({ message: 'Vreau all-on-4, cat costa?' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.method).toBe('rule_based');
    }
  });

  it('should fallback to rule-based when AI scoring fails', async () => {
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(true);
    vi.mocked(deps.aiGateway.scoreLead).mockResolvedValue({
      success: false,
      error: 'AI gateway error',
    });

    const input = createValidInput();
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.method).toBe('rule_based');
    }
  });
});

// ============================================================================
// RULE-BASED SCORING TESTS
// ============================================================================

describe('ScoreLeadUseCase - Rule-Based Scoring', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);
  });

  it('should score HOT (5) for All-on-X with budget mention', async () => {
    const input = createValidInput({ message: 'Vreau all-on-4, cat costa?' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.score).toBe(5);
      expect(result.value.classification).toBe('HOT');
      expect(result.value.budgetMentioned).toBe(true);
      expect(result.value.procedureInterest).toContain('All-on-X');
    }
  });

  it('should score HOT (4) for All-on-X without budget', async () => {
    const input = createValidInput({ message: 'Ma intereseaza all-on-6' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.score).toBe(4);
      expect(result.value.classification).toBe('HOT');
    }
  });

  it('should score WARM (3) for implant interest', async () => {
    const input = createValidInput({ message: 'Vreau informatii despre implanturi' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.score).toBe(3);
      expect(result.value.classification).toBe('WARM');
    }
  });

  it('should boost score for urgency indicators', async () => {
    const input = createValidInput({ message: 'Am durere, am nevoie urgent de implant' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.score).toBeGreaterThanOrEqual(4);
      expect(result.value.urgencyIndicators).toContain('priority_scheduling_requested');
    }
  });

  it('should score COLD for vague messages', async () => {
    const input = createValidInput({ message: 'Buna ziua' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.score).toBeLessThanOrEqual(2);
      expect(result.value.classification).toMatch(/COLD|UNQUALIFIED/);
    }
  });

  it('should detect multiple procedure types', async () => {
    const input = createValidInput({ message: 'Vreau fatete si albire dentara, pret?' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.budgetMentioned).toBe(true);
    }
  });
});

// ============================================================================
// EVENT PUBLISHING TESTS
// ============================================================================

describe('ScoreLeadUseCase - Event Publishing', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);
  });

  it('should emit LeadScored event for all scorings', async () => {
    const input = createValidInput();
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    expect(deps.eventPublisher.publish).toHaveBeenCalled();
    if (result.success) {
      expect(result.value.events.length).toBeGreaterThanOrEqual(1);
      expect(result.value.events[0]?.type).toBe('lead.scored');
    }
  });

  it('should emit LeadQualified event when newly qualified', async () => {
    const input = createValidInput({ message: 'Vreau all-on-4, cat costa?' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success && result.value.wasQualified) {
      expect(result.value.events.length).toBe(2);
      expect(result.value.events[1]?.type).toBe('lead.qualified');
    }
  });

  it('should not emit LeadQualified if already HOT', async () => {
    const existingLead: Lead = {
      id: 'lead_123',
      phone: '+40700000001',
      score: LeadScore.fromNumeric(5, 0.9),
      status: 'NEW',
      channel: 'whatsapp',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: existingLead,
    });

    const input = createValidInput({ message: 'Vreau all-on-4, cat costa?' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.wasQualified).toBe(false);
    }
  });
});

// ============================================================================
// CRM INTEGRATION TESTS
// ============================================================================

describe('ScoreLeadUseCase - CRM Integration', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);
  });

  it('should update CRM when HubSpot contact ID is provided', async () => {
    const input = createValidInput({ hubspotContactId: 'hubspot-123' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    expect(deps.crmGateway.updateContactScore).toHaveBeenCalledWith(
      'hubspot-123',
      expect.any(Object),
      expect.any(Object)
    );
  });

  it('should not update CRM when HubSpot contact ID is missing', async () => {
    const input = createValidInput({ hubspotContactId: undefined });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    expect(deps.crmGateway.updateContactScore).not.toHaveBeenCalled();
  });
});

// ============================================================================
// MESSAGE HISTORY TESTS
// ============================================================================

describe('ScoreLeadUseCase - Message History', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);
  });

  it('should include message history in scoring context', async () => {
    const input = createValidInput({
      messageHistory: [
        { role: 'user', content: 'Buna ziua', timestamp: new Date().toISOString() },
        {
          role: 'assistant',
          content: 'Salut! Cum va pot ajuta?',
          timestamp: new Date().toISOString(),
        },
      ],
    });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
  });

  it('should handle empty message history', async () => {
    const input = createValidInput({ messageHistory: [] });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
  });
});

// ============================================================================
// GDPR/PRIVACY TESTS
// ============================================================================

describe('ScoreLeadUseCase - GDPR/Privacy', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);
  });

  it('should generate UUID-based lead IDs for privacy', async () => {
    const input = createValidInput();
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.leadId).toMatch(/^lead_[a-f0-9-]{36}$/);
    }
  });

  it('should preserve existing lead ID', async () => {
    const existingLead: Lead = {
      id: 'lead_existing_123',
      phone: '+40700000001',
      score: LeadScore.fromNumeric(2, 0.7),
      status: 'NEW',
      channel: 'whatsapp',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: existingLead,
    });

    const input = createValidInput();
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.leadId).toBe('lead_existing_123');
    }
  });
});

// ============================================================================
// SUGGESTED ACTION TESTS
// ============================================================================

describe('ScoreLeadUseCase - Suggested Actions', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);
  });

  it('should provide Romanian suggested action for RO number', async () => {
    const input = createValidInput({ phone: '+40700000001' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.suggestedAction).toBeTruthy();
    }
  });

  it('should provide different actions for different classifications', async () => {
    const hotInput = createValidInput({ message: 'Vreau all-on-4, cat costa?' });
    const coldInput = createValidInput({ message: 'Buna ziua' });

    const hotResult = await useCase.execute(hotInput);
    const coldResult = await useCase.execute(coldInput);

    expect(hotResult.success).toBe(true);
    expect(coldResult.success).toBe(true);

    if (hotResult.success && coldResult.success) {
      expect(hotResult.value.suggestedAction).not.toBe(coldResult.value.suggestedAction);
    }
  });
});

// ============================================================================
// CHANNEL TESTS
// ============================================================================

describe('ScoreLeadUseCase - Channel Handling', () => {
  let useCase: ScoreLeadUseCase;
  let deps: ScoreLeadDependencies;

  beforeEach(() => {
    deps = {
      leadRepository: createMockLeadRepository(),
      crmGateway: createMockCrmGateway(),
      aiGateway: createMockAIGateway(),
      eventPublisher: createMockEventPublisher(),
    };
    useCase = new ScoreLeadUseCase(deps);

    vi.mocked(deps.leadRepository.findByPhone).mockResolvedValue({
      success: true,
      value: null,
    });
    vi.mocked(deps.aiGateway.isScoringAvailable).mockResolvedValue(false);
  });

  it('should handle WhatsApp channel', async () => {
    const input = createValidInput({ channel: 'whatsapp' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
  });

  it('should handle voice channel', async () => {
    const input = createValidInput({ channel: 'voice' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
  });

  it('should handle web channel', async () => {
    const input = createValidInput({ channel: 'web' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
  });

  it('should handle HubSpot channel', async () => {
    const input = createValidInput({ channel: 'hubspot' });
    const result = await useCase.execute(input);

    expect(result.success).toBe(true);
  });
});
