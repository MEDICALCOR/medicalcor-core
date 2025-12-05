'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useKeyboard } from '@/lib/keyboard';

/**
 * Global keyboard shortcuts that work across the entire app
 */
export function GlobalShortcuts() {
  const router = useRouter();
  const { registerShortcut } = useKeyboard();

  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Navigation shortcuts (g + key sequence)
    // These use a simple keydown listener for sequences
    const handleNavigation = (e: KeyboardEvent) => {
      // Only handle if not in input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }

      // Track 'g' prefix for vim-style navigation
      if (e.key === 'g' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const handleSecondKey = (e2: KeyboardEvent) => {
          document.removeEventListener('keydown', handleSecondKey);

          switch (e2.key.toLowerCase()) {
            case 'd':
              e2.preventDefault();
              router.push('/');
              break;
            case 't':
              e2.preventDefault();
              router.push('/triage');
              break;
            case 'c':
              e2.preventDefault();
              router.push('/calendar');
              break;
            case 's':
              e2.preventDefault();
              router.push('/settings');
              break;
            case 'p':
              e2.preventDefault();
              router.push('/patients');
              break;
            case 'm':
              e2.preventDefault();
              router.push('/messages');
              break;
            default:
              // No action for other keys
              break;
          }
        };

        // Wait for the second key
        setTimeout(() => {
          document.removeEventListener('keydown', handleSecondKey);
        }, 500);

        document.addEventListener('keydown', handleSecondKey);
      }

      // Single key shortcuts
      switch (e.key.toLowerCase()) {
        case 'r':
          if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            // Dispatch custom event for refresh
            window.dispatchEvent(new CustomEvent('app:refresh'));
          }
          break;
        case 'n':
          if (!e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            // Dispatch custom event for new lead
            window.dispatchEvent(new CustomEvent('app:new-lead'));
          }
          break;
        case 'k':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Dispatch custom event for quick search
            window.dispatchEvent(new CustomEvent('app:quick-search'));
          }
          break;
        default:
          // No action for other keys
          break;
      }
    };

    document.addEventListener('keydown', handleNavigation);

    return () => {
      document.removeEventListener('keydown', handleNavigation);
      unsubscribers.forEach((unsub) => unsub());
    };
  }, [router, registerShortcut]);

  return null;
}
