'use server';

import { getDatabase } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth/server-action-auth';
import type {
  EvaluatedFeatureFlag,
  FeatureFlagEnvironment,
  FeatureFlagTargeting,
  FeatureFlagVariant,
} from '@/lib/feature-flags/types';

/**
 * Server Actions for Feature Flags
 *
 * Provides server-side evaluation of feature flags with support for:
 * - Global and clinic-specific flags
 * - Progressive rollouts based on user ID hashing
 * - User and tenant overrides
 * - A/B testing variants
 *
 * @module actions/feature-flags
 */

// =============================================================================
// Types
// =============================================================================

interface FeatureFlagRow {
  id: string;
  clinic_id: string | null;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  rollout_percentage: number;
  targeting: FeatureFlagTargeting | null;
  variants: FeatureFlagVariant[] | null;
  environment: string;
  expires_at: Date | null;
}

interface FeatureFlagOverrideRow {
  flag_id: string;
  enabled: boolean;
  variant: string | null;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get current environment based on NODE_ENV
 */
function getCurrentEnvironment(): FeatureFlagEnvironment {
  const env = process.env.NODE_ENV;
  if (env === 'development') return 'development';
  if (env === 'test' || process.env.VERCEL_ENV === 'preview') return 'staging';
  return 'production';
}

/**
 * Simple string hash function for consistent rollout targeting
 * Uses the same algorithm as the PostgreSQL function for consistency
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Determine if a user should see a feature based on rollout percentage
 */
function isInRollout(userId: string, flagKey: string, percentage: number): boolean {
  if (percentage === 100) return true;
  if (percentage === 0) return false;

  const hash = hashString(userId + flagKey);
  const bucket = hash % 100;
  return bucket < percentage;
}

/**
 * Select a variant based on user ID and variant weights
 */
function selectVariant(
  userId: string,
  flagKey: string,
  variants: FeatureFlagVariant[]
): FeatureFlagVariant | undefined {
  if (!variants.length) return undefined;

  const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
  if (totalWeight === 0) return variants[0];

  const hash = hashString(userId + flagKey + 'variant');
  const bucket = hash % totalWeight;

  let cumulative = 0;
  for (const variant of variants) {
    cumulative += variant.weight;
    if (bucket < cumulative) {
      return variant;
    }
  }

  return variants[variants.length - 1];
}

/**
 * Check if targeting rules match the current context
 */
function matchesTargeting(
  targeting: FeatureFlagTargeting | null,
  userId: string | undefined,
  clinicId: string | undefined,
  role: string | undefined
): boolean {
  if (!targeting) return true;

  // Check user ID targeting
  if (targeting.userIds?.length && userId) {
    if (!targeting.userIds.includes(userId)) {
      return false;
    }
  }

  // Check clinic ID targeting
  if (targeting.clinicIds?.length && clinicId) {
    if (!targeting.clinicIds.includes(clinicId)) {
      return false;
    }
  }

  // Check role targeting
  if (targeting.roles?.length && role) {
    if (!targeting.roles.includes(role)) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * Get all evaluated feature flags for the current user
 *
 * Returns flags evaluated based on:
 * 1. User/tenant overrides (highest priority)
 * 2. Targeting rules
 * 3. Rollout percentage
 * 4. Base enabled state
 */
export async function getFeatureFlagsAction(): Promise<EvaluatedFeatureFlag[]> {
  const user = await getCurrentUser();
  const database = getDatabase();
  const environment = getCurrentEnvironment();

  const userId = user?.id;
  const clinicId = user?.clinicId;
  const role = user?.role;

  // Fetch all applicable flags (global + clinic-specific)
  const flagsResult = await database.query<FeatureFlagRow>(
    `SELECT id, clinic_id, key, name, description, enabled, rollout_percentage,
            targeting, variants, environment, expires_at
     FROM feature_flags
     WHERE environment = $1
       AND (clinic_id IS NULL OR clinic_id = $2)
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
     ORDER BY clinic_id NULLS LAST`,
    [environment, clinicId ?? null]
  );

  // Fetch user-specific overrides
  const overridesResult = userId
    ? await database.query<FeatureFlagOverrideRow>(
        `SELECT flag_id, enabled, variant
         FROM feature_flag_overrides
         WHERE user_id = $1
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [userId]
      )
    : { rows: [] as FeatureFlagOverrideRow[] };

  // Fetch tenant-specific overrides
  const tenantOverridesResult = clinicId
    ? await database.query<FeatureFlagOverrideRow>(
        `SELECT flag_id, enabled, variant
         FROM feature_flag_overrides
         WHERE tenant_id = $1
           AND user_id IS NULL
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
        [clinicId]
      )
    : { rows: [] as FeatureFlagOverrideRow[] };

  // Build override maps (user overrides take precedence over tenant)
  const userOverrides = new Map<string, FeatureFlagOverrideRow>(
    overridesResult.rows.map((o) => [o.flag_id, o])
  );
  const tenantOverrides = new Map<string, FeatureFlagOverrideRow>(
    tenantOverridesResult.rows.map((o) => [o.flag_id, o])
  );

  // Dedupe flags by key (clinic-specific takes precedence over global)
  const flagsByKey = new Map<string, FeatureFlagRow>();
  for (const flag of flagsResult.rows) {
    // Clinic-specific flag takes precedence (they come first in ORDER BY)
    if (!flagsByKey.has(flag.key)) {
      flagsByKey.set(flag.key, flag);
    }
  }

  // Evaluate each flag
  const evaluatedFlags: EvaluatedFeatureFlag[] = [];

  for (const flag of flagsByKey.values()) {
    // Check for user override first
    const userOverride = userOverrides.get(flag.id);
    if (userOverride) {
      evaluatedFlags.push({
        key: flag.key,
        enabled: userOverride.enabled,
        variant: userOverride.variant ?? undefined,
      });
      continue;
    }

    // Check for tenant override
    const tenantOverride = tenantOverrides.get(flag.id);
    if (tenantOverride) {
      evaluatedFlags.push({
        key: flag.key,
        enabled: tenantOverride.enabled,
        variant: tenantOverride.variant ?? undefined,
      });
      continue;
    }

    // Flag is disabled at the base level
    if (!flag.enabled) {
      evaluatedFlags.push({
        key: flag.key,
        enabled: false,
      });
      continue;
    }

    // Check targeting rules
    if (!matchesTargeting(flag.targeting, userId, clinicId, role)) {
      evaluatedFlags.push({
        key: flag.key,
        enabled: false,
      });
      continue;
    }

    // Check rollout percentage
    const inRollout = userId
      ? isInRollout(userId, flag.key, flag.rollout_percentage)
      : flag.rollout_percentage === 100;

    if (!inRollout) {
      evaluatedFlags.push({
        key: flag.key,
        enabled: false,
      });
      continue;
    }

    // Flag is enabled - determine variant if applicable
    let variant: string | undefined;
    let payload: Record<string, unknown> | undefined;

    if (flag.variants?.length && userId) {
      const selectedVariant = selectVariant(userId, flag.key, flag.variants);
      if (selectedVariant) {
        variant = selectedVariant.key;
        payload = selectedVariant.payload;
      }
    }

    evaluatedFlags.push({
      key: flag.key,
      enabled: true,
      variant,
      payload,
    });
  }

  return evaluatedFlags;
}

/**
 * Check if a specific feature flag is enabled for the current user
 * Uses the database function for server-side evaluation
 */
export async function isFeatureFlagEnabledAction(flagKey: string): Promise<boolean> {
  const user = await getCurrentUser();
  const database = getDatabase();

  const result = await database.query<{ evaluate_feature_flag: boolean }>(
    `SELECT evaluate_feature_flag($1, $2, $3) as evaluate_feature_flag`,
    [flagKey, user?.clinicId ?? null, user?.id ?? null]
  );

  return result.rows[0]?.evaluate_feature_flag ?? false;
}

/**
 * Get a single evaluated feature flag
 */
export async function getFeatureFlagAction(flagKey: string): Promise<EvaluatedFeatureFlag | null> {
  const flags = await getFeatureFlagsAction();
  return flags.find((f) => f.key === flagKey) ?? null;
}
