/**
 * @fileoverview Advanced Type System Library
 *
 * State-of-the-art TypeScript patterns for enterprise applications:
 *
 * - **Primitives**: Branded/nominal types, phantom types, template literals
 * - **Result/Option**: Functional error handling monads
 * - **Builders**: Type-safe fluent builders with step tracking
 * - **Matching**: Exhaustive pattern matching utilities
 * - **Guards**: Runtime type guards and assertions
 * - **API**: Response handling with discriminated unions
 * - **Events**: Type-safe event system with inference
 *
 * @module @medicalcor/types/lib
 * @version 2.0.0
 */

// =============================================================================
// PRIMITIVES - Branded Types, Phantom Types, Type Utilities
// =============================================================================
export {
  // Branded type infrastructure
  type Brand,
  type Unbrand,
  brand,

  // Domain branded types
  type LeadId,
  type PatientId,
  type HubSpotContactId,
  type TreatmentPlanId,
  type AppointmentId,
  type CallId,
  type MessageId,
  type InteractionId,
  type ClinicId,
  type UserId,
  type E164PhoneNumber,
  type EmailAddress,
  type StripePaymentIntentId,
  type StripeCustomerId,
  type TraceId,
  type IdempotencyKey,

  // Branded type constructors
  createLeadId,
  createPatientId,
  createHubSpotContactId,
  createE164PhoneNumber,
  createEmailAddress,
  createTraceId,
  createIdempotencyKey,

  // Phantom types
  type Phantom,
  type LeadState,
  type StatefulLead,

  // Template literal types
  type EventName,
  type DomainEventName,
  type ExtractDomain,
  type ExtractEntity,
  type ExtractAction,
  type ApiEndpoint,
  type WebhookEndpoint,

  // Conditional types
  type RequireFields,
  type OptionalFields,
  type DeepReadonly,
  type DeepMutable,
  type DeepPartial,
  type DeepRequired,
  type NonNullableKeys,
  type NullableKeys,
  type PickByType,
  type OmitByType,
  type FunctionKeys,
  type NonFunctionKeys,

  // Mapped types
  type Prefixed,
  type Suffixed,
  type CamelCase,
  type SnakeCase,
  type CamelCaseKeys,
  type SnakeCaseKeys,
  type ValueOf,
  type Paths,
  type PathValue,

  // Tuple types
  type Prepend,
  type Append,
  type Head,
  type Tail,
  type Last,
  type Init,
  type Length,
  type Concat,

  // Union types
  type UnionToIntersection,
  type LastOfUnion,
  type UnionToTuple,
  type IsUnion,

  // Zod branded schemas
  LeadIdSchema,
  PatientIdSchema,
  HubSpotContactIdSchema,
  E164PhoneNumberSchema,
  EmailAddressSchema,
  TraceIdSchema,
  IdempotencyKeySchema,

  // Type assertions
  type Assert,
  type Equals,
  type Extends,
  type IsNever,
  type IsAny,
  type IsUnknown,

  // Utilities
  asConst,
  tuple,
  object,
  assertNever,
  exhaustive,
} from './primitives.js';

// =============================================================================
// RESULT/OPTION - Functional Error Handling
// =============================================================================
export type { Result, Ok, Err, Option, Some, None, AsyncResult } from './result.js';
export {
  Ok as ok,
  Err as err,
  isOk,
  isErr,
  Result as ResultOps,
  Some as some,
  None as none,
  isSome,
  isNone,
  Option as OptionOps,
  AsyncResult as AsyncResultOps,
  Do,
  pipe,
  flow,
  identity,
  constant,
} from './result.js';

// =============================================================================
// BUILDERS - Type-Safe Fluent APIs
// =============================================================================
export {
  // Generic builder
  TypeSafeBuilder,
  createBuilder,

  // Lead builder
  type LeadData,
  LeadBuilder,

  // Event builder
  type EventData,
  EventBuilder,

  // API request builder
  type HttpMethod,
  type ApiRequestConfig,
  ApiRequestBuilder,

  // Schema builder
  SchemaBuilder,

  // Query builder
  type FilterOperator,
  type FilterCondition,
  type SortDirection,
  type SortSpec,
  type QueryConfig,
  QueryBuilder,
} from './builder.js';

// =============================================================================
// PATTERN MATCHING - Exhaustive Matching Utilities
// =============================================================================
export {
  // Type utilities
  type Discriminant,
  type VariantOf,
  type DiscriminantValues,
  type HandlerMap,
  type PartialHandlerMap,

  // Matching functions
  match,
  matchOn,
  matchPartial,

  // Fluent matcher
  Matcher,

  // Union matcher
  UnionMatcher,

  // Tagged unions
  TAG,
  variant,
  makeVariant,
  isVariant,
  tagIs,

  // Pattern utilities
  type Pattern,
  _,
  P,
  matchesPattern,

  // Switch expression
  switchExpr,

  // Conditionals
  cond,
  condLazy,
  coalesce,
  firstTruthy,
} from './match.js';

// =============================================================================
// TYPE GUARDS - Runtime Type Checking
// =============================================================================
export {
  // Primitive guards
  isString,
  isNumber,
  isFiniteNumber,
  isInteger,
  isPositive,
  isNonNegative,
  isBoolean,
  isBigInt,
  isSymbol,
  isFunction,
  isUndefined,
  isNull,
  isNullish,
  isNonNullish,

  // Object guards
  isObject,
  isPlainObject,
  isArray,
  isArrayOf,
  isNonEmptyArray,
  isDate,
  isError,
  isPromise,
  isMap,
  isSet,
  isRegExp,

  // String format guards
  isNonEmptyString,
  isTrimmedNonEmptyString,
  isUUID,
  isE164Phone,
  isRomanianPhone,
  isEmail,
  isURL,
  isHTTPSUrl,
  isISODateString,
  isJSONString,

  // Domain guards
  isLeadSource,
  isLeadStatus,
  isLeadPriority,
  isLeadScore,
  isAIScore,
  isConfidence,

  // Discriminated union guards
  hasTag,
  isTagged,
  hasKeys,
  hasKeyOfType,

  // Assertion functions
  AssertionError,
  assert,
  assertDefined,
  assertString,
  assertNumber,
  assertObject,
  assertArray,
  assertSchema,
  assertNever as assertNeverGuard,

  // Validation utilities
  type ValidationError,
  type ValidationResult,
  validate,
  formatZodError,
  createValidator,
  createGuard,
  createAssertion,

  // Refinement
  refine,
  refineWith,
  narrow,
  getProperty,
  getNestedProperty,

  // Parsers
  parseJSON,
  parseNumber,
  parseInteger,
  parseBoolean,
  parseDate,
} from './guards.js';

// =============================================================================
// API RESPONSE - Discriminated Union Responses
// =============================================================================
export {
  // Status codes
  SuccessStatusCodes,
  ClientErrorStatusCodes,
  ServerErrorStatusCodes,
  HttpStatusCodes,
  type HttpStatusCode,
  type SuccessStatusCode,
  type ClientErrorStatusCode,
  type ServerErrorStatusCode,

  // Error codes
  ErrorCodes,
  type ErrorCode,

  // API error
  type ApiError,
  createApiError,
  mapErrorCodeToStatus,

  // Response types
  type ApiSuccessResponse,
  type ApiErrorResponse,
  type ApiResponse,
  type ResponseMeta,
  type PaginationMeta,

  // Type guards
  isSuccessResponse,
  isErrorResponse,

  // Response builders
  success,
  error,
  validationError,
  notFoundError,
  unauthorizedError,
  forbiddenError,
  internalError,

  // Paginated response
  type PaginatedData,
  type PaginatedResponse,
  paginatedSuccess,
  createPaginationMeta,

  // Zod schemas
  ApiErrorSchema,
  ResponseMetaSchema,
  createApiResponseSchema,
  PaginationMetaSchema,
  createPaginatedResponseSchema,

  // Response utilities
  mapResponse,
  flatMapResponse,
  combineResponses,
  unwrapResponse,
  unwrapResponseOr,
  recoverResponse,
  wrapAsync,
  wrapSync,

  // Batch operations
  type BatchItemResult,
  type BatchResponse,
  batchSuccess,
} from './api.js';

// =============================================================================
// EVENTS - Type-Safe Event System
// =============================================================================
export {
  // Base types
  type EventMetadata,
  type BaseEvent,
  createEventMetadata,

  // Event definition
  type EventDefinition,
  defineEvent,

  // Domain events - Lead
  type LeadCreatedPayload,
  type LeadScoredPayload,
  type LeadQualifiedPayload,
  type LeadAssignedPayload,
  type LeadStatusChangedPayload,
  LeadCreated,
  LeadScored,
  LeadQualified,
  LeadAssigned,
  LeadStatusChanged,

  // Domain events - WhatsApp
  type WhatsAppMessageReceivedPayload,
  type WhatsAppMessageSentPayload,
  type WhatsAppStatusUpdatePayload,
  WhatsAppMessageReceived,
  WhatsAppMessageSent,
  WhatsAppStatusUpdate,

  // Domain events - Voice
  type VoiceCallInitiatedPayload,
  type VoiceCallCompletedPayload,
  type VoiceTranscriptReadyPayload,
  VoiceCallInitiated,
  VoiceCallCompleted,
  VoiceTranscriptReady,

  // Domain events - Payment
  type PaymentReceivedPayload,
  type PaymentFailedPayload,
  PaymentReceived,
  PaymentFailed,

  // Domain events - Appointment
  type AppointmentScheduledPayload,
  type AppointmentReminderSentPayload,
  type AppointmentCancelledPayload,
  AppointmentScheduled,
  AppointmentReminderSent,
  AppointmentCancelled,

  // Domain events - Consent
  type ConsentRecordedPayload,
  ConsentRecorded,

  // Event union
  type DomainEventType,
  type DomainEventUnion,
  type DomainEventTypeLiteral,

  // Event handlers
  type EventHandler,
  type EventHandlerMap,
  type PartialEventHandlerMap,

  // Event bus
  type Subscription,
  type EventBusOptions,
  EventBus,

  // Event store
  type EventStore,

  // Event sourcing
  type EventReducer,
  replayEvents,
  ProjectionBuilder,
  projection,

  // Event matchers
  matchEvent,
  filterEvents,
  groupEventsByType,
} from './events.js';
