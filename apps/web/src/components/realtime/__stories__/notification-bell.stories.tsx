import type { Meta, StoryObj } from '@storybook/react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface Urgency {
  id: string;
  phone: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
  waitingTime: number;
  read?: boolean;
}

interface NotificationBellDemoProps {
  urgencies: Urgency[];
  initialOpen?: boolean;
}

function NotificationBellDemo({ urgencies, initialOpen = false }: NotificationBellDemoProps) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  const unreadCount = urgencies.filter((u) => !u.read && !readIds.has(u.id)).length;

  const getPriorityColor = (priority: 'critical' | 'high' | 'medium') => {
    switch (priority) {
      case 'critical':
        return 'bg-red-500';
      case 'high':
        return 'bg-orange-500';
      case 'medium':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const formatWaitTime = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  const markRead = (id: string) => {
    setReadIds((prev) => new Set(prev).add(id));
  };

  const markAllRead = () => {
    setReadIds(new Set(urgencies.map((u) => u.id)));
  };

  const isRead = (id: string) => readIds.has(id);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        className="relative"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <Badge
              variant="destructive"
              className="relative h-5 w-5 p-0 text-xs flex items-center justify-center rounded-full"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          </span>
        )}
      </Button>

      {isOpen && (
        <Card className="absolute right-0 top-full mt-2 w-80 z-50 shadow-lg">
          <div className="flex items-center justify-between p-3 border-b">
            <h3 className="font-semibold">Urgencies</h3>
            {urgencies.length > 0 && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={markAllRead}>
                Mark all read
              </Button>
            )}
          </div>
          <CardContent className="p-0 max-h-80 overflow-y-auto">
            {urgencies.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">No new urgencies</div>
            ) : (
              <ul className="divide-y">
                {urgencies.map((urgency) => (
                  <li key={urgency.id}>
                    <button
                      type="button"
                      className={cn(
                        'w-full p-3 hover:bg-muted/50 cursor-pointer transition-colors text-left',
                        !isRead(urgency.id) && 'bg-primary/5'
                      )}
                      onClick={() => markRead(urgency.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={cn(
                            'h-2 w-2 rounded-full mt-2 shrink-0',
                            getPriorityColor(urgency.priority)
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm truncate">{urgency.phone}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {formatWaitTime(urgency.waitingTime)} waiting
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{urgency.reason}</p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const sampleUrgencies: Urgency[] = [
  {
    id: '1',
    phone: '+40 721 234 567',
    reason: 'Severe tooth pain - emergency',
    priority: 'critical',
    waitingTime: 5,
  },
  {
    id: '2',
    phone: '+40 722 345 678',
    reason: 'Follow-up overdue by 2 weeks',
    priority: 'high',
    waitingTime: 15,
  },
  {
    id: '3',
    phone: '+40 723 456 789',
    reason: 'Awaiting treatment plan approval',
    priority: 'medium',
    waitingTime: 45,
  },
  {
    id: '4',
    phone: '+40 724 567 890',
    reason: 'Insurance verification pending',
    priority: 'medium',
    waitingTime: 120,
  },
];

const meta = {
  title: 'Realtime/NotificationBell',
  component: NotificationBellDemo,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
  decorators: [
    (Story) => (
      <div className="h-[400px] flex items-start justify-center pt-4">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NotificationBellDemo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    urgencies: sampleUrgencies,
  },
};

export const Open: Story = {
  args: {
    urgencies: sampleUrgencies,
    initialOpen: true,
  },
};

export const NoNotifications: Story = {
  args: {
    urgencies: [],
  },
};

export const SingleNotification: Story = {
  args: {
    urgencies: [sampleUrgencies[0]],
  },
};

export const ManyNotifications: Story = {
  args: {
    urgencies: [
      ...sampleUrgencies,
      {
        id: '5',
        phone: '+40 725 678 901',
        reason: 'Callback requested',
        priority: 'high',
        waitingTime: 30,
      },
      {
        id: '6',
        phone: '+40 726 789 012',
        reason: 'Payment reminder',
        priority: 'medium',
        waitingTime: 180,
      },
      {
        id: '7',
        phone: '+40 727 890 123',
        reason: 'Appointment confirmation needed',
        priority: 'high',
        waitingTime: 60,
      },
      {
        id: '8',
        phone: '+40 728 901 234',
        reason: 'Lab results ready',
        priority: 'medium',
        waitingTime: 240,
      },
      {
        id: '9',
        phone: '+40 729 012 345',
        reason: 'Prescription renewal',
        priority: 'medium',
        waitingTime: 90,
      },
      {
        id: '10',
        phone: '+40 730 123 456',
        reason: 'Emergency consultation',
        priority: 'critical',
        waitingTime: 3,
      },
    ],
    initialOpen: true,
  },
};

export const CriticalOnly: Story = {
  args: {
    urgencies: [
      {
        id: '1',
        phone: '+40 721 234 567',
        reason: 'Severe pain - needs immediate attention',
        priority: 'critical',
        waitingTime: 2,
      },
      {
        id: '2',
        phone: '+40 722 345 678',
        reason: 'Post-surgery complication',
        priority: 'critical',
        waitingTime: 8,
      },
    ],
    initialOpen: true,
  },
};

export const AllPriorities: Story = {
  args: { urgencies: [] },
  render: () => (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Priority Levels</h3>
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-2 border rounded-lg">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span className="text-sm">Critical - Immediate action required</span>
        </div>
        <div className="flex items-center gap-3 p-2 border rounded-lg">
          <div className="h-3 w-3 rounded-full bg-orange-500" />
          <span className="text-sm">High - Action needed soon</span>
        </div>
        <div className="flex items-center gap-3 p-2 border rounded-lg">
          <div className="h-3 w-3 rounded-full bg-yellow-500" />
          <span className="text-sm">Medium - Standard follow-up</span>
        </div>
      </div>
    </div>
  ),
};

export const InHeader: Story = {
  args: { urgencies: [] },
  render: () => (
    <div className="flex items-center justify-between bg-background border rounded-lg px-4 py-2 w-[500px]">
      <div className="flex items-center gap-2">
        <span className="font-medium">MedicalCor Dashboard</span>
      </div>
      <div className="flex items-center gap-2">
        <NotificationBellDemo urgencies={sampleUrgencies.slice(0, 2)} />
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
          IP
        </div>
      </div>
    </div>
  ),
};
