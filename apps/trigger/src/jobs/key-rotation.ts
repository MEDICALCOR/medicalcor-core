/**
 * Scheduled Key Rotation Job
 * Automated quarterly rotation of Data Encryption Keys (DEK) for HIPAA/GDPR compliance
 *
 * This job implements the key rotation automation (Phase 4) to ensure:
 * - Quarterly rotation of encryption keys (every 90 days)
 * - Re-encryption of active PHI/PII data with new DEK
 * - Proper audit logging of rotation events
 * - Security team alerting on rotation success/failure
 *
 * Schedule: First day of every quarter at 3:00 AM UTC
 * Manual trigger: Supported for emergency rotation scenarios
 *
 * @see docs/README/KEY_ROTATION_PROCEDURE.md for manual procedures
 */

import { schedules, task, logger } from '@trigger.dev/sdk/v3';
import { randomBytes, createHash } from 'crypto';
import { z } from 'zod';
import {
  generateCorrelationId,
  getClients,
  getSupabaseClient,
  emitJobEvent,
} from './cron/shared/index.js';
import { createNotificationsService } from '@medicalcor/integrations';

// ============================================
// Types & Schemas
// ============================================

/**
 * Key rotation result
 */
export interface KeyRotationResult {
  success: boolean;
  newKeyVersion: number;
  recordsRotated: number;
  durationMs: number;
  previousKeyFingerprint: string;
  newKeyFingerprint: string;
  errors?: string[];
}

/**
 * Payload for manual key rotation trigger
 */
export const ManualKeyRotationPayloadSchema = z.object({
  reason: z.string().min(1).describe('Reason for manual rotation'),
  requestedBy: z.string().min(1).describe('User ID or system identifier'),
  correlationId: z.string().optional(),
  emergencyRotation: z.boolean().optional().default(false),
});

export type ManualKeyRotationPayload = z.infer<typeof ManualKeyRotationPayloadSchema>;

// ============================================
// Helper Functions
// ============================================

/**
 * Generate cryptographically secure encryption key
 * @returns 32-byte hex string (256 bits)
 */
function generateSecureKey(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Calculate key fingerprint for audit logging
 * Does not expose the actual key
 */
function calculateKeyFingerprint(keyHex: string): string {
  return createHash('sha256').update(Buffer.from(keyHex, 'hex')).digest('hex').slice(0, 16);
}

/**
 * Get notifications service
 */
function getNotificationsService() {
  return createNotificationsService();
}

/**
 * Send security alert notification
 */
async function sendSecurityAlert(params: {
  type: 'rotation_started' | 'rotation_completed' | 'rotation_failed';
  correlationId: string;
  details: Record<string, unknown>;
}): Promise<void> {
  const { type, correlationId, details } = params;

  // Get notification service
  const notifications = getNotificationsService();

  if (!notifications.isConfigured()) {
    logger.warn('Notification service not configured, skipping security alert', { correlationId });
    return;
  }

  const typeMessages = {
    rotation_started: '🔐 Key Rotation Started',
    rotation_completed: '✅ Key Rotation Completed Successfully',
    rotation_failed: '🚨 ALERT: Key Rotation Failed',
  };

  const priority =
    type === 'rotation_failed' ? 'critical' : type === 'rotation_completed' ? 'high' : 'medium';

  try {
    // Broadcast to supervisors/security team
    await notifications.broadcastToSupervisors({
      type: 'system.alert',
      priority,
      reason: typeMessages[type],
      timestamp: new Date().toISOString(),
      correlationId,
      ...details,
    });

    // For failures, also send email alert
    if (type === 'rotation_failed') {
      const securityEmail = process.env.SECURITY_TEAM_EMAIL ?? process.env.DPO_EMAIL;
      if (securityEmail) {
        await notifications.sendEmailNotification(
          securityEmail,
          `🚨 URGENT: Encryption Key Rotation Failed - ${correlationId}`,
          formatAlertEmail('rotation_failed', correlationId, details),
          true
        );
      }
    }

    logger.info('Security alert sent', { type, correlationId });
  } catch (error) {
    logger.error('Failed to send security alert', { error, type, correlationId });
  }
}

/**
 * Format alert email body
 */
function formatAlertEmail(
  type: string,
  correlationId: string,
  details: Record<string, unknown>
): string {
  const timestamp = new Date().toISOString();
  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .alert-box { padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    .critical { background-color: #fee2e2; border: 1px solid #ef4444; }
    .success { background-color: #dcfce7; border: 1px solid #22c55e; }
    .details { background-color: #f3f4f6; padding: 10px; border-radius: 5px; font-family: monospace; }
  </style>
</head>
<body>
  <div class="alert-box ${type === 'rotation_failed' ? 'critical' : 'success'}">
    <h2>${type === 'rotation_failed' ? '🚨 Encryption Key Rotation Failed' : '✅ Key Rotation Complete'}</h2>
    <p><strong>Correlation ID:</strong> ${correlationId}</p>
    <p><strong>Timestamp:</strong> ${timestamp}</p>
  </div>

  <h3>Details</h3>
  <div class="details">
    <pre>${JSON.stringify(details, null, 2)}</pre>
  </div>

  <h3>Required Actions</h3>
  ${
    type === 'rotation_failed'
      ? `
  <ul>
    <li>Review the error details above</li>
    <li>Check database connectivity and encryption service status</li>
    <li>Refer to docs/README/KEY_ROTATION_PROCEDURE.md for manual rotation steps</li>
    <li>Contact the on-call engineer if immediate assistance is needed</li>
  </ul>
  `
      : `
  <p>No action required. Key rotation completed successfully.</p>
  `
  }

  <p><em>This is an automated alert from MedicalCor Key Management System.</em></p>
</body>
</html>
  `.trim();
}

/**
 * Create audit entry for key rotation event
 */
async function createRotationAuditEntry(params: {
  correlationId: string;
  action: 'key_rotation_started' | 'key_rotation_completed' | 'key_rotation_failed';
  actorType: 'cron' | 'user';
  actorId: string;
  actorName?: string;
  previousKeyVersion?: number;
  newKeyVersion?: number;
  recordsRotated?: number;
  durationMs?: number;
  error?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const {
    correlationId,
    action,
    actorType,
    actorId,
    actorName,
    previousKeyVersion,
    newKeyVersion,
    recordsRotated,
    durationMs,
    error,
    reason,
    metadata,
  } = params;

  const { client: supabase } = await getSupabaseClient();
  if (!supabase) {
    logger.warn('Supabase not configured, skipping audit entry', { correlationId });
    return;
  }

  const severity =
    action === 'key_rotation_failed'
      ? 'critical'
      : action === 'key_rotation_completed'
        ? 'high'
        : 'medium';

  const auditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event_type: `security.${action}`,
    aggregate_id: 'encryption-service',
    aggregate_type: 'SecurityService',
    actor_id: actorId,
    actor_type: actorType,
    actor_name: actorName,
    action: 'update',
    reason: reason ?? `Scheduled ${action}`,
    correlation_id: correlationId,
    compliance_tags: ['HIPAA', 'GDPR', 'KEY_ROTATION'],
    severity,
    metadata: {
      ...metadata,
      previousKeyVersion,
      newKeyVersion,
      recordsRotated,
      durationMs,
      error,
    },
  };

  try {
    const { error: insertError } = await supabase.from('audit_log').insert(auditEntry);

    if (insertError) {
      logger.error('Failed to create audit entry', { error: insertError, correlationId });
    } else {
      logger.info('Audit entry created', { auditEntryId: auditEntry.id, correlationId });
    }
  } catch (err) {
    logger.error('Error creating audit entry', { error: err, correlationId });
  }
}

// ============================================
// Key Rotation Core Logic
// ============================================

interface EncryptedRecord {
  id: string;
  encrypted_value: string;
  key_version: number;
}

interface ReEncryptionResult {
  recordsRotated: number;
  errors: string[];
}

interface SupabaseClient {
  from: (table: string) => unknown;
}

/**
 * Re-encrypt a batch of records with the new key
 */
async function reEncryptRecords(params: {
  supabase: SupabaseClient;
  newKeyHex: string;
  newKeyVersion: number;
  correlationId: string;
}): Promise<ReEncryptionResult> {
  const { supabase, newKeyHex, newKeyVersion, correlationId } = params;
  const BATCH_SIZE = 100;
  let recordsRotated = 0;
  const errors: string[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data: records, error: fetchError } = await (
      supabase as {
        from: (table: string) => {
          select: (cols: string) => {
            is: (
              col: string,
              val: null
            ) => {
              range: (
                start: number,
                end: number
              ) => Promise<{ data: EncryptedRecord[] | null; error: { message: string } | null }>;
            };
          };
        };
      }
    )
      .from('encrypted_data')
      .select('id, encrypted_value, key_version')
      .is('deleted_at', null)
      .range(offset, offset + BATCH_SIZE - 1);

    if (fetchError) {
      errors.push(`Batch fetch error at offset ${offset}: ${fetchError.message}`);
      break;
    }

    if (!records || records.length === 0) {
      hasMore = false;
      break;
    }

    for (const record of records) {
      try {
        const { createEncryptionService } = await import('@medicalcor/core');
        const oldService = createEncryptionService();
        const plaintext = oldService.decrypt(record.encrypted_value);

        const originalKey = process.env.DATA_ENCRYPTION_KEY;
        process.env.DATA_ENCRYPTION_KEY = newKeyHex;
        const newService = createEncryptionService();
        const { encryptedValue } = newService.encrypt(plaintext);
        process.env.DATA_ENCRYPTION_KEY = originalKey;

        const { error: updateError } = await (
          supabase as {
            from: (table: string) => {
              update: (data: object) => {
                eq: (col: string, val: string) => Promise<{ error: { message: string } | null }>;
              };
            };
          }
        )
          .from('encrypted_data')
          .update({
            encrypted_value: encryptedValue,
            key_version: newKeyVersion,
            updated_at: new Date().toISOString(),
          })
          .eq('id', record.id);

        if (updateError) {
          errors.push(`Record ${record.id}: ${updateError.message}`);
        } else {
          recordsRotated++;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        errors.push(`Record ${record.id}: ${errorMessage}`);
        logger.error('Failed to rotate record', { error: err, recordId: record.id, correlationId });
      }
    }

    offset += BATCH_SIZE;
    hasMore = records.length === BATCH_SIZE;
    logger.info('Key rotation progress', { correlationId, recordsRotated, offset });
  }

  return { recordsRotated, errors };
}

/**
 * Perform the actual key rotation
 */
async function performKeyRotation(params: {
  correlationId: string;
  reason: string;
  actorType: 'cron' | 'user';
  actorId: string;
  actorName?: string;
}): Promise<KeyRotationResult> {
  const { correlationId, reason, actorType, actorId, actorName } = params;
  const startTime = Date.now();

  logger.info('Starting encryption key rotation', { correlationId, reason });

  const { client: supabase, error: supabaseError } = await getSupabaseClient();
  if (!supabase) throw new Error(`Supabase client not available: ${supabaseError}`);

  await createRotationAuditEntry({
    correlationId,
    action: 'key_rotation_started',
    actorType,
    actorId,
    actorName,
    reason,
  });
  await sendSecurityAlert({
    type: 'rotation_started',
    correlationId,
    details: { reason, actorType, actorId },
  });

  const newKeyHex = generateSecureKey();
  const newKeyFingerprint = calculateKeyFingerprint(newKeyHex);
  logger.info('Generated new encryption key', { correlationId, newKeyFingerprint });

  const { data: currentKeyData, error: keyQueryError } = await supabase
    .from('encryption_keys')
    .select('version, fingerprint')
    .eq('status', 'active')
    .order('version', { ascending: false })
    .limit(1)
    .single();

  if (keyQueryError && keyQueryError.code !== 'PGRST116') {
    throw new Error(`Failed to query current key: ${keyQueryError.message}`);
  }

  const previousKeyVersion = (currentKeyData?.version as number | undefined) ?? 0;
  const previousKeyFingerprint = (currentKeyData?.fingerprint as string | undefined) ?? 'none';
  const newKeyVersion = previousKeyVersion + 1;

  const { error: insertKeyError } = await supabase.from('encryption_keys').insert({
    version: newKeyVersion,
    fingerprint: newKeyFingerprint,
    status: 'rotating',
    created_at: new Date().toISOString(),
    created_by: actorId,
    notes: `Automated rotation: ${reason}`,
  });
  if (insertKeyError) throw new Error(`Failed to register new key: ${insertKeyError.message}`);

  if (!process.env.DATA_ENCRYPTION_KEY) throw new Error('DATA_ENCRYPTION_KEY not configured');

  const { recordsRotated, errors } = await reEncryptRecords({
    supabase: supabase as SupabaseClient,
    newKeyHex,
    newKeyVersion,
    correlationId,
  });

  if (previousKeyVersion > 0) {
    await supabase
      .from('encryption_keys')
      .update({ status: 'retired', retired_at: new Date().toISOString() })
      .eq('status', 'active')
      .lt('version', newKeyVersion);
  }
  await supabase.from('encryption_keys').update({ status: 'active' }).eq('version', newKeyVersion);

  const durationMs = Date.now() - startTime;
  const success = errors.length === 0 || recordsRotated > 0;

  await createRotationAuditEntry({
    correlationId,
    action:
      errors.length > 0 && recordsRotated === 0 ? 'key_rotation_failed' : 'key_rotation_completed',
    actorType,
    actorId,
    actorName,
    previousKeyVersion,
    newKeyVersion,
    recordsRotated,
    durationMs,
    error: errors.length > 0 ? errors.join('; ') : undefined,
    reason,
    metadata: {
      previousKeyFingerprint,
      newKeyFingerprint,
      batchSize: 100,
      errorCount: errors.length,
    },
  });

  await sendSecurityAlert({
    type: success ? 'rotation_completed' : 'rotation_failed',
    correlationId,
    details: {
      previousKeyVersion,
      newKeyVersion,
      recordsRotated,
      durationMs,
      errorCount: errors.length,
      previousKeyFingerprint,
      newKeyFingerprint,
    },
  });

  const { eventStore } = getClients();
  await emitJobEvent(eventStore, 'security.key_rotation_completed', {
    success,
    newKeyVersion,
    recordsRotated,
    durationMs,
    previousKeyFingerprint,
    newKeyFingerprint,
    errorCount: errors.length,
    correlationId,
  });

  logger.info('Encryption key rotation completed', {
    correlationId,
    success,
    newKeyVersion,
    recordsRotated,
    durationMs,
    errorCount: errors.length,
  });

  return {
    success,
    newKeyVersion,
    recordsRotated,
    durationMs,
    previousKeyFingerprint,
    newKeyFingerprint,
    errors: errors.length > 0 ? errors : undefined,
  };
}

// ============================================
// Scheduled Job Definition
// ============================================

/**
 * Scheduled Key Rotation Job
 *
 * Runs on the first day of every quarter at 3:00 AM UTC:
 * - January 1st
 * - April 1st
 * - July 1st
 * - October 1st
 *
 * This ensures encryption keys are rotated at least every 90 days
 * as required by HIPAA security requirements.
 */
export const scheduledKeyRotation = schedules.task({
  id: 'scheduled-key-rotation',
  cron: '0 3 1 */3 *', // 3:00 AM on the 1st day of every 3rd month (quarterly)
  run: async () => {
    const correlationId = generateCorrelationId();
    logger.info('Starting scheduled key rotation', { correlationId });

    try {
      const result = await performKeyRotation({
        correlationId,
        reason: 'Quarterly scheduled rotation (HIPAA compliance)',
        actorType: 'cron',
        actorId: 'scheduled-key-rotation',
        actorName: 'Key Rotation Scheduler',
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Scheduled key rotation failed', { error, correlationId });

      // Send failure alert
      await sendSecurityAlert({
        type: 'rotation_failed',
        correlationId,
        details: { error: errorMessage, scheduled: true },
      });

      // Create failure audit entry
      await createRotationAuditEntry({
        correlationId,
        action: 'key_rotation_failed',
        actorType: 'cron',
        actorId: 'scheduled-key-rotation',
        actorName: 'Key Rotation Scheduler',
        error: errorMessage,
        reason: 'Quarterly scheduled rotation (HIPAA compliance)',
      });

      return {
        success: false,
        error: errorMessage,
        correlationId,
      };
    }
  },
});

/**
 * Manual Key Rotation Task
 *
 * Allows manual triggering of key rotation for:
 * - Emergency key compromise scenarios
 * - Personnel changes requiring immediate rotation
 * - Testing and validation
 *
 * @example
 * await manualKeyRotation.trigger({
 *   reason: 'Emergency: Potential key exposure detected',
 *   requestedBy: 'security-admin-123',
 *   emergencyRotation: true
 * });
 */
export const manualKeyRotation = task({
  id: 'manual-key-rotation',
  run: async (payload: ManualKeyRotationPayload) => {
    const { reason, requestedBy, emergencyRotation } = payload;
    const correlationId = payload.correlationId ?? generateCorrelationId();

    logger.info('Starting manual key rotation', {
      correlationId,
      reason,
      requestedBy,
      emergencyRotation,
    });

    try {
      const result = await performKeyRotation({
        correlationId,
        reason: `Manual rotation: ${reason}${emergencyRotation ? ' (EMERGENCY)' : ''}`,
        actorType: 'user',
        actorId: requestedBy,
        actorName: emergencyRotation ? 'Emergency Rotation' : 'Manual Rotation',
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Manual key rotation failed', { error, correlationId });

      // Send failure alert
      await sendSecurityAlert({
        type: 'rotation_failed',
        correlationId,
        details: { error: errorMessage, manual: true, requestedBy, emergencyRotation },
      });

      // Create failure audit entry
      await createRotationAuditEntry({
        correlationId,
        action: 'key_rotation_failed',
        actorType: 'user',
        actorId: requestedBy,
        error: errorMessage,
        reason,
        metadata: { emergencyRotation },
      });

      return {
        success: false,
        error: errorMessage,
        correlationId,
      };
    }
  },
});

/**
 * Key Rotation Status Check
 *
 * Utility task to check current key rotation status and history
 * Useful for monitoring and compliance reporting
 */
export const checkKeyRotationStatus = task({
  id: 'check-key-rotation-status',
  run: async () => {
    const correlationId = generateCorrelationId();

    const { client: supabase } = await getSupabaseClient();
    if (!supabase) {
      return { success: false, error: 'Supabase not configured' };
    }

    // Get all encryption keys
    const { data: keys, error: keysError } = await supabase
      .from('encryption_keys')
      .select('version, fingerprint, status, created_at, retired_at')
      .order('version', { ascending: false });

    if (keysError) {
      return { success: false, error: keysError.message };
    }

    // Get count of records per key version
    const { data: versionCounts, error: countError } = await supabase
      .from('encrypted_data')
      .select('key_version')
      .is('deleted_at', null);

    const recordsByVersion: Record<number, number> = {};
    if (!countError && versionCounts) {
      for (const record of versionCounts) {
        const version = record.key_version as number;
        recordsByVersion[version] = (recordsByVersion[version] ?? 0) + 1;
      }
    }

    // Get last rotation audit entries
    interface AuditRecord {
      timestamp: string;
      event_type: string;
      actor_id: string;
      metadata: Record<string, unknown>;
    }

    const { data: recentRotations } = await supabase
      .from('audit_log')
      .select('timestamp, event_type, actor_id, metadata')
      .like('event_type', 'security.key_rotation%')
      .order('timestamp', { ascending: false })
      .limit(10);

    interface KeyRecord {
      version: number;
      fingerprint: string;
      status: string;
      created_at: string;
      retired_at: string | null;
    }

    const typedKeys = keys as KeyRecord[] | null;
    const typedRotations = recentRotations as AuditRecord[] | null;

    const activeKey = typedKeys?.find((k) => k.status === 'active');
    const daysSinceRotation = activeKey
      ? Math.floor((Date.now() - new Date(activeKey.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    return {
      success: true,
      correlationId,
      currentStatus: {
        activeKeyVersion: activeKey?.version,
        activeKeyFingerprint: activeKey?.fingerprint,
        daysSinceLastRotation: daysSinceRotation,
        rotationDueIn: daysSinceRotation !== null ? Math.max(0, 90 - daysSinceRotation) : null,
        isOverdue: daysSinceRotation !== null && daysSinceRotation > 90,
      },
      keyHistory: typedKeys?.map((k) => ({
        version: k.version,
        fingerprint: k.fingerprint,
        status: k.status,
        createdAt: k.created_at,
        retiredAt: k.retired_at,
        recordCount: recordsByVersion[k.version] ?? 0,
      })),
      recentRotations: typedRotations?.map((r) => ({
        timestamp: r.timestamp,
        eventType: r.event_type,
        actorId: r.actor_id,
        metadata: r.metadata,
      })),
    };
  },
});
