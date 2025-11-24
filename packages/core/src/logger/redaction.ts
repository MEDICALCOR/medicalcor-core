/**
 * PII Redaction rules for medical-grade logging
 *
 * HIPAA-compliant redaction patterns for sensitive data.
 * All PII fields are redacted by default in production logs.
 */

/**
 * Standard paths to redact in log objects
 * These cover common locations where PII might appear
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

  // Lead context paths
  'demographics.*',
  'medicalContext.*',
  'conversationHistory[*].content',
];

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
  // Phone numbers
  romanianPhone: /(\+40|0)[0-9]{9}/g, // Romanian format
  internationalPhone: /\+[1-9]\d{1,14}/g, // E.164 format (international standard)
  generalPhone: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // (123) 456-7890, 123-456-7890, etc.

  // Email addresses
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // National IDs
  cnp: /\b[1-8]\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{6}\b/g, // Romanian CNP
  ssn: /\b\d{3}[-\s]?\d{2}[-\s]?\d{4}\b/g, // US Social Security Number (123-45-6789)

  // Date of Birth patterns
  dateISO: /\b(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g, // YYYY-MM-DD
  dateDMY: /\b(0[1-9]|[12]\d|3[01])[/-](0[1-9]|1[0-2])[/-](19|20)\d{2}\b/g, // DD/MM/YYYY or DD-MM-YYYY
  dateMDY: /\b(0[1-9]|1[0-2])[/-](0[1-9]|[12]\d|3[01])[/-](19|20)\d{2}\b/g, // MM/DD/YYYY or MM-DD-YYYY

  // Medical identifiers
  medicalRecordNumber: /\b(MRN|mrn)[-:\s]?\d{6,12}\b/gi, // MRN-123456, MRN: 123456789
  patientId: /\b(PID|pid|patient[-_]?id)[-:\s]?\d{6,12}\b/gi, // PID-123456, patient_id: 123456

  // Financial
  creditCard: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, // Credit card (16 digits)
  iban: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g, // International Bank Account Number

  // Network
  ipAddress: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, // IPv4
  ipv6Address: /\b([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g, // IPv6

  // API keys and tokens (common patterns)
  apiKey: /\b(sk_live_|pk_live_|sk_test_|pk_test_|api[_-]?key[_-]?)[a-zA-Z0-9]{20,}\b/gi,
  bearerToken: /\bBearer\s+[a-zA-Z0-9\-._~+/]+=*/gi, // Bearer tokens in logs
  jwtToken: /\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, // JWT format

  // Passport numbers (generic pattern for various countries)
  passportNumber: /\b[A-Z]{1,2}\d{6,9}\b/g, // Common format: 1-2 letters + 6-9 digits
} as const;

/**
 * Redact PII patterns from a string value
 */
export function redactString(value: string): string {
  let result = value;

  // Redact phone numbers (order matters: specific to general)
  result = result.replace(PII_PATTERNS.romanianPhone, '[REDACTED:phone]');
  result = result.replace(PII_PATTERNS.internationalPhone, '[REDACTED:phone]');
  result = result.replace(PII_PATTERNS.generalPhone, '[REDACTED:phone]');

  // Redact emails
  result = result.replace(PII_PATTERNS.email, '[REDACTED:email]');

  // Redact national IDs
  result = result.replace(PII_PATTERNS.cnp, '[REDACTED:cnp]');
  result = result.replace(PII_PATTERNS.ssn, '[REDACTED:ssn]');

  // Redact dates (potential DOB)
  result = result.replace(PII_PATTERNS.dateISO, '[REDACTED:date]');
  result = result.replace(PII_PATTERNS.dateDMY, '[REDACTED:date]');
  result = result.replace(PII_PATTERNS.dateMDY, '[REDACTED:date]');

  // Redact medical identifiers
  result = result.replace(PII_PATTERNS.medicalRecordNumber, '[REDACTED:mrn]');
  result = result.replace(PII_PATTERNS.patientId, '[REDACTED:patient_id]');

  // Redact financial
  result = result.replace(PII_PATTERNS.creditCard, '[REDACTED:card]');
  result = result.replace(PII_PATTERNS.iban, '[REDACTED:iban]');

  // Redact network
  result = result.replace(PII_PATTERNS.ipAddress, '[REDACTED:ip]');
  result = result.replace(PII_PATTERNS.ipv6Address, '[REDACTED:ipv6]');

  // Redact API keys and tokens (do this early to catch leaked credentials)
  result = result.replace(PII_PATTERNS.apiKey, '[REDACTED:api_key]');
  result = result.replace(PII_PATTERNS.bearerToken, '[REDACTED:bearer_token]');
  result = result.replace(PII_PATTERNS.jwtToken, '[REDACTED:jwt]');

  // Redact passport numbers
  result = result.replace(PII_PATTERNS.passportNumber, '[REDACTED:passport]');

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
