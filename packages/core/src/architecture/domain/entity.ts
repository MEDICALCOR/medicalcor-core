/**
 * @module architecture/domain/entity
 *
 * Entity Base Class
 * =================
 *
 * Entities are domain objects with identity and lifecycle.
 * Two entities are equal if they have the same identity, regardless of attributes.
 */

import type { Entity as IEntity, DomainComponent } from '../layers/contracts.js';

// ============================================================================
// ENTITY BASE CLASS
// ============================================================================

/**
 * Abstract base class for all entities
 *
 * @template TId - The type of the entity's identifier
 */
export abstract class Entity<TId> implements IEntity<TId>, DomainComponent {
  readonly __layer = 'domain' as const;

  constructor(protected readonly _id: TId) {
    if (_id === null || _id === undefined) {
      throw new InvalidEntityError('Entity ID cannot be null or undefined');
    }
  }

  /**
   * Get the entity's unique identifier
   */
  get id(): TId {
    return this._id;
  }

  /**
   * Check equality based on identity
   */
  equals(other: IEntity<TId>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (!(other instanceof Entity)) {
      return false;
    }
    return this.idEquals(this._id, other._id);
  }

  /**
   * Compare two IDs for equality
   * Override this for custom ID types
   */
  protected idEquals(id1: TId, id2: TId): boolean {
    if (typeof id1 === 'string' && typeof id2 === 'string') {
      return id1 === id2;
    }
    if (typeof id1 === 'number' && typeof id2 === 'number') {
      return id1 === id2;
    }
    if (typeof id1 === 'object' && typeof id2 === 'object') {
      // For complex ID types, compare JSON representation
      return JSON.stringify(id1) === JSON.stringify(id2);
    }
    return id1 === id2;
  }

  /**
   * Get hash code for the entity (based on ID)
   */
  hashCode(): number {
    const str = String(this._id);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash;
  }

  /**
   * String representation of the entity
   */
  toString(): string {
    return `${this.constructor.name}[${String(this._id)}]`;
  }
}

// ============================================================================
// ENTITY ERRORS
// ============================================================================

/**
 * Error thrown when an entity is invalid
 */
export class InvalidEntityError extends Error {
  readonly code = 'INVALID_ENTITY';

  constructor(message: string) {
    super(message);
    this.name = 'InvalidEntityError';
  }
}

/**
 * Error thrown when an entity is not found
 */
export class EntityNotFoundError extends Error {
  readonly code = 'ENTITY_NOT_FOUND';
  readonly entityType: string;
  readonly entityId: unknown;

  constructor(entityType: string, entityId: unknown) {
    super(`${entityType} with ID ${String(entityId)} not found`);
    this.name = 'EntityNotFoundError';
    this.entityType = entityType;
    this.entityId = entityId;
  }
}

// ============================================================================
// ENTITY UTILITIES
// ============================================================================

/**
 * Check if two entities are the same
 */
export function entitiesEqual<TId>(a: IEntity<TId> | null, b: IEntity<TId> | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return a.equals(b);
}

/**
 * Create an entity ID comparator
 */
export function createEntityIdComparator<TId>(): (a: IEntity<TId>, b: IEntity<TId>) => number {
  return (a, b) => {
    const idA = String(a.id);
    const idB = String(b.id);
    return idA.localeCompare(idB);
  };
}

/**
 * Create an entity set (unique by ID)
 */
export class EntitySet<TId, TEntity extends Entity<TId>> implements Iterable<TEntity> {
  private entities = new Map<string, TEntity>();

  constructor(entities: TEntity[] = []) {
    for (const entity of entities) {
      this.add(entity);
    }
  }

  add(entity: TEntity): void {
    this.entities.set(String(entity.id), entity);
  }

  remove(id: TId): boolean {
    return this.entities.delete(String(id));
  }

  has(id: TId): boolean {
    return this.entities.has(String(id));
  }

  get(id: TId): TEntity | undefined {
    return this.entities.get(String(id));
  }

  get size(): number {
    return this.entities.size;
  }

  toArray(): TEntity[] {
    return Array.from(this.entities.values());
  }

  [Symbol.iterator](): Iterator<TEntity> {
    return this.entities.values();
  }
}
