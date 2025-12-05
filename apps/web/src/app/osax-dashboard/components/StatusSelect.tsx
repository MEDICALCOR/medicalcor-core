/**
 * Status Select Component
 * Extracted to reduce OsaxCaseTable complexity
 */

const STATUS_OPTIONS = [
  { value: 'PENDING_STUDY', label: 'Pending Study' },
  { value: 'STUDY_COMPLETED', label: 'Study Done' },
  { value: 'SCORED', label: 'Scored' },
  { value: 'REVIEWED', label: 'Reviewed' },
  { value: 'TREATMENT_PLANNED', label: 'Treatment Planned' },
  { value: 'IN_TREATMENT', label: 'In Treatment' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

interface StatusSelectProps {
  currentStatus: string;
  onStatusChange: (newStatus: string) => void;
  disabled: boolean;
}

export function StatusSelect({ currentStatus, onStatusChange, disabled }: StatusSelectProps) {
  const statusConfig: Record<string, { label: string; className: string }> = {
    PENDING_STUDY: { label: 'Pending Study', className: 'bg-gray-100 text-gray-800' },
    STUDY_COMPLETED: { label: 'Study Done', className: 'bg-blue-100 text-blue-800' },
    SCORED: { label: 'Scored', className: 'bg-yellow-100 text-yellow-800' },
    REVIEWED: { label: 'Reviewed', className: 'bg-indigo-100 text-indigo-800' },
    TREATMENT_PLANNED: { label: 'Treatment Planned', className: 'bg-purple-100 text-purple-800' },
    IN_TREATMENT: { label: 'In Treatment', className: 'bg-green-100 text-green-800' },
    FOLLOW_UP: { label: 'Follow-up', className: 'bg-cyan-100 text-cyan-800' },
    CLOSED: { label: 'Closed', className: 'bg-gray-100 text-gray-800' },
    CANCELLED: { label: 'Cancelled', className: 'bg-red-100 text-red-800' },
  };

  const config = statusConfig[currentStatus] ?? {
    label: currentStatus,
    className: 'bg-gray-100 text-gray-800',
  };

  return (
    <select
      value={currentStatus}
      onChange={(e) => {
        const newStatus = e.target.value;
        if (newStatus !== currentStatus) {
          onStatusChange(newStatus);
        }
      }}
      disabled={disabled}
      className={`rounded-full px-2 py-1 text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 ${config.className} ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'
      }`}
      title="Click to change status"
    >
      {STATUS_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}


