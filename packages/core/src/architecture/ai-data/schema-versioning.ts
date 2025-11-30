/**
 * @module architecture/ai-data/schema-versioning
 *
 * Schema Versioning
 * =================
 *
 * Data schema versioning and migrations.
 */

import { Ok, Err, type Result } from '../../types/result.js';

// ============================================================================
// SCHEMA TYPES
// ============================================================================

export interface Schema {
  readonly id: string;
  readonly name: string;
  readonly version: SchemaVersion;
  readonly fields: SchemaField[];
  readonly metadata: SchemaMetadata;
}

export interface SchemaVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface SchemaField {
  readonly name: string;
  readonly type: FieldType;
  readonly nullable: boolean;
  readonly description?: string;
}

export type FieldType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'uuid'
  | 'json'
  | 'array';

export interface SchemaMetadata {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly author?: string;
}

// ============================================================================
// SCHEMA ERROR
// ============================================================================

export class SchemaError extends Error {
  constructor(
    message: string,
    readonly code: SchemaErrorCode
  ) {
    super(message);
    this.name = 'SchemaError';
  }
}

export type SchemaErrorCode =
  | 'SCHEMA_NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'INVALID_SCHEMA'
  | 'INTERNAL_ERROR';

// ============================================================================
// SCHEMA REGISTRY
// ============================================================================

export interface SchemaRegistry {
  register(schema: Schema): Promise<Result<void, SchemaError>>;
  get(id: string, version?: SchemaVersion): Promise<Result<Schema, SchemaError>>;
  getLatest(id: string): Promise<Result<Schema, SchemaError>>;
  listVersions(id: string): Promise<Result<SchemaVersion[], SchemaError>>;
}

// ============================================================================
// IN-MEMORY SCHEMA REGISTRY
// ============================================================================

export class InMemorySchemaRegistry implements SchemaRegistry {
  private schemas = new Map<string, Map<string, Schema>>();

  register(schema: Schema): Promise<Result<void, SchemaError>> {
    const versionKey = this.versionToString(schema.version);
    let versions = this.schemas.get(schema.id);
    if (!versions) {
      versions = new Map();
      this.schemas.set(schema.id, versions);
    }
    versions.set(versionKey, schema);
    return Promise.resolve(Ok(undefined));
  }

  async get(id: string, version?: SchemaVersion): Promise<Result<Schema, SchemaError>> {
    const versions = this.schemas.get(id);
    if (!versions) {
      return Err(new SchemaError('Schema not found', 'SCHEMA_NOT_FOUND'));
    }
    if (version) {
      const versionKey = this.versionToString(version);
      const schema = versions.get(versionKey);
      if (!schema) {
        return Err(new SchemaError('Version not found', 'VERSION_NOT_FOUND'));
      }
      return Ok(schema);
    }
    return this.getLatest(id);
  }

  getLatest(id: string): Promise<Result<Schema, SchemaError>> {
    const versions = this.schemas.get(id);
    if (!versions || versions.size === 0) {
      return Promise.resolve(Err(new SchemaError('Schema not found', 'SCHEMA_NOT_FOUND')));
    }
    let latest: Schema | null = null;
    for (const schema of versions.values()) {
      if (!latest || this.compareVersions(schema.version, latest.version) > 0) {
        latest = schema;
      }
    }
    if (!latest) {
      return Promise.resolve(Err(new SchemaError('Schema not found', 'SCHEMA_NOT_FOUND')));
    }
    return Promise.resolve(Ok(latest));
  }

  listVersions(id: string): Promise<Result<SchemaVersion[], SchemaError>> {
    const versions = this.schemas.get(id);
    if (!versions) {
      return Promise.resolve(Err(new SchemaError('Schema not found', 'SCHEMA_NOT_FOUND')));
    }
    const versionList = Array.from(versions.values())
      .map((s) => s.version)
      .sort((a, b) => this.compareVersions(a, b));
    return Promise.resolve(Ok(versionList));
  }

  private versionToString(version: SchemaVersion): string {
    return `${version.major}.${version.minor}.${version.patch}`;
  }

  private compareVersions(a: SchemaVersion, b: SchemaVersion): number {
    if (a.major !== b.major) return a.major - b.major;
    if (a.minor !== b.minor) return a.minor - b.minor;
    return a.patch - b.patch;
  }
}

// ============================================================================
// SCHEMA BUILDER
// ============================================================================

export class SchemaBuilder {
  private fields: SchemaField[] = [];

  constructor(
    private id: string,
    private name: string,
    private version: SchemaVersion
  ) {}

  field(
    name: string,
    type: FieldType,
    options?: { nullable?: boolean; description?: string }
  ): this {
    this.fields.push({
      name,
      type,
      nullable: options?.nullable ?? true,
      description: options?.description,
    });
    return this;
  }

  string(name: string, options?: { nullable?: boolean; description?: string }): this {
    return this.field(name, 'string', options);
  }

  integer(name: string, options?: { nullable?: boolean; description?: string }): this {
    return this.field(name, 'integer', options);
  }

  uuid(name: string, options?: { nullable?: boolean; description?: string }): this {
    return this.field(name, 'uuid', options);
  }

  build(): Schema {
    return {
      id: this.id,
      name: this.name,
      version: this.version,
      fields: [...this.fields],
      metadata: { createdAt: new Date(), updatedAt: new Date() },
    };
  }
}

export function schema(id: string, name: string, version: SchemaVersion | string): SchemaBuilder {
  const v = typeof version === 'string' ? parseVersion(version) : version;
  return new SchemaBuilder(id, name, v);
}

export function parseVersion(version: string): SchemaVersion {
  const parts = version.split('.').map(Number);
  return { major: parts[0] ?? 0, minor: parts[1] ?? 0, patch: parts[2] ?? 0 };
}
