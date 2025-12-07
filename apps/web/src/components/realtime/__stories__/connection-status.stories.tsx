import type { Meta, StoryObj } from '@storybook/react';
import { cn } from '@/lib/utils';

interface ConnectionStatusDemoProps {
  status: 'connected' | 'connecting' | 'disconnected' | 'error';
  reconnectAttempts?: number;
}

function ConnectionStatusDemo({ status, reconnectAttempts = 0 }: ConnectionStatusDemoProps) {
  return (
    <div className="flex items-center gap-2" role="status" aria-live="polite">
      <div
        className={cn(
          'h-2 w-2 rounded-full transition-colors',
          status === 'connected' && 'bg-green-500',
          status === 'connecting' && 'bg-yellow-500 animate-pulse',
          status === 'disconnected' && 'bg-gray-400',
          status === 'error' && 'bg-red-500'
        )}
        aria-hidden="true"
      />
      <span className="text-xs text-muted-foreground">
        {status === 'connected' && 'Live'}
        {status === 'connecting' && 'Connecting...'}
        {status === 'disconnected' && (
          <button className="hover:text-foreground underline">Reconnect</button>
        )}
        {status === 'error' && (
          <button className="text-red-500 hover:text-red-600 underline">Retry</button>
        )}
      </span>
      {reconnectAttempts > 0 && status !== 'connected' && (
        <span className="text-xs text-muted-foreground">(attempt {reconnectAttempts})</span>
      )}
    </div>
  );
}

const meta = {
  title: 'Realtime/ConnectionStatus',
  component: ConnectionStatusDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  argTypes: {
    status: {
      control: 'select',
      options: ['connected', 'connecting', 'disconnected', 'error'],
      description: 'Current connection status',
    },
    reconnectAttempts: {
      control: 'number',
      description: 'Number of reconnection attempts',
    },
  },
} satisfies Meta<typeof ConnectionStatusDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Connected: Story = {
  args: {
    status: 'connected',
  },
};

export const Connecting: Story = {
  args: {
    status: 'connecting',
  },
};

export const Disconnected: Story = {
  args: {
    status: 'disconnected',
  },
};

export const Error: Story = {
  args: {
    status: 'error',
  },
};

export const ReconnectingWithAttempts: Story = {
  args: {
    status: 'connecting',
    reconnectAttempts: 3,
  },
};

export const ErrorWithAttempts: Story = {
  args: {
    status: 'error',
    reconnectAttempts: 5,
  },
};

export const AllStates: Story = {
  args: { status: 'connected' },
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">Connected:</span>
        <ConnectionStatusDemo status="connected" />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">Connecting:</span>
        <ConnectionStatusDemo status="connecting" />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">Disconnected:</span>
        <ConnectionStatusDemo status="disconnected" />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">Error:</span>
        <ConnectionStatusDemo status="error" />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm w-24">Retrying:</span>
        <ConnectionStatusDemo status="connecting" reconnectAttempts={3} />
      </div>
    </div>
  ),
};

export const InHeader: Story = {
  args: { status: 'connected' },
  render: () => (
    <div className="flex items-center justify-between bg-background border rounded-lg px-4 py-2 w-[400px]">
      <div className="flex items-center gap-2">
        <span className="font-medium">Dashboard</span>
      </div>
      <ConnectionStatusDemo status="connected" />
    </div>
  ),
};
