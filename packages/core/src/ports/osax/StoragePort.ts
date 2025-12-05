/**
 * @fileoverview StoragePort - Outbound Port for Secure File Storage
 *
 * Hexagonal Architecture SECONDARY PORT for medical imaging storage.
 * This port abstracts away the storage infrastructure (Supabase, S3, GCS, etc.).
 *
 * @module core/ports/osax/storage-port
 *
 * HEXAGONAL ARCHITECTURE:
 * - Port defined in Core layer
 * - Adapters implement this interface in Infrastructure layer
 * - Domain services depend on this port, not concrete implementations
 *
 * SECURITY:
 * - All files encrypted at rest (AES-256-GCM)
 * - Signed URLs have short TTL (max 5 minutes for analysis)
 * - HIPAA/GDPR compliant storage policies
 */

// ============================================================================
// PORT INTERFACE
// ============================================================================

/**
 * StoragePort - Outbound port for secure file storage operations
 *
 * This interface defines how the application interacts with file storage
 * for medical imaging data. Infrastructure adapters implement this for
 * specific storage providers (Supabase Storage, AWS S3, Google Cloud Storage).
 *
 * @example
 * ```typescript
 * // Supabase Storage Adapter implementing this port
 * class SupabaseStorageAdapter implements StoragePort {
 *   readonly portName = 'secure-storage';
 *   readonly portType = 'outbound';
 *
 *   async getSignedUrl(path: string, ttlSeconds: number): Promise<string> {
 *     // SECURITY: URLs are time-limited
 *     const { data, error } = await this.supabase.storage
 *       .from('imaging')
 *       .createSignedUrl(path, ttlSeconds);
 *     return data.signedUrl;
 *   }
 * }
 * ```
 */
export interface StoragePort {
  /**
   * Port identifier
   */
  readonly portName: 'secure-storage';

  /**
   * Port type (outbound = driven)
   */
  readonly portType: 'outbound';

  /**
   * Generate a signed URL for secure image access
   *
   * SECURITY:
   * - URLs are time-limited (max 5 minutes for analysis)
   * - Single-use when possible
   * - Audit logged
   *
   * @param path - Storage path (bucket/key)
   * @param ttlSeconds - URL validity period (max 300 for imaging)
   * @returns Signed URL for secure access
   *
   * TODO: Add OpenTelemetry span: osax.storage.signUrl
   */
  getSignedUrl(path: string, ttlSeconds: number): Promise<string>;

  /**
   * Verify file exists and is accessible
   *
   * @param path - Storage path to check
   * @returns True if file exists and is accessible
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file metadata without downloading
   *
   * @param path - Storage path
   * @returns File metadata
   */
  getMetadata(path: string): Promise<StorageMetadata>;

  /**
   * Upload a file to secure storage
   *
   * SECURITY:
   * - Files are encrypted at rest
   * - Content type validated
   * - Size limits enforced
   *
   * @param path - Destination path
   * @param content - File content as Buffer
   * @param options - Upload options
   * @returns Upload result with file reference
   */
  upload(path: string, content: Buffer, options?: UploadOptions): Promise<UploadResult>;

  /**
   * Delete a file from storage
   *
   * SECURITY:
   * - Audit logged
   * - Soft delete with retention period
   *
   * @param path - Storage path to delete
   * @returns True if deleted successfully
   */
  delete(path: string): Promise<boolean>;

  /**
   * Health check for storage service
   */
  healthCheck(): Promise<StorageHealth>;
}

// ============================================================================
// INPUT/OUTPUT TYPES
// ============================================================================

/**
 * File metadata
 */
export interface StorageMetadata {
  /**
   * File size in bytes
   */
  readonly size: number;

  /**
   * Content MIME type
   */
  readonly contentType: string;

  /**
   * Upload timestamp (ISO 8601)
   */
  readonly uploadedAt: string;

  /**
   * SHA-256 checksum of file content
   */
  readonly checksumSha256: string;

  /**
   * Last modified timestamp
   */
  readonly lastModified?: string;

  /**
   * Custom metadata key-value pairs
   */
  readonly customMetadata?: Record<string, string>;
}

/**
 * Upload options
 */
export interface UploadOptions {
  /**
   * Content MIME type
   */
  readonly contentType?: string;

  /**
   * Custom metadata to attach
   */
  readonly metadata?: Record<string, string>;

  /**
   * Access control level
   */
  readonly acl?: 'private' | 'authenticated';

  /**
   * Enable deduplication check
   */
  readonly deduplicate?: boolean;
}

/**
 * Upload result
 */
export interface UploadResult {
  /**
   * Storage path of uploaded file
   */
  readonly path: string;

  /**
   * File size in bytes
   */
  readonly size: number;

  /**
   * SHA-256 checksum
   */
  readonly checksumSha256: string;

  /**
   * Upload timestamp
   */
  readonly uploadedAt: string;
}

/**
 * Storage health status
 */
export interface StorageHealth {
  /**
   * Whether storage is available
   */
  readonly available: boolean;

  /**
   * Current latency in milliseconds
   */
  readonly latencyMs: number;

  /**
   * Storage provider identifier
   */
  readonly provider?: string;

  /**
   * Storage bucket/container
   */
  readonly bucket?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Error codes for storage operations
 */
export type StorageErrorCode =
  | 'FILE_NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'INVALID_PATH'
  | 'FILE_TOO_LARGE'
  | 'INVALID_CONTENT_TYPE'
  | 'QUOTA_EXCEEDED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL_ERROR';

/**
 * Error thrown by storage operations
 */
export class StorageError extends Error {
  public readonly code: StorageErrorCode;
  public readonly path?: string;
  public readonly retryable: boolean;

  constructor(
    code: StorageErrorCode,
    message: string,
    path?: string,
    retryable: boolean = false
  ) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.path = path;
    this.retryable = retryable;
    Object.setPrototypeOf(this, StorageError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      path: this.path,
      retryable: this.retryable,
    };
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Maximum TTL for imaging analysis URLs (5 minutes)
 */
export const MAX_IMAGING_URL_TTL_SECONDS = 300;

/**
 * Maximum file size for imaging uploads (500 MB)
 */
export const MAX_IMAGING_FILE_SIZE_BYTES = 500 * 1024 * 1024;

/**
 * Allowed MIME types for dental imaging
 */
export const ALLOWED_IMAGING_MIME_TYPES = [
  'application/dicom',
  'image/png',
  'image/jpeg',
  'application/octet-stream', // For CBCT data
] as const;

// ============================================================================
// TYPE GUARDS
// ============================================================================

/**
 * Type guard for StoragePort
 */
export function isStoragePort(value: unknown): value is StoragePort {
  return (
    typeof value === 'object' &&
    value !== null &&
    'portName' in value &&
    (value as StoragePort).portName === 'secure-storage' &&
    'getSignedUrl' in value &&
    typeof (value as StoragePort).getSignedUrl === 'function'
  );
}
