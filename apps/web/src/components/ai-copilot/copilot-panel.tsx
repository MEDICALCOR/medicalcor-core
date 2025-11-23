'use client';

import { useState } from 'react';
import { Bot, MessageSquare, Lightbulb, FileText, Sparkles, X, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { CopilotChat } from './copilot-chat';
import { SmartSuggestions } from './smart-suggestions';
import { PatientSummary } from './patient-summary';
import { ProcedureRecommendations } from './procedure-recommendations';

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

interface CopilotPanelProps {
  patientId?: string;
  patientPhone?: string;
  patientName?: string;
  currentConversation?: {
    direction: 'IN' | 'OUT';
    content: string;
    timestamp: string;
    channel: 'whatsapp' | 'sms' | 'voice';
  }[];
  onSuggestionSelect?: (content: string) => void;
  className?: string;
}

export function CopilotPanel({
  patientId,
  patientPhone,
  patientName,
  currentConversation,
  onSuggestionSelect,
  className,
}: CopilotPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('suggestions');

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className={cn(
          'fixed right-4 bottom-4 h-14 w-14 rounded-full shadow-lg',
          'bg-gradient-to-br from-primary to-primary/80',
          'hover:from-primary/90 hover:to-primary/70',
          className
        )}
        size="icon"
      >
        <Bot className="h-6 w-6" />
        <span className="sr-only">Deschide AI Copilot</span>
      </Button>
    );
  }

  const context = {
    patientId,
    patientPhone,
    patientName,
    currentConversation,
  };

  return (
    <div
      className={cn(
        'fixed right-4 bottom-4 w-96 h-[600px] max-h-[80vh]',
        'bg-background border rounded-lg shadow-xl',
        'flex flex-col overflow-hidden',
        className
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
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chat' && <CopilotChat context={context} />}
        {activeTab === 'suggestions' && (
          <SmartSuggestions context={context} onSelect={onSuggestionSelect} />
        )}
        {activeTab === 'summary' && <PatientSummary patientId={patientId} />}
        {activeTab === 'procedures' && <ProcedureRecommendations context={context} />}
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
