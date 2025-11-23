'use client';

import { useState } from 'react';
import { Search, MessageSquare, Phone, Mail, Filter, Clock, CheckCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Conversation, MessageChannel, ConversationStatus } from '@/lib/messages';

interface ConversationListProps {
  conversations: Conversation[];
  selectedId?: string;
  onSelect: (conversation: Conversation) => void;
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
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Acum';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}z`;
  return date.toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' });
}

export function ConversationList({ conversations, selectedId, onSelect }: ConversationListProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ConversationStatus | 'all'>('all');
  const [channelFilter, setChannelFilter] = useState<MessageChannel | 'all'>('all');

  const filteredConversations = conversations.filter((conv) => {
    if (
      search &&
      !conv.patientName.toLowerCase().includes(search.toLowerCase()) &&
      !conv.patientPhone.includes(search)
    ) {
      return false;
    }
    if (statusFilter !== 'all' && conv.status !== statusFilter) return false;
    if (channelFilter !== 'all' && conv.channel !== channelFilter) return false;
    return true;
  });

  const activeCount = conversations.filter((c) => c.status === 'active').length;
  const waitingCount = conversations.filter((c) => c.status === 'waiting').length;

  return (
    <div className="flex flex-col h-full border-r">
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
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <Filter className="h-3 w-3 mr-1" />
                Status
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setStatusFilter('all')}>Toate</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('active')}>Active</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('waiting')}>
                În așteptare
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setStatusFilter('resolved')}>
                Rezolvate
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8">
                <MessageSquare className="h-3 w-3 mr-1" />
                Canal
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setChannelFilter('all')}>Toate</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChannelFilter('whatsapp')}>
                WhatsApp
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChannelFilter('sms')}>SMS</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setChannelFilter('email')}>Email</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto">
        {filteredConversations.map((conv) => {
          const ChannelIcon = channelIcons[conv.channel];
          const isSelected = conv.id === selectedId;

          return (
            <div
              key={conv.id}
              onClick={() => onSelect(conv)}
              className={cn(
                'p-3 border-b cursor-pointer transition-colors hover:bg-muted/50',
                isSelected && 'bg-muted'
              )}
            >
              <div className="flex items-start gap-3">
                {/* Avatar with channel indicator */}
                <div className="relative">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-sm font-medium text-primary">
                      {conv.patientName
                        .split(' ')
                        .map((n) => n[0])
                        .join('')}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-card flex items-center justify-center'
                    )}
                  >
                    <ChannelIcon className={cn('h-3 w-3', channelColors[conv.channel])} />
                  </div>
                </div>

                {/* Content */}
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
                    {conv.lastMessage?.direction === 'OUT' && (
                      <CheckCheck className="h-3 w-3 text-blue-500 shrink-0" />
                    )}
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.lastMessage?.content}
                    </p>
                  </div>

                  {/* Tags and Status */}
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <div className={cn('w-2 h-2 rounded-full', statusColors[conv.status])} />
                    {conv.tags?.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                        {tag}
                      </Badge>
                    ))}
                    {conv.assignedTo && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Clock className="h-2.5 w-2.5" />
                        {conv.assignedTo}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filteredConversations.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nu există conversații</p>
          </div>
        )}
      </div>
    </div>
  );
}
