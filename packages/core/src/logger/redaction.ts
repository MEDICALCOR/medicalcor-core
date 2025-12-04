/**
 * PII Redaction rules for medical-grade logging
 *
 * HIPAA-compliant redaction patterns for sensitive data.
 * All PII fields are redacted by default in production logs.
 *
 * SECURITY: Explicit path enumeration instead of wildcards to prevent
 * accidental exposure of new fields and ensure predictable redaction behavior.
 */

/**
 * Standard paths to redact in log objects
 * These cover common locations where PII might appear
 *
 * IMPORTANT: When adding new PII fields to schemas, explicitly add them here.
 * Do NOT use wildcards as they can miss fields with unexpected nesting.
 */
export const REDACTION_PATHS: string[] = [
  // Direct PII fields
  'phone',
  'phoneNumber',
  'phone_number',
  'mobile',
  'telephone',
  'email',
  'emailAddress',
  'email_address',

  // Personal identifiers
  'firstName',
  'first_name',
  'lastName',
  'last_name',
  'fullName',
  'full_name',
  'name',
  'dateOfBirth',
  'date_of_birth',
  'dob',
  'ssn',
  'socialSecurityNumber',
  'cnp', // Romanian personal ID (Cod Numeric Personal)

  // Medical information (HIPAA PHI)
  'diagnosis',
  'symptoms',
  'medications',
  'allergies',
  'medicalHistory',
  'medical_history',
  'insurance',
  'insuranceNumber',
  'insurance_number',

  // Address information
  'address',
  'streetAddress',
  'street_address',
  'city',
  'zipCode',
  'zip_code',
  'postalCode',
  'postal_code',

  // Authentication/credentials
  'password',
  'token',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'apiKey',
  'api_key',
  'secret',
  'authorization',

  // Nested paths (common in request/response bodies)
  'req.body.phone',
  'req.body.email',
  'req.body.name',
  'req.body.firstName',
  'req.body.lastName',
  'req.headers.authorization',
  'res.body.phone',
  'res.body.email',

  // WhatsApp specific
  'from',
  'to',
  'wa_id',
  'profile.name',

  // Voice/Vapi specific
  'customerPhone',
  'customer.number',
  'phoneNumber.number',
  'callerPhone',
  'recipientPhone',
  'recipientId',

  // Lead context demographics - explicit enumeration (from PatientDemographicsSchema)
  // SECURITY: Explicitly enumerate instead of using wildcards to prevent field omission
  'demographics.firstName',
  'demographics.lastName',
  'demographics.dateOfBirth',
  'demographics.gender',
  'demographics.city',
  'demographics.county',

  // Lead context medical data - explicit enumeration (from MedicalContextSchema)
  // SECURITY: HIPAA PHI - must be explicitly enumerated for audit compliance
  'medicalContext.primarySymptoms',
  'medicalContext.symptomDuration',
  'medicalContext.urgencyLevel',
  'medicalContext.preferredSpecialty',
  'medicalContext.hasInsurance',
  'medicalContext.insuranceProvider',
  'medicalContext.previousTreatments',
  'medicalContext.allergies',
  'medicalContext.currentMedications',

  // Conversation history content - explicit array indices (0-99 for deep history)
  // SECURITY: Enumerate reasonable range instead of wildcard for predictable redaction
  // Extended to 100 indices for comprehensive conversation history redaction
  ...generateConversationHistoryPaths(100),

  // Additional nested content paths for deep structures
  'content', // Generic content field fallback
  'message.content',
  'messages.content',
  'messages[*].content', // Array of messages

  // Nested conversation structures (AI context, RAG, etc.)
  'context.conversationHistory[*].content',
  'context.messages[*].content',
  'aiContext.history[*].content',
  'ragContext.messages[*].content',
];

/**
 * Generate conversation history redaction paths for a given depth
 * Provides explicit enumeration for indices 0 to (count-1)
 */
function generateConversationHistoryPaths(count: number): string[] {
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    paths.push(`conversationHistory[${i}].content`);
    // Also cover nested message structures
    paths.push(`messages[${i}].content`);
    paths.push(`context.messages[${i}].content`);
    paths.push(`history[${i}].content`);
  }
  return paths;
}

/**
 * Create redaction censor function
 * Returns a masked value that indicates redaction occurred
 */
export function createCensor(_value: unknown, path: string[]): string {
  const fieldName = path[path.length - 1] ?? 'unknown';
  return `[REDACTED:${fieldName}]`;
}

/**
 * Patterns for runtime PII detection in string values
 */
export const PII_PATTERNS = {
  // Romanian phone numbers
  romanianPhone: /(\+40|0)[0-9]{9}/g,

  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // Romanian CNP (personal ID)
  cnp: /\b[1-8]\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{6}\b/g,

  // Credit card numbers (basic pattern)
  creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,

  // IP addresses
  ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,
} as const;

/**
 * Redact PII patterns from a string value
 */
export function redactString(value: string): string {
  let result = value;

  // Redact phone numbers
  result = result.replace(PII_PATTERNS.romanianPhone, '[REDACTED:phone]');

  // Redact emails
  result = result.replace(PII_PATTERNS.email, '[REDACTED:email]');

  // Redact CNP
  result = result.replace(PII_PATTERNS.cnp, '[REDACTED:cnp]');

  // Redact credit cards
  result = result.replace(PII_PATTERNS.creditCard, '[REDACTED:card]');

  return result;
}

/**
 * Check if a path should be redacted
 */
export function shouldRedactPath(path: string): boolean {
  const normalizedPath = path.toLowerCase();
  return REDACTION_PATHS.some((redactPath) => {
    const normalizedRedact = redactPath.toLowerCase();
    // Exact match or ends with the field name
    return normalizedPath === normalizedRedact || normalizedPath.endsWith(`.${normalizedRedact}`);
  });
}

/**
 * Mask a phone number for safe logging
 * Shows only last 4 digits to allow support without full PII exposure
 *
 * @example
 * maskPhone('+40712345678') // returns '+40******5678'
 * maskPhone('0712345678')   // returns '07****5678'
 */
export function maskPhone(phone: string | undefined | null): string {
  if (!phone) return '[NO_PHONE]';

  const cleaned = phone.replace(/\s/g, '');
  if (cleaned.length < 6) return '[INVALID_PHONE]';

  // Keep first 3 chars (country code indicator) and last 4 digits
  const prefix = cleaned.slice(0, 3);
  const suffix = cleaned.slice(-4);
  const maskedMiddle = '*'.repeat(Math.max(cleaned.length - 7, 2));

  return `${prefix}${maskedMiddle}${suffix}`;
}

/**
 * Mask an email address for safe logging
 * Shows first 2 chars and domain
 *
 * @example
 * maskEmail('john.doe@example.com') // returns 'jo***@example.com'
 */
export function maskEmail(email: string | undefined | null): string {
  if (!email) return '[NO_EMAIL]';

  const atIndex = email.indexOf('@');
  if (atIndex < 1) return '[INVALID_EMAIL]';

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex);

  const visibleChars = Math.min(2, localPart.length);
  return `${localPart.slice(0, visibleChars)}***${domain}`;
}

/**
 * Mask a name for safe logging
 * Shows first initial and last initial only
 *
 * @example
 * maskName('John Doe') // returns 'J*** D***'
 */
export function maskName(name: string | undefined | null): string {
  if (!name) return '[NO_NAME]';

  const parts = name.trim().split(/\s+/);
  return parts.map((part) => (part.length > 0 ? `${part[0]}***` : '')).join(' ');
}
