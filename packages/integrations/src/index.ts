export {
  HubSpotClient,
  createHubSpotClient,
  type HubSpotClientConfig,
  type TimelineEventInput,
  type TaskInput,
} from './hubspot.js';

export {
  WhatsAppClient,
  createWhatsAppClient,
  TEMPLATE_CATALOG,
  type WhatsAppClientConfig,
  type SendTextOptions,
  type SendTemplateOptions,
  type TemplateComponent,
  type MessageResponse,
  type TemplateName,
} from './whatsapp.js';

export {
  OpenAIClient,
  createOpenAIClient,
  type OpenAIClientConfig,
  type ChatMessage,
  type ChatCompletionOptions,
  type AIReplyOptions,
} from './openai.js';
