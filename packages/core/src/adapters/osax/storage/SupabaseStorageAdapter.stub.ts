/**
 * @fileoverview SupabaseStorageAdapter.stub - Stub Adapter for Development/Testing
 *
 * Returns mock signed URLs and metadata for development and testing.
 * Not for production use.
 *
 * @module core/adapters/osax/storage/supabase-storage-adapter-stub
 *
 * TODO: Implement actual Supabase Storage integration
 */

import type {
  StoragePort,
  StorageMetadata,
  UploadOptions,
  UploadResult,
  StorageHealth,
} from '../../../ports/osax/StoragePort.js';

// ============================================================================
// ADAPTER IMPLEMENTATION
// ============================================================================

/**
 * SupabaseStorageAdapter.stub - Stub adapter for development/testing
 *
 * Returns mock signed URLs and storage operations. Use for:
 * - Local development without Supabase access
 * - Unit testing service layer
 * - Integration testing without external dependencies
 *
 * @example
 * ```typescript
 * const adapter = new SupabaseStorageAdapterStub();
 * const url = await adapter.getSignedUrl('imaging/test.dcm', 300);
 * // Returns: 'https://mock-storage.local/signed/imaging/test.dcm?token=...'
 * ```
 *
 * TODO: Implement actual Supabase Storage integration with:
 * - supabase.storage.from('imaging').createSignedUrl()
 * - Proper bucket configuration
 * - RLS policies for PHI protection
 */
export class SupabaseStorageAdapterStub implements StoragePort {
  public readonly portName = 'secure-storage' as const;
  public readonly portType = 'outbound' as const;

  /**
   * Base URL for mock signed URLs
   */
  private readonly mockBaseUrl: string;

  /**
   * Simulated storage for uploaded files
   */
  private readonly mockStorage: Map<string, MockFile>;

  constructor(options?: SupabaseStorageAdapterStubOptions) {
    this.mockBaseUrl = options?.mockBaseUrl ?? 'https://mock-storage.local/signed';
    this.mockStorage = new Map();
  }

  /**
   * Generate a mock signed URL
   *
   * SECURITY: In production, URLs should be time-limited (max 5 minutes for analysis)
   *
   * TODO: Implement actual Supabase signed URL generation
   */
  public async getSignedUrl(path: string, ttlSeconds: number): Promise<string> {
    // Simulate API latency
    await this.delay(10);

    // Generate mock signed URL
    const token = this.generateMockToken();
    const expiry = Date.now() + ttlSeconds * 1000;

    return `${this.mockBaseUrl}/${path}?token=${token}&expires=${expiry}`;
  }

  /**
   * Check if file exists (mock)
   */
  public async exists(path: string): Promise<boolean> {
    await this.delay(5);

    // Check mock storage or return true for testing
    return this.mockStorage.has(path) || path.startsWith('imaging/');
  }

  /**
   * Get file metadata (mock)
   */
  public async getMetadata(path: string): Promise<StorageMetadata> {
    await this.delay(10);

    const mockFile = this.mockStorage.get(path);

    if (mockFile) {
      return {
        size: mockFile.size,
        contentType: mockFile.contentType,
        uploadedAt: mockFile.uploadedAt,
        checksumSha256: mockFile.checksumSha256,
      };
    }

    // Return mock metadata for testing
    return {
      size: 1024 * 1024 * 50, // 50 MB
      contentType: 'application/dicom',
      uploadedAt: new Date().toISOString(),
      checksumSha256: this.generateMockChecksum(),
    };
  }

  /**
   * Upload file (mock)
   *
   * TODO: Implement actual Supabase upload with encryption at rest
   */
  public async upload(
    path: string,
    content: Buffer,
    options?: UploadOptions
  ): Promise<UploadResult> {
    await this.delay(50);

    const checksum = this.generateMockChecksum();
    const uploadedAt = new Date().toISOString();

    // Store in mock storage
    this.mockStorage.set(path, {
      content,
      size: content.length,
      contentType: options?.contentType ?? 'application/octet-stream',
      uploadedAt,
      checksumSha256: checksum,
    });

    return {
      path,
      size: content.length,
      checksumSha256: checksum,
      uploadedAt,
    };
  }

  /**
   * Delete file (mock)
   */
  public async delete(path: string): Promise<boolean> {
    await this.delay(10);

    return this.mockStorage.delete(path);
  }

  /**
   * Health check (mock)
   */
  public async healthCheck(): Promise<StorageHealth> {
    await this.delay(5);

    return {
      available: true,
      latencyMs: 15,
      provider: 'supabase-stub',
      bucket: 'imaging',
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Generate mock token
   */
  private generateMockToken(): string {
    return Array.from({ length: 32 }, () =>
      Math.random().toString(36).charAt(2)
    ).join('');
  }

  /**
   * Generate mock SHA-256 checksum
   */
  private generateMockChecksum(): string {
    return Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }

  /**
   * Promise-based delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// SUPPORTING TYPES
// ============================================================================

/**
 * Options for SupabaseStorageAdapterStub
 */
export interface SupabaseStorageAdapterStubOptions {
  /**
   * Base URL for mock signed URLs
   */
  readonly mockBaseUrl?: string;
}

/**
 * Internal mock file representation
 */
interface MockFile {
  content: Buffer;
  size: number;
  contentType: string;
  uploadedAt: string;
  checksumSha256: string;
}
