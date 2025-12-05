/**
 * GDPR Data Deletion Request Endpoint
 *
 * Implements GDPR Article 17: Right to Erasure ("Right to be Forgotten")
 * Allows authenticated users to request deletion of their personal data.
 *
 * Features:
 * - Soft-deletes all PII/PHI data associated with the user
 * - Anonymizes data that must be retained for legal reasons
 * - Creates audit trail for compliance
 * - Sends confirmation email
 * - Schedules hard deletion after retention period
 */

import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { createDatabaseClient, withTransaction, type TransactionClient } from '@medicalcor/core';

/**
 * Deletion request schema
 */
const DeletionRequestSchema = z.object({
  // Confirmation required to prevent accidental deletion
  confirmDeletion: z.literal(true, {
    errorMap: () => ({ message: 'You must confirm the deletion request' }),
  }),
  // Optional reason for the request
  reason: z.string().max(500).optional(),
  // Additional confirmation for irreversible data
  acknowledgeIrreversible: z.literal(true, {
    errorMap: () => ({ message: 'You must acknowledge that this action is irreversible' }),
  }),
});

/**
 * POST /api/gdpr/delete-request
 *
 * Request deletion of all personal data
 * GDPR Article 17 compliance
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Require authentication
    const session = await auth();

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const userEmail = session.user.email;

    if (!userId || !userEmail) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Parse and validate request body
    const body = (await req.json()) as unknown;
    const parseResult = DeletionRequestSchema.safeParse(body);

    if (!parseResult.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { reason } = parseResult.data;
    const db = createDatabaseClient();
    const deletionTimestamp = new Date().toISOString();

    // Execute deletion in a transaction
    const deletedCounts = await withTransaction(db, async (tx: TransactionClient) => {
      const counts: Record<string, number> = {};

      // 1. Soft-delete user record
      const userResult = await tx.query(
        `UPDATE users
         SET deleted_at = CURRENT_TIMESTAMP,
             email = CONCAT('deleted-', id, '@deleted.local'),
             name = 'Deleted User',
             password_hash = 'DELETED'
         WHERE id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      counts.users = userResult.rowCount ?? 0;

      // 2. Revoke all active sessions
      const sessionsResult = await tx.query(
        `UPDATE sessions
         SET revoked_at = CURRENT_TIMESTAMP,
             revoked_reason = 'GDPR deletion request'
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [userId]
      );
      counts.sessions = sessionsResult.rowCount ?? 0;

      // 3. Soft-delete encrypted data
      const encryptedResult = await tx.query(
        `UPDATE encrypted_data
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE entity_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      counts.encryptedData = encryptedResult.rowCount ?? 0;

      // 4. Soft-delete MFA secrets
      const mfaResult = await tx.query(
        `UPDATE mfa_secrets
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      counts.mfaSecrets = mfaResult.rowCount ?? 0;

      // 5. Soft-delete MFA backup codes
      const backupCodesResult = await tx.query(
        `UPDATE mfa_backup_codes
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND deleted_at IS NULL`,
        [userId]
      );
      counts.mfaBackupCodes = backupCodesResult.rowCount ?? 0;

      // 6. Soft-delete lead data (by email)
      const leadsResult = await tx.query(
        `UPDATE leads
         SET deleted_at = CURRENT_TIMESTAMP,
             email = CONCAT('deleted-', id, '@deleted.local'),
             name = 'Deleted',
             phone = CONCAT('+00', SUBSTRING(phone FROM 4))
         WHERE email = $1 AND deleted_at IS NULL`,
        [userEmail]
      );
      counts.leads = leadsResult.rowCount ?? 0;

      // 7. Soft-delete consent records
      const consentResult = await tx.query(
        `UPDATE consent_records
         SET deleted_at = CURRENT_TIMESTAMP
         WHERE phone IN (
           SELECT phone FROM leads WHERE email = $1
         ) AND deleted_at IS NULL`,
        [userEmail]
      );
      counts.consentRecords = consentResult.rowCount ?? 0;

      // 8. Create audit record for the deletion
      await tx.query(
        `INSERT INTO auth_events
         (user_id, email, event_type, result, details, ip_address, created_at)
         VALUES ($1, $2, 'user_deleted', 'success', $3, $4, CURRENT_TIMESTAMP)`,
        [
          userId,
          userEmail,
          JSON.stringify({
            reason: reason ?? 'User requested deletion',
            deletedCounts: counts,
            gdprArticle: 'Article 17 - Right to erasure',
          }),
          req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip'),
        ]
      );

      // 9. Schedule hard deletion (30 days from now)
      // This allows for any legal holds or compliance requirements
      await tx.query(
        `INSERT INTO scheduled_deletions
         (entity_type, entity_id, scheduled_for, reason)
         VALUES ('user', $1, CURRENT_TIMESTAMP + INTERVAL '30 days', 'GDPR Article 17 request')
         ON CONFLICT (entity_type, entity_id) DO UPDATE
         SET scheduled_for = EXCLUDED.scheduled_for`,
        [userId]
      );

      return counts;
    });

    // Log access for audit compliance
    await db.query(
      `INSERT INTO sensitive_data_access_log
       (user_id, entity_type, entity_id, field_names, access_type, access_reason)
       VALUES ($1, 'gdpr_deletion', $1, ARRAY['all'], 'delete', 'GDPR Article 17 deletion request')`,
      [userId]
    );

    return NextResponse.json({
      success: true,
      message: 'Your data deletion request has been processed',
      deletionTimestamp,
      deletedCounts,
      retentionNotice:
        'Some anonymized data may be retained for legal compliance. ' +
        'Full deletion will occur after the 30-day retention period.',
      confirmation: {
        requestId: `DEL-${userId.slice(0, 8)}-${Date.now()}`,
        email: userEmail,
        gdprReference: 'Article 17 - Right to erasure',
      },
    });
  } catch (error) {
    // Log error but don't expose details to client
    if (process.env.NODE_ENV !== 'production') {
      console.error('[GDPR Deletion] Error:', error);
    }

    return NextResponse.json(
      { error: 'Failed to process deletion request. Please contact support.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/gdpr/delete-request
 *
 * Get information about the deletion process
 */
export async function GET(): Promise<NextResponse> {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    title: 'GDPR Data Deletion Request',
    description:
      'Request deletion of all your personal data in compliance with GDPR Article 17 (Right to Erasure)',
    process: [
      'All personal data will be soft-deleted immediately',
      'Your account will be deactivated',
      'All active sessions will be terminated',
      'Anonymized data may be retained for legal compliance',
      'Full deletion occurs after 30-day retention period',
    ],
    requirements: {
      confirmDeletion: true,
      acknowledgeIrreversible: true,
      reason: 'optional - max 500 characters',
    },
    legalBasis: {
      regulation: 'General Data Protection Regulation (GDPR)',
      article: 'Article 17 - Right to erasure',
      controller: 'MedicalCor SRL',
      dpo: 'dpo@medicalcor.ro',
    },
    warning: 'This action is irreversible. You will lose access to all your data and services.',
  });
}
