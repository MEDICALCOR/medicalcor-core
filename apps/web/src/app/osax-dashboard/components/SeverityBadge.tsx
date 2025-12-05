/**
 * Severity Badge Component
 * Extracted to reduce OsaxCaseTable complexity
 */

interface SeverityBadgeProps {
  severity: string;
}

export function SeverityBadge({ severity }: SeverityBadgeProps) {
  const severityConfig: Record<string, { label: string; className: string }> = {
    NONE: { label: 'None', className: 'bg-green-100 text-green-700' },
    MILD: { label: 'Mild', className: 'bg-yellow-100 text-yellow-700' },
    MODERATE: { label: 'Moderate', className: 'bg-orange-100 text-orange-700' },
    SEVERE: { label: 'Severe', className: 'bg-red-100 text-red-700' },
  };

  const config = severityConfig[severity] ?? { label: severity, className: 'bg-gray-100 text-gray-700' };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}


