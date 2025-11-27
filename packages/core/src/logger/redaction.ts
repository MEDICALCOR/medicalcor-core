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
  "phone",
  "phoneNumber",
  "phone_number",
  "mobile",
  "telephone",
  "email",
  "emailAddress",
  "email_address",

  // Personal identifiers
  "firstName",
  "first_name",
  "lastName",
  "last_name",
  "fullName",
  "full_name",
  "name",
  "dateOfBirth",
  "date_of_birth",
  "dob",
  "ssn",
  "socialSecurityNumber",
  "cnp", // Romanian personal ID (Cod Numeric Personal)

  // Medical information (HIPAA PHI)
  "diagnosis",
  "symptoms",
  "medications",
  "allergies",
  "medicalHistory",
  "medical_history",
  "insurance",
  "insuranceNumber",
  "insurance_number",

  // Address information
  "address",
  "streetAddress",
  "street_address",
  "city",
  "zipCode",
  "zip_code",
  "postalCode",
  "postal_code",

  // Authentication/credentials
  "password",
  "token",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "apiKey",
  "api_key",
  "secret",
  "authorization",

  // Nested paths (common in request/response bodies)
  "req.body.phone",
  "req.body.email",
  "req.body.name",
  "req.body.firstName",
  "req.body.lastName",
  "req.headers.authorization",
  "res.body.phone",
  "res.body.email",

  // WhatsApp specific
  "from",
  "to",
  "wa_id",
  "profile.name",

  // Lead context demographics - explicit enumeration (from PatientDemographicsSchema)
  // SECURITY: Explicitly enumerate instead of using wildcards to prevent field omission
  "demographics.firstName",
  "demographics.lastName",
  "demographics.dateOfBirth",
  "demographics.gender",
  "demographics.city",
  "demographics.county",

  // Lead context medical data - explicit enumeration (from MedicalContextSchema)
  // SECURITY: HIPAA PHI - must be explicitly enumerated for audit compliance
  "medicalContext.primarySymptoms",
  "medicalContext.symptomDuration",
  "medicalContext.urgencyLevel",
  "medicalContext.preferredSpecialty",
  "medicalContext.hasInsurance",
  "medicalContext.insuranceProvider",
  "medicalContext.previousTreatments",
  "medicalContext.allergies",
  "medicalContext.currentMedications",

  // Conversation history content - explicit array indices
  // SECURITY: Enumerate reasonable range instead of wildcard for predictable redaction
  "conversationHistory[0].content",
  "conversationHistory[1].content",
  "conversationHistory[2].content",
  "conversationHistory[3].content",
  "conversationHistory[4].content",
  "conversationHistory[5].content",
  "conversationHistory[6].content",
  "conversationHistory[7].content",
  "conversationHistory[8].content",
  "conversationHistory[9].content",
  "conversationHistory[10].content",
  "conversationHistory[11].content",
  "conversationHistory[12].content",
  "conversationHistory[13].content",
  "conversationHistory[14].content",
  "conversationHistory[15].content",
  "conversationHistory[16].content",
  "conversationHistory[17].content",
  "conversationHistory[18].content",
  "conversationHistory[19].content",
  // Additional nested content paths for deep structures
  "content", // Generic content field fallback
  "message.content",
  "messages.content",
];

/**
 * Create redaction censor function
 * Returns a masked value that indicates redaction occurred
 */
export function createCensor(_value: unknown, path: string[]): string {
  const fieldName = path[path.length - 1] ?? "unknown";
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
  result = result.replace(PII_PATTERNS.romanianPhone, "[REDACTED:phone]");

  // Redact emails
  result = result.replace(PII_PATTERNS.email, "[REDACTED:email]");

  // Redact CNP
  result = result.replace(PII_PATTERNS.cnp, "[REDACTED:cnp]");

  // Redact credit cards
  result = result.replace(PII_PATTERNS.creditCard, "[REDACTED:card]");

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
