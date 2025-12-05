/**
 * Hook for OSAX case sorting
 * Extracted to reduce OsaxCaseTable complexity
 */

import { useState, useMemo } from 'react';
import type { OsaxCaseListItem } from '../actions/getOsaxCases';

export function useOsaxCaseSorting(cases: OsaxCaseListItem[]) {
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

  const sortedCases = useMemo(() => {
    return [...cases].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === null) return 1;
      if (bVal === null) return -1;

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [cases, sortField, sortDirection]);

  return {
    sortedCases,
    sortField,
    sortDirection,
    handleSort,
  };
}


