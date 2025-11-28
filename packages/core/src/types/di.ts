/**
 * Type-Safe Dependency Injection Container
 *
 * A lightweight, type-safe DI container that provides:
 * - Compile-time type checking for all dependencies
 * - Singleton and transient lifecycles
 * - Factory and value bindings
 * - Lazy resolution
 * - No runtime reflection (unlike typical DI frameworks)
 *
 * This is a "poor man's DI" that leverages TypeScript's type system
 * instead of decorators and runtime metadata.
 *
 * @example
 * ```ts
 * // Define your container interface
 * interface AppServices {
 *   logger: Logger;
 *   database: Database;
 *   userService: UserService;
 * }
 *
 * // Create and configure the container
 * const container = createContainer<AppServices>()
 *   .singleton('logger', () => new ConsoleLogger())
 *   .singleton('database', () => new PostgresDB(config))
 *   .transient('userService', (c) => new UserService(c.logger, c.database));
 *
 * // Resolve dependencies
 * const userService = container.resolve('userService');
 * ```
 *
 * @module types/di
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Lifecycle of a dependency
 */
export type Lifecycle = 'singleton' | 'transient';

/**
 * Factory function for creating a dependency
 */
export type Factory<TContainer, T> = (container: TContainer) => T;

/**
 * Registration entry for a dependency
 */
interface Registration<TContainer, T> {
  readonly lifecycle: Lifecycle;
  readonly factory: Factory<TContainer, T>;
  instance?: T;
}

/**
 * Type-safe container interface
 */
export interface Container<T extends Record<string, unknown>> {
  /**
   * Register a singleton dependency (created once, reused)
   */
  singleton<K extends keyof T>(key: K, factory: Factory<T, T[K]>): Container<T>;

  /**
   * Register a transient dependency (created on each resolve)
   */
  transient<K extends keyof T>(key: K, factory: Factory<T, T[K]>): Container<T>;

  /**
   * Register a constant value (always returns the same instance)
   */
  value<K extends keyof T>(key: K, value: T[K]): Container<T>;

  /**
   * Resolve a dependency by key
   */
  resolve<K extends keyof T>(key: K): T[K];

  /**
   * Resolve all dependencies at once
   */
  resolveAll(): T;

  /**
   * Check if a dependency is registered
   */
  has(key: keyof T): boolean;

  /**
   * Create a child container that inherits from this one
   */
  createChild(): Container<T>;

  /**
   * Extend container with additional services
   */
  extend<U extends Record<string, unknown>>(
    configure: (c: Container<T & U>) => Container<T & U>
  ): Container<T & U>;
}

// ============================================================================
// IMPLEMENTATION
// ============================================================================

class ContainerImpl<T extends Record<string, unknown>> implements Container<T> {
  private registrations = new Map<keyof T, Registration<T, unknown>>();
  private resolving = new Set<keyof T>(); // For cycle detection
  private parent?: ContainerImpl<T>;

  constructor(parent?: ContainerImpl<T>) {
    this.parent = parent;
  }

  singleton<K extends keyof T>(key: K, factory: Factory<T, T[K]>): Container<T> {
    this.registrations.set(key, {
      lifecycle: 'singleton',
      factory: factory as Factory<T, unknown>,
    });
    return this;
  }

  transient<K extends keyof T>(key: K, factory: Factory<T, T[K]>): Container<T> {
    this.registrations.set(key, {
      lifecycle: 'transient',
      factory: factory as Factory<T, unknown>,
    });
    return this;
  }

  value<K extends keyof T>(key: K, value: T[K]): Container<T> {
    this.registrations.set(key, {
      lifecycle: 'singleton',
      factory: () => value,
      instance: value,
    });
    return this;
  }

  resolve<K extends keyof T>(key: K): T[K] {
    // Cycle detection
    if (this.resolving.has(key)) {
      throw new Error(`Circular dependency detected: ${String(key)}`);
    }

    // Get registration
    const registration = this.registrations.get(key) as Registration<T, T[K]> | undefined;

    // Check parent if not found
    if (!registration && this.parent) {
      return this.parent.resolve(key);
    }

    if (!registration) {
      throw new Error(`Dependency not registered: ${String(key)}`);
    }

    // Return cached singleton
    if (registration.lifecycle === 'singleton' && registration.instance !== undefined) {
      return registration.instance;
    }

    // Create instance
    this.resolving.add(key);
    try {
      const instance = registration.factory(this.createProxy());

      // Cache singleton
      if (registration.lifecycle === 'singleton') {
        registration.instance = instance;
      }

      return instance;
    } finally {
      this.resolving.delete(key);
    }
  }

  resolveAll(): T {
    const result = {} as T;
    for (const key of this.registrations.keys()) {
      result[key] = this.resolve(key);
    }
    // Include parent registrations
    if (this.parent) {
      const parentAll = this.parent.resolveAll();
      for (const key of Object.keys(parentAll) as (keyof T)[]) {
        if (!(key in result)) {
          result[key] = parentAll[key];
        }
      }
    }
    return result;
  }

  has(key: keyof T): boolean {
    return this.registrations.has(key) || (this.parent?.has(key) ?? false);
  }

  createChild(): Container<T> {
    return new ContainerImpl<T>(this);
  }

  extend<U extends Record<string, unknown>>(
    configure: (c: Container<T & U>) => Container<T & U>
  ): Container<T & U> {
    // Cast is safe because we're extending the type
    return configure(this as unknown as Container<T & U>);
  }

  /**
   * Create a proxy that lazily resolves dependencies
   */
  private createProxy(): T {
    return new Proxy({} as T, {
      get: (_target, prop) => {
        return this.resolve(prop as keyof T);
      },
    });
  }
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

/**
 * Create a new type-safe dependency injection container.
 *
 * @example
 * ```ts
 * interface Services {
 *   logger: Logger;
 *   db: Database;
 *   userRepo: UserRepository;
 * }
 *
 * const container = createContainer<Services>()
 *   .singleton('logger', () => new ConsoleLogger())
 *   .singleton('db', () => new PostgresDB())
 *   .transient('userRepo', (c) => new UserRepository(c.db, c.logger));
 *
 * const repo = container.resolve('userRepo');
 * ```
 */
export function createContainer<T extends Record<string, unknown>>(): Container<T> {
  return new ContainerImpl<T>();
}

// ============================================================================
// MODULE PATTERN
// ============================================================================

/**
 * A module is a reusable collection of service registrations.
 * This enables modular organization of dependencies.
 *
 * @example
 * ```ts
 * const loggingModule = defineModule<LoggingServices>((container) =>
 *   container
 *     .singleton('logger', () => new PinoLogger())
 *     .singleton('metrics', () => new PrometheusMetrics())
 * );
 *
 * const databaseModule = defineModule<DatabaseServices>((container) =>
 *   container
 *     .singleton('pool', () => createPool(config))
 *     .singleton('client', (c) => new DatabaseClient(c.pool))
 * );
 *
 * // Compose modules
 * const container = createContainer<AllServices>()
 *   .extend(loggingModule)
 *   .extend(databaseModule);
 * ```
 */
export type Module<T extends Record<string, unknown>> = (container: Container<T>) => Container<T>;

/**
 * Define a reusable module
 */
export function defineModule<T extends Record<string, unknown>>(configure: Module<T>): Module<T> {
  return configure;
}

// ============================================================================
// ASYNC CONTAINER
// ============================================================================

/**
 * Async factory function
 */
export type AsyncFactory<TContainer, T> = (container: TContainer) => Promise<T>;

/**
 * Async container for dependencies that require async initialization
 */
export interface AsyncContainer<T extends Record<string, unknown>> {
  /**
   * Register an async singleton
   */
  singleton<K extends keyof T>(key: K, factory: AsyncFactory<T, T[K]>): AsyncContainer<T>;

  /**
   * Register a sync value
   */
  value<K extends keyof T>(key: K, value: T[K]): AsyncContainer<T>;

  /**
   * Build the container (resolves all singletons)
   */
  build(): Promise<Container<T>>;
}

class AsyncContainerImpl<T extends Record<string, unknown>> implements AsyncContainer<T> {
  private factories = new Map<keyof T, AsyncFactory<T, unknown>>();
  private values = new Map<keyof T, unknown>();

  singleton<K extends keyof T>(key: K, factory: AsyncFactory<T, T[K]>): AsyncContainer<T> {
    this.factories.set(key, factory as AsyncFactory<T, unknown>);
    return this;
  }

  value<K extends keyof T>(key: K, value: T[K]): AsyncContainer<T> {
    this.values.set(key, value);
    return this;
  }

  async build(): Promise<Container<T>> {
    const container = createContainer<T>();

    // Add values first
    for (const [key, value] of this.values) {
      container.value(key, value as T[typeof key]);
    }

    // Resolve all async factories
    const resolved = new Map<keyof T, unknown>();
    for (const [key, factory] of this.factories) {
      // Create a proxy for already resolved values
      const proxy = new Proxy({} as T, {
        get: (_target, prop) => {
          const k = prop as keyof T;
          if (resolved.has(k)) {
            return resolved.get(k);
          }
          if (this.values.has(k)) {
            return this.values.get(k);
          }
          throw new Error(`Dependency ${String(k)} not yet resolved`);
        },
      });

      const instance = await factory(proxy);
      resolved.set(key, instance);
      container.value(key, instance as T[typeof key]);
    }

    return container;
  }
}

/**
 * Create an async container for dependencies with async initialization
 */
export function createAsyncContainer<T extends Record<string, unknown>>(): AsyncContainer<T> {
  return new AsyncContainerImpl<T>();
}

// ============================================================================
// SCOPE
// ============================================================================

/**
 * Create a scoped container that creates new instances for each scope.
 * Useful for request-scoped dependencies in web servers.
 *
 * @example
 * ```ts
 * const scopeFactory = createScope<RequestServices>(rootContainer);
 *
 * // Per-request
 * app.use((req, res, next) => {
 *   req.scope = scopeFactory.createScope();
 *   req.scope.value('request', req);
 *   next();
 * });
 * ```
 */
export interface ScopeFactory<T extends Record<string, unknown>> {
  createScope(): Container<T>;
}

export function createScopeFactory<T extends Record<string, unknown>>(
  parent: Container<T>,
  configure?: (container: Container<T>) => Container<T>
): ScopeFactory<T> {
  return {
    createScope(): Container<T> {
      const child = parent.createChild();
      return configure ? configure(child) : child;
    },
  };
}

// ============================================================================
// TYPE UTILITIES
// ============================================================================

/**
 * Infer the service type from a container
 */
export type ServiceType<C> = C extends Container<infer T> ? T : never;

/**
 * Infer a specific service type from a container
 */
export type ServiceOf<C, K extends keyof ServiceType<C>> = ServiceType<C>[K];

/**
 * Make certain services optional in the container interface
 */
export type OptionalServices<T extends Record<string, unknown>, K extends keyof T> = Omit<T, K> & {
  [P in K]?: T[P];
};
