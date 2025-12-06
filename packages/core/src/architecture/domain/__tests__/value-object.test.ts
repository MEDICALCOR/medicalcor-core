/**
 * Value Object Base Class and Implementations Tests
 * Comprehensive tests for DDD value objects
 */

import { describe, it, expect } from 'vitest';
import {
  ValueObject,
  SingleValueObject,
  IdValueObject,
  Money,
  DateRange,
  Email,
  Percentage,
  InvalidValueObjectError,
  createValueObject,
  tryCreateValueObject,
} from '../value-object.js';

// ============================================================================
// TEST HELPERS - Concrete implementations for testing abstract classes
// ============================================================================

interface AddressProps {
  street: string;
  city: string;
  postalCode: string;
}

class Address extends ValueObject<AddressProps> {
  protected validateProps(props: AddressProps): void {
    if (!props.street || !props.city || !props.postalCode) {
      throw new InvalidValueObjectError('All address fields are required');
    }
  }

  get street(): string {
    return this.props.street;
  }

  get city(): string {
    return this.props.city;
  }

  get postalCode(): string {
    return this.props.postalCode;
  }

  withCity(city: string): Address {
    return this.copyWith({ city });
  }
}

class UserId extends IdValueObject {}

class Counter extends SingleValueObject<number> {
  protected validateProps(props: { value: number }): void {
    if (typeof props.value !== 'number' || isNaN(props.value)) {
      throw new InvalidValueObjectError('Counter must be a number');
    }
  }
}

// ============================================================================
// VALUE OBJECT BASE CLASS
// ============================================================================

describe('ValueObject', () => {
  describe('construction', () => {
    it('should create value object with valid props', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(address.street).toBe('123 Main St');
      expect(address.city).toBe('Boston');
      expect(address.postalCode).toBe('02101');
    });

    it('should freeze props after construction', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(Object.isFrozen(address.value)).toBe(true);
    });

    it('should freeze the value object itself', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(Object.isFrozen(address)).toBe(true);
    });

    it('should have domain layer identifier', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(address.__layer).toBe('domain');
    });

    it('should throw on invalid props', () => {
      expect(() => new Address({ street: '', city: 'Boston', postalCode: '02101' })).toThrow(
        InvalidValueObjectError
      );
    });
  });

  describe('equality', () => {
    it('should return true for equal value objects', () => {
      const address1 = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const address2 = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(address1.equals(address2)).toBe(true);
    });

    it('should return false for different value objects', () => {
      const address1 = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const address2 = new Address({ street: '456 Oak Ave', city: 'Boston', postalCode: '02101' });

      expect(address1.equals(address2)).toBe(false);
    });

    it('should return false for null', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(address.equals(null as unknown as Address)).toBe(false);
    });

    it('should return false for undefined', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(address.equals(undefined as unknown as Address)).toBe(false);
    });

    it('should return false for non-ValueObject', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const plainObj = { props: { street: '123 Main St', city: 'Boston', postalCode: '02101' } };

      expect(address.equals(plainObj as unknown as Address)).toBe(false);
    });

    it('should handle nested objects in props', () => {
      interface NestedProps {
        data: { a: number; b: number };
      }
      class NestedVO extends ValueObject<NestedProps> {
        protected validateProps(): void {}
      }

      const vo1 = new NestedVO({ data: { a: 1, b: 2 } });
      const vo2 = new NestedVO({ data: { a: 1, b: 2 } });
      const vo3 = new NestedVO({ data: { a: 1, b: 3 } });

      expect(vo1.equals(vo2)).toBe(true);
      expect(vo1.equals(vo3)).toBe(false);
    });

    it('should handle arrays in props', () => {
      interface ArrayProps {
        items: number[];
      }
      class ArrayVO extends ValueObject<ArrayProps> {
        protected validateProps(): void {}
      }

      const vo1 = new ArrayVO({ items: [1, 2, 3] });
      const vo2 = new ArrayVO({ items: [1, 2, 3] });
      const vo3 = new ArrayVO({ items: [1, 2, 4] });

      expect(vo1.equals(vo2)).toBe(true);
      expect(vo1.equals(vo3)).toBe(false);
    });
  });

  describe('hashCode', () => {
    it('should return same hash for equal value objects', () => {
      const address1 = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const address2 = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(address1.hashCode()).toBe(address2.hashCode());
    });

    it('should return different hash for different value objects (usually)', () => {
      const address1 = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const address2 = new Address({ street: '456 Oak Ave', city: 'Boston', postalCode: '02101' });

      expect(address1.hashCode()).not.toBe(address2.hashCode());
    });

    it('should return a number', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });

      expect(typeof address.hashCode()).toBe('number');
    });
  });

  describe('toString', () => {
    it('should return readable string representation', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const str = address.toString();

      expect(str).toContain('Address');
      expect(str).toContain('123 Main St');
    });
  });

  describe('toJSON', () => {
    it('should return props as plain object', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const json = address.toJSON();

      expect(json).toEqual({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
    });

    it('should return a copy, not the original', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const json = address.toJSON();

      expect(json).not.toBe(address.value);
    });
  });

  describe('copyWith', () => {
    it('should create new instance with updated props', () => {
      const address = new Address({ street: '123 Main St', city: 'Boston', postalCode: '02101' });
      const updated = address.withCity('Cambridge');

      expect(updated.city).toBe('Cambridge');
      expect(updated.street).toBe('123 Main St');
      expect(address.city).toBe('Boston'); // Original unchanged
    });
  });
});

// ============================================================================
// SINGLE VALUE OBJECT
// ============================================================================

describe('SingleValueObject', () => {
  it('should wrap single value', () => {
    const counter = new Counter(42);

    expect(counter.rawValue).toBe(42);
  });

  it('should return props through value getter', () => {
    const counter = new Counter(42);

    expect(counter.value).toEqual({ value: 42 });
  });

  it('should convert to string using raw value', () => {
    const counter = new Counter(42);

    expect(counter.toString()).toBe('42');
  });

  it('should validate on construction', () => {
    expect(() => new Counter(NaN)).toThrow(InvalidValueObjectError);
  });
});

// ============================================================================
// ID VALUE OBJECT
// ============================================================================

describe('IdValueObject', () => {
  it('should create with valid string ID', () => {
    const userId = new UserId('user-123');

    expect(userId.rawValue).toBe('user-123');
  });

  it('should reject empty string', () => {
    expect(() => new UserId('')).toThrow(InvalidValueObjectError);
  });

  it('should reject non-string value', () => {
    expect(() => new UserId(123 as unknown as string)).toThrow(InvalidValueObjectError);
  });

  it('should reject null', () => {
    expect(() => new UserId(null as unknown as string)).toThrow(InvalidValueObjectError);
  });

  it('should compare equal IDs', () => {
    const id1 = new UserId('user-123');
    const id2 = new UserId('user-123');

    expect(id1.equals(id2)).toBe(true);
  });
});

// ============================================================================
// MONEY VALUE OBJECT
// ============================================================================

describe('Money', () => {
  describe('construction', () => {
    it('should create with valid amount and currency', () => {
      const money = new Money({ amount: 100.5, currency: 'USD' });

      expect(money.amount).toBe(100.5);
      expect(money.currency).toBe('USD');
    });

    it('should accept zero amount', () => {
      const money = new Money({ amount: 0, currency: 'USD' });

      expect(money.amount).toBe(0);
    });

    it('should accept negative amount', () => {
      const money = new Money({ amount: -50, currency: 'USD' });

      expect(money.amount).toBe(-50);
    });

    it('should reject NaN amount', () => {
      expect(() => new Money({ amount: NaN, currency: 'USD' })).toThrow(InvalidValueObjectError);
    });

    it('should reject invalid currency length', () => {
      expect(() => new Money({ amount: 100, currency: 'US' })).toThrow(InvalidValueObjectError);
      expect(() => new Money({ amount: 100, currency: 'USDD' })).toThrow(InvalidValueObjectError);
    });
  });

  describe('arithmetic', () => {
    it('should add money of same currency', () => {
      const m1 = new Money({ amount: 100, currency: 'USD' });
      const m2 = new Money({ amount: 50, currency: 'USD' });

      const result = m1.add(m2);

      expect(result.amount).toBe(150);
      expect(result.currency).toBe('USD');
    });

    it('should throw on adding different currencies', () => {
      const m1 = new Money({ amount: 100, currency: 'USD' });
      const m2 = new Money({ amount: 50, currency: 'EUR' });

      expect(() => m1.add(m2)).toThrow(InvalidValueObjectError);
    });

    it('should subtract money of same currency', () => {
      const m1 = new Money({ amount: 100, currency: 'USD' });
      const m2 = new Money({ amount: 30, currency: 'USD' });

      const result = m1.subtract(m2);

      expect(result.amount).toBe(70);
    });

    it('should throw on subtracting different currencies', () => {
      const m1 = new Money({ amount: 100, currency: 'USD' });
      const m2 = new Money({ amount: 50, currency: 'EUR' });

      expect(() => m1.subtract(m2)).toThrow(InvalidValueObjectError);
    });

    it('should multiply by factor', () => {
      const money = new Money({ amount: 100, currency: 'USD' });

      const result = money.multiply(2.5);

      expect(result.amount).toBe(250);
      expect(result.currency).toBe('USD');
    });
  });

  describe('comparison', () => {
    it('should detect positive amount', () => {
      expect(new Money({ amount: 100, currency: 'USD' }).isPositive()).toBe(true);
      expect(new Money({ amount: 0, currency: 'USD' }).isPositive()).toBe(false);
      expect(new Money({ amount: -10, currency: 'USD' }).isPositive()).toBe(false);
    });

    it('should detect negative amount', () => {
      expect(new Money({ amount: -100, currency: 'USD' }).isNegative()).toBe(true);
      expect(new Money({ amount: 0, currency: 'USD' }).isNegative()).toBe(false);
      expect(new Money({ amount: 10, currency: 'USD' }).isNegative()).toBe(false);
    });

    it('should detect zero amount', () => {
      expect(new Money({ amount: 0, currency: 'USD' }).isZero()).toBe(true);
      expect(new Money({ amount: 100, currency: 'USD' }).isZero()).toBe(false);
    });
  });

  describe('toString', () => {
    it('should format with currency and two decimals', () => {
      const money = new Money({ amount: 1234.5, currency: 'EUR' });

      expect(money.toString()).toBe('EUR 1234.50');
    });
  });
});

// ============================================================================
// DATE RANGE VALUE OBJECT
// ============================================================================

describe('DateRange', () => {
  describe('construction', () => {
    it('should create with valid start and end', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range = new DateRange({ start, end });

      expect(range.start.getTime()).toBe(start.getTime());
      expect(range.end.getTime()).toBe(end.getTime());
    });

    it('should accept same start and end date', () => {
      const date = new Date('2024-01-15');
      const range = new DateRange({ start: date, end: date });

      expect(range.start.getTime()).toBe(range.end.getTime());
    });

    it('should reject start after end', () => {
      const start = new Date('2024-01-31');
      const end = new Date('2024-01-01');

      expect(() => new DateRange({ start, end })).toThrow(InvalidValueObjectError);
    });

    it('should reject invalid start date', () => {
      expect(
        () => new DateRange({ start: new Date('invalid'), end: new Date('2024-01-01') })
      ).toThrow(InvalidValueObjectError);
    });

    it('should reject invalid end date', () => {
      expect(
        () => new DateRange({ start: new Date('2024-01-01'), end: new Date('invalid') })
      ).toThrow(InvalidValueObjectError);
    });
  });

  describe('contains', () => {
    it('should return true for date within range', () => {
      const range = new DateRange({
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });

      expect(range.contains(new Date('2024-01-15'))).toBe(true);
    });

    it('should return true for start date', () => {
      const range = new DateRange({
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });

      expect(range.contains(new Date('2024-01-01'))).toBe(true);
    });

    it('should return true for end date', () => {
      const range = new DateRange({
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });

      expect(range.contains(new Date('2024-01-31'))).toBe(true);
    });

    it('should return false for date outside range', () => {
      const range = new DateRange({
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });

      expect(range.contains(new Date('2024-02-15'))).toBe(false);
    });
  });

  describe('overlaps', () => {
    it('should return true for overlapping ranges', () => {
      const range1 = new DateRange({
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });
      const range2 = new DateRange({
        start: new Date('2024-01-15'),
        end: new Date('2024-02-15'),
      });

      expect(range1.overlaps(range2)).toBe(true);
    });

    it('should return true for adjacent ranges', () => {
      const range1 = new DateRange({
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });
      const range2 = new DateRange({
        start: new Date('2024-01-31'),
        end: new Date('2024-02-28'),
      });

      expect(range1.overlaps(range2)).toBe(true);
    });

    it('should return false for non-overlapping ranges', () => {
      const range1 = new DateRange({
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      });
      const range2 = new DateRange({
        start: new Date('2024-03-01'),
        end: new Date('2024-03-31'),
      });

      expect(range1.overlaps(range2)).toBe(false);
    });
  });

  describe('duration', () => {
    it('should calculate duration in days', () => {
      const range = new DateRange({
        start: new Date('2024-01-01'),
        end: new Date('2024-01-10'),
      });

      expect(range.durationInDays()).toBe(9);
    });

    it('should calculate duration in hours', () => {
      const range = new DateRange({
        start: new Date('2024-01-01T00:00:00'),
        end: new Date('2024-01-01T12:00:00'),
      });

      expect(range.durationInHours()).toBe(12);
    });

    it('should return 0 days for same date', () => {
      const date = new Date('2024-01-15');
      const range = new DateRange({ start: date, end: date });

      expect(range.durationInDays()).toBe(0);
    });
  });

  describe('date getters', () => {
    it('should return new Date instances', () => {
      const start = new Date('2024-01-01');
      const end = new Date('2024-01-31');
      const range = new DateRange({ start, end });

      expect(range.start).not.toBe(start);
      expect(range.end).not.toBe(end);
    });
  });
});

// ============================================================================
// EMAIL VALUE OBJECT
// ============================================================================

describe('Email', () => {
  describe('construction', () => {
    it('should create with valid email', () => {
      const email = new Email('test@example.com');

      expect(email.rawValue).toBe('test@example.com');
    });

    it('should reject invalid email format', () => {
      expect(() => new Email('invalid-email')).toThrow(InvalidValueObjectError);
      expect(() => new Email('test@')).toThrow(InvalidValueObjectError);
      expect(() => new Email('@example.com')).toThrow(InvalidValueObjectError);
      expect(() => new Email('')).toThrow(InvalidValueObjectError);
    });
  });

  describe('domain and localPart', () => {
    it('should extract domain', () => {
      const email = new Email('user@example.com');

      expect(email.domain).toBe('example.com');
    });

    it('should extract local part', () => {
      const email = new Email('user@example.com');

      expect(email.localPart).toBe('user');
    });
  });

  describe('static create', () => {
    it('should create and normalize email', () => {
      const email = Email.create('  TEST@EXAMPLE.COM  ');

      expect(email.rawValue).toBe('test@example.com');
    });
  });
});

// ============================================================================
// PERCENTAGE VALUE OBJECT
// ============================================================================

describe('Percentage', () => {
  describe('construction', () => {
    it('should create with valid percentage', () => {
      const pct = new Percentage(75);

      expect(pct.rawValue).toBe(75);
    });

    it('should accept 0 and 100', () => {
      const zero = new Percentage(0);
      const hundred = new Percentage(100);

      expect(zero.rawValue).toBe(0);
      expect(hundred.rawValue).toBe(100);
    });

    it('should reject percentage below 0', () => {
      expect(() => new Percentage(-1)).toThrow(InvalidValueObjectError);
    });

    it('should reject percentage above 100', () => {
      expect(() => new Percentage(101)).toThrow(InvalidValueObjectError);
    });

    it('should reject NaN', () => {
      expect(() => new Percentage(NaN)).toThrow(InvalidValueObjectError);
    });
  });

  describe('decimal conversion', () => {
    it('should convert to decimal', () => {
      expect(new Percentage(75).decimal).toBe(0.75);
      expect(new Percentage(50).decimal).toBe(0.5);
      expect(new Percentage(100).decimal).toBe(1);
    });

    it('should create from decimal', () => {
      const pct = Percentage.fromDecimal(0.75);

      expect(pct.rawValue).toBe(75);
    });
  });

  describe('toString', () => {
    it('should format with percent sign', () => {
      expect(new Percentage(75).toString()).toBe('75%');
    });
  });
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

describe('createValueObject', () => {
  it('should create value object', () => {
    const money = createValueObject(Money, { amount: 100, currency: 'USD' });

    expect(money).toBeInstanceOf(Money);
    expect(money.amount).toBe(100);
  });

  it('should throw on invalid props', () => {
    expect(() => createValueObject(Money, { amount: NaN, currency: 'USD' })).toThrow(
      InvalidValueObjectError
    );
  });
});

describe('tryCreateValueObject', () => {
  it('should return value object on success', () => {
    const money = tryCreateValueObject(Money, { amount: 100, currency: 'USD' });

    expect(money).toBeInstanceOf(Money);
  });

  it('should return null on failure', () => {
    const money = tryCreateValueObject(Money, { amount: NaN, currency: 'USD' });

    expect(money).toBeNull();
  });
});

// ============================================================================
// INVALID VALUE OBJECT ERROR
// ============================================================================

describe('InvalidValueObjectError', () => {
  it('should have correct name and code', () => {
    const error = new InvalidValueObjectError('Test message');

    expect(error.name).toBe('InvalidValueObjectError');
    expect(error.code).toBe('INVALID_VALUE_OBJECT');
  });

  it('should include field and value', () => {
    const error = new InvalidValueObjectError('Field error', 'amount', -100);

    expect(error.field).toBe('amount');
    expect(error.value).toBe(-100);
  });

  it('should allow optional field and value', () => {
    const error = new InvalidValueObjectError('Generic error');

    expect(error.field).toBeUndefined();
    expect(error.value).toBeUndefined();
  });
});
