'use client';

/**
 * @fileoverview Application Providers
 *
 * Consolidated provider architecture for the application.
 * Organized into logical groups with optimized render hierarchy.
 *
 * Provider Architecture:
 * 1. Infrastructure (ErrorBoundary, Session, QueryClient)
 * 2. UI Foundation (Theme, i18n)
 * 3. Application Features (Keyboard, Realtime, QuickSearch)
 * 4. PWA Features (ServiceWorker)
 *
 * @module components/providers
 */

import { ThemeProvider } from 'next-themes';
import { SessionProvider } from 'next-auth/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect, type ReactNode } from 'react';
import { RealtimeProvider, useRealtimeConnection } from '@/lib/realtime';
import { KeyboardProvider } from '@/lib/keyboard';
import { NotificationBridge } from '@/components/notifications';
import { ShortcutsHelp, GlobalShortcuts } from '@/components/keyboard';
import { QuickSearchProvider } from '@/components/quick-search';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker-registration';
import { I18nProvider } from '@/lib/i18n';
import { ThemePersistenceProvider } from '@/lib/theme';
import { PageErrorBoundary } from '@/components/error-boundary';
import { initWebVitalsReporting } from '@/lib/vitals/web-vitals';

// ============================================================================
// QUERY CLIENT CONFIGURATION
// ============================================================================

/**
 * TanStack Query default configuration
 * @constant
 */
const QUERY_CLIENT_CONFIG = {
  defaultOptions: {
    queries: {
      /** Data is fresh for 1 minute before background refetch */
      staleTime: 60 * 1000,
      /** Disable refetch on window focus for better UX */
      refetchOnWindowFocus: false,
      /** Retry failed requests up to 3 times */
      retry: 3,
      /** Exponential backoff for retries */
      retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
    mutations: {
      /** Retry mutations once on network error */
      retry: 1,
    },
  },
} as const;

// ============================================================================
// REALTIME AUTO-CONNECT
// ============================================================================

/**
 * Auto-connects to realtime service and bridges notifications
 *
 * @param props.children - Child components to render
 * @internal
 */
function RealtimeAutoConnect({ children }: { children: ReactNode }) {
  const { connect } = useRealtimeConnection();

  useEffect(() => {
    // Auto-connect when component mounts
    connect();
  }, [connect]);

  return (
    <>
      <NotificationBridge />
      {children}
    </>
  );
}

// ============================================================================
// KEYBOARD FEATURES
// ============================================================================

/**
 * Keyboard shortcuts and help modal
 *
 * @internal
 */
function KeyboardFeatures({ children }: { children: ReactNode }) {
  return (
    <>
      <GlobalShortcuts />
      <ShortcutsHelp />
      {children}
    </>
  );
}

// ============================================================================
// INFRASTRUCTURE PROVIDERS
// ============================================================================

/**
 * Core infrastructure providers: Error boundary, Auth, Query client
 *
 * @param props.children - Child components
 * @param props.queryClient - TanStack Query client instance
 * @internal
 */
function InfrastructureProviders({
  children,
  queryClient,
}: {
  children: ReactNode;
  queryClient: QueryClient;
}) {
  return (
    <PageErrorBoundary>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </SessionProvider>
    </PageErrorBoundary>
  );
}

// ============================================================================
// UI FOUNDATION PROVIDERS
// ============================================================================

/**
 * UI foundation providers: Theme, i18n
 *
 * Theme persistence layer syncs user preferences to both localStorage
 * (for immediate access) and database (for cross-device sync).
 *
 * @param props.children - Child components
 * @internal
 */
function UIFoundationProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemePersistenceProvider>
        <I18nProvider>{children}</I18nProvider>
      </ThemePersistenceProvider>
    </ThemeProvider>
  );
}

// ============================================================================
// APPLICATION FEATURE PROVIDERS
// ============================================================================

/**
 * Application feature providers: Keyboard, Realtime, QuickSearch
 *
 * @param props.children - Child components
 * @internal
 */
function ApplicationFeatureProviders({ children }: { children: ReactNode }) {
  return (
    <KeyboardProvider>
      <RealtimeProvider>
        <RealtimeAutoConnect>
          <QuickSearchProvider>
            <KeyboardFeatures>{children}</KeyboardFeatures>
          </QuickSearchProvider>
        </RealtimeAutoConnect>
      </RealtimeProvider>
    </KeyboardProvider>
  );
}

// ============================================================================
// PWA FEATURES
// ============================================================================

/**
 * PWA features: Service worker registration, Web Vitals
 *
 * @param props.children - Child components
 * @internal
 */
function PWAFeatures({ children }: { children: ReactNode }) {
  // Initialize Web Vitals reporting on mount
  useEffect(() => {
    initWebVitalsReporting();
  }, []);

  return (
    <>
      <ServiceWorkerRegistration />
      {children}
    </>
  );
}

// ============================================================================
// MAIN PROVIDERS COMPONENT
// ============================================================================

/**
 * Props for the main Providers component
 */
interface ProvidersProps {
  /** Child components to wrap with providers */
  children: ReactNode;
}

/**
 * Root application providers component
 *
 * Provides a consolidated, optimized provider hierarchy for the application.
 * Grouped by concern for better maintainability and performance.
 *
 * @param props - Provider component props
 * @returns Provider-wrapped children
 *
 * @example
 * ```tsx
 * // In layout.tsx
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <Providers>{children}</Providers>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function Providers({ children }: ProvidersProps) {
  // Create stable QueryClient instance
  const [queryClient] = useState(() => new QueryClient(QUERY_CLIENT_CONFIG));

  return (
    <InfrastructureProviders queryClient={queryClient}>
      <UIFoundationProviders>
        <ApplicationFeatureProviders>
          <PWAFeatures>{children}</PWAFeatures>
        </ApplicationFeatureProviders>
      </UIFoundationProviders>
    </InfrastructureProviders>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export type { ProvidersProps };
