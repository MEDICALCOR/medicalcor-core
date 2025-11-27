'use client';

import { useCallback, useState } from 'react';
import type {
  AIMessage,
  ChatContext,
  PatientHistorySummary,
  ProcedureRecommendation,
  ResponseSuggestion,
} from './types';

interface UseCopilotState {
  messages: AIMessage[];
  isLoading: boolean;
  error: string | null;
  suggestions: ResponseSuggestion[];
  summary: PatientHistorySummary | null;
  recommendations: ProcedureRecommendation[];
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

// Generate unique ID using crypto-secure randomness
function generateId(): string {
  // Use crypto.randomUUID() for cryptographically secure ID generation
  return `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export function useAICopilot() {
  const [state, setState] = useState<UseCopilotState>({
    messages: [],
    isLoading: false,
    error: null,
    suggestions: [],
    summary: null,
    recommendations: [],
  });

  // Send a message to the AI
  const sendMessage = useCallback(
    async (content: string, context?: ChatContext) => {
      const userMessage: AIMessage = {
        id: generateId(),
        role: 'user',
        content,
        timestamp: new Date(),
      };

      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, userMessage],
        isLoading: true,
        error: null,
      }));

      try {
        const response = await fetch(`${API_BASE}/ai/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [...state.messages, userMessage],
            context,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to get AI response');
        }

        const data = (await response.json()) as {
          message: AIMessage;
          suggestions?: ResponseSuggestion[];
        };

        const assistantMessage: AIMessage = {
          ...data.message,
          id: generateId(),
          timestamp: new Date(),
        };

        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage],
          suggestions: data.suggestions ?? prev.suggestions,
          isLoading: false,
        }));

        return assistantMessage;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        return null;
      }
    },
    [state.messages]
  );

  // Get smart suggestions for a response
  const getSuggestions = useCallback(
    async (patientId: string, currentMessage?: string, context?: ChatContext) => {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      try {
        const response = await fetch(`${API_BASE}/ai/suggestions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ patientId, currentMessage, context }),
        });

        if (!response.ok) {
          throw new Error('Failed to get suggestions');
        }

        const data = (await response.json()) as { suggestions: ResponseSuggestion[] };

        setState((prev) => ({
          ...prev,
          suggestions: data.suggestions,
          isLoading: false,
        }));

        return data.suggestions;
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: errorMessage,
        }));
        return [];
      }
    },
    []
  );

  // Get patient summary
  const getPatientSummary = useCallback(async (patientId: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${API_BASE}/ai/summary/${patientId}`);

      if (!response.ok) {
        throw new Error('Failed to get patient summary');
      }

      const data = (await response.json()) as { summary: PatientHistorySummary };

      setState((prev) => ({
        ...prev,
        summary: data.summary,
        isLoading: false,
      }));

      return data.summary;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return null;
    }
  }, []);

  // Get procedure recommendations
  const getRecommendations = useCallback(async (patientId: string, context?: ChatContext) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const response = await fetch(`${API_BASE}/ai/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId, context }),
      });

      if (!response.ok) {
        throw new Error('Failed to get recommendations');
      }

      const data = (await response.json()) as { recommendations: ProcedureRecommendation[] };

      setState((prev) => ({
        ...prev,
        recommendations: data.recommendations,
        isLoading: false,
      }));

      return data.recommendations;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      return [];
    }
  }, []);

  // Clear chat history
  const clearMessages = useCallback(() => {
    setState((prev) => ({
      ...prev,
      messages: [],
    }));
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({
      ...prev,
      error: null,
    }));
  }, []);

  return {
    ...state,
    sendMessage,
    getSuggestions,
    getPatientSummary,
    getRecommendations,
    clearMessages,
    clearError,
  };
}
