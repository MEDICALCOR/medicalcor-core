'use client';

import { useEffect, useState, useCallback } from 'react';
import { Lightbulb, Copy, Check, Zap, RefreshCw, Loader2 } from 'lucide-react';
import {
  type ChatContext,
  quickReplies,
  type ResponseSuggestion,
} from '@/lib/ai';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SmartSuggestionsProps {
  context?: ChatContext;
  onSelect?: (content: string) => void;
}

const toneColors: Record<string, string> = {
  formal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  friendly: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  empathetic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const toneLabels: Record<string, string> = {
  formal: 'Formal',
  friendly: 'Prietenos',
  empathetic: 'Empatic',
  urgent: 'Urgent',
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export function SmartSuggestions({ context, onSelect }: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ResponseSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Fetch suggestions from real AI API
  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/ai/suggestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: context?.patientId,
          context: {
            patientPhone: context?.patientPhone,
            patientName: context?.patientName,
            currentConversation: context?.currentConversation,
          },
          count: 3,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch suggestions');
      }

      const data = (await response.json()) as { suggestions: ResponseSuggestion[] };
      setSuggestions(data.suggestions);
    } catch (error) {
      console.error('Failed to fetch AI suggestions:', error);
      // Keep existing suggestions on error
    } finally {
      setIsLoading(false);
    }
  }, [context?.patientId, context?.patientPhone, context?.patientName, context?.currentConversation]);

  // Fetch suggestions when conversation changes
  useEffect(() => {
    // Debounce to avoid too many API calls
    const timer = setTimeout(() => {
      void fetchSuggestions();
    }, 500);

    return () => clearTimeout(timer);
  }, [fetchSuggestions]);

  const handleRefresh = () => {
    void fetchSuggestions();
  };

  const handleCopy = async (content: string, id: string) => {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelect = (content: string) => {
    onSelect?.(content);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* AI Suggestions */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Smart Suggestions Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Lightbulb className="h-3.5 w-3.5" />
              Sugestii AI
            </h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
              className="h-6 px-2"
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.id}
                  className={cn(
                    'rounded-lg border p-3 transition-colors cursor-pointer',
                    'hover:bg-muted/50 hover:border-primary/30'
                  )}
                  onClick={() => handleSelect(suggestion.content)}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <Badge
                      variant="secondary"
                      className={cn('text-[10px]', toneColors[suggestion.tone])}
                    >
                      {toneLabels[suggestion.tone]}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-muted-foreground">
                        {Math.round(suggestion.confidence * 100)}%
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleCopy(suggestion.content, suggestion.id);
                        }}
                        className="p-1 hover:bg-muted rounded"
                      >
                        {copiedId === suggestion.id ? (
                          <Check className="h-3 w-3 text-green-500" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm">{suggestion.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Replies Section */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1 mb-2">
            <Zap className="h-3.5 w-3.5" />
            Răspunsuri Rapide
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {quickReplies.slice(0, 6).map((reply) => (
              <button
                key={reply.id}
                onClick={() => handleSelect(reply.content)}
                className={cn(
                  'text-left p-2 rounded-lg border text-xs',
                  'hover:bg-muted/50 hover:border-primary/30 transition-colors'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{reply.label}</span>
                  {reply.shortcut && (
                    <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">{reply.shortcut}</kbd>
                  )}
                </div>
                <p className="text-muted-foreground line-clamp-2">
                  {reply.content.slice(0, 50)}...
                </p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
