/**
 * Consent Enforcement Middleware
 *
 * GDPR Article 7 compliant consent verification middleware.
 * Ensures all operations on personal data have valid consent.
 *
 * Features:
 * - Checks consent before data processing operations
 * - Logs all consent enforcement decisions
 * - Supports multiple consent types
 * - Caches consent status for performance
 */

import { createDatabaseClient } from '../database.js';
import { createLogger } from '../logger.js';

const logger = createLogger({ name: 'consent-enforcement' });

/**
 * Consent types supported by the system
 */
export type ConsentType =
  | 'marketing'
  | 'communication'
  | 'medical_data'
  | 'analytics'
  | 'third_party_sharing';

/**
 * Consent check result
 */
export interface ConsentCheckResult {
  allowed: boolean;
  consentType: ConsentType;
  consentRecordId?: string;
  grantedAt?: Date;
  reason?: string;
}

/**
 * Consent enforcement options
 */
export interface ConsentEnforcementOptions {
  /**
   * Whether to log enforcement decisions
   * @default true
   */
  logDecisions?: boolean;

  /**
   * Whether to cache consent status
   * @default true
   */
  useCache?: boolean;

  /**
   * Cache TTL in seconds
   * @default 300 (5 minutes)
   */
  cacheTtlSeconds?: number;

  /**
   * Whether to allow operations when consent check fails (fail-open vs fail-close)
   * SECURITY: Should be false in production
   * @default false
   */
  allowOnError?: boolean;
}

/**
 * In-memory consent cache
 * In production, this should be replaced with Redis
 */
const consentCache = new Map<
  string,
  { result: ConsentCheckResult; expiresAt: number }
>();

/**
 * Clear expired cache entries
 */
function cleanCache(): void {
  const now = Date.now();
  for (const [key, entry] of consentCache.entries()) {
    if (entry.expiresAt < now) {
      consentCache.delete(key);
    }
  }
}

// Clean cache periodically
setInterval(cleanCache, 60000); // Every minute

/**
 * Generate cache key for consent lookup
 */
function getCacheKey(
  phone: string,
  consentType: ConsentType,
  hubspotContactId?: string
): string {
  return `consent:${phone}:${consentType}:${hubspotContactId ?? 'none'}`;
}

/**
 * Check if consent is granted for a specific operation
 *
 * @param phone - Phone number to check consent for
 * @param consentType - Type of consent required
 * @param options - Enforcement options
 * @returns Consent check result
 */
export async function checkConsent(
  phone: string,
  consentType: ConsentType,
  hubspotContactId?: string,
  options: ConsentEnforcementOptions = {}
): Promise<ConsentCheckResult> {
  const { useCache = true, cacheTtlSeconds = 300, allowOnError = false } = options;

  // Check cache first
  if (useCache) {
    const cacheKey = getCacheKey(phone, consentType, hubspotContactId);
    const cached = consentCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Consent cache hit', { phone: phone.slice(-4), consentType });
      return cached.result;
    }
  }

  try {
    const db = createDatabaseClient();

    // Query consent record
    const result = await db.query(
      `SELECT id, granted, granted_at, withdrawn_at
       FROM consent_records
       WHERE phone = $1
         AND consent_type = $2
         AND deleted_at IS NULL
         AND (hubspot_contact_id = $3 OR $3 IS NULL)
       ORDER BY created_at DESC
       LIMIT 1`,
      [phone, consentType, hubspotContactId ?? null]
    );

    const record = result.rows[0] as
      | { id: string; granted: boolean; granted_at: Date; withdrawn_at: Date | null }
      | undefined;

    let checkResult: ConsentCheckResult;

    if (!record) {
      // No consent record found
      checkResult = {
        allowed: false,
        consentType,
        reason: 'No consent record found',
      };
    } else if (!record.granted) {
      // Consent explicitly denied
      checkResult = {
        allowed: false,
        consentType,
        consentRecordId: record.id,
        reason: 'Consent not granted',
      };
    } else if (record.withdrawn_at) {
      // Consent was withdrawn
      checkResult = {
        allowed: false,
        consentType,
        consentRecordId: record.id,
        reason: 'Consent withdrawn',
      };
    } else {
      // Consent granted and active
      checkResult = {
        allowed: true,
        consentType,
        consentRecordId: record.id,
        grantedAt: record.granted_at,
      };
    }

    // Cache the result
    if (useCache) {
      const cacheKey = getCacheKey(phone, consentType, hubspotContactId);
      consentCache.set(cacheKey, {
        result: checkResult,
        expiresAt: Date.now() + cacheTtlSeconds * 1000,
      });
    }

    return checkResult;
  } catch (error) {
    logger.error('Consent check failed', {
      phone: phone.slice(-4),
      consentType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    if (allowOnError) {
      logger.warn('Allowing operation despite consent check failure (allowOnError=true)');
      return {
        allowed: true,
        consentType,
        reason: 'Consent check failed - allowing due to configuration',
      };
    }

    return {
      allowed: false,
      consentType,
      reason: 'Consent verification failed',
    };
  }
}

/**
 * Log a consent enforcement decision
 *
 * @param decision - The enforcement decision details
 */
export async function logConsentEnforcement(decision: {
  requestType: string;
  entityType: string;
  entityId: string;
  userId?: string;
  consentType: ConsentType;
  consentGranted: boolean;
  consentRecordId?: string;
  actionAllowed: boolean;
  denialReason?: string;
  correlationId?: string;
  ipAddress?: string;
}): Promise<void> {
  try {
    const db = createDatabaseClient();

    await db.query(
      `INSERT INTO consent_enforcement_log
       (request_type, entity_type, entity_id, user_id, consent_type,
        consent_granted, consent_record_id, action_allowed, denial_reason,
        correlation_id, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        decision.requestType,
        decision.entityType,
        decision.entityId,
        decision.userId ?? null,
        decision.consentType,
        decision.consentGranted,
        decision.consentRecordId ?? null,
        decision.actionAllowed,
        decision.denialReason ?? null,
        decision.correlationId ?? null,
        decision.ipAddress ?? null,
      ]
    );
  } catch (error) {
    // Log but don't throw - enforcement logging shouldn't block operations
    logger.error('Failed to log consent enforcement decision', {
      requestType: decision.requestType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Enforce consent for an operation
 *
 * @param phone - Phone number to check consent for
 * @param consentType - Type of consent required
 * @param operation - Operation details for logging
 * @param options - Enforcement options
 * @returns True if operation is allowed, throws if denied
 */
export async function enforceConsent(
  phone: string,
  consentType: ConsentType,
  operation: {
    type: string;
    entityType: string;
    entityId: string;
    userId?: string;
    correlationId?: string;
    ipAddress?: string;
  },
  options: ConsentEnforcementOptions = {}
): Promise<boolean> {
  const { logDecisions = true } = options;

  const checkResult = await checkConsent(phone, consentType, undefined, options);

  if (logDecisions) {
    await logConsentEnforcement({
      requestType: operation.type,
      entityType: operation.entityType,
      entityId: operation.entityId,
      userId: operation.userId,
      consentType,
      consentGranted: checkResult.allowed,
      consentRecordId: checkResult.consentRecordId,
      actionAllowed: checkResult.allowed,
      denialReason: checkResult.reason,
      correlationId: operation.correlationId,
      ipAddress: operation.ipAddress,
    });
  }

  if (!checkResult.allowed) {
    logger.warn('Consent enforcement denied operation', {
      phone: phone.slice(-4),
      consentType,
      operationType: operation.type,
      reason: checkResult.reason,
    });

    throw new ConsentDeniedError(
      `Operation denied: ${checkResult.reason}`,
      consentType,
      checkResult.consentRecordId
    );
  }

  return true;
}

/**
 * Error thrown when consent is denied
 */
export class ConsentDeniedError extends Error {
  constructor(
    message: string,
    public readonly consentType: ConsentType,
    public readonly consentRecordId?: string
  ) {
    super(message);
    this.name = 'ConsentDeniedError';
  }
}

/**
 * Middleware function for Express/Fastify-style frameworks
 */
export function createConsentMiddleware(
  consentType: ConsentType,
  options: ConsentEnforcementOptions = {}
) {
  return async function consentMiddleware(
    request: { body?: { phone?: string }; headers?: Record<string, string> },
    _response: unknown,
    next: (error?: Error) => void
  ): Promise<void> {
    const phone = request.body?.phone;

    if (!phone) {
      // No phone in request - skip consent check
      next();
      return;
    }

    try {
      await enforceConsent(phone, consentType, {
        type: 'middleware_check',
        entityType: 'request',
        entityId: 'unknown',
        correlationId: request.headers?.['x-correlation-id'],
        ipAddress: request.headers?.['x-forwarded-for'] ?? request.headers?.['x-real-ip'],
      }, options);

      next();
    } catch (error) {
      next(error as Error);
    }
  };
}

/**
 * Invalidate cached consent for a phone number
 * Call this when consent is updated or withdrawn
 */
export function invalidateConsentCache(phone: string, consentType?: ConsentType): void {
  if (consentType) {
    // Invalidate specific consent type
    for (const key of consentCache.keys()) {
      if (key.startsWith(`consent:${phone}:${consentType}:`)) {
        consentCache.delete(key);
      }
    }
  } else {
    // Invalidate all consent types for phone
    for (const key of consentCache.keys()) {
      if (key.startsWith(`consent:${phone}:`)) {
        consentCache.delete(key);
      }
    }
  }
}
