/**
 * Breach Notification Module
 *
 * GDPR-compliant data breach notification management.
 * Implements Articles 33 and 34 requirements.
 *
 * @module domain/breach-notification
 */

export {
  BreachNotificationService,
  createBreachNotificationService,
  type BreachLogger,
  type BreachEventEmitter,
  type BreachNotificationConfig,
  type BreachNotificationServiceOptions,
  type ReportBreachResult,
  type NotifySubjectResult,
  type NotifyAuthorityResult,
} from './breach-notification-service.js';

export {
  type BreachRepository,
  type BreachQueryOptions,
  type BreachQueryResult,
} from './breach-repository.js';
