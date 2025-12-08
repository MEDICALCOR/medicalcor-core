/**
 * @fileoverview Guidance Service Tests
 *
 * Tests for the Agent Guidance Service that manages call scripts
 * and provides real-time guidance suggestions during calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  GuidanceService,
  getGuidanceService,
  resetGuidanceService,
  type GuidanceServiceConfig,
} from '../guidance/guidance-service.js';
import type {
  IGuidanceRepository,
  GuidanceRepositoryResult,
  PaginatedGuidance,
} from '../guidance/repositories/GuidanceRepository.js';
import type {
  AgentGuidance,
  CreateGuidance,
  ScriptStep,
  ObjectionHandler,
} from '@medicalcor/types';

// ============================================================================
// MOCK HELPERS
// ============================================================================

function createMockRepository(): IGuidanceRepository {
  return {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    search: vi.fn(),
    activate: vi.fn(),
    deactivate: vi.fn(),
    publish: vi.fn(),
    createVersion: vi.fn(),
    getVersionHistory: vi.fn(),
    findForCall: vi.fn(),
    incrementUsage: vi.fn(),
    updateMetrics: vi.fn(),
  };
}

function createMockGuidance(overrides: Partial<AgentGuidance> = {}): AgentGuidance {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    clinicId: '660e8400-e29b-41d4-a716-446655440001',
    name: 'Test Guidance',
    description: 'Test guidance description',
    type: 'call-script',
    category: 'scheduling',
    version: 1,
    status: 'published',
    isActive: true,
    isDraft: false,
    audience: 'new-patient',
    initialGreeting: 'Hello, welcome to our clinic',
    closingStatements: [],
    languages: ['ro', 'en'],
    defaultLanguage: 'ro',
    procedures: [],
    steps: [
      {
        id: 'step-1',
        order: 1,
        title: 'Greeting',
        content: 'Hello, welcome to our clinic',
        type: 'intro',
        isMandatory: true,
      },
      {
        id: 'step-2',
        order: 2,
        title: 'Collect Info',
        content: 'May I have your name please?',
        type: 'data-collection',
        isMandatory: true,
        expectedResponses: [{ response: 'Name provided', nextStepId: 'step-3' }],
      },
      {
        id: 'step-3',
        order: 3,
        title: 'Schedule',
        content: 'Let me check our availability',
        type: 'action',
        isMandatory: false,
      },
    ],
    keyPoints: [
      {
        id: 'point-1',
        content: 'We offer free consultations',
        contentRo: 'Oferim consultații gratuite',
        priority: 'high',
        triggers: ['price', 'cost', 'free'],
      },
    ],
    objectionHandlers: [
      {
        id: 'objection-1',
        category: 'price',
        objection: 'Too expensive',
        objectionPatterns: ['prea scump', 'costă mult'],
        response: 'We offer flexible payment plans',
        responseRo: 'Oferim planuri de plată flexibile',
        priority: 'high',
      },
    ],
    tags: ['test', 'appointment'],
    usageCount: 10,
    avgSuccessRate: 0.85,
    avgCallDuration: 300,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    createdBy: 'user-123',
    ...overrides,
  };
}

function createMockCreateGuidance(): CreateGuidance {
  return {
    clinicId: '660e8400-e29b-41d4-a716-446655440001',
    name: 'New Guidance',
    description: 'New guidance description',
    type: 'call-script',
    category: 'scheduling',
    audience: 'new-patient',
    initialGreeting: 'Hello, welcome to our clinic!',
    steps: [],
    keyPoints: [],
    objectionHandlers: [],
    closingStatements: [],
    tags: [],
    procedures: [],
    languages: ['ro', 'en'],
    defaultLanguage: 'ro',
    isActive: true,
    isDraft: true,
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe('GuidanceService', () => {
  let repository: IGuidanceRepository;
  let service: GuidanceService;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGuidanceService();
    repository = createMockRepository();
    service = new GuidanceService(repository);
  });

  afterEach(() => {
    service.destroy();
    resetGuidanceService();
  });

  // ==========================================================================
  // Constructor
  // ==========================================================================

  describe('constructor', () => {
    it('should create service with default config', () => {
      expect(service).toBeDefined();
    });

    it('should create service with custom config', () => {
      const config: GuidanceServiceConfig = {
        maxSuggestionsPerCall: 100,
        enableObjectionDetection: false,
        minSuggestionConfidence: 0.7,
        defaultLanguage: 'en',
      };
      const customService = new GuidanceService(repository, config);
      expect(customService).toBeDefined();
      customService.destroy();
    });
  });

  describe('getGuidanceService (singleton)', () => {
    it('should return singleton instance', () => {
      const instance1 = getGuidanceService(repository);
      const instance2 = getGuidanceService(repository);
      expect(instance1).toBe(instance2);
    });
  });

  // ==========================================================================
  // CRUD Operations
  // ==========================================================================

  describe('createGuidance', () => {
    it('should create guidance with valid input', async () => {
      const input = createMockCreateGuidance();
      const createdGuidance = createMockGuidance({ name: input.name });
      (repository.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: createdGuidance,
      });

      const result = await service.createGuidance(input);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('New Guidance');
      }
    });

    it('should return validation error for invalid input', async () => {
      const invalidInput = { name: '' } as CreateGuidance; // Missing required fields

      const result = await service.createGuidance(invalidInput);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });

  describe('updateGuidance', () => {
    it('should update guidance', async () => {
      const updatedGuidance = createMockGuidance({ name: 'Updated Name' });
      (repository.update as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: updatedGuidance,
      });

      const result = await service.updateGuidance('550e8400-e29b-41d4-a716-446655440000', {
        name: 'Updated Name',
      });

      expect(result.success).toBe(true);
      expect(repository.update).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000', {
        name: 'Updated Name',
      });
    });
  });

  describe('deleteGuidance', () => {
    it('should delete guidance', async () => {
      (repository.delete as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: undefined,
      });

      const result = await service.deleteGuidance('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
      expect(repository.delete).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('getGuidance', () => {
    it('should return guidance by id', async () => {
      const guidance = createMockGuidance();
      (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      const result = await service.getGuidance('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      }
    });
  });

  describe('listGuidance', () => {
    it('should list guidance with pagination', async () => {
      const paginatedResult: PaginatedGuidance = {
        items: [createMockGuidance()],
        total: 1,
        limit: 10,
        offset: 0,
        hasMore: false,
      };
      (repository.list as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: paginatedResult,
      });

      const result = await service.listGuidance({
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.items).toHaveLength(1);
      }
    });
  });

  // ==========================================================================
  // Status Management
  // ==========================================================================

  describe('activateGuidance', () => {
    it('should activate guidance', async () => {
      const activeGuidance = createMockGuidance({ isActive: true });
      (repository.activate as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: activeGuidance,
      });

      const result = await service.activateGuidance('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
      expect(repository.activate).toHaveBeenCalledWith('550e8400-e29b-41d4-a716-446655440000');
    });
  });

  describe('deactivateGuidance', () => {
    it('should deactivate guidance', async () => {
      const inactiveGuidance = createMockGuidance({ isActive: false });
      (repository.deactivate as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: inactiveGuidance,
      });

      const result = await service.deactivateGuidance('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Call Guidance Management
  // ==========================================================================

  describe('loadGuidanceForCall', () => {
    it('should load guidance for a call', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      const result = await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      }
      expect(service.hasGuidance('call-123')).toBe(true);
    });

    it('should return null when no guidance found', async () => {
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: null,
      });

      const result = await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
    });

    it('should emit guidance:loaded event', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      const listener = vi.fn();
      service.on('guidance:loaded', listener);

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });

      expect(listener).toHaveBeenCalledWith('call-123', guidance);
    });
  });

  describe('getCallGuidance', () => {
    it('should return guidance for active call', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const result = service.getCallGuidance('call-123');

      expect(result).toEqual(guidance);
    });

    it('should return null for non-existent call', () => {
      const result = service.getCallGuidance('non-existent');
      expect(result).toBeNull();
    });
  });

  describe('getCurrentStep', () => {
    it('should return current step', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const step = service.getCurrentStep('call-123');

      expect(step?.id).toBe('step-1');
    });

    it('should return null for guidance with no steps', async () => {
      const guidance = createMockGuidance({ steps: [] });
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const step = service.getCurrentStep('call-123');

      expect(step).toBeNull();
    });
  });

  describe('completeStep', () => {
    it('should complete step and return next', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const nextStep = service.completeStep('call-123', 'step-1');

      expect(nextStep?.id).toBe('step-2');
    });

    it('should emit step-complete event', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      const listener = vi.fn();
      service.on('guidance:step-complete', listener);

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      service.completeStep('call-123', 'step-1');

      expect(listener).toHaveBeenCalledWith('call-123', 'step-1', 'step-2');
    });

    it('should collect data when completing step', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      service.completeStep('call-123', 'step-1', { patientName: 'John' });

      const data = service.getCollectedData('call-123');
      expect(data.patientName).toBe('John');
    });
  });

  describe('skipStep', () => {
    it('should skip step and return next', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const nextStep = service.skipStep('call-123', 'step-1');

      expect(nextStep?.id).toBe('step-2');
    });
  });

  describe('endCallGuidance', () => {
    it('should end guidance and cleanup state', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      service.completeStep('call-123', 'step-1');
      service.endCallGuidance('call-123');

      expect(service.hasGuidance('call-123')).toBe(false);
    });
  });

  // ==========================================================================
  // Real-time Suggestions
  // ==========================================================================

  describe('processMessage', () => {
    it('should detect objections in customer messages', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const suggestions = service.processMessage('call-123', 'customer', 'Este prea scump');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0].type).toBe('objection-response');
    });

    it('should detect English objections', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
        language: 'en',
      });
      const suggestions = service.processMessage('call-123', 'customer', 'This is too expensive');

      expect(suggestions.some((s) => s.type === 'objection-response')).toBe(true);
    });

    it('should find relevant talking points', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const suggestions = service.processMessage('call-123', 'customer', 'What is the price?');

      expect(suggestions.some((s) => s.type === 'talking-point')).toBe(true);
    });

    it('should emit suggestion event', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      const listener = vi.fn();
      service.on('guidance:suggestion', listener);

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      service.processMessage('call-123', 'customer', 'Este prea scump');

      expect(listener).toHaveBeenCalled();
    });

    it('should return empty array for non-existent call', () => {
      const suggestions = service.processMessage('non-existent', 'customer', 'Hello');
      expect(suggestions).toEqual([]);
    });
  });

  describe('acknowledgeSuggestion', () => {
    it('should acknowledge suggestion', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const suggestions = service.processMessage('call-123', 'customer', 'prea scump');

      if (suggestions.length > 0) {
        const acknowledged = service.acknowledgeSuggestion('call-123', suggestions[0].id);
        expect(acknowledged).toBe(true);

        const pending = service.getPendingSuggestions('call-123');
        expect(pending.find((s) => s.id === suggestions[0].id)).toBeUndefined();
      }
    });

    it('should return false for non-existent suggestion', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      const acknowledged = service.acknowledgeSuggestion('call-123', 'non-existent');

      expect(acknowledged).toBe(false);
    });
  });

  describe('getSuggestions', () => {
    it('should return all suggestions for call', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      service.processMessage('call-123', 'customer', 'prea scump');

      const suggestions = service.getSuggestions('call-123');
      expect(suggestions.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Collected Data
  // ==========================================================================

  describe('updateCollectedData', () => {
    it('should update collected data', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      service.updateCollectedData('call-123', { phone: '123456789' });

      const data = service.getCollectedData('call-123');
      expect(data.phone).toBe('123456789');
    });
  });

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  describe('getActiveCallCount', () => {
    it('should return count of active calls', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-1', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      await service.loadGuidanceForCall('call-2', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });

      expect(service.getActiveCallCount()).toBe(2);
    });
  });

  describe('getActiveCallSids', () => {
    it('should return list of active call SIDs', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-1', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      await service.loadGuidanceForCall('call-2', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });

      const sids = service.getActiveCallSids();
      expect(sids).toContain('call-1');
      expect(sids).toContain('call-2');
    });
  });

  describe('hasGuidance', () => {
    it('should return true for active call', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });

      expect(service.hasGuidance('call-123')).toBe(true);
    });

    it('should return false for non-existent call', () => {
      expect(service.hasGuidance('non-existent')).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should cleanup all resources', async () => {
      const guidance = createMockGuidance();
      (repository.findForCall as ReturnType<typeof vi.fn>).mockResolvedValue({
        success: true,
        data: guidance,
      });

      await service.loadGuidanceForCall('call-123', {
        clinicId: '660e8400-e29b-41d4-a716-446655440001',
      });
      service.destroy();

      expect(service.getActiveCallCount()).toBe(0);
    });
  });
});
