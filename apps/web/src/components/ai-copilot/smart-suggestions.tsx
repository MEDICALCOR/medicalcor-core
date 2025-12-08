'use client';

import { useEffect, useState } from 'react';
import {
  Lightbulb,
  Copy,
  Check,
  Zap,
  RefreshCw,
  Loader2,
  ThumbsUp,
  ThumbsDown,
} from 'lucide-react';
import {
  type ChatContext,
  quickReplies,
  generateMockSuggestions,
  type ResponseSuggestion,
} from '@/lib/ai';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SmartSuggestionsProps {
  context?: ChatContext;
  onSelect?: (content: string) => void;
}

const toneColors = {
  formal: 'bg-tone-formal-bg text-tone-formal-bg-foreground',
  friendly: 'bg-tone-friendly-bg text-tone-friendly-bg-foreground',
  empathetic: 'bg-tone-empathetic-bg text-tone-empathetic-bg-foreground',
  urgent: 'bg-tone-urgent-bg text-tone-urgent-bg-foreground',
};

const toneLabels = {
  formal: 'Formal',
  friendly: 'Prietenos',
  empathetic: 'Empatic',
  urgent: 'Urgent',
};

export function SmartSuggestions({ context, onSelect }: SmartSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ResponseSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'positive' | 'negative' | null>>({});

  // Generate suggestions based on context
  useEffect(() => {
    setIsLoading(true);
    // Simulate API call
    const timer = setTimeout(() => {
      const lastMessage = context?.currentConversation?.slice(-1)[0];
      const mockSuggestions = generateMockSuggestions({
        currentMessage: lastMessage?.direction === 'IN' ? lastMessage.content : undefined,
      });
      setSuggestions(mockSuggestions);
      setIsLoading(false);
    }, 500);

    return () => clearTimeout(timer);
  }, [context?.currentConversation]);

  const handleRefresh = () => {
    setIsLoading(true);
    setTimeout(() => {
      const newSuggestions = generateMockSuggestions({
        currentMessage: context?.currentConversation?.slice(-1)[0]?.content,
      });
      setSuggestions(newSuggestions);
      setIsLoading(false);
    }, 500);
  };

  const handleCopy = (content: string, id: string) => {
    void navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleSelect = (content: string) => {
    onSelect?.(content);
  };

  const handleFeedback = (suggestionId: string, type: 'positive' | 'negative') => {
    setFeedback((prev) => ({ ...prev, [suggestionId]: type }));

    // In production, send feedback to API
    // await fetch('/api/ai/feedback', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ suggestionId, feedback: type }),
    // });
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
                          handleCopy(suggestion.content, suggestion.id);
                        }}
                        className="p-1 hover:bg-muted rounded"
                        title="Copiază"
                      >
                        {copiedId === suggestion.id ? (
                          <Check className="h-3 w-3 text-status-success" />
                        ) : (
                          <Copy className="h-3 w-3 text-muted-foreground" />
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-sm mb-2">{suggestion.content}</p>

                  {/* Feedback Buttons */}
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFeedback(suggestion.id, 'positive');
                      }}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                        feedback[suggestion.id] === 'positive'
                          ? 'bg-green-100 text-green-700'
                          : 'hover:bg-muted text-muted-foreground'
                      )}
                      title="Feedback pozitiv"
                    >
                      <ThumbsUp className="h-3 w-3" />
                      <span className="sr-only">Like</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleFeedback(suggestion.id, 'negative');
                      }}
                      className={cn(
                        'flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors',
                        feedback[suggestion.id] === 'negative'
                          ? 'bg-red-100 text-red-700'
                          : 'hover:bg-muted text-muted-foreground'
                      )}
                      title="Feedback negativ"
                    >
                      <ThumbsDown className="h-3 w-3" />
                      <span className="sr-only">Dislike</span>
                    </button>
                  </div>
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
