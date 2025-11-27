/**
 * Universal Adapter Interfaces
 *
 * This module exports all adapter interfaces for the MedicalCor Plug & Play architecture.
 * These interfaces enable provider-agnostic integrations that can be swapped via configuration.
 *
 * Architecture:
 * - Each interface defines a contract that all providers must implement
 * - Factory classes select the appropriate implementation based on environment config
 * - Business logic depends only on interfaces, never on concrete implementations
 *
 * Supported Integration Types:
 * 1. Payment Gateways (Stripe, Netopia, EuPlatesc, etc.)
 * 2. Voice/Telephony (Vapi, Twilio, Bland AI, etc.)
 * 3. SMS Providers (Twilio, Vonage, MessageBird, etc.)
 * 4. Messaging (WhatsApp, Messenger, Telegram)
 * 5. AI/LLM (OpenAI, Anthropic, Azure, Local models)
 * 6. CRM Systems (HubSpot, Zoho, Salesforce, etc.)
 * 7. Scheduling (Cal.com, Calendly, Acuity, etc.)
 *
 * Usage:
 * ```typescript
 * import { IPaymentGateway, ICRMProvider, ILLMProvider } from '@medicalcor/types';
 *
 * // In your factory
 * export function getPaymentProvider(): IPaymentGateway {
 *   const provider = process.env.PAYMENT_PROVIDER || 'stripe';
 *   switch (provider) {
 *     case 'stripe': return new StripeAdapter(config);
 *     case 'netopia': return new NetopiaAdapter(config);
 *     default: throw new Error(`Unsupported provider: ${provider}`);
 *   }
 * }
 * ```
 */

// =============================================================================
// Base Types
// =============================================================================
export {
  type IAdapterConfig,
  type IHealthCheckResult,
  type IAdapterResponse,
  type IWebhookVerification,
  type IPaginationParams,
  type IPaginatedResponse,
  type IBaseAdapter,
} from './base.interface.js';

// =============================================================================
// Payment Gateway
// =============================================================================
export {
  type PaymentProvider,
  type PaymentStatus,
  type PaymentMethodType,
  type IPaymentCustomer,
  type ICreatePaymentLinkOptions,
  type IPaymentLink,
  type IPaymentTransaction,
  type IRefundOptions,
  type IRefundResult,
  type IRevenueSummary,
  type PaymentWebhookEventType,
  type IPaymentWebhookPayload,
  type IPaymentGateway,
  type IPaymentGatewayConfig,
} from './payment.interface.js';

// =============================================================================
// Communication (Voice, SMS, Messaging)
// =============================================================================
export {
  // Common types
  type CommunicationDirection,
  type Sentiment,
  type UrgencyLevel,
  // Voice types
  type VoiceProvider,
  type CallStatus,
  type CallEndedReason,
  type ITranscriptMessage,
  type ICallTranscript,
  type ITranscriptAnalysis,
  type ICallSummary,
  type ICall,
  type IOutboundCallOptions,
  type VoiceWebhookEventType,
  type IVoiceWebhookPayload,
  type IVoiceProvider,
  // SMS types
  type SmsProvider,
  type SmsStatus,
  type ISmsMessage,
  type ISendSmsOptions,
  type SmsWebhookEventType,
  type ISmsWebhookPayload,
  type ISmsProvider,
  // Messaging types
  type MessagingProvider,
  type MessagingMessageType,
  type MessagingStatus,
  type IMessageMedia,
  type IMessageLocation,
  type ITemplateMessage,
  type IMessagingMessage,
  type ISendMessageOptions,
  type MessagingWebhookEventType,
  type IMessagingWebhookPayload,
  type IMessagingProvider,
} from './communication.interface.js';

// =============================================================================
// AI/LLM
// =============================================================================
export {
  type LLMProvider,
  type ChatRole,
  type IChatMessage,
  type IChatCompletionOptions,
  type IChatCompletionResult,
  type IEmbeddingResult,
  type ILeadScoringContext,
  type ILeadScoringResult,
  type ISentimentResult,
  type ILanguageDetectionResult,
  type ITextGenerationOptions,
  type ILLMProvider,
  type ILLMProviderConfig,
  type IEmbeddingProvider,
} from './ai.interface.js';

// =============================================================================
// CRM
// =============================================================================
export {
  type CRMProvider,
  type ContactLifecycleStage,
  type LeadStatus as CRMLeadStatus,
  type IContactProperties,
  type IContact,
  type IContactSearchFilters,
  type IContactSyncInput,
  type ActivityType,
  type ActivityDirection,
  type IActivity,
  type ICreateActivityInput,
  type TaskPriority,
  type TaskStatus,
  type ITask,
  type ICreateTaskInput,
  type DealStage,
  type IDeal,
  type ChurnRisk,
  type NPSCategory,
  type LoyaltySegment,
  type IRetentionMetrics,
  type CRMWebhookEventType,
  type ICRMWebhookPayload,
  type ICRMProvider,
  type ICRMProviderConfig,
} from './crm.interface.js';

// =============================================================================
// Scheduling
// =============================================================================
export {
  type SchedulingProvider,
  type IService,
  type IStaffMember,
  type ILocation,
  type ITimeSlot,
  type IGetSlotsOptions,
  type AppointmentStatus,
  type IAppointment,
  type IBookAppointmentInput,
  type IRescheduleAppointmentInput,
  type ICancelAppointmentInput,
  type ReminderType,
  type IReminderConfig,
  type IReminder,
  type SchedulingWebhookEventType,
  type ISchedulingWebhookPayload,
  type ISchedulingProvider,
  type ISchedulingProviderConfig,
} from './scheduling.interface.js';
