'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sparkles,
  Euro,
  Clock,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  Link2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import {
  type ChatContext,
  type ProcedureRecommendation,
} from '@/lib/ai';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProcedureRecommendationsProps {
  context?: ChatContext;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api';

export function ProcedureRecommendations({ context }: ProcedureRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<ProcedureRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch recommendations from real AI API
  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/ai/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientId: context?.patientId ?? 'unknown',
          context: {
            currentConversation: context?.currentConversation,
            proceduresDiscussed: [],
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to fetch recommendations');
      }

      const data = (await response.json()) as { recommendations: ProcedureRecommendation[] };
      setRecommendations(data.recommendations);
    } catch (error) {
      console.error('Failed to fetch AI recommendations:', error);
      // Keep existing recommendations on error
    } finally {
      setIsLoading(false);
    }
  }, [context?.patientId, context?.currentConversation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchRecommendations();
    }, 600);

    return () => clearTimeout(timer);
  }, [fetchRecommendations]);

  const handleRefresh = () => {
    void fetchRecommendations();
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600 dark:text-green-400';
    if (score >= 0.5) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-muted-foreground';
  };

  const getRelevanceLabel = (score: number) => {
    if (score >= 0.8) return 'Foarte relevant';
    if (score >= 0.5) return 'Relevant';
    return 'Potențial';
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Recomandări AI
        </h4>
        <Button variant="ghost" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {/* Recommendations List */}
      <div className="space-y-2">
        {recommendations.map((rec) => {
          const isExpanded = expandedId === rec.id;

          return (
            <div
              key={rec.id}
              className={cn(
                'border rounded-lg overflow-hidden transition-all',
                isExpanded ? 'ring-2 ring-primary/20' : ''
              )}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedId(isExpanded ? null : rec.id)}
                className="w-full p-3 flex items-start gap-3 text-left hover:bg-muted/30 transition-colors"
              >
                {/* Relevance indicator */}
                <div className="flex flex-col items-center pt-0.5">
                  <div className={cn('text-lg font-bold', getRelevanceColor(rec.relevanceScore))}>
                    {Math.round(rec.relevanceScore * 100)}%
                  </div>
                  <span className="text-[9px] text-muted-foreground">
                    {getRelevanceLabel(rec.relevanceScore)}
                  </span>
                </div>

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h5 className="font-semibold text-sm">{rec.name}</h5>
                    <Badge variant="outline" className="text-[10px]">
                      {rec.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{rec.reasoning}</p>
                </div>

                {/* Expand icon */}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="px-3 pb-3 pt-0 space-y-3 border-t bg-muted/20">
                  {/* Price and Duration */}
                  <div className="flex gap-4 pt-3">
                    <div className="flex items-center gap-1.5 text-sm">
                      <Euro className="h-4 w-4 text-primary" />
                      <span>
                        {rec.priceRange.min.toLocaleString()} -{' '}
                        {rec.priceRange.max.toLocaleString()} {rec.priceRange.currency}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <Clock className="h-4 w-4 text-primary" />
                      <span>{rec.duration}</span>
                    </div>
                  </div>

                  {/* Related procedures */}
                  {rec.relatedProcedures.length > 0 && (
                    <div>
                      <h6 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <Link2 className="h-3 w-3" />
                        Proceduri complementare
                      </h6>
                      <div className="flex flex-wrap gap-1">
                        {rec.relatedProcedures.map((proc, i) => (
                          <Badge key={i} variant="secondary" className="text-[10px]">
                            {proc}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Common questions */}
                  {rec.commonQuestions.length > 0 && (
                    <div>
                      <h6 className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                        <HelpCircle className="h-3 w-3" />
                        Întrebări frecvente
                      </h6>
                      <ul className="space-y-1">
                        {rec.commonQuestions.map((q, i) => (
                          <li
                            key={i}
                            className="text-xs text-muted-foreground pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-primary"
                          >
                            {q}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Disclaimer */}
      <p className="text-[10px] text-muted-foreground text-center pt-2">
        Recomandările sunt generate pe baza conversațiilor și intereselor exprimate.
      </p>
    </div>
  );
}
