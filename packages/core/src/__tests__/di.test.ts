import { describe, it, expect } from 'vitest';
import {
  createContainer,
  createAsyncContainer,
  createScopeFactory,
  defineModule,
  type Container,
} from '../types/di.js';

describe('Dependency Injection Container', () => {
  describe('createContainer', () => {
    it('should create an empty container', () => {
      const container = createContainer<Record<string, unknown>>();
      expect(container).toBeDefined();
    });

    it('should have required methods', () => {
      const container = createContainer<Record<string, unknown>>();
      expect(typeof container.singleton).toBe('function');
      expect(typeof container.transient).toBe('function');
      expect(typeof container.value).toBe('function');
      expect(typeof container.resolve).toBe('function');
      expect(typeof container.resolveAll).toBe('function');
      expect(typeof container.has).toBe('function');
      expect(typeof container.createChild).toBe('function');
      expect(typeof container.extend).toBe('function');
    });
  });

  describe('singleton registration', () => {
    interface TestServices {
      counter: { count: number; increment: () => void };
    }

    it('should register and resolve singleton', () => {
      const container = createContainer<TestServices>().singleton('counter', () => {
        let count = 0;
        return {
          count,
          increment() {
            this.count++;
          },
        };
      });

      const counter = container.resolve('counter');
      expect(counter.count).toBe(0);
    });

    it('should return same instance for singleton', () => {
      let createCount = 0;

      interface Services {
        service: { id: number };
      }

      const container = createContainer<Services>().singleton('service', () => {
        createCount++;
        return { id: createCount };
      });

      const first = container.resolve('service');
      const second = container.resolve('service');
      const third = container.resolve('service');

      expect(first).toBe(second);
      expect(second).toBe(third);
      expect(createCount).toBe(1);
    });
  });

  describe('transient registration', () => {
    it('should create new instance each time for transient', () => {
      let createCount = 0;

      interface Services {
        transientService: { id: number };
      }

      const container = createContainer<Services>().transient('transientService', () => {
        createCount++;
        return { id: createCount };
      });

      const first = container.resolve('transientService');
      const second = container.resolve('transientService');
      const third = container.resolve('transientService');

      expect(first.id).toBe(1);
      expect(second.id).toBe(2);
      expect(third.id).toBe(3);
      expect(createCount).toBe(3);
    });
  });

  describe('value registration', () => {
    it('should register and resolve constant value', () => {
      interface Services {
        config: { apiUrl: string; timeout: number };
      }

      const config = { apiUrl: 'https://api.example.com', timeout: 5000 };
      const container = createContainer<Services>().value('config', config);

      const resolved = container.resolve('config');
      expect(resolved).toBe(config);
      expect(resolved.apiUrl).toBe('https://api.example.com');
    });

    it('should return same instance for value', () => {
      interface Services {
        data: { value: number };
      }

      const data = { value: 42 };
      const container = createContainer<Services>().value('data', data);

      expect(container.resolve('data')).toBe(data);
      expect(container.resolve('data')).toBe(data);
    });
  });

  describe('dependency injection', () => {
    it('should inject dependencies into factory', () => {
      interface Services {
        logger: { log: (msg: string) => string };
        userService: { greet: (name: string) => string };
      }

      const container = createContainer<Services>()
        .singleton('logger', () => ({
          log: (msg: string) => `[LOG] ${msg}`,
        }))
        .transient('userService', (c) => ({
          greet: (name: string) => c.logger.log(`Hello, ${name}`),
        }));

      const userService = container.resolve('userService');
      expect(userService.greet('Alice')).toBe('[LOG] Hello, Alice');
    });

    it('should support complex dependency chains', () => {
      interface Services {
        database: { query: () => string };
        cache: { get: () => string };
        repository: { find: () => string };
        service: { getData: () => string };
      }

      const container = createContainer<Services>()
        .singleton('database', () => ({ query: () => 'db-result' }))
        .singleton('cache', () => ({ get: () => 'cache-result' }))
        .singleton('repository', (c) => ({
          find: () => `repo: ${c.database.query()}, ${c.cache.get()}`,
        }))
        .transient('service', (c) => ({
          getData: () => `service: ${c.repository.find()}`,
        }));

      const service = container.resolve('service');
      expect(service.getData()).toBe('service: repo: db-result, cache-result');
    });
  });

  describe('circular dependency detection', () => {
    it('should throw error on direct circular dependency', () => {
      interface Services {
        a: unknown;
        b: unknown;
      }

      // Create a direct circular dependency where resolution immediately triggers the cycle
      const container = createContainer<Services>()
        .singleton('a', (c) => {
          // Immediately access b during construction
          const bValue = c.b;
          return { bRef: bValue };
        })
        .singleton('b', (c) => {
          // Immediately access a during construction
          const aValue = c.a;
          return { aRef: aValue };
        });

      expect(() => container.resolve('a')).toThrow('Circular dependency detected');
    });
  });

  describe('missing dependency', () => {
    it('should throw error for unregistered dependency', () => {
      interface Services {
        missing: unknown;
      }

      const container = createContainer<Services>();
      expect(() => container.resolve('missing')).toThrow('Dependency not registered');
    });
  });

  describe('has method', () => {
    it('should return true for registered dependencies', () => {
      interface Services {
        registered: string;
      }

      const container = createContainer<Services>().value('registered', 'value');
      expect(container.has('registered')).toBe(true);
    });

    it('should return false for unregistered dependencies', () => {
      interface Services {
        notRegistered: string;
      }

      const container = createContainer<Services>();
      expect(container.has('notRegistered')).toBe(false);
    });
  });

  describe('resolveAll', () => {
    it('should resolve all registered dependencies', () => {
      interface Services {
        a: string;
        b: number;
        c: boolean;
      }

      const container = createContainer<Services>()
        .value('a', 'hello')
        .value('b', 42)
        .value('c', true);

      const all = container.resolveAll();
      expect(all.a).toBe('hello');
      expect(all.b).toBe(42);
      expect(all.c).toBe(true);
    });
  });

  describe('createChild', () => {
    it('should create child container that inherits from parent', () => {
      interface Services {
        parent: string;
        child: string;
      }

      const parent = createContainer<Services>().value('parent', 'parent-value');

      const child = parent.createChild().value('child', 'child-value');

      expect(child.resolve('parent')).toBe('parent-value');
      expect(child.resolve('child')).toBe('child-value');
    });

    it('should allow child to override parent registration', () => {
      interface Services {
        shared: string;
      }

      const parent = createContainer<Services>().value('shared', 'parent-shared');

      const child = parent.createChild().value('shared', 'child-shared');

      expect(parent.resolve('shared')).toBe('parent-shared');
      expect(child.resolve('shared')).toBe('child-shared');
    });

    it('should check parent for has method', () => {
      interface Services {
        parentOnly: string;
        childOnly: string;
      }

      const parent = createContainer<Services>().value('parentOnly', 'value');
      const child = parent.createChild().value('childOnly', 'value');

      expect(child.has('parentOnly')).toBe(true);
      expect(child.has('childOnly')).toBe(true);
    });

    it('should include parent registrations in resolveAll', () => {
      interface Services {
        parentService: string;
        childService: string;
      }

      const parent = createContainer<Services>().value('parentService', 'from-parent');
      const child = parent.createChild().value('childService', 'from-child');

      const all = child.resolveAll();
      expect(all.parentService).toBe('from-parent');
      expect(all.childService).toBe('from-child');
    });
  });

  describe('extend', () => {
    it('should extend container with additional services', () => {
      interface BaseServices {
        logger: { log: (msg: string) => void };
      }

      interface ExtendedServices extends BaseServices {
        analytics: { track: (event: string) => void };
      }

      const base = createContainer<BaseServices>().singleton('logger', () => ({
        log: () => {},
      }));

      const extended = base.extend<ExtendedServices>((c) =>
        c.singleton('analytics', () => ({
          track: () => {},
        }))
      );

      expect(extended.has('logger')).toBe(true);
      expect(extended.has('analytics')).toBe(true);
    });
  });

  describe('defineModule', () => {
    it('should define reusable module', () => {
      interface LoggingServices {
        logger: { info: (msg: string) => void };
      }

      const loggingModule = defineModule<LoggingServices>((container) =>
        container.singleton('logger', () => ({
          info: () => {},
        }))
      );

      const container = createContainer<LoggingServices>();
      const configured = loggingModule(container);

      expect(configured.has('logger')).toBe(true);
    });

    it('should compose multiple modules', () => {
      interface DBServices {
        db: { query: () => string };
      }

      interface CacheServices {
        cache: { get: () => string };
      }

      type AllServices = DBServices & CacheServices;

      const dbModule = defineModule<DBServices>((c) =>
        c.singleton('db', () => ({ query: () => 'result' }))
      );

      const cacheModule = defineModule<CacheServices>((c) =>
        c.singleton('cache', () => ({ get: () => 'cached' }))
      );

      // Compose modules
      const container = createContainer<AllServices>();
      dbModule(container as Container<DBServices>);
      cacheModule(container as Container<CacheServices>);

      expect(container.has('db')).toBe(true);
      expect(container.has('cache')).toBe(true);
    });
  });

  describe('createAsyncContainer', () => {
    it('should create async container', () => {
      const asyncContainer = createAsyncContainer<Record<string, unknown>>();
      expect(asyncContainer).toBeDefined();
      expect(typeof asyncContainer.singleton).toBe('function');
      expect(typeof asyncContainer.value).toBe('function');
      expect(typeof asyncContainer.build).toBe('function');
    });

    it('should register and build async singletons', async () => {
      interface Services {
        asyncService: { data: string };
      }

      const asyncContainer = createAsyncContainer<Services>().singleton(
        'asyncService',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return { data: 'async-loaded' };
        }
      );

      const container = await asyncContainer.build();
      const service = container.resolve('asyncService');
      expect(service.data).toBe('async-loaded');
    });

    it('should register value in async container', async () => {
      interface Services {
        config: { url: string };
      }

      const asyncContainer = createAsyncContainer<Services>().value('config', {
        url: 'https://example.com',
      });

      const container = await asyncContainer.build();
      expect(container.resolve('config').url).toBe('https://example.com');
    });

    it('should allow async factory to access previously resolved values', async () => {
      interface Services {
        config: { baseUrl: string };
        api: { url: string };
      }

      const asyncContainer = createAsyncContainer<Services>()
        .value('config', { baseUrl: 'https://api.example.com' })
        .singleton('api', async (c) => {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return { url: `${c.config.baseUrl}/v1` };
        });

      const container = await asyncContainer.build();
      expect(container.resolve('api').url).toBe('https://api.example.com/v1');
    });

    it('should throw for dependency not yet resolved', async () => {
      interface Services {
        first: { id: number };
        second: { ref: unknown };
      }

      const asyncContainer = createAsyncContainer<Services>()
        .singleton('second', async (c) => {
          // Try to access 'first' which hasn't been resolved yet
          return { ref: c.first };
        })
        .singleton('first', async () => {
          return { id: 1 };
        });

      await expect(asyncContainer.build()).rejects.toThrow('not yet resolved');
    });
  });

  describe('createScopeFactory', () => {
    it('should create scope factory', () => {
      interface Services {
        shared: string;
      }

      const parent = createContainer<Services>().value('shared', 'value');
      const scopeFactory = createScopeFactory(parent);

      expect(scopeFactory).toBeDefined();
      expect(typeof scopeFactory.createScope).toBe('function');
    });

    it('should create scoped containers from factory', () => {
      interface Services {
        shared: string;
        requestId: string;
      }

      const parent = createContainer<Services>().value('shared', 'shared-value');
      const scopeFactory = createScopeFactory(parent);

      const scope1 = scopeFactory.createScope();
      scope1.value('requestId', 'req-1');

      const scope2 = scopeFactory.createScope();
      scope2.value('requestId', 'req-2');

      expect(scope1.resolve('shared')).toBe('shared-value');
      expect(scope2.resolve('shared')).toBe('shared-value');
      expect(scope1.resolve('requestId')).toBe('req-1');
      expect(scope2.resolve('requestId')).toBe('req-2');
    });

    it('should apply configure function to scope', () => {
      interface Services {
        timestamp: number;
      }

      const parent = createContainer<Services>();
      const scopeFactory = createScopeFactory(parent, (scope) =>
        scope.value('timestamp', Date.now())
      );

      const scope = scopeFactory.createScope();
      expect(scope.has('timestamp')).toBe(true);
      expect(typeof scope.resolve('timestamp')).toBe('number');
    });
  });

  describe('chaining', () => {
    it('should support method chaining', () => {
      interface Services {
        a: string;
        b: number;
        c: boolean;
      }

      const container = createContainer<Services>()
        .value('a', 'hello')
        .value('b', 42)
        .value('c', true);

      expect(container.resolve('a')).toBe('hello');
      expect(container.resolve('b')).toBe(42);
      expect(container.resolve('c')).toBe(true);
    });

    it('should chain singleton, transient, and value', () => {
      interface Services {
        singleton: { type: string };
        transient: { type: string };
        value: { type: string };
      }

      const container = createContainer<Services>()
        .singleton('singleton', () => ({ type: 'singleton' }))
        .transient('transient', () => ({ type: 'transient' }))
        .value('value', { type: 'value' });

      expect(container.resolve('singleton').type).toBe('singleton');
      expect(container.resolve('transient').type).toBe('transient');
      expect(container.resolve('value').type).toBe('value');
    });
  });
});
