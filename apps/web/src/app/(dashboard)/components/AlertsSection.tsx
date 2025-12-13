/**
 * @fileoverview Alerts Section Server Component
 *
 * Displays actionable alerts for the dashboard.
 * Server component with real-time data.
 *
 * @module web/app/(dashboard)/components/AlertsSection
 */

type AlertSeverity = 'critical' | 'warning' | 'info';

interface Alert {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly severity: AlertSeverity;
  readonly timestamp: string;
  readonly actionUrl?: string;
}

async function fetchAlerts(): Promise<Alert[]> {
  // In production, fetch from API
  return [
    {
      id: '1',
      title: 'SLA Breach Risk',
      message: '3 HOT leads pending response for >5 minutes',
      severity: 'critical',
      timestamp: '2 min ago',
      actionUrl: '/leads?filter=hot&status=pending',
    },
    {
      id: '2',
      title: 'Queue Capacity',
      message: 'Voice queue at 85% capacity',
      severity: 'warning',
      timestamp: '15 min ago',
      actionUrl: '/supervisor/queues',
    },
    {
      id: '3',
      title: 'New OSAX Cases',
      message: '5 new cases scored as RED today',
      severity: 'warning',
      timestamp: '1 hour ago',
      actionUrl: '/osax/cases?risk=red',
    },
    {
      id: '4',
      title: 'System Health',
      message: 'All integrations operational',
      severity: 'info',
      timestamp: '30 min ago',
    },
  ];
}

function AlertCard({ alert }: { alert: Alert }) {
  const severityStyles: Record<AlertSeverity, string> = {
    critical: 'border-l-red-500 bg-red-50',
    warning: 'border-l-yellow-500 bg-yellow-50',
    info: 'border-l-blue-500 bg-blue-50',
  };

  const severityIcons: Record<AlertSeverity, string> = {
    critical: '🚨',
    warning: '⚠️',
    info: 'ℹ️',
  };

  return (
    <div className={`rounded-lg border-l-4 p-4 ${severityStyles[alert.severity]}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-2">
          <span>{severityIcons[alert.severity]}</span>
          <div>
            <h4 className="font-medium">{alert.title}</h4>
            <p className="text-sm text-muted-foreground">{alert.message}</p>
          </div>
        </div>
        <span className="text-xs text-muted-foreground">{alert.timestamp}</span>
      </div>
      {alert.actionUrl && (
        <a
          href={alert.actionUrl}
          className="mt-2 inline-block text-sm text-primary hover:underline"
        >
          View details →
        </a>
      )}
    </div>
  );
}

export async function AlertsSection() {
  const alerts = await fetchAlerts();

  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm">
      <h3 className="text-lg font-semibold mb-4">Active Alerts</h3>
      <div className="space-y-3">
        {alerts.map((alert) => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </div>
    </section>
  );
}

export function AlertsSectionSkeleton() {
  return (
    <section className="rounded-lg border bg-card p-6 shadow-sm animate-pulse">
      <div className="h-6 w-32 bg-gray-200 rounded mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 bg-gray-200 rounded" />
        ))}
      </div>
    </section>
  );
}
