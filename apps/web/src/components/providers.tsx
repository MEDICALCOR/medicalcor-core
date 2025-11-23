'use client';

import { ThemeProvider } from 'next-themes';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { RealtimeProvider, useRealtimeConnection } from '@/lib/realtime';

// Auto-connect component
function RealtimeAutoConnect({ children }: { children: React.ReactNode }) {
  const { connect } = useRealtimeConnection();

  useEffect(() => {
    // Auto-connect when component mounts
    connect();
  }, [connect]);

  return <>{children}</>;
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
        <RealtimeProvider>
          <RealtimeAutoConnect>{children}</RealtimeAutoConnect>
        </RealtimeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
