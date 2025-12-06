'use client';

import { useKeyboard } from '@/lib/keyboard';
import { KeyboardShortcutsModal } from './keyboard-shortcuts-modal';

/**
 * Keyboard shortcuts help component
 *
 * Integrates with the KeyboardProvider to show/hide the shortcuts modal
 * when the user presses the '?' key.
 */
export function ShortcutsHelp() {
  const { isHelpOpen, setIsHelpOpen } = useKeyboard();

  return <KeyboardShortcutsModal open={isHelpOpen} onOpenChange={setIsHelpOpen} />;
}
