'use server';

import { z } from 'zod';
import { getDatabase } from '@/lib/db';
import { requirePermission, requireCurrentUser } from '@/lib/auth/server-action-auth';

/**
 * Server Actions for Document Management
 */

// =============================================================================
// Types
// =============================================================================

export interface Document {
  id: string;
  name: string;
  originalName: string | null;
  type: string;
  category: string;
  size: string;
  uploadedBy: string;
  uploadedAt: Date;
  patientId: string | null;
  patientName: string | null;
  folderId: string | null;
  tags: string[];
  isEncrypted: boolean;
}

export interface DocumentFolder {
  id: string;
  name: string;
  parentId: string | null;
  documentCount: number;
  color: string;
  icon: string | null;
  isSystem: boolean;
}

export interface DocumentStats {
  totalDocuments: number;
  totalFolders: number;
  totalSize: string;
  recentUploads: number;
  // Alias properties for page compatibility
  usedSize: string;
  usedPercentage: number;
}

interface DocumentRow {
  id: string;
  name: string;
  original_name: string | null;
  file_type: string | null;
  category: string | null;
  file_size_formatted: string | null;
  uploaded_by_name: string | null;
  uploaded_at: Date;
  patient_id: string | null;
  patient_name: string | null;
  folder_id: string | null;
  tags: string[] | null;
  is_encrypted: boolean;
}

interface FolderRow {
  id: string;
  name: string;
  parent_id: string | null;
  document_count: number;
  color: string | null;
  icon: string | null;
  is_system: boolean;
}

// =============================================================================
// Validation Schemas
// =============================================================================

const CreateDocumentSchema = z.object({
  name: z.string().min(1).max(300),
  category: z.string().max(100).optional(),
  folderId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  tags: z.array(z.string()).optional(),
  fileSize: z.number().optional(),
  fileType: z.string().optional(),
});

const CreateFolderSchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().optional(),
  color: z.string().max(50).optional(),
});

const UpdateDocumentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(300).optional(),
  category: z.string().max(100).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

function formatFileSize(bytes: number | null): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function rowToDocument(row: DocumentRow): Document {
  return {
    id: row.id,
    name: row.name,
    originalName: row.original_name,
    type: row.file_type ?? 'unknown',
    category: row.category ?? 'general',
    size: row.file_size_formatted ?? '0 B',
    uploadedBy: row.uploaded_by_name ?? 'Unknown',
    uploadedAt: row.uploaded_at,
    patientId: row.patient_id,
    patientName: row.patient_name,
    folderId: row.folder_id,
    tags: row.tags ?? [],
    isEncrypted: row.is_encrypted,
  };
}

function rowToFolder(row: FolderRow): DocumentFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    documentCount: row.document_count,
    color: row.color ?? 'bg-gray-500',
    icon: row.icon,
    isSystem: row.is_system,
  };
}

// =============================================================================
// Server Actions
// =============================================================================

export async function getDocumentsAction(
  folderId?: string,
  patientId?: string
): Promise<{ documents: Document[]; error?: string }> {
  try {
    await requirePermission('documents:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    let query = `
      SELECT id, name, original_name, file_type, category, file_size_formatted,
             uploaded_by_name, uploaded_at, patient_id, patient_name, folder_id,
             tags, is_encrypted
      FROM documents
      WHERE clinic_id = $1 AND deleted_at IS NULL
    `;
    const params: unknown[] = [user.clinicId];
    let paramIndex = 2;

    if (folderId) {
      query += ` AND folder_id = $${paramIndex++}`;
      params.push(folderId);
    }
    if (patientId) {
      query += ` AND patient_id = $${paramIndex++}`;
      params.push(patientId);
    }

    query += ` ORDER BY uploaded_at DESC`;

    const result = await database.query<DocumentRow>(query, params);

    return { documents: result.rows.map(rowToDocument) };
  } catch (error) {
    console.error('Error fetching documents:', error);
    return { documents: [], error: 'Failed to fetch documents' };
  }
}

export async function getFoldersAction(): Promise<{ folders: DocumentFolder[]; error?: string }> {
  try {
    await requirePermission('documents:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<FolderRow>(
      `SELECT id, name, parent_id, document_count, color, icon, is_system
       FROM document_folders
       WHERE clinic_id = $1
       ORDER BY is_system DESC, name`,
      [user.clinicId]
    );

    return { folders: result.rows.map(rowToFolder) };
  } catch (error) {
    console.error('Error fetching folders:', error);
    return { folders: [], error: 'Failed to fetch folders' };
  }
}

export async function getDocumentStatsAction(): Promise<{
  stats: DocumentStats | null;
  error?: string;
}> {
  try {
    await requirePermission('documents:read');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query<{
      total_documents: string;
      total_folders: string;
      total_size: string;
      recent_uploads: string;
    }>(
      `SELECT
        (SELECT COUNT(*) FROM documents WHERE clinic_id = $1 AND deleted_at IS NULL) as total_documents,
        (SELECT COUNT(*) FROM document_folders WHERE clinic_id = $1) as total_folders,
        (SELECT COALESCE(SUM(file_size), 0) FROM documents WHERE clinic_id = $1 AND deleted_at IS NULL) as total_size,
        (SELECT COUNT(*) FROM documents WHERE clinic_id = $1 AND deleted_at IS NULL
         AND uploaded_at >= NOW() - INTERVAL '7 days') as recent_uploads`,
      [user.clinicId]
    );

    const row = result.rows[0];
    const totalSizeBytes = parseInt(row.total_size);
    const totalSizeFormatted = formatFileSize(totalSizeBytes);
    // Assume 10GB quota for now
    const quotaBytes = 10 * 1024 * 1024 * 1024;
    const usedPercentage = Math.round((totalSizeBytes / quotaBytes) * 100);
    return {
      stats: {
        totalDocuments: parseInt(row.total_documents),
        totalFolders: parseInt(row.total_folders),
        totalSize: totalSizeFormatted,
        recentUploads: parseInt(row.recent_uploads),
        usedSize: totalSizeFormatted,
        usedPercentage,
      },
    };
  } catch (error) {
    console.error('Error fetching document stats:', error);
    return { stats: null, error: 'Failed to fetch document stats' };
  }
}

export async function createDocumentRecordAction(
  data: z.infer<typeof CreateDocumentSchema>
): Promise<{ document: Document | null; error?: string }> {
  try {
    await requirePermission('documents:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = CreateDocumentSchema.parse(data);

    const result = await database.query<DocumentRow>(
      `INSERT INTO documents (clinic_id, name, original_name, category, folder_id, patient_id,
              tags, file_size, file_size_formatted, file_type, uploaded_by, uploaded_by_name)
       VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, name, original_name, file_type, category, file_size_formatted,
                 uploaded_by_name, uploaded_at, patient_id, patient_name, folder_id,
                 tags, is_encrypted`,
      [
        user.clinicId,
        validated.name,
        validated.category ?? 'general',
        validated.folderId ?? null,
        validated.patientId ?? null,
        validated.tags ?? [],
        validated.fileSize ?? 0,
        formatFileSize(validated.fileSize ?? 0),
        validated.fileType ?? 'unknown',
        user.id,
        user.name,
      ]
    );

    return { document: rowToDocument(result.rows[0]) };
  } catch (error) {
    console.error('Error creating document record:', error);
    return { document: null, error: 'Failed to create document record' };
  }
}

export async function createFolderAction(
  data: z.infer<typeof CreateFolderSchema>
): Promise<{ folder: DocumentFolder | null; error?: string }> {
  try {
    await requirePermission('documents:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = CreateFolderSchema.parse(data);

    const result = await database.query<FolderRow>(
      `INSERT INTO document_folders (clinic_id, name, parent_id, color, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, parent_id, document_count, color, icon, is_system`,
      [
        user.clinicId,
        validated.name,
        validated.parentId ?? null,
        validated.color ?? 'bg-blue-500',
        user.id,
      ]
    );

    return { folder: rowToFolder(result.rows[0]) };
  } catch (error) {
    console.error('Error creating folder:', error);
    return { folder: null, error: 'Failed to create folder' };
  }
}

export async function updateDocumentAction(
  data: z.infer<typeof UpdateDocumentSchema>
): Promise<{ document: Document | null; error?: string }> {
  try {
    await requirePermission('documents:write');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const validated = UpdateDocumentSchema.parse(data);

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (validated.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(validated.name);
    }
    if (validated.category !== undefined) {
      updates.push(`category = $${paramIndex++}`);
      values.push(validated.category);
    }
    if (validated.folderId !== undefined) {
      updates.push(`folder_id = $${paramIndex++}`);
      values.push(validated.folderId);
    }
    if (validated.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      values.push(validated.tags);
    }

    if (updates.length === 0) {
      return { document: null, error: 'No updates provided' };
    }

    values.push(validated.id, user.clinicId);

    const result = await database.query<DocumentRow>(
      `UPDATE documents SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND clinic_id = $${paramIndex} AND deleted_at IS NULL
       RETURNING id, name, original_name, file_type, category, file_size_formatted,
                 uploaded_by_name, uploaded_at, patient_id, patient_name, folder_id,
                 tags, is_encrypted`,
      values
    );

    if (result.rows.length === 0) {
      return { document: null, error: 'Document not found' };
    }

    return { document: rowToDocument(result.rows[0]) };
  } catch (error) {
    console.error('Error updating document:', error);
    return { document: null, error: 'Failed to update document' };
  }
}

export async function deleteDocumentAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('documents:delete');
    const user = await requireCurrentUser();
    const database = getDatabase();

    const result = await database.query(
      `UPDATE documents SET deleted_at = NOW()
       WHERE id = $1 AND clinic_id = $2 AND deleted_at IS NULL`,
      [id, user.clinicId]
    );

    if (result.rowCount === 0) {
      return { success: false, error: 'Document not found' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting document:', error);
    return { success: false, error: 'Failed to delete document' };
  }
}

export async function deleteFolderAction(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await requirePermission('documents:delete');
    const user = await requireCurrentUser();
    const database = getDatabase();

    // Check if folder is empty or system folder
    const folderCheck = await database.query<{ is_system: boolean; document_count: number }>(
      `SELECT is_system, document_count FROM document_folders WHERE id = $1 AND clinic_id = $2`,
      [id, user.clinicId]
    );

    if (folderCheck.rows.length === 0) {
      return { success: false, error: 'Folder not found' };
    }

    if (folderCheck.rows[0].is_system) {
      return { success: false, error: 'Cannot delete system folder' };
    }

    if (folderCheck.rows[0].document_count > 0) {
      return { success: false, error: 'Folder is not empty' };
    }

    await database.query(`DELETE FROM document_folders WHERE id = $1 AND clinic_id = $2`, [
      id,
      user.clinicId,
    ]);

    return { success: true };
  } catch (error) {
    console.error('Error deleting folder:', error);
    return { success: false, error: 'Failed to delete folder' };
  }
}
