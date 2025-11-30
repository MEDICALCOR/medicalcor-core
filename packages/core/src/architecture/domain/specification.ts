/**
 * @module architecture/domain/specification
 *
 * Specification Pattern
 * =====================
 *
 * Specifications encapsulate query logic in domain terms.
 * They can be combined with AND, OR, NOT operations.
 */

import type {
  Specification as ISpecification,
  QueryCriteria,
  DomainComponent,
} from '../layers/contracts.js';

// ============================================================================
// SPECIFICATION BASE CLASS
// ============================================================================

/**
 * Abstract base class for specifications
 */
export abstract class Specification<T> implements ISpecification<T>, DomainComponent {
  readonly __layer = 'domain' as const;

  /**
   * Check if a candidate satisfies this specification
   */
  abstract isSatisfiedBy(candidate: T): boolean;

  /**
   * Convert to query criteria for repository implementations
   */
  abstract toQueryCriteria(): QueryCriteria;

  /**
   * Combine with another specification using AND
   */
  and(other: ISpecification<T>): ISpecification<T> {
    return new AndSpecification(this, other);
  }

  /**
   * Combine with another specification using OR
   */
  or(other: ISpecification<T>): ISpecification<T> {
    return new OrSpecification(this, other);
  }

  /**
   * Negate this specification
   */
  not(): ISpecification<T> {
    return new NotSpecification(this);
  }
}

// ============================================================================
// COMPOSITE SPECIFICATIONS
// ============================================================================

/**
 * AND specification - both specs must be satisfied
 */
export class AndSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: ISpecification<T>,
    private readonly right: ISpecification<T>
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) && this.right.isSatisfiedBy(candidate);
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'and',
      children: [this.left.toQueryCriteria(), this.right.toQueryCriteria()],
    };
  }
}

/**
 * OR specification - either spec must be satisfied
 */
export class OrSpecification<T> extends Specification<T> {
  constructor(
    private readonly left: ISpecification<T>,
    private readonly right: ISpecification<T>
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.left.isSatisfiedBy(candidate) || this.right.isSatisfiedBy(candidate);
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'or',
      children: [this.left.toQueryCriteria(), this.right.toQueryCriteria()],
    };
  }
}

/**
 * NOT specification - spec must not be satisfied
 */
export class NotSpecification<T> extends Specification<T> {
  constructor(private readonly spec: ISpecification<T>) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return !this.spec.isSatisfiedBy(candidate);
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'not',
      children: [this.spec.toQueryCriteria()],
    };
  }
}

// ============================================================================
// COMMON SPECIFICATIONS
// ============================================================================

/**
 * Specification that always returns true
 */
export class TrueSpecification<T> extends Specification<T> {
  isSatisfiedBy(_candidate: T): boolean {
    return true;
  }

  toQueryCriteria(): QueryCriteria {
    return { operator: 'eq', field: '1', value: '1' }; // SQL: 1=1
  }
}

/**
 * Specification that always returns false
 */
export class FalseSpecification<T> extends Specification<T> {
  isSatisfiedBy(_candidate: T): boolean {
    return false;
  }

  toQueryCriteria(): QueryCriteria {
    return { operator: 'eq', field: '1', value: '0' }; // SQL: 1=0
  }
}

/**
 * Specification for equality check
 */
export class EqualSpecification<T, V> extends Specification<T> {
  constructor(
    private readonly field: keyof T & string,
    private readonly value: V
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return candidate[this.field] === this.value;
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'eq',
      field: this.field,
      value: this.value,
    };
  }
}

/**
 * Specification for inequality check
 */
export class NotEqualSpecification<T, V> extends Specification<T> {
  constructor(
    private readonly field: keyof T & string,
    private readonly value: V
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return candidate[this.field] !== this.value;
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'ne',
      field: this.field,
      value: this.value,
    };
  }
}

/**
 * Specification for greater than check
 */
export class GreaterThanSpecification<T> extends Specification<T> {
  constructor(
    private readonly field: keyof T & string,
    private readonly value: number
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return (candidate[this.field] as unknown as number) > this.value;
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'gt',
      field: this.field,
      value: this.value,
    };
  }
}

/**
 * Specification for less than check
 */
export class LessThanSpecification<T> extends Specification<T> {
  constructor(
    private readonly field: keyof T & string,
    private readonly value: number
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return (candidate[this.field] as unknown as number) < this.value;
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'lt',
      field: this.field,
      value: this.value,
    };
  }
}

/**
 * Specification for range check (inclusive)
 */
export class BetweenSpecification<T> extends Specification<T> {
  constructor(
    private readonly field: keyof T & string,
    private readonly min: number,
    private readonly max: number
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    const value = candidate[this.field] as unknown as number;
    return value >= this.min && value <= this.max;
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'and',
      children: [
        { operator: 'gte', field: this.field, value: this.min },
        { operator: 'lte', field: this.field, value: this.max },
      ],
    };
  }
}

/**
 * Specification for IN check
 */
export class InSpecification<T, V> extends Specification<T> {
  constructor(
    private readonly field: keyof T & string,
    private readonly values: V[]
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.values.includes(candidate[this.field] as unknown as V);
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'in',
      field: this.field,
      value: this.values,
    };
  }
}

/**
 * Specification for string contains check
 */
export class ContainsSpecification<T> extends Specification<T> {
  constructor(
    private readonly field: keyof T & string,
    private readonly substring: string
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    const value = candidate[this.field] as unknown as string;
    return value?.includes(this.substring) ?? false;
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'contains',
      field: this.field,
      value: this.substring,
    };
  }
}

/**
 * Specification for date range check
 */
export class DateRangeSpecification<T> extends Specification<T> {
  constructor(
    private readonly field: keyof T & string,
    private readonly start: Date,
    private readonly end: Date
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    const value = candidate[this.field] as unknown as Date;
    return value >= this.start && value <= this.end;
  }

  toQueryCriteria(): QueryCriteria {
    return {
      operator: 'and',
      children: [
        { operator: 'gte', field: this.field, value: this.start.toISOString() },
        { operator: 'lte', field: this.field, value: this.end.toISOString() },
      ],
    };
  }
}

// ============================================================================
// SPECIFICATION BUILDER
// ============================================================================

/**
 * Fluent builder for specifications
 */
export class SpecificationBuilder<T> {
  private spec: ISpecification<T> = new TrueSpecification();

  where(field: keyof T & string): FieldBuilder<T> {
    return new FieldBuilder(this, field);
  }

  addSpec(spec: ISpecification<T>): this {
    this.spec = this.spec.and(spec);
    return this;
  }

  orSpec(spec: ISpecification<T>): this {
    this.spec = this.spec.or(spec);
    return this;
  }

  build(): ISpecification<T> {
    return this.spec;
  }
}

class FieldBuilder<T> {
  constructor(
    private readonly builder: SpecificationBuilder<T>,
    private readonly field: keyof T & string
  ) {}

  equals<V>(value: V): SpecificationBuilder<T> {
    return this.builder.addSpec(new EqualSpecification(this.field, value));
  }

  notEquals<V>(value: V): SpecificationBuilder<T> {
    return this.builder.addSpec(new NotEqualSpecification(this.field, value));
  }

  greaterThan(value: number): SpecificationBuilder<T> {
    return this.builder.addSpec(new GreaterThanSpecification(this.field, value));
  }

  lessThan(value: number): SpecificationBuilder<T> {
    return this.builder.addSpec(new LessThanSpecification(this.field, value));
  }

  between(min: number, max: number): SpecificationBuilder<T> {
    return this.builder.addSpec(new BetweenSpecification(this.field, min, max));
  }

  in<V>(values: V[]): SpecificationBuilder<T> {
    return this.builder.addSpec(new InSpecification(this.field, values));
  }

  contains(substring: string): SpecificationBuilder<T> {
    return this.builder.addSpec(new ContainsSpecification(this.field, substring));
  }

  inDateRange(start: Date, end: Date): SpecificationBuilder<T> {
    return this.builder.addSpec(new DateRangeSpecification(this.field, start, end));
  }
}

// ============================================================================
// SPECIFICATION UTILITIES
// ============================================================================

/**
 * Combine multiple specifications with AND
 */
export function allOf<T>(...specs: ISpecification<T>[]): ISpecification<T> {
  if (specs.length === 0) return new TrueSpecification();
  return specs.reduce((acc, spec) => acc.and(spec));
}

/**
 * Combine multiple specifications with OR
 */
export function anyOf<T>(...specs: ISpecification<T>[]): ISpecification<T> {
  if (specs.length === 0) return new FalseSpecification();
  return specs.reduce((acc, spec) => acc.or(spec));
}

/**
 * Create a specification from a predicate function
 */
export function fromPredicate<T>(
  predicate: (candidate: T) => boolean,
  criteria: QueryCriteria
): ISpecification<T> {
  return new PredicateSpecification(predicate, criteria);
}

class PredicateSpecification<T> extends Specification<T> {
  constructor(
    private readonly predicate: (candidate: T) => boolean,
    private readonly criteria: QueryCriteria
  ) {
    super();
  }

  isSatisfiedBy(candidate: T): boolean {
    return this.predicate(candidate);
  }

  toQueryCriteria(): QueryCriteria {
    return this.criteria;
  }
}
