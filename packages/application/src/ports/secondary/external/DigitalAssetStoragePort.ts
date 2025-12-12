/**
 * @fileoverview Digital Asset Storage Port Interface (Secondary Port)
 *
 * Defines the interface for storing and retrieving digital dental assets
 * including STL, PLY, DICOM, and other 3D/medical imaging files.
 *
 * @module application/ports/secondary/external/DigitalAssetStoragePort
 *
 * ## Hexagonal Architecture
 *
 * This is a **SECONDARY PORT** (driven port) that defines what the
 * application needs from the infrastructure layer for digital asset storage.
 *
 * ## Features
 *
 * - Multi-format support (STL, PLY, OBJ, DCM, DICOM)
 * - Secure presigned URLs for uploads/downloads
 * - Checksum verification for data integrity
 * - Thumbnail generation for 3D models
 * - HIPAA-compliant storage with encryption
 */

import type { DigitalFileFormat } from '@medicalcor/types';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Asset metadata for storage
 */
export interface AssetMetadata {
  /** Original filename */
  filename: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  fileSize: number;
  /** SHA-256 checksum */
  checksum?: string;
  /** Associated lab case ID */
  labCaseId: string;
  /** Asset type */
  assetType: 'SCAN' | 'DESIGN' | 'PHOTO' | 'DOCUMENT' | 'THUMBNAIL';
  /** File format */
  format: DigitalFileFormat | 'PNG' | 'JPG' | 'PDF';
  /** Uploaded by user ID */
  uploadedBy: string;
  /** Custom metadata */
  customMetadata?: Record<string, string>;
}

/**
 * Stored asset reference
 */
export interface StoredAsset {
  /** Storage path/key */
  path: string;
  /** Public URL (if available) */
  url?: string;
  /** File size in bytes */
  fileSize: number;
  /** SHA-256 checksum */
  checksum: string;
  /** Content type */
  contentType: string;
  /** Upload timestamp */
  uploadedAt: Date;
  /** Expiry for presigned URLs */
  urlExpiresAt?: Date;
}

/**
 * Presigned URL for upload
 */
export interface PresignedUploadUrl {
  /** URL to upload to */
  uploadUrl: string;
  /** HTTP method to use */
  method: 'PUT' | 'POST';
  /** Required headers */
  headers: Record<string, string>;
  /** Storage path where file will be saved */
  storagePath: string;
  /** Expiration timestamp */
  expiresAt: Date;
  /** Maximum file size allowed (bytes) */
  maxFileSize: number;
}

/**
 * Presigned URL for download
 */
export interface PresignedDownloadUrl {
  /** URL to download from */
  downloadUrl: string;
  /** Filename for download */
  filename: string;
  /** Expiration timestamp */
  expiresAt: Date;
}

/**
 * Upload options
 */
export interface UploadOptions {
  /** Content type override */
  contentType?: string;
  /** Server-side encryption */
  encryption?: 'AES256' | 'aws:kms';
  /** Access control (default: private) */
  acl?: 'private' | 'authenticated-read';
  /** Cache control header */
  cacheControl?: string;
  /** Tags for cost allocation */
  tags?: Record<string, string>;
}

/**
 * Thumbnail generation options
 */
export interface ThumbnailOptions {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Output format */
  format: 'PNG' | 'JPG' | 'WEBP';
  /** Quality (1-100, for JPG/WEBP) */
  quality?: number;
  /** Background color (hex) */
  backgroundColor?: string;
}

/**
 * Asset listing options
 */
export interface ListAssetsOptions {
  /** Lab case ID to filter by */
  labCaseId?: string;
  /** Asset type filter */
  assetType?: AssetMetadata['assetType'];
  /** Format filter */
  format?: AssetMetadata['format'];
  /** Pagination cursor */
  cursor?: string;
  /** Maximum results */
  limit?: number;
}

/**
 * Asset listing result
 */
export interface ListAssetsResult {
  /** Assets found */
  assets: Array<StoredAsset & { metadata: AssetMetadata }>;
  /** Next page cursor */
  nextCursor?: string;
  /** Total count (if available) */
  totalCount?: number;
}

// =============================================================================
// DIGITAL ASSET STORAGE PORT INTERFACE
// =============================================================================

/**
 * Digital Asset Storage Port Interface
 *
 * Defines the contract for storing and retrieving digital dental assets
 * with S3-compatible semantics and HIPAA-compliant security.
 *
 * @example
 * ```typescript
 * // Get presigned upload URL
 * const { uploadUrl, storagePath } = await storage.getPresignedUploadUrl({
 *   filename: 'upper_arch.stl',
 *   mimeType: 'model/stl',
 *   fileSize: 15_000_000,
 *   labCaseId: 'case-123',
 *   assetType: 'SCAN',
 *   format: 'STL',
 *   uploadedBy: 'user-456',
 * });
 *
 * // Upload file via presigned URL (client-side)
 * await fetch(uploadUrl, { method: 'PUT', body: file });
 *
 * // Confirm upload and get stored asset
 * const asset = await storage.confirmUpload(storagePath);
 * ```
 */
export interface IDigitalAssetStoragePort {
  // ===========================================================================
  // UPLOAD OPERATIONS
  // ===========================================================================

  /**
   * Get a presigned URL for uploading an asset
   *
   * The returned URL allows direct client-side upload to object storage,
   * bypassing the application server for large files.
   *
   * @param metadata - Asset metadata
   * @param options - Upload options
   * @returns Presigned upload URL and details
   */
  getPresignedUploadUrl(
    metadata: AssetMetadata,
    options?: UploadOptions
  ): Promise<PresignedUploadUrl>;

  /**
   * Upload an asset directly (server-side)
   *
   * Use this for smaller files or when client-side upload is not possible.
   *
   * @param data - File data as Buffer
   * @param metadata - Asset metadata
   * @param options - Upload options
   * @returns Stored asset reference
   */
  upload(
    data: Buffer,
    metadata: AssetMetadata,
    options?: UploadOptions
  ): Promise<StoredAsset>;

  /**
   * Upload an asset from a stream (server-side)
   *
   * Use this for large files to avoid memory issues.
   *
   * @param stream - Readable stream
   * @param metadata - Asset metadata
   * @param options - Upload options
   * @returns Stored asset reference
   */
  uploadStream(
    stream: NodeJS.ReadableStream,
    metadata: AssetMetadata,
    options?: UploadOptions
  ): Promise<StoredAsset>;

  /**
   * Confirm a presigned upload was successful
   *
   * Call this after client-side upload to verify and record the asset.
   *
   * @param storagePath - Storage path from presigned URL
   * @returns Stored asset reference
   * @throws Error if file not found or checksum mismatch
   */
  confirmUpload(storagePath: string): Promise<StoredAsset>;

  // ===========================================================================
  // DOWNLOAD OPERATIONS
  // ===========================================================================

  /**
   * Get a presigned URL for downloading an asset
   *
   * @param storagePath - Storage path of the asset
   * @param expiresInSeconds - URL expiration time (default: 3600)
   * @returns Presigned download URL
   */
  getPresignedDownloadUrl(
    storagePath: string,
    expiresInSeconds?: number
  ): Promise<PresignedDownloadUrl>;

  /**
   * Download an asset directly (server-side)
   *
   * @param storagePath - Storage path of the asset
   * @returns File data as Buffer
   */
  download(storagePath: string): Promise<Buffer>;

  /**
   * Download an asset as a stream (server-side)
   *
   * @param storagePath - Storage path of the asset
   * @returns Readable stream
   */
  downloadStream(storagePath: string): Promise<NodeJS.ReadableStream>;

  // ===========================================================================
  // ASSET MANAGEMENT
  // ===========================================================================

  /**
   * Check if an asset exists
   *
   * @param storagePath - Storage path to check
   * @returns True if asset exists
   */
  exists(storagePath: string): Promise<boolean>;

  /**
   * Get asset metadata
   *
   * @param storagePath - Storage path of the asset
   * @returns Stored asset with metadata or null if not found
   */
  getMetadata(storagePath: string): Promise<(StoredAsset & { metadata: AssetMetadata }) | null>;

  /**
   * Delete an asset
   *
   * @param storagePath - Storage path of the asset
   * @throws Error if asset not found
   */
  delete(storagePath: string): Promise<void>;

  /**
   * Delete multiple assets
   *
   * @param storagePaths - Array of storage paths
   * @returns Number of successfully deleted assets
   */
  deleteMany(storagePaths: string[]): Promise<number>;

  /**
   * Copy an asset to a new location
   *
   * @param sourcePath - Source storage path
   * @param destinationPath - Destination storage path
   * @returns New stored asset reference
   */
  copy(sourcePath: string, destinationPath: string): Promise<StoredAsset>;

  /**
   * List assets with filtering
   *
   * @param options - Listing options
   * @returns Paginated list of assets
   */
  list(options: ListAssetsOptions): Promise<ListAssetsResult>;

  // ===========================================================================
  // THUMBNAIL GENERATION
  // ===========================================================================

  /**
   * Generate a thumbnail for a 3D model
   *
   * Creates a 2D preview image from an STL/PLY/OBJ file.
   *
   * @param sourceStoragePath - Storage path of the 3D model
   * @param options - Thumbnail options
   * @returns Stored thumbnail asset reference
   */
  generateThumbnail(
    sourceStoragePath: string,
    options: ThumbnailOptions
  ): Promise<StoredAsset>;

  /**
   * Check if thumbnail generation is available for a format
   *
   * @param format - File format
   * @returns True if thumbnails can be generated
   */
  supportsThumbnailGeneration(format: DigitalFileFormat): boolean;

  // ===========================================================================
  // INTEGRITY VERIFICATION
  // ===========================================================================

  /**
   * Calculate checksum for an asset
   *
   * @param storagePath - Storage path of the asset
   * @returns SHA-256 checksum
   */
  calculateChecksum(storagePath: string): Promise<string>;

  /**
   * Verify asset integrity against stored checksum
   *
   * @param storagePath - Storage path of the asset
   * @returns True if checksum matches
   */
  verifyIntegrity(storagePath: string): Promise<boolean>;

  // ===========================================================================
  // LIFECYCLE MANAGEMENT
  // ===========================================================================

  /**
   * Get total storage usage for a lab case
   *
   * @param labCaseId - Lab case ID
   * @returns Total bytes used
   */
  getStorageUsage(labCaseId: string): Promise<number>;

  /**
   * Get total storage usage for a clinic
   *
   * @param clinicId - Clinic ID
   * @returns Total bytes used
   */
  getClinicStorageUsage(clinicId: string): Promise<number>;

  /**
   * Archive old assets to cold storage
   *
   * Move assets older than specified date to cheaper storage tier.
   *
   * @param olderThan - Archive assets older than this date
   * @param labCaseId - Optional lab case ID to limit scope
   * @returns Number of assets archived
   */
  archiveOldAssets(olderThan: Date, labCaseId?: string): Promise<number>;

  /**
   * Restore an archived asset
   *
   * @param storagePath - Storage path of the archived asset
   * @returns Restored asset reference
   */
  restoreFromArchive(storagePath: string): Promise<StoredAsset>;
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/**
 * File format to MIME type mapping
 */
export const FILE_FORMAT_MIME_TYPES: Record<DigitalFileFormat | 'PNG' | 'JPG' | 'PDF', string> = {
  STL: 'model/stl',
  PLY: 'model/ply',
  OBJ: 'model/obj',
  DCM: 'application/dicom',
  DICOM: 'application/dicom',
  PNG: 'image/png',
  JPG: 'image/jpeg',
  PDF: 'application/pdf',
};

/**
 * Maximum file sizes by format (bytes)
 */
export const MAX_FILE_SIZES: Record<AssetMetadata['assetType'], number> = {
  SCAN: 500 * 1024 * 1024, // 500 MB
  DESIGN: 200 * 1024 * 1024, // 200 MB
  PHOTO: 50 * 1024 * 1024, // 50 MB
  DOCUMENT: 25 * 1024 * 1024, // 25 MB
  THUMBNAIL: 5 * 1024 * 1024, // 5 MB
};

/**
 * Generate storage path for an asset
 */
export function generateStoragePath(
  labCaseId: string,
  assetType: AssetMetadata['assetType'],
  filename: string
): string {
  const timestamp = Date.now();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `lab-cases/${labCaseId}/${assetType.toLowerCase()}/${timestamp}_${sanitizedFilename}`;
}
