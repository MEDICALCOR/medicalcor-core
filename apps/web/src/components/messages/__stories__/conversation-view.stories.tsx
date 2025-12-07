import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';
import { useState } from 'react';
import {
  Phone,
  Video,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Check,
  CheckCheck,
  MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed';
type MessageChannel = 'whatsapp' | 'sms' | 'email';

interface Message {
  id: string;
  content: string;
  direction: 'IN' | 'OUT';
  timestamp: Date;
  status: MessageStatus;
}

interface Conversation {
  id: string;
  patientName: string;
  phone: string;
  channel: MessageChannel;
}

const statusIcons: Record<MessageStatus, React.ElementType> = {
  sent: Check,
  delivered: CheckCheck,
  read: CheckCheck,
  failed: CheckCheck,
};

const channelLabels: Record<MessageChannel, string> = {
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
};

const sampleConversation: Conversation = {
  id: '1',
  patientName: 'Ion Popescu',
  phone: '+40 721 234 567',
  channel: 'whatsapp',
};

const sampleMessages: Message[] = [
  {
    id: '1',
    content: 'Bună ziua! Doresc să programez o consultație pentru procedura All-on-X.',
    direction: 'IN',
    timestamp: new Date(Date.now() - 60 * 60 * 1000),
    status: 'read',
  },
  {
    id: '2',
    content:
      'Bună ziua! Cu plăcere vă ajutăm. Avem disponibilitate săptămâna viitoare, luni sau miercuri dimineața. Ce zi vă convine?',
    direction: 'OUT',
    timestamp: new Date(Date.now() - 55 * 60 * 1000),
    status: 'read',
  },
  {
    id: '3',
    content: 'Miercuri dimineața ar fi perfect. La ce oră?',
    direction: 'IN',
    timestamp: new Date(Date.now() - 50 * 60 * 1000),
    status: 'read',
  },
  {
    id: '4',
    content:
      'Excelent! Vă propun ora 10:00. Consultația durează aproximativ 45 de minute și este gratuită. Confirmați programarea?',
    direction: 'OUT',
    timestamp: new Date(Date.now() - 45 * 60 * 1000),
    status: 'read',
  },
  {
    id: '5',
    content: 'Da, confirm. Mulțumesc!',
    direction: 'IN',
    timestamp: new Date(Date.now() - 40 * 60 * 1000),
    status: 'read',
  },
  {
    id: '6',
    content:
      'Perfect! Programare confirmată pentru miercuri, 10:00. Vă vom trimite un reminder cu o zi înainte. O zi frumoasă!',
    direction: 'OUT',
    timestamp: new Date(Date.now() - 35 * 60 * 1000),
    status: 'delivered',
  },
];

function formatMessageTime(date: Date): string {
  return date.toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface ConversationViewDemoProps {
  conversation?: Conversation;
  messages?: Message[];
  isLoading?: boolean;
  isEmpty?: boolean;
}

function ConversationViewDemo({
  conversation = sampleConversation,
  messages = sampleMessages,
  isLoading = false,
  isEmpty = false,
}: ConversationViewDemoProps) {
  const [newMessage, setNewMessage] = useState('');

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] w-[500px] border rounded-lg text-muted-foreground bg-background">
        <MessageSquare className="h-16 w-16 mb-4 opacity-30" />
        <h3 className="text-lg font-medium mb-1">Selectează o conversație</h3>
        <p className="text-sm">Alege o conversație din listă pentru a vedea mesajele</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[600px] w-[500px] border rounded-lg overflow-hidden bg-background">
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
                <MessageSquare className="h-3 w-3" />
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
          <Button variant="ghost" size="icon">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/30">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-end' : 'justify-start')}>
                <Skeleton className="h-16 w-[60%] rounded-2xl" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex justify-center">
              <Badge variant="secondary" className="text-xs font-normal">
                Astăzi
              </Badge>
            </div>
            {messages.map((message) => {
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
                          className={cn('h-3 w-3', message.status === 'read' && 'text-blue-400')}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={(e) => e.preventDefault()}
        className="p-4 border-t bg-card flex items-center gap-2"
      >
        <Button type="button" variant="ghost" size="icon">
          <Paperclip className="h-4 w-4" />
        </Button>
        <Input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
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

const meta = {
  title: 'Messages/ConversationView',
  component: ConversationViewDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ConversationViewDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    conversation: sampleConversation,
    messages: sampleMessages,
  },
};

export const Loading: Story = {
  args: {
    isLoading: true,
  },
};

export const Empty: Story = {
  args: {
    isEmpty: true,
  },
};

export const SMSChannel: Story = {
  args: {
    conversation: { ...sampleConversation, channel: 'sms' },
    messages: sampleMessages,
  },
};

export const EmailChannel: Story = {
  args: {
    conversation: { ...sampleConversation, channel: 'email' },
    messages: sampleMessages,
  },
};

export const ShortConversation: Story = {
  args: {
    messages: sampleMessages.slice(0, 2),
  },
};
