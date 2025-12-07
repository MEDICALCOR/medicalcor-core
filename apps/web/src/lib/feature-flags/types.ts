/**
 * Feature Flags Type Definitions
 *
 * Type definitions for the feature flag system that supports:
 * - Global and clinic-specific flags
 * - Progressive rollouts
 * - User/tenant overrides
 * - A/B testing variants
 *
 * @module lib/feature-flags/types
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Feature flag environment
 */
export type FeatureFlagEnvironment = 'development' | 'staging' | 'production';

/**
 * Feature flag definition as stored in the database
 */
export interface FeatureFlag {
  /** Unique identifier */
  id: string;
  /** Clinic ID if clinic-specific, null for global flags */
  clinicId: string | null;
  /** Unique key for the flag (e.g., 'new_dashboard', 'ai_scoring_v2') */
  key: string;
  /** Human-readable name */
  name: string;
  /** Description of the flag purpose */
  description: string | null;
  /** Whether the flag is enabled */
  enabled: boolean;
  /** Percentage of users who should see this feature (0-100) */
  rolloutPercentage: number;
  /** Advanced targeting rules */
  targeting: FeatureFlagTargeting | null;
  /** A/B testing variants */
  variants: FeatureFlagVariant[] | null;
  /** Owner/team responsible for this flag */
  owner: string | null;
  /** Tags for categorization */
  tags: string[];
  /** Environment this flag applies to */
  environment: FeatureFlagEnvironment;
  /** When the flag was created */
  createdAt: Date;
  /** When the flag was last updated */
  updatedAt: Date;
  /** When the flag expires (optional) */
  expiresAt: Date | null;
}

/**
 * Targeting rules for feature flags
 */
export interface FeatureFlagTargeting {
  /** Specific user IDs that should see this feature */
  userIds?: string[];
  /** Specific clinic IDs that should see this feature */
  clinicIds?: string[];
  /** User roles that should see this feature */
  roles?: string[];
  /** Custom attributes for targeting */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Variant for A/B testing
 */
export interface FeatureFlagVariant {
  /** Variant key */
  key: string;
  /** Variant name */
  name: string;
  /** Weight for this variant (relative to other variants) */
  weight: number;
  /** Variant-specific payload */
  payload?: Record<string, unknown>;
}

/**
 * Evaluated feature flag result for a specific user context
 */
export interface EvaluatedFeatureFlag {
  /** Flag key */
  key: string;
  /** Whether the flag is enabled for this user */
  enabled: boolean;
  /** Selected variant if A/B testing is active */
  variant?: string;
  /** Variant payload if available */
  payload?: Record<string, unknown>;
}

/**
 * Map of flag keys to their evaluated state
 */
export type FeatureFlagMap = Map<string, EvaluatedFeatureFlag>;

/**
 * Record of flag keys to their enabled state (for simple boolean checks)
 */
export type FeatureFlagRecord = Record<string, boolean>;

// =============================================================================
// Context Types
// =============================================================================

/**
 * Feature flag context value
 */
export interface FeatureFlagContextValue {
  /** Map of all evaluated flags */
  flags: FeatureFlagMap;
  /** Check if a flag is enabled */
  isEnabled: (key: string, defaultValue?: boolean) => boolean;
  /** Get a flag's variant */
  getVariant: (key: string) => string | undefined;
  /** Get a flag's payload (cast to specific type at call site if needed) */
  getPayload: (key: string) => Record<string, unknown> | undefined;
  /** Whether flags are currently loading */
  isLoading: boolean;
  /** Whether initial load is complete */
  isInitialized: boolean;
  /** Error if flag fetch failed */
  error: Error | null;
  /** Manually refresh flags */
  refresh: () => Promise<void>;
}

// =============================================================================
// API Types
// =============================================================================

/**
 * Response from the feature flags API
 */
export interface FeatureFlagsResponse {
  flags: EvaluatedFeatureFlag[];
  /** Timestamp when flags were evaluated */
  evaluatedAt: string;
}

/**
 * Context for evaluating feature flags
 */
export interface FeatureFlagContext {
  /** Current user ID */
  userId?: string;
  /** Current clinic ID */
  clinicId?: string;
  /** User's role */
  role?: string;
  /** Current environment */
  environment?: FeatureFlagEnvironment;
  /** Additional attributes for targeting */
  attributes?: Record<string, string | number | boolean>;
}
