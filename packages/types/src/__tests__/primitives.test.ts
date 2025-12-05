/**
 * Advanced Type Primitives Unit Tests
 *
 * Tests for type-level programming primitives including:
 * - Branded/nominal types
 * - Branded type constructors with validation
 * - Zod schemas for branded types
 * - Type utilities (const assertions, exhaustiveness)
 * - Template literal types (compile-time only, tested via usage)
 */

import { describe, it, expect } from 'vitest';
import {
  // Branded types
  brand,
  // Branded type constructors
  createLeadId,
  createPatientId,
  createHubSpotContactId,
  createE164PhoneNumber,
  createEmailAddress,
  createTraceId,
  createIdempotencyKey,
  type LeadId,
  type PatientId,
  type HubSpotContactId,
  type E164PhoneNumber,
  type EmailAddress,
  type TraceId,
  type IdempotencyKey,
  // Zod schemas
  LeadIdSchema,
  PatientIdSchema,
  HubSpotContactIdSchema,
  E164PhoneNumberSchema,
  EmailAddressSchema,
  TraceIdSchema,
  IdempotencyKeySchema,
  // Const assertions
  asConst,
  tuple,
  object,
  // Exhaustiveness
  assertNever,
  exhaustive,
} from '../lib/primitives.js';

describe('Branded Types', () => {
  describe('brand', () => {
    it('should create branded value', () => {
      type UserId = ReturnType<typeof brand<string, 'UserId'>>;
      const userId = brand('user-123', 'UserId');

      // Runtime value should be the same
      expect(userId).toBe('user-123');
    });

    it('should work with different base types', () => {
      const brandedString = brand('value', 'CustomString');
      const brandedNumber = brand(42, 'CustomNumber');
      const brandedBoolean = brand(true, 'CustomBoolean');

      expect(brandedString).toBe('value');
      expect(brandedNumber).toBe(42);
      expect(brandedBoolean).toBe(true);
    });
  });
});

describe('Branded Type Constructors', () => {
  describe('createLeadId', () => {
    it('should create valid LeadId from UUID', () => {
      const uuid = '123e4567-e89b-42d3-a456-426614174000';
      const leadId = createLeadId(uuid);

      expect(leadId).toBe(uuid);
    });

    it('should throw for invalid UUID', () => {
      expect(() => createLeadId('not-a-uuid')).toThrow('Invalid LeadId');
      expect(() => createLeadId('123-456')).toThrow('Invalid LeadId');
      expect(() => createLeadId('')).toThrow('Invalid LeadId');
    });

    it('should accept all UUID versions in format', () => {
      const uuids = [
        '123e4567-e89b-42d3-a456-426614174000',
        '550e8400-e29b-41d4-a716-446655440000',
        '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      ];

      uuids.forEach((uuid) => {
        expect(() => createLeadId(uuid)).not.toThrow();
      });
    });

    it('should be case insensitive for UUID', () => {
      const uppercase = '123E4567-E89B-42D3-A456-426614174000';
      const lowercase = '123e4567-e89b-42d3-a456-426614174000';

      expect(() => createLeadId(uppercase)).not.toThrow();
      expect(() => createLeadId(lowercase)).not.toThrow();
    });
  });

  describe('createPatientId', () => {
    it('should create valid PatientId from UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const patientId = createPatientId(uuid);

      expect(patientId).toBe(uuid);
    });

    it('should throw for invalid UUID', () => {
      expect(() => createPatientId('invalid')).toThrow('Invalid PatientId');
    });
  });

  describe('createHubSpotContactId', () => {
    it('should create HubSpotContactId from non-empty string', () => {
      const id = createHubSpotContactId('12345');

      expect(id).toBe('12345');
    });

    it('should accept numeric strings', () => {
      expect(createHubSpotContactId('123')).toBe('123');
    });

    it('should throw for empty string', () => {
      expect(() => createHubSpotContactId('')).toThrow('HubSpotContactId cannot be empty');
    });

    it('should throw for whitespace-only string', () => {
      expect(() => createHubSpotContactId('   ')).toThrow('HubSpotContactId cannot be empty');
    });

    it('should accept any non-empty string', () => {
      expect(createHubSpotContactId('abc-def-123')).toBe('abc-def-123');
      expect(createHubSpotContactId('hs_contact_12345')).toBe('hs_contact_12345');
    });
  });

  describe('createE164PhoneNumber', () => {
    it('should create E164PhoneNumber from valid format', () => {
      const phone = createE164PhoneNumber('+40712345678');

      expect(phone).toBe('+40712345678');
    });

    it('should accept various country codes', () => {
      const phones = [
        '+14155552671', // US
        '+442071838750', // UK
        '+33123456789', // France
        '+861234567890', // China
        '+40712345678', // Romania
      ];

      phones.forEach((phone) => {
        expect(() => createE164PhoneNumber(phone)).not.toThrow();
      });
    });

    it('should throw for invalid E.164 format', () => {
      expect(() => createE164PhoneNumber('0712345678')).toThrow('not in E.164 format');
      expect(() => createE164PhoneNumber('+0712345678')).toThrow('not in E.164 format');
      expect(() => createE164PhoneNumber('712345678')).toThrow('not in E.164 format');
      expect(() => createE164PhoneNumber('+40 712 345 678')).toThrow('not in E.164 format');
    });

    it('should throw for too short numbers', () => {
      expect(() => createE164PhoneNumber('+1')).toThrow('not in E.164 format');
      // Note: +40 is actually valid per regex (country code + 1 digit)
    });

    it('should throw for too long numbers', () => {
      const tooLong = '+' + '1'.repeat(20);
      expect(() => createE164PhoneNumber(tooLong)).toThrow('not in E.164 format');
    });
  });

  describe('createEmailAddress', () => {
    it('should create EmailAddress from valid email', () => {
      const email = createEmailAddress('test@example.com');

      expect(email).toBe('test@example.com');
    });

    it('should normalize to lowercase', () => {
      const email = createEmailAddress('Test@Example.COM');

      expect(email).toBe('test@example.com');
    });

    it('should accept various valid email formats', () => {
      const emails = [
        'simple@example.com',
        'user.name@example.com',
        'user+tag@example.co.uk',
        'user_name@sub.domain.com',
        '123@example.com',
      ];

      emails.forEach((email) => {
        expect(() => createEmailAddress(email)).not.toThrow();
      });
    });

    it('should throw for invalid email formats', () => {
      expect(() => createEmailAddress('not-an-email')).toThrow('Invalid email');
      expect(() => createEmailAddress('@example.com')).toThrow('Invalid email');
      expect(() => createEmailAddress('user@')).toThrow('Invalid email');
      expect(() => createEmailAddress('user @example.com')).toThrow('Invalid email');
      expect(() => createEmailAddress('user')).toThrow('Invalid email');
    });
  });

  describe('createTraceId', () => {
    it('should generate TraceId without argument', () => {
      const traceId = createTraceId();

      expect(traceId).toBeDefined();
      expect(typeof traceId).toBe('string');
      expect(traceId.length).toBeGreaterThan(0);
    });

    it('should accept custom value', () => {
      const custom = 'custom-trace-id';
      const traceId = createTraceId(custom);

      expect(traceId).toBe(custom);
    });

    it('should generate unique IDs', () => {
      const id1 = createTraceId();
      const id2 = createTraceId();

      expect(id1).not.toBe(id2);
    });

    it('should generate UUID-like format', () => {
      const traceId = createTraceId();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(traceId).toMatch(uuidRegex);
    });
  });

  describe('createIdempotencyKey', () => {
    it('should generate IdempotencyKey without argument', () => {
      const key = createIdempotencyKey();

      expect(key).toBeDefined();
      expect(typeof key).toBe('string');
    });

    it('should accept custom value', () => {
      const custom = 'custom-key-123';
      const key = createIdempotencyKey(custom);

      expect(key).toBe(custom);
    });

    it('should generate unique keys', () => {
      const key1 = createIdempotencyKey();
      const key2 = createIdempotencyKey();

      expect(key1).not.toBe(key2);
    });

    it('should generate UUID format', () => {
      const key = createIdempotencyKey();
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

      expect(key).toMatch(uuidRegex);
    });
  });
});

describe('Zod Schemas for Branded Types', () => {
  describe('LeadIdSchema', () => {
    it('should validate and transform valid UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = LeadIdSchema.parse(uuid);

      expect(result).toBe(uuid);
    });

    it('should reject invalid UUID', () => {
      expect(() => LeadIdSchema.parse('not-a-uuid')).toThrow();
      expect(() => LeadIdSchema.parse('123-456')).toThrow();
    });

    it('should work with safeParse', () => {
      const valid = LeadIdSchema.safeParse('123e4567-e89b-12d3-a456-426614174000');
      const invalid = LeadIdSchema.safeParse('invalid');

      expect(valid.success).toBe(true);
      expect(invalid.success).toBe(false);
    });
  });

  describe('PatientIdSchema', () => {
    it('should validate and transform valid UUID', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const result = PatientIdSchema.parse(uuid);

      expect(result).toBe(uuid);
    });

    it('should reject invalid UUID', () => {
      expect(() => PatientIdSchema.parse('invalid')).toThrow();
    });
  });

  describe('HubSpotContactIdSchema', () => {
    it('should validate non-empty string', () => {
      const result = HubSpotContactIdSchema.parse('12345');

      expect(result).toBe('12345');
    });

    it('should reject empty string', () => {
      expect(() => HubSpotContactIdSchema.parse('')).toThrow();
    });

    it('should accept any non-empty string', () => {
      expect(HubSpotContactIdSchema.parse('abc-123')).toBe('abc-123');
    });
  });

  describe('E164PhoneNumberSchema', () => {
    it('should validate E.164 phone number', () => {
      const phone = E164PhoneNumberSchema.parse('+40712345678');

      expect(phone).toBe('+40712345678');
    });

    it('should reject invalid format', () => {
      expect(() => E164PhoneNumberSchema.parse('0712345678')).toThrow();
      expect(() => E164PhoneNumberSchema.parse('+40 712 345 678')).toThrow();
    });

    it('should validate various country codes', () => {
      expect(E164PhoneNumberSchema.parse('+14155552671')).toBe('+14155552671');
      expect(E164PhoneNumberSchema.parse('+442071838750')).toBe('+442071838750');
    });
  });

  describe('EmailAddressSchema', () => {
    it('should validate and normalize email', () => {
      const result = EmailAddressSchema.parse('Test@Example.COM');

      expect(result).toBe('test@example.com');
    });

    it('should reject invalid email', () => {
      expect(() => EmailAddressSchema.parse('not-an-email')).toThrow();
      expect(() => EmailAddressSchema.parse('@example.com')).toThrow();
    });

    it('should validate various email formats', () => {
      expect(EmailAddressSchema.parse('user.name@example.com')).toBe('user.name@example.com');
      expect(EmailAddressSchema.parse('user+tag@example.com')).toBe('user+tag@example.com');
    });
  });

  describe('TraceIdSchema', () => {
    it('should validate non-empty string', () => {
      const result = TraceIdSchema.parse('trace-123');

      expect(result).toBe('trace-123');
    });

    it('should reject empty string', () => {
      expect(() => TraceIdSchema.parse('')).toThrow();
    });
  });

  describe('IdempotencyKeySchema', () => {
    it('should validate UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      const result = IdempotencyKeySchema.parse(uuid);

      expect(result).toBe(uuid);
    });

    it('should reject non-UUID', () => {
      expect(() => IdempotencyKeySchema.parse('not-a-uuid')).toThrow();
    });
  });
});

describe('Const Assertions', () => {
  describe('asConst', () => {
    it('should return value unchanged', () => {
      const value = asConst({ x: 1, y: 2 });

      expect(value).toEqual({ x: 1, y: 2 });
    });

    it('should work with primitives', () => {
      expect(asConst(42)).toBe(42);
      expect(asConst('hello')).toBe('hello');
      expect(asConst(true)).toBe(true);
    });

    it('should work with arrays', () => {
      const arr = asConst([1, 2, 3]);

      expect(arr).toEqual([1, 2, 3]);
    });
  });

  describe('tuple', () => {
    it('should create readonly tuple', () => {
      const t = tuple(1, 'hello', true);

      expect(t).toEqual([1, 'hello', true]);
      expect(t[0]).toBe(1);
      expect(t[1]).toBe('hello');
      expect(t[2]).toBe(true);
    });

    it('should preserve types', () => {
      const t = tuple('a', 'b', 'c');

      expect(t.length).toBe(3);
    });

    it('should work with mixed types', () => {
      const t = tuple(1, 'two', { three: 3 }, [4]);

      expect(t).toEqual([1, 'two', { three: 3 }, [4]]);
    });
  });

  describe('object', () => {
    it('should create frozen object', () => {
      const obj = object({ x: 1, y: 2 });

      expect(obj).toEqual({ x: 1, y: 2 });
      expect(Object.isFrozen(obj)).toBe(true);
    });

    it('should prevent modifications', () => {
      const obj = object({ value: 42 });

      expect(() => {
        (obj as { value: number }).value = 100;
      }).toThrow();
    });

    it('should work with nested objects', () => {
      const obj = object({ nested: { value: 1 } });

      expect(obj.nested.value).toBe(1);
    });
  });
});

describe('Exhaustiveness Checking', () => {
  describe('assertNever', () => {
    it('should always throw', () => {
      expect(() => assertNever({} as never)).toThrow();
      expect(() => assertNever('value' as never)).toThrow();
    });

    it('should include custom message', () => {
      expect(() => assertNever({} as never, 'Custom message')).toThrow('Custom message');
    });

    it('should serialize value in error', () => {
      const value = { type: 'unknown', data: 42 };

      try {
        assertNever(value as never);
      } catch (error) {
        expect((error as Error).message).toContain('unknown');
      }
    });

    it('should be used in exhaustive switches', () => {
      type Status = 'pending' | 'completed';

      function handle(status: Status): string {
        switch (status) {
          case 'pending':
            return 'Waiting';
          case 'completed':
            return 'Done';
          default:
            // This should never be reached if Status is exhaustive
            return assertNever(status);
        }
      }

      expect(handle('pending')).toBe('Waiting');
      expect(handle('completed')).toBe('Done');
    });
  });

  describe('exhaustive', () => {
    it('should return undefined', () => {
      const result = exhaustive({} as never);

      expect(result).toBeUndefined();
    });

    it('should be used in unreachable code', () => {
      type Action = { type: 'increment' } | { type: 'decrement' };

      function reduce(action: Action): number {
        switch (action.type) {
          case 'increment':
            return 1;
          case 'decrement':
            return -1;
          default:
            // Compile-time exhaustiveness check
            return exhaustive(action) ?? 0;
        }
      }

      expect(reduce({ type: 'increment' })).toBe(1);
      expect(reduce({ type: 'decrement' })).toBe(-1);
    });
  });
});

describe('Branded Type Usage Examples', () => {
  it('should prevent mixing different branded types', () => {
    const leadId = createLeadId('123e4567-e89b-42d3-a456-426614174000');
    const patientId = createPatientId('550e8400-e29b-41d4-a716-446655440000');

    // At runtime, these are both strings
    expect(typeof leadId).toBe('string');
    expect(typeof patientId).toBe('string');

    // But TypeScript treats them as different types
    // This would be a compile error:
    // const mixed: LeadId = patientId;
  });

  it('should work in function signatures', () => {
    function processLead(id: LeadId): string {
      return `Processing lead ${id}`;
    }

    const id = createLeadId('123e4567-e89b-42d3-a456-426614174000');
    const result = processLead(id);

    expect(result).toContain('Processing lead');
  });

  it('should work with arrays', () => {
    const ids: LeadId[] = [
      createLeadId('123e4567-e89b-42d3-a456-426614174000'),
      createLeadId('550e8400-e29b-41d4-a716-446655440000'),
    ];

    expect(ids).toHaveLength(2);
  });

  it('should work with object properties', () => {
    interface Lead {
      id: LeadId;
      phone: E164PhoneNumber;
      email?: EmailAddress;
    }

    const lead: Lead = {
      id: createLeadId('123e4567-e89b-42d3-a456-426614174000'),
      phone: createE164PhoneNumber('+40712345678'),
      email: createEmailAddress('test@example.com'),
    };

    expect(lead.id).toBeDefined();
    expect(lead.phone).toBe('+40712345678');
    expect(lead.email).toBe('test@example.com');
  });
});

describe('Type Safety Examples', () => {
  it('should enforce type safety with branded types', () => {
    // This simulates what would be a compile error
    const uuid = '123e4567-e89b-42d3-a456-426614174000'; // Valid v4 UUID

    // Must use constructor, can't assign directly
    // const leadId: LeadId = uuid; // Would be compile error

    // Correct way:
    const leadId: LeadId = createLeadId(uuid);
    expect(leadId).toBe(uuid);
  });

  it('should validate at construction time', () => {
    // Invalid values are rejected at construction
    expect(() => createE164PhoneNumber('invalid')).toThrow();
    expect(() => createEmailAddress('not-email')).toThrow();
    expect(() => createLeadId('not-uuid')).toThrow();

    // Valid values pass through
    const phone = createE164PhoneNumber('+40712345678');
    const email = createEmailAddress('test@example.com');
    const id = createLeadId('123e4567-e89b-42d3-a456-426614174000'); // Valid v4 UUID

    expect(phone).toBe('+40712345678');
    expect(email).toBe('test@example.com');
    expect(id).toBe('123e4567-e89b-42d3-a456-426614174000');
  });
});
