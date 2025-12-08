/**
 * Server Action Tests: Campaigns
 *
 * Tests for campaign management server actions including:
 * - Permission checks
 * - CRUD operations
 * - Campaign statistics
 * - Duplication
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database client
const mockQuery = vi.fn();
const mockDbClient = { query: mockQuery };

vi.mock('@medicalcor/core', () => ({
  createDatabaseClient: () => mockDbClient,
}));

// Mock the auth module
vi.mock('@/lib/auth/server-action-auth', () => ({
  requirePermission: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

// Import after mocks are set up
import {
  getCampaignsAction,
  getCampaignStatsAction,
  createCampaignAction,
  updateCampaignAction,
  deleteCampaignAction,
  duplicateCampaignAction,
} from '@/app/actions/campaigns';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

const mockRequirePermission = vi.mocked(requirePermission);
const mockRequireCurrentUser = vi.mocked(requireCurrentUser);

// Mock user
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  name: 'Test User',
  role: 'admin' as const,
  clinicId: 'clinic-123',
};

// Mock session
const mockSession = {
  user: mockUser,
  expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
};

// Test data factories
const createMockCampaignRow = (overrides = {}) => ({
  id: 'campaign-123',
  name: 'Spring Promotion',
  subject: 'Special offer for dental cleaning',
  status: 'draft',
  campaign_type: 'email',
  recipients: 0,
  sent: 0,
  opened: 0,
  clicked: 0,
  bounced: 0,
  unsubscribed: 0,
  scheduled_at: null,
  sent_at: null,
  completed_at: null,
  created_at: new Date('2024-01-15T10:00:00Z'),
  ...overrides,
});

describe('Campaigns Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(mockSession);
    mockRequireCurrentUser.mockResolvedValue(mockUser);
  });

  describe('getCampaignsAction', () => {
    it('should check for campaigns:read permission', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getCampaignsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('campaigns:read');
    });

    it('should return all campaigns for clinic', async () => {
      const mockRows = [
        createMockCampaignRow({ name: 'Campaign 1' }),
        createMockCampaignRow({ name: 'Campaign 2', status: 'sent' }),
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await getCampaignsAction();

      expect(result.campaigns).toHaveLength(2);
      expect(result.campaigns[0]).toMatchObject({
        id: 'campaign-123',
        name: 'Campaign 1',
        status: 'draft',
        campaignType: 'email',
      });
    });

    it('should order campaigns by created_at DESC', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getCampaignsAction();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await getCampaignsAction();

      expect(result.campaigns).toEqual([]);
      expect(result.error).toBe('Failed to fetch campaigns');
    });
  });

  describe('getCampaignStatsAction', () => {
    it('should check for campaigns:read permission', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_campaigns: '0',
            active_campaigns: '0',
            total_sent: '0',
            avg_open_rate: '0',
            avg_click_rate: '0',
          },
        ],
      });

      await getCampaignStatsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('campaigns:read');
    });

    it('should return campaign statistics', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_campaigns: '25',
            active_campaigns: '3',
            total_sent: '15000',
            avg_open_rate: '35.5',
            avg_click_rate: '12.3',
          },
        ],
      });

      const result = await getCampaignStatsAction();

      expect(result.stats).toEqual({
        totalCampaigns: 25,
        activeCampaigns: 3,
        totalSent: 15000,
        avgOpenRate: 35.5,
        avgClickRate: 12.3,
      });
    });

    it('should calculate average rates correctly', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_campaigns: '10',
            active_campaigns: '2',
            total_sent: '5000',
            avg_open_rate: '42.75',
            avg_click_rate: '8.25',
          },
        ],
      });

      const result = await getCampaignStatsAction();

      expect(result.stats?.avgOpenRate).toBe(42.75);
      expect(result.stats?.avgClickRate).toBe(8.25);
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await getCampaignStatsAction();

      expect(result.stats).toBeNull();
      expect(result.error).toBe('Failed to fetch campaign stats');
    });
  });

  describe('createCampaignAction', () => {
    it('should check for campaigns:write permission', async () => {
      const mockRow = createMockCampaignRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await createCampaignAction({
        name: 'New Campaign',
        campaignType: 'email',
      });

      expect(mockRequirePermission).toHaveBeenCalledWith('campaigns:write');
    });

    it('should create campaign with valid data', async () => {
      const mockRow = createMockCampaignRow({ name: 'Summer Sale' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await createCampaignAction({
        name: 'Summer Sale',
        subject: 'Get 20% off this summer',
        content: 'Email body content here',
        campaignType: 'email',
      });

      expect(result.campaign).toBeTruthy();
      expect(result.campaign?.name).toBe('Summer Sale');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO campaigns'),
        expect.arrayContaining(['clinic-123', 'Summer Sale', 'Get 20% off this summer'])
      );
    });

    it('should validate name is not empty', async () => {
      const result = await createCampaignAction({
        name: '',
        campaignType: 'email',
      });

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('Failed to create campaign');
    });

    it('should validate campaign type enum', async () => {
      const result = await createCampaignAction({
        name: 'Test Campaign',
        // @ts-expect-error Testing invalid campaign type
        campaignType: 'invalid_type',
      });

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('Failed to create campaign');
    });

    it('should accept all valid campaign types', async () => {
      const mockRow = createMockCampaignRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const validTypes = ['email', 'sms', 'whatsapp', 'mixed'] as const;

      for (const type of validTypes) {
        await createCampaignAction({
          name: `${type} Campaign`,
          campaignType: type,
        });
      }

      expect(mockQuery).toHaveBeenCalledTimes(4);
    });

    it('should handle scheduled campaigns', async () => {
      const mockRow = createMockCampaignRow({
        status: 'scheduled',
        scheduled_at: new Date('2024-02-01T10:00:00Z'),
      });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await createCampaignAction({
        name: 'Scheduled Campaign',
        campaignType: 'email',
        scheduledAt: '2024-02-01T10:00:00Z',
      });

      expect(result.campaign?.scheduledAt).toBeTruthy();
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await createCampaignAction({
        name: 'Test Campaign',
        campaignType: 'email',
      });

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('Failed to create campaign');
    });
  });

  describe('updateCampaignAction', () => {
    it('should check for campaigns:write permission', async () => {
      const mockRow = createMockCampaignRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Updated Name',
      });

      expect(mockRequirePermission).toHaveBeenCalledWith('campaigns:write');
    });

    it('should update campaign with partial data', async () => {
      const mockRow = createMockCampaignRow({ name: 'Updated Campaign' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Updated Campaign',
      });

      expect(result.campaign?.name).toBe('Updated Campaign');
    });

    it('should validate UUID format', async () => {
      const result = await updateCampaignAction({
        id: 'invalid-uuid',
        name: 'Test',
      });

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('Failed to update campaign');
    });

    it('should update status and set sent_at when status is sent', async () => {
      const mockRow = createMockCampaignRow({
        status: 'sent',
        sent_at: new Date('2024-01-15T12:00:00Z'),
      });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'sent',
      });

      expect(result.campaign?.status).toBe('sent');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('sent_at = NOW()'),
        expect.any(Array)
      );
    });

    it('should validate status enum', async () => {
      const result = await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        // @ts-expect-error Testing invalid status
        status: 'invalid_status',
      });

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('Failed to update campaign');
    });

    it('should return error when no updates provided', async () => {
      const result = await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('No updates provided');
    });

    it('should return error when campaign not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Updated',
      });

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('Campaign not found');
    });
  });

  describe('deleteCampaignAction', () => {
    it('should check for campaigns:delete permission', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await deleteCampaignAction('550e8400-e29b-41d4-a716-446655440000');

      expect(mockRequirePermission).toHaveBeenCalledWith('campaigns:delete');
    });

    it('should delete campaign successfully', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await deleteCampaignAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM campaigns'), [
        '550e8400-e29b-41d4-a716-446655440000',
        'clinic-123',
      ]);
    });

    it('should return error when campaign not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await deleteCampaignAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Campaign not found');
    });

    it('should return error on database failure', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await deleteCampaignAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete campaign');
    });
  });

  describe('duplicateCampaignAction', () => {
    it('should check for campaigns:write permission', async () => {
      const mockRow = createMockCampaignRow({ name: 'Original (Copie)' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await duplicateCampaignAction('campaign-123');

      expect(mockRequirePermission).toHaveBeenCalledWith('campaigns:write');
    });

    it('should create duplicate with "(Copie)" suffix', async () => {
      const mockRow = createMockCampaignRow({ name: 'Summer Sale (Copie)' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await duplicateCampaignAction('campaign-123');

      expect(result.campaign?.name).toContain('(Copie)');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("name || ' (Copie)'"),
        expect.any(Array)
      );
    });

    it('should duplicate with draft status by default', async () => {
      const mockRow = createMockCampaignRow({
        name: 'Duplicated (Copie)',
        status: 'draft',
      });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await duplicateCampaignAction('campaign-123');

      expect(result.campaign?.status).toBe('draft');
    });

    it('should copy content and settings but not metrics', async () => {
      const mockRow = createMockCampaignRow({
        name: 'Original (Copie)',
        recipients: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
      });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await duplicateCampaignAction('campaign-123');

      expect(result.campaign?.recipients).toBe(0);
      expect(result.campaign?.sent).toBe(0);
      expect(result.campaign?.opened).toBe(0);
    });

    it('should return error when source campaign not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await duplicateCampaignAction('non-existent');

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('Campaign not found');
    });

    it('should return error on database failure', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await duplicateCampaignAction('campaign-123');

      expect(result.campaign).toBeNull();
      expect(result.error).toBe('Failed to duplicate campaign');
    });
  });

  describe('Campaign Status Workflow', () => {
    it('should allow transition from draft to scheduled', async () => {
      const mockRow = createMockCampaignRow({ status: 'scheduled' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'scheduled',
        scheduledAt: '2024-02-01T10:00:00Z',
      });

      expect(result.campaign?.status).toBe('scheduled');
    });

    it('should allow pausing active campaigns', async () => {
      const mockRow = createMockCampaignRow({ status: 'paused' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'paused',
      });

      expect(result.campaign?.status).toBe('paused');
    });

    it('should allow canceling campaigns', async () => {
      const mockRow = createMockCampaignRow({ status: 'cancelled' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await updateCampaignAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        status: 'cancelled',
      });

      expect(result.campaign?.status).toBe('cancelled');
    });
  });
});
