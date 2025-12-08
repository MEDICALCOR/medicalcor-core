/**
 * Utility functions for Queue Management Dashboard
 *
 * These are client-side helper functions for formatting and display.
 * Separated from server actions to comply with Next.js requirements.
 */

/**
 * Get breach type label for display
 */
export function getBreachTypeLabel(breachType: string): string {
  switch (breachType) {
    case 'wait_time_exceeded':
      return 'Wait Time Exceeded';
    case 'queue_size_exceeded':
      return 'Queue Size Exceeded';
    case 'abandon_rate_exceeded':
      return 'Abandon Rate High';
    case 'agent_availability_low':
      return 'Low Agent Availability';
    case 'service_level_missed':
      return 'Service Level Missed';
    default:
      return breachType;
  }
}

/**
 * Get severity color class for Tailwind
 */
export function getSeverityColorClass(severity: 'ok' | 'warning' | 'critical'): string {
  switch (severity) {
    case 'ok':
      return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    case 'warning':
      return 'text-amber-600 bg-amber-50 border-amber-200';
    case 'critical':
      return 'text-red-600 bg-red-50 border-red-200';
    default:
      return 'text-muted-foreground bg-muted border-muted';
  }
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
