/**
 * @fileoverview Adapters Index
 *
 * Exports all hexagonal architecture adapters for multi-channel notifications
 * and external service integrations.
 *
 * @module integrations/adapters
 */

// ============================================
// Notification Channel Adapters
// ============================================

export {
  // Base types
  type NotificationChannelType,
  type NotificationPriority,
  type SendNotificationOptions,
  type NotificationAttachment,
  type SendNotificationResult,
  type ChannelStats,
  type ChannelHealthStatus,
  type INotificationChannel,
  // Factory types
  type ChannelFactoryConfig,
  type EmailChannelConfig,
  type SMSChannelConfig,
  type PushChannelConfig,
  type SlackChannelConfig,
} from './notification-channel.js';

export {
  // Email adapter
  EmailChannelAdapter,
  createEmailChannelAdapter,
  EmailSendError,
  type EmailSendOptions,
} from './email-channel.adapter.js';

export {
  // Mock email adapter
  MockEmailChannelAdapter,
  MockEmailError,
  createMockEmailChannelAdapter,
  createSuccessMockEmailAdapter,
  createFailureMockEmailAdapter,
  createSlowMockEmailAdapter,
  createFlakyMockEmailAdapter,
  type RecordedEmail,
  type MockEmailBehavior,
  type MockEmailChannelConfig,
} from './email-channel.mock.js';
