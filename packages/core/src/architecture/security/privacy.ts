/**
 * @module architecture/security/privacy
 *
 * Privacy & Data Protection
 * =========================
 *
 * GDPR/HIPAA compliance infrastructure.
 */

// ============================================================================
// DATA SUBJECT RIGHTS
// ============================================================================

/**
 * Data subject (person whose data is processed)
 */
export interface DataSubject {
  readonly subjectId: string;
  readonly type: 'patient' | 'user' | 'contact' | 'employee';
  readonly identifiers: SubjectIdentifier[];
  readonly consents: ConsentRecord[];
  readonly dataCategories: DataCategory[];
}

export interface SubjectIdentifier {
  readonly type: 'email' | 'phone' | 'ssn' | 'passport' | 'internal_id';
  readonly value: string;
  readonly verified: boolean;
}

export type DataCategory =
  | 'personal'
  | 'contact'
  | 'demographic'
  | 'financial'
  | 'health'
  | 'biometric'
  | 'behavioral'
  | 'location';

// ============================================================================
// CONSENT MANAGEMENT
// ============================================================================

/**
 * Consent record
 */
export interface ConsentRecord {
  readonly consentId: string;
  readonly subjectId: string;
  readonly purpose: ConsentPurpose;
  readonly status: ConsentStatus;
  readonly givenAt?: Date;
  readonly withdrawnAt?: Date;
  readonly expiresAt?: Date;
  readonly source: ConsentSource;
  readonly version: string;
  readonly legalBasis: LegalBasis;
  readonly dataCategories: DataCategory[];
  readonly processingActivities: string[];
  readonly metadata: Record<string, unknown>;
}

export type ConsentPurpose =
  | 'service_delivery'
  | 'marketing'
  | 'analytics'
  | 'research'
  | 'third_party_sharing'
  | 'profiling'
  | 'automated_decision_making';

export type ConsentStatus = 'pending' | 'granted' | 'denied' | 'withdrawn' | 'expired';

export type ConsentSource =
  | 'web_form'
  | 'mobile_app'
  | 'email'
  | 'phone'
  | 'in_person'
  | 'api'
  | 'imported';

export type LegalBasis =
  | 'consent'
  | 'contract'
  | 'legal_obligation'
  | 'vital_interests'
  | 'public_task'
  | 'legitimate_interests';

/**
 * Consent management service interface
 */
export interface ConsentManagementService {
  /**
   * Record consent
   */
  recordConsent(consent: Omit<ConsentRecord, 'consentId'>): Promise<ConsentRecord>;

  /**
   * Withdraw consent
   */
  withdrawConsent(consentId: string, reason?: string): Promise<void>;

  /**
   * Get all consents for a subject
   */
  getConsents(subjectId: string): Promise<ConsentRecord[]>;

  /**
   * Check if consent is granted for a purpose
   */
  hasConsent(subjectId: string, purpose: ConsentPurpose): Promise<boolean>;

  /**
   * Get consent history
   */
  getConsentHistory(subjectId: string): Promise<ConsentHistoryEntry[]>;
}

export interface ConsentHistoryEntry {
  readonly timestamp: Date;
  readonly action: 'granted' | 'withdrawn' | 'updated' | 'expired';
  readonly consentId: string;
  readonly purpose: ConsentPurpose;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// DATA SUBJECT REQUESTS (DSR)
// ============================================================================

/**
 * Data Subject Request
 */
export interface DataSubjectRequest {
  readonly requestId: string;
  readonly subjectId: string;
  readonly requestType: DSRType;
  readonly status: DSRStatus;
  readonly createdAt: Date;
  readonly dueDate: Date;
  readonly completedAt?: Date;
  readonly verifiedAt?: Date;
  readonly verificationMethod?: string;
  readonly details: Record<string, unknown>;
  readonly response?: DSRResponse;
}

export type DSRType =
  | 'access' // Right to access
  | 'rectification' // Right to rectification
  | 'erasure' // Right to be forgotten
  | 'portability' // Right to data portability
  | 'restriction' // Right to restrict processing
  | 'objection' // Right to object
  | 'automated_decision'; // Rights related to automated decision making

export type DSRStatus =
  | 'pending_verification'
  | 'verified'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled';

export interface DSRResponse {
  readonly responseType: 'fulfilled' | 'partial' | 'denied';
  readonly data?: unknown;
  readonly exportFormat?: string;
  readonly downloadUrl?: string;
  readonly expiresAt?: Date;
  readonly reason?: string;
}

/**
 * DSR service interface
 */
export interface DSRService {
  /**
   * Create a new request
   */
  createRequest(
    request: Omit<DataSubjectRequest, 'requestId' | 'createdAt' | 'status'>
  ): Promise<DataSubjectRequest>;

  /**
   * Verify request (identity verification)
   */
  verifyRequest(requestId: string, verificationMethod: string): Promise<void>;

  /**
   * Process a request
   */
  processRequest(requestId: string): Promise<DSRResponse>;

  /**
   * Get request status
   */
  getRequestStatus(requestId: string): Promise<DataSubjectRequest>;

  /**
   * List all requests for a subject
   */
  listRequests(subjectId: string): Promise<DataSubjectRequest[]>;
}

// ============================================================================
// DATA RETENTION
// ============================================================================

/**
 * Data retention policy
 */
export interface RetentionPolicy {
  readonly policyId: string;
  readonly name: string;
  readonly dataCategory: DataCategory;
  readonly resourceType: string;
  readonly retentionPeriodDays: number;
  readonly legalBasis: string;
  readonly disposalMethod: DisposalMethod;
  readonly exceptions?: RetentionException[];
}

export type DisposalMethod = 'delete' | 'anonymize' | 'archive' | 'pseudonymize';

export interface RetentionException {
  readonly condition: string;
  readonly extendedRetentionDays: number;
  readonly reason: string;
}

/**
 * Retention service interface
 */
export interface RetentionService {
  /**
   * Register a retention policy
   */
  registerPolicy(policy: RetentionPolicy): Promise<void>;

  /**
   * Get applicable policy for data
   */
  getPolicy(dataCategory: DataCategory, resourceType: string): Promise<RetentionPolicy | null>;

  /**
   * Check if data should be retained
   */
  shouldRetain(dataCategory: DataCategory, resourceType: string, createdAt: Date): Promise<boolean>;

  /**
   * Get data due for disposal
   */
  getDataDueForDisposal(batchSize?: number): Promise<RetentionCandidate[]>;

  /**
   * Execute disposal
   */
  executeDisposal(candidates: RetentionCandidate[]): Promise<DisposalResult>;
}

export interface RetentionCandidate {
  readonly resourceType: string;
  readonly resourceId: string;
  readonly dataCategory: DataCategory;
  readonly createdAt: Date;
  readonly policy: RetentionPolicy;
}

export interface DisposalResult {
  readonly processed: number;
  readonly deleted: number;
  readonly anonymized: number;
  readonly archived: number;
  readonly errors: DisposalError[];
}

export interface DisposalError {
  readonly resourceId: string;
  readonly error: string;
}

// ============================================================================
// PII DETECTION & MASKING
// ============================================================================

/**
 * PII type
 */
export type PIIType =
  | 'name'
  | 'email'
  | 'phone'
  | 'address'
  | 'ssn'
  | 'credit_card'
  | 'date_of_birth'
  | 'ip_address'
  | 'location'
  | 'health_info'
  | 'biometric'
  | 'custom';

/**
 * PII detection result
 */
export interface PIIDetectionResult {
  readonly hasPII: boolean;
  readonly findings: PIIFinding[];
}

export interface PIIFinding {
  readonly type: PIIType;
  readonly field?: string;
  readonly value: string;
  readonly confidence: number;
  readonly startIndex?: number;
  readonly endIndex?: number;
}

/**
 * PII detector interface
 */
export interface PIIDetector {
  /**
   * Detect PII in text
   */
  detectInText(text: string): PIIDetectionResult;

  /**
   * Detect PII in object
   */
  detectInObject(data: object): PIIDetectionResult;

  /**
   * Mask PII in text
   */
  maskText(text: string, options?: MaskingOptions): string;

  /**
   * Mask PII in object
   */
  maskObject<T extends object>(data: T, options?: MaskingOptions): T;
}

export interface MaskingOptions {
  readonly maskChar?: string;
  readonly preserveLength?: boolean;
  readonly showLastN?: number;
  readonly piiTypes?: PIIType[];
}

/**
 * Default PII patterns
 */
export const PII_PATTERNS: Record<PIIType, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(\+?[1-9]\d{0,2}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  ssn: /\b\d{3}[-.\s]?\d{2}[-.\s]?\d{4}\b/g,
  credit_card: /\b(?:\d{4}[-.\s]?){3}\d{4}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  date_of_birth: /\b\d{2}[-/]\d{2}[-/]\d{4}\b/g,
  name: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
  address:
    /\b\d{1,5}\s+[\w\s]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln)\b/gi,
  location: /\b[A-Z][a-z]+,\s*[A-Z]{2}\s+\d{5}\b/g,
  health_info: /\b(?:diagnosis|medication|prescription|symptom|treatment)\b/gi,
  biometric: /\b(?:fingerprint|face|retina|voice|dna)\b/gi,
  custom: /$/g, // Never matches by default
};

/**
 * Simple PII masker implementation
 */
export function maskPII(
  text: string,
  piiTypes: PIIType[] = ['email', 'phone', 'ssn', 'credit_card'],
  maskChar = '*'
): string {
  let masked = text;

  for (const piiType of piiTypes) {
    const pattern = PII_PATTERNS[piiType];
    if (pattern) {
      masked = masked.replace(pattern, (match) => maskChar.repeat(match.length));
    }
  }

  return masked;
}

// ============================================================================
// PSEUDONYMIZATION
// ============================================================================

/**
 * Pseudonymization service interface
 */
export interface PseudonymizationService {
  /**
   * Generate a pseudonym for a value
   */
  pseudonymize(value: string, context?: string): Promise<string>;

  /**
   * Reverse pseudonymization (requires proper authorization)
   */
  depseudonymize(pseudonym: string, context?: string): Promise<string | null>;

  /**
   * Check if a value is pseudonymized
   */
  isPseudonymized(value: string): boolean;
}

// ============================================================================
// DATA INVENTORY
// ============================================================================

/**
 * Data processing activity
 */
export interface DataProcessingActivity {
  readonly activityId: string;
  readonly name: string;
  readonly description: string;
  readonly purpose: string;
  readonly legalBasis: LegalBasis;
  readonly dataCategories: DataCategory[];
  readonly dataSubjectTypes: string[];
  readonly recipients: DataRecipient[];
  readonly retentionPeriod: string;
  readonly securityMeasures: string[];
  readonly transfersOutsideEU: boolean;
  readonly transferSafeguards?: string;
}

export interface DataRecipient {
  readonly name: string;
  readonly type: 'internal' | 'processor' | 'controller' | 'public_authority';
  readonly purpose: string;
  readonly country?: string;
}

/**
 * Data inventory service interface
 */
export interface DataInventoryService {
  /**
   * Register a processing activity
   */
  registerActivity(activity: DataProcessingActivity): Promise<void>;

  /**
   * Get all processing activities
   */
  getActivities(): Promise<DataProcessingActivity[]>;

  /**
   * Get activities by data category
   */
  getActivitiesByCategory(category: DataCategory): Promise<DataProcessingActivity[]>;

  /**
   * Generate processing records (Article 30)
   */
  generateProcessingRecords(): Promise<ProcessingRecords>;
}

export interface ProcessingRecords {
  readonly generatedAt: Date;
  readonly organizationName: string;
  readonly dpoContact?: string;
  readonly activities: DataProcessingActivity[];
}
