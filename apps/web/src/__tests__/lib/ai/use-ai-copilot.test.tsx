import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useAICopilot } from '@/lib/ai/use-ai-copilot';
import type {
  AIMessage,
  PatientHistorySummary,
  ProcedureRecommendation,
  ResponseSuggestion,
} from '@/lib/ai/types';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID
const mockRandomUUID = vi.fn();
Object.defineProperty(global.crypto, 'randomUUID', {
  value: mockRandomUUID,
  writable: true,
});

describe('useAICopilot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRandomUUID.mockReturnValue('test-uuid-1234');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with correct default state', () => {
    const { result } = renderHook(() => useAICopilot());

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.summary).toBe(null);
    expect(result.current.recommendations).toEqual([]);
  });

  describe('sendMessage', () => {
    it('should send a message and receive response', async () => {
      const mockResponse: AIMessage = {
        id: 'test-id',
        role: 'assistant',
        content: 'AI response',
        timestamp: new Date(),
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ message: mockResponse }),
      });

      const { result } = renderHook(() => useAICopilot());

      let responseMessage: AIMessage | null = null;

      await act(async () => {
        responseMessage = await result.current.sendMessage('Hello AI');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe('user');
      expect(result.current.messages[0].content).toBe('Hello AI');
      expect(result.current.messages[1].role).toBe('assistant');
      expect(result.current.messages[1].content).toBe('AI response');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
      expect(responseMessage).toBeTruthy();
    });

    it('should include context when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            id: 'test',
            role: 'assistant',
            content: 'Response',
            timestamp: new Date(),
          },
        }),
      });

      const { result } = renderHook(() => useAICopilot());

      const context = {
        patientId: 'patient-123',
        patientName: 'John Doe',
      };

      await act(async () => {
        await result.current.sendMessage('Hello', context);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/ai/chat'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('patient-123'),
        })
      );
    });

    it('should handle suggestions in response', async () => {
      const mockSuggestions: ResponseSuggestion[] = [
        {
          id: 'sug-1',
          content: 'Suggestion 1',
          tone: 'friendly',
          confidence: 0.9,
          category: 'greeting',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            id: 'test',
            role: 'assistant',
            content: 'Response',
            timestamp: new Date(),
          },
          suggestions: mockSuggestions,
        }),
      });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.suggestions).toEqual(mockSuggestions);
    });

    it('should set isLoading to true during request', async () => {
      let capturedLoadingState = false;

      mockFetch.mockImplementation(async () => {
        // Capture loading state during fetch
        await new Promise((resolve) => setTimeout(resolve, 10));
        return {
          ok: true,
          json: async () => ({
            message: {
              id: 'test',
              role: 'assistant',
              content: 'Response',
              timestamp: new Date(),
            },
          }),
        };
      });

      const { result } = renderHook(() => useAICopilot());

      const promise = act(async () => {
        const sendPromise = result.current.sendMessage('Hello');
        capturedLoadingState = result.current.isLoading;
        await sendPromise;
      });

      await promise;

      expect(capturedLoadingState).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        const response = await result.current.sendMessage('Hello');
        expect(response).toBe(null);
      });

      expect(result.current.error).toBe('Failed to get AI response');
      expect(result.current.isLoading).toBe(false);
      expect(result.current.messages).toHaveLength(1); // Only user message
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        const response = await result.current.sendMessage('Hello');
        expect(response).toBe(null);
      });

      expect(result.current.error).toBe('Network error');
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle non-Error exceptions', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.error).toBe('Unknown error');
    });

    it('should clear previous errors on successful request', async () => {
      // First request fails
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        await result.current.sendMessage('First');
      });

      expect(result.current.error).toBeTruthy();

      // Second request succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            id: 'test',
            role: 'assistant',
            content: 'Success',
            timestamp: new Date(),
          },
        }),
      });

      await act(async () => {
        await result.current.sendMessage('Second');
      });

      expect(result.current.error).toBe(null);
    });
  });

  describe('getSuggestions', () => {
    it('should fetch suggestions successfully', async () => {
      const mockSuggestions: ResponseSuggestion[] = [
        {
          id: 'sug-1',
          content: 'Suggestion 1',
          tone: 'friendly',
          confidence: 0.9,
          category: 'greeting',
        },
        {
          id: 'sug-2',
          content: 'Suggestion 2',
          tone: 'formal',
          confidence: 0.8,
          category: 'info',
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ suggestions: mockSuggestions }),
      });

      const { result } = renderHook(() => useAICopilot());

      let suggestions: ResponseSuggestion[] = [];

      await act(async () => {
        suggestions = await result.current.getSuggestions('patient-123');
      });

      expect(suggestions).toEqual(mockSuggestions);
      expect(result.current.suggestions).toEqual(mockSuggestions);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should include current message and context', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ suggestions: [] }),
      });

      const { result } = renderHook(() => useAICopilot());

      const context = { patientName: 'John Doe' };

      await act(async () => {
        await result.current.getSuggestions('patient-123', 'Current message', context);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/ai/suggestions'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('patient-123'),
        })
      );

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.currentMessage).toBe('Current message');
      expect(requestBody.context).toEqual(context);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        const suggestions = await result.current.getSuggestions('patient-123');
        expect(suggestions).toEqual([]);
      });

      expect(result.current.error).toBe('Failed to get suggestions');
      expect(result.current.isLoading).toBe(false);
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAICopilot());

      let suggestions: ResponseSuggestion[] | null = null;

      await act(async () => {
        suggestions = await result.current.getSuggestions('patient-123');
      });

      expect(suggestions).toEqual([]);
    });
  });

  describe('getPatientSummary', () => {
    it('should fetch patient summary successfully', async () => {
      const mockSummary: PatientHistorySummary = {
        totalInteractions: 5,
        firstContact: '2024-01-01',
        lastContact: '2024-01-15',
        classification: 'HOT',
        score: 85,
        keyInsights: ['Interested in dental implants', 'Has dental anxiety'],
        proceduresDiscussed: ['Dental implants', 'Teeth whitening'],
        objections: ['Price concerns'],
        appointmentHistory: [],
        sentiment: 'positive',
        engagementLevel: 'high',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ summary: mockSummary }),
      });

      const { result } = renderHook(() => useAICopilot());

      let summary: PatientHistorySummary | null = null;

      await act(async () => {
        summary = await result.current.getPatientSummary('patient-123');
      });

      expect(summary).toEqual(mockSummary);
      expect(result.current.summary).toEqual(mockSummary);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBe(null);
    });

    it('should use correct API endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          summary: {
            totalInteractions: 0,
            firstContact: '',
            lastContact: '',
            classification: 'COLD',
            score: 0,
            keyInsights: [],
            proceduresDiscussed: [],
            objections: [],
            appointmentHistory: [],
            sentiment: 'neutral',
            engagementLevel: 'low',
          },
        }),
      });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        await result.current.getPatientSummary('patient-123');
      });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/ai/summary/patient-123'));
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        const summary = await result.current.getPatientSummary('patient-123');
        expect(summary).toBe(null);
      });

      expect(result.current.error).toBe('Failed to get patient summary');
    });

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAICopilot());

      let summary: PatientHistorySummary | null | undefined = undefined;

      await act(async () => {
        summary = await result.current.getPatientSummary('patient-123');
      });

      expect(summary).toBe(null);
    });
  });

  describe('getRecommendations', () => {
    it('should fetch procedure recommendations successfully', async () => {
      const mockRecommendations: ProcedureRecommendation[] = [
        {
          id: 'proc-1',
          name: 'Dental Implants',
          category: 'Restoration',
          relevanceScore: 0.95,
          reasoning: 'Patient expressed interest in permanent solution',
          priceRange: { min: 3000, max: 5000, currency: 'RON' },
          duration: '90-120 min',
          relatedProcedures: ['Bone grafting', 'Crown placement'],
          commonQuestions: ['How long do implants last?', 'Is it painful?'],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recommendations: mockRecommendations }),
      });

      const { result } = renderHook(() => useAICopilot());

      let recommendations: ProcedureRecommendation[] = [];

      await act(async () => {
        recommendations = await result.current.getRecommendations('patient-123');
      });

      expect(recommendations).toEqual(mockRecommendations);
      expect(result.current.recommendations).toEqual(mockRecommendations);
      expect(result.current.isLoading).toBe(false);
    });

    it('should include context when provided', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ recommendations: [] }),
      });

      const { result } = renderHook(() => useAICopilot());

      const context = { procedures: ['Teeth whitening'] };

      await act(async () => {
        await result.current.getRecommendations('patient-123', context);
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.context).toEqual(context);
    });

    it('should handle API errors', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        const recommendations = await result.current.getRecommendations('patient-123');
        expect(recommendations).toEqual([]);
      });

      expect(result.current.error).toBe('Failed to get recommendations');
    });

    it('should return empty array on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAICopilot());

      let recommendations: ProcedureRecommendation[] | null = null;

      await act(async () => {
        recommendations = await result.current.getRecommendations('patient-123');
      });

      expect(recommendations).toEqual([]);
    });
  });

  describe('clearMessages', () => {
    it('should clear all messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            id: 'test',
            role: 'assistant',
            content: 'Response',
            timestamp: new Date(),
          },
        }),
      });

      const { result } = renderHook(() => useAICopilot());

      // Add some messages
      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.messages.length).toBeGreaterThan(0);

      // Clear messages
      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
    });

    it('should preserve other state when clearing messages', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            id: 'test',
            role: 'assistant',
            content: 'Response',
            timestamp: new Date(),
          },
          suggestions: [
            {
              id: 'sug-1',
              content: 'Suggestion',
              tone: 'friendly' as const,
              confidence: 0.9,
              category: 'greeting' as const,
            },
          ],
        }),
      });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      const suggestionsBefore = result.current.suggestions;

      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toEqual([]);
      expect(result.current.suggestions).toEqual(suggestionsBefore);
    });
  });

  describe('clearError', () => {
    it('should clear error state', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      expect(result.current.error).toBeTruthy();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
    });

    it('should preserve other state when clearing error', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useAICopilot());

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      const messagesBefore = result.current.messages;

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe(null);
      expect(result.current.messages).toEqual(messagesBefore);
    });
  });

  describe('API base URL', () => {
    it('should use NEXT_PUBLIC_API_URL when available', async () => {
      const originalEnv = process.env.NEXT_PUBLIC_API_URL;
      process.env.NEXT_PUBLIC_API_URL = 'https://api.example.com';

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: {
            id: 'test',
            role: 'assistant',
            content: 'Response',
            timestamp: new Date(),
          },
        }),
      });

      // Need to reimport to get new env value
      const { useAICopilot: useAICopilotWithEnv } = await import('@/lib/ai/use-ai-copilot');
      const { result } = renderHook(() => useAICopilotWithEnv());

      await act(async () => {
        await result.current.sendMessage('Hello');
      });

      // Restore
      process.env.NEXT_PUBLIC_API_URL = originalEnv;
    });
  });
});
