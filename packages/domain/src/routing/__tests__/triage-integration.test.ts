/**
 * Tests for TriageRoutingIntegration
 *
 * Tests the integration between triage assessment and skill-based routing.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TriageRoutingIntegration,
  createTriageRoutingIntegration,
  type TriageRoutingConfig,
} from '../triage-integration.js';
import type { TriageService, TriageInput, TriageResult } from '../../triage/triage-service.js';
import type {
  SkillRoutingService,
  RoutingContext,
  RoutingDecision,
} from '../skill-routing-service.js';

// Mock triage service
const createMockTriageService = (): TriageService => ({
  assess: vi.fn().mockResolvedValue({
    urgencyLevel: 'normal',
    routingRecommendation: 'same_day',
    suggestedOwner: 'agent-1',
    reasoning: 'Standard consultation request',
  } as TriageResult),
  isVIP: vi.fn().mockReturnValue(false),
});

// Mock routing service
const createMockRoutingService = (): SkillRoutingService => ({
  route: vi.fn().mockResolvedValue({
    decisionId: 'decision-123',
    outcome: 'assigned',
    selectedAgentId: 'agent-1',
    score: 0.95,
    reasoning: 'Best skill match',
  } as RoutingDecision),
  getAvailableAgents: vi.fn().mockResolvedValue([]),
});

describe('TriageRoutingIntegration', () => {
  let mockTriageService: TriageService;
  let mockRoutingService: SkillRoutingService;
  let integration: TriageRoutingIntegration;

  beforeEach(() => {
    vi.clearAllMocks();
    mockTriageService = createMockTriageService();
    mockRoutingService = createMockRoutingService();
    integration = new TriageRoutingIntegration({
      triageService: mockTriageService,
      routingService: mockRoutingService,
    });
  });

  describe('constructor', () => {
    it('should create instance with default config', () => {
      const int = new TriageRoutingIntegration({
        triageService: mockTriageService,
        routingService: mockRoutingService,
      });
      expect(int).toBeInstanceOf(TriageRoutingIntegration);
    });

    it('should create instance with custom config', () => {
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
        config: customConfig,
        triageService: mockTriageService,
        routingService: mockRoutingService,
      });
      expect(int).toBeInstanceOf(TriageRoutingIntegration);
    });
  });

  describe('triageAndRoute', () => {
    const baseInput: TriageInput = {
      leadScore: 'HOT',
      channel: 'voice',
      messageContent: 'I need an appointment for dental implants',
      hasExistingRelationship: false,
      procedureInterest: ['implant'],
    };

    it('should complete triage and routing', async () => {
      const result = await integration.triageAndRoute(baseInput);

      expect(mockTriageService.assess).toHaveBeenCalledWith(baseInput);
      expect(mockRoutingService.route).toHaveBeenCalled();
      expect(result.triageResult).toBeDefined();
      expect(result.routingDecision).toBeDefined();
      expect(result.skillRequirements).toBeDefined();
    });

    it('should handle high_priority urgency level', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'high_priority',
        routingRecommendation: 'next_available_slot',
        suggestedOwner: 'senior-agent-1',
        reasoning: 'Emergency case',
      } as TriageResult);

      const result = await integration.triageAndRoute(baseInput);

      expect(result.triageResult.urgencyLevel).toBe('high_priority');
      expect(result.skillRequirements.priority).toBeGreaterThan(50);
    });

    it('should handle high urgency level', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'high',
        routingRecommendation: 'same_day',
        suggestedOwner: 'agent-2',
        reasoning: 'Urgent consultation',
      } as TriageResult);

      const result = await integration.triageAndRoute(baseInput);

      expect(result.triageResult.urgencyLevel).toBe('high');
    });

    it('should handle low urgency level', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'low',
        routingRecommendation: 'nurture_sequence',
        suggestedOwner: null,
        reasoning: 'General inquiry',
      } as TriageResult);

      const result = await integration.triageAndRoute({
        ...baseInput,
        leadScore: 'COLD',
      });

      expect(result.triageResult.urgencyLevel).toBe('low');
    });

    it('should include additional routing context', async () => {
      const additionalContext: Partial<RoutingContext> = {
        procedureType: 'All-on-X',
        isExistingPatient: true,
      };

      const result = await integration.triageAndRoute(baseInput, additionalContext);

      expect(result).toBeDefined();
      expect(mockRoutingService.route).toHaveBeenCalled();
    });

    it('should handle All-on-X procedure interest', async () => {
      const result = await integration.triageAndRoute({
        ...baseInput,
        procedureInterest: ['all-on-x'],
      });

      expect(result.skillRequirements.requiredSkills.length).toBeGreaterThan(0);
    });

    it('should handle multiple procedure interests', async () => {
      const result = await integration.triageAndRoute({
        ...baseInput,
        procedureInterest: ['implant', 'orthodontics', 'cosmetic'],
      });

      expect(result.skillRequirements.requiredSkills.length).toBeGreaterThan(0);
    });

    it('should handle VIP leads', async () => {
      vi.mocked(mockTriageService.isVIP).mockReturnValueOnce(true);

      const result = await integration.triageAndRoute({
        ...baseInput,
        messageContent: 'VIP patient referral',
      });

      expect(result.skillRequirements.requiredSkills.some((s) => s.skillId.includes('vip'))).toBe(
        true
      );
    });

    it('should handle different lead scores', async () => {
      for (const leadScore of ['HOT', 'WARM', 'COLD', 'UNQUALIFIED'] as const) {
        const result = await integration.triageAndRoute({
          ...baseInput,
          leadScore,
        });

        expect(result.skillRequirements.priority).toBeDefined();
      }
    });

    it('should handle different channels', async () => {
      const channels = ['voice', 'whatsapp', 'web', 'referral'] as const;

      for (const channel of channels) {
        const result = await integration.triageAndRoute({
          ...baseInput,
          channel,
        });

        expect(result).toBeDefined();
      }
    });

    it('should handle web_form channel', async () => {
      const result = await integration.triageAndRoute({
        ...baseInput,
        channel: 'web_form',
      });

      expect(result).toBeDefined();
    });

    it('should handle hubspot channel', async () => {
      const result = await integration.triageAndRoute({
        ...baseInput,
        channel: 'hubspot',
      });

      expect(result).toBeDefined();
    });

    it('should handle facebook channel', async () => {
      const result = await integration.triageAndRoute({
        ...baseInput,
        channel: 'facebook',
      });

      expect(result).toBeDefined();
    });

    it('should handle google channel', async () => {
      const result = await integration.triageAndRoute({
        ...baseInput,
        channel: 'google',
      });

      expect(result).toBeDefined();
    });

    it('should handle manual channel', async () => {
      const result = await integration.triageAndRoute({
        ...baseInput,
        channel: 'manual',
      });

      expect(result).toBeDefined();
    });

    it('should add escalation skill for high priority', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'high',
        routingRecommendation: 'next_available_slot',
        suggestedOwner: 'agent-1',
        reasoning: 'Urgent case',
      } as TriageResult);

      const result = await integration.triageAndRoute(baseInput);

      expect(result.skillRequirements.preferredSkills.length).toBeGreaterThan(0);
    });

    it('should use suggested owner as preference when configured', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'normal',
        routingRecommendation: 'same_day',
        suggestedOwner: 'preferred-agent',
        reasoning: 'Previous relationship',
      } as TriageResult);

      const result = await integration.triageAndRoute(baseInput);

      expect(result.skillRequirements.preferAgentIds).toContain('preferred-agent');
    });
  });

  describe('triageOnly', () => {
    it('should perform triage without routing', async () => {
      const input: TriageInput = {
        leadScore: 'WARM',
        channel: 'whatsapp',
        messageContent: 'Interested in teeth whitening',
        hasExistingRelationship: false,
        procedureInterest: ['cosmetic'],
      };

      const result = await integration.triageOnly(input);

      expect(mockTriageService.assess).toHaveBeenCalled();
      expect(mockRoutingService.route).not.toHaveBeenCalled();
      expect(result.triageResult).toBeDefined();
      expect(result.skillRequirements).toBeDefined();
    });
  });

  describe('getSlaFromRouting', () => {
    it('should return correct SLA for next_available_slot', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'high_priority',
        routingRecommendation: 'next_available_slot',
        suggestedOwner: null,
        reasoning: 'Emergency',
      } as TriageResult);

      const result = await integration.triageAndRoute({
        leadScore: 'HOT',
        channel: 'voice',
        messageContent: 'Emergency',
        hasExistingRelationship: false,
      });

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(15);
    });

    it('should return correct SLA for same_day', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'normal',
        routingRecommendation: 'same_day',
        suggestedOwner: null,
        reasoning: 'Standard',
      } as TriageResult);

      const result = await integration.triageAndRoute({
        leadScore: 'WARM',
        channel: 'web',
        messageContent: 'Inquiry',
        hasExistingRelationship: false,
      });

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(60);
    });

    it('should return correct SLA for next_business_day', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'low',
        routingRecommendation: 'next_business_day',
        suggestedOwner: null,
        reasoning: 'Low priority',
      } as TriageResult);

      const result = await integration.triageAndRoute({
        leadScore: 'COLD',
        channel: 'web',
        messageContent: 'General question',
        hasExistingRelationship: false,
      });

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(480);
    });

    it('should return correct SLA for nurture_sequence', async () => {
      vi.mocked(mockTriageService.assess).mockResolvedValueOnce({
        urgencyLevel: 'low',
        routingRecommendation: 'nurture_sequence',
        suggestedOwner: null,
        reasoning: 'Nurture lead',
      } as TriageResult);

      const result = await integration.triageAndRoute({
        leadScore: 'UNQUALIFIED',
        channel: 'web',
        messageContent: 'Just browsing',
        hasExistingRelationship: false,
      });

      expect(result.skillRequirements.slaDeadlineMinutes).toBe(1440);
    });
  });

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

  describe('createTriageRoutingIntegration factory', () => {
    it('should create integration instance', () => {
      const int = createTriageRoutingIntegration({
        triageService: mockTriageService,
        routingService: mockRoutingService,
      });

      expect(int).toBeInstanceOf(TriageRoutingIntegration);
    });

    it('should create integration with custom config', () => {
      const int = createTriageRoutingIntegration({
        config: {
          useSuggestedOwnerAsPreference: false,
        },
        triageService: mockTriageService,
        routingService: mockRoutingService,
      });

      expect(int).toBeInstanceOf(TriageRoutingIntegration);
    });
  });
});
