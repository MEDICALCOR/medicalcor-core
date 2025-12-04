/**
 * GDPR Data Export Endpoint
 *
 * Implements GDPR Article 20: Right to Data Portability
 * Allows authenticated users to export all their personal data.
 *
 * Features:
 * - Exports all PII/PHI data associated with the user
 * - Returns data in machine-readable JSON format
 * - Requires authentication
 * - Logs all export requests for audit compliance
 */

import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createDatabaseClient, maskPhone } from '@medicalcor/core';

/**
 * GET /api/gdpr/export
 *
 * Export all personal data for the authenticated user
 * GDPR Article 20 compliance
 */
export async function GET(): Promise<NextResponse> {
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

    const db = createDatabaseClient();

    // Collect all user data from various tables
    const exportData: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      dataController: 'MedicalCor SRL',
      dataProtectionOfficer: 'dpo@medicalcor.ro',
      exportFormat: 'GDPR Article 20 compliant JSON',
      user: {},
      sessions: [],
      authEvents: [],
      consentRecords: [],
      leadData: [],
      interactions: [],
      encryptedData: [],
    };

    // 1. User profile data
    const userResult = await db.query(
      `SELECT id, email, name, role, status, email_verified,
              created_at, updated_at, last_login_at
       FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [userId]
    );

    if (userResult.rows[0]) {
      exportData.user = userResult.rows[0];
    }

    // 2. Session data (limited to non-sensitive fields)
    const sessionsResult = await db.query(
      `SELECT id, created_at, expires_at, revoked_at, last_activity_at
       FROM sessions WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [userId]
    );
    exportData.sessions = sessionsResult.rows;

    // 3. Auth events (audit trail)
    const authEventsResult = await db.query(
      `SELECT event_type, result, ip_address, created_at
       FROM auth_events WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 500`,
      [userId]
    );
    exportData.authEvents = authEventsResult.rows;

    // 4. Consent records (by email)
    const consentResult = await db.query(
      `SELECT consent_type, granted, source, ip_address,
              granted_at, withdrawn_at, created_at
       FROM consent_records
       WHERE phone IN (
         SELECT phone FROM leads WHERE email = $1 AND deleted_at IS NULL
       ) AND deleted_at IS NULL
       ORDER BY created_at DESC`,
      [userEmail]
    );
    exportData.consentRecords = consentResult.rows;

    // 5. Lead/Patient data (by email)
    const leadsResult = await db.query(
      `SELECT id, phone, email, name, source, channel, status,
              utm_source, utm_medium, utm_campaign,
              created_at, updated_at
       FROM leads WHERE email = $1 AND deleted_at IS NULL`,
      [userEmail]
    );
    exportData.leadData = leadsResult.rows;

    // 6. Interaction history
    if (leadsResult.rows.length > 0) {
      const leadIds = leadsResult.rows.map((r) => r.id as string);
      const interactionsResult = await db.query(
        `SELECT type, channel, direction, status, created_at
         FROM interactions WHERE lead_id = ANY($1) AND deleted_at IS NULL
         ORDER BY created_at DESC LIMIT 500`,
        [leadIds]
      );
      exportData.interactions = interactionsResult.rows;
    }

    // 7. Encrypted data references (without decrypting - user can request separately)
    const encryptedResult = await db.query(
      `SELECT entity_type, entity_id, field_name, classification, created_at
       FROM encrypted_data
       WHERE entity_id = $1 AND deleted_at IS NULL`,
      [userId]
    );
    exportData.encryptedData = encryptedResult.rows;

    // Log the export request for audit compliance
    await db.query(
      `INSERT INTO sensitive_data_access_log
       (user_id, entity_type, entity_id, field_names, access_type, access_reason)
       VALUES ($1, 'gdpr_export', $1, ARRAY['all'], 'export', 'GDPR Article 20 data export request')`,
      [userId]
    );

    // Set appropriate headers for download
    const filename = `gdpr-export-${userId}-${new Date().toISOString().split('T')[0]}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-GDPR-Export': 'true',
        'X-Export-Date': new Date().toISOString(),
      },
    });
  } catch (_error) {
    // Log error but don't expose details to client
    if (process.env.NODE_ENV !== 'production') {
      console.error('[GDPR Export] Error:', error);
    }

    return NextResponse.json(
      { error: 'Failed to export data. Please contact support.' },
      { status: 500 }
    );
  }
}

/**
 * Reject other HTTP methods
 */
export function POST(): NextResponse {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}
