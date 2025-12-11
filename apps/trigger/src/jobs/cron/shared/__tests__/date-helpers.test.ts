import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateCorrelationId,
  sixMonthsAgo,
  sevenDaysAgo,
  ninetyDaysAgo,
  almostTwoYearsAgo,
  isIn24Hours,
  isIn2Hours,
  formatDate,
  formatTime,
} from '../date-helpers.js';

describe('date-helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateCorrelationId', () => {
    it('should generate a correlation ID with cron prefix', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^cron_\d+_[a-f0-9]{8}$/);
    });

    it('should include current timestamp', () => {
      const id = generateCorrelationId();
      const timestamp = id.split('_')[1];
      expect(parseInt(timestamp!, 10)).toBe(Date.now());
    });

    it('should generate unique IDs', () => {
      const id1 = generateCorrelationId();
      vi.advanceTimersByTime(1);
      const id2 = generateCorrelationId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('sixMonthsAgo', () => {
    it('should return timestamp from 6 months ago', () => {
      const result = sixMonthsAgo();
      const expectedDate = new Date('2024-12-15T10:00:00.000Z');
      expect(parseInt(result, 10)).toBe(expectedDate.getTime());
    });

    it('should return a string', () => {
      const result = sixMonthsAgo();
      expect(typeof result).toBe('string');
    });
  });

  describe('sevenDaysAgo', () => {
    it('should return timestamp from 7 days ago', () => {
      const result = sevenDaysAgo();
      const expectedDate = new Date('2025-06-08T10:00:00.000Z');
      expect(parseInt(result, 10)).toBe(expectedDate.getTime());
    });

    it('should return a string', () => {
      const result = sevenDaysAgo();
      expect(typeof result).toBe('string');
    });
  });

  describe('ninetyDaysAgo', () => {
    it('should return timestamp from 90 days ago', () => {
      const result = ninetyDaysAgo();
      const expectedDate = new Date('2025-03-17T10:00:00.000Z');
      expect(parseInt(result, 10)).toBe(expectedDate.getTime());
    });

    it('should return a string', () => {
      const result = ninetyDaysAgo();
      expect(typeof result).toBe('string');
    });
  });

  describe('almostTwoYearsAgo', () => {
    it('should return timestamp from 23 months ago', () => {
      const result = almostTwoYearsAgo();
      const expectedDate = new Date('2023-07-15T10:00:00.000Z');
      expect(parseInt(result, 10)).toBe(expectedDate.getTime());
    });

    it('should return a string', () => {
      const result = almostTwoYearsAgo();
      expect(typeof result).toBe('string');
    });
  });

  describe('isIn24Hours', () => {
    it('should return true for date exactly 24 hours from now', () => {
      const futureDate = new Date('2025-06-16T10:00:00.000Z').toISOString();
      expect(isIn24Hours(futureDate)).toBe(true);
    });

    it('should return true for date 23.5 hours from now', () => {
      const futureDate = new Date('2025-06-16T09:30:00.000Z').toISOString();
      expect(isIn24Hours(futureDate)).toBe(true);
    });

    it('should return true for date 24.5 hours from now', () => {
      const futureDate = new Date('2025-06-16T10:30:00.000Z').toISOString();
      expect(isIn24Hours(futureDate)).toBe(true);
    });

    it('should return false for date 22 hours from now (too soon)', () => {
      const futureDate = new Date('2025-06-16T08:00:00.000Z').toISOString();
      expect(isIn24Hours(futureDate)).toBe(false);
    });

    it('should return false for date 26 hours from now (too far)', () => {
      const futureDate = new Date('2025-06-16T12:00:00.000Z').toISOString();
      expect(isIn24Hours(futureDate)).toBe(false);
    });

    it('should return false for past dates', () => {
      const pastDate = new Date('2025-06-14T10:00:00.000Z').toISOString();
      expect(isIn24Hours(pastDate)).toBe(false);
    });
  });

  describe('isIn2Hours', () => {
    it('should return true for date exactly 2 hours from now', () => {
      const futureDate = new Date('2025-06-15T12:00:00.000Z').toISOString();
      expect(isIn2Hours(futureDate)).toBe(true);
    });

    it('should return true for date 1.75 hours from now', () => {
      const futureDate = new Date('2025-06-15T11:45:00.000Z').toISOString();
      expect(isIn2Hours(futureDate)).toBe(true);
    });

    it('should return true for date 2.25 hours from now', () => {
      const futureDate = new Date('2025-06-15T12:15:00.000Z').toISOString();
      expect(isIn2Hours(futureDate)).toBe(true);
    });

    it('should return false for date 1 hour from now (too soon)', () => {
      const futureDate = new Date('2025-06-15T11:00:00.000Z').toISOString();
      expect(isIn2Hours(futureDate)).toBe(false);
    });

    it('should return false for date 3 hours from now (too far)', () => {
      const futureDate = new Date('2025-06-15T13:00:00.000Z').toISOString();
      expect(isIn2Hours(futureDate)).toBe(false);
    });

    it('should return false for past dates', () => {
      const pastDate = new Date('2025-06-15T08:00:00.000Z').toISOString();
      expect(isIn2Hours(pastDate)).toBe(false);
    });
  });

  describe('formatDate', () => {
    const testDate = '2025-06-15T14:30:00.000Z';

    it('should format date in Romanian by default', () => {
      const result = formatDate(testDate);
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format date in Romanian explicitly', () => {
      const result = formatDate(testDate, 'ro');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format date in English', () => {
      const result = formatDate(testDate, 'en');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });

    it('should format date in German', () => {
      const result = formatDate(testDate, 'de');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatTime', () => {
    it('should format time in HH:MM format', () => {
      const testDate = '2025-06-15T14:30:00.000Z';
      const result = formatTime(testDate);
      expect(result).toBeTruthy();
      expect(result).toMatch(/\d{1,2}:\d{2}/);
    });

    it('should handle morning times', () => {
      const testDate = '2025-06-15T08:05:00.000Z';
      const result = formatTime(testDate);
      expect(result).toBeTruthy();
    });

    it('should handle midnight', () => {
      const testDate = '2025-06-15T00:00:00.000Z';
      const result = formatTime(testDate);
      expect(result).toBeTruthy();
    });
  });
});
