'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { matchesShortcut, parseShortcutKey, type ShortcutKey, type ParsedShortcut } from './types';

interface ShortcutHandler {
  shortcut: ParsedShortcut;
  callback: () => void;
  description: string;
}

type ShortcutMap = Map<string, ShortcutHandler>;

// Sequence handling for vim-style shortcuts (g+d, g+t, etc.)
interface SequenceState {
  buffer: string[];
  timeout: NodeJS.Timeout | null;
}

const SEQUENCE_TIMEOUT = 500; // ms to wait for next key in sequence

export function useKeyboardShortcuts() {
  const shortcutsRef = useRef<ShortcutMap>(new Map());
  const sequenceRef = useRef<SequenceState>({ buffer: [], timeout: null });
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const clearSequence = useCallback(() => {
    if (sequenceRef.current.timeout) {
      clearTimeout(sequenceRef.current.timeout);
    }
    sequenceRef.current = { buffer: [], timeout: null };
  }, []);

  const registerShortcut = useCallback(
    (key: ShortcutKey, callback: () => void, description: string) => {
      const parsed = parseShortcutKey(key);
      shortcutsRef.current.set(key, { shortcut: parsed, callback, description });

      return () => {
        shortcutsRef.current.delete(key);
      };
    },
    []
  );

  const getRegisteredShortcuts = useCallback(() => {
    return Array.from(shortcutsRef.current.entries()).map(([key, handler]) => ({
      key,
      description: handler.description,
    }));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ignore if typing in an input
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Check for ? to show help
      if (event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        setIsHelpOpen(true);
        return;
      }

      // Check for Escape to close help
      if (event.key === 'Escape' && isHelpOpen) {
        setIsHelpOpen(false);
        return;
      }

      // Handle sequence shortcuts (e.g., g+d)
      const key = event.key.toLowerCase();

      // If there's a pending sequence
      if (sequenceRef.current.buffer.length > 0) {
        clearSequence();

        // Try to match the sequence
        const sequenceKey = [...sequenceRef.current.buffer, key].join('+');
        const handler = shortcutsRef.current.get(sequenceKey);

        if (handler) {
          event.preventDefault();
          handler.callback();
          return;
        }
      }

      // Check for single-key shortcuts with modifiers
      for (const [, handler] of shortcutsRef.current) {
        if (matchesShortcut(event, handler.shortcut)) {
          event.preventDefault();
          handler.callback();
          return;
        }
      }

      // Start a new sequence if this could be the start of one
      if (key === 'g' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        sequenceRef.current.buffer = [key];
        sequenceRef.current.timeout = setTimeout(clearSequence, SEQUENCE_TIMEOUT);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [clearSequence, isHelpOpen]);

  return {
    registerShortcut,
    getRegisteredShortcuts,
    isHelpOpen,
    setIsHelpOpen,
  };
}

// Context for app-wide keyboard shortcuts
interface KeyboardContextValue {
  registerShortcut: (key: ShortcutKey, callback: () => void, description: string) => () => void;
  getRegisteredShortcuts: () => { key: string; description: string }[];
  isHelpOpen: boolean;
  setIsHelpOpen: (open: boolean) => void;
}

const KeyboardContext = createContext<KeyboardContextValue | null>(null);

export function KeyboardProvider({ children }: { children: ReactNode }) {
  const keyboard = useKeyboardShortcuts();

  return <KeyboardContext.Provider value={keyboard}>{children}</KeyboardContext.Provider>;
}

export function useKeyboard() {
  const context = useContext(KeyboardContext);
  if (!context) {
    throw new Error('useKeyboard must be used within a KeyboardProvider');
  }
  return context;
}
