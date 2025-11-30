/**
 * @module architecture/infrastructure/secrets
 *
 * Secrets Management
 * ==================
 *
 * Secure secrets storage and retrieval.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// SECRET TYPES
// ============================================================================

export interface Secret {
  readonly name: string;
  readonly value: string;
  readonly version: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SecretVersion {
  readonly version: string;
  readonly createdAt: Date;
  readonly status: 'current' | 'previous' | 'deprecated';
}

// ============================================================================
// SECRETS ERROR
// ============================================================================

export class SecretsError extends Error {
  constructor(
    message: string,
    readonly code: SecretsErrorCode,
    readonly retryable = false
  ) {
    super(message);
    this.name = 'SecretsError';
  }
}

export type SecretsErrorCode =
  | 'NOT_FOUND'
  | 'ACCESS_DENIED'
  | 'VERSION_NOT_FOUND'
  | 'INTERNAL_ERROR';

// ============================================================================
// SECRETS SERVICE
// ============================================================================

export interface SecretsService {
  get(name: string, version?: string): Promise<Result<Secret, SecretsError>>;
  getJson<T>(name: string, version?: string): Promise<Result<T, SecretsError>>;
  put(name: string, value: string): Promise<Result<SecretVersion, SecretsError>>;
  delete(name: string): Promise<Result<void, SecretsError>>;
  listVersions(name: string): Promise<Result<SecretVersion[], SecretsError>>;
  exists(name: string): Promise<boolean>;
}

// ============================================================================
// IN-MEMORY SECRETS SERVICE
// ============================================================================

export class InMemorySecretsService implements SecretsService {
  private secrets = new Map<string, { versions: Map<string, Secret>; current: string }>();

  async get(name: string, version?: string): Promise<Result<Secret, SecretsError>> {
    const secret = this.secrets.get(name);
    if (!secret) {
      return Err(new SecretsError('Secret not found', 'NOT_FOUND'));
    }

    const targetVersion = version ?? secret.current;
    const secretVersion = secret.versions.get(targetVersion);
    if (!secretVersion) {
      return Err(new SecretsError('Version not found', 'VERSION_NOT_FOUND'));
    }

    return Ok(secretVersion);
  }

  async getJson<T>(name: string, version?: string): Promise<Result<T, SecretsError>> {
    const result = await this.get(name, version);
    if (!result.isOk) return Err(result.error);
    try {
      return Ok(JSON.parse(result.value.value) as T);
    } catch {
      return Err(new SecretsError('Failed to parse secret as JSON', 'INTERNAL_ERROR'));
    }
  }

  async put(name: string, value: string): Promise<Result<SecretVersion, SecretsError>> {
    const now = new Date();
    const version = crypto.randomUUID();

    const secret: Secret = { name, value, version, createdAt: now, updatedAt: now };

    const existing = this.secrets.get(name);
    if (existing) {
      existing.versions.set(version, secret);
      existing.current = version;
    } else {
      this.secrets.set(name, { versions: new Map([[version, secret]]), current: version });
    }

    return Ok({ version, createdAt: now, status: 'current' });
  }

  async delete(name: string): Promise<Result<void, SecretsError>> {
    if (!this.secrets.has(name)) {
      return Err(new SecretsError('Secret not found', 'NOT_FOUND'));
    }
    this.secrets.delete(name);
    return Ok(undefined);
  }

  async listVersions(name: string): Promise<Result<SecretVersion[], SecretsError>> {
    const secret = this.secrets.get(name);
    if (!secret) {
      return Err(new SecretsError('Secret not found', 'NOT_FOUND'));
    }

    const versions = Array.from(secret.versions.values()).map((v) => ({
      version: v.version,
      createdAt: v.createdAt,
      status: v.version === secret.current ? 'current' : 'previous',
    })) as SecretVersion[];

    return Ok(versions);
  }

  async exists(name: string): Promise<boolean> {
    return this.secrets.has(name);
  }
}

// ============================================================================
// ENVIRONMENT SECRETS SERVICE
// ============================================================================

export class EnvironmentSecretsService implements SecretsService {
  constructor(private prefix = 'SECRET_') {}

  async get(name: string): Promise<Result<Secret, SecretsError>> {
    const envName = this.prefix + name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    const value = process.env[envName];

    if (value === undefined) {
      return Err(new SecretsError('Secret not found', 'NOT_FOUND'));
    }

    return Ok({ name, value, version: 'env', createdAt: new Date(), updatedAt: new Date() });
  }

  async getJson<T>(name: string): Promise<Result<T, SecretsError>> {
    const result = await this.get(name);
    if (!result.isOk) return Err(result.error);
    try {
      return Ok(JSON.parse(result.value.value) as T);
    } catch {
      return Err(new SecretsError('Failed to parse secret as JSON', 'INTERNAL_ERROR'));
    }
  }

  async put(): Promise<Result<SecretVersion, SecretsError>> {
    return Err(new SecretsError('Cannot write to environment secrets', 'ACCESS_DENIED'));
  }

  async delete(): Promise<Result<void, SecretsError>> {
    return Err(new SecretsError('Cannot delete environment secrets', 'ACCESS_DENIED'));
  }

  async listVersions(): Promise<Result<SecretVersion[], SecretsError>> {
    return Ok([{ version: 'env', createdAt: new Date(), status: 'current' }]);
  }

  async exists(name: string): Promise<boolean> {
    const envName = this.prefix + name.toUpperCase().replace(/[^A-Z0-9]/g, '_');
    return process.env[envName] !== undefined;
  }
}
