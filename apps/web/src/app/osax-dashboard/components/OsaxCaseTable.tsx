'use client';

/**
 * OSAX Case Table Component
 *
 * Displays a table of OSAX cases with sorting, filtering, and actions.
 */

import { useState } from 'react';
import type { OsaxCaseListItem } from '../actions/getOsaxCases';

interface OsaxCaseTableProps {
  cases: OsaxCaseListItem[];
}

export function OsaxCaseTable({ cases }: OsaxCaseTableProps) {
  const [sortField, setSortField] = useState<keyof OsaxCaseListItem>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: keyof OsaxCaseListItem) => {
    if (field === sortField) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedCases = [...cases].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];

    if (aVal === null) return 1;
    if (bVal === null) return -1;

    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <SortableHeader
                label="Case #"
                field="caseNumber"
                currentSort={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Status"
                field="status"
                currentSort={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Priority"
                field="priority"
                currentSort={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Severity"
                field="severity"
                currentSort={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="AHI"
                field="ahi"
                currentSort={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Treatment"
                field="treatmentType"
                currentSort={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Specialist"
                field="assignedSpecialistName"
                currentSort={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <SortableHeader
                label="Created"
                field="createdAt"
                currentSort={sortField}
                direction={sortDirection}
                onSort={handleSort}
              />
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {sortedCases.map((osaxCase) => (
              <CaseRow key={osaxCase.id} osaxCase={osaxCase} />
            ))}
          </tbody>
        </table>
      </div>

      {cases.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-gray-500">No cases found</p>
        </div>
      )}
    </div>
  );
}

interface SortableHeaderProps {
  label: string;
  field: keyof OsaxCaseListItem;
  currentSort: keyof OsaxCaseListItem;
  direction: 'asc' | 'desc';
  onSort: (field: keyof OsaxCaseListItem) => void;
}

function SortableHeader({ label, field, currentSort, direction, onSort }: SortableHeaderProps) {
  const isActive = currentSort === field;

  return (
    <th
      className="cursor-pointer px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 hover:bg-gray-100"
      onClick={() => onSort(field)}
    >
      <div className="flex items-center space-x-1">
        <span>{label}</span>
        {isActive && <span className="text-gray-700">{direction === 'asc' ? '↑' : '↓'}</span>}
      </div>
    </th>
  );
}

interface CaseRowProps {
  osaxCase: OsaxCaseListItem;
}

function CaseRow({ osaxCase }: CaseRowProps) {
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
        <StatusBadge status={osaxCase.status} />
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
          <ActionButton label="View" href={`/osax-dashboard/${osaxCase.id}`} variant="primary" />
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

function StatusBadge({ status }: { status: string }) {
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

  const config = statusConfig[status] ?? { label: status, className: 'bg-gray-100 text-gray-800' };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const priorityConfig: Record<string, { label: string; className: string }> = {
    LOW: { label: 'Low', className: 'bg-gray-100 text-gray-600' },
    NORMAL: { label: 'Normal', className: 'bg-blue-100 text-blue-600' },
    HIGH: { label: 'High', className: 'bg-orange-100 text-orange-600' },
    URGENT: { label: 'Urgent', className: 'bg-red-100 text-red-600' },
  };

  const config = priorityConfig[priority] ?? {
    label: priority,
    className: 'bg-gray-100 text-gray-600',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const severityConfig: Record<string, { label: string; className: string }> = {
    NONE: { label: 'None', className: 'bg-green-100 text-green-700' },
    MILD: { label: 'Mild', className: 'bg-yellow-100 text-yellow-700' },
    MODERATE: { label: 'Moderate', className: 'bg-orange-100 text-orange-700' },
    SEVERE: { label: 'Severe', className: 'bg-red-100 text-red-700' },
  };

  const config = severityConfig[severity] ?? {
    label: severity,
    className: 'bg-gray-100 text-gray-700',
  };

  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}

function ActionButton({
  label,
  href,
  variant = 'primary',
}: {
  label: string;
  href: string;
  variant?: 'primary' | 'secondary' | 'warning' | 'danger';
}) {
  const variantClasses = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    warning: 'bg-yellow-500 text-white hover:bg-yellow-600',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  return (
    <a
      href={href}
      className={`rounded px-3 py-1 text-xs font-medium transition-colors ${variantClasses[variant]}`}
    >
      {label}
    </a>
  );
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTreatmentType(type: string): string {
  const typeLabels: Record<string, string> = {
    CPAP_THERAPY: 'CPAP',
    BIPAP_THERAPY: 'BiPAP',
    ORAL_APPLIANCE: 'Oral Appliance',
    POSITIONAL_THERAPY: 'Positional',
    LIFESTYLE_MODIFICATION: 'Lifestyle',
    SURGERY_EVALUATION: 'Surgery Eval',
  };

  return typeLabels[type] ?? type;
}
