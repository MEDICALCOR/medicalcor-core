/**
 * Table Header Component for OSAX Cases
 * Extracted to reduce OsaxCaseTable complexity
 */

import type { OsaxCaseListItem } from '../actions/getOsaxCases';

interface SortableHeaderProps {
  label: string;
  field: keyof OsaxCaseListItem;
  currentSort: keyof OsaxCaseListItem;
  direction: 'asc' | 'desc';
  onSort: (field: keyof OsaxCaseListItem) => void;
}

export function SortableHeader({ label, field, currentSort, direction, onSort }: SortableHeaderProps) {
  const isActive = currentSort === field;

  return (
    <th
      className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{label}</span>
        {isActive && (
          <span className="text-gray-700">{direction === 'asc' ? '↑' : '↓'}</span>
        )}
      </div>
    </th>
  );
}


