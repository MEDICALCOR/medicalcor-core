/**
 * GDPR Compliance Hook for Claude Agent SDK
 *
 * Ensures all agent operations respect GDPR requirements:
 * - Validates consent before processing personal data
 * - Prevents operations on patients who have withdrawn consent
 * - Logs all data access for audit trail
 */

import { z } from 'zod';

/**
 * GDPR consent status
 */
export const GDPRConsentStatusSchema = z.enum([
  'granted',
  'withdrawn',
  'expired',
  'pending',
  'unknown',
]);

export type GDPRConsentStatus = z.infer<typeof GDPRConsentStatusSchema>;

/**
 * Consent check result
 */
export interface ConsentCheckResult {
  allowed: boolean;
  status: GDPRConsentStatus;
  reason?: string;
  expiresAt?: Date;
}

/**
 * GDPR Hook configuration
 */
export interface GDPRHookConfig {
  /** Function to check consent status for a patient */
  checkConsent: (patientId: string) => Promise<ConsentCheckResult>;
  /** Function to log data access */
  logAccess?: (event: GDPRAccessEvent) => Promise<void>;
  /** Whether to block operations on unknown consent status */
  blockOnUnknown?: boolean;
  /** Tools that require consent check */
  consentRequiredTools?: string[];
}

/**
 * GDPR access event for audit logging
 */
export interface GDPRAccessEvent {
  timestamp: Date;
  agentId: string;
  toolName: string;
  patientId?: string;
  action: 'allowed' | 'blocked' | 'error';
  consentStatus: GDPRConsentStatus;
  reason?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Default tools that require consent verification
 */
const DEFAULT_CONSENT_REQUIRED_TOOLS = [
  'get_patient',
  'update_patient',
  'get_patient_history',
  'send_whatsapp',
  'send_email',
  'schedule_appointment',
  'get_medical_records',
  'update_medical_records',
];

/**
 * Extract patient ID from tool input
 */
function extractPatientId(toolName: string, input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;

  const inputObj = input as Record<string, unknown>;

  // Common patient ID field names
  const patientIdFields = [
    'patientId',
    'patient_id',
    'leadId',
    'lead_id',
    'contactId',
    'contact_id',
    'phone',
    'hubspotContactId',
  ];

  for (const field of patientIdFields) {
    if (typeof inputObj[field] === 'string') {
      return inputObj[field] as string;
    }
  }

  return undefined;
}

/**
 * Create a GDPR compliance hook for agent tool calls
 *
 * @example
 * ```typescript
 * const gdprHook = createGDPRHook({
 *   checkConsent: async (patientId) => {
 *     const consent = await consentService.check(patientId);
 *     return {
 *       allowed: consent.status === 'granted',
 *       status: consent.status,
 *       expiresAt: consent.expiresAt,
 *     };
 *   },
 *   logAccess: async (event) => {
 *     await auditLog.record(event);
 *   },
 * });
 * ```
 */
export function createGDPRHook(config: GDPRHookConfig) {
  const {
    checkConsent,
    logAccess,
    blockOnUnknown = false,
    consentRequiredTools = DEFAULT_CONSENT_REQUIRED_TOOLS,
  } = config;

  /**
   * Pre-execution hook - validates consent before tool execution
   */
  async function beforeToolCall(
    agentId: string,
    toolName: string,
    input: unknown
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Check if this tool requires consent
    if (!consentRequiredTools.includes(toolName)) {
      return { allowed: true };
    }

    // Extract patient ID from input
    const patientId = extractPatientId(toolName, input);

    if (!patientId) {
      // No patient ID found - allow but log warning
      if (logAccess) {
        await logAccess({
          timestamp: new Date(),
          agentId,
          toolName,
          action: 'allowed',
          consentStatus: 'unknown',
          reason: 'No patient ID in request',
        });
      }
      return { allowed: true };
    }

    try {
      // Check consent status
      const consentResult = await checkConsent(patientId);

      const accessEvent: GDPRAccessEvent = {
        timestamp: new Date(),
        agentId,
        toolName,
        patientId,
        action: consentResult.allowed ? 'allowed' : 'blocked',
        consentStatus: consentResult.status,
        reason: consentResult.reason,
      };

      // Log the access attempt
      if (logAccess) {
        await logAccess(accessEvent);
      }

      // Block if consent not granted
      if (!consentResult.allowed) {
        return {
          allowed: false,
          reason: `GDPR: Consent ${consentResult.status} for patient ${patientId}. ${consentResult.reason ?? ''}`,
        };
      }

      // Block on unknown if configured
      if (blockOnUnknown && consentResult.status === 'unknown') {
        return {
          allowed: false,
          reason: `GDPR: Consent status unknown for patient ${patientId}. Explicit consent required.`,
        };
      }

      return { allowed: true };
    } catch (error) {
      // Log error and fail safely (block by default)
      if (logAccess) {
        await logAccess({
          timestamp: new Date(),
          agentId,
          toolName,
          patientId,
          action: 'error',
          consentStatus: 'unknown',
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      return {
        allowed: false,
        reason: `GDPR: Failed to verify consent for patient ${patientId}. Blocking for safety.`,
      };
    }
  }

  /**
   * Post-execution hook - logs successful operations
   */
  async function afterToolCall(
    agentId: string,
    toolName: string,
    input: unknown,
    _output: unknown
  ): Promise<void> {
    if (!logAccess) return;

    const patientId = extractPatientId(toolName, input);

    await logAccess({
      timestamp: new Date(),
      agentId,
      toolName,
      patientId,
      action: 'allowed',
      consentStatus: 'granted',
      reason: 'Tool execution completed successfully',
    });
  }

  return {
    beforeToolCall,
    afterToolCall,
    consentRequiredTools,
  };
}

/**
 * PII fields that should be redacted in logs
 */
export const PII_FIELDS = [
  'phone',
  'email',
  'firstName',
  'lastName',
  'fullName',
  'name',
  'dateOfBirth',
  'dob',
  'address',
  'ssn',
  'cnp', // Romanian personal ID
  'insuranceId',
  'medicalRecordNumber',
  'mrn',
];

/**
 * Redact PII from an object for safe logging
 */
export function redactPII<T extends Record<string, unknown>>(obj: T): T {
  const redacted = { ...obj };

  for (const key of Object.keys(redacted)) {
    const lowerKey = key.toLowerCase();

    if (PII_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      redacted[key as keyof T] = '[REDACTED]' as T[keyof T];
    } else if (typeof redacted[key] === 'object' && redacted[key] !== null) {
      redacted[key as keyof T] = redactPII(redacted[key] as Record<string, unknown>) as T[keyof T];
    }
  }

  return redacted;
}
