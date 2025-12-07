'use client';

import { useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  type Circle,
  ChevronRight,
  Clock,
  Lightbulb,
  AlertTriangle,
  HelpCircle,
  Search,
  Copy,
  Check,
  MessageSquare,
  Target,
  Shield,
  DollarSign,
  Timer,
  Scale,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { CallScript, ScriptStep, ObjectionHandler, FAQ } from '../actions';

interface ScriptGuidanceProps {
  script: CallScript | null;
  activeStep?: number;
  onStepComplete?: (stepId: string) => void;
}

const stepTypeConfig: Record<
  ScriptStep['type'],
  { icon: typeof Circle; color: string; bgColor: string }
> = {
  greeting: {
    icon: MessageSquare,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-950/50',
  },
  qualification: {
    icon: Target,
    color: 'text-purple-500',
    bgColor: 'bg-purple-100 dark:bg-purple-950/50',
  },
  objection: {
    icon: Shield,
    color: 'text-orange-500',
    bgColor: 'bg-orange-100 dark:bg-orange-950/50',
  },
  closing: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-950/50',
  },
  information: {
    icon: BookOpen,
    color: 'text-teal-500',
    bgColor: 'bg-teal-100 dark:bg-teal-950/50',
  },
};

const objectionCategoryConfig: Record<
  ObjectionHandler['category'],
  { icon: typeof DollarSign; color: string; label: string }
> = {
  price: { icon: DollarSign, color: 'text-green-500', label: 'Preț' },
  time: { icon: Timer, color: 'text-blue-500', label: 'Timp' },
  trust: { icon: Shield, color: 'text-purple-500', label: 'Încredere' },
  comparison: { icon: Scale, color: 'text-orange-500', label: 'Comparație' },
  other: { icon: HelpCircle, color: 'text-gray-500', label: 'Altele' },
};

function ScriptStepCard({
  step,
  isActive,
  isCompleted,
  onComplete,
}: {
  step: ScriptStep;
  isActive: boolean;
  isCompleted: boolean;
  onComplete: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [isCopied, setIsCopied] = useState(false);
  const config = stepTypeConfig[step.type];
  const StepIcon = config.icon;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(step.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'border rounded-lg transition-all',
        isActive && 'ring-2 ring-primary border-primary',
        isCompleted && 'bg-muted/30 opacity-75'
      )}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={cn(
          'w-full flex items-center gap-3 p-3 text-left',
          !isExpanded && 'hover:bg-muted/50'
        )}
      >
        {/* Status icon */}
        <div
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
            isCompleted ? 'bg-green-100 dark:bg-green-950/50' : config.bgColor
          )}
        >
          {isCompleted ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <StepIcon className={cn('h-5 w-5', config.color)} />
          )}
        </div>

        {/* Title & meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Pas {step.order}</span>
            {step.isRequired && (
              <Badge variant="secondary" className="text-[10px] px-1 py-0 h-4">
                Obligatoriu
              </Badge>
            )}
          </div>
          <p className={cn('font-medium truncate', isCompleted && 'line-through')}>{step.title}</p>
        </div>

        {/* Duration & expand */}
        <div className="flex items-center gap-2 shrink-0">
          {step.suggestedDuration && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              <span>{step.suggestedDuration}s</span>
            </div>
          )}
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Script content */}
          <div className="bg-muted/50 rounded-lg p-3 relative group">
            <p className="text-sm leading-relaxed pr-8">{step.content}</p>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleCopy}
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Tips */}
          {step.tips && step.tips.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
                <Lightbulb className="h-3 w-3" />
                <span>Sfaturi</span>
              </div>
              <ul className="space-y-1">
                {step.tips.map((tip, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Mark complete button */}
          {!isCompleted && (
            <Button variant="outline" size="sm" className="w-full gap-1" onClick={onComplete}>
              <CheckCircle2 className="h-4 w-4" />
              Marchează complet
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function ObjectionHandlerCard({ handler }: { handler: ObjectionHandler }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const config = objectionCategoryConfig[handler.category];
  const CategoryIcon = config.icon;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(handler.response);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
          <CategoryIcon className={cn('h-4 w-4', config.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {config.label}
            </Badge>
          </div>
          <p className="font-medium text-sm truncate mt-0.5">"{handler.objection}"</p>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3 relative group">
            <p className="text-sm leading-relaxed pr-8">{handler.response}</p>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleCopy}
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FAQCard({ faq }: { faq: FAQ }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(faq.answer);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center shrink-0">
          <HelpCircle className="h-4 w-4 text-blue-500" />
        </div>
        <p className="font-medium text-sm flex-1">{faq.question}</p>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="bg-muted/50 rounded-lg p-3 relative group">
            <p className="text-sm leading-relaxed pr-8">{faq.answer}</p>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={handleCopy}
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScriptGuidance({ script, activeStep = 1, onStepComplete }: ScriptGuidanceProps) {
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'script' | 'objections' | 'faq'>('script');

  const handleStepComplete = (stepId: string) => {
    setCompletedSteps((prev) => new Set([...prev, stepId]));
    onStepComplete?.(stepId);
  };

  // Filter content based on search
  const filteredSteps = script?.steps.filter(
    (step) =>
      step.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      step.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredObjections = script?.objectionHandlers.filter(
    (h) =>
      h.objection.toLowerCase().includes(searchQuery.toLowerCase()) ||
      h.response.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredFAQs = script?.faqs.filter(
    (f) =>
      f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!script) {
    return (
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Ghid Script
          </CardTitle>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-muted-foreground">Niciun script disponibil</p>
            <p className="text-sm text-muted-foreground mt-1">
              Scriptul va apărea când preiei un apel
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const progressPercentage =
    script.steps.length > 0 ? Math.round((completedSteps.size / script.steps.length) * 100) : 0;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            {script.name}
          </CardTitle>
          <Badge variant="secondary">
            {completedSteps.size}/{script.steps.length} pași
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col gap-3 overflow-hidden">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Caută în script..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as typeof activeTab)}
          className="flex-1 flex flex-col overflow-hidden"
        >
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="script" className="gap-1">
              <BookOpen className="h-4 w-4" />
              <span className="hidden sm:inline">Script</span>
            </TabsTrigger>
            <TabsTrigger value="objections" className="gap-1">
              <AlertTriangle className="h-4 w-4" />
              <span className="hidden sm:inline">Obiecții</span>
            </TabsTrigger>
            <TabsTrigger value="faq" className="gap-1">
              <HelpCircle className="h-4 w-4" />
              <span className="hidden sm:inline">FAQ</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="script" className="flex-1 overflow-y-auto space-y-2 mt-3">
            {(filteredSteps ?? script.steps).map((step, index) => (
              <ScriptStepCard
                key={step.id}
                step={step}
                isActive={index + 1 === activeStep && !completedSteps.has(step.id)}
                isCompleted={completedSteps.has(step.id)}
                onComplete={() => handleStepComplete(step.id)}
              />
            ))}
            {filteredSteps?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Niciun pas găsit pentru "{searchQuery}"
              </div>
            )}
          </TabsContent>

          <TabsContent value="objections" className="flex-1 overflow-y-auto space-y-2 mt-3">
            {(filteredObjections ?? script.objectionHandlers).map((handler) => (
              <ObjectionHandlerCard key={handler.id} handler={handler} />
            ))}
            {filteredObjections?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nicio obiecție găsită pentru "{searchQuery}"
              </div>
            )}
          </TabsContent>

          <TabsContent value="faq" className="flex-1 overflow-y-auto space-y-2 mt-3">
            {(filteredFAQs ?? script.faqs).map((faq) => (
              <FAQCard key={faq.id} faq={faq} />
            ))}
            {filteredFAQs?.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Nicio întrebare găsită pentru "{searchQuery}"
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// Skeleton for loading state
export function ScriptGuidanceSkeleton() {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="h-5 w-32 bg-muted animate-pulse rounded" />
          <div className="h-5 w-16 bg-muted animate-pulse rounded-full" />
        </div>
        <div className="h-1.5 w-full bg-muted animate-pulse rounded-full mt-2" />
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3">
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="h-10 bg-muted animate-pulse rounded" />
        <div className="flex-1 space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border rounded-lg p-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-16 bg-muted animate-pulse rounded" />
                  <div className="h-4 w-32 bg-muted animate-pulse rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
