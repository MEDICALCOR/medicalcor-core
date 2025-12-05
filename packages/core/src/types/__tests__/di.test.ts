/**
 * Comprehensive tests for dependency injection container
 * Testing type-safe DI container with singleton/transient lifecycles
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createContainer,
  defineModule,
  createAsyncContainer,
  createScopeFactory,
  type Container,
  type Module,
  type AsyncContainer,
} from '../di.js';

// Test services for DI container
interface Logger {
  log(message: string): void;
  level: string;
}

interface Database {
  connect(): void;
  query(sql: string): string[];
  disconnect(): void;
}

interface UserRepository {
  findById(id: string): { id: string; name: string } | null;
  save(user: { id: string; name: string }): void;
}

interface EmailService {
  send(to: string, subject: string, body: string): void;
}

interface TestServices {
  logger: Logger;
  database: Database;
  userRepository: UserRepository;
  emailService: EmailService;
}

describe('Dependency Injection Container', () => {
  describe('createContainer', () => {
    it('should create an empty container', () => {
      const container = createContainer<TestServices>();
      expect(container).toBeDefined();
      expect(container.has('logger' as keyof TestServices)).toBe(false);
    });

    it('should be chainable', () => {
      const container = createContainer<TestServices>();
      const result = container.singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));
      expect(result).toBe(container);
    });
  });

  describe('singleton registration', () => {
    it('should register and resolve a singleton', () => {
      const container = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const logger = container.resolve('logger');
      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');
    });

    it('should return the same instance on multiple resolves', () => {
      const container = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const logger1 = container.resolve('logger');
      const logger2 = container.resolve('logger');

      expect(logger1).toBe(logger2);
    });

    it('should only call factory once for singletons', () => {
      const factory = vi.fn(() => ({
        log: vi.fn(),
        level: 'info',
      }));

      const container = createContainer<TestServices>().singleton('logger', factory);

      container.resolve('logger');
      container.resolve('logger');
      container.resolve('logger');

      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('should provide container to factory', () => {
      const container = createContainer<TestServices>()
        .singleton('logger', () => ({
          log: vi.fn(),
          level: 'info',
        }))
        .singleton('database', (c) => {
          const logger = c.logger;
          return {
            connect: () => logger.log('Connecting...'),
            query: () => [],
            disconnect: () => logger.log('Disconnecting...'),
          };
        });

      const database = container.resolve('database');
      database.connect();

      const logger = container.resolve('logger');
      expect(logger.log).toHaveBeenCalledWith('Connecting...');
    });
  });

  describe('transient registration', () => {
    it('should register and resolve a transient dependency', () => {
      const container = createContainer<TestServices>().transient('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const logger = container.resolve('logger');
      expect(logger).toBeDefined();
    });

    it('should return a new instance on each resolve', () => {
      const container = createContainer<TestServices>().transient('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const logger1 = container.resolve('logger');
      const logger2 = container.resolve('logger');

      expect(logger1).not.toBe(logger2);
    });

    it('should call factory on each resolve', () => {
      const factory = vi.fn(() => ({
        log: vi.fn(),
        level: 'info',
      }));

      const container = createContainer<TestServices>().transient('logger', factory);

      container.resolve('logger');
      container.resolve('logger');
      container.resolve('logger');

      expect(factory).toHaveBeenCalledTimes(3);
    });
  });

  describe('value registration', () => {
    it('should register a constant value', () => {
      const loggerInstance = {
        log: vi.fn(),
        level: 'info',
      };

      const container = createContainer<TestServices>().value('logger', loggerInstance);

      const logger = container.resolve('logger');
      expect(logger).toBe(loggerInstance);
    });

    it('should return the same instance on multiple resolves', () => {
      const loggerInstance = {
        log: vi.fn(),
        level: 'info',
      };

      const container = createContainer<TestServices>().value('logger', loggerInstance);

      const logger1 = container.resolve('logger');
      const logger2 = container.resolve('logger');

      expect(logger1).toBe(logger2);
      expect(logger1).toBe(loggerInstance);
    });
  });

  describe('has', () => {
    it('should return true for registered dependencies', () => {
      const container = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      expect(container.has('logger')).toBe(true);
    });

    it('should return false for unregistered dependencies', () => {
      const container = createContainer<TestServices>();
      expect(container.has('logger')).toBe(false);
    });

    it('should return true after registration', () => {
      const container = createContainer<TestServices>();
      expect(container.has('database')).toBe(false);

      container.singleton('database', () => ({
        connect: vi.fn(),
        query: () => [],
        disconnect: vi.fn(),
      }));

      expect(container.has('database')).toBe(true);
    });
  });

  describe('resolveAll', () => {
    it('should resolve all registered dependencies', () => {
      const container = createContainer<TestServices>()
        .singleton('logger', () => ({
          log: vi.fn(),
          level: 'info',
        }))
        .singleton('database', () => ({
          connect: vi.fn(),
          query: () => [],
          disconnect: vi.fn(),
        }));

      const all = container.resolveAll();

      expect(all.logger).toBeDefined();
      expect(all.database).toBeDefined();
    });

    it('should return empty object for empty container', () => {
      const container = createContainer<TestServices>();
      const all = container.resolveAll();
      expect(Object.keys(all)).toHaveLength(0);
    });

    it('should include all registered services', () => {
      const container = createContainer<TestServices>()
        .singleton('logger', () => ({ log: vi.fn(), level: 'info' }))
        .singleton('database', () => ({ connect: vi.fn(), query: () => [], disconnect: vi.fn() }))
        .transient('emailService', () => ({ send: vi.fn() }));

      const all = container.resolveAll();
      expect(Object.keys(all)).toContain('logger');
      expect(Object.keys(all)).toContain('database');
      expect(Object.keys(all)).toContain('emailService');
    });
  });

  describe('error handling', () => {
    it('should throw when resolving unregistered dependency', () => {
      const container = createContainer<TestServices>();
      expect(() => container.resolve('logger')).toThrow('Dependency not registered: logger');
    });

    it('should detect circular dependencies', () => {
      interface CircularServices {
        a: { name: string };
        b: { name: string };
      }

      const container = createContainer<CircularServices>()
        .singleton('a', (c) => ({ name: c.b.name }))
        .singleton('b', (c) => ({ name: c.a.name }));

      expect(() => container.resolve('a')).toThrow('Circular dependency detected');
    });

    it('should throw with correct dependency name in circular error', () => {
      interface CircularServices {
        service1: { value: number };
        service2: { value: number };
        service3: { value: number };
      }

      const container = createContainer<CircularServices>()
        .singleton('service1', (c) => ({ value: c.service2.value }))
        .singleton('service2', (c) => ({ value: c.service3.value }))
        .singleton('service3', (c) => ({ value: c.service1.value }));

      expect(() => container.resolve('service1')).toThrow('Circular dependency');
    });
  });

  describe('dependency injection', () => {
    it('should inject dependencies into factories', () => {
      const container = createContainer<TestServices>()
        .singleton('logger', () => ({
          log: vi.fn(),
          level: 'info',
        }))
        .singleton('database', (c) => ({
          connect: () => c.logger.log('Connecting'),
          query: () => [],
          disconnect: () => c.logger.log('Disconnecting'),
        }))
        .singleton('userRepository', (c) => {
          const db = c.database;
          const logger = c.logger;

          return {
            findById: (id: string) => {
              logger.log(`Finding user ${id}`);
              db.query('SELECT * FROM users');
              return { id, name: 'Test User' };
            },
            save: (user) => {
              logger.log(`Saving user ${user.id}`);
            },
          };
        });

      const repo = container.resolve('userRepository');
      const user = repo.findById('123');

      expect(user).toEqual({ id: '123', name: 'Test User' });

      const logger = container.resolve('logger');
      expect(logger.log).toHaveBeenCalledWith('Finding user 123');
    });

    it('should lazily resolve dependencies', () => {
      const loggerFactory = vi.fn(() => ({ log: vi.fn(), level: 'info' }));
      const databaseFactory = vi.fn(() => ({ connect: vi.fn(), query: () => [], disconnect: vi.fn() }));

      const container = createContainer<TestServices>()
        .singleton('logger', loggerFactory)
        .singleton('database', databaseFactory);

      // Factories should not be called yet
      expect(loggerFactory).not.toHaveBeenCalled();
      expect(databaseFactory).not.toHaveBeenCalled();

      container.resolve('logger');

      // Only logger factory should be called
      expect(loggerFactory).toHaveBeenCalledTimes(1);
      expect(databaseFactory).not.toHaveBeenCalled();
    });
  });

  describe('createChild', () => {
    it('should create a child container', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const child = parent.createChild();
      expect(child).toBeDefined();
    });

    it('should inherit parent dependencies', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const child = parent.createChild();
      const logger = child.resolve('logger');

      expect(logger).toBeDefined();
      expect(logger.level).toBe('info');
    });

    it('should share singleton instances with parent', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const child = parent.createChild();

      const parentLogger = parent.resolve('logger');
      const childLogger = child.resolve('logger');

      expect(parentLogger).toBe(childLogger);
    });

    it('should allow child to override parent dependencies', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const child = parent.createChild().singleton('logger', () => ({
        log: vi.fn(),
        level: 'debug',
      }));

      const parentLogger = parent.resolve('logger');
      const childLogger = child.resolve('logger');

      expect(parentLogger.level).toBe('info');
      expect(childLogger.level).toBe('debug');
      expect(parentLogger).not.toBe(childLogger);
    });

    it('should check parent when dependency not found in child', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const child = parent.createChild();
      expect(child.has('logger')).toBe(true);
    });

    it('should include parent dependencies in resolveAll', () => {
      const parent = createContainer<TestServices>()
        .singleton('logger', () => ({ log: vi.fn(), level: 'info' }))
        .singleton('database', () => ({ connect: vi.fn(), query: () => [], disconnect: vi.fn() }));

      const child = parent.createChild().singleton('emailService', () => ({ send: vi.fn() }));

      const all = child.resolveAll();
      expect(Object.keys(all)).toContain('logger');
      expect(Object.keys(all)).toContain('database');
      expect(Object.keys(all)).toContain('emailService');
    });
  });

  describe('extend', () => {
    it('should extend container with additional services', () => {
      interface ExtendedServices {
        config: { apiUrl: string };
      }

      const container = createContainer<TestServices>()
        .singleton('logger', () => ({ log: vi.fn(), level: 'info' }))
        .extend<ExtendedServices>((c) =>
          c.singleton('config', () => ({ apiUrl: 'https://api.example.com' }))
        );

      const config = container.resolve('config');
      expect(config.apiUrl).toBe('https://api.example.com');
    });

    it('should maintain access to original services', () => {
      interface ExtendedServices {
        config: { apiUrl: string };
      }

      const container = createContainer<TestServices>()
        .singleton('logger', () => ({ log: vi.fn(), level: 'info' }))
        .extend<ExtendedServices>((c) =>
          c.singleton('config', () => ({ apiUrl: 'https://api.example.com' }))
        );

      const logger = container.resolve('logger');
      expect(logger.level).toBe('info');
    });
  });
});

describe('Module System', () => {
  describe('defineModule', () => {
    it('should create a reusable module', () => {
      interface LoggingServices {
        logger: Logger;
      }

      const loggingModule = defineModule<LoggingServices>((container) =>
        container.singleton('logger', () => ({ log: vi.fn(), level: 'info' }))
      );

      expect(loggingModule).toBeInstanceOf(Function);
    });

    it('should allow composing modules', () => {
      interface LoggingServices {
        logger: Logger;
      }

      interface DatabaseServices {
        database: Database;
      }

      const loggingModule = defineModule<LoggingServices>((container) =>
        container.singleton('logger', () => ({ log: vi.fn(), level: 'info' }))
      );

      const databaseModule = defineModule<DatabaseServices>((container) =>
        container.singleton('database', () => ({ connect: vi.fn(), query: () => [], disconnect: vi.fn() }))
      );

      type CombinedServices = LoggingServices & DatabaseServices;

      const container = createContainer<CombinedServices>()
        .extend(loggingModule)
        .extend(databaseModule);

      expect(container.has('logger')).toBe(true);
      expect(container.has('database')).toBe(true);
    });

    it('should allow modules to depend on each other', () => {
      interface LoggingServices {
        logger: Logger;
      }

      interface DatabaseServices {
        database: Database;
      }

      const loggingModule = defineModule<LoggingServices>((container) =>
        container.singleton('logger', () => ({ log: vi.fn(), level: 'info' }))
      );

      type Combined = LoggingServices & DatabaseServices;

      const databaseModule = defineModule<Combined>((container) =>
        container.singleton('database', (c) => ({
          connect: () => c.logger.log('Connecting'),
          query: () => [],
          disconnect: () => c.logger.log('Disconnecting'),
        }))
      );

      const container = createContainer<Combined>().extend(loggingModule).extend(databaseModule);

      const database = container.resolve('database');
      database.connect();

      const logger = container.resolve('logger');
      expect(logger.log).toHaveBeenCalledWith('Connecting');
    });
  });
});

describe('Async Container', () => {
  describe('createAsyncContainer', () => {
    it('should create an async container', () => {
      const container = createAsyncContainer<TestServices>();
      expect(container).toBeDefined();
    });

    it('should register async singletons', async () => {
      const container = createAsyncContainer<TestServices>().singleton(
        'logger',
        async () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ log: vi.fn(), level: 'info' }), 10);
          })
      );

      const built = await container.build();
      const logger = built.resolve('logger');
      expect(logger.level).toBe('info');
    });

    it('should register sync values', async () => {
      const loggerInstance = { log: vi.fn(), level: 'info' };

      const container = createAsyncContainer<TestServices>().value('logger', loggerInstance);

      const built = await container.build();
      const logger = built.resolve('logger');
      expect(logger).toBe(loggerInstance);
    });

    it('should handle multiple async dependencies', async () => {
      const container = createAsyncContainer<TestServices>()
        .singleton('logger', async () => ({ log: vi.fn(), level: 'info' }))
        .singleton('database', async () => ({ connect: vi.fn(), query: () => [], disconnect: vi.fn() }));

      const built = await container.build();

      expect(built.has('logger')).toBe(true);
      expect(built.has('database')).toBe(true);
    });

    it('should resolve dependencies between async factories', async () => {
      const container = createAsyncContainer<TestServices>()
        .singleton('logger', async () => ({ log: vi.fn(), level: 'info' }))
        .singleton('database', async (c) => ({
          connect: () => c.logger.log('Connecting'),
          query: () => [],
          disconnect: () => c.logger.log('Disconnecting'),
        }));

      const built = await container.build();
      const database = built.resolve('database');

      database.connect();
      const logger = built.resolve('logger');
      expect(logger.log).toHaveBeenCalledWith('Connecting');
    });

    it('should handle errors in async factories', async () => {
      const container = createAsyncContainer<TestServices>().singleton('logger', async () => {
        throw new Error('Initialization failed');
      });

      await expect(container.build()).rejects.toThrow('Initialization failed');
    });
  });
});

describe('Scope Factory', () => {
  describe('createScopeFactory', () => {
    it('should create a scope factory', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const scopeFactory = createScopeFactory(parent);
      expect(scopeFactory).toBeDefined();
    });

    it('should create new scopes', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const scopeFactory = createScopeFactory(parent);
      const scope1 = scopeFactory.createScope();
      const scope2 = scopeFactory.createScope();

      expect(scope1).not.toBe(scope2);
    });

    it('should inherit from parent', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const scopeFactory = createScopeFactory(parent);
      const scope = scopeFactory.createScope();

      const logger = scope.resolve('logger');
      expect(logger.level).toBe('info');
    });

    it('should allow scope-specific dependencies', () => {
      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const scopeFactory = createScopeFactory(parent, (scope) =>
        scope.singleton('database', () => ({ connect: vi.fn(), query: () => [], disconnect: vi.fn() }))
      );

      const scope = scopeFactory.createScope();
      expect(scope.has('database')).toBe(true);
    });

    it('should create isolated scopes', () => {
      interface ScopedServices extends TestServices {
        requestId: string;
      }

      const parent = createContainer<TestServices>().singleton('logger', () => ({
        log: vi.fn(),
        level: 'info',
      }));

      const scopeFactory = createScopeFactory<ScopedServices>(
        parent as Container<ScopedServices>,
        (scope) => scope.value('requestId', Math.random().toString())
      );

      const scope1 = scopeFactory.createScope();
      const scope2 = scopeFactory.createScope();

      const requestId1 = scope1.resolve('requestId');
      const requestId2 = scope2.resolve('requestId');

      expect(requestId1).not.toBe(requestId2);
    });
  });
});

describe('Type Safety', () => {
  it('should enforce type safety at compile time', () => {
    const container = createContainer<TestServices>().singleton('logger', () => ({
      log: vi.fn(),
      level: 'info',
    }));

    const logger = container.resolve('logger');

    // This should have proper types
    logger.log('test');
    expect(logger.level).toBe('info');
  });

  it('should prevent resolving non-existent keys at compile time', () => {
    const container = createContainer<TestServices>();

    // @ts-expect-error - should not allow resolving non-existent keys
    // Runtime: throws error for unregistered dependency
    expect(() => container.resolve('nonExistent' as keyof TestServices)).toThrow(
      'Dependency not registered: nonExistent'
    );
  });
});

describe('Complex Dependency Graphs', () => {
  it('should handle complex dependency trees', () => {
    const container = createContainer<TestServices>()
      .singleton('logger', () => ({ log: vi.fn(), level: 'info' }))
      .singleton('database', (c) => ({
        connect: () => c.logger.log('DB: Connecting'),
        query: () => [],
        disconnect: () => c.logger.log('DB: Disconnecting'),
      }))
      .singleton('userRepository', (c) => ({
        findById: (id: string) => {
          c.logger.log(`Repo: Finding user ${id}`);
          c.database.query('SELECT * FROM users');
          return { id, name: 'Test User' };
        },
        save: (user) => {
          c.logger.log(`Repo: Saving user ${user.id}`);
        },
      }))
      .singleton('emailService', (c) => ({
        send: (to: string, subject: string, body: string) => {
          c.logger.log(`Email: Sending to ${to}`);
        },
      }));

    const repo = container.resolve('userRepository');
    const email = container.resolve('emailService');

    repo.findById('123');
    email.send('user@example.com', 'Welcome', 'Hello!');

    const logger = container.resolve('logger');
    expect(logger.log).toHaveBeenCalledWith('Repo: Finding user 123');
    expect(logger.log).toHaveBeenCalledWith('Email: Sending to user@example.com');
  });
});
