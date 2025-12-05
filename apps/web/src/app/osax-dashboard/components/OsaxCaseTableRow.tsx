/**
 * Table Row Component for OSAX Cases
 * Extracted to reduce OsaxCaseTable complexity
 */

import { StatusSelect } from './StatusSelect';
import { PriorityBadge } from './PriorityBadge';
import { SeverityBadge } from './SeverityBadge';
import { ActionButton } from './ActionButton';
import { formatDate, formatTreatmentType } from './tableUtils';
import type { OsaxCaseListItem } from '../actions/getOsaxCases';

interface CaseRowProps {
  osaxCase: OsaxCaseListItem;
  onStatusChange: (newStatus: string) => void;
  isUpdating: boolean;
}

export function CaseRow({ osaxCase, onStatusChange, isUpdating }: CaseRowProps) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="whitespace-nowrap px-6 py-4">
        <a
          href={`/osax-dashboard/${osaxCase.id}`}
          className="font-medium text-blue-600 hover:text-blue-800"
        >
          {osaxCase.caseNumber}
        </a>
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <StatusSelect
          currentStatus={osaxCase.status}
          onStatusChange={onStatusChange}
          disabled={isUpdating}
        />
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        <PriorityBadge priority={osaxCase.priority} />
      </td>
      <td className="whitespace-nowrap px-6 py-4">
        {osaxCase.severity ? (
          <SeverityBadge severity={osaxCase.severity} />
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
        {osaxCase.ahi !== null ? osaxCase.ahi.toFixed(1) : '-'}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
        {osaxCase.treatmentType ? formatTreatmentType(osaxCase.treatmentType) : '-'}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
        {osaxCase.assignedSpecialistName ?? '-'}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
        {formatDate(osaxCase.createdAt)}
      </td>
      <td className="whitespace-nowrap px-6 py-4 text-sm">
        <div className="flex space-x-2">
          <ActionButton
            label="View"
            href={`/osax-dashboard/${osaxCase.id}`}
            variant="primary"
          />
          {osaxCase.status === 'SCORED' && (
            <ActionButton
              label="Review"
              href={`/osax-dashboard/${osaxCase.id}/review`}
              variant="warning"
            />
          )}
        </div>
      </td>
    </tr>
  );
}


