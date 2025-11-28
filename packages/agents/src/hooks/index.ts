/**
 * Agent Hooks - GDPR compliance and audit logging
 */

export {
  createGDPRHook,
  redactPII,
  PII_FIELDS,
  type GDPRHookConfig,
  type GDPRAccessEvent,
  type ConsentCheckResult,
  type GDPRConsentStatus,
  GDPRConsentStatusSchema,
} from './gdpr-hook.js';

export {
  createAuditHook,
  createInMemoryAuditStore,
  type AuditHookConfig,
  type AuditEvent,
  type AuditEventType,
} from './audit-hook.js';
