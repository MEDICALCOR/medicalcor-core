'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Loader2, Bot, User, Trash2 } from 'lucide-react';
import { useAICopilot, type ChatContext } from '@/lib/ai';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CopilotChatProps {
  context?: ChatContext;
}

export function CopilotChat({ context }: CopilotChatProps) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { messages, isLoading, error, sendMessage, clearMessages } = useAICopilot();

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    await sendMessage(message, context);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="p-3 rounded-full bg-primary/10 mb-3">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <h4 className="font-medium mb-1">AI Copilot</h4>
            <p className="text-sm text-muted-foreground">
              Întreabă-mă orice despre pacient sau despre cum să răspunzi la mesaje.
            </p>
            <div className="mt-4 space-y-2 text-xs text-muted-foreground">
              <p>Exemple:</p>
              <ul className="space-y-1">
                <li>&quot;Cum răspund la întrebări despre preț?&quot;</li>
                <li>&quot;Ce procedură să recomand?&quot;</li>
                <li>&quot;Rezumă conversația anterioară&quot;</li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'flex gap-2',
                  message.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                {message.role === 'assistant' && (
                  <div className="p-1.5 rounded-full bg-primary/10 h-fit">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                    message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                  )}
                >
                  <p className="whitespace-pre-wrap">{message.content}</p>
                  <span className="text-[10px] opacity-60 mt-1 block">
                    {message.timestamp.toLocaleTimeString('ro-RO', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                {message.role === 'user' && (
                  <div className="p-1.5 rounded-full bg-primary/10 h-fit">
                    <User className="h-4 w-4 text-primary" />
                  </div>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2">
                <div className="p-1.5 rounded-full bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">{error}</div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearMessages}
              className="text-xs text-muted-foreground"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Șterge conversația
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Întreabă AI Copilot..."
            className={cn(
              'flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm',
              'focus:outline-none focus:ring-2 focus:ring-primary/20',
              'min-h-[40px] max-h-[120px]'
            )}
            rows={1}
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={!input.trim() || isLoading}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
