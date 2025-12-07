import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { Send, Bot, User, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const sampleMessages: Message[] = [
  {
    id: '1',
    role: 'user',
    content: 'Cum să răspund la întrebări despre prețul procedurii All-on-X?',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
  },
  {
    id: '2',
    role: 'assistant',
    content: `Pentru întrebări despre prețul All-on-X, recomand următoarea abordare:

1. **Subliniază valoarea**: "All-on-X este o investiție în calitatea vieții, oferind o soluție permanentă pentru zâmbetul dumneavoastră."

2. **Interval de preț**: "Costul variază între €8,000-€15,000 în funcție de complexitatea cazului și materialele alese."

3. **Plan de plată**: "Oferim opțiuni de finanțare în rate de până la 24 luni."

4. **Consultație gratuită**: "Vă invit la o consultație gratuită unde medicul va evalua cazul dumneavoastră și va oferi un plan personalizat."`,
    timestamp: new Date(Date.now() - 4 * 60 * 1000),
  },
  {
    id: '3',
    role: 'user',
    content: 'Pacientul pare îngrijorat de durere. Ce să-i spun?',
    timestamp: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: '4',
    role: 'assistant',
    content: `Înțeleg preocuparea. Iată cum poți aborda subiectul durerii:

**Răspuns empatic:**
"Înțeleg perfect îngrijorarea dumneavoastră - este o întrebare frecventă. Procedura se realizează sub anestezie, deci nu veți simți nimic în timpul intervenției."

**Despre perioada de recuperare:**
"După procedură, este normal să aveți un disconfort moderat câteva zile, pe care îl gestionăm eficient cu medicație adecvată."

**Asigurare:**
"Mulți pacienți ne spun că au fost plăcut surprinși - disconfortul a fost mult mai mic decât se așteptau."`,
    timestamp: new Date(Date.now() - 1 * 60 * 1000),
  },
];

interface CopilotChatDemoProps {
  messages?: Message[];
  isLoading?: boolean;
  error?: string;
}

function CopilotChatDemo({
  messages: initialMessages = [],
  isLoading = false,
  error,
}: CopilotChatDemoProps) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const newMessage: Message = {
      id: String(Date.now()),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages([...messages, newMessage]);
    setInput('');
  };

  return (
    <div className="flex flex-col h-[500px] w-96 border rounded-lg overflow-hidden bg-background">
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
                    message.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
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
          </>
        )}

        {error && (
          <div className="bg-destructive/10 text-destructive text-sm rounded-lg p-3">
            {error}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t">
        {messages.length > 0 && (
          <div className="flex justify-end mb-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessages([])}
              className="text-xs text-muted-foreground"
            >
              <Trash2 className="h-3 w-3 mr-1" />
              Șterge conversația
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
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

const meta = {
  title: 'AI Copilot/CopilotChat',
  component: CopilotChatDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof CopilotChatDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: {
    messages: [],
  },
};

export const WithConversation: Story = {
  args: {
    messages: sampleMessages,
  },
};

export const Loading: Story = {
  args: {
    messages: [sampleMessages[0]],
    isLoading: true,
  },
};

export const WithError: Story = {
  args: {
    messages: [sampleMessages[0]],
    error: 'Nu s-a putut genera răspunsul. Vă rugăm încercați din nou.',
  },
};

export const LongConversation: Story = {
  args: {
    messages: [
      ...sampleMessages,
      {
        id: '5',
        role: 'user',
        content: 'Mulțumesc pentru sfaturi!',
        timestamp: new Date(),
      },
      {
        id: '6',
        role: 'assistant',
        content:
          'Cu plăcere! Nu ezita să mă întrebi oricând ai nevoie de ajutor. Succes cu pacientul!',
        timestamp: new Date(),
      },
    ],
  },
};
