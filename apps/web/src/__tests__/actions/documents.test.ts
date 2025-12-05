/**
 * Server Action Tests: Documents
 *
 * Tests for document management server actions including:
 * - Permission checks
 * - CRUD operations for documents and folders
 * - File size formatting
 * - Folder hierarchy
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
  getDocumentsAction,
  getFoldersAction,
  getDocumentStatsAction,
  createDocumentRecordAction,
  createFolderAction,
  updateDocumentAction,
  deleteDocumentAction,
  deleteFolderAction,
} from '@/app/actions/documents';
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
const createMockDocumentRow = (overrides = {}) => ({
  id: 'doc-123',
  name: 'patient-consent.pdf',
  original_name: 'patient-consent.pdf',
  file_type: 'application/pdf',
  category: 'consent',
  file_size_formatted: '1.5 MB',
  uploaded_by_name: 'Test User',
  uploaded_at: new Date('2024-01-15T10:00:00Z'),
  patient_id: 'patient-456',
  patient_name: 'Ion Popescu',
  folder_id: null,
  tags: ['consent', 'signed'],
  is_encrypted: true,
  ...overrides,
});

const createMockFolderRow = (overrides = {}) => ({
  id: 'folder-123',
  name: 'Consents',
  parent_id: null,
  document_count: 5,
  color: 'bg-blue-500',
  icon: null,
  is_system: false,
  ...overrides,
});

describe('Documents Server Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(mockSession);
    mockRequireCurrentUser.mockResolvedValue(mockUser);
  });

  describe('getDocumentsAction', () => {
    it('should check for documents:read permission', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getDocumentsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('documents:read');
    });

    it('should return all documents for clinic', async () => {
      const mockRows = [
        createMockDocumentRow({ name: 'doc1.pdf' }),
        createMockDocumentRow({ name: 'doc2.pdf' }),
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await getDocumentsAction();

      expect(result.documents).toHaveLength(2);
      expect(result.documents[0]).toMatchObject({
        id: 'doc-123',
        name: 'doc1.pdf',
        type: 'application/pdf',
        category: 'consent',
        isEncrypted: true,
      });
    });

    it('should filter by folder when provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getDocumentsAction('folder-456');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('folder_id = $2'),
        expect.arrayContaining(['clinic-123', 'folder-456'])
      );
    });

    it('should filter by patient when provided', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getDocumentsAction(undefined, 'patient-789');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('patient_id = $2'),
        expect.arrayContaining(['clinic-123', 'patient-789'])
      );
    });

    it('should filter by both folder and patient', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getDocumentsAction('folder-456', 'patient-789');

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('folder_id = $2'),
        expect.arrayContaining(['clinic-123', 'folder-456', 'patient-789'])
      );
    });

    it('should exclude deleted documents', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getDocumentsAction();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at IS NULL'),
        expect.any(Array)
      );
    });

    it('should order by uploaded_at DESC', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getDocumentsAction();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY uploaded_at DESC'),
        expect.any(Array)
      );
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await getDocumentsAction();

      expect(result.documents).toEqual([]);
      expect(result.error).toBe('Failed to fetch documents');
    });
  });

  describe('getFoldersAction', () => {
    it('should check for documents:read permission', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getFoldersAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('documents:read');
    });

    it('should return all folders for clinic', async () => {
      const mockRows = [
        createMockFolderRow({ name: 'Consents', is_system: true }),
        createMockFolderRow({ name: 'X-Rays', is_system: false }),
      ];
      mockQuery.mockResolvedValue({ rows: mockRows });

      const result = await getFoldersAction();

      expect(result.folders).toHaveLength(2);
      expect(result.folders[0]).toMatchObject({
        id: 'folder-123',
        name: 'Consents',
        documentCount: 5,
        isSystem: true,
      });
    });

    it('should order system folders first, then by name', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      await getFoldersAction();

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY is_system DESC, name'),
        expect.any(Array)
      );
    });

    it('should return empty array on error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await getFoldersAction();

      expect(result.folders).toEqual([]);
      expect(result.error).toBe('Failed to fetch folders');
    });
  });

  describe('getDocumentStatsAction', () => {
    it('should check for documents:read permission', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_documents: '0',
            total_folders: '0',
            total_size: '0',
            recent_uploads: '0',
          },
        ],
      });

      await getDocumentStatsAction();

      expect(mockRequirePermission).toHaveBeenCalledWith('documents:read');
    });

    it('should return document statistics', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_documents: '250',
            total_folders: '15',
            total_size: '5368709120', // 5GB in bytes
            recent_uploads: '12',
          },
        ],
      });

      const result = await getDocumentStatsAction();

      expect(result.stats?.totalDocuments).toBe(250);
      expect(result.stats?.totalFolders).toBe(15);
      expect(result.stats?.recentUploads).toBe(12);
    });

    it('should format file size correctly', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_documents: '100',
            total_folders: '5',
            total_size: '1073741824', // 1GB
            recent_uploads: '5',
          },
        ],
      });

      const result = await getDocumentStatsAction();

      expect(result.stats?.totalSize).toContain('GB');
    });

    it('should calculate used percentage against quota', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            total_documents: '100',
            total_folders: '5',
            total_size: '5368709120', // 5GB (50% of 10GB quota)
            recent_uploads: '5',
          },
        ],
      });

      const result = await getDocumentStatsAction();

      expect(result.stats?.usedPercentage).toBe(50);
    });

    it('should return null on error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await getDocumentStatsAction();

      expect(result.stats).toBeNull();
      expect(result.error).toBe('Failed to fetch document stats');
    });
  });

  describe('createDocumentRecordAction', () => {
    it('should check for documents:write permission', async () => {
      const mockRow = createMockDocumentRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await createDocumentRecordAction({
        name: 'test.pdf',
      });

      expect(mockRequirePermission).toHaveBeenCalledWith('documents:write');
    });

    it('should create document record with valid data', async () => {
      const mockRow = createMockDocumentRow({ name: 'consent-form.pdf' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await createDocumentRecordAction({
        name: 'consent-form.pdf',
        category: 'consent',
        fileSize: 1024000,
        fileType: 'application/pdf',
        tags: ['consent', 'signed'],
      });

      expect(result.document).toBeTruthy();
      expect(result.document?.name).toBe('consent-form.pdf');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO documents'),
        expect.arrayContaining(['clinic-123', 'consent-form.pdf', 'consent'])
      );
    });

    it('should validate name is not empty', async () => {
      const result = await createDocumentRecordAction({
        name: '',
      });

      expect(result.document).toBeNull();
      expect(result.error).toBe('Failed to create document record');
    });

    it('should format file size correctly', async () => {
      const mockRow = createMockDocumentRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await createDocumentRecordAction({
        name: 'large-file.pdf',
        fileSize: 5242880, // 5MB
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['5.0 MB'])
      );
    });

    it('should link document to patient when provided', async () => {
      const mockRow = createMockDocumentRow({ patient_id: 'patient-789' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await createDocumentRecordAction({
        name: 'xray.jpg',
        patientId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['550e8400-e29b-41d4-a716-446655440000'])
      );
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await createDocumentRecordAction({
        name: 'test.pdf',
      });

      expect(result.document).toBeNull();
      expect(result.error).toBe('Failed to create document record');
    });
  });

  describe('createFolderAction', () => {
    it('should check for documents:write permission', async () => {
      const mockRow = createMockFolderRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await createFolderAction({
        name: 'New Folder',
      });

      expect(mockRequirePermission).toHaveBeenCalledWith('documents:write');
    });

    it('should create folder with valid data', async () => {
      const mockRow = createMockFolderRow({ name: 'X-Rays' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await createFolderAction({
        name: 'X-Rays',
        color: 'bg-green-500',
      });

      expect(result.folder).toBeTruthy();
      expect(result.folder?.name).toBe('X-Rays');
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO document_folders'),
        expect.arrayContaining(['clinic-123', 'X-Rays', null, 'bg-green-500'])
      );
    });

    it('should validate name is not empty', async () => {
      const result = await createFolderAction({
        name: '',
      });

      expect(result.folder).toBeNull();
      expect(result.error).toBe('Failed to create folder');
    });

    it('should support nested folders with parentId', async () => {
      const mockRow = createMockFolderRow({ parent_id: 'parent-folder' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await createFolderAction({
        name: 'Subfolder',
        parentId: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['550e8400-e29b-41d4-a716-446655440000'])
      );
    });

    it('should use default blue color when not provided', async () => {
      const mockRow = createMockFolderRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await createFolderAction({
        name: 'Folder',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining(['bg-blue-500'])
      );
    });

    it('should return null on database error', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await createFolderAction({
        name: 'Test Folder',
      });

      expect(result.folder).toBeNull();
      expect(result.error).toBe('Failed to create folder');
    });
  });

  describe('updateDocumentAction', () => {
    it('should check for documents:write permission', async () => {
      const mockRow = createMockDocumentRow();
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await updateDocumentAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Updated Name',
      });

      expect(mockRequirePermission).toHaveBeenCalledWith('documents:write');
    });

    it('should update document with partial data', async () => {
      const mockRow = createMockDocumentRow({ name: 'renamed.pdf' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await updateDocumentAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'renamed.pdf',
      });

      expect(result.document?.name).toBe('renamed.pdf');
    });

    it('should validate UUID format', async () => {
      const result = await updateDocumentAction({
        id: 'invalid-uuid',
        name: 'Test',
      });

      expect(result.document).toBeNull();
      expect(result.error).toBe('Failed to update document');
    });

    it('should update tags', async () => {
      const mockRow = createMockDocumentRow({ tags: ['new', 'tags'] });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      const result = await updateDocumentAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        tags: ['new', 'tags'],
      });

      expect(result.document?.tags).toEqual(['new', 'tags']);
    });

    it('should move document to different folder', async () => {
      const mockRow = createMockDocumentRow({ folder_id: 'new-folder' });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await updateDocumentAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        folderId: '550e8400-e29b-41d4-a716-446655440001',
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('folder_id = $1'),
        expect.arrayContaining(['550e8400-e29b-41d4-a716-446655440001'])
      );
    });

    it('should remove document from folder with null folderId', async () => {
      const mockRow = createMockDocumentRow({ folder_id: null });
      mockQuery.mockResolvedValue({ rows: [mockRow] });

      await updateDocumentAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        folderId: null,
      });

      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('folder_id = $1'),
        expect.arrayContaining([null])
      );
    });

    it('should return error when no updates provided', async () => {
      const result = await updateDocumentAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
      });

      expect(result.document).toBeNull();
      expect(result.error).toBe('No updates provided');
    });

    it('should return error when document not found', async () => {
      mockQuery.mockResolvedValue({ rows: [] });

      const result = await updateDocumentAction({
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Updated',
      });

      expect(result.document).toBeNull();
      expect(result.error).toBe('Document not found');
    });
  });

  describe('deleteDocumentAction', () => {
    it('should check for documents:delete permission', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      await deleteDocumentAction('550e8400-e29b-41d4-a716-446655440000');

      expect(mockRequirePermission).toHaveBeenCalledWith('documents:delete');
    });

    it('should soft delete document by setting deleted_at', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });

      const result = await deleteDocumentAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('deleted_at = NOW()'),
        ['550e8400-e29b-41d4-a716-446655440000', 'clinic-123']
      );
    });

    it('should return error when document not found', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });

      const result = await deleteDocumentAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Document not found');
    });

    it('should return error on database failure', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await deleteDocumentAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete document');
    });
  });

  describe('deleteFolderAction', () => {
    it('should check for documents:delete permission', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ is_system: false, document_count: 0 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      await deleteFolderAction('550e8400-e29b-41d4-a716-446655440000');

      expect(mockRequirePermission).toHaveBeenCalledWith('documents:delete');
    });

    it('should delete empty folder successfully', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ is_system: false, document_count: 0 }] })
        .mockResolvedValueOnce({ rowCount: 1 });

      const result = await deleteFolderAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(true);
    });

    it('should not delete system folders', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ is_system: true, document_count: 0 }] });

      const result = await deleteFolderAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Cannot delete system folder');
    });

    it('should not delete non-empty folders', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ is_system: false, document_count: 5 }] });

      const result = await deleteFolderAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Folder is not empty');
    });

    it('should return error when folder not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const result = await deleteFolderAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Folder not found');
    });

    it('should return error on database failure', async () => {
      mockQuery.mockRejectedValue(new Error('Database error'));

      const result = await deleteFolderAction('550e8400-e29b-41d4-a716-446655440000');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete folder');
    });
  });
});
