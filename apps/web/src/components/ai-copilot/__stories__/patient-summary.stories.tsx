import type { Meta, StoryObj } from '@storybook/react';
import {
  User,
  TrendingUp,
  Calendar,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface PatientHistorySummary {
  classification: 'HOT' | 'WARM' | 'COLD';
  score: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  engagementLevel: 'high' | 'medium' | 'low';
  totalInteractions: number;
  keyInsights: string[];
  proceduresDiscussed: string[];
  objections: string[];
  appointmentHistory: {
    date: string;
    procedure: string;
    status: 'completed' | 'cancelled' | 'no-show' | 'scheduled';
  }[];
  firstContact: string;
  lastContact: string;
}

const sampleSummary: PatientHistorySummary = {
  classification: 'HOT',
  score: 85,
  sentiment: 'positive',
  engagementLevel: 'high',
  totalInteractions: 24,
  keyInsights: [
    'Interesat activ de procedura All-on-X',
    'Budget confirmat - poate plăti în rate',
    'Disponibil pentru programare săptămâna viitoare',
  ],
  proceduresDiscussed: ['All-on-X', 'Implant dentar', 'Coroană ceramică'],
  objections: ['Îngrijorat de durerea post-procedură', 'Întrebări despre garanție'],
  appointmentHistory: [
    { date: '2024-12-01', procedure: 'Consultație inițială', status: 'completed' },
    { date: '2024-11-15', procedure: 'Control', status: 'completed' },
    { date: '2024-10-20', procedure: 'Igienizare', status: 'cancelled' },
  ],
  firstContact: '2024-09-15',
  lastContact: '2024-12-05',
};

const classificationVariants = {
  HOT: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  WARM: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  COLD: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const sentimentIcons = {
  positive: { icon: CheckCircle2, color: 'text-green-500' },
  neutral: { icon: Clock, color: 'text-yellow-500' },
  negative: { icon: XCircle, color: 'text-red-500' },
};

interface PatientSummaryDemoProps {
  summary?: PatientHistorySummary | null;
  isLoading?: boolean;
  noPatient?: boolean;
}

function PatientSummaryDemo({
  summary = sampleSummary,
  isLoading = false,
  noPatient = false,
}: PatientSummaryDemoProps) {
  if (noPatient) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] w-96 border rounded-lg p-4 text-center bg-background">
        <User className="h-10 w-10 text-muted-foreground mb-3" />
        <h4 className="font-medium mb-1">Niciun pacient selectat</h4>
        <p className="text-sm text-muted-foreground">
          Selectează un pacient pentru a vedea rezumatul AI.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px] w-96 border rounded-lg bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] w-96 border rounded-lg p-4 text-center bg-background">
        <AlertTriangle className="h-10 w-10 text-muted-foreground mb-3" />
        <h4 className="font-medium mb-1">Nu s-a putut genera rezumatul</h4>
        <Button variant="outline" size="sm">
          Încearcă din nou
        </Button>
      </div>
    );
  }

  const SentimentIcon = sentimentIcons[summary.sentiment].icon;

  return (
    <div className="h-[500px] w-96 border rounded-lg overflow-hidden bg-background">
      <div className="h-full overflow-y-auto p-3 space-y-4">
        {/* Header Stats */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge className={cn('text-xs', classificationVariants[summary.classification])}>
              {summary.classification}
            </Badge>
            <div className="flex items-center gap-1 text-sm">
              <TrendingUp className="h-4 w-4 text-primary" />
              <span className="font-semibold">{summary.score}%</span>
            </div>
          </div>
          <Button variant="ghost" size="sm">
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold">{summary.totalInteractions}</div>
            <div className="text-[10px] text-muted-foreground">Interacțiuni</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="flex items-center justify-center">
              <SentimentIcon className={cn('h-5 w-5', sentimentIcons[summary.sentiment].color)} />
            </div>
            <div className="text-[10px] text-muted-foreground capitalize">{summary.sentiment}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-2 text-center">
            <div className="text-lg font-bold capitalize">{summary.engagementLevel[0]}</div>
            <div className="text-[10px] text-muted-foreground">Engagement</div>
          </div>
        </div>

        {/* Key Insights */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Key Insights
          </h4>
          <ul className="space-y-1.5">
            {summary.keyInsights.map((insight, i) => (
              <li key={i} className="flex items-start gap-2 text-sm bg-primary/5 rounded-lg p-2">
                <span className="text-primary mt-0.5">•</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Procedures Interest */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Proceduri Discutate
          </h4>
          <div className="flex flex-wrap gap-1">
            {summary.proceduresDiscussed.map((proc, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {proc}
              </Badge>
            ))}
          </div>
        </div>

        {/* Objections */}
        {summary.objections.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3 text-orange-500" />
              Obiecții / Îngrijorări
            </h4>
            <ul className="space-y-1">
              {summary.objections.map((objection, i) => (
                <li
                  key={i}
                  className="text-sm text-orange-700 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2"
                >
                  {objection}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Appointment History */}
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Istoric Programări
          </h4>
          <div className="space-y-1.5">
            {summary.appointmentHistory.map((apt, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded-lg"
              >
                <div>
                  <span className="font-medium">{apt.procedure}</span>
                  <span className="text-muted-foreground ml-2">
                    {new Date(apt.date).toLocaleDateString('ro-RO')}
                  </span>
                </div>
                <Badge
                  variant={apt.status === 'completed' ? 'outline' : 'secondary'}
                  className={cn(
                    'text-[10px]',
                    apt.status === 'completed' && 'text-green-600',
                    apt.status === 'cancelled' && 'text-red-600'
                  )}
                >
                  {apt.status === 'completed' && 'Finalizat'}
                  {apt.status === 'cancelled' && 'Anulat'}
                  {apt.status === 'no-show' && 'Absent'}
                  {apt.status === 'scheduled' && 'Programat'}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        <div className="text-xs text-muted-foreground pt-2 border-t">
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <span>
              Primul contact: {new Date(summary.firstContact).toLocaleDateString('ro-RO')}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3" />
            <span>
              Ultima interacțiune: {new Date(summary.lastContact).toLocaleDateString('ro-RO')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

const meta = {
  title: 'AI Copilot/PatientSummary',
  component: PatientSummaryDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof PatientSummaryDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    summary: sampleSummary,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const NoPatient: Story = {
  args: {
    noPatient: true,
  },
};

export const NoSummary: Story = {
  args: {
    summary: null,
  },
};

export const HotLead: Story = {
  args: {
    summary: {
      ...sampleSummary,
      classification: 'HOT',
      score: 92,
      sentiment: 'positive',
    },
  },
};

export const WarmLead: Story = {
  args: {
    summary: {
      ...sampleSummary,
      classification: 'WARM',
      score: 65,
      sentiment: 'neutral',
      engagementLevel: 'medium',
    },
  },
};

export const ColdLead: Story = {
  args: {
    summary: {
      ...sampleSummary,
      classification: 'COLD',
      score: 35,
      sentiment: 'negative',
      engagementLevel: 'low',
      totalInteractions: 3,
      keyInsights: ['Contact inițial fără follow-up', 'Nu a răspuns la ultimele mesaje'],
      objections: [],
    },
  },
};

export const NoObjections: Story = {
  args: {
    summary: {
      ...sampleSummary,
      objections: [],
    },
  },
};
