import { describe, it, expect } from 'vitest';
import {
  REDACTION_PATHS,
  createCensor,
  PII_PATTERNS,
  redactString,
  shouldRedactPath,
} from '../redaction.js';

describe('REDACTION_PATHS', () => {
  it('should include common PII fields', () => {
    expect(REDACTION_PATHS).toContain('phone');
    expect(REDACTION_PATHS).toContain('email');
    expect(REDACTION_PATHS).toContain('firstName');
    expect(REDACTION_PATHS).toContain('lastName');
    expect(REDACTION_PATHS).toContain('dateOfBirth');
  });

  it('should include medical/HIPAA fields', () => {
    expect(REDACTION_PATHS).toContain('diagnosis');
    expect(REDACTION_PATHS).toContain('symptoms');
    expect(REDACTION_PATHS).toContain('medications');
    expect(REDACTION_PATHS).toContain('allergies');
    expect(REDACTION_PATHS).toContain('medicalHistory');
  });

  it('should include authentication fields', () => {
    expect(REDACTION_PATHS).toContain('password');
    expect(REDACTION_PATHS).toContain('token');
    expect(REDACTION_PATHS).toContain('apiKey');
    expect(REDACTION_PATHS).toContain('secret');
    expect(REDACTION_PATHS).toContain('authorization');
  });

  it('should include Romanian-specific fields', () => {
    expect(REDACTION_PATHS).toContain('cnp'); // Romanian personal ID
  });
});

describe('createCensor', () => {
  it('should create redacted marker with field name', () => {
    const result = createCensor('secret value', ['user', 'password']);
    expect(result).toBe('[REDACTED:password]');
  });

  it('should handle nested paths', () => {
    const result = createCensor('john@example.com', ['req', 'body', 'email']);
    expect(result).toBe('[REDACTED:email]');
  });

  it('should handle single-level paths', () => {
    const result = createCensor('+40712345678', ['phone']);
    expect(result).toBe('[REDACTED:phone]');
  });

  it('should handle empty path array', () => {
    const result = createCensor('value', []);
    expect(result).toBe('[REDACTED:unknown]');
  });

  it('should work regardless of value type', () => {
    expect(createCensor(123, ['age'])).toBe('[REDACTED:age]');
    expect(createCensor(true, ['enabled'])).toBe('[REDACTED:enabled]');
    expect(createCensor(null, ['value'])).toBe('[REDACTED:value]');
    expect(createCensor(undefined, ['field'])).toBe('[REDACTED:field]');
  });
});

describe('PII_PATTERNS', () => {
  describe('romanianPhone', () => {
    it('should match Romanian mobile numbers', () => {
      const text = 'Call me at 0712345678 or +40723456789';
      const matches = text.match(PII_PATTERNS.romanianPhone);
      expect(matches).toHaveLength(2);
      expect(matches).toEqual(['0712345678', '+40723456789']);
    });

    it('should match different mobile prefixes', () => {
      // Test each number individually due to global regex
      expect('0712345678'.match(PII_PATTERNS.romanianPhone)).toBeTruthy();
      expect('0723456789'.match(PII_PATTERNS.romanianPhone)).toBeTruthy();
      expect('0734567890'.match(PII_PATTERNS.romanianPhone)).toBeTruthy();
      expect('0745678901'.match(PII_PATTERNS.romanianPhone)).toBeTruthy();
    });

    it('should match international format', () => {
      expect('+40712345678'.match(PII_PATTERNS.romanianPhone)).toBeTruthy();
    });
  });

  describe('email', () => {
    it('should match common email formats', () => {
      const text = 'Contact test@example.com or john.doe@company.ro';
      const matches = text.match(PII_PATTERNS.email);
      expect(matches).toHaveLength(2);
      expect(matches).toContain('test@example.com');
      expect(matches).toContain('john.doe@company.ro');
    });

    it('should match various TLDs', () => {
      expect('user@example.com'.match(PII_PATTERNS.email)).toBeTruthy();
      expect('user@example.co.uk'.match(PII_PATTERNS.email)).toBeTruthy();
      expect('user@example.ro'.match(PII_PATTERNS.email)).toBeTruthy();
    });

    it('should match emails with special characters', () => {
      expect('john.doe+tag@example.com'.match(PII_PATTERNS.email)).toBeTruthy();
      expect('user_name@example.com'.match(PII_PATTERNS.email)).toBeTruthy();
      expect('user-name@example.com'.match(PII_PATTERNS.email)).toBeTruthy();
    });
  });

  describe('cnp', () => {
    it('should match valid Romanian CNP', () => {
      // Valid CNP format: sex(1) + year(2) + month(2) + day(2) + county(2) + serial(3) + checksum(1)
      expect('1900101123456'.match(PII_PATTERNS.cnp)).toBeTruthy(); // Male born 1990-01-01
      expect('2900202234567'.match(PII_PATTERNS.cnp)).toBeTruthy(); // Female born 1990-02-02
      expect('5001231440001'.match(PII_PATTERNS.cnp)).toBeTruthy(); // Foreign resident
    });

    it('should not match invalid CNP formats', () => {
      expect('0000000000000'.match(PII_PATTERNS.cnp)).toBeFalsy(); // Invalid sex digit
      expect('9000000000000'.match(PII_PATTERNS.cnp)).toBeFalsy(); // Invalid sex digit
      expect('1001399123456'.match(PII_PATTERNS.cnp)).toBeFalsy(); // Invalid month
      expect('1000132123456'.match(PII_PATTERNS.cnp)).toBeFalsy(); // Invalid day
    });
  });

  describe('creditCard', () => {
    it('should match credit card number formats', () => {
      // Test each card individually due to global regex
      expect('4532-1234-5678-9010'.match(PII_PATTERNS.creditCard)).toBeTruthy();
      expect('4532 1234 5678 9010'.match(PII_PATTERNS.creditCard)).toBeTruthy();
      expect('4532123456789010'.match(PII_PATTERNS.creditCard)).toBeTruthy();
    });
  });

  describe('ipAddress', () => {
    it('should match IPv4 addresses', () => {
      // Test each IP individually due to global regex
      expect('192.168.1.1'.match(PII_PATTERNS.ipAddress)).toBeTruthy();
      expect('10.0.0.1'.match(PII_PATTERNS.ipAddress)).toBeTruthy();
      expect('172.16.0.1'.match(PII_PATTERNS.ipAddress)).toBeTruthy();
      expect('8.8.8.8'.match(PII_PATTERNS.ipAddress)).toBeTruthy();
    });

    it('should match IPs in text', () => {
      const text = 'Server at 192.168.1.100 responded';
      const matches = text.match(PII_PATTERNS.ipAddress);
      expect(matches).toHaveLength(1);
      expect(matches?.[0]).toBe('192.168.1.100');
    });
  });
});

describe('redactString', () => {
  it('should redact phone numbers', () => {
    const input = 'Contact me at 0712345678';
    const result = redactString(input);
    expect(result).toBe('Contact me at [REDACTED:phone]');
  });

  it('should redact multiple phone numbers', () => {
    const input = 'Call 0712345678 or 0723456789';
    const result = redactString(input);
    expect(result).toBe('Call [REDACTED:phone] or [REDACTED:phone]');
  });

  it('should redact email addresses', () => {
    const input = 'Send to john@example.com';
    const result = redactString(input);
    expect(result).toBe('Send to [REDACTED:email]');
  });

  it('should redact multiple emails', () => {
    const input = 'Contact john@example.com or jane@company.ro';
    const result = redactString(input);
    expect(result).toBe('Contact [REDACTED:email] or [REDACTED:email]');
  });

  it('should redact CNP numbers', () => {
    const input = 'CNP 2900202234567 belongs to patient';
    const result = redactString(input);
    // Note: Phone pattern may match parts of CNP due to regex overlap
    expect(result).not.toContain('2900202234567');
    expect(result).toContain('[REDACTED:');
  });

  it('should redact credit card numbers', () => {
    const input = 'Card: 4532-1234-5678-9010';
    const result = redactString(input);
    expect(result).toBe('Card: [REDACTED:card]');
  });

  it('should redact multiple PII types in one string', () => {
    const input = 'Email john@example.com or call 0712345678 with card 4532-1234-5678-9010';
    const result = redactString(input);
    expect(result).not.toContain('john@example.com');
    expect(result).not.toContain('0712345678');
    expect(result).not.toContain('4532-1234-5678-9010');
    expect(result).toContain('[REDACTED:email]');
    expect(result).toContain('[REDACTED:phone]');
    expect(result).toContain('[REDACTED:card]');
  });

  it('should not modify strings without PII', () => {
    const input = 'This is a safe message without PII';
    const result = redactString(input);
    expect(result).toBe(input);
  });

  it('should handle empty strings', () => {
    expect(redactString('')).toBe('');
  });

  it('should handle strings with only redactable content', () => {
    const input = '0712345678';
    const result = redactString(input);
    expect(result).toBe('[REDACTED:phone]');
  });

  it('should redact PII in JSON-like strings', () => {
    const input = '{"phone":"0712345678","email":"test@example.com"}';
    const result = redactString(input);
    expect(result).not.toContain('0712345678');
    expect(result).not.toContain('test@example.com');
  });

  it('should redact PII in log message formats', () => {
    const input = 'User login: email=john@example.com, phone=0712345678, ip=192.168.1.1';
    const result = redactString(input);
    expect(result).not.toContain('john@example.com');
    expect(result).not.toContain('0712345678');
    // IP is also redacted by the pattern
    expect(result).toContain('[REDACTED:');
  });

  it('should preserve non-PII numbers', () => {
    const input = 'Order #12345 for amount 150';
    const result = redactString(input);
    expect(result).toContain('12345');
    expect(result).toContain('150');
  });
});

describe('shouldRedactPath', () => {
  describe('direct field matches', () => {
    it('should match exact field names', () => {
      expect(shouldRedactPath('phone')).toBe(true);
      expect(shouldRedactPath('email')).toBe(true);
      expect(shouldRedactPath('password')).toBe(true);
      expect(shouldRedactPath('firstName')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(shouldRedactPath('PHONE')).toBe(true);
      expect(shouldRedactPath('Email')).toBe(true);
      expect(shouldRedactPath('PASSWORD')).toBe(true);
    });
  });

  describe('nested path matches', () => {
    it('should match nested paths ending with redactable field', () => {
      expect(shouldRedactPath('user.phone')).toBe(true);
      expect(shouldRedactPath('patient.email')).toBe(true);
      expect(shouldRedactPath('req.body.firstName')).toBe(true);
    });

    it('should match deeply nested paths', () => {
      expect(shouldRedactPath('app.user.contact.phone')).toBe(true);
      expect(shouldRedactPath('response.data.patient.email')).toBe(true);
    });

    it('should be case-insensitive for nested paths', () => {
      expect(shouldRedactPath('user.PHONE')).toBe(true);
      expect(shouldRedactPath('USER.phone')).toBe(true);
      expect(shouldRedactPath('User.Phone')).toBe(true);
    });
  });

  describe('non-matching paths', () => {
    it('should not match safe field names', () => {
      expect(shouldRedactPath('id')).toBe(false);
      expect(shouldRedactPath('status')).toBe(false);
      expect(shouldRedactPath('createdAt')).toBe(false);
      expect(shouldRedactPath('amount')).toBe(false);
    });

    it('should not match partial field name matches', () => {
      expect(shouldRedactPath('phoneType')).toBe(false); // 'phone' is not at the end
      expect(shouldRedactPath('emailVerified')).toBe(false);
      expect(shouldRedactPath('passwordHash')).toBe(false);
    });

    it('should not match fields that merely contain redactable keywords', () => {
      expect(shouldRedactPath('smartphone')).toBe(false);
      expect(shouldRedactPath('emailed')).toBe(false);
    });
  });

  describe('medical/HIPAA fields', () => {
    it('should redact medical fields', () => {
      expect(shouldRedactPath('diagnosis')).toBe(true);
      expect(shouldRedactPath('symptoms')).toBe(true);
      expect(shouldRedactPath('medications')).toBe(true);
      expect(shouldRedactPath('allergies')).toBe(true);
    });

    it('should redact nested medical fields', () => {
      expect(shouldRedactPath('patient.diagnosis')).toBe(true);
      expect(shouldRedactPath('record.medicalHistory')).toBe(true);
    });
  });

  describe('authentication fields', () => {
    it('should redact auth fields', () => {
      expect(shouldRedactPath('password')).toBe(true);
      expect(shouldRedactPath('token')).toBe(true);
      expect(shouldRedactPath('apiKey')).toBe(true);
      expect(shouldRedactPath('secret')).toBe(true);
    });

    it('should redact nested auth fields', () => {
      expect(shouldRedactPath('user.password')).toBe(true);
      expect(shouldRedactPath('auth.accessToken')).toBe(true);
      expect(shouldRedactPath('config.apiKey')).toBe(true);
    });
  });

  describe('WhatsApp specific fields', () => {
    it('should redact WhatsApp PII fields', () => {
      expect(shouldRedactPath('from')).toBe(true);
      expect(shouldRedactPath('to')).toBe(true);
      expect(shouldRedactPath('wa_id')).toBe(true);
    });

    it('should redact nested WhatsApp fields', () => {
      expect(shouldRedactPath('message.from')).toBe(true);
      expect(shouldRedactPath('webhook.profile.name')).toBe(true);
    });
  });

  describe('address fields', () => {
    it('should redact address components', () => {
      expect(shouldRedactPath('address')).toBe(true);
      expect(shouldRedactPath('city')).toBe(true);
      expect(shouldRedactPath('zipCode')).toBe(true);
      expect(shouldRedactPath('streetAddress')).toBe(true);
    });
  });

  describe('name variants', () => {
    it('should handle different naming conventions', () => {
      // camelCase
      expect(shouldRedactPath('firstName')).toBe(true);
      expect(shouldRedactPath('phoneNumber')).toBe(true);

      // snake_case
      expect(shouldRedactPath('first_name')).toBe(true);
      expect(shouldRedactPath('phone_number')).toBe(true);
    });
  });
});

describe('Security and HIPAA compliance', () => {
  it('should redact all critical PII in a patient record', () => {
    const message = `Patient John Doe, Phone: 0712345678, Email: john@example.com, Card: 4532-1234-5678-9010`;

    const redacted = redactString(message);

    // Should not contain any PII
    expect(redacted).not.toContain('0712345678');
    expect(redacted).not.toContain('john@example.com');
    expect(redacted).not.toContain('4532-1234-5678-9010');

    // Should contain redaction markers
    expect(redacted).toContain('[REDACTED:');
  });

  it('should prevent PII leakage in error messages', () => {
    const errorMsg = 'Failed to send SMS to 0712345678 at 192.168.1.100';
    const redacted = redactString(errorMsg);

    expect(redacted).not.toContain('0712345678');
    expect(redacted).toContain('[REDACTED:phone]');
  });
});
