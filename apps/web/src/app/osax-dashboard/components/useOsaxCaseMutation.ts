/**
 * Hook for OSAX case status mutations
 * Extracted from OsaxCaseTable to reduce complexity
 */

import { useQueryClient } from '@tanstack/react-query';
import { useOptimisticMutation } from '@/lib/mutations';
import { updateOsaxCaseStatusAction, type UpdateCaseStatusInput } from '../actions/updateOsaxCaseStatus';
import { useToast } from '@/hooks/use-toast';
import type { OsaxCaseListItem } from '../actions/getOsaxCases';

const OSAX_CASES_QUERY_KEY = ['osax-cases'] as const;

export function useOsaxCaseMutation(initialCases: OsaxCaseListItem[]) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useOptimisticMutation<OsaxCaseListItem[], Error, UpdateCaseStatusInput>({
    mutationFn: async (input) => {
      const result = await updateOsaxCaseStatusAction(input);
      if (!result.success) {
        throw new Error(result.error);
      }
      // Return updated cases list for type compatibility
      const currentCases = queryClient.getQueryData<OsaxCaseListItem[]>(OSAX_CASES_QUERY_KEY) ?? initialCases;
      return currentCases.map((c) => (c.id === result.case.id ? result.case : c));
    },
    optimisticUpdate: ({ caseId, status }) => ({
      queryKey: OSAX_CASES_QUERY_KEY,
      updater: (old: OsaxCaseListItem[] | undefined, _vars: UpdateCaseStatusInput) => {
        const currentCases = old ?? initialCases;
        return currentCases.map((c) =>
          c.id === caseId ? { ...c, status, updatedAt: new Date().toISOString() } : c
        );
      },
    }),
    onSuccess: (updatedCases) => {
      // Cache is already updated by mutationFn
      queryClient.setQueryData(OSAX_CASES_QUERY_KEY, updatedCases);
      toast({
        title: 'Status actualizat',
        description: `Statusul cazului a fost actualizat cu succes`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Eroare',
        description: error.message || 'Nu s-a putut actualiza statusul cazului',
        variant: 'destructive',
      });
    },
    invalidateKeys: [OSAX_CASES_QUERY_KEY],
  });
}

export { OSAX_CASES_QUERY_KEY };


