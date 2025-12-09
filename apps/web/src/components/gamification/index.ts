/**
 * Gamification System Components
 *
 * A complete gamification system for increasing engagement and conversions:
 * - Points system for completing actions
 * - Level progression with rewards
 * - Achievement badges
 * - Time-limited bonuses
 * - Social proof integration
 *
 * @example
 * ```tsx
 * import {
 *   GamificationProvider,
 *   useGamification,
 *   PointsDisplay,
 *   AchievementsPanel,
 *   RewardsPanel,
 *   SocialProofWidget,
 *   TimeLimitedOffer,
 * } from '@/components/gamification';
 *
 * export default function LandingPage() {
 *   return (
 *     <GamificationProvider
 *       onLevelUp={(level) => console.log('Level up!', level)}
 *       onAchievementUnlocked={(a) => console.log('Achievement!', a)}
 *     >
 *       <PointsDisplay />
 *       <AchievementsPanel />
 *       <RewardsPanel />
 *       <SocialProofWidget />
 *       <TimeLimitedOffer
 *         title="Ofertă Exclusivă"
 *         description="Doar pentru tine"
 *         discount="25% REDUCERE"
 *         endTime={new Date(Date.now() + 3600000)}
 *         onClaim={() => console.log('Claimed!')}
 *       />
 *     </GamificationProvider>
 *   );
 * }
 * ```
 */

export {
  GamificationProvider,
  useGamification,
  PointsDisplay,
  AchievementsPanel,
  RewardsPanel,
  SocialProofWidget,
  TimeLimitedOffer,
  default,
} from './GamificationSystem';
