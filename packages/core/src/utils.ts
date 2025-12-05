/**
 * Utility functions for the application
 */

import { createLogger } from './logger.js';

const logger = createLogger({ name: 'utils' });

/**
 * Normalize Romanian phone number to E.164 format
 * Supports: 07xx, +40, 0040, with/without spaces/dashes
 *
 * @param phone - Input phone number
 * @returns Object with normalized phone and validity flag
 */
export function normalizeRomanianPhone(phone: string): {
  normalized: string;
  isValid: boolean;
  original: string;
} {
  // Remove all spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-().]/g, '');

  // Romanian mobile prefixes
  const validMobilePrefixes = ['72', '73', '74', '75', '76', '77', '78', '79'];

  let normalized: string;
  let isValid = false;

  if (cleaned.startsWith('+40')) {
    // Already international format: +40xxxxxxxxx
    normalized = cleaned;
    const suffix = cleaned.substring(3);
    isValid = suffix.length === 9 && validMobilePrefixes.some((p) => suffix.startsWith(p));
  } else if (cleaned.startsWith('0040')) {
    // Alternative international: 0040xxxxxxxxx
    normalized = `+40${cleaned.substring(4)}`;
    const suffix = cleaned.substring(4);
    isValid = suffix.length === 9 && validMobilePrefixes.some((p) => suffix.startsWith(p));
  } else if (cleaned.startsWith('40') && cleaned.length === 11) {
    // Without plus: 40xxxxxxxxx
    normalized = `+${cleaned}`;
    const suffix = cleaned.substring(2);
    isValid = suffix.length === 9 && validMobilePrefixes.some((p) => suffix.startsWith(p));
  } else if (cleaned.startsWith('0') && cleaned.length === 10) {
    // National format: 07xxxxxxxx
    normalized = `+40${cleaned.substring(1)}`;
    const suffix = cleaned.substring(1);
    isValid = suffix.length === 9 && validMobilePrefixes.some((p) => suffix.startsWith(p));
  } else if (cleaned.length === 9 && validMobilePrefixes.some((p) => cleaned.startsWith(p))) {
    // Just the suffix: 7xxxxxxxx
    normalized = `+40${cleaned}`;
    isValid = true;
  } else {
    // Unknown format, return as-is
    normalized = cleaned;
    isValid = false;
  }

  return {
    normalized,
    isValid,
    original: phone,
  };
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    shouldRetry?: (error: unknown) => boolean;
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      const delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Sleep for a specified duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an idempotency key from components
 */
export function createIdempotencyKey(...components: string[]): string {
  return components.join(':');
}

/**
 * Safe JSON parse with fallback
 */
export function safeJsonParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.debug({ error, jsonLength: json.length }, 'JSON parse failed - using fallback');
    return fallback;
  }
}

/**
 * Check if a value is defined (not null or undefined)
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/**
 * Pick specific keys from an object
 */
export function pick<T extends object, K extends keyof T>(obj: T, keys: K[]): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 */
export function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const keysToOmit = new Set<keyof T>(keys);
  return Object.fromEntries(
    Object.entries(obj).filter(([key]) => !keysToOmit.has(key as keyof T))
  ) as Omit<T, K>;
}
