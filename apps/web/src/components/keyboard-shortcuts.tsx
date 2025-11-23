'use client';

import { useEffect, useState } from 'react';
import { Keyboard } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ShortcutGroup {
  name: string;
  shortcuts: { keys: string[]; description: string }[];
}

const shortcutGroups: ShortcutGroup[] = [
  {
    name: 'Navigare',
    shortcuts: [
      { keys: ['Ctrl', 'K'], description: 'Deschide căutarea rapidă' },
      { keys: ['G', 'H'], description: 'Mergi la Dashboard' },
      { keys: ['G', 'P'], description: 'Mergi la Pacienți' },
      { keys: ['G', 'C'], description: 'Mergi la Calendar' },
      { keys: ['G', 'M'], description: 'Mergi la Mesaje' },
      { keys: ['G', 'S'], description: 'Mergi la Setări' },
    ],
  },
  {
    name: 'Acțiuni',
    shortcuts: [
      { keys: ['N'], description: 'Element nou (context dependent)' },
      { keys: ['E'], description: 'Editează elementul selectat' },
      { keys: ['Delete'], description: 'Șterge elementul selectat' },
      { keys: ['Ctrl', 'S'], description: 'Salvează modificările' },
      { keys: ['Escape'], description: 'Închide dialog/modal' },
    ],
  },
  {
    name: 'Calendar',
    shortcuts: [
      { keys: ['T'], description: 'Mergi la ziua curentă' },
      { keys: ['←'], description: 'Perioada anterioară' },
      { keys: ['→'], description: 'Perioada următoare' },
      { keys: ['D'], description: 'Vizualizare zi' },
      { keys: ['W'], description: 'Vizualizare săptămână' },
      { keys: ['M'], description: 'Vizualizare lună' },
    ],
  },
  {
    name: 'General',
    shortcuts: [
      { keys: ['?'], description: 'Arată scurtăturile de tastatură' },
      { keys: ['Ctrl', '/'], description: 'Focus pe căutare' },
      { keys: ['Ctrl', 'Shift', 'D'], description: 'Comută tema (light/dark)' },
    ],
  },
];

export function KeyboardShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Scurtături de tastatură
          </DialogTitle>
          <DialogDescription>
            Folosește aceste scurtături pentru a naviga mai rapid în aplicație
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          {shortcutGroups.map((group) => (
            <div key={group.name}>
              <h3 className="font-medium text-sm text-muted-foreground mb-3">{group.name}</h3>
              <div className="space-y-2">
                {group.shortcuts.map((shortcut, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, keyIndex) => (
                        <span key={keyIndex} className="flex items-center gap-1">
                          <kbd className="px-2 py-1 text-xs font-mono bg-muted border rounded shadow-sm">
                            {key}
                          </kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="text-muted-foreground text-xs">+</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Apasă <kbd className="px-1.5 py-0.5 text-xs font-mono bg-muted border rounded">?</kbd>{' '}
            oricând pentru a vedea acest ghid
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useKeyboardShortcuts() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Show shortcuts dialog on ?
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        setIsOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { isOpen, setIsOpen };
}
