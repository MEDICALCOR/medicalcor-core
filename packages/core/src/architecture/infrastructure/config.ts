/**
 * @module architecture/infrastructure/config
 *
 * Configuration Management
 * ========================
 *
 * Environment-aware configuration with validation.
 */

// ============================================================================
// CONFIG TYPES
// ============================================================================

export type ConfigSource = 'environment' | 'file' | 'remote' | 'default';

export interface ConfigValue<T = unknown> {
  readonly value: T;
  readonly source: ConfigSource;
  readonly key: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: ValidationError[];
}

export interface ValidationError {
  readonly key: string;
  readonly message: string;
}

// ============================================================================
// CONFIG SERVICE
// ============================================================================

export interface ConfigService {
  get<T>(key: string): T | undefined;
  getOrDefault<T>(key: string, defaultValue: T): T;
  getRequired<T>(key: string): T;
  has(key: string): boolean;
  keys(): string[];
  reload(): Promise<void>;
}

// ============================================================================
// CONFIG ERROR
// ============================================================================

export class ConfigError extends Error {
  constructor(
    message: string,
    readonly code: ConfigErrorCode
  ) {
    super(message);
    this.name = 'ConfigError';
  }
}

export type ConfigErrorCode = 'MISSING_REQUIRED' | 'INVALID_TYPE' | 'VALIDATION_FAILED';

// ============================================================================
// CONFIG LOADER
// ============================================================================

export interface ConfigLoader {
  readonly priority: number;
  readonly source: ConfigSource;
  load(): Promise<Record<string, unknown>>;
}

export class EnvironmentConfigLoader implements ConfigLoader {
  readonly priority = 100;
  readonly source: ConfigSource = 'environment';

  constructor(private prefix?: string) {}

  async load(): Promise<Record<string, unknown>> {
    const config: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (this.prefix && !key.startsWith(this.prefix)) continue;
      const configKey = this.prefix
        ? key.slice(this.prefix.length + 1).toLowerCase()
        : key.toLowerCase();
      config[configKey] = this.parseValue(value);
    }
    return config;
  }

  private parseValue(value: string | undefined): unknown {
    if (value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }
}

// ============================================================================
// DEFAULT CONFIG SERVICE
// ============================================================================

export class DefaultConfigService implements ConfigService {
  private config = new Map<string, ConfigValue>();
  private loaders: ConfigLoader[] = [];

  constructor(loaders?: ConfigLoader[]) {
    this.loaders = loaders ?? [new EnvironmentConfigLoader()];
    this.loaders.sort((a, b) => a.priority - b.priority);
  }

  get<T>(key: string): T | undefined {
    return this.config.get(key)?.value as T | undefined;
  }

  getOrDefault<T>(key: string, defaultValue: T): T {
    return (this.config.get(key)?.value as T) ?? defaultValue;
  }

  getRequired<T>(key: string): T {
    const value = this.config.get(key);
    if (value === undefined) {
      throw new ConfigError(`Required configuration missing: ${key}`, 'MISSING_REQUIRED');
    }
    return value.value as T;
  }

  has(key: string): boolean {
    return this.config.has(key);
  }

  keys(): string[] {
    return Array.from(this.config.keys());
  }

  async reload(): Promise<void> {
    this.config.clear();
    for (const loader of this.loaders) {
      const values = await loader.load();
      for (const [key, value] of Object.entries(values)) {
        this.config.set(key, { value, source: loader.source, key });
      }
    }
  }
}

// ============================================================================
// CONFIG BUILDER
// ============================================================================

export class ConfigBuilder {
  private loaders: ConfigLoader[] = [];

  withEnvironment(prefix?: string): this {
    this.loaders.push(new EnvironmentConfigLoader(prefix));
    return this;
  }

  withLoader(loader: ConfigLoader): this {
    this.loaders.push(loader);
    return this;
  }

  async build(): Promise<ConfigService> {
    const service = new DefaultConfigService(this.loaders);
    await service.reload();
    return service;
  }
}
