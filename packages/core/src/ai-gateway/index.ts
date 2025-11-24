/**
 * AI-First API Gateway
 *
 * Makes the API 10x easier for LLMs to use with:
 * - OpenAI-compatible function calling format
 * - Anthropic/Claude-compatible tool schemas
 * - Natural language intent detection
 * - Multi-step workflow execution
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
} from './medical-functions.js';
