/**
 * @module architecture/domain/value-object
 *
 * Value Object Base Class
 * =======================
 *
 * Value Objects are immutable domain objects without identity.
 * Two value objects are equal if all their properties are equal.
 */

import type { ValueObject as IValueObject, DomainComponent } from '../layers/contracts.js';

// ============================================================================
// VALUE OBJECT BASE CLASS
// ============================================================================

/**
 * Abstract base class for all value objects
 *
 * @template TProps - The type of the value object's properties
 */
export abstract class ValueObject<TProps> implements IValueObject<TProps>, DomainComponent {
  readonly __layer = 'domain' as const;
  protected readonly props: Readonly<TProps>;

  constructor(props: TProps) {
    this.validateProps(props);
    this.props = Object.freeze({ ...props });
    Object.freeze(this);
  }

  /**
   * Get the value object's properties
   */
  get value(): TProps {
    return this.props;
  }

  /**
   * Validate properties during construction
   * Override this to add custom validation
   */
  protected abstract validateProps(props: TProps): void;

  /**
   * Check equality based on all properties
   */
  equals(other: IValueObject<TProps>): boolean {
    if (other === null || other === undefined) {
      return false;
    }
    if (!(other instanceof ValueObject)) {
      return false;
    }
    return this.propsEqual(this.props, (other as ValueObject<TProps>).props);
  }

  /**
   * Compare two property objects for deep equality
   */
  protected propsEqual(props1: TProps, props2: TProps): boolean {
    return JSON.stringify(this.sortObject(props1)) === JSON.stringify(this.sortObject(props2));
  }

  /**
   * Sort object keys for consistent comparison
   */
  private sortObject(obj: unknown): unknown {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObject(item));
    }
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = this.sortObject((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }

  /**
   * Get hash code for the value object
   */
  hashCode(): number {
    const str = JSON.stringify(this.props);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  }

  /**
   * String representation
   */
  toString(): string {
    return `${this.constructor.name}(${JSON.stringify(this.props)})`;
  }

  /**
   * JSON representation
   */
  toJSON(): TProps {
    return { ...this.props };
  }

  /**
   * Create a copy with updated properties
   * Returns a new value object (immutability)
   */
  protected copyWith(updates: Partial<TProps>): this {
    const Constructor = this.constructor as new (props: TProps) => this;
    return new Constructor({ ...this.props, ...updates });
  }
}

// ============================================================================
// VALUE OBJECT ERRORS
// ============================================================================

/**
 * Error thrown when value object validation fails
 */
export class InvalidValueObjectError extends Error {
  readonly code = 'INVALID_VALUE_OBJECT';
  readonly field?: string | undefined;
  readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown) {
    super(message);
    this.name = 'InvalidValueObjectError';
    this.field = field;
    this.value = value;
  }
}

// ============================================================================
// COMMON VALUE OBJECT IMPLEMENTATIONS
// ============================================================================

/**
 * Single value wrapper
 */
export abstract class SingleValueObject<T> extends ValueObject<{ value: T }> {
  constructor(value: T) {
    super({ value });
  }

  override get value(): { value: T } {
    return this.props;
  }

  get rawValue(): T {
    return this.props.value;
  }

  override toString(): string {
    return String(this.props.value);
  }
}

/**
 * ID value object - wraps a string ID
 */
export abstract class IdValueObject extends SingleValueObject<string> {
  protected validateProps(props: { value: string }): void {
    if (!props.value || typeof props.value !== 'string') {
      throw new InvalidValueObjectError('ID must be a non-empty string', 'value', props.value);
    }
  }
}

/**
 * Money value object
 */
export class Money extends ValueObject<{ amount: number; currency: string }> {
  protected validateProps(props: { amount: number; currency: string }): void {
    if (typeof props.amount !== 'number' || isNaN(props.amount)) {
      throw new InvalidValueObjectError('Amount must be a valid number', 'amount', props.amount);
    }
    if (props.currency?.length !== 3) {
      throw new InvalidValueObjectError(
        'Currency must be a 3-letter code',
        'currency',
        props.currency
      );
    }
  }

  get amount(): number {
    return this.props.amount;
  }

  get currency(): string {
    return this.props.currency;
  }

  add(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidValueObjectError(
        `Cannot add money with different currencies: ${this.currency} and ${other.currency}`
      );
    }
    return new Money({ amount: this.amount + other.amount, currency: this.currency });
  }

  subtract(other: Money): Money {
    if (this.currency !== other.currency) {
      throw new InvalidValueObjectError(
        `Cannot subtract money with different currencies: ${this.currency} and ${other.currency}`
      );
    }
    return new Money({ amount: this.amount - other.amount, currency: this.currency });
  }

  multiply(factor: number): Money {
    return new Money({ amount: this.amount * factor, currency: this.currency });
  }

  isPositive(): boolean {
    return this.amount > 0;
  }

  isNegative(): boolean {
    return this.amount < 0;
  }

  isZero(): boolean {
    return this.amount === 0;
  }

  override toString(): string {
    return `${this.currency} ${this.amount.toFixed(2)}`;
  }
}

/**
 * Date range value object
 */
export class DateRange extends ValueObject<{ start: Date; end: Date }> {
  protected validateProps(props: { start: Date; end: Date }): void {
    if (!(props.start instanceof Date) || isNaN(props.start.getTime())) {
      throw new InvalidValueObjectError('Start must be a valid date', 'start', props.start);
    }
    if (!(props.end instanceof Date) || isNaN(props.end.getTime())) {
      throw new InvalidValueObjectError('End must be a valid date', 'end', props.end);
    }
    if (props.start > props.end) {
      throw new InvalidValueObjectError('Start date must be before or equal to end date');
    }
  }

  get start(): Date {
    return new Date(this.props.start);
  }

  get end(): Date {
    return new Date(this.props.end);
  }

  contains(date: Date): boolean {
    return date >= this.props.start && date <= this.props.end;
  }

  overlaps(other: DateRange): boolean {
    return this.props.start <= other.props.end && this.props.end >= other.props.start;
  }

  durationInDays(): number {
    const ms = this.props.end.getTime() - this.props.start.getTime();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  durationInHours(): number {
    const ms = this.props.end.getTime() - this.props.start.getTime();
    return Math.ceil(ms / (1000 * 60 * 60));
  }
}

/**
 * Email value object
 */
export class Email extends SingleValueObject<string> {
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  protected validateProps(props: { value: string }): void {
    if (!props.value || !Email.EMAIL_REGEX.test(props.value)) {
      throw new InvalidValueObjectError('Invalid email format', 'value', props.value);
    }
  }

  get domain(): string {
    return this.rawValue.split('@')[1] ?? '';
  }

  get localPart(): string {
    return this.rawValue.split('@')[0] ?? '';
  }

  static create(email: string): Email {
    return new Email(email.toLowerCase().trim());
  }
}

/**
 * Percentage value object (0-100)
 */
export class Percentage extends SingleValueObject<number> {
  protected validateProps(props: { value: number }): void {
    if (typeof props.value !== 'number' || isNaN(props.value)) {
      throw new InvalidValueObjectError('Percentage must be a valid number', 'value', props.value);
    }
    if (props.value < 0 || props.value > 100) {
      throw new InvalidValueObjectError(
        'Percentage must be between 0 and 100',
        'value',
        props.value
      );
    }
  }

  get decimal(): number {
    return this.rawValue / 100;
  }

  static fromDecimal(decimal: number): Percentage {
    return new Percentage(decimal * 100);
  }

  override toString(): string {
    return `${this.rawValue}%`;
  }
}

// ============================================================================
// VALUE OBJECT UTILITIES
// ============================================================================

/**
 * Create a validated value object or throw
 */
export function createValueObject<T extends ValueObject<P>, P>(
  Constructor: new (props: P) => T,
  props: P
): T {
  return new Constructor(props);
}

/**
 * Try to create a value object, returning null on failure
 */
export function tryCreateValueObject<T extends ValueObject<P>, P>(
  Constructor: new (props: P) => T,
  props: P
): T | null {
  try {
    return new Constructor(props);
  } catch {
    return null;
  }
}
