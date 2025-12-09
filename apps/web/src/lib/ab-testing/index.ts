/**
 * A/B Testing Module
 *
 * Provides A/B testing functionality for landing pages and conversion optimization.
 *
 * @example
 * ```tsx
 * import { useABTest, AB_TESTS } from '@/lib/ab-testing';
 *
 * function LandingRouter() {
 *   const { variant, isControl, trackConversion } = useABTest('landing_page_v3');
 *
 *   useEffect(() => {
 *     // Track when user converts
 *     const handleSubmit = () => trackConversion('lead', 100);
 *   }, [trackConversion]);
 *
 *   if (isControl) return <ControlPage />;
 *   return <TreatmentPage />;
 * }
 * ```
 */

export {
  useABTest,
  AB_TESTS,
  getVisitorId,
  trackImpression,
  trackConversionEvent,
  getVariantFromRequest,
  getServerVariant,
  type ABTest,
  type ABTestVariant,
  type ABTestResult,
  type ConversionEvent,
  type UseABTestResult,
} from './ab-test';
