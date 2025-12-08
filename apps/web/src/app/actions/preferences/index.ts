'use server';

import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for User Preferences
 *
 * Handles user-specific settings including theme preferences.
 * All actions require authentication.
 */

// =============================================================================
// Types
// =============================================================================

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserPreferences {
  id: string;
  userId: string;
  theme: ThemePreference;
  preferences: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

interface PreferencesRow {
  id: string;
  user_id: string;
  theme: string;
  preferences: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const UpdateThemeSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']),
});

const UpdatePreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  preferences: z.record(z.unknown()).optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToPreferences(row: PreferencesRow): UserPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    theme: row.theme as ThemePreference,
    preferences: row.preferences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get current user's preferences
 * Returns null if no preferences exist yet
 */
export async function getUserPreferencesAction(): Promise<UserPreferences | null> {
  const user = await requireCurrentUser();

  const database = getDatabase();

  const result = await database.query<PreferencesRow>(
    `SELECT id, user_id, theme, preferences, created_at, updated_at
     FROM user_preferences
     WHERE user_id = $1`,
    [user.id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return rowToPreferences(result.rows[0]);
}

/**
 * Get user's theme preference
 * Returns 'system' as default if no preference is set
 */
export async function getThemePreferenceAction(): Promise<ThemePreference> {
  const user = await requireCurrentUser();

  const database = getDatabase();

  const result = await database.query<{ theme: string }>(
    `SELECT theme FROM user_preferences WHERE user_id = $1`,
    [user.id]
  );

  if (result.rows.length === 0) {
    return 'system';
  }

  return result.rows[0].theme as ThemePreference;
}

/**
 * Update user's theme preference
 * Creates preferences record if it doesn't exist
 */
export async function updateThemePreferenceAction(
  data: z.infer<typeof UpdateThemeSchema>
): Promise<ThemePreference> {
  const user = await requireCurrentUser();
  const parsed = UpdateThemeSchema.parse(data);

  const database = getDatabase();

  // Upsert the theme preference
  const result = await database.query<{ theme: string }>(
    `INSERT INTO user_preferences (user_id, theme)
     VALUES ($1, $2)
     ON CONFLICT (user_id)
     DO UPDATE SET theme = EXCLUDED.theme, updated_at = CURRENT_TIMESTAMP
     RETURNING theme`,
    [user.id, parsed.theme]
  );

  return result.rows[0].theme as ThemePreference;
}

/**
 * Update user's preferences (theme and/or additional preferences)
 * Creates preferences record if it doesn't exist
 */
export async function updateUserPreferencesAction(
  data: z.infer<typeof UpdatePreferencesSchema>
): Promise<UserPreferences> {
  const user = await requireCurrentUser();
  const parsed = UpdatePreferencesSchema.parse(data);

  const database = getDatabase();

  // Build the update query dynamically
  const updates: string[] = [];
  const values: unknown[] = [user.id];

  if (parsed.theme !== undefined) {
    values.push(parsed.theme);
    updates.push(`theme = $${values.length}`);
  }

  if (parsed.preferences !== undefined) {
    values.push(JSON.stringify(parsed.preferences));
    updates.push(`preferences = $${values.length}::jsonb`);
  }

  let result;

  if (updates.length === 0) {
    // No updates, just fetch current preferences
    result = await database.query<PreferencesRow>(
      `SELECT id, user_id, theme, preferences, created_at, updated_at
       FROM user_preferences
       WHERE user_id = $1`,
      [user.id]
    );

    if (result.rows.length === 0) {
      // Create default preferences
      result = await database.query<PreferencesRow>(
        `INSERT INTO user_preferences (user_id, theme, preferences)
         VALUES ($1, 'system', '{}')
         RETURNING id, user_id, theme, preferences, created_at, updated_at`,
        [user.id]
      );
    }
  } else {
    // Perform upsert
    const updateClause = updates.join(', ');

    result = await database.query<PreferencesRow>(
      `INSERT INTO user_preferences (user_id, theme, preferences)
       VALUES ($1, ${parsed.theme ? `$${values.indexOf(parsed.theme) + 1}` : "'system'"}, ${
         parsed.preferences
           ? `$${values.indexOf(JSON.stringify(parsed.preferences)) + 1}::jsonb`
           : "'{}'::jsonb"
       })
       ON CONFLICT (user_id)
       DO UPDATE SET ${updateClause}, updated_at = CURRENT_TIMESTAMP
       RETURNING id, user_id, theme, preferences, created_at, updated_at`,
      values
    );
  }

  return rowToPreferences(result.rows[0]);
}
