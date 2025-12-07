import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
import {
  Bot,
  MessageSquare,
  Lightbulb,
  FileText,
  Sparkles,
  X,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type TabId = 'chat' | 'suggestions' | 'summary' | 'procedures';

interface Tab {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

const tabs: Tab[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'suggestions', label: 'Sugestii', icon: Lightbulb },
  { id: 'summary', label: 'Rezumat', icon: FileText },
  { id: 'procedures', label: 'Proceduri', icon: Sparkles },
];

interface CopilotPanelDemoProps {
  patientName?: string;
  patientPhone?: string;
  initialTab?: TabId;
  isOpen?: boolean;
}

function CopilotPanelDemo({
  patientName = 'Ion Popescu',
  patientPhone = '+40 721 234 567',
  initialTab = 'suggestions',
  isOpen: initialOpen = true,
}: CopilotPanelDemoProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          'h-14 w-14 rounded-full shadow-lg',
          'bg-gradient-to-br from-primary to-primary/80',
          'hover:from-primary/90 hover:to-primary/70'
        )}
        size="icon"
      >
        <Bot className="h-6 w-6" />
      </Button>
    );
  }

  return (
    <div
      className={cn(
        'w-96 h-[600px]',
        'bg-background border rounded-lg shadow-xl',
        'flex flex-col overflow-hidden'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b bg-gradient-to-r from-primary/10 to-transparent">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-primary/20">
            <Bot className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">AI Copilot</h3>
            <p className="text-xs text-muted-foreground">
              {patientName ?? patientPhone ?? 'Asistent inteligent'}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b px-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
              'border-b-2 -mb-px',
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Tab: {activeTab}</p>
          <p className="text-xs mt-2">Content would be rendered here</p>
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t bg-muted/30">
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <ChevronRight className="h-3 w-3" />
          Selectează o sugestie pentru a o folosi în conversație
        </p>
      </div>
    </div>
  );
}

const meta = {
  title: 'AI Copilot/CopilotPanel',
  component: CopilotPanelDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    patientName: {
      control: 'text',
      description: 'Patient name to display',
    },
    patientPhone: {
      control: 'text',
      description: 'Patient phone number',
    },
    initialTab: {
      control: 'select',
      options: ['chat', 'suggestions', 'summary', 'procedures'],
      description: 'Initial active tab',
    },
    isOpen: {
      control: 'boolean',
      description: 'Whether the panel is open',
    },
  },
} satisfies Meta<typeof CopilotPanelDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    patientName: 'Ion Popescu',
    patientPhone: '+40 721 234 567',
    initialTab: 'suggestions',
    isOpen: true,
  },
};

export const Closed: Story = {
  args: {
    isOpen: false,
  },
};

export const ChatTab: Story = {
  args: {
    patientName: 'Maria Ionescu',
    initialTab: 'chat',
    isOpen: true,
  },
};

export const SummaryTab: Story = {
  args: {
    patientName: 'Ion Popescu',
    initialTab: 'summary',
    isOpen: true,
  },
};

export const ProceduresTab: Story = {
  args: {
    patientName: 'Ana Gheorghe',
    initialTab: 'procedures',
    isOpen: true,
  },
};

export const NoPatient: Story = {
  args: {
    patientName: undefined,
    patientPhone: undefined,
    initialTab: 'suggestions',
    isOpen: true,
  },
};

export const AllTabs: Story = {
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">AI Copilot Tabs</h3>
      <div className="flex flex-wrap gap-4">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="flex items-center gap-2 p-3 border rounded-lg"
          >
            <tab.icon className="h-5 w-5 text-primary" />
            <span>{tab.label}</span>
          </div>
        ))}
      </div>
    </div>
  ),
};

export const ButtonOnly: Story = {
  render: () => (
    <div className="flex items-center gap-4">
      <Button
        className={cn(
          'h-14 w-14 rounded-full shadow-lg',
          'bg-gradient-to-br from-primary to-primary/80'
        )}
        size="icon"
      >
        <Bot className="h-6 w-6" />
      </Button>
      <div>
        <p className="font-medium">AI Copilot Button</p>
        <p className="text-sm text-muted-foreground">
          Click to open the AI assistant
        </p>
      </div>
    </div>
  ),
};
