/**
 * Treatment Plan Generator Component
 *
 * Generates personalized treatment plans in real-time with:
 * - PDF export capability
 * - Email delivery option
 * - Pricing breakdown
 * - Timeline visualization
 *
 * @example
 * ```tsx
 * import { TreatmentPlanGenerator } from '@/components/treatment-plan';
 *
 * export default function LandingPage() {
 *   return (
 *     <TreatmentPlanGenerator
 *       initialData={{ patientName: 'Ion' }}
 *       onPlanGenerated={(plan) => console.log('Plan:', plan)}
 *       onLeadCapture={(data) => console.log('Lead:', data)}
 *     />
 *   );
 * }
 * ```
 */

export { TreatmentPlanGenerator, default } from './TreatmentPlanGenerator';
