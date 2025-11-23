'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { CommandPalette } from './command-palette';

interface QuickSearchContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const QuickSearchContext = createContext<QuickSearchContextValue | null>(null);

export function useQuickSearch() {
  const context = useContext(QuickSearchContext);
  if (!context) {
    throw new Error('useQuickSearch must be used within QuickSearchProvider');
  }
  return context;
}

interface QuickSearchProviderProps {
  children: ReactNode;
}

export function QuickSearchProvider({ children }: QuickSearchProviderProps) {
  const [open, setOpen] = useState(false);

  const toggle = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+K or Cmd+K
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        toggle();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [toggle]);

  return (
    <QuickSearchContext.Provider value={{ open, setOpen, toggle }}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </QuickSearchContext.Provider>
  );
}
