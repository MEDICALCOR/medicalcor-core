/**
 * @module architecture/infrastructure/storage
 *
 * Cloud Storage Abstraction
 * =========================
 *
 * Vendor-agnostic object and file storage.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// STORAGE TYPES
// ============================================================================

export interface ObjectMetadata {
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
  readonly lastModified: Date;
  readonly etag: string;
  readonly metadata: Record<string, string>;
}

export interface UploadOptions {
  readonly contentType?: string;
  readonly metadata?: Record<string, string>;
}

export interface ListResult {
  readonly objects: ObjectMetadata[];
  readonly isTruncated: boolean;
  readonly continuationToken?: string;
}

// ============================================================================
// STORAGE ERROR
// ============================================================================

export class StorageError extends Error {
  constructor(
    message: string,
    readonly code: StorageErrorCode,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export type StorageErrorCode =
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'BUCKET_NOT_FOUND'
  | 'BUCKET_ALREADY_EXISTS'
  | 'INTERNAL_ERROR';

// ============================================================================
// OBJECT STORAGE SERVICE
// ============================================================================

export interface ObjectStorageService {
  upload(
    bucket: string,
    key: string,
    data: Buffer,
    options?: UploadOptions
  ): Promise<Result<ObjectMetadata, StorageError>>;
  download(
    bucket: string,
    key: string
  ): Promise<Result<{ metadata: ObjectMetadata; body: Buffer }, StorageError>>;
  head(bucket: string, key: string): Promise<Result<ObjectMetadata, StorageError>>;
  delete(bucket: string, key: string): Promise<Result<void, StorageError>>;
  list(bucket: string, prefix?: string): Promise<Result<ListResult, StorageError>>;
  exists(bucket: string, key: string): Promise<boolean>;
  createBucket(name: string): Promise<Result<void, StorageError>>;
  deleteBucket(name: string): Promise<Result<void, StorageError>>;
}

// ============================================================================
// IN-MEMORY STORAGE
// ============================================================================

export class InMemoryObjectStorage implements ObjectStorageService {
  private buckets = new Map<string, Map<string, { data: Buffer; metadata: ObjectMetadata }>>();

  async upload(
    bucket: string,
    key: string,
    data: Buffer,
    options?: UploadOptions
  ): Promise<Result<ObjectMetadata, StorageError>> {
    const bucketMap = this.buckets.get(bucket);
    if (!bucketMap) {
      return Err(new StorageError('Bucket not found', 'BUCKET_NOT_FOUND'));
    }

    const metadata: ObjectMetadata = {
      key,
      size: data.length,
      contentType: options?.contentType ?? 'application/octet-stream',
      lastModified: new Date(),
      etag: this.generateEtag(data),
      metadata: options?.metadata ?? {},
    };

    bucketMap.set(key, { data, metadata });
    return Ok(metadata);
  }

  async download(
    bucket: string,
    key: string
  ): Promise<Result<{ metadata: ObjectMetadata; body: Buffer }, StorageError>> {
    const bucketMap = this.buckets.get(bucket);
    if (!bucketMap) {
      return Err(new StorageError('Bucket not found', 'BUCKET_NOT_FOUND'));
    }

    const object = bucketMap.get(key);
    if (!object) {
      return Err(new StorageError('Object not found', 'NOT_FOUND'));
    }

    return Ok({ metadata: object.metadata, body: object.data });
  }

  async head(bucket: string, key: string): Promise<Result<ObjectMetadata, StorageError>> {
    const bucketMap = this.buckets.get(bucket);
    if (!bucketMap) {
      return Err(new StorageError('Bucket not found', 'BUCKET_NOT_FOUND'));
    }

    const object = bucketMap.get(key);
    if (!object) {
      return Err(new StorageError('Object not found', 'NOT_FOUND'));
    }

    return Ok(object.metadata);
  }

  async delete(bucket: string, key: string): Promise<Result<void, StorageError>> {
    const bucketMap = this.buckets.get(bucket);
    if (!bucketMap) {
      return Err(new StorageError('Bucket not found', 'BUCKET_NOT_FOUND'));
    }

    bucketMap.delete(key);
    return Ok(undefined);
  }

  async list(bucket: string, prefix?: string): Promise<Result<ListResult, StorageError>> {
    const bucketMap = this.buckets.get(bucket);
    if (!bucketMap) {
      return Err(new StorageError('Bucket not found', 'BUCKET_NOT_FOUND'));
    }

    let objects = Array.from(bucketMap.values()).map((o) => o.metadata);
    if (prefix) {
      objects = objects.filter((o) => o.key.startsWith(prefix));
    }

    return Ok({ objects, isTruncated: false });
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    return this.buckets.get(bucket)?.has(key) ?? false;
  }

  async createBucket(name: string): Promise<Result<void, StorageError>> {
    if (this.buckets.has(name)) {
      return Err(new StorageError('Bucket already exists', 'BUCKET_ALREADY_EXISTS'));
    }
    this.buckets.set(name, new Map());
    return Ok(undefined);
  }

  async deleteBucket(name: string): Promise<Result<void, StorageError>> {
    if (!this.buckets.has(name)) {
      return Err(new StorageError('Bucket not found', 'BUCKET_NOT_FOUND'));
    }
    this.buckets.delete(name);
    return Ok(undefined);
  }

  private generateEtag(data: Buffer): string {
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      hash = (hash << 5) - hash + data[i]!;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}
