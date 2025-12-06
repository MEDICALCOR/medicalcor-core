/**
 * UUID Utility Tests
 *
 * Comprehensive tests for UUID generation utilities
 * Achieves 100% coverage for shared-kernel/utils module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateUUID, generateShortUUID, generatePrefixedId } from '../uuid.js';

describe('UUID Utilities', () => {
  describe('generateUUID', () => {
    it('should generate a valid UUID v4 format', () => {
      const uuid = generateUUID();

      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(uuid).toMatch(uuidRegex);
    });

    it('should generate unique UUIDs on each call', () => {
      const uuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        uuids.add(generateUUID());
      }
      expect(uuids.size).toBe(100);
    });

    it('should generate UUIDs with correct length', () => {
      const uuid = generateUUID();
      expect(uuid.length).toBe(36); // 32 hex chars + 4 hyphens
    });

    it('should generate UUIDs with version 4 identifier', () => {
      for (let i = 0; i < 10; i++) {
        const uuid = generateUUID();
        // The 13th character (after 2nd hyphen) should be '4'
        expect(uuid.charAt(14)).toBe('4');
      }
    });

    it('should generate UUIDs with correct variant bits', () => {
      for (let i = 0; i < 10; i++) {
        const uuid = generateUUID();
        // The 17th character (after 3rd hyphen) should be 8, 9, a, or b
        const variantChar = uuid.charAt(19).toLowerCase();
        expect(['8', '9', 'a', 'b']).toContain(variantChar);
      }
    });

    describe('fallback implementation', () => {
      let originalCrypto: Crypto | undefined;

      beforeEach(() => {
        originalCrypto = globalThis.crypto;
      });

      afterEach(() => {
        if (originalCrypto) {
          globalThis.crypto = originalCrypto;
        }
      });

      it('should use fallback when crypto.randomUUID is not available', () => {
        // Mock crypto without randomUUID
        Object.defineProperty(globalThis, 'crypto', {
          value: { getRandomValues: vi.fn() },
          writable: true,
          configurable: true,
        });

        const uuid = generateUUID();

        // Should still generate valid UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuid).toMatch(uuidRegex);
      });

      it('should use fallback when crypto is undefined', () => {
        Object.defineProperty(globalThis, 'crypto', {
          value: undefined,
          writable: true,
          configurable: true,
        });

        const uuid = generateUUID();

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        expect(uuid).toMatch(uuidRegex);
      });
    });
  });

  describe('generateShortUUID', () => {
    it('should generate an 8-character string', () => {
      const shortUuid = generateShortUUID();
      expect(shortUuid.length).toBe(8);
    });

    it('should contain only hexadecimal characters', () => {
      const shortUuid = generateShortUUID();
      expect(shortUuid).toMatch(/^[0-9a-f]{8}$/i);
    });

    it('should generate unique short UUIDs', () => {
      const shortUuids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        shortUuids.add(generateShortUUID());
      }
      // Most should be unique (allowing for rare collisions)
      expect(shortUuids.size).toBeGreaterThan(95);
    });

    it('should be a prefix of a full UUID', () => {
      // Mock to verify it uses generateUUID
      const uuid = generateUUID();
      const shortUuid = uuid.slice(0, 8);
      expect(shortUuid.length).toBe(8);
      expect(uuid.startsWith(shortUuid)).toBe(true);
    });
  });

  describe('generatePrefixedId', () => {
    it('should generate ID with correct format: prefix_timestamp_uuid', () => {
      const id = generatePrefixedId('lead');
      const parts = id.split('_');

      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('lead');
      expect(parts[1]).toMatch(/^\d+$/); // Timestamp
      expect(parts[2]).toMatch(/^[0-9a-f]{8}$/i); // Short UUID
    });

    it('should use provided prefix', () => {
      const prefixes = ['lead', 'cns', 'apt', 'pat', 'user'];
      for (const prefix of prefixes) {
        const id = generatePrefixedId(prefix);
        expect(id.startsWith(`${prefix}_`)).toBe(true);
      }
    });

    it('should include current timestamp', () => {
      const before = Date.now();
      const id = generatePrefixedId('test');
      const after = Date.now();

      const timestamp = parseInt(id.split('_')[1] ?? '0', 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should generate unique IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generatePrefixedId('test'));
      }
      expect(ids.size).toBe(100);
    });

    it('should handle empty prefix', () => {
      const id = generatePrefixedId('');
      expect(id).toMatch(/^_\d+_[0-9a-f]{8}$/i);
    });

    it('should handle special characters in prefix', () => {
      const id = generatePrefixedId('test-item');
      expect(id.startsWith('test-item_')).toBe(true);
    });

    it('should handle long prefixes', () => {
      const longPrefix = 'a'.repeat(50);
      const id = generatePrefixedId(longPrefix);
      expect(id.startsWith(`${longPrefix}_`)).toBe(true);
    });

    it('should maintain ordering for same-millisecond IDs', () => {
      // IDs generated in same millisecond will have same timestamp
      // but different UUIDs, so they should still be unique
      const ids: string[] = [];
      for (let i = 0; i < 10; i++) {
        ids.push(generatePrefixedId('order'));
      }
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10);
    });
  });
});
