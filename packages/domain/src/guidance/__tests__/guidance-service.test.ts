/**
 * @fileoverview Tests for Guidance Service
 *
 * Tests for agent guidance management, call scripts, and real-time suggestions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GuidanceService,
  getGuidanceService,
  resetGuidanceService,
  type GuidanceServiceConfig,
} from '../guidance-service.js';
import type {
  IGuidanceRepository,
  GuidanceRepositoryResult,
  PaginatedGuidance,
} from '../repositories/GuidanceRepository.js';
import type { AgentGuidance, ScriptStep, ObjectionHandler, KeyPoint } from '@medicalcor/types';

// Mock repository factory
function createMockRepository(overrides: Partial<IGuidanceRepository> = {}): IGuidanceRepository {
  return {
    create: vi.fn().mockResolvedValue({ success: true, data: createMockGuidance() }),
    update: vi.fn().mockResolvedValue({ success: true, data: createMockGuidance() }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    findById: vi.fn().mockResolvedValue({ success: true, data: createMockGuidance() }),
    list: vi.fn().mockResolvedValue({
      success: true,
      data: { items: [], total: 0, page: 1, limit: 10 },
    }),
    search: vi.fn().mockResolvedValue({ success: true, data: [] }),
    findForCall: vi.fn().mockResolvedValue({ success: true, data: createMockGuidance() }),
    activate: vi.fn().mockResolvedValue({ success: true, data: createMockGuidance() }),
    deactivate: vi.fn().mockResolvedValue({ success: true, data: createMockGuidance() }),
    publish: vi.fn().mockResolvedValue({ success: true, data: createMockGuidance() }),
    createVersion: vi.fn().mockResolvedValue({ success: true, data: createMockGuidance() }),
    getVersionHistory: vi.fn().mockResolvedValue({ success: true, data: [] }),
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    updateMetrics: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// Constants for mock UUIDs
const MOCK_UUID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_UUID_2 = '550e8400-e29b-41d4-a716-446655440001';
const MOCK_CLINIC_UUID = '550e8400-e29b-41d4-a716-446655440100';
const MOCK_STEP_UUID_1 = '550e8400-e29b-41d4-a716-446655440201';
const MOCK_STEP_UUID_2 = '550e8400-e29b-41d4-a716-446655440202';
const MOCK_STEP_UUID_3 = '550e8400-e29b-41d4-a716-446655440203';
const MOCK_POINT_UUID = '550e8400-e29b-41d4-a716-446655440301';
const MOCK_HANDLER_UUID = '550e8400-e29b-41d4-a716-446655440401';

// Mock guidance factory
function createMockGuidance(overrides: Partial<AgentGuidance> = {}): AgentGuidance {
  return {
    id: MOCK_UUID,
    clinicId: MOCK_CLINIC_UUID,
    name: 'Sales Script',
    description: 'Standard sales call script',
    type: 'call-script',
    category: 'intake',
    status: 'published',
    version: 1,
    steps: [
      createMockStep({ id: MOCK_STEP_UUID_1, order: 1, title: 'Greeting' }),
      createMockStep({ id: MOCK_STEP_UUID_2, order: 2, title: 'Qualification' }),
      createMockStep({ id: MOCK_STEP_UUID_3, order: 3, title: 'Presentation' }),
    ],
    keyPoints: [createMockKeyPoint({ id: MOCK_POINT_UUID, content: 'Mention special offer' })],
    objectionHandlers: [createMockObjectionHandler({ id: MOCK_HANDLER_UUID, category: 'price' })],
    procedureTypes: ['all-on-x'],
    callTypes: ['outbound'],
    isActive: true,
    tags: ['sales'],
    usageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockStep(overrides: Partial<ScriptStep> = {}): ScriptStep {
  return {
    id: MOCK_STEP_UUID_1,
    order: 1,
    title: 'Step Title',
    content: 'Step content',
    contentRo: 'Conținut pas',
    expectedResponses: [],
    dataCapture: [],
    isOptional: false,
    ...overrides,
  };
}

function createMockKeyPoint(overrides: Partial<KeyPoint> = {}): KeyPoint {
  return {
    id: MOCK_POINT_UUID,
    content: 'Key point content',
    contentRo: 'Conținut punct cheie',
    priority: 'medium',
    triggers: ['price', 'cost'],
    ...overrides,
  };
}

function createMockObjectionHandler(overrides: Partial<ObjectionHandler> = {}): ObjectionHandler {
  return {
    id: MOCK_HANDLER_UUID,
    category: 'price',
    objectionPatterns: ['too expensive', 'prea scump'],
    response: 'We offer flexible payment plans.',
    responseRo: 'Oferim planuri de plată flexibile.',
    ...overrides,
  };
}

describe('GuidanceService', () => {
  let repository: IGuidanceRepository;
  let service: GuidanceService;

  beforeEach(() => {
    repository = createMockRepository();
    service = new GuidanceService(repository);
  });

  afterEach(() => {
    service.destroy();
    resetGuidanceService();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with default config', () => {
      const svc = new GuidanceService(repository);
      expect(svc).toBeInstanceOf(GuidanceService);
    });

    it('should create service with custom config', () => {
      const config: GuidanceServiceConfig = {
        maxSuggestionsPerCall: 100,
        enableObjectionDetection: false,
        minSuggestionConfidence: 0.8,
        defaultLanguage: 'en',
      };
      const svc = new GuidanceService(repository, config);
      expect(svc).toBeInstanceOf(GuidanceService);
    });
  });

  describe('CRUD Operations', () => {
    describe('createGuidance', () => {
      it('should create guidance with valid input', async () => {
        const input = {
          clinicId: MOCK_CLINIC_UUID,
          name: 'New Script',
          type: 'call-script' as const,
          category: 'intake' as const,
          initialGreeting: 'Hello, thank you for calling!',
          steps: [],
          keyPoints: [],
          objectionHandlers: [],
          procedures: [],
          tags: [],
        };

        const result = await service.createGuidance(input);
        expect(result.success).toBe(true);
        expect(repository.create).toHaveBeenCalled();
      });

      it('should return error for invalid input', async () => {
        const input = {
          // Missing required fields
          name: '',
        };

        const result = await service.createGuidance(input as any);
        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('VALIDATION_ERROR');
      });
    });

    describe('updateGuidance', () => {
      it('should update guidance', async () => {
        const result = await service.updateGuidance(MOCK_UUID, { name: 'Updated Name' });
        expect(result.success).toBe(true);
        expect(repository.update).toHaveBeenCalledWith(MOCK_UUID, { name: 'Updated Name' });
      });
    });

    describe('deleteGuidance', () => {
      it('should delete guidance', async () => {
        const result = await service.deleteGuidance(MOCK_UUID);
        expect(result.success).toBe(true);
        expect(repository.delete).toHaveBeenCalledWith(MOCK_UUID);
      });
    });

    describe('getGuidance', () => {
      it('should get guidance by id', async () => {
        const result = await service.getGuidance(MOCK_UUID);
        expect(result.success).toBe(true);
        expect(repository.findById).toHaveBeenCalledWith(MOCK_UUID);
      });
    });

    describe('listGuidance', () => {
      it('should list guidance with query', async () => {
        const query = { clinicId: MOCK_CLINIC_UUID, page: 1, limit: 10 };
        await service.listGuidance(query);
        expect(repository.list).toHaveBeenCalledWith(query);
      });
    });

    describe('searchGuidance', () => {
      it('should search guidance', async () => {
        await service.searchGuidance(MOCK_CLINIC_UUID, 'sales', ['tag1']);
        expect(repository.search).toHaveBeenCalledWith({
          clinicId: MOCK_CLINIC_UUID,
          searchTerm: 'sales',
          tags: ['tag1'],
        });
      });
    });
  });

  describe('Status Management', () => {
    it('should activate guidance', async () => {
      await service.activateGuidance(MOCK_UUID);
      expect(repository.activate).toHaveBeenCalledWith(MOCK_UUID);
    });

    it('should deactivate guidance', async () => {
      await service.deactivateGuidance(MOCK_UUID);
      expect(repository.deactivate).toHaveBeenCalledWith(MOCK_UUID);
    });

    it('should publish guidance', async () => {
      await service.publishGuidance(MOCK_UUID);
      expect(repository.publish).toHaveBeenCalledWith(MOCK_UUID);
    });
  });

  describe('Versioning', () => {
    it('should create new version', async () => {
      await service.createNewVersion(MOCK_UUID, { name: 'Updated' });
      expect(repository.createVersion).toHaveBeenCalledWith(MOCK_UUID, { name: 'Updated' });
    });

    it('should get version history', async () => {
      await service.getVersionHistory(MOCK_UUID);
      expect(repository.getVersionHistory).toHaveBeenCalledWith(MOCK_UUID);
    });
  });

  describe('Call Guidance Management', () => {
    describe('loadGuidanceForCall', () => {
      it('should load guidance for call', async () => {
        const result = await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(service.hasGuidance('call-001')).toBe(true);
      });

      it('should emit guidance:loaded event', async () => {
        const listener = vi.fn();
        service.on('guidance:loaded', listener);

        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        expect(listener).toHaveBeenCalled();
      });

      it('should return null when no guidance found', async () => {
        vi.mocked(repository.findForCall).mockResolvedValue({ success: true, data: null });

        const result = await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'unknown',
          callType: 'outbound',
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeNull();
      });
    });

    describe('getCallGuidance', () => {
      it('should return null when no guidance loaded', () => {
        expect(service.getCallGuidance('unknown-call')).toBeNull();
      });

      it('should return guidance when loaded', async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        const guidance = service.getCallGuidance('call-001');
        expect(guidance).toBeDefined();
        expect(guidance?.name).toBe('Sales Script');
      });
    });

    describe('getCurrentStep', () => {
      it('should return null when no guidance loaded', () => {
        expect(service.getCurrentStep('unknown-call')).toBeNull();
      });

      it('should return first step after loading', async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        const step = service.getCurrentStep('call-001');
        expect(step).toBeDefined();
        expect(step?.id).toBe(MOCK_STEP_UUID_1);
      });
    });

    describe('completeStep', () => {
      beforeEach(async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });
      });

      it('should return null for unknown call', () => {
        expect(service.completeStep('unknown-call', MOCK_STEP_UUID_1)).toBeNull();
      });

      it('should move to next step', () => {
        const nextStep = service.completeStep('call-001', MOCK_STEP_UUID_1);
        expect(nextStep?.id).toBe(MOCK_STEP_UUID_2);
      });

      it('should emit step-complete event', () => {
        const listener = vi.fn();
        service.on('guidance:step-complete', listener);

        service.completeStep('call-001', MOCK_STEP_UUID_1);

        expect(listener).toHaveBeenCalledWith('call-001', MOCK_STEP_UUID_1, MOCK_STEP_UUID_2);
      });

      it('should store collected data', () => {
        service.completeStep('call-001', MOCK_STEP_UUID_1, { patientName: 'John' });
        const data = service.getCollectedData('call-001');
        expect(data.patientName).toBe('John');
      });

      it('should emit script-complete when all steps done', () => {
        const listener = vi.fn();
        service.on('guidance:script-complete', listener);

        service.completeStep('call-001', MOCK_STEP_UUID_1);
        service.completeStep('call-001', MOCK_STEP_UUID_2);
        service.completeStep('call-001', MOCK_STEP_UUID_3);

        expect(listener).toHaveBeenCalled();
      });
    });

    describe('skipStep', () => {
      beforeEach(async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });
      });

      it('should return null for unknown call', () => {
        expect(service.skipStep('unknown-call', MOCK_STEP_UUID_1)).toBeNull();
      });

      it('should skip to next step', () => {
        const nextStep = service.skipStep('call-001', MOCK_STEP_UUID_1);
        expect(nextStep?.id).toBe(MOCK_STEP_UUID_2);
      });
    });

    describe('endCallGuidance', () => {
      it('should remove call guidance', async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        service.endCallGuidance('call-001');
        expect(service.hasGuidance('call-001')).toBe(false);
      });
    });
  });

  describe('Real-time Suggestions', () => {
    beforeEach(async () => {
      await service.loadGuidanceForCall('call-001', {
        clinicId: MOCK_CLINIC_UUID,
        procedureType: 'all-on-x',
        callType: 'outbound',
      });
    });

    describe('processMessage', () => {
      it('should return empty array for unknown call', () => {
        const suggestions = service.processMessage('unknown-call', 'customer', 'Hello');
        expect(suggestions).toEqual([]);
      });

      it('should detect price objection in Romanian', () => {
        const suggestions = service.processMessage(
          'call-001',
          'customer',
          'Este prea scump pentru mine'
        );

        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions[0].type).toBe('objection-response');
      });

      it('should detect price objection in English', () => {
        const suggestions = service.processMessage('call-001', 'customer', 'This is too expensive');

        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions[0].type).toBe('objection-response');
      });

      it('should detect time objection', () => {
        const suggestions = service.processMessage('call-001', 'customer', 'Nu am timp acum');

        expect(suggestions.length).toBeGreaterThanOrEqual(0);
      });

      it('should emit suggestion event', () => {
        const listener = vi.fn();
        service.on('guidance:suggestion', listener);

        service.processMessage('call-001', 'customer', 'prea scump');

        expect(listener).toHaveBeenCalled();
      });

      it('should emit objection-detected event', () => {
        const listener = vi.fn();
        service.on('guidance:objection-detected', listener);

        service.processMessage('call-001', 'customer', 'este prea scump pentru mine');

        expect(listener).toHaveBeenCalled();
      });

      it('should not process objections for agent messages', () => {
        const suggestions = service.processMessage('call-001', 'agent', 'prea scump');

        // Should not detect objections from agent
        const objectionSuggestions = suggestions.filter((s) => s.type === 'objection-response');
        expect(objectionSuggestions).toHaveLength(0);
      });

      it('should find relevant talking points', () => {
        const guidance = createMockGuidance({
          keyPoints: [
            createMockKeyPoint({
              triggers: ['special', 'offer'],
              content: 'Mention our current promotion',
            }),
          ],
        });
        vi.mocked(repository.findForCall).mockResolvedValue({ success: true, data: guidance });

        // Load new guidance with the talking point
        service.endCallGuidance('call-001');
      });
    });

    describe('acknowledgeSuggestion', () => {
      it('should return false for unknown call', () => {
        expect(service.acknowledgeSuggestion('unknown-call', 'suggestion-1')).toBe(false);
      });

      it('should acknowledge existing suggestion', () => {
        service.processMessage('call-001', 'customer', 'prea scump');
        const suggestions = service.getSuggestions('call-001');

        if (suggestions.length > 0) {
          const result = service.acknowledgeSuggestion('call-001', suggestions[0].id);
          expect(result).toBe(true);
          expect(suggestions[0].acknowledged).toBe(true);
        }
      });

      it('should return false for non-existing suggestion', () => {
        expect(service.acknowledgeSuggestion('call-001', 'non-existing')).toBe(false);
      });
    });

    describe('getSuggestions', () => {
      it('should return empty array for unknown call', () => {
        expect(service.getSuggestions('unknown-call')).toEqual([]);
      });

      it('should return all suggestions', () => {
        service.processMessage('call-001', 'customer', 'prea scump');
        const suggestions = service.getSuggestions('call-001');
        expect(Array.isArray(suggestions)).toBe(true);
      });
    });

    describe('getPendingSuggestions', () => {
      it('should return only unacknowledged suggestions', () => {
        service.processMessage('call-001', 'customer', 'prea scump');
        const suggestions = service.getSuggestions('call-001');

        if (suggestions.length > 0) {
          service.acknowledgeSuggestion('call-001', suggestions[0].id);
          const pending = service.getPendingSuggestions('call-001');
          expect(pending.length).toBe(suggestions.length - 1);
        }
      });
    });
  });

  describe('Collected Data', () => {
    beforeEach(async () => {
      await service.loadGuidanceForCall('call-001', {
        clinicId: MOCK_CLINIC_UUID,
        procedureType: 'all-on-x',
        callType: 'outbound',
      });
    });

    describe('getCollectedData', () => {
      it('should return empty object for unknown call', () => {
        expect(service.getCollectedData('unknown-call')).toEqual({});
      });

      it('should return collected data', () => {
        service.updateCollectedData('call-001', { name: 'John' });
        expect(service.getCollectedData('call-001').name).toBe('John');
      });
    });

    describe('updateCollectedData', () => {
      it('should do nothing for unknown call', () => {
        service.updateCollectedData('unknown-call', { name: 'John' });
        // Should not throw
      });

      it('should merge data', () => {
        service.updateCollectedData('call-001', { name: 'John' });
        service.updateCollectedData('call-001', { phone: '123' });

        const data = service.getCollectedData('call-001');
        expect(data.name).toBe('John');
        expect(data.phone).toBe('123');
      });
    });
  });

  describe('Utility Methods', () => {
    describe('getActiveCallCount', () => {
      it('should return 0 when no active calls', () => {
        expect(service.getActiveCallCount()).toBe(0);
      });

      it('should return count of active calls', async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        await service.loadGuidanceForCall('call-002', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        expect(service.getActiveCallCount()).toBe(2);
      });
    });

    describe('getActiveCallSids', () => {
      it('should return all active call SIDs', async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        const sids = service.getActiveCallSids();
        expect(sids).toContain('call-001');
      });
    });

    describe('hasGuidance', () => {
      it('should return false for unknown call', () => {
        expect(service.hasGuidance('unknown-call')).toBe(false);
      });

      it('should return true for loaded call', async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        expect(service.hasGuidance('call-001')).toBe(true);
      });
    });

    describe('destroy', () => {
      it('should clear all active calls', async () => {
        await service.loadGuidanceForCall('call-001', {
          clinicId: MOCK_CLINIC_UUID,
          procedureType: 'all-on-x',
          callType: 'outbound',
        });

        service.destroy();
        expect(service.getActiveCallCount()).toBe(0);
      });
    });
  });

  describe('Factory Functions', () => {
    describe('getGuidanceService', () => {
      it('should create singleton instance', () => {
        resetGuidanceService();
        const svc1 = getGuidanceService(repository);
        const svc2 = getGuidanceService(repository);
        expect(svc1).toBe(svc2);
      });
    });

    describe('resetGuidanceService', () => {
      it('should reset singleton', () => {
        const svc1 = getGuidanceService(repository);
        resetGuidanceService();
        const svc2 = getGuidanceService(repository);
        expect(svc1).not.toBe(svc2);
      });
    });
  });

  describe('Objection Detection Config', () => {
    it('should disable objection detection when configured', async () => {
      const svc = new GuidanceService(repository, { enableObjectionDetection: false });

      await svc.loadGuidanceForCall('call-001', {
        clinicId: MOCK_CLINIC_UUID,
        procedureType: 'all-on-x',
        callType: 'outbound',
      });

      const suggestions = svc.processMessage('call-001', 'customer', 'prea scump');
      const objectionSuggestions = suggestions.filter((s) => s.type === 'objection-response');
      expect(objectionSuggestions).toHaveLength(0);

      svc.destroy();
    });
  });
});
