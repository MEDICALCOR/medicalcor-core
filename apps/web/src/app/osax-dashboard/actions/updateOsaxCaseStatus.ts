'use server';

import { z } from 'zod';
import type { OsaxCaseListItem } from './getOsaxCases';

/**
 * Server Action for updating OSAX case status
 *
 * Validates and updates the status of an OSAX case.
 */

const UpdateCaseStatusSchema = z.object({
  caseId: z.string().min(1, 'Case ID is required'),
  status: z.enum([
    'PENDING_STUDY',
    'STUDY_COMPLETED',
    'SCORED',
    'REVIEWED',
    'TREATMENT_PLANNED',
    'IN_TREATMENT',
    'FOLLOW_UP',
    'CLOSED',
    'CANCELLED',
  ]),
});

export type UpdateCaseStatusInput = z.infer<typeof UpdateCaseStatusSchema>;

/**
 * Update OSAX case status
 *
 * @param input - Case ID and new status
 * @returns Updated case or error
 */
export async function updateOsaxCaseStatusAction(
  input: UpdateCaseStatusInput
): Promise<{ success: true; case: OsaxCaseListItem } | { success: false; error: string }> {
  try {
    // Validate input
    const validated = UpdateCaseStatusSchema.parse(input);

    // In production, this would:
    // 1. Check user permissions
    // 2. Validate status transition rules
    // 3. Update database via repository
    // 4. Log audit trail
    // 5. Send notifications if needed

    // Mock implementation for now
    const mockUpdatedCase: OsaxCaseListItem = {
      id: validated.caseId,
      caseNumber: `OSA-2025-${validated.caseId.padStart(5, '0')}`,
      status: validated.status,
      priority: 'NORMAL', // Would come from DB
      severity: 'MODERATE', // Would come from DB
      ahi: 22.8, // Would come from DB
      treatmentType: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedSpecialistName: 'Dr. Smith',
      nextFollowUpDate: null,
    };

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 300));

    return {
      success: true,
      case: mockUpdatedCase,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors[0]?.message ?? 'Invalid input',
      };
    }

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update case status',
    };
  }
}



