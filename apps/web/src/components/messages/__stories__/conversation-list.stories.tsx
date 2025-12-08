import type { Meta, StoryObj } from '@storybook/react';
import { fn } from 'storybook/test';
import { useState } from 'react';
import { Search, MessageSquare, Phone, Mail, Filter, CheckCheck, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type MessageChannel = 'whatsapp' | 'sms' | 'email';
type ConversationStatus = 'active' | 'waiting' | 'resolved' | 'archived';

interface Conversation {
  id: string;
  patientName: string;
  phone: string;
  channel: MessageChannel;
  status: ConversationStatus;
  unreadCount: number;
  lastMessage: {
    content: string;
    direction: 'IN' | 'OUT';
  };
  updatedAt: Date;
}

const channelIcons: Record<MessageChannel, React.ElementType> = {
  whatsapp: MessageSquare,
  sms: Phone,
  email: Mail,
};

const channelColors: Record<MessageChannel, string> = {
  whatsapp: 'text-green-500',
  sms: 'text-blue-500',
  email: 'text-purple-500',
};

const statusColors: Record<ConversationStatus, string> = {
  active: 'bg-green-500',
  waiting: 'bg-yellow-500',
  resolved: 'bg-blue-500',
  archived: 'bg-gray-500',
};

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  if (diffMins < 1) return 'Acum';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

const sampleConversations: Conversation[] = [
  {
    id: '1',
    patientName: 'Ion Popescu',
    phone: '+40 721 234 567',
    channel: 'whatsapp',
    status: 'active',
    unreadCount: 3,
    lastMessage: { content: 'Bună ziua, doresc să programez o consultație', direction: 'IN' },
    updatedAt: new Date(Date.now() - 5 * 60 * 1000),
  },
  {
    id: '2',
    patientName: 'Maria Ionescu',
    phone: '+40 722 345 678',
    channel: 'whatsapp',
    status: 'waiting',
    unreadCount: 0,
    lastMessage: { content: 'V-am trimis informațiile solicitate', direction: 'OUT' },
    updatedAt: new Date(Date.now() - 30 * 60 * 1000),
  },
  {
    id: '3',
    patientName: 'Ana Gheorghe',
    phone: '+40 723 456 789',
    channel: 'sms',
    status: 'active',
    unreadCount: 1,
    lastMessage: { content: 'Confirm programarea pentru mâine la 10:00', direction: 'IN' },
    updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
  },
  {
    id: '4',
    patientName: 'Andrei Popa',
    phone: '+40 724 567 890',
    channel: 'email',
    status: 'resolved',
    unreadCount: 0,
    lastMessage: { content: 'Mulțumesc pentru răspuns!', direction: 'IN' },
    updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
];

interface ConversationListDemoProps {
  conversations?: Conversation[];
  selectedId?: string;
  hasMore?: boolean;
  isLoadingMore?: boolean;
}

function ConversationListDemo({
  conversations = sampleConversations,
  selectedId,
  hasMore = false,
  isLoadingMore = false,
}: ConversationListDemoProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(selectedId);

  const activeCount = conversations.filter((c) => c.status === 'active').length;
  const waitingCount = conversations.filter((c) => c.status === 'waiting').length;

  return (
    <div className="flex flex-col h-[600px] w-80 border rounded-lg overflow-hidden bg-background">
      {/* Header */}
      <div className="p-4 border-b space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Conversații</h2>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-100 text-green-700">
              {activeCount} active
            </Badge>
            <Badge variant="secondary" className="bg-yellow-100 text-yellow-700">
              {waitingCount} în așteptare
            </Badge>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Caută pacient sau telefon..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-8">
            <Filter className="h-3 w-3 mr-1" />
            Status
          </Button>
          <Button variant="outline" size="sm" className="h-8">
            <MessageSquare className="h-3 w-3 mr-1" />
            Canal
          </Button>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv) => {
          const ChannelIcon = channelIcons[conv.channel];
          const isSelected = conv.id === selected;

          return (
            <div
              key={conv.id}
              onClick={() => setSelected(conv.id)}
              className={cn(
                'p-3 border-b cursor-pointer transition-colors hover:bg-muted/50',
                isSelected && 'bg-muted'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {conv.patientName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </span>
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card flex items-center justify-center">
                    <ChannelIcon className={cn('h-3 w-3', channelColors[conv.channel])} />
                  </div>
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{conv.patientName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {conv.unreadCount > 0 && (
                        <Badge className="h-5 min-w-5 px-1.5 justify-center">
                          {conv.unreadCount}
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatTime(conv.updatedAt)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 mt-0.5">
                    {conv.lastMessage.direction === 'OUT' && (
                      <CheckCheck className="h-3 w-3 text-blue-500 shrink-0" />
                    )}
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.lastMessage.content}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className={cn('w-2 h-2 rounded-full', statusColors[conv.status])} />
                    <span className="text-[10px] text-muted-foreground capitalize">
                      {conv.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {conversations.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nu există conversații</p>
          </div>
        )}

        {hasMore && (
          <div className="p-4 border-t">
            <Button variant="outline" className="w-full" disabled={isLoadingMore}>
              {isLoadingMore ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Se încarcă...
                </>
              ) : (
                'Încarcă mai multe'
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

const meta = {
  title: 'Messages/ConversationList',
  component: ConversationListDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ConversationListDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    conversations: sampleConversations,
  },
};

export const Empty: Story = {
  args: {
    conversations: [],
  },
};

export const WithSelected: Story = {
  args: {
    conversations: sampleConversations,
    selectedId: '1',
  },
};

export const LoadingMore: Story = {
  args: {
    conversations: sampleConversations,
    hasMore: true,
    isLoadingMore: true,
  },
};

export const HasMore: Story = {
  args: {
    conversations: sampleConversations,
    hasMore: true,
  },
};

export const WhatsAppOnly: Story = {
  args: {
    conversations: sampleConversations.filter((c) => c.channel === 'whatsapp'),
  },
};

export const ActiveOnly: Story = {
  args: {
    conversations: sampleConversations.filter((c) => c.status === 'active'),
  },
};
