/**
 * UUID Generation Utility
 *
 * Generates cryptographically secure UUIDs using the Web Crypto API.
 * Works in Node.js 19+, modern browsers, and edge runtimes.
 *
 * ARCHITECTURE: This uses the standard Web Crypto API (crypto.randomUUID)
 * which is a platform capability, not an infrastructure dependency.
 * The fallback uses Math.random() for older runtimes.
 *
 * @module domain/shared-kernel/utils/uuid
 */

/**
 * Generate UUID v4 (browser and Node.js compatible)
 * Provides fallback for environments without crypto.randomUUID
 *
 * @returns A UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
 */
export function generateUUID(): string {
  // Use crypto.randomUUID if available (Node 19+, modern browsers)
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Required for older runtimes
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  // Fallback to manual UUID v4 generation for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a short UUID (8 characters)
 * Useful for human-readable identifiers
 *
 * @returns A short UUID string (e.g., "550e8400")
 */
export function generateShortUUID(): string {
  return generateUUID().slice(0, 8);
}

/**
 * Generate a prefixed ID
 * Creates IDs in the format: prefix_timestamp_uuid
 *
 * @param prefix - Prefix for the ID (e.g., "lead", "cns", "apt")
 * @returns A prefixed ID string (e.g., "lead_1701619200000_550e8400")
 */
export function generatePrefixedId(prefix: string): string {
  return `${prefix}_${Date.now()}_${generateShortUUID()}`;
}
