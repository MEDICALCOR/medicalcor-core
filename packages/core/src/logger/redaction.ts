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
 *
 * GDPR Article 4(1): Personal data means any information relating to an
 * identified or identifiable natural person.
 *
 * HIPAA 18 Safe Harbor Identifiers covered where applicable.
 */
export const PII_PATTERNS = {
  // Romanian phone numbers
  romanianPhone: /(\+40|0)[0-9]{9}/g,

  // International phone numbers (E.164 format: +countrycode followed by 6-14 digits)
  internationalPhone: /\+[1-9]\d{6,14}/g,

  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // Romanian CNP (personal ID - Cod Numeric Personal)
  cnp: /\b[1-8]\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{6}\b/g,

  // Credit card numbers (Visa, MasterCard, Amex, etc.)
  creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,

  // IPv4 addresses (HIPAA device identifier)
  ipv4Address: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,

  // IPv6 addresses (full and compressed formats)
  ipv6Address: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:){1,7}:\b|\b(?:[0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}\b/g,

  // IBAN (European bank account numbers)
  iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g,

  // JWT tokens (Bearer tokens in logs)
  jwtToken: /\beyJ[A-Za-z0-9_-]*\.eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]*/g,

  // Date of birth patterns (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD)
  dateOfBirth: /\b(?:0[1-9]|[12]\d|3[01])[/\-.](?:0[1-9]|1[0-2])[/\-.](?:19|20)\d{2}\b|\b(?:19|20)\d{2}[/\-.](?:0[1-9]|1[0-2])[/\-.](?:0[1-9]|[12]\d|3[01])\b/g,

  // Social Security Number (US SSN format)
  ssn: /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g,

  // UK National Insurance Number
  ukNin: /\b[A-Za-z]{2}\d{6}[A-Za-z]\b/g,
} as const;

/**
 * Redact PII patterns from a string value
 *
 * SECURITY: Order matters - more specific patterns should be applied
 * before more general ones to prevent double-redaction.
 */
export function redactString(value: string): string {
  let result = value;

  // JWT tokens first (to avoid partial matching with other patterns)
  result = result.replace(PII_PATTERNS.jwtToken, '[REDACTED:token]');

  // Phone numbers (Romanian specific first, then international)
  result = result.replace(PII_PATTERNS.romanianPhone, '[REDACTED:phone]');
  result = result.replace(PII_PATTERNS.internationalPhone, '[REDACTED:phone]');

  // Emails
  result = result.replace(PII_PATTERNS.email, '[REDACTED:email]');

  // Personal IDs
  result = result.replace(PII_PATTERNS.cnp, '[REDACTED:cnp]');
  result = result.replace(PII_PATTERNS.ssn, '[REDACTED:ssn]');
  result = result.replace(PII_PATTERNS.ukNin, '[REDACTED:nin]');

  // Financial
  result = result.replace(PII_PATTERNS.creditCard, '[REDACTED:card]');
  result = result.replace(PII_PATTERNS.iban, '[REDACTED:iban]');

  // Network identifiers (HIPAA device identifiers)
  result = result.replace(PII_PATTERNS.ipv6Address, '[REDACTED:ip]');
  result = result.replace(PII_PATTERNS.ipv4Address, '[REDACTED:ip]');

  // Dates (potential DOB)
  result = result.replace(PII_PATTERNS.dateOfBirth, '[REDACTED:date]');

  return result;
}

/**
 * Deep redact an object, applying PII redaction to all string values
 * Useful for sanitizing objects before WebSocket transmission or logging
 */
export function deepRedactObject<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactString(obj) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item: unknown) => deepRedactObject(item)) as T;
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Check if key itself should be redacted
      if (shouldRedactPath(key)) {
        result[key] = `[REDACTED:${key}]`;
      } else {
        result[key] = deepRedactObject(value);
      }
    }
    return result as T;
  }

  return obj;
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
