/**
 * AI-First API Gateway (Quantum Leap Architecture)
 *
 * Makes the API 10x easier for LLMs to use with:
 * - OpenAI-compatible function calling format
 * - Anthropic/Claude-compatible tool schemas
 * - Natural language intent detection
 * - Multi-step workflow execution
 * - Conversation context management
 * - Function execution with dependency injection
 */

export {
  FunctionRegistry,
  functionRegistry,
  RegisterFunction,
  zodToJsonSchema,
  type AIFunction,
  type AIFunctionCall,
  type AIFunctionResult,
  type AIFunctionCategory,
  type AIFunctionExample,
  type FunctionContext,
  type JSONSchemaProperty,
} from './function-registry.js';

export {
  AIRouter,
  createAIRouter,
  detectIntent,
  AIRequestSchema,
  type AIRequest,
  type AIResponse,
  type AIRouterConfig,
  type DetectedIntent,
} from './ai-router.js';

export {
  // Function definitions
  ALL_MEDICAL_FUNCTIONS,
  FUNCTION_INPUT_SCHEMAS,
  // Individual functions
  ScoreLeadFunction,
  GetPatientFunction,
  UpdatePatientFunction,
  ScheduleAppointmentFunction,
  GetAvailableSlotsFunction,
  CancelAppointmentFunction,
  SendWhatsAppFunction,
  RecordConsentFunction,
  CheckConsentFunction,
  GetLeadAnalyticsFunction,
  TriggerWorkflowFunction,
  GetWorkflowStatusFunction,
  // Input schemas
  ScoreLeadInputSchema,
  GetPatientInputSchema,
  UpdatePatientInputSchema,
  ScheduleAppointmentInputSchema,
  GetAvailableSlotsInputSchema,
  CancelAppointmentInputSchema,
  SendWhatsAppInputSchema,
  RecordConsentInputSchema,
  CheckConsentInputSchema,
  GetLeadAnalyticsInputSchema,
  TriggerWorkflowInputSchema,
  GetWorkflowStatusInputSchema,
  // Security utilities
  detectPromptInjection,
  sanitizeMessageContent,
} from './medical-functions.js';

// Function Executor - Connects AI functions to domain services
export {
  FunctionExecutor,
  createFunctionExecutor,
  type FunctionExecutorDeps,
  type ScoringServicePort,
  type HubSpotServicePort,
  type WhatsAppServicePort,
  type SchedulingServicePort,
  type ConsentServicePort,
  type WorkflowServicePort,
} from './function-executor.js';

// Conversation Context - Session and entity management
export {
  ConversationContextManager,
  conversationContext,
  createConversationContextManager,
  ConversationMessageSchema,
  ExtractedEntitySchema,
  ConversationStateSchema,
  type ConversationMessage,
  type ExtractedEntity,
  type ConversationState,
  type ConversationContextConfig,
} from './conversation-context.js';
