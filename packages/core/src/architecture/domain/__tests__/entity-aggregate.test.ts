/**
 * Entity and AggregateRoot Tests
 * Comprehensive tests for DDD building blocks
 */

import { describe, it, expect, vi } from 'vitest';
import {
  Entity,
  InvalidEntityError,
  EntityNotFoundError,
  entitiesEqual,
  createEntityIdComparator,
  EntitySet,
} from '../entity.js';
import {
  AggregateRoot,
  AggregateDeletedError,
  ConcurrencyError,
  InvariantViolationError,
  checkInvariant,
  createSnapshot,
} from '../aggregate-root.js';
import type { DomainEvent } from '../../layers/contracts.js';

// ============================================================================
// TEST HELPERS - Concrete implementations for testing abstract classes
// ============================================================================

class User extends Entity<string> {
  constructor(
    id: string,
    private _name: string,
    private _email: string
  ) {
    super(id);
  }

  get name(): string {
    return this._name;
  }

  get email(): string {
    return this._email;
  }
}

class UserWithNumericId extends Entity<number> {
  constructor(
    id: number,
    private _name: string
  ) {
    super(id);
  }

  get name(): string {
    return this._name;
  }
}

interface CompositeId {
  tenantId: string;
  userId: string;
}

class TenantUser extends Entity<CompositeId> {
  constructor(
    id: CompositeId,
    private _name: string
  ) {
    super(id);
  }

  get name(): string {
    return this._name;
  }
}

// Aggregate implementation for testing
interface OrderItem {
  productId: string;
  quantity: number;
  price: number;
}

interface OrderCreatedEvent extends DomainEvent {
  eventType: 'OrderCreated';
  payload: { customerId: string };
}

interface ItemAddedEvent extends DomainEvent {
  eventType: 'ItemAdded';
  payload: { item: OrderItem };
}

interface OrderDeletedEvent extends DomainEvent {
  eventType: 'OrderDeleted';
  payload: { reason: string };
}

type OrderEvent = OrderCreatedEvent | ItemAddedEvent | OrderDeletedEvent;

class Order extends AggregateRoot<string, OrderEvent> {
  private _customerId = '';
  private _items: OrderItem[] = [];
  private _total = 0;

  static create(id: string, customerId: string): Order {
    const order = new Order(id, 0);
    order.raiseOrderCreated(customerId);
    return order;
  }

  get customerId(): string {
    return this._customerId;
  }

  get items(): readonly OrderItem[] {
    return this._items;
  }

  get total(): number {
    return this._total;
  }

  addItem(item: OrderItem): void {
    this.ensureNotDeleted();
    const event = this.createEvent<{ item: OrderItem }>('ItemAdded', { item }, {});
    this.raise(event as ItemAddedEvent);
  }

  delete(reason: string): void {
    this.markAsDeleted();
    const event = this.createEvent<{ reason: string }>('OrderDeleted', { reason }, {});
    this.raise(event as OrderDeletedEvent);
  }

  undoDelete(): void {
    this.restore();
  }

  private raiseOrderCreated(customerId: string): void {
    const event = this.createEvent<{ customerId: string }>(
      'OrderCreated',
      { customerId },
      { correlationId: 'test-correlation' }
    );
    this.raise(event as OrderCreatedEvent);
  }

  protected apply(event: OrderEvent): void {
    switch (event.eventType) {
      case 'OrderCreated':
        this._customerId = event.payload.customerId;
        break;
      case 'ItemAdded':
        this._items.push(event.payload.item);
        this._total += event.payload.item.price * event.payload.item.quantity;
        break;
      case 'OrderDeleted':
        // No state change needed, deletion is tracked by base class
        break;
    }
  }

  getState(): { customerId: string; items: OrderItem[]; total: number } {
    return {
      customerId: this._customerId,
      items: [...this._items],
      total: this._total,
    };
  }
}

// ============================================================================
// ENTITY TESTS
// ============================================================================

describe('Entity', () => {
  describe('construction', () => {
    it('should create entity with valid ID', () => {
      const user = new User('user-123', 'John', 'john@example.com');

      expect(user.id).toBe('user-123');
      expect(user.name).toBe('John');
      expect(user.email).toBe('john@example.com');
    });

    it('should have domain layer identifier', () => {
      const user = new User('user-123', 'John', 'john@example.com');

      expect(user.__layer).toBe('domain');
    });

    it('should reject null ID', () => {
      expect(() => new User(null as unknown as string, 'John', 'john@example.com')).toThrow(
        InvalidEntityError
      );
    });

    it('should reject undefined ID', () => {
      expect(() => new User(undefined as unknown as string, 'John', 'john@example.com')).toThrow(
        InvalidEntityError
      );
    });
  });

  describe('equality', () => {
    it('should return true for same ID', () => {
      const user1 = new User('user-123', 'John', 'john@example.com');
      const user2 = new User('user-123', 'Jane', 'jane@example.com');

      expect(user1.equals(user2)).toBe(true);
    });

    it('should return false for different ID', () => {
      const user1 = new User('user-123', 'John', 'john@example.com');
      const user2 = new User('user-456', 'John', 'john@example.com');

      expect(user1.equals(user2)).toBe(false);
    });

    it('should return false for null', () => {
      const user = new User('user-123', 'John', 'john@example.com');

      expect(user.equals(null as unknown as User)).toBe(false);
    });

    it('should return false for undefined', () => {
      const user = new User('user-123', 'John', 'john@example.com');

      expect(user.equals(undefined as unknown as User)).toBe(false);
    });

    it('should return false for non-Entity', () => {
      const user = new User('user-123', 'John', 'john@example.com');
      const plainObj = { id: 'user-123' };

      expect(user.equals(plainObj as unknown as User)).toBe(false);
    });

    it('should work with numeric IDs', () => {
      const user1 = new UserWithNumericId(123, 'John');
      const user2 = new UserWithNumericId(123, 'Jane');
      const user3 = new UserWithNumericId(456, 'John');

      expect(user1.equals(user2)).toBe(true);
      expect(user1.equals(user3)).toBe(false);
    });

    it('should work with composite IDs', () => {
      const user1 = new TenantUser({ tenantId: 't1', userId: 'u1' }, 'John');
      const user2 = new TenantUser({ tenantId: 't1', userId: 'u1' }, 'Jane');
      const user3 = new TenantUser({ tenantId: 't1', userId: 'u2' }, 'John');

      expect(user1.equals(user2)).toBe(true);
      expect(user1.equals(user3)).toBe(false);
    });
  });

  describe('hashCode', () => {
    it('should return same hash for same ID', () => {
      const user1 = new User('user-123', 'John', 'john@example.com');
      const user2 = new User('user-123', 'Jane', 'jane@example.com');

      expect(user1.hashCode()).toBe(user2.hashCode());
    });

    it('should return different hash for different ID', () => {
      const user1 = new User('user-123', 'John', 'john@example.com');
      const user2 = new User('user-456', 'John', 'john@example.com');

      expect(user1.hashCode()).not.toBe(user2.hashCode());
    });
  });

  describe('toString', () => {
    it('should return readable representation', () => {
      const user = new User('user-123', 'John', 'john@example.com');

      expect(user.toString()).toBe('User[user-123]');
    });
  });
});

// ============================================================================
// ENTITY ERRORS
// ============================================================================

describe('InvalidEntityError', () => {
  it('should have correct name and code', () => {
    const error = new InvalidEntityError('Test message');

    expect(error.name).toBe('InvalidEntityError');
    expect(error.code).toBe('INVALID_ENTITY');
    expect(error.message).toBe('Test message');
  });
});

describe('EntityNotFoundError', () => {
  it('should have correct name and code', () => {
    const error = new EntityNotFoundError('User', 'user-123');

    expect(error.name).toBe('EntityNotFoundError');
    expect(error.code).toBe('ENTITY_NOT_FOUND');
    expect(error.entityType).toBe('User');
    expect(error.entityId).toBe('user-123');
    expect(error.message).toBe('User with ID user-123 not found');
  });
});

// ============================================================================
// ENTITY UTILITIES
// ============================================================================

describe('entitiesEqual', () => {
  it('should return true for two null values', () => {
    expect(entitiesEqual(null, null)).toBe(true);
  });

  it('should return false when one is null', () => {
    const user = new User('user-123', 'John', 'john@example.com');

    expect(entitiesEqual(user, null)).toBe(false);
    expect(entitiesEqual(null, user)).toBe(false);
  });

  it('should return true for equal entities', () => {
    const user1 = new User('user-123', 'John', 'john@example.com');
    const user2 = new User('user-123', 'Jane', 'jane@example.com');

    expect(entitiesEqual(user1, user2)).toBe(true);
  });
});

describe('createEntityIdComparator', () => {
  it('should create comparator that sorts by ID', () => {
    const users = [
      new User('charlie', 'C', 'c@example.com'),
      new User('alice', 'A', 'a@example.com'),
      new User('bob', 'B', 'b@example.com'),
    ];

    const comparator = createEntityIdComparator<string>();
    users.sort(comparator);

    expect(users[0].id).toBe('alice');
    expect(users[1].id).toBe('bob');
    expect(users[2].id).toBe('charlie');
  });
});

describe('EntitySet', () => {
  it('should create empty set', () => {
    const set = new EntitySet<string, User>();

    expect(set.size).toBe(0);
  });

  it('should create from array', () => {
    const users = [
      new User('user-1', 'John', 'john@example.com'),
      new User('user-2', 'Jane', 'jane@example.com'),
    ];
    const set = new EntitySet(users);

    expect(set.size).toBe(2);
  });

  it('should add entities', () => {
    const set = new EntitySet<string, User>();
    set.add(new User('user-1', 'John', 'john@example.com'));

    expect(set.size).toBe(1);
    expect(set.has('user-1')).toBe(true);
  });

  it('should overwrite on same ID', () => {
    const set = new EntitySet<string, User>();
    set.add(new User('user-1', 'John', 'john@example.com'));
    set.add(new User('user-1', 'Jane', 'jane@example.com'));

    expect(set.size).toBe(1);
    expect(set.get('user-1')?.name).toBe('Jane');
  });

  it('should remove entities', () => {
    const set = new EntitySet<string, User>();
    set.add(new User('user-1', 'John', 'john@example.com'));

    expect(set.remove('user-1')).toBe(true);
    expect(set.size).toBe(0);
    expect(set.has('user-1')).toBe(false);
  });

  it('should return false when removing non-existent', () => {
    const set = new EntitySet<string, User>();

    expect(set.remove('user-1')).toBe(false);
  });

  it('should get entity by ID', () => {
    const user = new User('user-1', 'John', 'john@example.com');
    const set = new EntitySet<string, User>([user]);

    expect(set.get('user-1')).toBe(user);
    expect(set.get('user-2')).toBeUndefined();
  });

  it('should convert to array', () => {
    const users = [
      new User('user-1', 'John', 'john@example.com'),
      new User('user-2', 'Jane', 'jane@example.com'),
    ];
    const set = new EntitySet(users);

    const array = set.toArray();
    expect(array).toHaveLength(2);
  });

  it('should be iterable', () => {
    const users = [
      new User('user-1', 'John', 'john@example.com'),
      new User('user-2', 'Jane', 'jane@example.com'),
    ];
    const set = new EntitySet(users);

    const collected: User[] = [];
    for (const user of set) {
      collected.push(user);
    }
    expect(collected).toHaveLength(2);
  });
});

// ============================================================================
// AGGREGATE ROOT TESTS
// ============================================================================

describe('AggregateRoot', () => {
  describe('construction', () => {
    it('should create with ID and version 0', () => {
      const order = Order.create('order-1', 'customer-1');

      expect(order.id).toBe('order-1');
      expect(order.version).toBe(1); // After creation event
    });

    it('should create with custom version', () => {
      const order = new (class extends AggregateRoot<string> {
        protected apply(): void {}
      })('id', 5);

      expect(order.version).toBe(5);
    });
  });

  describe('events', () => {
    it('should track uncommitted events', () => {
      const order = Order.create('order-1', 'customer-1');

      expect(order.uncommittedEvents).toHaveLength(1);
      expect(order.uncommittedEvents[0].eventType).toBe('OrderCreated');
    });

    it('should increment version on each event', () => {
      const order = Order.create('order-1', 'customer-1');
      order.addItem({ productId: 'p1', quantity: 2, price: 10 });

      expect(order.version).toBe(2);
      expect(order.uncommittedEvents).toHaveLength(2);
    });

    it('should clear uncommitted events', () => {
      const order = Order.create('order-1', 'customer-1');
      order.clearUncommittedEvents();

      expect(order.uncommittedEvents).toHaveLength(0);
    });

    it('should apply events and update state', () => {
      const order = Order.create('order-1', 'customer-1');
      order.addItem({ productId: 'p1', quantity: 2, price: 10 });

      expect(order.customerId).toBe('customer-1');
      expect(order.items).toHaveLength(1);
      expect(order.total).toBe(20);
    });
  });

  describe('event history', () => {
    it('should load from event history', () => {
      // Create fresh aggregate
      const order = new (class extends Order {})('order-1', 0);

      // Load from history
      order.loadFromHistory([
        {
          __layer: 'domain',
          eventId: '1',
          eventType: 'OrderCreated',
          aggregateId: 'order-1',
          aggregateType: 'Order',
          version: 1,
          occurredAt: new Date(),
          payload: { customerId: 'customer-1' },
          metadata: {} as any,
        },
        {
          __layer: 'domain',
          eventId: '2',
          eventType: 'ItemAdded',
          aggregateId: 'order-1',
          aggregateType: 'Order',
          version: 2,
          occurredAt: new Date(),
          payload: { item: { productId: 'p1', quantity: 3, price: 15 } },
          metadata: {} as any,
        },
      ] as OrderEvent[]);

      expect(order.customerId).toBe('customer-1');
      expect(order.items).toHaveLength(1);
      expect(order.total).toBe(45);
      expect(order.version).toBe(2);
    });
  });

  describe('soft delete', () => {
    it('should mark as deleted', () => {
      const order = Order.create('order-1', 'customer-1');
      order.delete('Cancelled by customer');

      expect(order.isDeleted).toBe(true);
      expect(order.deletedAt).toBeDefined();
    });

    it('should prevent modifications when deleted', () => {
      const order = Order.create('order-1', 'customer-1');
      order.delete('Cancelled');

      expect(() => order.addItem({ productId: 'p1', quantity: 1, price: 10 })).toThrow(
        AggregateDeletedError
      );
    });

    it('should restore deleted aggregate', () => {
      const order = Order.create('order-1', 'customer-1');
      order.delete('Cancelled');
      order.undoDelete();

      expect(order.isDeleted).toBe(false);
      expect(order.deletedAt).toBeUndefined();
    });
  });

  describe('version validation', () => {
    it('should pass for correct version', () => {
      const order = Order.create('order-1', 'customer-1');

      expect(() => order.validateVersion(1)).not.toThrow();
    });

    it('should throw for incorrect version', () => {
      const order = Order.create('order-1', 'customer-1');

      expect(() => order.validateVersion(0)).toThrow(ConcurrencyError);
    });
  });

  describe('createEvent', () => {
    it('should create event with proper metadata', () => {
      const order = Order.create('order-1', 'customer-1');
      const event = order.uncommittedEvents[0];

      expect(event.eventId).toBeDefined();
      expect(event.aggregateId).toBe('order-1');
      expect(event.aggregateType).toBe('Order');
      expect(event.occurredAt).toBeDefined();
      expect(event.metadata.correlationId).toBeDefined();
      expect(event.metadata.source).toBe('Order');
    });
  });
});

// ============================================================================
// AGGREGATE ERRORS
// ============================================================================

describe('AggregateDeletedError', () => {
  it('should have correct name and code', () => {
    const error = new AggregateDeletedError('Order', 'order-123');

    expect(error.name).toBe('AggregateDeletedError');
    expect(error.code).toBe('AGGREGATE_DELETED');
    expect(error.aggregateType).toBe('Order');
    expect(error.aggregateId).toBe('order-123');
    expect(error.message).toBe('Order with ID order-123 has been deleted');
  });
});

describe('ConcurrencyError', () => {
  it('should have correct name and code', () => {
    const error = new ConcurrencyError('Version mismatch', 'Order', 'order-1', 5, 3);

    expect(error.name).toBe('ConcurrencyError');
    expect(error.code).toBe('CONCURRENCY_ERROR');
    expect(error.aggregateType).toBe('Order');
    expect(error.aggregateId).toBe('order-1');
    expect(error.expectedVersion).toBe(5);
    expect(error.actualVersion).toBe(3);
  });
});

describe('InvariantViolationError', () => {
  it('should have correct name and code', () => {
    const error = new InvariantViolationError(
      'Order',
      'MinItems',
      'Order must have at least 1 item'
    );

    expect(error.name).toBe('InvariantViolationError');
    expect(error.code).toBe('INVARIANT_VIOLATION');
    expect(error.aggregateType).toBe('Order');
    expect(error.invariant).toBe('MinItems');
    expect(error.message).toBe(
      'Order invariant violation [MinItems]: Order must have at least 1 item'
    );
  });
});

// ============================================================================
// INVARIANT UTILITIES
// ============================================================================

describe('checkInvariant', () => {
  it('should not throw when condition is true', () => {
    expect(() => checkInvariant(true, 'Order', 'test', 'Should not fail')).not.toThrow();
  });

  it('should throw when condition is false', () => {
    expect(() => checkInvariant(false, 'Order', 'test', 'Expected failure')).toThrow(
      InvariantViolationError
    );
  });
});

// ============================================================================
// SNAPSHOT UTILITIES
// ============================================================================

describe('createSnapshot', () => {
  it('should create snapshot from aggregate', () => {
    const order = Order.create('order-1', 'customer-1');
    order.addItem({ productId: 'p1', quantity: 2, price: 10 });

    const snapshot = createSnapshot(order);

    expect(snapshot.aggregateId).toBe('order-1');
    expect(snapshot.aggregateType).toBe('Order');
    expect(snapshot.version).toBe(2);
    expect(snapshot.state.customerId).toBe('customer-1');
    expect(snapshot.state.items).toHaveLength(1);
    expect(snapshot.state.total).toBe(20);
    expect(snapshot.createdAt).toBeDefined();
  });
});
