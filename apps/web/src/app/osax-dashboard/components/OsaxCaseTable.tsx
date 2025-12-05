'use client';

/**
 * OSAX Case Table Component
 *
 * Displays a table of OSAX cases with sorting, filtering, and actions.
 * Implements optimistic updates for instant UI feedback when changing case status.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOsaxCaseMutation, OSAX_CASES_QUERY_KEY } from './useOsaxCaseMutation';
import { useOsaxCaseSorting } from './useOsaxCaseSorting';
import { SortableHeader } from './OsaxCaseTableHeader';
import { CaseRow } from './OsaxCaseTableRow';
import type { UpdateCaseStatusInput } from '../actions/updateOsaxCaseStatus';
import type { OsaxCaseListItem } from '../actions/getOsaxCases';

interface OsaxCaseTableProps {
  cases: OsaxCaseListItem[];
}

export function OsaxCaseTable({ cases: initialCases }: OsaxCaseTableProps) {
  const queryClient = useQueryClient();

  // Initialize React Query cache with initial data
  useEffect(() => {
    queryClient.setQueryData(OSAX_CASES_QUERY_KEY, initialCases);
  }, [queryClient, initialCases]);

  // Get current cases from cache or use initial
  const cachedCases = queryClient.getQueryData<OsaxCaseListItem[]>(OSAX_CASES_QUERY_KEY);
  const cases = cachedCases ?? initialCases;

  // Optimistic mutation for status updates
  const { mutate: updateStatus, isPending } = useOsaxCaseMutation(initialCases);

  // Sorting logic
  const { sortedCases, sortField, sortDirection, handleSort } = useOsaxCaseSorting(cases);

  const handleStatusChange = (caseId: string, newStatus: string) => {
    void updateStatus({ caseId, status: newStatus as UpdateCaseStatusInput['status'] });
  };

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <TableHeader
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
          <tbody className="divide-y divide-gray-200 bg-white">
            {sortedCases.map((osaxCase) => (
              <CaseRow
                key={osaxCase.id}
                osaxCase={osaxCase}
                onStatusChange={(newStatus) => handleStatusChange(osaxCase.id, newStatus)}
                isUpdating={isPending}
              />
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

interface TableHeaderProps {
  sortField: keyof OsaxCaseListItem;
  sortDirection: 'asc' | 'desc';
  onSort: (field: keyof OsaxCaseListItem) => void;
}

function TableHeader({ sortField, sortDirection, onSort }: TableHeaderProps) {
  const headers = [
    { label: 'Case #', field: 'caseNumber' as const },
    { label: 'Status', field: 'status' as const },
    { label: 'Priority', field: 'priority' as const },
    { label: 'Severity', field: 'severity' as const },
    { label: 'AHI', field: 'ahi' as const },
    { label: 'Treatment', field: 'treatmentType' as const },
    { label: 'Specialist', field: 'assignedSpecialistName' as const },
    { label: 'Created', field: 'createdAt' as const },
  ];

  return (
    <thead className="bg-gray-50">
      <tr>
        {headers.map(({ label, field }) => (
          <SortableHeader
            key={field}
            label={label}
            field={field}
            currentSort={sortField}
            direction={sortDirection}
            onSort={onSort}
          />
        ))}
        <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
          Actions
        </th>
      </tr>
    </thead>
  );
}
