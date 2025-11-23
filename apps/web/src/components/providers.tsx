'use client';

import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { RealtimeProvider, useRealtimeConnection } from '@/lib/realtime';
import { KeyboardProvider } from '@/lib/keyboard';
import { NotificationBridge } from '@/components/notifications';
import { ShortcutsHelp, GlobalShortcuts } from '@/components/keyboard';
import { QuickSearchProvider } from '@/components/quick-search';
import { ServiceWorkerRegistration } from '@/components/pwa/service-worker-registration';
import { I18nProvider } from '@/lib/i18n';

// Auto-connect and notification bridge
function RealtimeAutoConnect({ children }: { children: React.ReactNode }) {
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

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <I18nProvider>
          <KeyboardProvider>
            <RealtimeProvider>
              <RealtimeAutoConnect>
                <QuickSearchProvider>
                  <GlobalShortcuts />
                  <ShortcutsHelp />
                  <ServiceWorkerRegistration />
                  {children}
                </QuickSearchProvider>
              </RealtimeAutoConnect>
            </RealtimeProvider>
          </KeyboardProvider>
        </I18nProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
