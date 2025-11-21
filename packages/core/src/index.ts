/**
 * @medicalcor/core
 *
 * Core utilities and services for the MedicalCor platform.
 */

// Logger exports
export {
  createLogger,
  createChildLogger,
  withCorrelation,
  safeLog,
  logger,
  REDACTION_PATHS,
  redactString,
  type LoggerConfig,
  type LogContext,
  type Logger,
} from "./logger/index.js";

// Phone normalization
export { normalizePhone, isValidRomanianPhone, formatPhoneForDisplay } from "./phone.js";

// Domain event helpers
export { createDomainEvent, type DomainEvent, type EventMetadata } from "./events.js";
