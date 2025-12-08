'use server';

import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Campaign Management
 */

// =============================================================================
// Types
// =============================================================================

export interface Campaign {
  id: string;
  name: string;
  subject: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'paused' | 'cancelled';
  campaignType: 'email' | 'sms' | 'whatsapp' | 'mixed';
  recipients: number;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  scheduledAt: Date | null;
  sentAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface CampaignStats {
  totalCampaigns: number;
  activeCampaigns: number;
  totalSent: number;
  avgOpenRate: number;
  avgClickRate: number;
}

interface CampaignRow {
  id: string;
  name: string;
  subject: string | null;
  status: string;
  campaign_type: string;
  recipients: number;
  sent: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  scheduled_at: Date | null;
  sent_at: Date | null;
  completed_at: Date | null;
  created_at: Date;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  subject: z.string().max(300).optional(),
  content: z.string().optional(),
  campaignType: z.enum(['email', 'sms', 'whatsapp', 'mixed']).default('email'),
  scheduledAt: z.string().datetime().optional(),
});

const UpdateCampaignSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(200).optional(),
  subject: z.string().max(300).optional(),
  content: z.string().optional(),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'paused', 'cancelled']).optional(),
  scheduledAt: z.string().datetime().optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function rowToCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject ?? '',
    status: row.status as Campaign['status'],
    campaignType: row.campaign_type as Campaign['campaignType'],
    recipients: row.recipients,
    sent: row.sent,
    opened: row.opened,
    clicked: row.clicked,
    bounced: row.bounced,
    unsubscribed: row.unsubscribed,
    scheduledAt: row.scheduled_at,
    sentAt: row.sent_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getCampaignsAction(): Promise<{ campaigns: Campaign[]; error?: string }> {
  try {
    await requirePermission('campaigns:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<CampaignRow>(
      `SELECT id, name, subject, status, campaign_type, recipients, sent, opened, clicked,
              bounced, unsubscribed, scheduled_at, sent_at, completed_at, created_at
       FROM campaigns
       WHERE clinic_id = $1
       ORDER BY created_at DESC`,
      [user.clinicId]
    );

    return { campaigns: result.rows.map(rowToCampaign) };
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    return { campaigns: [], error: 'Failed to fetch campaigns' };
  }
}

export async function getCampaignStatsAction(): Promise<{
  stats: CampaignStats | null;
  error?: string;
}> {
  try {
    await requirePermission('campaigns:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_campaigns: string;
      active_campaigns: string;
      total_sent: string;
      avg_open_rate: string;
      avg_click_rate: string;
    }>(
      `SELECT
        COUNT(*) as total_campaigns,
        COUNT(*) FILTER (WHERE status IN ('scheduled', 'sending')) as active_campaigns,
        COALESCE(SUM(sent), 0) as total_sent,
        COALESCE(AVG(CASE WHEN sent > 0 THEN (opened::decimal / sent) * 100 ELSE 0 END), 0) as avg_open_rate,
        COALESCE(AVG(CASE WHEN sent > 0 THEN (clicked::decimal / sent) * 100 ELSE 0 END), 0) as avg_click_rate
       FROM campaigns
       WHERE clinic_id = $1`,
      [user.clinicId]
    );

    const row = result.rows[0];
    return {
      stats: {
        totalCampaigns: parseInt(row.total_campaigns),
        activeCampaigns: parseInt(row.active_campaigns),
        totalSent: parseInt(row.total_sent),
        avgOpenRate: parseFloat(row.avg_open_rate),
        avgClickRate: parseFloat(row.avg_click_rate),
      },
    };
  } catch (error) {
    console.error('Error fetching campaign stats:', error);
    return { stats: null, error: 'Failed to fetch campaign stats' };
  }
}

export async function createCampaignAction(
  data: z.infer<typeof CreateCampaignSchema>
): Promise<{ campaign: Campaign | null; error?: string }> {
  try {
    await requirePermission('campaigns:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = CreateCampaignSchema.parse(data);

    const result = await database.query<CampaignRow>(
      `INSERT INTO campaigns (clinic_id, name, subject, content, campaign_type, scheduled_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, subject, status, campaign_type, recipients, sent, opened, clicked,
                 bounced, unsubscribed, scheduled_at, sent_at, completed_at, created_at`,
      [
        user.clinicId,
        validated.name,
        validated.subject ?? null,
        validated.content ?? null,
        validated.campaignType,
        validated.scheduledAt ?? null,
        user.id,
      ]
    );

    return { campaign: rowToCampaign(result.rows[0]) };
  } catch (error) {
    console.error('Error creating campaign:', error);
    return { campaign: null, error: 'Failed to create campaign' };
  }
}

export async function updateCampaignAction(
  data: z.infer<typeof UpdateCampaignSchema>
): Promise<{ campaign: Campaign | null; error?: string }> {
  try {
    await requirePermission('campaigns:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = UpdateCampaignSchema.parse(data);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(validated.name);
    }
    if (validated.subject !== undefined) {
      updates.push(`subject = $${paramIndex++}`);
      values.push(validated.subject);
    }
    if (validated.content !== undefined) {
      updates.push(`content = $${paramIndex++}`);
      values.push(validated.content);
    }
    if (validated.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(validated.status);
      if (validated.status === 'sent') {
        updates.push(`sent_at = NOW()`);
      }
    }
    if (validated.scheduledAt !== undefined) {
      updates.push(`scheduled_at = $${paramIndex++}`);
      values.push(validated.scheduledAt);
    }

    if (updates.length === 0) {
      return { campaign: null, error: 'No updates provided' };
    }

    values.push(validated.id, user.clinicId);

    const result = await database.query<CampaignRow>(
      `UPDATE campaigns SET ${updates.join(', ')}, updated_at = NOW()
       WHERE id = $${paramIndex++} AND clinic_id = $${paramIndex}
       RETURNING id, name, subject, status, campaign_type, recipients, sent, opened, clicked,
                 bounced, unsubscribed, scheduled_at, sent_at, completed_at, created_at`,
      values
    );

    if (result.rows.length === 0) {
      return { campaign: null, error: 'Campaign not found' };
    }

    return { campaign: rowToCampaign(result.rows[0]) };
  } catch (error) {
    console.error('Error updating campaign:', error);
    return { campaign: null, error: 'Failed to update campaign' };
  }
}

export async function deleteCampaignAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('campaigns:delete');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query(`DELETE FROM campaigns WHERE id = $1 AND clinic_id = $2`, [
      id,
      user.clinicId,
    ]);

    if (result.rowCount === 0) {
      return { success: false, error: 'Campaign not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting campaign:', error);
    return { success: false, error: 'Failed to delete campaign' };
  }
}

export async function duplicateCampaignAction(
  id: string
): Promise<{ campaign: Campaign | null; error?: string }> {
  try {
    await requirePermission('campaigns:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<CampaignRow>(
      `INSERT INTO campaigns (clinic_id, name, subject, content, campaign_type, target_audience, created_by)
       SELECT clinic_id, name || ' (Copie)', subject, content, campaign_type, target_audience, $2
       FROM campaigns WHERE id = $1 AND clinic_id = $3
       RETURNING id, name, subject, status, campaign_type, recipients, sent, opened, clicked,
                 bounced, unsubscribed, scheduled_at, sent_at, completed_at, created_at`,
      [id, user.id, user.clinicId]
    );

    if (result.rows.length === 0) {
      return { campaign: null, error: 'Campaign not found' };
    }

    return { campaign: rowToCampaign(result.rows[0]) };
  } catch (error) {
    console.error('Error duplicating campaign:', error);
    return { campaign: null, error: 'Failed to duplicate campaign' };
  }
}
