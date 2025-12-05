'use client';

import { useRealtimeConnection } from '@/lib/realtime';
import { cn } from '@/lib/utils';

export function ConnectionStatus() {
  const { connectionState, connect } = useRealtimeConnection();

  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      {/* ACCESSIBILITY FIX: Added role and aria-label for status indicator */}
      <div
        className={cn(
          'h-2 w-2 rounded-full transition-colors',
          connectionState.status === 'connected' && 'bg-green-500',
          connectionState.status === 'connecting' && 'bg-yellow-500 animate-pulse',
          connectionState.status === 'disconnected' && 'bg-gray-400',
          connectionState.status === 'error' && 'bg-red-500'
        )}
        aria-hidden="true"
      />
      <span className="text-xs text-muted-foreground">
        {connectionState.status === 'connected' && 'Live'}
        {connectionState.status === 'connecting' && 'Connecting...'}
        {/* ACCESSIBILITY FIX: Added aria-labels for action buttons */}
        {connectionState.status === 'disconnected' && (
          <button
            onClick={connect}
            className="hover:text-foreground underline"
            aria-label="Reconnect to server"
          >
            Reconnect
          </button>
        )}
        {connectionState.status === 'error' && (
          <button
            onClick={connect}
            className="text-red-500 hover:text-red-600 underline"
            aria-label="Retry connection"
          >
            Retry
          </button>
        )}
      </span>
      {connectionState.reconnectAttempts > 0 && connectionState.status !== 'connected' && (
        <span className="text-xs text-muted-foreground">
          (attempt {connectionState.reconnectAttempts})
        </span>
      )}
    </div>
  );
}
