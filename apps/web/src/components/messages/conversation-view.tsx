'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import {
  Phone,
  Video,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  AlertCircle,
  MessageSquare,
  Mail,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { Conversation, Message } from '@/app/actions/get-patients';

type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
type MessageChannel = 'whatsapp' | 'sms' | 'email';

interface ConversationViewProps {
  conversation: Conversation;
  messages: Message[];
  onSendMessage: (content: string) => void;
  onStatusChange?: (status: Conversation['status']) => void;
  isLoading?: boolean;
}

const statusIcons: Record<MessageStatus, React.ElementType> = {
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: AlertCircle,
};

const channelLabels: Record<MessageChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
};

const channelIcons: Record<MessageChannel, React.ElementType> = {
  whatsapp: MessageSquare,
  sms: Phone,
  email: Mail,
};

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateHeader(date: Date): string {
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Astăzi';
  if (isYesterday) return 'Ieri';
  return date.toLocaleDateString('ro-RO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function groupMessagesByDate(messages: Message[]): Map<string, Message[]> {
  const groups = new Map<string, Message[]>();

  messages.forEach((msg) => {
    const dateKey = msg.timestamp.toDateString();
    const existing = groups.get(dateKey);
    if (existing) {
      existing.push(msg);
    } else {
      groups.set(dateKey, [msg]);
    }
  });

  return groups;
}

export function ConversationView({
  conversation,
  messages,
  onSendMessage,
  onStatusChange,
  isLoading = false,
}: ConversationViewProps) {
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newMessage.trim()) {
      onSendMessage(newMessage.trim());
      setNewMessage('');
    }
  };

  const messageGroups = groupMessagesByDate(messages);
  const ChannelIcon = channelIcons[conversation.channel];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-medium text-primary">
                {conversation.patientName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </span>
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-green-500 border-2 border-card" />
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{conversation.patientName}</h3>
              <Badge variant="secondary" className="text-[10px] flex items-center gap-1">
                <ChannelIcon className="h-3 w-3" />
                {channelLabels[conversation.channel]}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{conversation.phone}</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon">
            <Phone className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon">
            <Video className="h-4 w-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>Vezi profil pacient</DropdownMenuItem>
              <DropdownMenuItem>Adaugă notă</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onStatusChange?.('resolved')}>
                Marchează ca rezolvat
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onStatusChange?.('archived')}>
                Arhivează conversația
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-muted/30">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                <Skeleton className="h-16 w-[60%] rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
          Array.from(messageGroups.entries()).map(([dateKey, msgs]) => (
            <div key={dateKey}>
              {/* Date Header */}
              <div className="flex justify-center mb-4">
                <Badge variant="secondary" className="text-xs font-normal">
                  {formatDateHeader(msgs[0].timestamp)}
                </Badge>
              </div>

              {/* Messages for this date */}
              <div className="space-y-3">
                {msgs.map((message) => {
                  const isOutgoing = message.direction === 'OUT';
                  const StatusIcon = statusIcons[message.status];

                  return (
                    <div
                      key={message.id}
                      className={cn('flex', isOutgoing ? 'justify-end' : 'justify-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[70%] rounded-2xl px-4 py-2',
                          isOutgoing
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : 'bg-card border rounded-bl-md'
                        )}
                      >
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>

                        {/* Footer with time and status */}
                        <div
                          className={cn(
                            'flex items-center gap-1 mt-1 text-[10px]',
                            isOutgoing
                              ? 'text-primary-foreground/70 justify-end'
                              : 'text-muted-foreground'
                          )}
                        >
                          <span>{formatMessageTime(message.timestamp)}</span>
                          {isOutgoing && (
                            <StatusIcon
                              className={cn(
                                'h-3 w-3',
                                message.status === 'read' && 'text-blue-400'
                              )}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t bg-card flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={newMessage}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewMessage(e.target.value)}
          placeholder="Scrie un mesaj..."
          className="flex-1"
        />
        <Button type="button" variant="ghost" size="icon">
          <Smile className="h-4 w-4" />
        </Button>
        <Button type="submit" size="icon" disabled={!newMessage.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

export function EmptyConversationView() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
      <h3 className="text-lg font-medium mb-1">Selectează o conversație</h3>
      <p className="text-sm">Alege o conversație din listă pentru a vedea mesajele</p>
    </div>
  );
}
