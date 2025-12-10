/**
 * Triage-Routing Integration Tests
 *
 * Comprehensive tests for the triage and routing integration:
 * - Configuration
 * - Triage-based routing flow
 * - Skill requirements building
 * - Context building
 * - SLA calculation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  TriageRoutingIntegration,
  createTriageRoutingIntegration,
  type TriageRoutingConfig,
} from '../triage-integration.js';
import type { TriageService, TriageResult, TriageInput } from '../../triage/triage-service.js';
import type {
  SkillRoutingService,
  RoutingContext,
  RoutingDecision,
} from '../skill-routing-service.js';
import type { LeadChannel, LeadScore } from '@medicalcor/types';

// ============================================================================
// MOCK SETUP
// ============================================================================

function createMockTriageResult(overrides: Partial<TriageResult> = {}): TriageResult {
  return {
    urgencyLevel: 'normal',
    routingRecommendation: 'same_day',
    suggestedOwner: 'agent-123',
    reason: 'Standard procedure interest',
    score: 50,
    factors: [],
    ...overrides,
  };
}

function createMockTriageInput(overrides: Partial<TriageInput> = {}): TriageInput {
  return {
    leadScore: 'WARM' as LeadScore,
    channel: 'whatsapp' as LeadChannel,
    messageContent: 'I am interested in dental implants',
    procedureInterest: ['implant'],
    hasExistingRelationship: false,
    ...overrides,
  };
}

function createMockRoutingDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    decisionId: 'decision-123',
    outcome: 'assigned',
    selectedAgentId: 'agent-456',
    timestamp: new Date(),
    reason: 'Best skill match',
    matchScore: 85,
    ...overrides,
  };
}

function createMockTriageService(): TriageService {
  return {
    assess: vi.fn().mockResolvedValue(createMockTriageResult()),
    isVIP: vi.fn().mockReturnValue(false),
  } as unknown as TriageService;
}

function createMockRoutingService(): SkillRoutingService {
  return {
    route: vi.fn().mockResolvedValue(createMockRoutingDecision()),
  } as unknown as SkillRoutingService;
}

// ============================================================================
// INTEGRATION CLASS TESTS
// ============================================================================

describe('TriageRoutingIntegration', () => {
  let integration: TriageRoutingIntegration;
  let mockTriageService: TriageService;
  let mockRoutingService: SkillRoutingService;

  beforeEach(() => {
    mockTriageService = createMockTriageService();
    mockRoutingService = createMockRoutingService();
    integration = new TriageRoutingIntegration({
      triageService: mockTriageService,
      routingService: mockRoutingService,
    });
  });

  // ============================================================================
  // CONSTRUCTOR TESTS
  // ============================================================================

  describe('constructor', () => {
    it('should create with default config', () => {
      const int = new TriageRoutingIntegration({
        triageService: mockTriageService,
        routingService: mockRoutingService,
      });

      expect(int).toBeInstanceOf(TriageRoutingIntegration);
    });

    it('should create with custom config', () => {
      const customConfig: Partial<TriageRoutingConfig> = {
        useSuggestedOwnerAsPreference: false,
        urgencyPriorityMapping: {
          high_priority: 100,
          high: 80,
          normal: 60,
          low: 30,
        },
      };

      const int = new TriageRoutingIntegration({
        triageService: mockTriageService,
        routingService: mockRoutingService,
        config: customConfig,
      });

      const config = int.getConfig();
      expect(config.useSuggestedOwnerAsPreference).toBe(false);
      expect(config.urgencyPriorityMapping.low).toBe(30);
    });
  });

  // ============================================================================
  // TRIAGE AND ROUTE TESTS
  // ============================================================================

  describe('triageAndRoute', () => {
    it('should perform complete triage and routing flow', async () => {
      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.triageResult).toBeDefined();
      expect(result.routingDecision).toBeDefined();
      expect(result.skillRequirements).toBeDefined();
      expect(mockTriageService.assess).toHaveBeenCalledWith(input);
      expect(mockRoutingService.route).toHaveBeenCalled();
    });

    it('should pass additional context to routing', async () => {
      const input = createMockTriageInput();
      const additionalContext: Partial<RoutingContext> = {
        procedureType: 'all-on-x',
        urgencyLevel: 'critical',
      };

      await integration.triageAndRoute(input, additionalContext);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]).toMatchObject(additionalContext);
    });

    it('should handle HOT lead score', async () => {
      const input = createMockTriageInput({ leadScore: 'HOT' as LeadScore });

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.priority).toBeGreaterThan(50);
    });

    it('should handle COLD lead score', async () => {
      const input = createMockTriageInput({ leadScore: 'COLD' as LeadScore });

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.priority).toBeDefined();
    });

    it('should handle UNQUALIFIED lead score', async () => {
      const input = createMockTriageInput({ leadScore: 'UNQUALIFIED' as LeadScore });
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ urgencyLevel: 'low' })
      );

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.priority).toBeLessThan(50);
    });
  });

  // ============================================================================
  // SKILL REQUIREMENTS TESTS
  // ============================================================================

  describe('skill requirements building', () => {
    it('should add procedure-based skills', async () => {
      const input = createMockTriageInput({
        procedureInterest: ['implant', 'cosmetic'],
      });

      const result = await integration.triageAndRoute(input);

      const requiredSkillIds = result.skillRequirements.requiredSkills.map((s) => s.skillId);
      expect(requiredSkillIds.length).toBeGreaterThan(0);
    });

    it('should add all-on-x skills', async () => {
      const input = createMockTriageInput({
        procedureInterest: ['all-on-x'],
      });

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.requiredSkills.length).toBeGreaterThan(0);
    });

    it('should add All-on-X skills (case variant)', async () => {
      const input = createMockTriageInput({
        procedureInterest: ['All-on-X'],
      });

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.requiredSkills.length).toBeGreaterThan(0);
    });

    it('should add general dentistry skills', async () => {
      const input = createMockTriageInput({
        procedureInterest: ['general'],
      });

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.requiredSkills.length).toBeGreaterThan(0);
    });

    it('should add orthodontics skills', async () => {
      const input = createMockTriageInput({
        procedureInterest: ['orthodontics'],
      });

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.requiredSkills.length).toBeGreaterThan(0);
    });

    it('should add pediatric skills', async () => {
      const input = createMockTriageInput({
        procedureInterest: ['pediatric'],
      });

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.requiredSkills.length).toBeGreaterThan(0);
    });

    it('should handle unmapped procedures gracefully', async () => {
      const input = createMockTriageInput({
        procedureInterest: ['unknown-procedure'],
      });

      const result = await integration.triageAndRoute(input);

      // Should still complete without error
      expect(result.skillRequirements).toBeDefined();
    });

    it('should add VIP skill for VIP messages', async () => {
      vi.mocked(mockTriageService.isVIP).mockReturnValue(true);

      const input = createMockTriageInput({
        messageContent: 'VIP patient requiring urgent care',
      });

      const result = await integration.triageAndRoute(input);

      const vipSkills = result.skillRequirements.requiredSkills.filter((s) =>
        s.skillId.includes('vip')
      );
      expect(vipSkills.length).toBeGreaterThan(0);
    });

    it('should add escalation skill for high priority', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ urgencyLevel: 'high_priority' })
      );

      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.preferredSkills.length).toBeGreaterThan(0);
    });

    it('should add escalation skill for high urgency', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ urgencyLevel: 'high' })
      );

      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.preferredSkills.length).toBeGreaterThan(0);
    });

    it('should require advanced proficiency for high priority procedures', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ urgencyLevel: 'high_priority' })
      );

      const input = createMockTriageInput({
        procedureInterest: ['implant'],
      });

      const result = await integration.triageAndRoute(input);

      const advancedSkills = result.skillRequirements.requiredSkills.filter(
        (s) => s.minimumProficiency === 'advanced'
      );
      expect(advancedSkills.length).toBeGreaterThan(0);
    });

    it('should include suggested owner as preferred agent', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ suggestedOwner: 'preferred-agent-789' })
      );

      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.preferAgentIds).toContain('preferred-agent-789');
    });

    it('should not include suggested owner when disabled', async () => {
      const int = new TriageRoutingIntegration({
        triageService: mockTriageService,
        routingService: mockRoutingService,
        config: { useSuggestedOwnerAsPreference: false },
      });

      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ suggestedOwner: 'agent-123' })
      );

      const input = createMockTriageInput();

      const result = await int.triageAndRoute(input);

      expect(result.skillRequirements.preferAgentIds).not.toContain('agent-123');
    });
  });

  // ============================================================================
  // CHANNEL MAPPING TESTS
  // ============================================================================

  describe('channel mapping', () => {
    it('should map whatsapp channel correctly', async () => {
      const input = createMockTriageInput({ channel: 'whatsapp' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('whatsapp');
    });

    it('should map voice channel correctly', async () => {
      const input = createMockTriageInput({ channel: 'voice' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('voice');
    });

    it('should map web channel correctly', async () => {
      const input = createMockTriageInput({ channel: 'web' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('web');
    });

    it('should map web_form to web channel', async () => {
      const input = createMockTriageInput({ channel: 'web_form' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('web');
    });

    it('should map hubspot to web channel', async () => {
      const input = createMockTriageInput({ channel: 'hubspot' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('web');
    });

    it('should map facebook to web channel', async () => {
      const input = createMockTriageInput({ channel: 'facebook' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('web');
    });

    it('should map google to web channel', async () => {
      const input = createMockTriageInput({ channel: 'google' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('web');
    });

    it('should map referral to web channel', async () => {
      const input = createMockTriageInput({ channel: 'referral' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('web');
    });

    it('should map manual to web channel', async () => {
      const input = createMockTriageInput({ channel: 'manual' as LeadChannel });

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.channel).toBe('web');
    });
  });

  // ============================================================================
  // URGENCY MAPPING TESTS
  // ============================================================================

  describe('urgency mapping', () => {
    it('should map high_priority to critical', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ urgencyLevel: 'high_priority' })
      );

      const input = createMockTriageInput();

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.urgencyLevel).toBe('critical');
    });

    it('should map high to high', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ urgencyLevel: 'high' })
      );

      const input = createMockTriageInput();

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.urgencyLevel).toBe('high');
    });

    it('should map normal to normal', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ urgencyLevel: 'normal' })
      );

      const input = createMockTriageInput();

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.urgencyLevel).toBe('normal');
    });

    it('should map low to low', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ urgencyLevel: 'low' })
      );

      const input = createMockTriageInput();

      await integration.triageAndRoute(input);

      const routeCall = vi.mocked(mockRoutingService.route).mock.calls[0];
      expect(routeCall?.[1]?.urgencyLevel).toBe('low');
    });
  });

  // ============================================================================
  // SLA CALCULATION TESTS
  // ============================================================================

  describe('SLA calculation', () => {
    it('should set 15 min SLA for next_available_slot', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ routingRecommendation: 'next_available_slot' })
      );

      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(15);
    });

    it('should set 60 min SLA for same_day', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ routingRecommendation: 'same_day' })
      );

      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(60);
    });

    it('should set 480 min SLA for next_business_day', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ routingRecommendation: 'next_business_day' })
      );

      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(480);
    });

    it('should set 1440 min SLA for nurture_sequence', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({ routingRecommendation: 'nurture_sequence' })
      );

      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(1440);
    });

    it('should set default 60 min SLA for unknown recommendation', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValue(
        createMockTriageResult({
          routingRecommendation: 'unknown' as TriageResult['routingRecommendation'],
        })
      );

      const input = createMockTriageInput();

      const result = await integration.triageAndRoute(input);

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(60);
    });
  });

  // ============================================================================
  // CONFIGURATION MANAGEMENT TESTS
  // ============================================================================

  describe('updateProcedureMapping', () => {
    it('should update procedure skill mapping', () => {
      integration.updateProcedureMapping('custom-procedure', ['skill-1', 'skill-2']);

      const config = integration.getConfig();
      expect(config.procedureSkillMapping.get('custom-procedure')).toEqual(['skill-1', 'skill-2']);
    });
  });

  describe('getConfig', () => {
    it('should return readonly config', () => {
      const config = integration.getConfig();

      expect(config).toBeDefined();
      expect(config.urgencyPriorityMapping).toBeDefined();
      expect(config.leadScorePriorityBoost).toBeDefined();
    });
  });

  // ============================================================================
  // TRIAGE ONLY TESTS
  // ============================================================================

  describe('triageOnly', () => {
    it('should perform triage without routing', async () => {
      const input = createMockTriageInput();

      const result = await integration.triageOnly(input);

      expect(result.triageResult).toBeDefined();
      expect(result.skillRequirements).toBeDefined();
      expect(mockTriageService.assess).toHaveBeenCalledWith(input);
      expect(mockRoutingService.route).not.toHaveBeenCalled();
    });
  });
});

// ============================================================================
// FACTORY FUNCTION TESTS
// ============================================================================

describe('createTriageRoutingIntegration', () => {
  it('should create integration with required options', () => {
    const mockTriageService = createMockTriageService();
    const mockRoutingService = createMockRoutingService();

    const integration = createTriageRoutingIntegration({
      triageService: mockTriageService,
      routingService: mockRoutingService,
    });

    expect(integration).toBeInstanceOf(TriageRoutingIntegration);
  });

  it('should create integration with custom config', () => {
    const mockTriageService = createMockTriageService();
    const mockRoutingService = createMockRoutingService();

    const integration = createTriageRoutingIntegration({
      triageService: mockTriageService,
      routingService: mockRoutingService,
      config: {
        useSuggestedOwnerAsPreference: false,
      },
    });

    expect(integration).toBeInstanceOf(TriageRoutingIntegration);
    expect(integration.getConfig().useSuggestedOwnerAsPreference).toBe(false);
  });
});
