'use client';

import { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { useKeyboard } from '@/lib/keyboard';
import { formatShortcut } from '@/lib/keyboard/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Default shortcuts to display
const defaultShortcuts = [
  {
    category: 'Navigare',
    shortcuts: [
      { key: 'g+d', description: 'Mergi la Dashboard' },
      { key: 'g+t', description: 'Mergi la Triage' },
      { key: 'g+c', description: 'Mergi la Calendar' },
      { key: 'g+s', description: 'Mergi la Setări' },
    ],
  },
  {
    category: 'Acțiuni',
    shortcuts: [
      { key: 'ctrl+k', description: 'Căutare rapidă' },
      { key: 'n', description: 'Lead nou' },
      { key: 'r', description: 'Refresh date' },
    ],
  },
  {
    category: 'General',
    shortcuts: [
      { key: '?', description: 'Afișează acest ajutor' },
      { key: 'escape', description: 'Închide dialog/panel' },
    ],
  },
];

export function ShortcutsHelp() {
  const { isHelpOpen, setIsHelpOpen, getRegisteredShortcuts } = useKeyboard();

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isHelpOpen) {
        setIsHelpOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isHelpOpen, setIsHelpOpen]);

  if (!isHelpOpen) return null;

  const registeredShortcuts = getRegisteredShortcuts();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => setIsHelpOpen(false)}
      />

      {/* Dialog */}
      <Card className="relative z-10 w-full max-w-lg max-h-[80vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Scurtături tastatură
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setIsHelpOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </CardHeader>

        <CardContent className="overflow-y-auto max-h-[60vh]">
          <div className="space-y-6">
            {defaultShortcuts.map((category) => (
              <div key={category.category}>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                  {category.category}
                </h3>
                <div className="space-y-1">
                  {category.shortcuts.map((shortcut) => (
                    <div key={shortcut.key} className="flex items-center justify-between py-1.5">
                      <span className="text-sm">{shortcut.description}</span>
                      <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border">
                        {formatShortcut(shortcut.key)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Show dynamically registered shortcuts */}
            {registeredShortcuts.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Pagina curentă</h3>
                <div className="space-y-1">
                  {registeredShortcuts.map((shortcut) => (
                    <div key={shortcut.key} className="flex items-center justify-between py-1.5">
                      <span className="text-sm">{shortcut.description}</span>
                      <kbd className="px-2 py-1 text-xs font-mono bg-muted rounded border">
                        {formatShortcut(shortcut.key)}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground mt-4 pt-4 border-t">
            Apasă <kbd className="px-1 py-0.5 text-xs font-mono bg-muted rounded">?</kbd> oricând
            pentru a vedea scurtăturile disponibile.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
