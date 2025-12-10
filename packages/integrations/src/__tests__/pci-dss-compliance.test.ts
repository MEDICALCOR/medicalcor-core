/**
 * @fileoverview PCI-DSS Compliance Tests
 *
 * Tests PCI-DSS (Payment Card Industry Data Security Standard) compliance including:
 * - No raw card data storage (PAN, CVV, magnetic stripe)
 * - Tokenization requirement validation
 * - Webhook signature verification for payment data
 * - Secure transmission requirements
 * - Access control for payment operations
 * - Audit logging for payment activities
 *
 * @module integrations/__tests__/pci-dss-compliance
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import crypto from 'crypto';

// ============================================================================
// PCI-DSS COMPLIANCE TYPES
// ============================================================================

/**
 * Card data that should NEVER be stored
 */
interface SensitiveCardData {
  pan: string; // Primary Account Number (full card number)
  cvv: string; // Card Verification Value
  magneticStripe: string; // Track data
  pin: string; // PIN
}

/**
 * Tokenized card data (safe to store)
 */
interface TokenizedCardData {
  token: string; // Stripe/provider token
  last4: string; // Last 4 digits only
  brand: string; // Visa, Mastercard, etc.
  expiryMonth: number;
  expiryYear: number;
  cardholderName?: string;
}

/**
 * Payment audit log entry
 */
interface PaymentAuditEntry {
  id: string;
  timestamp: Date;
  action: 'charge' | 'refund' | 'token_created' | 'webhook_received';
  userId: string;
  chargeId?: string;
  amount?: number;
  currency?: string;
  ipAddress: string;
  success: boolean;
  errorCode?: string;
}

// ============================================================================
// PCI-DSS COMPLIANCE SERVICE
// ============================================================================

interface PCIDSSLogger {
  info(obj: Record<string, unknown>, msg?: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
}

interface PCIDSSAuditRepository {
  log(entry: Omit<PaymentAuditEntry, 'id' | 'timestamp'>): Promise<PaymentAuditEntry>;
  getByChargeId(chargeId: string): Promise<PaymentAuditEntry[]>;
  getByUserId(userId: string): Promise<PaymentAuditEntry[]>;
}

/**
 * In-memory audit repository for testing
 */
class InMemoryPCIDSSAuditRepository implements PCIDSSAuditRepository {
  private entries: PaymentAuditEntry[] = [];
  private nextId = 1;

  async log(entry: Omit<PaymentAuditEntry, 'id' | 'timestamp'>): Promise<PaymentAuditEntry> {
    const record: PaymentAuditEntry = {
      ...entry,
      id: `audit_${this.nextId++}`,
      timestamp: new Date(),
    };
    this.entries.push(record);
    return record;
  }

  async getByChargeId(chargeId: string): Promise<PaymentAuditEntry[]> {
    return this.entries.filter((e) => e.chargeId === chargeId);
  }

  async getByUserId(userId: string): Promise<PaymentAuditEntry[]> {
    return this.entries.filter((e) => e.userId === userId);
  }

  getAll(): PaymentAuditEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}

/**
 * PCI-DSS Compliance Service
 * Validates and enforces PCI-DSS requirements for payment handling
 */
class PCIDSSComplianceService {
  private webhookSecret: string;
  private auditRepository: PCIDSSAuditRepository;
  private logger: PCIDSSLogger;

  // Regex patterns for detecting raw card data
  private readonly PAN_PATTERN = /\b(?:\d[ -]*?){13,19}\b/g;
  private readonly CVV_PATTERN = /\b\d{3,4}\b/;
  private readonly LUHN_CHECK = true;

  constructor(options: {
    webhookSecret: string;
    auditRepository: PCIDSSAuditRepository;
    logger?: PCIDSSLogger;
  }) {
    this.webhookSecret = options.webhookSecret;
    this.auditRepository = options.auditRepository;
    this.logger = options.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  /**
   * Validate that no raw card data is present in a string
   * PCI-DSS Requirement 3: Protect stored cardholder data
   */
  containsRawCardData(input: string): {
    containsPan: boolean;
    containsCvv: boolean;
    detectedPatterns: string[];
  } {
    const detectedPatterns: string[] = [];
    let containsPan = false;
    let containsCvv = false;

    // Check for PAN (card number) patterns
    const panMatches = input.match(this.PAN_PATTERN);
    if (panMatches) {
      for (const match of panMatches) {
        const cleanNumber = match.replace(/[ -]/g, '');
        if (this.isValidLuhn(cleanNumber)) {
          containsPan = true;
          detectedPatterns.push(`PAN: ${cleanNumber.slice(0, 4)}****${cleanNumber.slice(-4)}`);
        }
      }
    }

    // CVV detection is context-sensitive
    // We only flag if there's also a PAN detected
    if (containsPan && this.CVV_PATTERN.test(input)) {
      containsCvv = true;
      detectedPatterns.push('Possible CVV detected');
    }

    return { containsPan, containsCvv, detectedPatterns };
  }

  /**
   * Luhn algorithm to validate card numbers
   */
  private isValidLuhn(number: string): boolean {
    let sum = 0;
    let isEven = false;

    for (let i = number.length - 1; i >= 0; i--) {
      let digit = parseInt(number[i]!, 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit -= 9;
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  }

  /**
   * Validate that data uses tokenization (no raw card numbers)
   * PCI-DSS Requirement 3.4: Render PAN unreadable
   */
  validateTokenization(data: unknown): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    if (typeof data !== 'object' || data === null) {
      return { valid: true, issues };
    }

    const checkObject = (obj: Record<string, unknown>, path: string) => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        // Check for forbidden field names
        const forbiddenFields = ['pan', 'card_number', 'cardNumber', 'cvv', 'cvc', 'cvv2', 'pin'];
        if (forbiddenFields.includes(key.toLowerCase())) {
          issues.push(`Forbidden field detected: ${currentPath}`);
        }

        // Check string values for card data
        if (typeof value === 'string') {
          const cardCheck = this.containsRawCardData(value);
          if (cardCheck.containsPan) {
            issues.push(`Raw card data detected at ${currentPath}`);
          }
        }

        // Recursively check nested objects
        if (typeof value === 'object' && value !== null) {
          checkObject(value as Record<string, unknown>, currentPath);
        }
      }
    };

    checkObject(data as Record<string, unknown>, '');

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Validate webhook signature for secure transmission
   * PCI-DSS Requirement 4: Encrypt transmission of cardholder data
   */
  verifyWebhookSignature(payload: string, signatureHeader: string): boolean {
    // Parse signature header: t=<timestamp>,v1=<signature>
    const signatureParts = signatureHeader.split(',');
    let timestamp = '';
    let signature = '';

    for (const part of signatureParts) {
      const [key, value] = part.split('=');
      if (key === 't') {
        timestamp = value ?? '';
      } else if (key === 'v1') {
        signature = value ?? '';
      }
    }

    if (!timestamp || !signature) {
      return false;
    }

    // Check timestamp is within 5 minutes to prevent replay attacks
    const currentTime = Math.floor(Date.now() / 1000);
    const webhookTime = parseInt(timestamp, 10);
    const TOLERANCE_SECONDS = 300;

    if (Math.abs(currentTime - webhookTime) > TOLERANCE_SECONDS) {
      this.logger.warn(
        { timeDiff: currentTime - webhookTime },
        'Webhook timestamp outside tolerance'
      );
      return false;
    }

    // Compute expected signature
    const signedPayload = `${timestamp}.${payload}`;
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Timing-safe comparison
    try {
      return crypto.timingSafeEqual(Buffer.from(expectedSignature), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  /**
   * Log payment activity for audit trail
   * PCI-DSS Requirement 10: Track and monitor all access
   */
  async logPaymentActivity(
    action: PaymentAuditEntry['action'],
    userId: string,
    ipAddress: string,
    details: {
      chargeId?: string;
      amount?: number;
      currency?: string;
      success: boolean;
      errorCode?: string;
    }
  ): Promise<PaymentAuditEntry> {
    const entry = await this.auditRepository.log({
      action,
      userId,
      ipAddress,
      ...details,
    });

    this.logger.info(
      {
        action,
        userId,
        chargeId: details.chargeId,
        success: details.success,
      },
      'Payment activity logged'
    );

    return entry;
  }

  /**
   * Validate secure transmission (HTTPS requirement)
   * PCI-DSS Requirement 4.1
   */
  validateSecureUrl(url: string): {
    valid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];

    try {
      const parsed = new URL(url);

      if (parsed.protocol !== 'https:') {
        issues.push('URL must use HTTPS protocol');
      }

      // Check for common insecure patterns
      if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
        issues.push('Localhost URLs not permitted for production payment data');
      }
    } catch {
      issues.push('Invalid URL format');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Redact card data from logs/error messages
   * PCI-DSS Requirement 3.3: Mask PAN when displayed
   */
  redactCardData(input: string): string {
    // Redact potential card numbers
    let redacted = input.replace(this.PAN_PATTERN, (match) => {
      const cleanNumber = match.replace(/[ -]/g, '');
      if (this.isValidLuhn(cleanNumber)) {
        return `****${cleanNumber.slice(-4)}`;
      }
      return match;
    });

    return redacted;
  }

  /**
   * Validate that only allowed card data fields are stored
   */
  validateStorageCompliance(data: Record<string, unknown>): {
    compliant: boolean;
    forbiddenFields: string[];
    allowedFields: string[];
  } {
    const forbiddenFieldPatterns = [
      'pan',
      'card_number',
      'cardnumber',
      'full_number',
      'cvv',
      'cvc',
      'cvv2',
      'csc',
      'pin',
      'magnetic_stripe',
      'track1',
      'track2',
    ];

    const allowedFields = [
      'token',
      'last4',
      'last_four',
      'brand',
      'expiry_month',
      'expiry_year',
      'cardholder_name',
    ];

    const foundForbidden: string[] = [];
    const foundAllowed: string[] = [];

    const checkFields = (obj: Record<string, unknown>, prefix = '') => {
      for (const key of Object.keys(obj)) {
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const lowerKey = key.toLowerCase();

        if (forbiddenFieldPatterns.some((p) => lowerKey.includes(p))) {
          foundForbidden.push(fullKey);
        }

        if (allowedFields.some((a) => lowerKey.includes(a))) {
          foundAllowed.push(fullKey);
        }

        if (typeof obj[key] === 'object' && obj[key] !== null) {
          checkFields(obj[key] as Record<string, unknown>, fullKey);
        }
      }
    };

    checkFields(data);

    return {
      compliant: foundForbidden.length === 0,
      forbiddenFields: foundForbidden,
      allowedFields: foundAllowed,
    };
  }
}

// ============================================================================
// PCI-DSS COMPLIANCE TESTS
// ============================================================================

describe('PCI-DSS Card Data Handling Compliance', () => {
  let service: PCIDSSComplianceService;
  let auditRepository: InMemoryPCIDSSAuditRepository;
  const testWebhookSecret = 'whsec_test_secret_key_12345';

  beforeEach(() => {
    auditRepository = new InMemoryPCIDSSAuditRepository();
    service = new PCIDSSComplianceService({
      webhookSecret: testWebhookSecret,
      auditRepository,
    });
  });

  // ============================================================================
  // RAW CARD DATA DETECTION TESTS
  // ============================================================================

  describe('Raw Card Data Detection', () => {
    it('should detect valid card numbers (Luhn check)', () => {
      // Test Visa card number
      const result = service.containsRawCardData('Card: 4532015112830366');

      expect(result.containsPan).toBe(true);
      expect(result.detectedPatterns.length).toBeGreaterThan(0);
    });

    it('should not flag random numbers as card data', () => {
      const result = service.containsRawCardData('Order number: 1234567890123');

      expect(result.containsPan).toBe(false);
    });

    it('should detect card numbers with spaces', () => {
      const result = service.containsRawCardData('Card: 4532 0151 1283 0366');

      expect(result.containsPan).toBe(true);
    });

    it('should detect card numbers with dashes', () => {
      const result = service.containsRawCardData('Card: 4532-0151-1283-0366');

      expect(result.containsPan).toBe(true);
    });

    it('should not expose full card number in detection results', () => {
      const result = service.containsRawCardData('Card: 4532015112830366');

      // Should only show masked version
      expect(result.detectedPatterns[0]).not.toContain('4532015112830366');
      expect(result.detectedPatterns[0]).toContain('****');
    });
  });

  // ============================================================================
  // TOKENIZATION VALIDATION TESTS
  // ============================================================================

  describe('Tokenization Validation', () => {
    it('should reject data with raw card number field', () => {
      const data = {
        card_number: '4532015112830366',
        expiry: '12/25',
      };

      const result = service.validateTokenization(data);

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Forbidden field detected: card_number');
    });

    it('should reject data with CVV field', () => {
      const data = {
        token: 'tok_visa',
        cvv: '123',
      };

      const result = service.validateTokenization(data);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('cvv'))).toBe(true);
    });

    it('should accept properly tokenized data', () => {
      const data: TokenizedCardData = {
        token: 'tok_1234567890abcdef',
        last4: '4242',
        brand: 'visa',
        expiryMonth: 12,
        expiryYear: 2025,
      };

      const result = service.validateTokenization(data);

      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should detect raw card data in nested objects', () => {
      const data = {
        payment: {
          method: {
            pan: '4532015112830366',
          },
        },
      };

      const result = service.validateTokenization(data);

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('payment.method.pan'))).toBe(true);
    });
  });

  // ============================================================================
  // WEBHOOK SIGNATURE VERIFICATION TESTS
  // ============================================================================

  describe('Webhook Signature Verification', () => {
    it('should verify valid webhook signature', () => {
      const payload = JSON.stringify({ type: 'charge.succeeded', id: 'ch_123' });
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signedPayload = `${timestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(signedPayload, 'utf8')
        .digest('hex');
      const signatureHeader = `t=${timestamp},v1=${signature}`;

      const isValid = service.verifyWebhookSignature(payload, signatureHeader);

      expect(isValid).toBe(true);
    });

    it('should reject invalid webhook signature', () => {
      const payload = JSON.stringify({ type: 'charge.succeeded', id: 'ch_123' });
      const signatureHeader = 't=1234567890,v1=invalid_signature';

      const isValid = service.verifyWebhookSignature(payload, signatureHeader);

      expect(isValid).toBe(false);
    });

    it('should reject expired webhook timestamp', () => {
      const payload = JSON.stringify({ type: 'charge.succeeded' });
      const oldTimestamp = (Math.floor(Date.now() / 1000) - 600).toString(); // 10 min ago
      const signedPayload = `${oldTimestamp}.${payload}`;
      const signature = crypto
        .createHmac('sha256', testWebhookSecret)
        .update(signedPayload, 'utf8')
        .digest('hex');
      const signatureHeader = `t=${oldTimestamp},v1=${signature}`;

      const isValid = service.verifyWebhookSignature(payload, signatureHeader);

      expect(isValid).toBe(false);
    });

    it('should reject malformed signature header', () => {
      const payload = JSON.stringify({ type: 'charge.succeeded' });

      expect(service.verifyWebhookSignature(payload, 'malformed')).toBe(false);
      expect(service.verifyWebhookSignature(payload, '')).toBe(false);
      expect(service.verifyWebhookSignature(payload, 't=123')).toBe(false);
    });
  });

  // ============================================================================
  // AUDIT LOGGING TESTS
  // ============================================================================

  describe('Payment Audit Logging', () => {
    it('should log payment activity with all required fields', async () => {
      const entry = await service.logPaymentActivity('charge', 'user_123', '192.168.1.1', {
        chargeId: 'ch_abc123',
        amount: 10000,
        currency: 'usd',
        success: true,
      });

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeDefined();
      expect(entry.action).toBe('charge');
      expect(entry.userId).toBe('user_123');
      expect(entry.chargeId).toBe('ch_abc123');
    });

    it('should retrieve audit logs by charge ID', async () => {
      await service.logPaymentActivity('charge', 'user_123', '192.168.1.1', {
        chargeId: 'ch_abc123',
        success: true,
      });
      await service.logPaymentActivity('refund', 'user_456', '192.168.1.2', {
        chargeId: 'ch_abc123',
        success: true,
      });

      const logs = await auditRepository.getByChargeId('ch_abc123');

      expect(logs).toHaveLength(2);
    });

    it('should log failed payment attempts', async () => {
      const entry = await service.logPaymentActivity('charge', 'user_123', '192.168.1.1', {
        chargeId: 'ch_failed',
        amount: 10000,
        currency: 'usd',
        success: false,
        errorCode: 'card_declined',
      });

      expect(entry.success).toBe(false);
      expect(entry.errorCode).toBe('card_declined');
    });
  });

  // ============================================================================
  // SECURE TRANSMISSION TESTS
  // ============================================================================

  describe('Secure Transmission Validation', () => {
    it('should require HTTPS for payment URLs', () => {
      const result = service.validateSecureUrl('http://api.example.com/charge');

      expect(result.valid).toBe(false);
      expect(result.issues).toContain('URL must use HTTPS protocol');
    });

    it('should accept valid HTTPS URLs', () => {
      const result = service.validateSecureUrl('https://api.stripe.com/v1/charges');

      expect(result.valid).toBe(true);
    });

    it('should reject localhost URLs in production context', () => {
      const result = service.validateSecureUrl('https://localhost:3000/webhook');

      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('Localhost'))).toBe(true);
    });
  });

  // ============================================================================
  // DATA REDACTION TESTS
  // ============================================================================

  describe('Card Data Redaction', () => {
    it('should redact card numbers from log messages', () => {
      const input = 'Payment failed for card 4532015112830366';

      const redacted = service.redactCardData(input);

      expect(redacted).not.toContain('4532015112830366');
      expect(redacted).toContain('****0366');
    });

    it('should preserve non-card numbers', () => {
      const input = 'Order #12345 processed for amount 1000';

      const redacted = service.redactCardData(input);

      expect(redacted).toBe(input);
    });
  });

  // ============================================================================
  // STORAGE COMPLIANCE TESTS
  // ============================================================================

  describe('Storage Compliance Validation', () => {
    it('should flag forbidden storage fields', () => {
      const data = {
        customer_id: 'cus_123',
        card_number: '4242424242424242',
        cvv: '123',
      };

      const result = service.validateStorageCompliance(data);

      expect(result.compliant).toBe(false);
      expect(result.forbiddenFields).toContain('card_number');
      expect(result.forbiddenFields).toContain('cvv');
    });

    it('should allow storing tokenized card data', () => {
      const data = {
        customer_id: 'cus_123',
        payment_method: {
          token: 'pm_card_visa',
          last4: '4242',
          brand: 'visa',
          expiry_month: 12,
          expiry_year: 2025,
        },
      };

      const result = service.validateStorageCompliance(data);

      expect(result.compliant).toBe(true);
      expect(result.forbiddenFields).toHaveLength(0);
    });
  });

  // ============================================================================
  // PROPERTY-BASED TESTS
  // ============================================================================

  describe('Property-Based Tests', () => {
    it('should never allow storing raw card numbers', () => {
      fc.assert(
        fc.property(fc.integer({ min: 4000000000000000, max: 4999999999999999 }), (cardNum) => {
          const data = { card_number: cardNum.toString() };
          const result = service.validateStorageCompliance(data);
          return result.compliant === false;
        }),
        { numRuns: 20 }
      );
    });

    it('should always redact valid card numbers', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('4532015112830366', '5425233430109903', '374245455400126'),
          (cardNum) => {
            const input = `Card: ${cardNum}`;
            const redacted = service.redactCardData(input);
            return !redacted.includes(cardNum) && redacted.includes('****');
          }
        )
      );
    });

    it('should always verify correct signatures', () => {
      fc.assert(
        fc.property(fc.json(), (payload) => {
          const payloadStr = JSON.stringify(payload);
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const signedPayload = `${timestamp}.${payloadStr}`;
          const signature = crypto
            .createHmac('sha256', testWebhookSecret)
            .update(signedPayload, 'utf8')
            .digest('hex');
          const signatureHeader = `t=${timestamp},v1=${signature}`;

          return service.verifyWebhookSignature(payloadStr, signatureHeader) === true;
        }),
        { numRuns: 10 }
      );
    });
  });
});
