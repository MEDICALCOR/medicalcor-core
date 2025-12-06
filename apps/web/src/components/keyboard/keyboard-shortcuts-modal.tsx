'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import { Keyboard, Search, Command, X, ArrowRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ============================================================================
// TYPES
// ============================================================================

interface ShortcutItem {
  keys: string[];
  description: string;
  context?: string;
}

interface ShortcutCategory {
  id: string;
  name: string;
  icon?: React.ReactNode;
  shortcuts: ShortcutItem[];
}

interface KeyboardShortcutsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// PLATFORM DETECTION
// ============================================================================

function useIsMac(): boolean {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform));
  }, []);

  return isMac;
}

// ============================================================================
// SHORTCUT DATA
// ============================================================================

const shortcutCategories: ShortcutCategory[] = [
  {
    id: 'command-palette',
    name: 'Căutare Rapidă (⌘K)',
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Deschide paleta de comenzi' },
      { keys: ['↑', '↓'], description: 'Navigare în rezultate', context: 'în paletă' },
      { keys: ['Enter'], description: 'Selectează rezultatul', context: 'în paletă' },
      { keys: ['Esc'], description: 'Închide paleta', context: 'în paletă' },
    ],
  },
  {
    id: 'navigation',
    name: 'Navigare Rapidă',
    shortcuts: [
      { keys: ['G', 'D'], description: 'Mergi la Dashboard' },
      { keys: ['G', 'T'], description: 'Mergi la Triage' },
      { keys: ['G', 'C'], description: 'Mergi la Calendar' },
      { keys: ['G', 'P'], description: 'Mergi la Pacienți' },
      { keys: ['G', 'M'], description: 'Mergi la Mesaje' },
      { keys: ['G', 'S'], description: 'Mergi la Setări' },
    ],
  },
  {
    id: 'actions',
    name: 'Acțiuni Rapide',
    shortcuts: [
      { keys: ['N'], description: 'Element nou (lead/pacient)' },
      { keys: ['R'], description: 'Reîmprospătează datele' },
      { keys: ['E'], description: 'Editează elementul selectat' },
      { keys: ['⌘', 'S'], description: 'Salvează modificările' },
      { keys: ['Delete'], description: 'Șterge elementul selectat' },
    ],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    shortcuts: [
      { keys: ['T'], description: 'Mergi la ziua curentă (Today)' },
      { keys: ['←'], description: 'Perioada anterioară' },
      { keys: ['→'], description: 'Perioada următoare' },
      { keys: ['D'], description: 'Vizualizare zi' },
      { keys: ['W'], description: 'Vizualizare săptămână' },
      { keys: ['M'], description: 'Vizualizare lună' },
    ],
  },
  {
    id: 'general',
    name: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Afișează scurtăturile de tastatură' },
      { keys: ['Esc'], description: 'Închide dialog/modal/panou' },
      { keys: ['⌘', '/'], description: 'Focus pe câmpul de căutare' },
      { keys: ['⌘', 'Shift', 'D'], description: 'Comută tema (light/dark)' },
    ],
  },
];

const commandPaletteCommands = [
  {
    category: 'Navigare',
    commands: ['Dashboard', 'Triage', 'Pacienți', 'Calendar', 'Mesaje', 'Analytics', 'Setări'],
  },
  {
    category: 'Acțiuni',
    commands: ['Pacient Nou', 'Programare Nouă', 'Mesaj Nou', 'Exportă Date'],
  },
  { category: 'Căutare', commands: ['Caută pacienți după nume', 'Caută după telefon'] },
];

// ============================================================================
// KEYBOARD KEY COMPONENT
// ============================================================================

interface KeyBadgeProps {
  keyName: string;
  isMac: boolean;
}

function KeyBadge({ keyName, isMac }: KeyBadgeProps) {
  const displayKey = useMemo(() => {
    switch (keyName) {
      case '⌘':
        return isMac ? '⌘' : 'Ctrl';
      case 'Ctrl':
        return isMac ? '⌃' : 'Ctrl';
      case 'Alt':
        return isMac ? '⌥' : 'Alt';
      case 'Shift':
        return isMac ? '⇧' : 'Shift';
      case 'Enter':
        return '↵';
      case 'Esc':
      case 'Escape':
        return 'Esc';
      case 'Delete':
        return isMac ? '⌫' : 'Del';
      default:
        return keyName;
    }
  }, [keyName, isMac]);

  const isModifier = ['⌘', 'Ctrl', 'Alt', 'Shift', '⌃', '⌥', '⇧'].includes(keyName);
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

// ============================================================================
// SHORTCUT ROW COMPONENT
// ============================================================================

interface ShortcutRowProps {
  shortcut: ShortcutItem;
  isMac: boolean;
}

function ShortcutRow({ shortcut, isMac }: ShortcutRowProps) {
  return (
    <div className="flex items-center justify-between py-2 group">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-sm text-foreground truncate">{shortcut.description}</span>
        {shortcut.context && (
          <span className="text-xs text-muted-foreground shrink-0">({shortcut.context})</span>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-4">
        {shortcut.keys.map((key, idx) => (
          <span key={idx} className="flex items-center gap-0.5">
            <KeyBadge keyName={key} isMac={isMac} />
            {idx < shortcut.keys.length - 1 && shortcut.keys.length > 1 && (
              <span className="text-muted-foreground text-xs mx-0.5">
                {shortcut.keys[0] === 'G' ? 'apoi' : '+'}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'shortcuts' | 'commands'>('shortcuts');
  const isMac = useIsMac();

  // Reset search when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setActiveTab('shortcuts');
    }
  }, [open]);

  // Filter shortcuts based on search
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

  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) {
      return commandPaletteCommands;
    }

    const query = searchQuery.toLowerCase();
    return commandPaletteCommands
      .map((group) => ({
        ...group,
        commands: group.commands.filter((cmd) => cmd.toLowerCase().includes(query)),
      }))
      .filter((group) => group.commands.length > 0);
  }, [searchQuery]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      }
    },
    [onOpenChange]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-0"
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Keyboard className="h-5 w-5" />
            Scurtături de tastatură
          </DialogTitle>

          {/* Search */}
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Caută scurtături..."
              className="pl-9 pr-4"
              autoFocus
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

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            <Button
              variant={activeTab === 'shortcuts' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('shortcuts')}
              className="gap-1.5"
            >
              <Keyboard className="h-3.5 w-3.5" />
              Scurtături
            </Button>
            <Button
              variant={activeTab === 'commands' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('commands')}
              className="gap-1.5"
            >
              <Command className="h-3.5 w-3.5" />
              Comenzi ⌘K
            </Button>
          </div>
        </DialogHeader>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6">
          <div className="py-4">
            {activeTab === 'shortcuts' ? (
              // Shortcuts Tab
              <>
                {filteredCategories.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nu am găsit scurtături pentru "{searchQuery}"</p>
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
                            <ShortcutRow key={idx} shortcut={shortcut} isMac={isMac} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              // Commands Tab (⌘K)
              <>
                {filteredCommands.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nu am găsit comenzi pentru "{searchQuery}"</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="text-sm text-muted-foreground mb-4 flex items-center gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <Command className="h-3 w-3" />K
                      </Badge>
                      <span>Deschide paleta de comenzi pentru acces rapid la:</span>
                    </div>

                    {filteredCommands.map((group) => (
                      <div key={group.category}>
                        <h3 className="font-semibold text-sm text-muted-foreground mb-2 uppercase tracking-wide">
                          {group.category}
                        </h3>
                        <div className="grid grid-cols-2 gap-2">
                          {group.commands.map((cmd) => (
                            <div
                              key={cmd}
                              className="flex items-center gap-2 py-1.5 px-2 rounded-md bg-muted/40 text-sm"
                            >
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="truncate">{cmd}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t bg-muted/30 shrink-0">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                Apasă <KeyBadge keyName="?" isMac={isMac} /> pentru a deschide acest ghid
              </span>
            </div>
            <div className="flex items-center gap-1">
              <KeyBadge keyName="Esc" isMac={isMac} />
              <span>pentru a închide</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// HOOK FOR INTEGRATION
// ============================================================================

export function useKeyboardShortcutsModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show shortcuts modal on ?
      if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const target = e.target as HTMLElement;
        if (
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return {
    isOpen,
    setIsOpen,
    openModal: () => setIsOpen(true),
    closeModal: () => setIsOpen(false),
  };
}
