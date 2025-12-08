import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ProcedureRecommendation {
  id: string;
  name: string;
  category: string;
  relevanceScore: number;
  reasoning: string;
  priceRange: {
    min: number;
    max: number;
    currency: string;
  };
  duration: string;
  relatedProcedures: string[];
  commonQuestions: string[];
}

const sampleRecommendations: ProcedureRecommendation[] = [
  {
    id: '1',
    name: 'All-on-X',
    category: 'Implantologie',
    relevanceScore: 0.95,
    reasoning:
      'Pacientul a menționat dorința pentru dinți ficși și a întrebat despre soluții permanente pentru maxilarul superior.',
    priceRange: { min: 8000, max: 15000, currency: 'EUR' },
    duration: '1 zi procedură + 3-6 luni vindecare',
    relatedProcedures: ['Augmentare osoasă', 'Extracții multiple'],
    commonQuestions: [
      'Cât durează procedura?',
      'Este dureroasă?',
      'Care este garanția?',
      'Se poate plăti în rate?',
    ],
  },
  {
    id: '2',
    name: 'Implant dentar singular',
    category: 'Implantologie',
    relevanceScore: 0.75,
    reasoning: 'Alternativă pentru pacienții care nu necesită înlocuirea completă a arcadei.',
    priceRange: { min: 800, max: 1500, currency: 'EUR' },
    duration: '30-60 minute + 3-6 luni osteointegrare',
    relatedProcedures: ['Coroană ceramică', 'Lifting sinusal'],
    commonQuestions: ['Cât durează vindecarea?', 'Ce material este implantul?', 'Este vizibil?'],
  },
  {
    id: '3',
    name: 'Fațete dentare',
    category: 'Estetică',
    relevanceScore: 0.55,
    reasoning: 'Opțiune pentru îmbunătățirea aspectului estetic al dinților frontali existenți.',
    priceRange: { min: 400, max: 800, currency: 'EUR' },
    duration: '2 ședințe',
    relatedProcedures: ['Albire dentară', 'Coroane ceramice'],
    commonQuestions: ['Cât rezistă fațetele?', 'Se văd ca fiind artificiale?', 'Pot mânca normal?'],
  },
];

interface ProcedureRecommendationsDemoProps {
  recommendations?: ProcedureRecommendation[];
  isLoading?: boolean;
}

function ProcedureRecommendationsDemo({
  recommendations = sampleRecommendations,
  isLoading = false,
}: ProcedureRecommendationsDemoProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      <div className="flex items-center justify-center h-[500px] w-96 border rounded-lg bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[500px] w-96 border rounded-lg overflow-hidden bg-background">
      <div className="h-full overflow-y-auto p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Recomandări AI
          </h4>
          <Button variant="ghost" size="sm">
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
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {rec.reasoning}
                    </p>
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
    </div>
  );
}

const meta = {
  title: 'AI Copilot/ProcedureRecommendations',
  component: ProcedureRecommendationsDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ProcedureRecommendationsDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    recommendations: sampleRecommendations,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const SingleRecommendation: Story = {
  args: {
    recommendations: [sampleRecommendations[0]],
  },
};

export const LowRelevance: Story = {
  args: {
    recommendations: [
      {
        ...sampleRecommendations[2],
        relevanceScore: 0.35,
      },
    ],
  },
};

export const ManyRecommendations: Story = {
  args: {
    recommendations: [
      ...sampleRecommendations,
      {
        id: '4',
        name: 'Albire dentară',
        category: 'Estetică',
        relevanceScore: 0.45,
        reasoning: 'Procedură complementară pentru îmbunătățirea aspectului estetic.',
        priceRange: { min: 200, max: 400, currency: 'EUR' },
        duration: '60-90 minute',
        relatedProcedures: ['Detartraj', 'Periaj profesional'],
        commonQuestions: ['Cât durează efectul?', 'Este sigur pentru smalț?'],
      },
      {
        id: '5',
        name: 'Ortodonție invizibilă',
        category: 'Ortodonție',
        relevanceScore: 0.4,
        reasoning: 'Alternativă pentru alinierea dinților existenți.',
        priceRange: { min: 2500, max: 5000, currency: 'EUR' },
        duration: '12-24 luni',
        relatedProcedures: ['Contenție', 'Albire post-tratament'],
        commonQuestions: ['Este vizibil?', 'Se poate scoate pentru masă?'],
      },
    ],
  },
};

export const RelevanceIndicators: Story = {
  render: () => (
    <div className="space-y-4 p-4">
      <h3 className="text-lg font-semibold">Relevance Score Indicators</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg text-center">
          <div className="text-2xl font-bold text-green-600">95%</div>
          <div className="text-xs text-muted-foreground">Foarte relevant</div>
          <p className="text-sm text-muted-foreground mt-2">Score ≥ 80%</p>
        </div>
        <div className="p-4 border rounded-lg text-center">
          <div className="text-2xl font-bold text-yellow-600">65%</div>
          <div className="text-xs text-muted-foreground">Relevant</div>
          <p className="text-sm text-muted-foreground mt-2">Score 50-79%</p>
        </div>
        <div className="p-4 border rounded-lg text-center">
          <div className="text-2xl font-bold text-muted-foreground">35%</div>
          <div className="text-xs text-muted-foreground">Potențial</div>
          <p className="text-sm text-muted-foreground mt-2">Score &lt; 50%</p>
        </div>
      </div>
    </div>
  ),
};
