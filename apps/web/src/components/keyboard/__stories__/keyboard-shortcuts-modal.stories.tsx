import type { Meta, StoryObj } from '@storybook/react';
import { useState, useMemo, useEffect } from 'react';
import { Keyboard, Search, Command, X, ArrowRight, HelpCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ShortcutItem {
  keys: string[];
  description: string;
  context?: string;
}

interface ShortcutCategory {
  id: string;
  name: string;
  shortcuts: ShortcutItem[];
}

const shortcutCategories: ShortcutCategory[] = [
  {
    id: 'command-palette',
    name: 'Quick Search (⌘K)',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open command palette' },
      { keys: ['↑', '↓'], description: 'Navigate results', context: 'in palette' },
      { keys: ['Enter'], description: 'Select result', context: 'in palette' },
      { keys: ['Esc'], description: 'Close palette', context: 'in palette' },
    ],
  },
  {
    id: 'navigation',
    name: 'Quick Navigation',
    shortcuts: [
      { keys: ['G', 'D'], description: 'Go to Dashboard' },
      { keys: ['G', 'T'], description: 'Go to Triage' },
      { keys: ['G', 'C'], description: 'Go to Calendar' },
      { keys: ['G', 'P'], description: 'Go to Patients' },
      { keys: ['G', 'M'], description: 'Go to Messages' },
      { keys: ['G', 'S'], description: 'Go to Settings' },
    ],
  },
  {
    id: 'actions',
    name: 'Quick Actions',
    shortcuts: [
      { keys: ['N'], description: 'New item (lead/patient)' },
      { keys: ['R'], description: 'Refresh data' },
      { keys: ['E'], description: 'Edit selected item' },
      { keys: ['⌘', 'S'], description: 'Save changes' },
      { keys: ['Delete'], description: 'Delete selected item' },
    ],
  },
  {
    id: 'general',
    name: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Show keyboard shortcuts' },
      { keys: ['Esc'], description: 'Close dialog/modal/panel' },
      { keys: ['⌘', '/'], description: 'Focus search field' },
      { keys: ['⌘', 'Shift', 'D'], description: 'Toggle theme (light/dark)' },
    ],
  },
];

function KeyBadge({ keyName }: { keyName: string }) {
  const displayKey = (() => {
    switch (keyName) {
      case '⌘':
        return '⌘';
      case 'Ctrl':
        return 'Ctrl';
      case 'Shift':
        return '⇧';
      case 'Enter':
        return '↵';
      case 'Esc':
        return 'Esc';
      case 'Delete':
        return '⌫';
      default:
        return keyName;
    }
  })();

  const isModifier = ['⌘', 'Ctrl', 'Shift', '⇧'].includes(keyName);
  const isArrow = ['←', '→', '↑', '↓'].includes(keyName);

  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center font-mono text-xs border rounded shadow-sm',
        'bg-muted/80 border-border/60',
        isModifier || isArrow ? 'px-1.5 py-0.5 min-w-[24px]' : 'px-2 py-1 min-w-[28px]'
      )}
    >
      {displayKey}
    </kbd>
  );
}

function ShortcutRow({ shortcut }: { shortcut: ShortcutItem }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-foreground truncate">{shortcut.description}</span>
        {shortcut.context && (
          <span className="text-xs text-muted-foreground shrink-0">({shortcut.context})</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-4">
        {shortcut.keys.map((key, idx) => (
          <span key={idx} className="flex items-center gap-0.5">
            <KeyBadge keyName={key} />
            {idx < shortcut.keys.length - 1 && shortcut.keys.length > 1 && (
              <span className="text-muted-foreground text-xs mx-0.5">
                {shortcut.keys[0] === 'G' ? 'then' : '+'}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

interface KeyboardShortcutsModalDemoProps {
  defaultOpen?: boolean;
}

function KeyboardShortcutsModalDemo({ defaultOpen = false }: KeyboardShortcutsModalDemoProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) {
      return shortcutCategories;
    }

    const query = searchQuery.toLowerCase();
    return shortcutCategories
      .map((category) => ({
        ...category,
        shortcuts: category.shortcuts.filter(
          (s) =>
            s.description.toLowerCase().includes(query) ||
            s.keys.join(' ').toLowerCase().includes(query)
        ),
      }))
      .filter((category) => category.shortcuts.length > 0);
  }, [searchQuery]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <HelpCircle className="h-4 w-4" />
          Keyboard Shortcuts
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Keyboard className="h-5 w-5" />
            Keyboard Shortcuts
          </DialogTitle>

          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search shortcuts..."
              className="pl-9 pr-4"
            />
            {searchQuery && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                onClick={() => setSearchQuery('')}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6">
          <div className="py-4">
            {filteredCategories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No shortcuts found for "{searchQuery}"</p>
              </div>
            ) : (
              <div className="space-y-6">
                {filteredCategories.map((category) => (
                  <div key={category.id}>
                    <h3 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wide">
                      {category.name}
                    </h3>
                    <div className="divide-y divide-border/50">
                      {category.shortcuts.map((shortcut, idx) => (
                        <ShortcutRow key={idx} shortcut={shortcut} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t bg-muted/30 shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              Press <KeyBadge keyName="?" /> to open this guide
            </span>
            <div className="flex items-center gap-1">
              <KeyBadge keyName="Esc" />
              <span>to close</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const meta = {
  title: 'Features/KeyboardShortcutsModal',
  component: KeyboardShortcutsModalDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof KeyboardShortcutsModalDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {},
};

export const Open: Story = {
  args: {
    defaultOpen: true,
  },
};

export const KeyboardKeys: Story = {
  args: {},
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Keyboard Key Styles</h3>
      <div className="flex flex-wrap gap-3">
        <KeyBadge keyName="⌘" />
        <KeyBadge keyName="Ctrl" />
        <KeyBadge keyName="Shift" />
        <KeyBadge keyName="Enter" />
        <KeyBadge keyName="Esc" />
        <KeyBadge keyName="Delete" />
        <KeyBadge keyName="↑" />
        <KeyBadge keyName="↓" />
        <KeyBadge keyName="←" />
        <KeyBadge keyName="→" />
        <KeyBadge keyName="K" />
        <KeyBadge keyName="?" />
      </div>
    </div>
  ),
};

export const ShortcutExamples: Story = {
  args: {},
  render: () => (
    <div className="space-y-4 w-[400px]">
      <h3 className="text-lg font-semibold">Common Shortcuts</h3>
      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm">Open command palette</span>
          <div className="flex items-center gap-1">
            <KeyBadge keyName="⌘" />
            <span className="text-xs text-muted-foreground">+</span>
            <KeyBadge keyName="K" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Save changes</span>
          <div className="flex items-center gap-1">
            <KeyBadge keyName="⌘" />
            <span className="text-xs text-muted-foreground">+</span>
            <KeyBadge keyName="S" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Go to Dashboard</span>
          <div className="flex items-center gap-1">
            <KeyBadge keyName="G" />
            <span className="text-xs text-muted-foreground">then</span>
            <KeyBadge keyName="D" />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm">Show help</span>
          <KeyBadge keyName="?" />
        </div>
      </div>
    </div>
  ),
};

export const InHeader: Story = {
  args: {},
  render: () => (
    <div className="flex items-center justify-between bg-background border rounded-lg px-4 py-2 w-[500px]">
      <div className="flex items-center gap-2">
        <span className="font-medium">MedicalCor Dashboard</span>
      </div>
      <div className="flex items-center gap-2">
        <KeyboardShortcutsModalDemo />
      </div>
    </div>
  ),
};
