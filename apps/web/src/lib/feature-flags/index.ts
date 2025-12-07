/**
 * Feature Flags Module
 *
 * Provides feature flag functionality for progressive rollouts and A/B testing.
 *
 * @module lib/feature-flags
 *
 * @example
 * ```tsx
 * // Check if a feature is enabled
 * import { useFeatureFlag } from '@/lib/feature-flags';
 *
 * function MyComponent() {
 *   const isNewFeature = useFeatureFlag('new_feature');
 *   return isNewFeature ? <NewFeature /> : <LegacyFeature />;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // Use variants for A/B testing
 * import { useFeatureFlagVariant } from '@/lib/feature-flags';
 *
 * function Experiment() {
 *   const variant = useFeatureFlagVariant('checkout_flow');
 *
 *   switch (variant) {
 *     case 'control': return <StandardCheckout />;
 *     case 'streamlined': return <StreamlinedCheckout />;
 *     default: return <StandardCheckout />;
 *   }
 * }
 * ```
 */

// Provider and hooks
export {
  FeatureFlagProvider,
  useFeatureFlags,
  useFeatureFlag,
  useFeatureFlagVariant,
  useFeatureFlagPayload,
} from './context';

// Types
export type {
  FeatureFlag,
  FeatureFlagEnvironment,
  FeatureFlagTargeting,
  FeatureFlagVariant,
  EvaluatedFeatureFlag,
  FeatureFlagMap,
  FeatureFlagRecord,
  FeatureFlagContextValue,
  FeatureFlagsResponse,
  FeatureFlagContext,
} from './types';
