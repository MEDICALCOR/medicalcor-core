/**
 * Phone number normalization utilities
 *
 * Handles Romanian phone number formats and normalization to E.164
 */

/**
 * Normalize a Romanian phone number to E.164 format (+40...)
 *
 * Accepts formats:
 * - 0712345678 -> +40712345678
 * - +40712345678 -> +40712345678
 * - 40712345678 -> +40712345678
 * - 0040712345678 -> +40712345678
 *
 * @param phone - Input phone number
 * @returns Normalized E.164 phone number or null if invalid
 */
export function normalizePhone(phone: string): string | null {
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, '');

  // Handle various formats
  if (cleaned.startsWith('+40')) {
    // Already E.164, no transformation needed
  } else if (cleaned.startsWith('40') && cleaned.length === 11) {
    // Missing + prefix
    cleaned = `+${cleaned}`;
  } else if (cleaned.startsWith('0040')) {
    // International prefix with 00
    cleaned = `+${cleaned.slice(2)}`;
  } else if (cleaned.startsWith('0') && cleaned.length === 10) {
    // Local format
    cleaned = `+40${cleaned.slice(1)}`;
  } else {
    // Invalid format
    return null;
  }

  // Validate final format
  if (!isValidRomanianPhone(cleaned)) {
    return null;
  }

  return cleaned;
}

/**
 * Validate if a string is a valid Romanian phone number in E.164 format
 */
export function isValidRomanianPhone(phone: string): boolean {
  // E.164 format: +40 followed by 9 digits
  // First digit after country code should be 2-3 (landline) or 7 (mobile)
  const e164Pattern = /^\+40[237]\d{8}$/;
  return e164Pattern.test(phone);
}

/**
 * Format a phone number for display (with spaces)
 *
 * @param phone - E.164 phone number
 * @returns Formatted phone number for display
 */
export function formatPhoneForDisplay(phone: string): string {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    return phone; // Return original if can't normalize
  }

  // Format as +40 7XX XXX XXX
  const digits = normalized.slice(3); // Remove +40
  const prefix = digits.slice(0, 3);
  const middle = digits.slice(3, 6);
  const end = digits.slice(6);

  return `+40 ${prefix} ${middle} ${end}`;
}
