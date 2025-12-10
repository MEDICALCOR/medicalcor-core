/**
 * GuidanceService Unit Tests
 *
 * Tests for the Agent Guidance Service that manages call scripts
 * and provides real-time guidance suggestions during calls.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type {
  AgentGuidance,
  CreateGuidance,
  GuidanceSuggestion,
  ScriptStep,
  ObjectionHandler,
  TalkingPoint,
} from '@medicalcor/types';
import type {
  IGuidanceRepository,
  GuidanceRepositoryResult,
  PaginatedGuidance,
  GuidanceForCallSpec,
} from '../repositories/GuidanceRepository.js';
import {
  GuidanceService,
  getGuidanceService,
  resetGuidanceService,
  type GuidanceServiceConfig,
  type ScriptCompletionStats,
} from '../guidance-service.js';

// =============================================================================
// Test Factories
// =============================================================================

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
    id: crypto.randomUUID(),
    clinicId: crypto.randomUUID(),
    name: 'Test Guidance Script',
    description: 'A test guidance script for calls',
    type: 'call-script',
    category: 'consultation',
    audience: 'all',
    initialGreeting: 'Hello, welcome to our clinic!',
    steps: [
      createMockStep({ id: 'step-1', order: 1, actionType: 'say' }),
      createMockStep({ id: 'step-2', order: 2, actionType: 'ask' }),
      createMockStep({ id: 'step-3', order: 3, actionType: 'say' }),
    ],
    keyPoints: [],
    objectionHandlers: [],
    closingStatements: [],
    procedures: [],
    languages: ['en', 'ro'],
    defaultLanguage: 'ro',
    isActive: true,
    isDraft: false,
    version: 1,
    usageCount: 0,
    tags: ['test'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockStep(overrides: Partial<ScriptStep> = {}): ScriptStep {
  return {
    id: `step-${crypto.randomUUID()}`,
    order: 1,
    actionType: 'say',
    content: 'This is test content for the step',
    expectedResponses: [],
    isRequired: true,
    ...overrides,
  };
}

function createMockKeyPoint(overrides: Partial<TalkingPoint> = {}): TalkingPoint {
  return {
    id: `keypoint-${crypto.randomUUID()}`,
    topic: 'Test Topic',
    content: 'Key talking point',
    priority: 'medium',
    triggers: ['price', 'cost'],
    isRequired: false,
    ...overrides,
  };
}

function createMockObjectionHandler(overrides: Partial<ObjectionHandler> = {}): ObjectionHandler {
  return {
    id: `handler-${crypto.randomUUID()}`,
    objection: 'Price objection',
    category: 'pricing',
    objectionPatterns: ['too expensive', 'costs too much'],
    response: 'I understand your concern about price. Let me explain our value.',
    usageCount: 0,
    ...overrides,
  };
}

// =============================================================================
// CRUD Operations Tests
// =============================================================================

describe('GuidanceService', () => {
  let service: GuidanceService;
  let mockRepository: IGuidanceRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    resetGuidanceService();
    mockRepository = createMockRepository();
    service = new GuidanceService(mockRepository);
  });

  afterEach(() => {
    service.destroy();
  });

  describe('CRUD Operations', () => {
    describe('createGuidance', () => {
      it('should create guidance with valid input', async () => {
        const input: CreateGuidance = {
          clinicId: crypto.randomUUID(),
          name: 'New Script',
          description: 'A new guidance script',
          type: 'call-script',
          category: 'consultation',
          initialGreeting: 'Hello, welcome to our clinic!',
          steps: [
            {
              id: 'step-1',
              order: 1,
              actionType: 'say',
              content: 'How can I help you today?',
            },
          ],
          keyPoints: [],
          objectionHandlers: [],
          tags: [],
        };

        const mockGuidance = createMockGuidance({ ...input });
        vi.mocked(mockRepository.create).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        const result = await service.createGuidance(input);

        expect(result.success).toBe(true);
        expect(mockRepository.create).toHaveBeenCalled();
      });

      it('should return validation error for invalid input', async () => {
        const invalidInput = {
          // Missing required fields
          name: '',
        } as CreateGuidance;

        const result = await service.createGuidance(invalidInput);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('VALIDATION_ERROR');
        expect(mockRepository.create).not.toHaveBeenCalled();
      });
    });

    describe('updateGuidance', () => {
      it('should delegate to repository for updates', async () => {
        const updates = { name: 'Updated Name' };
        vi.mocked(mockRepository.update).mockResolvedValue({
          success: true,
          data: createMockGuidance({ name: 'Updated Name' }),
        });

        const result = await service.updateGuidance('guidance-123', updates);

        expect(result.success).toBe(true);
        expect(mockRepository.update).toHaveBeenCalledWith('guidance-123', updates);
      });
    });

    describe('deleteGuidance', () => {
      it('should delegate to repository for deletion', async () => {
        vi.mocked(mockRepository.delete).mockResolvedValue({ success: true, data: undefined });

        const result = await service.deleteGuidance('guidance-123');

        expect(result.success).toBe(true);
        expect(mockRepository.delete).toHaveBeenCalledWith('guidance-123');
      });
    });

    describe('getGuidance', () => {
      it('should retrieve guidance by ID', async () => {
        const mockGuidance = createMockGuidance();
        vi.mocked(mockRepository.findById).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        const result = await service.getGuidance('guidance-123');

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockGuidance);
      });

      it('should return null for non-existent guidance', async () => {
        vi.mocked(mockRepository.findById).mockResolvedValue({
          success: true,
          data: null,
        });

        const result = await service.getGuidance('non-existent');

        expect(result.success).toBe(true);
        expect(result.data).toBeNull();
      });
    });

    describe('listGuidance', () => {
      it('should list guidance with pagination', async () => {
        const mockPaginated: PaginatedGuidance = {
          items: [createMockGuidance()],
          total: 1,
          page: 1,
          pageSize: 10,
          hasMore: false,
        };
        vi.mocked(mockRepository.list).mockResolvedValue({
          success: true,
          data: mockPaginated,
        });

        const result = await service.listGuidance({
          clinicId: 'clinic-001',
          page: 1,
          pageSize: 10,
        });

        expect(result.success).toBe(true);
        expect(result.data?.items).toHaveLength(1);
      });
    });

    describe('searchGuidance', () => {
      it('should search guidance by term and tags', async () => {
        const mockResults = [createMockGuidance()];
        vi.mocked(mockRepository.search).mockResolvedValue({
          success: true,
          data: mockResults,
        });

        const result = await service.searchGuidance('clinic-001', 'test', ['tag1']);

        expect(result.success).toBe(true);
        expect(mockRepository.search).toHaveBeenCalledWith({
          clinicId: 'clinic-001',
          searchTerm: 'test',
          tags: ['tag1'],
        });
      });
    });
  });

  // =============================================================================
  // Status Management Tests
  // =============================================================================

  describe('Status Management', () => {
    it('should activate guidance', async () => {
      const mockGuidance = createMockGuidance({ status: 'active' });
      vi.mocked(mockRepository.activate).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      const result = await service.activateGuidance('guidance-123');

      expect(result.success).toBe(true);
      expect(mockRepository.activate).toHaveBeenCalledWith('guidance-123');
    });

    it('should deactivate guidance', async () => {
      const mockGuidance = createMockGuidance({ status: 'inactive' });
      vi.mocked(mockRepository.deactivate).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      const result = await service.deactivateGuidance('guidance-123');

      expect(result.success).toBe(true);
      expect(mockRepository.deactivate).toHaveBeenCalledWith('guidance-123');
    });

    it('should publish guidance', async () => {
      const mockGuidance = createMockGuidance({ status: 'published' });
      vi.mocked(mockRepository.publish).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      const result = await service.publishGuidance('guidance-123');

      expect(result.success).toBe(true);
      expect(mockRepository.publish).toHaveBeenCalledWith('guidance-123');
    });
  });

  // =============================================================================
  // Versioning Tests
  // =============================================================================

  describe('Versioning', () => {
    it('should create a new version', async () => {
      const mockGuidance = createMockGuidance({ version: 2 });
      vi.mocked(mockRepository.createVersion).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      const result = await service.createNewVersion('guidance-123', { name: 'Updated' });

      expect(result.success).toBe(true);
      expect(mockRepository.createVersion).toHaveBeenCalledWith('guidance-123', {
        name: 'Updated',
      });
    });

    it('should get version history', async () => {
      const versions = [createMockGuidance({ version: 1 }), createMockGuidance({ version: 2 })];
      vi.mocked(mockRepository.getVersionHistory).mockResolvedValue({
        success: true,
        data: versions,
      });

      const result = await service.getVersionHistory('guidance-123');

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
    });
  });

  // =============================================================================
  // Call Guidance Management Tests
  // =============================================================================

  describe('Call Guidance Management', () => {
    const callSid = 'call-abc123';

    describe('loadGuidanceForCall', () => {
      it('should load guidance for a call and emit event', async () => {
        const mockGuidance = createMockGuidance();
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });
        vi.mocked(mockRepository.incrementUsage).mockResolvedValue({
          success: true,
          data: undefined,
        });

        const loadedHandler = vi.fn();
        service.on('guidance:loaded', loadedHandler);

        const result = await service.loadGuidanceForCall(callSid, {
          clinicId: 'clinic-001',
          callType: 'inbound',
        });

        expect(result.success).toBe(true);
        expect(result.data).toEqual(mockGuidance);
        expect(loadedHandler).toHaveBeenCalledWith(callSid, mockGuidance);
        expect(service.hasGuidance(callSid)).toBe(true);
      });

      it('should return null when no guidance found', async () => {
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: null,
        });

        const result = await service.loadGuidanceForCall(callSid, {
          clinicId: 'clinic-001',
          callType: 'inbound',
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeNull();
      });

      it('should handle repository errors', async () => {
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: false,
          error: { code: 'NOT_FOUND', message: 'Guidance not found' },
        });

        const result = await service.loadGuidanceForCall(callSid, {
          clinicId: 'clinic-001',
          callType: 'inbound',
        });

        expect(result.success).toBe(false);
      });

      it('should use specified language', async () => {
        const mockGuidance = createMockGuidance();
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(callSid, {
          clinicId: 'clinic-001',
          callType: 'inbound',
          language: 'ro',
        });

        // Language should be stored in state (verified through suggestions)
        expect(service.hasGuidance(callSid)).toBe(true);
      });
    });

    describe('getCallGuidance', () => {
      it('should return guidance for active call', async () => {
        const mockGuidance = createMockGuidance();
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });

        expect(service.getCallGuidance(callSid)).toEqual(mockGuidance);
      });

      it('should return null for unknown call', () => {
        expect(service.getCallGuidance('unknown-call')).toBeNull();
      });
    });

    describe('getCurrentStep', () => {
      it('should return current step', async () => {
        const steps = [
          createMockStep({ id: 'step-1', order: 1 }),
          createMockStep({ id: 'step-2', order: 2 }),
        ];
        const mockGuidance = createMockGuidance({ steps });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });

        expect(service.getCurrentStep(callSid)?.id).toBe('step-1');
      });

      it('should return null for call without guidance', () => {
        expect(service.getCurrentStep('unknown-call')).toBeNull();
      });

      it('should return null for guidance with no steps', async () => {
        const mockGuidance = createMockGuidance({ steps: [] });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });

        expect(service.getCurrentStep(callSid)).toBeNull();
      });
    });

    describe('completeStep', () => {
      beforeEach(async () => {
        const steps = [
          createMockStep({ id: 'step-1', order: 1 }),
          createMockStep({ id: 'step-2', order: 2 }),
          createMockStep({ id: 'step-3', order: 3 }),
        ];
        const mockGuidance = createMockGuidance({ steps });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });
        vi.mocked(mockRepository.updateMetrics).mockResolvedValue({
          success: true,
          data: undefined,
        });

        await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });
      });

      it('should complete step and move to next', () => {
        const stepCompleteHandler = vi.fn();
        service.on('guidance:step-complete', stepCompleteHandler);

        const nextStep = service.completeStep(callSid, 'step-1');

        expect(nextStep?.id).toBe('step-2');
        expect(stepCompleteHandler).toHaveBeenCalledWith(callSid, 'step-1', 'step-2');
      });

      it('should store collected data', () => {
        service.completeStep(callSid, 'step-1', { name: 'John', phone: '555-1234' });

        const collectedData = service.getCollectedData(callSid);
        expect(collectedData).toEqual({ name: 'John', phone: '555-1234' });
      });

      it('should complete script when last step is done', () => {
        const scriptCompleteHandler = vi.fn();
        service.on('guidance:script-complete', scriptCompleteHandler);

        service.completeStep(callSid, 'step-1');
        service.completeStep(callSid, 'step-2');
        const finalStep = service.completeStep(callSid, 'step-3');

        expect(finalStep).toBeNull();
        expect(scriptCompleteHandler).toHaveBeenCalled();
      });

      it('should return null for unknown call', () => {
        expect(service.completeStep('unknown-call', 'step-1')).toBeNull();
      });

      it('should handle conditional branching with expectedResponses', async () => {
        const steps = [
          createMockStep({
            id: 'step-1',
            order: 1,
            expectedResponses: [{ response: 'yes', nextStepId: 'step-3' }],
          }),
          createMockStep({ id: 'step-2', order: 2 }),
          createMockStep({ id: 'step-3', order: 3 }),
        ];
        const mockGuidance = createMockGuidance({ steps });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        const branchCallSid = 'call-branch';
        await service.loadGuidanceForCall(branchCallSid, {
          clinicId: 'clinic-001',
          callType: 'inbound',
        });

        const nextStep = service.completeStep(branchCallSid, 'step-1');
        expect(nextStep?.id).toBe('step-3');
      });
    });

    describe('skipStep', () => {
      beforeEach(async () => {
        const steps = [
          createMockStep({ id: 'step-1', order: 1 }),
          createMockStep({ id: 'step-2', order: 2 }),
        ];
        const mockGuidance = createMockGuidance({ steps });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });
      });

      it('should skip step and move to next', () => {
        const nextStep = service.skipStep(callSid, 'step-1');

        expect(nextStep?.id).toBe('step-2');
      });

      it('should return null when skipping last step', () => {
        service.skipStep(callSid, 'step-1');
        const result = service.skipStep(callSid, 'step-2');

        expect(result).toBeNull();
      });

      it('should return null for unknown call', () => {
        expect(service.skipStep('unknown-call', 'step-1')).toBeNull();
      });
    });

    describe('endCallGuidance', () => {
      it('should end guidance and complete script if steps were completed', async () => {
        const mockGuidance = createMockGuidance();
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });
        vi.mocked(mockRepository.updateMetrics).mockResolvedValue({
          success: true,
          data: undefined,
        });

        await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });

        service.completeStep(callSid, 'step-1');

        const scriptCompleteHandler = vi.fn();
        service.on('guidance:script-complete', scriptCompleteHandler);

        service.endCallGuidance(callSid);

        expect(service.hasGuidance(callSid)).toBe(false);
        expect(scriptCompleteHandler).toHaveBeenCalled();
      });

      it('should end guidance without completing if no steps done', async () => {
        const mockGuidance = createMockGuidance();
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });

        const scriptCompleteHandler = vi.fn();
        service.on('guidance:script-complete', scriptCompleteHandler);

        service.endCallGuidance(callSid);

        expect(service.hasGuidance(callSid)).toBe(false);
        expect(scriptCompleteHandler).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // Real-time Suggestions Tests
  // =============================================================================

  describe('Real-time Suggestions', () => {
    const callSid = 'call-suggestions';

    beforeEach(async () => {
      const objectionHandlers = [
        createMockObjectionHandler({
          category: 'price',
          objectionPatterns: ['expensive', 'too much'],
          response: 'Let me explain our value proposition.',
          responseRo: 'Permiteți-mi să vă explic propunerea noastră de valoare.',
        }),
      ];
      const keyPoints = [
        createMockKeyPoint({
          content: 'We offer premium dental implants.',
          contentRo: 'Oferim implanturi dentare premium.',
          triggers: ['implant', 'quality'],
          priority: 'high',
        }),
      ];
      const mockGuidance = createMockGuidance({ objectionHandlers, keyPoints });
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });
    });

    describe('processMessage', () => {
      it('should detect objections in customer message', () => {
        const suggestionHandler = vi.fn();
        const objectionHandler = vi.fn();
        service.on('guidance:suggestion', suggestionHandler);
        service.on('guidance:objection-detected', objectionHandler);

        const suggestions = service.processMessage(
          callSid,
          'customer',
          'This is too expensive for me'
        );

        expect(suggestions.length).toBeGreaterThan(0);
        expect(suggestions[0].type).toBe('objection-response');
        expect(objectionHandler).toHaveBeenCalled();
      });

      it('should detect objections using built-in patterns (Romanian)', () => {
        const objectionHandler = vi.fn();
        service.on('guidance:objection-detected', objectionHandler);

        const suggestions = service.processMessage(
          callSid,
          'customer',
          'Costă prea mult pentru mine'
        );

        expect(suggestions.length).toBeGreaterThan(0);
        expect(objectionHandler).toHaveBeenCalled();
      });

      it('should find relevant talking points', () => {
        const suggestions = service.processMessage(
          callSid,
          'customer',
          'Tell me about implant quality'
        );

        const talkingPoints = suggestions.filter((s) => s.type === 'talking-point');
        expect(talkingPoints.length).toBeGreaterThan(0);
      });

      it('should not process objections for non-customer speakers', () => {
        const objectionHandler = vi.fn();
        service.on('guidance:objection-detected', objectionHandler);

        service.processMessage(callSid, 'agent', 'This is too expensive');

        expect(objectionHandler).not.toHaveBeenCalled();
      });

      it('should return empty array for unknown call', () => {
        const suggestions = service.processMessage('unknown-call', 'customer', 'Hello');
        expect(suggestions).toEqual([]);
      });

      it('should limit suggestions per call', async () => {
        // Create service with low suggestion limit
        const limitedService = new GuidanceService(mockRepository, {
          maxSuggestionsPerCall: 2,
        });

        const mockGuidance = createMockGuidance({
          keyPoints: [
            createMockKeyPoint({ triggers: ['a'], content: 'Point A' }),
            createMockKeyPoint({ triggers: ['b'], content: 'Point B' }),
            createMockKeyPoint({ triggers: ['c'], content: 'Point C' }),
          ],
        });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await limitedService.loadGuidanceForCall('limited-call', {
          clinicId: 'clinic-001',
          callType: 'inbound',
        });

        limitedService.processMessage('limited-call', 'customer', 'a b c');

        const allSuggestions = limitedService.getSuggestions('limited-call');
        expect(allSuggestions.length).toBeLessThanOrEqual(2);

        limitedService.destroy();
      });

      it('should use Romanian content when language is ro', async () => {
        const roCallSid = 'call-ro';
        const objectionHandlers = [
          createMockObjectionHandler({
            category: 'price',
            objectionPatterns: ['too expensive'],
            response: 'English response',
            responseRo: 'Romanian response',
          }),
        ];
        const mockGuidance = createMockGuidance({ objectionHandlers });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(roCallSid, {
          clinicId: 'clinic-001',
          callType: 'inbound',
          language: 'ro',
        });

        const suggestions = service.processMessage(roCallSid, 'customer', 'This is too expensive');

        expect(suggestions[0]?.content).toBe('Romanian response');
      });

      it('should handle custom objection patterns', async () => {
        const customCallSid = 'call-custom';
        const objectionHandlers = [
          createMockObjectionHandler({
            category: 'custom',
            objectionPatterns: ['custom pattern.*test'],
            response: 'Custom response',
          }),
        ];
        const mockGuidance = createMockGuidance({ objectionHandlers });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(customCallSid, {
          clinicId: 'clinic-001',
          callType: 'inbound',
        });

        const suggestions = service.processMessage(
          customCallSid,
          'customer',
          'This is a custom pattern for test'
        );

        expect(suggestions.length).toBeGreaterThan(0);
      });

      it('should skip invalid regex patterns gracefully', async () => {
        const invalidCallSid = 'call-invalid';
        const objectionHandlers = [
          createMockObjectionHandler({
            category: 'invalid',
            objectionPatterns: ['[invalid(regex'],
            response: 'Should not appear',
          }),
        ];
        const mockGuidance = createMockGuidance({ objectionHandlers });
        vi.mocked(mockRepository.findForCall).mockResolvedValue({
          success: true,
          data: mockGuidance,
        });

        await service.loadGuidanceForCall(invalidCallSid, {
          clinicId: 'clinic-001',
          callType: 'inbound',
        });

        // Should not throw
        const suggestions = service.processMessage(invalidCallSid, 'customer', 'Test message');
        expect(suggestions).toBeDefined();
      });
    });

    describe('acknowledgeSuggestion', () => {
      it('should acknowledge a suggestion', () => {
        service.processMessage(callSid, 'customer', 'This is too expensive');
        const suggestions = service.getSuggestions(callSid);

        expect(suggestions[0].acknowledged).toBe(false);

        const result = service.acknowledgeSuggestion(callSid, suggestions[0].id);

        expect(result).toBe(true);
        expect(service.getSuggestions(callSid)[0].acknowledged).toBe(true);
      });

      it('should return false for unknown call', () => {
        expect(service.acknowledgeSuggestion('unknown-call', 'any-id')).toBe(false);
      });

      it('should return false for unknown suggestion', () => {
        service.processMessage(callSid, 'customer', 'This is too expensive');

        expect(service.acknowledgeSuggestion(callSid, 'unknown-suggestion')).toBe(false);
      });
    });

    describe('getSuggestions', () => {
      it('should return all suggestions for a call', () => {
        service.processMessage(callSid, 'customer', 'This is too expensive');
        service.processMessage(callSid, 'customer', 'Tell me about implant quality');

        const suggestions = service.getSuggestions(callSid);
        expect(suggestions.length).toBeGreaterThan(0);
      });

      it('should return empty array for unknown call', () => {
        expect(service.getSuggestions('unknown-call')).toEqual([]);
      });
    });

    describe('getPendingSuggestions', () => {
      it('should return only unacknowledged suggestions', () => {
        service.processMessage(callSid, 'customer', 'This is too expensive');
        const suggestions = service.getSuggestions(callSid);
        service.acknowledgeSuggestion(callSid, suggestions[0].id);

        const pending = service.getPendingSuggestions(callSid);
        expect(pending.every((s) => !s.acknowledged)).toBe(true);
      });

      it('should return empty array for unknown call', () => {
        expect(service.getPendingSuggestions('unknown-call')).toEqual([]);
      });
    });
  });

  // =============================================================================
  // Objection Detection Tests
  // =============================================================================

  describe('Objection Detection', () => {
    const callSid = 'call-objections';

    beforeEach(async () => {
      const objectionHandlers = [
        createMockObjectionHandler({
          category: 'price',
          response: 'Price objection response',
        }),
        createMockObjectionHandler({
          category: 'time',
          objectionPatterns: ['no time', 'busy'],
          response: 'Time objection response',
        }),
        createMockObjectionHandler({
          category: 'trust',
          objectionPatterns: ['not sure'],
          response: 'Trust objection response',
        }),
        createMockObjectionHandler({
          category: 'need',
          objectionPatterns: ["don't need"],
          response: 'Need objection response',
        }),
        createMockObjectionHandler({
          category: 'competitor',
          objectionPatterns: ['other doctor'],
          response: 'Competitor objection response',
        }),
      ];
      const mockGuidance = createMockGuidance({ objectionHandlers });
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });
    });

    it('should detect price objections (English)', () => {
      const suggestions = service.processMessage(callSid, 'customer', "I can't afford this");
      expect(suggestions.some((s) => s.content === 'Price objection response')).toBe(true);
    });

    it('should detect time objections (English)', () => {
      const suggestions = service.processMessage(
        callSid,
        'customer',
        "I don't have time right now"
      );
      expect(suggestions.some((s) => s.content === 'Time objection response')).toBe(true);
    });

    it('should detect trust objections (English)', () => {
      const suggestions = service.processMessage(callSid, 'customer', "I'm not sure about this");
      expect(suggestions.some((s) => s.content === 'Trust objection response')).toBe(true);
    });

    it('should detect need objections (English)', () => {
      const suggestions = service.processMessage(
        callSid,
        'customer',
        "I don't need this treatment"
      );
      expect(suggestions.some((s) => s.content === 'Need objection response')).toBe(true);
    });

    it('should detect competitor objections (English)', () => {
      const suggestions = service.processMessage(
        callSid,
        'customer',
        'I already have another clinic'
      );
      expect(suggestions.some((s) => s.content === 'Competitor objection response')).toBe(true);
    });

    it('should detect objections (Romanian - price)', () => {
      const suggestions = service.processMessage(
        callSid,
        'customer',
        'Nu îmi permit acest tratament'
      );
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should detect objections (Romanian - time)', () => {
      const suggestions = service.processMessage(callSid, 'customer', 'Nu am timp acum');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should detect objections (Romanian - trust)', () => {
      const suggestions = service.processMessage(callSid, 'customer', 'Nu sunt sigur despre asta');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should detect objections (Romanian - need)', () => {
      const suggestions = service.processMessage(callSid, 'customer', 'Nu am nevoie de asta');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should detect objections (Romanian - competitor)', () => {
      const suggestions = service.processMessage(callSid, 'customer', 'Am un dentist de familie');
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should disable objection detection via config', async () => {
      const noObjectionService = new GuidanceService(mockRepository, {
        enableObjectionDetection: false,
      });

      const mockGuidance = createMockGuidance({
        objectionHandlers: [createMockObjectionHandler({ category: 'price' })],
      });
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      await noObjectionService.loadGuidanceForCall('no-obj-call', {
        clinicId: 'clinic-001',
        callType: 'inbound',
      });

      const suggestions = noObjectionService.processMessage(
        'no-obj-call',
        'customer',
        'This is too expensive'
      );
      expect(suggestions.filter((s) => s.type === 'objection-response')).toHaveLength(0);

      noObjectionService.destroy();
    });
  });

  // =============================================================================
  // Collected Data Tests
  // =============================================================================

  describe('Collected Data', () => {
    const callSid = 'call-data';

    beforeEach(async () => {
      const mockGuidance = createMockGuidance();
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });
    });

    it('should get collected data', () => {
      const data = service.getCollectedData(callSid);
      expect(data).toEqual({});
    });

    it('should update collected data', () => {
      service.updateCollectedData(callSid, { name: 'John' });
      service.updateCollectedData(callSid, { phone: '555-1234' });

      const data = service.getCollectedData(callSid);
      expect(data).toEqual({ name: 'John', phone: '555-1234' });
    });

    it('should return empty object for unknown call', () => {
      expect(service.getCollectedData('unknown-call')).toEqual({});
    });

    it('should not update data for unknown call', () => {
      service.updateCollectedData('unknown-call', { name: 'Test' });
      expect(service.getCollectedData('unknown-call')).toEqual({});
    });
  });

  // =============================================================================
  // Utility Methods Tests
  // =============================================================================

  describe('Utility Methods', () => {
    it('should return active call count', async () => {
      expect(service.getActiveCallCount()).toBe(0);

      const mockGuidance = createMockGuidance();
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      await service.loadGuidanceForCall('call-1', { clinicId: 'clinic-001', callType: 'inbound' });
      await service.loadGuidanceForCall('call-2', { clinicId: 'clinic-001', callType: 'inbound' });

      expect(service.getActiveCallCount()).toBe(2);
    });

    it('should return active call SIDs', async () => {
      const mockGuidance = createMockGuidance();
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      await service.loadGuidanceForCall('call-a', { clinicId: 'clinic-001', callType: 'inbound' });
      await service.loadGuidanceForCall('call-b', { clinicId: 'clinic-001', callType: 'inbound' });

      const sids = service.getActiveCallSids();
      expect(sids).toContain('call-a');
      expect(sids).toContain('call-b');
    });

    it('should check if call has guidance', async () => {
      expect(service.hasGuidance('call-x')).toBe(false);

      const mockGuidance = createMockGuidance();
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      await service.loadGuidanceForCall('call-x', { clinicId: 'clinic-001', callType: 'inbound' });

      expect(service.hasGuidance('call-x')).toBe(true);
    });

    it('should destroy and cleanup', async () => {
      const mockGuidance = createMockGuidance();
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });

      await service.loadGuidanceForCall('call-destroy', {
        clinicId: 'clinic-001',
        callType: 'inbound',
      });

      service.destroy();

      expect(service.getActiveCallCount()).toBe(0);
      expect(service.hasGuidance('call-destroy')).toBe(false);
    });
  });

  // =============================================================================
  // Factory Function Tests
  // =============================================================================

  describe('Factory Functions', () => {
    it('should create singleton instance', () => {
      const instance1 = getGuidanceService(mockRepository);
      const instance2 = getGuidanceService(mockRepository);

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton instance', () => {
      const instance1 = getGuidanceService(mockRepository);
      resetGuidanceService();
      const instance2 = getGuidanceService(mockRepository);

      expect(instance1).not.toBe(instance2);
    });

    it('should apply config on first creation', () => {
      const config: GuidanceServiceConfig = {
        maxSuggestionsPerCall: 10,
        enableObjectionDetection: false,
        defaultLanguage: 'en',
      };

      const instance = getGuidanceService(mockRepository, config);
      expect(instance).toBeDefined();
    });
  });

  // =============================================================================
  // Event Emission Tests
  // =============================================================================

  describe('Event Emission', () => {
    const callSid = 'call-events';

    beforeEach(async () => {
      const mockGuidance = createMockGuidance();
      vi.mocked(mockRepository.findForCall).mockResolvedValue({
        success: true,
        data: mockGuidance,
      });
      vi.mocked(mockRepository.updateMetrics).mockResolvedValue({ success: true, data: undefined });

      await service.loadGuidanceForCall(callSid, { clinicId: 'clinic-001', callType: 'inbound' });
    });

    it('should emit guidance:loaded event', async () => {
      const handler = vi.fn();
      service.on('guidance:loaded', handler);

      await service.loadGuidanceForCall('new-call', {
        clinicId: 'clinic-001',
        callType: 'inbound',
      });

      expect(handler).toHaveBeenCalled();
    });

    it('should emit guidance:step-complete event', () => {
      const handler = vi.fn();
      service.on('guidance:step-complete', handler);

      service.completeStep(callSid, 'step-1');

      expect(handler).toHaveBeenCalledWith(callSid, 'step-1', expect.any(String));
    });

    it('should emit guidance:script-complete event with stats', () => {
      const handler = vi.fn();
      service.on('guidance:script-complete', handler);

      service.completeStep(callSid, 'step-1');
      service.completeStep(callSid, 'step-2');
      service.completeStep(callSid, 'step-3');

      expect(handler).toHaveBeenCalledWith(
        callSid,
        expect.any(String),
        expect.objectContaining({
          completedSteps: expect.any(Number),
          totalSteps: expect.any(Number),
          duration: expect.any(Number),
          skippedSteps: expect.any(Number),
        })
      );
    });
  });
});
