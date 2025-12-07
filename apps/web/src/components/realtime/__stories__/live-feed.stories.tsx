import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, Phone, Globe, Sparkles, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface RealtimeLead {
  id: string;
  phone: string;
  source: 'whatsapp' | 'voice' | 'web';
  message?: string;
  classification?: 'HOT' | 'WARM' | 'COLD';
  score?: number;
  procedureInterest?: string[];
  time: string;
}

const sourceIcons: Record<'whatsapp' | 'voice' | 'web', LucideIcon> = {
  whatsapp: MessageSquare,
  voice: Phone,
  web: Globe,
};

const classificationVariants = {
  HOT: 'hot',
  WARM: 'warm',
  COLD: 'cold',
} as const;

interface LeadItemProps {
  lead: RealtimeLead;
  isNew: boolean;
}

function LeadItem({ lead, isNew }: LeadItemProps) {
  const SourceIcon = sourceIcons[lead.source];

  const sourceClassName = (() => {
    switch (lead.source) {
      case 'whatsapp':
        return 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400';
      case 'voice':
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400';
      case 'web':
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-900/30 dark:text-gray-400';
    }
  })();

  return (
    <li
      className={cn('p-3 transition-all duration-500', isNew ? 'bg-primary/5 animate-pulse' : '')}
    >
      <div className="flex items-start gap-3">
        <div className={cn('p-2 rounded-lg shrink-0', sourceClassName)}>
          <SourceIcon className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm truncate">{lead.phone}</span>
            <span className="text-xs text-muted-foreground shrink-0">{lead.time}</span>
          </div>

          {lead.message && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">{lead.message}</p>
          )}

          <div className="flex items-center gap-2 mt-1.5">
            {lead.classification && (
              <Badge variant={classificationVariants[lead.classification]}>
                {lead.classification}
              </Badge>
            )}
            {lead.score !== undefined && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                <span>{lead.score}%</span>
              </div>
            )}
            {lead.procedureInterest && lead.procedureInterest.length > 0 && (
              <span className="text-xs text-muted-foreground truncate">
                {lead.procedureInterest[0]}
              </span>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

interface LiveFeedDemoProps {
  leads: RealtimeLead[];
  showHeader?: boolean;
  className?: string;
}

function LiveFeedDemo({ leads, showHeader = true, className }: LiveFeedDemoProps) {
  return (
    <Card className={cn('', className)}>
      {showHeader && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live Feed
            </CardTitle>
            <span className="text-xs text-muted-foreground">{leads.length} leads</span>
          </div>
        </CardHeader>
      )}
      <CardContent className="p-0">
        {leads.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            Waiting for new leads...
          </div>
        ) : (
          <ul className="divide-y">
            {leads.map((lead, index) => (
              <LeadItem key={lead.id} lead={lead} isNew={index === 0} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const sampleLeads: RealtimeLead[] = [
  {
    id: '1',
    phone: '+40 721 234 567',
    source: 'whatsapp',
    message: 'Hello, I want to book an appointment for teeth cleaning',
    classification: 'HOT',
    score: 92,
    procedureInterest: ['Teeth Cleaning'],
    time: 'Just now',
  },
  {
    id: '2',
    phone: '+40 722 345 678',
    source: 'voice',
    message: 'Inquiry about dental implants',
    classification: 'WARM',
    score: 68,
    procedureInterest: ['Implants'],
    time: '2 min ago',
  },
  {
    id: '3',
    phone: '+40 723 456 789',
    source: 'web',
    message: 'Form submission from contact page',
    classification: 'COLD',
    score: 35,
    procedureInterest: ['General Checkup'],
    time: '5 min ago',
  },
  {
    id: '4',
    phone: '+40 724 567 890',
    source: 'whatsapp',
    message: 'Is the clinic open on weekends?',
    classification: 'WARM',
    score: 55,
    time: '8 min ago',
  },
  {
    id: '5',
    phone: '+40 725 678 901',
    source: 'voice',
    classification: 'HOT',
    score: 88,
    procedureInterest: ['Emergency'],
    time: '12 min ago',
  },
];

const meta = {
  title: 'Realtime/LiveFeed',
  component: LiveFeedDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="w-[400px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof LiveFeedDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    leads: sampleLeads,
  },
};

export const Empty: Story = {
  args: {
    leads: [],
  },
};

export const WithoutHeader: Story = {
  args: {
    leads: sampleLeads.slice(0, 3),
    showHeader: false,
  },
};

export const SingleLead: Story = {
  args: {
    leads: [sampleLeads[0]],
  },
};

export const WhatsAppOnly: Story = {
  args: {
    leads: sampleLeads.filter((l) => l.source === 'whatsapp'),
  },
};

export const HotLeads: Story = {
  args: {
    leads: sampleLeads.filter((l) => l.classification === 'HOT'),
  },
};

export const ManyLeads: Story = {
  args: {
    leads: [
      ...sampleLeads,
      {
        id: '6',
        phone: '+40 726 789 012',
        source: 'web',
        message: 'Looking for orthodontic treatment',
        classification: 'WARM',
        score: 72,
        procedureInterest: ['Orthodontics'],
        time: '15 min ago',
      },
      {
        id: '7',
        phone: '+40 727 890 123',
        source: 'whatsapp',
        message: 'Price inquiry for crowns',
        classification: 'COLD',
        score: 28,
        procedureInterest: ['Crowns'],
        time: '20 min ago',
      },
      {
        id: '8',
        phone: '+40 728 901 234',
        source: 'voice',
        message: 'Follow-up call requested',
        classification: 'WARM',
        score: 65,
        time: '25 min ago',
      },
    ],
  },
};

export const AllSources: Story = {
  args: { leads: [] },
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Lead Sources</h3>
      <div className="grid gap-4">
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <div className="p-2 rounded-lg bg-green-100 text-green-600">
            <MessageSquare className="h-4 w-4" />
          </div>
          <span className="font-medium">WhatsApp</span>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
            <Phone className="h-4 w-4" />
          </div>
          <span className="font-medium">Voice Call</span>
        </div>
        <div className="flex items-center gap-3 p-3 border rounded-lg">
          <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
            <Globe className="h-4 w-4" />
          </div>
          <span className="font-medium">Web Form</span>
        </div>
      </div>
    </div>
  ),
};
