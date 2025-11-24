import { describe, it, expect } from 'vitest';
import { cn, getScoreColor, getClassificationColor } from '@/lib/utils';

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
});
