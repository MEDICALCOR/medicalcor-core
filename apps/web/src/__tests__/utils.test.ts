import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  cn,
  getScoreColor,
  getClassificationColor,
  formatDate,
  formatDateTime,
  formatRelativeTime,
} from '../lib/utils';

describe('utils', () => {
  describe('cn', () => {
    it('should merge class names', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('should handle conditional classes', () => {
      expect(cn('base', true && 'active', false && 'hidden')).toBe('base active');
    });

    it('should merge tailwind classes correctly', () => {
      expect(cn('p-4', 'p-2')).toBe('p-2');
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });

    it('should handle empty inputs', () => {
      expect(cn()).toBe('');
      expect(cn(null, undefined, '')).toBe('');
    });
  });

  describe('getScoreColor', () => {
    it('should return status-hot for scores >= 4', () => {
      expect(getScoreColor(4)).toBe('status-hot');
      expect(getScoreColor(5)).toBe('status-hot');
    });

    it('should return status-warm for scores >= 3', () => {
      expect(getScoreColor(3)).toBe('status-warm');
      expect(getScoreColor(3.5)).toBe('status-warm');
    });

    it('should return status-cold for scores < 3', () => {
      expect(getScoreColor(2)).toBe('status-cold');
      expect(getScoreColor(0)).toBe('status-cold');
    });
  });

  describe('getClassificationColor', () => {
    it('should return correct colors for each classification', () => {
      expect(getClassificationColor('HOT')).toBe('status-hot');
      expect(getClassificationColor('WARM')).toBe('status-warm');
      expect(getClassificationColor('COLD')).toBe('status-cold');
    });

    it('should return default color for unknown classification', () => {
      expect(getClassificationColor('UNKNOWN')).toBe('bg-gray-100 text-gray-800');
    });
  });

  describe('formatDate', () => {
    it('should format Date object with default locale (ro-RO)', () => {
      const date = new Date('2024-01-15T10:30:00');
      const formatted = formatDate(date);
      expect(formatted).toContain('15');
      expect(formatted).toContain('2024');
    });

    it('should format date string', () => {
      const dateStr = '2024-03-20T14:00:00';
      const formatted = formatDate(dateStr);
      expect(formatted).toContain('20');
      expect(formatted).toContain('2024');
    });

    it('should accept custom locale', () => {
      const date = new Date('2024-01-15T10:30:00');
      const formatted = formatDate(date, 'en-US');
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });
  });

  describe('formatDateTime', () => {
    it('should format Date object with time', () => {
      const date = new Date('2024-01-15T10:30:00');
      const formatted = formatDateTime(date);
      expect(formatted).toContain('15');
      expect(formatted).toContain('2024');
      expect(formatted).toContain('10');
      expect(formatted).toContain('30');
    });

    it('should format date string with time', () => {
      const dateStr = '2024-03-20T14:25:00';
      const formatted = formatDateTime(dateStr);
      expect(formatted).toBeDefined();
      expect(typeof formatted).toBe('string');
    });

    it('should accept custom locale', () => {
      const date = new Date('2024-01-15T10:30:00');
      const formatted = formatDateTime(date, 'en-US');
      expect(formatted).toBeDefined();
    });
  });

  describe('formatRelativeTime', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "acum" for dates less than 60 seconds ago', () => {
      const date = new Date(Date.now() - 30000); // 30 seconds ago
      expect(formatRelativeTime(date)).toBe('acum');
    });

    it('should return minutes for dates less than 1 hour ago', () => {
      const date = new Date(Date.now() - 15 * 60000); // 15 minutes ago
      expect(formatRelativeTime(date)).toBe('acum 15 min');
    });

    it('should return hours for dates less than 24 hours ago', () => {
      const date = new Date(Date.now() - 3 * 3600000); // 3 hours ago
      expect(formatRelativeTime(date)).toBe('acum 3 ore');
    });

    it('should return days for dates less than 7 days ago', () => {
      const date = new Date(Date.now() - 2 * 86400000); // 2 days ago
      expect(formatRelativeTime(date)).toBe('acum 2 zile');
    });

    it('should return formatted date for dates 7+ days ago', () => {
      const date = new Date(Date.now() - 14 * 86400000); // 14 days ago
      const result = formatRelativeTime(date);
      expect(result).toContain('1');
      expect(result).toContain('2024');
    });
  });
});
