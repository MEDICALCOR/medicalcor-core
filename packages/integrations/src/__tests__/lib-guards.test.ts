/**
 * Comprehensive tests for Type Guards & Runtime Assertions
 * Tests lib/guards.ts
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  guardOk,
  guardFail,
  isObject,
  isNonEmptyString,
  isPositiveInteger,
  isNonNegativeInteger,
  isValidDate,
  isISODateString,
  isValidUrl,
  isValidEmail,
  isValidPhone,
  isE164Phone,
  isUUID,
  isHubSpotContact,
  isWhatsAppMessage,
  isVapiCall,
  isStripeCharge,
  hasTag,
  hasType,
  hasKind,
  assertNever,
  exhaustiveMatch,
  matchWithDefault,
  AssertionError,
  assert,
  assertDefined,
  assertNonEmptyString,
  assertPositiveInteger,
  assertSchema,
  getProperty,
  getNestedProperty,
  getPropertyGuarded,
  isNonEmptyArray,
  isArrayOf,
  hasLength,
  hasMinLength,
  isHubSpotWebhookPayload,
  isWhatsAppWebhookPayload,
  isStripeWebhookPayload,
  validate,
  validateOrThrow,
  validateWithErrors,
  toNonEmptyArray,
  toNonEmptyString,
  filterMap,
  partition,
  type GuardResult,
} from '../lib/guards.js';

describe('lib/guards', () => {
  describe('GuardResult helpers', () => {
    describe('guardOk', () => {
      it('should create successful result', () => {
        const result = guardOk('test-value');

        expect(result.success).toBe(true);
        expect(result.value).toBe('test-value');
        expect(result.errors).toBeUndefined();
      });

      it('should work with different types', () => {
        expect(guardOk(123).value).toBe(123);
        expect(guardOk({ key: 'value' }).value).toEqual({ key: 'value' });
        expect(guardOk(null).value).toBeNull();
      });
    });

    describe('guardFail', () => {
      it('should create failed result', () => {
        const result = guardFail(['Error 1', 'Error 2']);

        expect(result.success).toBe(false);
        expect(result.errors).toEqual(['Error 1', 'Error 2']);
        expect(result.value).toBeUndefined();
      });

      it('should handle empty errors array', () => {
        const result = guardFail([]);

        expect(result.success).toBe(false);
        expect(result.errors).toEqual([]);
      });
    });
  });

  describe('primitive type guards', () => {
    describe('isObject', () => {
      it('should return true for plain object', () => {
        expect(isObject({ key: 'value' })).toBe(true);
      });

      it('should return true for empty object', () => {
        expect(isObject({})).toBe(true);
      });

      it('should return false for null', () => {
        expect(isObject(null)).toBe(false);
      });

      it('should return false for array', () => {
        expect(isObject([])).toBe(false);
      });

      it('should return false for primitive types', () => {
        expect(isObject('string')).toBe(false);
        expect(isObject(123)).toBe(false);
        expect(isObject(true)).toBe(false);
        expect(isObject(undefined)).toBe(false);
      });

      it('should return true for Date object', () => {
        expect(isObject(new Date())).toBe(true);
      });
    });

    describe('isNonEmptyString', () => {
      it('should return true for non-empty string', () => {
        expect(isNonEmptyString('hello')).toBe(true);
      });

      it('should return false for empty string', () => {
        expect(isNonEmptyString('')).toBe(false);
      });

      it('should return false for whitespace-only string', () => {
        expect(isNonEmptyString('   ')).toBe(false);
      });

      it('should return false for non-string', () => {
        expect(isNonEmptyString(123)).toBe(false);
        expect(isNonEmptyString(null)).toBe(false);
        expect(isNonEmptyString(undefined)).toBe(false);
      });

      it('should return true for string with content and whitespace', () => {
        expect(isNonEmptyString('  hello  ')).toBe(true);
      });
    });

    describe('isPositiveInteger', () => {
      it('should return true for positive integers', () => {
        expect(isPositiveInteger(1)).toBe(true);
        expect(isPositiveInteger(100)).toBe(true);
        expect(isPositiveInteger(999999)).toBe(true);
      });

      it('should return false for zero', () => {
        expect(isPositiveInteger(0)).toBe(false);
      });

      it('should return false for negative numbers', () => {
        expect(isPositiveInteger(-1)).toBe(false);
        expect(isPositiveInteger(-100)).toBe(false);
      });

      it('should return false for decimals', () => {
        expect(isPositiveInteger(1.5)).toBe(false);
        expect(isPositiveInteger(0.1)).toBe(false);
      });

      it('should return false for non-numbers', () => {
        expect(isPositiveInteger('1')).toBe(false);
        expect(isPositiveInteger(null)).toBe(false);
      });
    });

    describe('isNonNegativeInteger', () => {
      it('should return true for zero', () => {
        expect(isNonNegativeInteger(0)).toBe(true);
      });

      it('should return true for positive integers', () => {
        expect(isNonNegativeInteger(1)).toBe(true);
        expect(isNonNegativeInteger(100)).toBe(true);
      });

      it('should return false for negative numbers', () => {
        expect(isNonNegativeInteger(-1)).toBe(false);
      });

      it('should return false for decimals', () => {
        expect(isNonNegativeInteger(1.5)).toBe(false);
      });
    });

    describe('isValidDate', () => {
      it('should return true for valid Date', () => {
        expect(isValidDate(new Date())).toBe(true);
        expect(isValidDate(new Date('2024-01-15'))).toBe(true);
      });

      it('should return false for invalid Date', () => {
        expect(isValidDate(new Date('invalid'))).toBe(false);
      });

      it('should return false for non-Date', () => {
        expect(isValidDate('2024-01-15')).toBe(false);
        expect(isValidDate(1234567890)).toBe(false);
      });
    });

    describe('isISODateString', () => {
      it('should return true for ISO date strings', () => {
        expect(isISODateString('2024-01-15T10:30:00.000Z')).toBe(true);
      });

      it('should return false for non-ISO format', () => {
        expect(isISODateString('2024-01-15')).toBe(false);
        expect(isISODateString('15/01/2024')).toBe(false);
      });

      it('should return false for invalid date', () => {
        expect(isISODateString('invalid')).toBe(false);
      });

      it('should return false for non-string', () => {
        expect(isISODateString(123)).toBe(false);
      });
    });

    describe('isValidUrl', () => {
      it('should return true for valid URLs', () => {
        expect(isValidUrl('https://example.com')).toBe(true);
        expect(isValidUrl('http://localhost:3000')).toBe(true);
        expect(isValidUrl('https://example.com/path?query=value')).toBe(true);
      });

      it('should return false for invalid URLs', () => {
        expect(isValidUrl('not-a-url')).toBe(false);
        expect(isValidUrl('example.com')).toBe(false);
      });

      it('should return false for non-string', () => {
        expect(isValidUrl(123)).toBe(false);
      });
    });

    describe('isValidEmail', () => {
      it('should return true for valid emails', () => {
        expect(isValidEmail('test@example.com')).toBe(true);
        expect(isValidEmail('user.name@domain.co.uk')).toBe(true);
        expect(isValidEmail('user+tag@example.com')).toBe(true);
      });

      it('should return false for invalid emails', () => {
        expect(isValidEmail('invalid')).toBe(false);
        expect(isValidEmail('invalid@')).toBe(false);
        expect(isValidEmail('@example.com')).toBe(false);
        expect(isValidEmail('test@')).toBe(false);
      });

      it('should return false for non-string', () => {
        expect(isValidEmail(123)).toBe(false);
      });
    });

    describe('isValidPhone', () => {
      it('should return true for valid phone numbers', () => {
        expect(isValidPhone('+40700000001')).toBe(true);
        expect(isValidPhone('+14155551234')).toBe(true);
      });

      it('should return true with formatting', () => {
        expect(isValidPhone('+1 (415) 555-1234')).toBe(true);
        expect(isValidPhone('+40 700 000 001')).toBe(true);
      });

      it('should return false for invalid phone numbers', () => {
        expect(isValidPhone('123')).toBe(false);
        expect(isValidPhone('invalid')).toBe(false);
      });

      it('should return false for non-string', () => {
        expect(isValidPhone(123)).toBe(false);
      });
    });

    describe('isE164Phone', () => {
      it('should return true for E.164 format', () => {
        expect(isE164Phone('+40700000001')).toBe(true);
        expect(isE164Phone('+14155551234')).toBe(true);
      });

      it('should return false for non-E.164 format', () => {
        expect(isE164Phone('40700000001')).toBe(false);
        expect(isE164Phone('+0700000001')).toBe(false);
        expect(isE164Phone('+40 700 000 001')).toBe(false);
      });
    });

    describe('isUUID', () => {
      it('should return true for valid UUIDs', () => {
        expect(isUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
        expect(isUUID('A1B2C3D4-E5F6-7890-ABCD-EF1234567890')).toBe(true);
      });

      it('should return false for invalid UUIDs', () => {
        expect(isUUID('not-a-uuid')).toBe(false);
        expect(isUUID('550e8400e29b41d4a716446655440000')).toBe(false);
        expect(isUUID('550e8400-e29b-41d4-a716')).toBe(false);
      });

      it('should return false for non-string', () => {
        expect(isUUID(123)).toBe(false);
      });
    });
  });

  describe('integration-specific guards', () => {
    describe('isHubSpotContact', () => {
      it('should return true for valid HubSpot contact', () => {
        const contact = {
          id: '12345',
          properties: { email: 'test@example.com', firstname: 'John' },
        };
        expect(isHubSpotContact(contact)).toBe(true);
      });

      it('should return false for missing id', () => {
        expect(isHubSpotContact({ properties: {} })).toBe(false);
      });

      it('should return false for missing properties', () => {
        expect(isHubSpotContact({ id: '123' })).toBe(false);
      });

      it('should return false for non-object', () => {
        expect(isHubSpotContact('invalid')).toBe(false);
      });
    });

    describe('isWhatsAppMessage', () => {
      it('should return true for valid WhatsApp message', () => {
        const message = {
          id: 'wamid.123',
          from: '40700000001',
          timestamp: '1234567890',
          type: 'text',
          text: { body: 'Hello' },
        };
        expect(isWhatsAppMessage(message)).toBe(true);
      });

      it('should return true without text field', () => {
        const message = {
          id: 'wamid.123',
          from: '40700000001',
          timestamp: '1234567890',
          type: 'image',
        };
        expect(isWhatsAppMessage(message)).toBe(true);
      });

      it('should return false for missing required fields', () => {
        expect(isWhatsAppMessage({ id: '123', from: '456' })).toBe(false);
      });
    });

    describe('isVapiCall', () => {
      it('should return true for inbound call', () => {
        const call = {
          id: 'call-123',
          status: 'completed',
          type: 'inbound' as const,
        };
        expect(isVapiCall(call)).toBe(true);
      });

      it('should return true for outbound call', () => {
        const call = {
          id: 'call-456',
          status: 'in-progress',
          type: 'outbound' as const,
        };
        expect(isVapiCall(call)).toBe(true);
      });

      it('should return false for invalid type', () => {
        expect(isVapiCall({ id: '123', status: 'active', type: 'other' })).toBe(false);
      });
    });

    describe('isStripeCharge', () => {
      it('should return true for valid Stripe charge', () => {
        const charge = {
          id: 'ch_123',
          amount: 5000,
          currency: 'usd',
          status: 'succeeded',
        };
        expect(isStripeCharge(charge)).toBe(true);
      });

      it('should return false for missing fields', () => {
        expect(isStripeCharge({ id: 'ch_123', amount: 5000 })).toBe(false);
      });
    });
  });

  describe('discriminated union guards', () => {
    describe('hasTag', () => {
      it('should return true for matching tag', () => {
        const obj = { _tag: 'Success', value: 123 };
        expect(hasTag(obj, 'Success')).toBe(true);
      });

      it('should return false for non-matching tag', () => {
        const obj = { _tag: 'Success', value: 123 };
        expect(hasTag(obj, 'Error')).toBe(false);
      });

      it('should return false for missing tag', () => {
        expect(hasTag({ value: 123 }, 'Success')).toBe(false);
      });
    });

    describe('hasType', () => {
      it('should return true for matching type', () => {
        const obj = { type: 'user', name: 'John' };
        expect(hasType(obj, 'user')).toBe(true);
      });

      it('should return false for non-matching type', () => {
        const obj = { type: 'user', name: 'John' };
        expect(hasType(obj, 'admin')).toBe(false);
      });
    });

    describe('hasKind', () => {
      it('should return true for matching kind', () => {
        const obj = { kind: 'circle', radius: 10 };
        expect(hasKind(obj, 'circle')).toBe(true);
      });

      it('should return false for non-matching kind', () => {
        const obj = { kind: 'circle', radius: 10 };
        expect(hasKind(obj, 'square')).toBe(false);
      });
    });
  });

  describe('exhaustive pattern matching', () => {
    describe('assertNever', () => {
      it('should throw error', () => {
        expect(() => assertNever('value' as never)).toThrow();
      });

      it('should include value in error message', () => {
        try {
          assertNever('test-value' as never);
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as Error).message).toContain('test-value');
        }
      });

      it('should use custom message', () => {
        try {
          assertNever('value' as never, 'Custom error');
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as Error).message).toBe('Custom error');
        }
      });
    });

    describe('exhaustiveMatch', () => {
      it('should match on tag', () => {
        type Result = { _tag: 'Ok'; value: number } | { _tag: 'Err'; error: string };

        const ok: Result = { _tag: 'Ok', value: 42 };
        const result = exhaustiveMatch(ok, {
          Ok: ({ value }) => `Success: ${value}`,
          Err: ({ error }) => `Error: ${error}`,
        });

        expect(result).toBe('Success: 42');
      });

      it('should handle all variants', () => {
        type Status = { _tag: 'pending' } | { _tag: 'active' } | { _tag: 'completed' };

        const status: Status = { _tag: 'completed' };
        const result = exhaustiveMatch(status, {
          pending: () => 'Waiting',
          active: () => 'In Progress',
          completed: () => 'Done',
        });

        expect(result).toBe('Done');
      });

      it('should throw for missing matcher', () => {
        type Result = { _tag: 'Ok'; value: number } | { _tag: 'Err'; error: string };
        const ok: Result = { _tag: 'Ok', value: 42 };

        // Remove a matcher to simulate missing case
        const matchers = { Err: () => 'error' } as any;

        expect(() => exhaustiveMatch(ok, matchers)).toThrow('No matcher for tag: Ok');
      });
    });

    describe('matchWithDefault', () => {
      it('should match existing tag', () => {
        type Result = { _tag: 'Ok'; value: number } | { _tag: 'Err'; error: string };
        const ok: Result = { _tag: 'Ok', value: 42 };

        const result = matchWithDefault(
          ok,
          {
            Ok: ({ value }) => `Success: ${value}`,
          },
          'Unknown'
        );

        expect(result).toBe('Success: 42');
      });

      it('should use default for missing matcher', () => {
        type Result = { _tag: 'Ok'; value: number } | { _tag: 'Err'; error: string };
        const err: Result = { _tag: 'Err', error: 'failed' };

        const result = matchWithDefault(
          err,
          {
            Ok: ({ value }) => `Success: ${value}`,
          },
          'Unknown'
        );

        expect(result).toBe('Unknown');
      });

      it('should use default function', () => {
        type Result = { _tag: 'Ok'; value: number } | { _tag: 'Err'; error: string };
        const err: Result = { _tag: 'Err', error: 'failed' };

        const result = matchWithDefault(
          err,
          {
            Ok: ({ value }) => `Success: ${value}`,
          },
          (val) => `Unhandled: ${val._tag}`
        );

        expect(result).toBe('Unhandled: Err');
      });
    });
  });

  describe('runtime assertions', () => {
    describe('AssertionError', () => {
      it('should create error with message', () => {
        const error = new AssertionError('Test failed', 'actual', 'expected');

        expect(error.message).toBe('Test failed');
        expect(error.actual).toBe('actual');
        expect(error.expected).toBe('expected');
        expect(error.name).toBe('AssertionError');
      });
    });

    describe('assert', () => {
      it('should not throw for true condition', () => {
        expect(() => assert(true, 'Should not throw')).not.toThrow();
        expect(() => assert(1 === 1, 'Math works')).not.toThrow();
      });

      it('should throw for false condition', () => {
        expect(() => assert(false, 'Should throw')).toThrow(AssertionError);
      });

      it('should include message in error', () => {
        try {
          assert(false, 'Custom message');
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as AssertionError).message).toBe('Custom message');
        }
      });
    });

    describe('assertDefined', () => {
      it('should not throw for defined values', () => {
        expect(() => assertDefined('value')).not.toThrow();
        expect(() => assertDefined(0)).not.toThrow();
        expect(() => assertDefined(false)).not.toThrow();
        expect(() => assertDefined('')).not.toThrow();
      });

      it('should throw for null', () => {
        expect(() => assertDefined(null)).toThrow(AssertionError);
      });

      it('should throw for undefined', () => {
        expect(() => assertDefined(undefined)).toThrow(AssertionError);
      });

      it('should use custom message', () => {
        try {
          assertDefined(null, 'Value must be present');
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as AssertionError).message).toBe('Value must be present');
        }
      });
    });

    describe('assertNonEmptyString', () => {
      it('should not throw for non-empty strings', () => {
        expect(() => assertNonEmptyString('hello')).not.toThrow();
      });

      it('should throw for empty string', () => {
        expect(() => assertNonEmptyString('')).toThrow(AssertionError);
      });

      it('should throw for whitespace-only', () => {
        expect(() => assertNonEmptyString('   ')).toThrow(AssertionError);
      });

      it('should throw for non-string', () => {
        expect(() => assertNonEmptyString(123 as any)).toThrow(AssertionError);
      });
    });

    describe('assertPositiveInteger', () => {
      it('should not throw for positive integers', () => {
        expect(() => assertPositiveInteger(1)).not.toThrow();
        expect(() => assertPositiveInteger(999)).not.toThrow();
      });

      it('should throw for zero', () => {
        expect(() => assertPositiveInteger(0)).toThrow(AssertionError);
      });

      it('should throw for negative', () => {
        expect(() => assertPositiveInteger(-1)).toThrow(AssertionError);
      });

      it('should throw for decimal', () => {
        expect(() => assertPositiveInteger(1.5)).toThrow(AssertionError);
      });
    });

    describe('assertSchema', () => {
      it('should not throw for valid data', () => {
        const schema = z.object({ name: z.string(), age: z.number() });
        const data = { name: 'John', age: 30 };

        expect(() => assertSchema(schema, data)).not.toThrow();
      });

      it('should throw for invalid data', () => {
        const schema = z.object({ name: z.string(), age: z.number() });
        const data = { name: 'John', age: 'thirty' };

        expect(() => assertSchema(schema, data)).toThrow(AssertionError);
      });

      it('should include validation errors in message', () => {
        const schema = z.object({ email: z.string().email() });
        const data = { email: 'not-an-email' };

        try {
          assertSchema(schema, data);
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as AssertionError).message).toContain('email');
        }
      });
    });
  });

  describe('safe property access', () => {
    describe('getProperty', () => {
      it('should get existing property', () => {
        const obj = { name: 'John', age: 30 };
        expect(getProperty(obj, 'name')).toBe('John');
        expect(getProperty(obj, 'age')).toBe(30);
      });

      it('should return undefined for missing property', () => {
        const obj = { name: 'John' };
        expect(getProperty(obj, 'age')).toBeUndefined();
      });

      it('should return undefined for non-object', () => {
        expect(getProperty('string', 'prop')).toBeUndefined();
        expect(getProperty(null, 'prop')).toBeUndefined();
      });
    });

    describe('getNestedProperty', () => {
      it('should get nested property', () => {
        const obj = { user: { profile: { name: 'John' } } };
        expect(getNestedProperty(obj, ['user', 'profile', 'name'])).toBe('John');
      });

      it('should return undefined for missing nested property', () => {
        const obj = { user: { profile: {} } };
        expect(getNestedProperty(obj, ['user', 'profile', 'name'])).toBeUndefined();
      });

      it('should return undefined when path breaks', () => {
        const obj = { user: null };
        expect(getNestedProperty(obj, ['user', 'profile', 'name'])).toBeUndefined();
      });

      it('should handle empty path', () => {
        const obj = { name: 'John' };
        expect(getNestedProperty(obj, [])).toEqual(obj);
      });
    });

    describe('getPropertyGuarded', () => {
      it('should get property with type guard', () => {
        const obj = { name: 'John', age: 30 };
        const result = getPropertyGuarded(obj, 'name', isNonEmptyString);

        expect(result).toBe('John');
      });

      it('should return undefined when guard fails', () => {
        const obj = { name: '', age: 30 };
        const result = getPropertyGuarded(obj, 'name', isNonEmptyString);

        expect(result).toBeUndefined();
      });

      it('should return undefined for missing property', () => {
        const obj = { age: 30 };
        const result = getPropertyGuarded(obj, 'name', isNonEmptyString);

        expect(result).toBeUndefined();
      });
    });
  });

  describe('array guards', () => {
    describe('isNonEmptyArray', () => {
      it('should return true for non-empty array', () => {
        expect(isNonEmptyArray([1, 2, 3])).toBe(true);
        expect(isNonEmptyArray(['a'])).toBe(true);
      });

      it('should return false for empty array', () => {
        expect(isNonEmptyArray([])).toBe(false);
      });

      it('should return false for non-array', () => {
        expect(isNonEmptyArray('string')).toBe(false);
        expect(isNonEmptyArray(null)).toBe(false);
      });
    });

    describe('isArrayOf', () => {
      it('should return true when all elements match guard', () => {
        expect(isArrayOf([1, 2, 3], (x): x is number => typeof x === 'number')).toBe(true);
        expect(isArrayOf(['a', 'b'], (x): x is string => typeof x === 'string')).toBe(true);
      });

      it('should return false when any element fails guard', () => {
        expect(isArrayOf([1, 2, 'three'], (x): x is number => typeof x === 'number')).toBe(false);
      });

      it('should return true for empty array', () => {
        expect(isArrayOf([], (x): x is number => typeof x === 'number')).toBe(true);
      });

      it('should return false for non-array', () => {
        expect(isArrayOf('string', (x): x is string => typeof x === 'string')).toBe(false);
      });
    });

    describe('hasLength', () => {
      it('should return true for matching length', () => {
        expect(hasLength([1, 2, 3], 3)).toBe(true);
        expect(hasLength([], 0)).toBe(true);
      });

      it('should return false for non-matching length', () => {
        expect(hasLength([1, 2], 3)).toBe(false);
      });

      it('should return false for non-array', () => {
        expect(hasLength('string', 6)).toBe(false);
      });
    });

    describe('hasMinLength', () => {
      it('should return true when length meets minimum', () => {
        expect(hasMinLength([1, 2, 3], 2)).toBe(true);
        expect(hasMinLength([1, 2, 3], 3)).toBe(true);
      });

      it('should return false when length is below minimum', () => {
        expect(hasMinLength([1], 2)).toBe(false);
      });

      it('should return true for empty array with minLength 0', () => {
        expect(hasMinLength([], 0)).toBe(true);
      });
    });
  });

  describe('webhook payload guards', () => {
    describe('isHubSpotWebhookPayload', () => {
      it('should return true for valid payload', () => {
        const payload = [
          {
            eventId: 123,
            subscriptionId: 456,
            portalId: 789,
            occurredAt: 1234567890,
            subscriptionType: 'contact.creation',
            attemptNumber: 1,
            objectId: 999,
          },
        ];

        expect(isHubSpotWebhookPayload(payload)).toBe(true);
      });

      it('should return false for invalid payload', () => {
        expect(isHubSpotWebhookPayload({})).toBe(false);
        expect(isHubSpotWebhookPayload('invalid')).toBe(false);
      });
    });

    describe('isWhatsAppWebhookPayload', () => {
      it('should return true for valid payload', () => {
        const payload = {
          object: 'whatsapp_business_account',
          entry: [
            {
              id: '123',
              changes: [
                {
                  value: {
                    messaging_product: 'whatsapp',
                    metadata: {
                      display_phone_number: '+40700000001',
                      phone_number_id: '123456',
                    },
                  },
                  field: 'messages',
                },
              ],
            },
          ],
        };

        expect(isWhatsAppWebhookPayload(payload)).toBe(true);
      });

      it('should return false for invalid payload', () => {
        expect(isWhatsAppWebhookPayload({})).toBe(false);
      });
    });

    describe('isStripeWebhookPayload', () => {
      it('should return true for valid payload', () => {
        const payload = {
          id: 'evt_123',
          object: 'event',
          type: 'charge.succeeded',
          created: 1234567890,
          data: { object: { id: 'ch_123' } },
          livemode: false,
          pending_webhooks: 0,
          request: null,
        };

        expect(isStripeWebhookPayload(payload)).toBe(true);
      });

      it('should return false for invalid payload', () => {
        expect(isStripeWebhookPayload({})).toBe(false);
      });
    });
  });

  describe('validation utilities', () => {
    describe('validate', () => {
      it('should return ok result for valid data', () => {
        const schema = z.object({ name: z.string() });
        const result = validate(schema, { name: 'John' });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.value).toEqual({ name: 'John' });
        }
      });

      it('should return fail result for invalid data', () => {
        const schema = z.object({ name: z.string() });
        const result = validate(schema, { name: 123 });

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.errors?.length).toBeGreaterThan(0);
        }
      });
    });

    describe('validateOrThrow', () => {
      it('should return parsed data for valid input', () => {
        const schema = z.object({ name: z.string() });
        const result = validateOrThrow(schema, { name: 'John' });

        expect(result).toEqual({ name: 'John' });
      });

      it('should throw for invalid input', () => {
        const schema = z.object({ name: z.string() });

        expect(() => validateOrThrow(schema, { name: 123 })).toThrow();
      });

      it('should use custom error message', () => {
        const schema = z.object({ name: z.string() });

        try {
          validateOrThrow(schema, { name: 123 }, 'Custom error');
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as Error).message).toBe('Custom error');
        }
      });
    });

    describe('validateWithErrors', () => {
      it('should return success for valid data', () => {
        const schema = z.object({ name: z.string() });
        const result = validateWithErrors(schema, { name: 'John' }, (err) => err.message);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toEqual({ name: 'John' });
        }
      });

      it('should transform errors for invalid data', () => {
        const schema = z.object({ name: z.string() });
        const result = validateWithErrors(schema, { name: 123 }, (err) => `Custom: ${err.message}`);

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toContain('Custom:');
        }
      });
    });
  });

  describe('type narrowing utilities', () => {
    describe('toNonEmptyArray', () => {
      it('should return array for non-empty input', () => {
        const result = toNonEmptyArray([1, 2, 3]);

        expect(result).toEqual([1, 2, 3]);
      });

      it('should return null for empty array', () => {
        expect(toNonEmptyArray([])).toBeNull();
      });
    });

    describe('toNonEmptyString', () => {
      it('should return string for non-empty input', () => {
        expect(toNonEmptyString('hello')).toBe('hello');
      });

      it('should trim whitespace', () => {
        expect(toNonEmptyString('  hello  ')).toBe('hello');
      });

      it('should return null for empty string', () => {
        expect(toNonEmptyString('')).toBeNull();
      });

      it('should return null for whitespace-only', () => {
        expect(toNonEmptyString('   ')).toBeNull();
      });
    });

    describe('filterMap', () => {
      it('should filter and map array', () => {
        const result = filterMap([1, 2, 3, 4], (x) => (x % 2 === 0 ? x * 2 : null));

        expect(result).toEqual([4, 8]);
      });

      it('should handle empty array', () => {
        const result = filterMap([], (x) => x);

        expect(result).toEqual([]);
      });

      it('should filter out undefined', () => {
        const result = filterMap([1, 2, 3], (x) => (x === 2 ? undefined : x * 2));

        expect(result).toEqual([2, 6]);
      });
    });

    describe('partition', () => {
      it('should partition array by predicate', () => {
        const isEven = (x: number): x is number => x % 2 === 0;
        const [evens, odds] = partition([1, 2, 3, 4, 5], isEven);

        expect(evens).toEqual([2, 4]);
        expect(odds).toEqual([1, 3, 5]);
      });

      it('should handle empty array', () => {
        const [pass, fail] = partition([], (x): x is number => typeof x === 'number');

        expect(pass).toEqual([]);
        expect(fail).toEqual([]);
      });

      it('should handle all pass', () => {
        const [pass, fail] = partition([1, 2, 3], (x): x is number => typeof x === 'number');

        expect(pass).toEqual([1, 2, 3]);
        expect(fail).toEqual([]);
      });

      it('should handle all fail', () => {
        const [pass, fail] = partition([1, 2, 3], (): false => false);

        expect(pass).toEqual([]);
        expect(fail.length).toBe(3);
      });
    });
  });
});
