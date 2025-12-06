'use client';

import {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import { useTheme as useNextTheme } from 'next-themes';
import { useSession } from 'next-auth/react';
import {
  getThemePreferenceAction,
  updateThemePreferenceAction,
  type ThemePreference,
} from '@/app/actions/preferences';

/**
 * Theme Persistence Provider
 *
 * Extends next-themes with database persistence for authenticated users.
 * - Unauthenticated users: localStorage only (handled by next-themes)
 * - Authenticated users: localStorage + database sync
 *
 * @module lib/theme
 */

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'medicalcor-theme';

// =============================================================================
// Types
// =============================================================================

interface ThemePersistenceContextType {
  /** Current theme value */
  theme: string | undefined;
  /** Set theme with persistence to localStorage and database */
  setTheme: (theme: ThemePreference) => void;
  /** Whether theme is being synced with server */
  isSyncing: boolean;
  /** Whether initial sync from server is complete */
  isInitialized: boolean;
}

// =============================================================================
// Context
// =============================================================================

const ThemePersistenceContext = createContext<ThemePersistenceContextType | null>(null);

// =============================================================================
// Provider Component
// =============================================================================

interface ThemePersistenceProviderProps {
  children: ReactNode;
}

/**
 * Theme Persistence Provider
 *
 * Wraps the application to provide theme persistence functionality.
 * Must be used inside ThemeProvider from next-themes.
 *
 * @example
 * ```tsx
 * <ThemeProvider>
 *   <ThemePersistenceProvider>
 *     {children}
 *   </ThemePersistenceProvider>
 * </ThemeProvider>
 * ```
 */
export function ThemePersistenceProvider({ children }: ThemePersistenceProviderProps) {
  const { theme, setTheme: setNextTheme } = useNextTheme();
  const { status } = useSession();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const hasSyncedFromServer = useRef(false);
  const lastSavedTheme = useRef<string | null>(null);

  // Sync theme from server when user logs in
  useEffect(() => {
    async function syncFromServer() {
      if (status !== 'authenticated' || hasSyncedFromServer.current) {
        return;
      }

      try {
        const serverTheme = await getThemePreferenceAction();
        hasSyncedFromServer.current = true;

        // Check if server has a non-system preference
        if (serverTheme !== 'system') {
          // Server preference takes precedence
          setNextTheme(serverTheme);
          localStorage.setItem(STORAGE_KEY, serverTheme);
          lastSavedTheme.current = serverTheme;
        } else {
          // No server preference, sync local preference to server
          const localTheme = localStorage.getItem(STORAGE_KEY);
          if (localTheme && (localTheme === 'light' || localTheme === 'dark')) {
            // Save local preference to server
            await updateThemePreferenceAction({ theme: localTheme });
            lastSavedTheme.current = localTheme;
          }
        }
      } catch {
        // Silently fail - localStorage preference will be used
      } finally {
        setIsInitialized(true);
      }
    }

    if (status === 'authenticated') {
      void syncFromServer();
    } else if (status === 'unauthenticated') {
      // Not authenticated, just use localStorage (handled by next-themes)
      setIsInitialized(true);
    }
  }, [status, setNextTheme]);

  // Custom setTheme that persists to both localStorage and database
  const setTheme = useCallback(
    async (newTheme: ThemePreference) => {
      // Immediately update UI via next-themes
      setNextTheme(newTheme);

      // Store in localStorage for immediate access on next load
      localStorage.setItem(STORAGE_KEY, newTheme);

      // Skip server sync if not authenticated or theme hasn't changed
      if (status !== 'authenticated' || lastSavedTheme.current === newTheme) {
        return;
      }

      // Sync to server
      setIsSyncing(true);
      try {
        await updateThemePreferenceAction({ theme: newTheme });
        lastSavedTheme.current = newTheme;
      } catch {
        // Silently fail - localStorage will preserve the preference
      } finally {
        setIsSyncing(false);
      }
    },
    [setNextTheme, status]
  );

  const contextValue: ThemePersistenceContextType = {
    theme,
    setTheme,
    isSyncing,
    isInitialized,
  };

  return (
    <ThemePersistenceContext.Provider value={contextValue}>
      {children}
    </ThemePersistenceContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================

/**
 * Hook to access theme persistence context
 *
 * Provides theme state and setter with automatic database persistence.
 *
 * @throws Error if used outside ThemePersistenceProvider
 *
 * @example
 * ```tsx
 * function ThemeToggle() {
 *   const { theme, setTheme, isSyncing } = useThemePersistence();
 *
 *   return (
 *     <button
 *       onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
 *       disabled={isSyncing}
 *     >
 *       {theme === 'dark' ? '🌙' : '☀️'}
 *     </button>
 *   );
 * }
 * ```
 */
export function useThemePersistence() {
  const context = useContext(ThemePersistenceContext);

  if (!context) {
    throw new Error('useThemePersistence must be used within a ThemePersistenceProvider');
  }

  return context;
}

// =============================================================================
// Exports
// =============================================================================

export type { ThemePersistenceContextType, ThemePreference };
