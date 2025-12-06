/**
 * @fileoverview Feature Flags Module
 *
 * Runtime feature toggles with targeting, exported from core.
 *
 * @module core/feature-flags
 */

// Re-export types and implementation
export {
  InMemoryFeatureFlagService,
  FeatureFlagError,
  type FeatureFlag,
  type FeatureFlagService,
  type FlagMetadata,
  type TargetingRules,
  type TargetingRule,
  type RuleCondition,
  type ConditionOperator,
  type ServeConfig,
  type FlagVariant,
  type EvaluationContext,
  type EvaluationResult,
  type FeatureFlagErrorCode,
} from './types.js';
