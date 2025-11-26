'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Focus Management Hook for Accessibility
 *
 * Provides keyboard navigation through lists and grids.
 * Essential for medical apps where doctors need to navigate patient lists quickly.
 *
 * Features:
 * - Arrow key navigation (up/down/left/right)
 * - Home/End for jumping to first/last item
 * - Enter/Space for selection
 * - Focus trapping for modals
 * - Screen reader announcements
 */

export interface FocusableItem {
  id: string;
  element?: HTMLElement | null;
  disabled?: boolean;
}

export interface UseFocusManagementOptions {
  /** Items in the focusable list */
  items: FocusableItem[];

  /** Currently focused item ID */
  focusedId?: string | null;

  /** Callback when focus changes */
  onFocusChange?: (id: string | null) => void;

  /** Callback when item is selected (Enter/Space) */
  onSelect?: (id: string) => void;

  /** Enable horizontal navigation (left/right arrows) */
  horizontal?: boolean;

  /** Enable vertical navigation (up/down arrows) */
  vertical?: boolean;

  /** Wrap around when reaching end */
  wrap?: boolean;

  /** Enable type-ahead search */
  typeAhead?: boolean;

  /** Get label for type-ahead search */
  getItemLabel?: (id: string) => string;

  /** Ref to container element */
  containerRef?: React.RefObject<HTMLElement>;
}

export function useFocusManagement(options: UseFocusManagementOptions) {
  const {
    items,
    focusedId: controlledFocusedId,
    onFocusChange,
    onSelect,
    horizontal = false,
    vertical = true,
    wrap = true,
    typeAhead = false,
    getItemLabel,
    containerRef,
  } = options;

  const [internalFocusedId, setInternalFocusedId] = useState<string | null>(null);
  const typeAheadBufferRef = useRef<string>('');
  const typeAheadTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const focusedId = controlledFocusedId ?? internalFocusedId;

  const enabledItems = items.filter((item) => !item.disabled);

  const setFocusedId = useCallback(
    (id: string | null) => {
      setInternalFocusedId(id);
      onFocusChange?.(id);
    },
    [onFocusChange]
  );

  const focusItem = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      if (item?.element) {
        item.element.focus();
        setFocusedId(id);
      }
    },
    [items, setFocusedId]
  );

  const getCurrentIndex = useCallback(() => {
    if (!focusedId) return -1;
    return enabledItems.findIndex((item) => item.id === focusedId);
  }, [focusedId, enabledItems]);

  const focusNext = useCallback(() => {
    const currentIndex = getCurrentIndex();
    let nextIndex = currentIndex + 1;

    if (nextIndex >= enabledItems.length) {
      nextIndex = wrap ? 0 : enabledItems.length - 1;
    }

    const nextItem = enabledItems[nextIndex];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive check for array bounds
    if (nextItem) {
      focusItem(nextItem.id);
    }
  }, [getCurrentIndex, enabledItems, wrap, focusItem]);

  const focusPrevious = useCallback(() => {
    const currentIndex = getCurrentIndex();
    let prevIndex = currentIndex - 1;

    if (prevIndex < 0) {
      prevIndex = wrap ? enabledItems.length - 1 : 0;
    }

    const prevItem = enabledItems[prevIndex];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive check for array bounds
    if (prevItem) {
      focusItem(prevItem.id);
    }
  }, [getCurrentIndex, enabledItems, wrap, focusItem]);

  const focusFirst = useCallback(() => {
    const firstItem = enabledItems[0];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive check for array bounds
    if (firstItem) {
      focusItem(firstItem.id);
    }
  }, [enabledItems, focusItem]);

  const focusLast = useCallback(() => {
    const lastItem = enabledItems[enabledItems.length - 1];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive check for array bounds
    if (lastItem) {
      focusItem(lastItem.id);
    }
  }, [enabledItems, focusItem]);

  const handleTypeAhead = useCallback(
    (char: string) => {
      if (!typeAhead || !getItemLabel) return;

      // Clear previous timeout
      if (typeAheadTimeoutRef.current) {
        clearTimeout(typeAheadTimeoutRef.current);
      }

      // Add character to buffer
      typeAheadBufferRef.current += char.toLowerCase();

      // Find matching item
      const searchString = typeAheadBufferRef.current;
      const matchingItem = enabledItems.find((item) =>
        getItemLabel(item.id).toLowerCase().startsWith(searchString)
      );

      if (matchingItem) {
        focusItem(matchingItem.id);
      }

      // Clear buffer after 500ms
      typeAheadTimeoutRef.current = setTimeout(() => {
        typeAheadBufferRef.current = '';
      }, 500);
    },
    [typeAhead, getItemLabel, enabledItems, focusItem]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Only handle if container is focused or contains focus
      if (containerRef?.current && !containerRef.current.contains(document.activeElement)) {
        return;
      }

      let handled = false;

      switch (event.key) {
        case 'ArrowDown':
          if (vertical) {
            focusNext();
            handled = true;
          }
          break;

        case 'ArrowUp':
          if (vertical) {
            focusPrevious();
            handled = true;
          }
          break;

        case 'ArrowRight':
          if (horizontal) {
            focusNext();
            handled = true;
          }
          break;

        case 'ArrowLeft':
          if (horizontal) {
            focusPrevious();
            handled = true;
          }
          break;

        case 'Home':
          focusFirst();
          handled = true;
          break;

        case 'End':
          focusLast();
          handled = true;
          break;

        case 'Enter':
        case ' ':
          if (focusedId) {
            onSelect?.(focusedId);
            handled = true;
          }
          break;

        default:
          // Type-ahead search for single printable characters
          if (typeAhead && event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
            handleTypeAhead(event.key);
            handled = true;
          }
          break;
      }

      if (handled) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    [
      containerRef,
      vertical,
      horizontal,
      focusNext,
      focusPrevious,
      focusFirst,
      focusLast,
      focusedId,
      onSelect,
      typeAhead,
      handleTypeAhead,
    ]
  );

  useEffect(() => {
    const container = containerRef?.current ?? document;
    container.addEventListener('keydown', handleKeyDown as EventListener);
    return () => container.removeEventListener('keydown', handleKeyDown as EventListener);
  }, [containerRef, handleKeyDown]);

  // Cleanup type-ahead timeout
  useEffect(() => {
    return () => {
      if (typeAheadTimeoutRef.current) {
        clearTimeout(typeAheadTimeoutRef.current);
      }
    };
  }, []);

  return {
    focusedId,
    setFocusedId,
    focusItem,
    focusNext,
    focusPrevious,
    focusFirst,
    focusLast,
    // Helper props for list items
    getItemProps: (id: string) => ({
      tabIndex: focusedId === id ? 0 : -1,
      'aria-selected': focusedId === id,
      onFocus: () => setFocusedId(id),
      onClick: () => {
        setFocusedId(id);
        onSelect?.(id);
      },
    }),
  };
}

/**
 * Focus Trap Hook for Modals/Dialogs
 *
 * Keeps focus within a container for accessibility.
 * Required for medical app modals to prevent users from
 * accidentally navigating away.
 */
export function useFocusTrap(containerRef: React.RefObject<HTMLElement>, isActive = true) {
  const previousActiveElementRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive || !containerRef.current) return;

    // Save currently focused element
    previousActiveElementRef.current = document.activeElement as HTMLElement;

    // Focus first focusable element in container
    const focusableElements = getFocusableElements(containerRef.current);
    if (focusableElements.length > 0) {
      focusableElements[0]?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusableElements = getFocusableElements(containerRef.current);
      if (focusableElements.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion -- we checked length > 0 above
      const firstElement = focusableElements[0]!;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion -- we checked length > 0 above
      const lastElement = focusableElements[focusableElements.length - 1]!;

      if (event.shiftKey) {
        // Shift+Tab: if on first element, go to last
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: if on last element, go to first
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previous element
      previousActiveElementRef.current?.focus();
    };
  }, [containerRef, isActive]);
}

/**
 * Get all focusable elements within a container
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const focusableSelectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));
}

/**
 * Skip Link Hook
 *
 * Creates accessible skip links for keyboard users.
 * Allows doctors to skip navigation and go directly to main content.
 */
export function useSkipLinks(links: { id: string; label: string; targetId: string }[]) {
  const handleSkip = useCallback((targetId: string) => {
    const target = document.getElementById(targetId);
    if (target) {
      target.focus();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return {
    links,
    handleSkip,
    SkipLinkProps: (link: { targetId: string }) => ({
      href: `#${link.targetId}`,
      onClick: (e: React.MouseEvent) => {
        e.preventDefault();
        handleSkip(link.targetId);
      },
      className:
        'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-primary focus:text-primary-foreground focus:px-4 focus:py-2 focus:rounded',
    }),
  };
}

/**
 * Live Region Hook for Screen Reader Announcements
 *
 * Announces dynamic changes to screen readers.
 * Critical for medical apps where doctors need to be notified
 * of important status changes (new urgency, patient update, etc.)
 */
export function useLiveAnnouncer() {
  const announcerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create live region element if it doesn't exist
    let announcer = document.getElementById('live-announcer');
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.id = 'live-announcer';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      announcer.className = 'sr-only';
      document.body.appendChild(announcer);
    }
    announcerRef.current = announcer as HTMLDivElement;

    return () => {
      // Don't remove on unmount as other components might use it
    };
  }, []);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (!announcerRef.current) return;

    // Update aria-live based on priority
    announcerRef.current.setAttribute('aria-live', priority);

    // Clear and set message (triggers announcement)
    announcerRef.current.textContent = '';
    // Use requestAnimationFrame to ensure DOM update is processed
    requestAnimationFrame(() => {
      if (announcerRef.current) {
        announcerRef.current.textContent = message;
      }
    });
  }, []);

  const announcePolite = useCallback((message: string) => announce(message, 'polite'), [announce]);

  const announceAssertive = useCallback(
    (message: string) => announce(message, 'assertive'),
    [announce]
  );

  return {
    announce,
    announcePolite,
    announceAssertive,
  };
}
