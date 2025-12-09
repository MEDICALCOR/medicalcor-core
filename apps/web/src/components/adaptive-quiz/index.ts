/**
 * Adaptive Quiz Component
 *
 * Revolutionary lead qualification system that:
 * - Shows personalized video responses from the doctor
 * - Adapts questions dynamically based on answers
 * - Creates emotional connection through personalization
 * - Qualifies leads while building trust
 *
 * @example
 * ```tsx
 * import { AdaptiveQuiz } from '@/components/adaptive-quiz';
 *
 * export default function LandingPage() {
 *   return (
 *     <AdaptiveQuiz
 *       doctorName="Dr. Alexandru"
 *       doctorImage="/images/doctor.jpg"
 *       onComplete={(result) => console.log('Quiz completed:', result)}
 *       onProgress={(progress) => console.log('Progress:', progress)}
 *     />
 *   );
 * }
 * ```
 */

export { AdaptiveQuiz, default } from './AdaptiveQuiz';
