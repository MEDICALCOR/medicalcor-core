/**
 * Priority Badge Component
 * Extracted to reduce OsaxCaseTable complexity
 */

interface PriorityBadgeProps {
  priority: string;
}

export function PriorityBadge({ priority }: PriorityBadgeProps) {
  const priorityConfig: Record<string, { label: string; className: string }> = {
    LOW: { label: 'Low', className: 'bg-gray-100 text-gray-600' },
    NORMAL: { label: 'Normal', className: 'bg-blue-100 text-blue-600' },
    HIGH: { label: 'High', className: 'bg-orange-100 text-orange-600' },
    URGENT: { label: 'Urgent', className: 'bg-red-100 text-red-600' },
  };

  const config = priorityConfig[priority] ?? { label: priority, className: 'bg-gray-100 text-gray-600' };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}


