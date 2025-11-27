/**
 * Communication Universal Interfaces
 *
 * Abstracts voice, SMS, and messaging to support multiple providers:
 *
 * Voice:
 * - Vapi (AI Voice - current)
 * - Twilio Voice
 * - Bland AI
 * - Retell
 * - Vonage
 *
 * SMS:
 * - Twilio SMS
 * - Vonage
 * - MessageBird
 * - Sinch
 *
 * Messaging:
 * - WhatsApp (360dialog - current)
 * - WhatsApp (Twilio)
 * - Facebook Messenger
 * - Telegram
 *
 * Usage:
 * ```typescript
 * const voice = VoiceFactory.getProvider();
 * const callId = await voice.makeOutboundCall('+40712345678', script);
 *
 * const sms = SmsFactory.getProvider();
 * await sms.sendSms('+40712345678', 'Your appointment is tomorrow');
 * ```
 */

import type {
  IBaseAdapter,
  IWebhookVerification,
  IPaginationParams,
  IPaginatedResponse,
} from './base.interface.js';

// =============================================================================
// Common Types
// =============================================================================

/**
 * Call/Message direction
 */
export type CommunicationDirection = 'inbound' | 'outbound';

/**
 * Sentiment analysis result
 */
export type Sentiment = 'positive' | 'neutral' | 'negative';

/**
 * Urgency level for triage
 */
export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

// =============================================================================
// Voice Provider Types
// =============================================================================

/**
 * Supported voice providers
 */
export type VoiceProvider = 'vapi' | 'twilio' | 'bland' | 'retell' | 'vonage';

/**
 * Call status (normalized across providers)
 */
export type CallStatus =
  | 'queued'
  | 'ringing'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'busy'
  | 'no-answer'
  | 'voicemail'
  | 'canceled';

/**
 * Call ended reason
 */
export type CallEndedReason =
  | 'completed'
  | 'customer-ended'
  | 'assistant-ended'
  | 'timeout'
  | 'error'
  | 'no-answer'
  | 'busy'
  | 'voicemail';

/**
 * Transcript message
 */
export interface ITranscriptMessage {
  /** Speaker role */
  role: 'user' | 'assistant' | 'system';

  /** Message content */
  message: string;

  /** Timestamp in seconds from call start */
  timestamp: number;

  /** Duration in seconds */
  duration?: number | undefined;
}

/**
 * Call transcript
 */
export interface ICallTranscript {
  /** Call ID */
  callId: string;

  /** Transcript messages */
  messages: ITranscriptMessage[];

  /** Total duration in seconds */
  duration: number;

  /** Call start time */
  startedAt: Date;

  /** Call end time */
  endedAt: Date;

  /** Full transcript as text */
  fullText?: string | undefined;
}

/**
 * Transcript analysis result
 */
export interface ITranscriptAnalysis {
  /** Full transcript text */
  fullTranscript: string;

  /** Customer messages only */
  customerMessages: string[];

  /** Assistant messages only */
  assistantMessages: string[];

  /** Total word count */
  wordCount: number;

  /** Call duration in seconds */
  durationSeconds: number;

  /** Speaking ratio */
  speakingRatio: {
    customer: number;
    assistant: number;
  };

  /** Detected keywords */
  keywords: string[];

  /** Detected procedure mentions */
  procedureMentions: string[];

  /** Questions asked */
  questions: string[];

  /** Detected sentiment */
  sentiment?: Sentiment | undefined;

  /** Urgency level */
  urgencyLevel?: UrgencyLevel | undefined;
}

/**
 * Call summary for CRM
 */
export interface ICallSummary {
  /** Call ID */
  callId: string;

  /** Summary text */
  summary: string;

  /** Main topics discussed */
  topics: string[];

  /** Overall sentiment */
  sentiment: Sentiment;

  /** Key phrases extracted */
  keyPhrases: string[];

  /** Action items */
  actionItems: string[];

  /** Procedures of interest */
  procedureInterest: string[];

  /** Urgency level */
  urgencyLevel: UrgencyLevel;
}

/**
 * Call details
 */
export interface ICall {
  /** Unique call ID */
  id: string;

  /** Provider-specific call ID */
  providerCallId?: string | undefined;

  /** Call direction */
  direction: CommunicationDirection;

  /** Current status */
  status: CallStatus;

  /** Customer phone number */
  customerPhone: string;

  /** Customer name if available */
  customerName?: string | undefined;

  /** System phone number used */
  systemPhone?: string | undefined;

  /** Call start time */
  startedAt?: Date | undefined;

  /** Call end time */
  endedAt?: Date | undefined;

  /** Ended reason */
  endedReason?: CallEndedReason | undefined;

  /** Duration in seconds */
  duration?: number | undefined;

  /** Cost in USD */
  cost?: number | undefined;

  /** Custom metadata */
  metadata?: Record<string, string> | undefined;

  /** Transcript if available */
  transcript?: ICallTranscript | undefined;
}

/**
 * Outbound call options
 */
export interface IOutboundCallOptions {
  /** Customer phone number (E.164 format) */
  phoneNumber: string;

  /** Customer name */
  name?: string | undefined;

  /** AI assistant script/prompt */
  script?: string | undefined;

  /** Assistant/Agent ID to use */
  assistantId?: string | undefined;

  /** Custom metadata */
  metadata?: Record<string, string> | undefined;

  /** Callback URL for status updates */
  callbackUrl?: string | undefined;
}

/**
 * Voice webhook event types
 */
export type VoiceWebhookEventType =
  | 'call.started'
  | 'call.ringing'
  | 'call.in-progress'
  | 'call.completed'
  | 'call.failed'
  | 'transcript.updated'
  | 'transcript.final';

/**
 * Normalized voice webhook payload
 */
export interface IVoiceWebhookPayload {
  /** Event type */
  eventType: VoiceWebhookEventType;

  /** Event ID */
  eventId: string;

  /** Call data */
  call: ICall;

  /** Transcript if available */
  transcript?: ICallTranscript | undefined;

  /** Raw provider payload */
  rawPayload: unknown;

  /** Event timestamp */
  timestamp: Date;
}

/**
 * Universal Voice Provider Interface
 */
export interface IVoiceProvider extends IBaseAdapter {
  /**
   * Provider identifier
   */
  readonly providerName: VoiceProvider;

  /**
   * Make an outbound call
   */
  makeOutboundCall(options: IOutboundCallOptions): Promise<ICall>;

  /**
   * Get call details
   */
  getCall(callId: string): Promise<ICall>;

  /**
   * List calls
   */
  listCalls(options?: {
    direction?: CommunicationDirection;
    status?: CallStatus;
    startDate?: Date;
    endDate?: Date;
    pagination?: IPaginationParams;
  }): Promise<IPaginatedResponse<ICall>>;

  /**
   * End an active call
   */
  endCall(callId: string): Promise<void>;

  /**
   * Get call transcript
   */
  getTranscript(callId: string): Promise<ICallTranscript>;

  /**
   * Analyze transcript for insights
   */
  analyzeTranscript(transcript: ICallTranscript): ITranscriptAnalysis;

  /**
   * Generate call summary
   */
  generateCallSummary(transcript: ICallTranscript): ICallSummary;

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): IWebhookVerification;

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(payload: unknown): IVoiceWebhookPayload | null;

  /**
   * Format transcript for CRM storage
   */
  formatTranscriptForCRM(transcript: ICallTranscript): string;
}

// =============================================================================
// SMS Provider Types
// =============================================================================

/**
 * Supported SMS providers
 */
export type SmsProvider = 'twilio' | 'vonage' | 'messagebird' | 'sinch';

/**
 * SMS delivery status
 */
export type SmsStatus = 'queued' | 'sent' | 'delivered' | 'failed' | 'undelivered';

/**
 * SMS message
 */
export interface ISmsMessage {
  /** Message ID */
  id: string;

  /** Direction */
  direction: CommunicationDirection;

  /** Customer phone */
  customerPhone: string;

  /** Message body */
  body: string;

  /** Status */
  status: SmsStatus;

  /** Number of segments */
  segments?: number | undefined;

  /** Cost */
  cost?: number | undefined;

  /** Sent timestamp */
  sentAt?: Date | undefined;

  /** Delivered timestamp */
  deliveredAt?: Date | undefined;
}

/**
 * Send SMS options
 */
export interface ISendSmsOptions {
  /** Recipient phone number (E.164) */
  to: string;

  /** Message body */
  body: string;

  /** Custom from number (if supported) */
  from?: string | undefined;

  /** Callback URL for status updates */
  callbackUrl?: string | undefined;

  /** Custom metadata */
  metadata?: Record<string, string> | undefined;
}

/**
 * SMS webhook event types
 */
export type SmsWebhookEventType =
  | 'sms.received'
  | 'sms.sent'
  | 'sms.delivered'
  | 'sms.failed'
  | 'sms.undelivered';

/**
 * Normalized SMS webhook payload
 */
export interface ISmsWebhookPayload {
  /** Event type */
  eventType: SmsWebhookEventType;

  /** Event ID */
  eventId: string;

  /** SMS message data */
  message: ISmsMessage;

  /** Raw provider payload */
  rawPayload: unknown;

  /** Event timestamp */
  timestamp: Date;
}

/**
 * Universal SMS Provider Interface
 */
export interface ISmsProvider extends IBaseAdapter {
  /**
   * Provider identifier
   */
  readonly providerName: SmsProvider;

  /**
   * Send an SMS message
   */
  sendSms(options: ISendSmsOptions): Promise<ISmsMessage>;

  /**
   * Get message status
   */
  getMessageStatus(messageId: string): Promise<SmsStatus>;

  /**
   * Get message details
   */
  getMessage(messageId: string): Promise<ISmsMessage>;

  /**
   * List messages
   */
  listMessages(options?: {
    direction?: CommunicationDirection;
    status?: SmsStatus;
    startDate?: Date;
    endDate?: Date;
    pagination?: IPaginationParams;
  }): Promise<IPaginatedResponse<ISmsMessage>>;

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): IWebhookVerification;

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(payload: unknown): ISmsWebhookPayload | null;
}

// =============================================================================
// Messaging Provider Types (WhatsApp, Messenger, etc.)
// =============================================================================

/**
 * Supported messaging providers
 */
export type MessagingProvider =
  | 'whatsapp_360dialog'
  | 'whatsapp_twilio'
  | 'whatsapp_meta'
  | 'messenger'
  | 'telegram';

/**
 * Message types
 */
export type MessagingMessageType =
  | 'text'
  | 'image'
  | 'document'
  | 'audio'
  | 'video'
  | 'location'
  | 'contact'
  | 'template'
  | 'interactive';

/**
 * Message delivery status
 */
export type MessagingStatus = 'sent' | 'delivered' | 'read' | 'failed';

/**
 * Media attachment
 */
export interface IMessageMedia {
  /** Media type */
  type: 'image' | 'document' | 'audio' | 'video';

  /** URL or media ID */
  url?: string | undefined;
  mediaId?: string | undefined;

  /** MIME type */
  mimeType?: string | undefined;

  /** Caption */
  caption?: string | undefined;

  /** Filename for documents */
  filename?: string | undefined;
}

/**
 * Location data
 */
export interface IMessageLocation {
  latitude: number;
  longitude: number;
  name?: string | undefined;
  address?: string | undefined;
}

/**
 * Template message parameters
 */
export interface ITemplateMessage {
  /** Template name */
  name: string;

  /** Template language */
  language: string;

  /** Template parameters */
  parameters?: Record<string, string> | undefined;

  /** Header parameters */
  headerParams?: string[] | undefined;

  /** Body parameters */
  bodyParams?: string[] | undefined;

  /** Button parameters */
  buttonParams?: string[] | undefined;
}

/**
 * Messaging message
 */
export interface IMessagingMessage {
  /** Message ID */
  id: string;

  /** Provider-specific message ID */
  providerMessageId?: string | undefined;

  /** Direction */
  direction: CommunicationDirection;

  /** Customer phone/ID */
  customerIdentifier: string;

  /** Message type */
  type: MessagingMessageType;

  /** Text content */
  text?: string | undefined;

  /** Media attachment */
  media?: IMessageMedia | undefined;

  /** Location data */
  location?: IMessageLocation | undefined;

  /** Template data */
  template?: ITemplateMessage | undefined;

  /** Status */
  status: MessagingStatus;

  /** Timestamp */
  timestamp: Date;

  /** Metadata */
  metadata?: Record<string, unknown> | undefined;
}

/**
 * Send message options
 */
export interface ISendMessageOptions {
  /** Recipient phone/ID (E.164 for WhatsApp) */
  to: string;

  /** Message type */
  type: MessagingMessageType;

  /** Text content */
  text?: string | undefined;

  /** Media to send */
  media?: IMessageMedia | undefined;

  /** Location to send */
  location?: IMessageLocation | undefined;

  /** Template to send */
  template?: ITemplateMessage | undefined;

  /** Reply to message ID */
  replyToMessageId?: string | undefined;
}

/**
 * Messaging webhook event types
 */
export type MessagingWebhookEventType =
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed';

/**
 * Normalized messaging webhook payload
 */
export interface IMessagingWebhookPayload {
  /** Event type */
  eventType: MessagingWebhookEventType;

  /** Event ID */
  eventId: string;

  /** Message data */
  message: IMessagingMessage;

  /** Customer phone/ID */
  customerIdentifier: string;

  /** Raw provider payload */
  rawPayload: unknown;

  /** Event timestamp */
  timestamp: Date;
}

/**
 * Universal Messaging Provider Interface
 */
export interface IMessagingProvider extends IBaseAdapter {
  /**
   * Provider identifier
   */
  readonly providerName: MessagingProvider;

  /**
   * Send a text message
   */
  sendText(to: string, text: string): Promise<IMessagingMessage>;

  /**
   * Send a template message
   */
  sendTemplate(to: string, template: ITemplateMessage): Promise<IMessagingMessage>;

  /**
   * Send a media message
   */
  sendMedia(to: string, media: IMessageMedia): Promise<IMessagingMessage>;

  /**
   * Send a location
   */
  sendLocation(to: string, location: IMessageLocation): Promise<IMessagingMessage>;

  /**
   * Send a generic message
   */
  sendMessage(options: ISendMessageOptions): Promise<IMessagingMessage>;

  /**
   * Get message status
   */
  getMessageStatus(messageId: string): Promise<MessagingStatus>;

  /**
   * Mark message as read
   */
  markAsRead(messageId: string): Promise<void>;

  /**
   * List available templates
   */
  listTemplates(): Promise<ITemplateMessage[]>;

  /**
   * Verify webhook signature
   */
  verifyWebhook(payload: string, signature: string): IWebhookVerification;

  /**
   * Parse webhook payload
   */
  parseWebhookPayload(payload: unknown): IMessagingWebhookPayload | null;
}
