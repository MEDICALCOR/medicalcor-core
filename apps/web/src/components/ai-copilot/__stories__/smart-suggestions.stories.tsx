import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ResponseSuggestion {
  id: string;
  content: string;
  tone: 'formal' | 'friendly' | 'empathetic' | 'urgent';
  confidence: number;
}

interface QuickReply {
  id: string;
  label: string;
  content: string;
  shortcut?: string;
}

const sampleSuggestions: ResponseSuggestion[] = [
  {
    id: '1',
    content:
      'Bună ziua! Vă mulțumim pentru interesul acordat. Pentru procedura All-on-X, oferim consultații gratuite unde medicul nostru va evalua cazul dumneavoastră și vă va prezenta opțiunile disponibile. Când vă este convenabil să programăm o vizită?',
    tone: 'formal',
    confidence: 0.92,
  },
  {
    id: '2',
    content:
      'Salut! Mă bucur că ne-ai contactat 😊 All-on-X este o procedură super interesantă - practic, îți oferă dinți noi ficși într-o singură zi! Hai să stabilim o consultație gratuită ca să îți arătăm exact ce putem face pentru tine. Ce zici?',
    tone: 'friendly',
    confidence: 0.85,
  },
  {
    id: '3',
    content:
      'Înțeleg perfect că această decizie este importantă pentru dumneavoastră. Mulți pacienți au aceleași întrebări la început. Vă asigur că veți fi în mâini bune - echipa noastră are peste 500 de cazuri reușite. Haideți să discutăm mai multe la o consultație, fără nicio obligație.',
    tone: 'empathetic',
    confidence: 0.88,
  },
];

const quickReplies: QuickReply[] = [
  {
    id: '1',
    label: 'Salut',
    content: 'Bună ziua! Cu ce vă pot ajuta?',
    shortcut: '⌘1',
  },
  {
    id: '2',
    label: 'Programare',
    content: 'Desigur, când vă este convenabil să programăm o consultație?',
    shortcut: '⌘2',
  },
  {
    id: '3',
    label: 'Prețuri',
    content:
      'Prețurile variază în funcție de complexitatea cazului. Vă invit la o consultație gratuită pentru o evaluare personalizată.',
    shortcut: '⌘3',
  },
  {
    id: '4',
    label: 'Mulțumesc',
    content: 'Vă mulțumim pentru mesaj! Vă vom contacta în cel mai scurt timp.',
    shortcut: '⌘4',
  },
  {
    id: '5',
    label: 'Locație',
    content: 'Ne găsiți pe Str. Victoriei 123, București. Avem parcare gratuită pentru pacienți.',
    shortcut: '⌘5',
  },
  {
    id: '6',
    label: 'Program',
    content: 'Suntem deschiși Luni-Vineri 09:00-19:00 și Sâmbătă 09:00-14:00.',
    shortcut: '⌘6',
  },
];

const toneColors = {
  formal: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  friendly: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  empathetic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
};

const toneLabels = {
  formal: 'Formal',
  friendly: 'Prietenos',
  empathetic: 'Empatic',
  urgent: 'Urgent',
};

interface SmartSuggestionsDemoProps {
  suggestions?: ResponseSuggestion[];
  isLoading?: boolean;
  onSelect?: (content: string) => void;
}

function SmartSuggestionsDemo({
  suggestions = sampleSuggestions,
  isLoading = false,
  onSelect,
}: SmartSuggestionsDemoProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, 'positive' | 'negative' | null>>({});

  const handleCopy = (content: string, id: string) => {
    void navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFeedback = (suggestionId: string, type: 'positive' | 'negative') => {
    setFeedback((prev) => ({ ...prev, [suggestionId]: type }));
  };

  return (
    <div className="flex flex-col h-[600px] w-96 border rounded-lg overflow-hidden bg-background">
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Smart Suggestions Section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Lightbulb className="h-3.5 w-3.5" />
              Sugestii AI
            </h4>
            <Button variant="ghost" size="sm" disabled={isLoading} className="h-6 px-2">
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
                  onClick={() => onSelect?.(suggestion.content)}
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
                      >
                        {copiedId === suggestion.id ? (
                          <Check className="h-3 w-3 text-green-500" />
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
                    >
                      <ThumbsUp className="h-3 w-3" />
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
                    >
                      <ThumbsDown className="h-3 w-3" />
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
            {quickReplies.map((reply) => (
              <button
                key={reply.id}
                onClick={() => onSelect?.(reply.content)}
                className={cn(
                  'text-left p-2 rounded-lg border text-xs',
                  'hover:bg-muted/50 hover:border-primary/30 transition-colors'
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium">{reply.label}</span>
                  {reply.shortcut && (
                    <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">
                      {reply.shortcut}
                    </kbd>
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

const meta = {
  title: 'AI Copilot/SmartSuggestions',
  component: SmartSuggestionsDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  args: {
    onSelect: fn(),
  },
} satisfies Meta<typeof SmartSuggestionsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    suggestions: sampleSuggestions,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const EmptySuggestions: Story = {
  args: {
    suggestions: [],
  },
};

export const SingleSuggestion: Story = {
  args: {
    suggestions: [sampleSuggestions[0]],
  },
};

export const ToneVariants: Story = {
  render: () => (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Tone Variants</h3>
      <div className="grid grid-cols-2 gap-4">
        {(['formal', 'friendly', 'empathetic', 'urgent'] as const).map((tone) => (
          <div key={tone} className="p-4 border rounded-lg">
            <Badge variant="secondary" className={cn('text-xs', toneColors[tone])}>
              {toneLabels[tone]}
            </Badge>
            <p className="text-sm text-muted-foreground mt-2">
              {tone === 'formal' && 'Professional and respectful tone'}
              {tone === 'friendly' && 'Casual and approachable tone'}
              {tone === 'empathetic' && 'Understanding and caring tone'}
              {tone === 'urgent' && 'Time-sensitive communication'}
            </p>
          </div>
        ))}
      </div>
    </div>
  ),
};
