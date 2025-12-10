'use client';

import { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ChatMessage, ParticipantRole } from '../actions';

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onSendMessage: (content: string) => void;
  isLoading?: boolean;
}

function getRoleBadgeColor(role: ParticipantRole): string {
  switch (role) {
    case 'doctor':
      return 'text-blue-600 bg-blue-100 dark:bg-blue-950';
    case 'patient':
      return 'text-green-600 bg-green-100 dark:bg-green-950';
    case 'assistant':
      return 'text-purple-600 bg-purple-100 dark:bg-purple-950';
    default:
      return 'text-gray-600 bg-gray-100 dark:bg-gray-950';
  }
}

function getRoleLabel(role: ParticipantRole): string {
  switch (role) {
    case 'doctor':
      return 'Doctor';
    case 'patient':
      return 'Pacient';
    case 'assistant':
      return 'Asistent';
    default:
      return role;
  }
}

function formatTime(date: Date): string {
  return new Date(date).toLocaleTimeString('ro-RO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ChatMessageItem({ message, isOwn }: { message: ChatMessage; isOwn: boolean }) {
  if (message.isSystem) {
    return (
      <div className="text-center py-2">
        <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
          {message.content}
        </span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', isOwn ? 'items-end' : 'items-start')}>
      {/* Sender info */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'text-[10px] px-2 py-0.5 rounded-full font-medium',
            getRoleBadgeColor(message.senderRole)
          )}
        >
          {getRoleLabel(message.senderRole)}
        </span>
        <span className="text-xs text-muted-foreground">{message.senderName}</span>
      </div>

      {/* Message bubble */}
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2',
          isOwn ? 'bg-primary text-primary-foreground rounded-br-none' : 'bg-muted rounded-bl-none'
        )}
      >
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-muted-foreground">{formatTime(message.timestamp)}</span>
    </div>
  );
}

export function ChatPanel({
  messages,
  currentUserId,
  isOpen,
  onClose,
  onSendMessage,
  isLoading = false,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && !isLoading) {
      onSendMessage(inputValue.trim());
      setInputValue('');
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="w-80 border-l bg-background flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <span className="font-medium">Chat</span>
          {messages.length > 0 && (
            <span className="text-xs text-muted-foreground">({messages.length})</span>
          )}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4" ref={scrollAreaRef}>
        {messages.length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">Niciun mesaj încă</p>
            <p className="text-xs text-muted-foreground mt-1">
              Începe o conversație cu participanții
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <ChatMessageItem
                key={message.id}
                message={message}
                isOwn={message.senderId === currentUserId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Scrie un mesaj..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button type="submit" size="icon" disabled={!inputValue.trim() || isLoading}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
