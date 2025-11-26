/**
 * Accessibility (a11y) Utilities
 *
 * Medical applications have strict accessibility requirements.
 * These utilities ensure the app is usable by:
 * - Doctors who prefer keyboard navigation
 * - Users with visual impairments (screen readers)
 * - Older users who may need larger text/better contrast
 *
 * Standards: WCAG 2.1 AA compliance
 */

export {
  useFocusManagement,
  useFocusTrap,
  useSkipLinks,
  useLiveAnnouncer,
  type FocusableItem,
  type UseFocusManagementOptions,
} from './use-focus-management';
