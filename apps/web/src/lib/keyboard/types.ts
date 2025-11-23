/**
 * Keyboard shortcuts system types
 */

export interface KeyboardShortcut {
  key: string;
  modifiers?: ('ctrl' | 'alt' | 'shift' | 'meta')[];
  description: string;
  action: () => void;
  scope?: 'global' | 'page';
}

export interface KeyboardShortcutGroup {
  name: string;
  shortcuts: KeyboardShortcut[];
}

export type ShortcutKey = string; // e.g., "ctrl+k", "g+d", "?"

export interface ParsedShortcut {
  key: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

export function parseShortcutKey(shortcut: ShortcutKey): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const key = parts[parts.length - 1];

  return {
    key,
    ctrl: parts.includes('ctrl') || parts.includes('control'),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
    meta: parts.includes('meta') || parts.includes('cmd'),
  };
}

export function matchesShortcut(event: KeyboardEvent, shortcut: ParsedShortcut): boolean {
  const key = event.key.toLowerCase();

  return (
    key === shortcut.key &&
    event.ctrlKey === shortcut.ctrl &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift &&
    event.metaKey === shortcut.meta
  );
}

export function formatShortcut(shortcut: ShortcutKey): string {
  const isMac = typeof navigator !== 'undefined' && navigator.platform.includes('Mac');

  return shortcut
    .replace(/ctrl/gi, isMac ? '⌃' : 'Ctrl')
    .replace(/alt/gi, isMac ? '⌥' : 'Alt')
    .replace(/shift/gi, isMac ? '⇧' : 'Shift')
    .replace(/meta|cmd/gi, isMac ? '⌘' : 'Win')
    .replace(/\+/g, isMac ? '' : '+')
    .replace(/escape/gi, 'Esc')
    .toUpperCase();
}
