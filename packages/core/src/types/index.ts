/**
 * Type System - State of the Art TypeScript Utilities
 *
 * This module provides enterprise-grade type utilities for building
 * type-safe, maintainable, and robust TypeScript applications.
 *
 * @module types
 */

// ============================================================================
// BRANDED TYPES - Nominal Typing for Domain Safety
// ============================================================================
export {
  // Brand utilities
  type Brand,
  type Flavor,

  // Domain IDs
  type PatientId,
  type LeadId,
  type AppointmentId,
  type DoctorId,
  type ConsentId,
  type TaskId,
  type MessageId,
  type HubSpotContactId,
  type CorrelationId,
  type TraceId,
  type SpanId,
  type UserId,
  type SessionId,
  type TenantId,

  // Phone types
  type E164PhoneNumber,
  type RomanianPhoneNumber,

  // Timestamp types
  type ISOTimestamp,
  type UnixTimestampMs,
  type UnixTimestampSec,

  // Medical domain types
  type LeadScore,
  type ConfidenceScore,
  type CNP,
  type EmailAddress,

  // Creators & validators
  createE164PhoneNumber,
  createRomanianPhoneNumber,
  createPatientId,
  createLeadId,
  createAppointmentId,
  createCorrelationId,
  createTraceId,
  createUserId,
  createTaskId,
  createISOTimestamp,
  dateToISOTimestamp,
  createLeadScore,
  createConfidenceScore,
  createEmailAddress,

  // Assertions
  assertPatientId,
  assertE164PhoneNumber,
  assertLeadScore,
  assertConfidenceScore,

  // Utility types
  type Unbrand,
  type PartialBranded,
  type Rebrand,
} from './branded.js';

// ============================================================================
// RESULT TYPE - Functional Error Handling
// ============================================================================
export {
  // Core types
  type Result,
  type Ok,
  type Err,
  type Option,
  type Some,
  type None,
  type AsyncResult,

  // Constructors
  Ok,
  Err,
  Some,
  None,

  // Utility functions
  tryCatch,
  tryCatchAsync,
  fromNullable,
  toNullable,
  all,
  combine,
  firstOk,
  partition,
  traverse,
  traverseAsync,
  traverseParallel,

  // Type guards
  isOk,
  isErr,
  isSome,
  isNone,

  // AsyncResult utilities
  AsyncResult,
} from './result.js';

// ============================================================================
// UTILITY TYPES - Advanced TypeScript Utilities
// ============================================================================
export {
  // Deep modifiers
  type DeepReadonly,
  type DeepMutable,
  type DeepPartial,
  type DeepRequired,

  // Object utilities
  type PickByValue,
  type OmitByValue,
  type RequireKeys,
  type OptionalKeys,
  type NullableKeys,
  type OptionalKeysOf,
  type RequiredKeysOf,
  type Merge,
  type AtLeastOne,
  type ExactlyOne,

  // Function utilities
  type Parameters,
  type ReturnType,
  type AsyncReturnType,
  type Promisify,
  type FirstParameter,
  type LastParameter,

  // Array utilities
  type ArrayElement,
  type Tuple,
  type NonEmptyArray,
  type IsNonEmpty,
  type Head,
  type Tail,
  type Last,

  // String utilities
  type Capitalize,
  type Uncapitalize,
  type CamelCase,
  type SnakeCase,
  type KebabCase,
  type KeysToUnion,
  type ValuesToUnion,

  // Discriminated union utilities
  type ExtractDiscriminant,
  type ExcludeDiscriminant,
  type DiscriminantValues,
  type DiscriminatedUnion,

  // JSON types
  type JsonPrimitive,
  type JsonArray,
  type JsonObject,
  type JsonValue,
  type JsonSerializable,

  // Type guards & assertions
  assertDefined,
  assertString,
  assertNumber,
  assertObject,
  assertArray,
  isDefined,
  isString,
  isNumber,
  isBoolean,
  isObject,
  isArray,
  isNonEmptyArray,
  isFunction,
  isDate,
  isError,
  hasKey,
  hasKeys,

  // Exhaustive checking
  exhaustive,
  exhaustiveWithDefault,

  // Safe access
  safeGet,
  safeSet,

  // Clone & freeze
  deepClone,
  deepFreeze,
} from './utils.js';

// ============================================================================
// EVENT SYSTEM - Type-Safe Domain Events
// ============================================================================
export {
  // Base types
  type BaseEvent,

  // Lead events
  type LeadScoredEvent,
  type LeadCreatedEvent,
  type LeadQualifiedEvent,
  type LeadDisqualifiedEvent,

  // Appointment events
  type AppointmentScheduledEvent,
  type AppointmentCancelledEvent,
  type AppointmentRescheduledEvent,
  type AppointmentCompletedEvent,
  type AppointmentConsentViolationEvent,

  // Consent events
  type ConsentRecordedEvent,
  type ConsentWithdrawnEvent,

  // Messaging events
  type WhatsAppMessageSentEvent,
  type WhatsAppMessageReceivedEvent,

  // Workflow events
  type WorkflowTriggeredEvent,
  type WorkflowCompletedEvent,

  // AI events
  type AIOutputValidationIssueEvent,
  type AIReasoningValidationFailedEvent,

  // Patient events
  type PatientCreatedEvent,
  type PatientUpdatedEvent,

  // Union types
  type DomainEvent,
  type DomainEventType,
  type EventByType,
  type EventPayload,

  // Handler types
  type EventHandlerMap,
  type PartialEventHandlerMap,
  type AsyncEventHandlerMap,

  // Event handling functions
  handleEvent,
  handleEventPartial,
  handleEventAsync,
  createEvent,

  // Event filtering
  filterEventsByType,
  filterEventsByAggregate,
  filterEventsByAggregateType,
  filterEventsByTimeRange,

  // Type guards
  isEventType,
  isLeadEvent,
  isAppointmentEvent,
  isConsentEvent,
  isPatientEvent,
} from './events.js';

// ============================================================================
// PIPELINE - Functional Composition
// ============================================================================
export {
  // Core composition
  pipe,
  flow,
  compose,

  // Async composition
  pipeAsync,

  // Result composition
  pipeResult,
  pipeResultAsync,

  // Side effects
  tap,
  tapAsync,
  tapIf,

  // Conditional transforms
  when,
  ifElse,
  match,

  // Array operators
  map,
  filter,
  reduce,
  flatMap,
  sort,
  take,
  skip,
  unique,
  uniqueBy,
  groupBy,
  partition as partitionArray,

  // Object operators
  pick,
  omit,
  merge,
  mapValues,
  filterEntries,

  // Validation
  type ValidationError,
  validator,
  validators,
} from './pipeline.js';

// ============================================================================
// DEPENDENCY INJECTION - Type-Safe DI Container
// ============================================================================
export {
  // Core types
  type Lifecycle,
  type Factory,
  type Container,

  // Factory functions
  createContainer,

  // Module pattern
  type Module,
  defineModule,

  // Async container
  type AsyncFactory,
  type AsyncContainer,
  createAsyncContainer,

  // Scoping
  type ScopeFactory,
  createScopeFactory,

  // Type utilities
  type ServiceType,
  type ServiceOf,
  type OptionalServices,
} from './di.js';
