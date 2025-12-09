/**
 * Shared action utilities for server actions
 * Reduces duplication across action files
 */

/**
 * Builds a dynamic UPDATE query with parameter indexing
 * @param updates - Array of column names to update
 * @param startIndex - Starting parameter index (default: 1)
 * @returns Object with SET clause and next parameter index
 */
export function buildUpdateQuery(
  updates: string[],
  startIndex = 1
): { setClause: string; nextIndex: number } {
  const setClauses: string[] = [];
  let paramIndex = startIndex;

  for (const column of updates) {
    setClauses.push(`${column} = $${paramIndex++}`);
  }

  return {
    setClause: setClauses.join(', '),
    nextIndex: paramIndex,
  };
}

/**
 * Builds UPDATE values array from a validated object
 * @param validated - Validated update data
 * @param fieldMappings - Map of field names to column names
 * @returns Object with updates array, values array, and whether there are updates
 */
export function buildUpdateValues<T extends Record<string, unknown>>(
  validated: T,
  fieldMappings: Record<keyof T, string>
): { updates: string[]; values: unknown[]; hasUpdates: boolean } {
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const [field, column] of Object.entries(fieldMappings) as [keyof T, string][]) {
    if (validated[field] !== undefined) {
      updates.push(column);
      values.push(validated[field]);
    }
  }

  return {
    updates,
    values,
    hasUpdates: updates.length > 0,
  };
}

/**
 * Standard action error response
 */
export interface ActionResult<T> {
  data: T | null;
  error?: string;
}

/**
 * Creates a success result
 */
export function actionSuccess<T>(data: T): ActionResult<T> {
  return { data };
}

/**
 * Creates an error result
 */
export function actionError<T>(error: string): ActionResult<T> {
  return { data: null, error };
}
