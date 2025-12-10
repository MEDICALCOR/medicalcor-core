# MedicalCor Core - Audit Framework V2

**Version:** 2.0
**Date:** December 10, 2025
**Status:** Active Audit Framework
**Last Analysis:** December 10, 2025

---

## Executive Summary

### Current Test Infrastructure

| Metric                  | Value          | Status     |
| ----------------------- | -------------- | ---------- |
| **Total Test Files**    | 350            | -          |
| **Total Tests**         | 15,497         | -          |
| **Passed Tests**        | 15,393 (99.5%) | Good       |
| **Failed Tests**        | 78             | Needs Fix  |
| **Skipped Tests**       | 26             | -          |
| **Test Execution Time** | ~65s           | Acceptable |

### Coverage Assessment by Critical Component

| Component                   | Tests | Estimated Coverage | Target | Gap  |
| --------------------------- | ----- | ------------------ | ------ | ---- |
| Voice/Vapi                  | 246   | 90%                | 95%    | -5%  |
| GDPR/Consent                | 216   | 92%                | 100%   | -8%  |
| Booking/Scheduling          | 162   | 85%                | 100%   | -15% |
| Payment Processing (Stripe) | 156   | 85%                | 100%   | -15% |
| Medical Data (Patients)     | 135   | 75%                | 100%   | -25% |
| AI Lead Scoring             | 110   | 75%                | 95%    | -20% |
| Authentication              | 107   | 80%                | 95%    | -15% |
| WhatsApp                    | 105   | 85%                | 100%   | -15% |

---

## Risk Classification

### CRITICAL (100% Coverage Required)

These components handle patient data, payments, or have legal/compliance implications:

1. **Payment Processing** (`@medicalcor/integrations/stripe`)
   - Transaction amounts: EUR 4,500-18,000
   - PCI-DSS compliance required
   - Fraud prevention critical

2. **Medical Data Management** (`@medicalcor/domain/patients`)
   - HIPAA compliance required
   - PHI encryption mandatory
   - Audit trail required

3. **Booking & Scheduling** (`@medicalcor/domain/bookings`)
   - Revenue-critical path
   - Patient appointment management
   - Cancellation policies

4. **AI Lead Scoring** (`@medicalcor/core/ai-gateway` + `@medicalcor/domain/scoring`)
   - GPT-4o integration
   - Lead qualification decisions
   - Cost management (API usage)

5. **WhatsApp Business API** (`@medicalcor/integrations/whatsapp`)
   - Patient communication
   - Consent management
   - Template compliance

6. **Voice AI Integration** (`@medicalcor/integrations/vapi`)
   - TCPA compliance
   - Call recording consent
   - Transcript handling

### HIGH PRIORITY (95%+ Coverage Required)

7. **Authentication** (`@medicalcor/core/auth`)
   - Session management
   - Password security
   - MFA implementation

8. **HubSpot CRM** (`@medicalcor/integrations/hubspot`)
   - Lead synchronization
   - Deal pipeline management
   - Contact deduplication

### STANDARD (85%+ Coverage Required)

9. **RAG Knowledge Base** (`@medicalcor/core/rag`)
10. **CQRS & Event Sourcing** (`@medicalcor/core/cqrs`)

---

## Detailed Gap Analysis

### 1. Payment Processing - Critical Gaps

**Current Status:** 156 tests, ~85% coverage

**Missing Test Scenarios:**

| Test Category                      | Gap                           | Priority | Est. Tests |
| ---------------------------------- | ----------------------------- | -------- | ---------- |
| PCI-DSS card data handling         | No validation of tokenization | P0       | 5-8        |
| Zero-decimal currencies (JPY, KWD) | Currency edge cases           | P1       | 4-6        |
| Concurrent payment race conditions | Double-charge prevention      | P0       | 4-6        |
| Webhook ordering guarantees        | Out-of-order webhook handling | P1       | 3-5        |
| 3DS authentication timeout         | Browser close scenarios       | P1       | 2-3        |
| Partial refund chaining            | Multiple partial refunds      | P2       | 3-4        |

**Required Tests:**

```typescript
// File: packages/integrations/src/__tests__/stripe-pci.test.ts
describe('PCI-DSS Compliance', () => {
  test('never logs card numbers');
  test('uses Stripe tokenization');
  test('validates card data handling restrictions');
});

describe('Currency Edge Cases', () => {
  test('handles JPY zero-decimal correctly');
  test('handles KWD three-decimal correctly');
  test('rounds amounts according to currency');
});

describe('Race Condition Prevention', () => {
  test('prevents double-charge with idempotency key');
  test('handles concurrent payment attempts');
});
```

### 2. Medical Data Management - Critical Gaps

**Current Status:** 135 tests, ~75% coverage

**Missing Test Scenarios:**

| Test Category                | Gap                              | Priority | Est. Tests |
| ---------------------------- | -------------------------------- | -------- | ---------- |
| HIPAA medical records        | No medical history storage tests | P0       | 12-15      |
| PHI encryption validation    | Encryption at rest verification  | P0       | 4-6        |
| Audit trail completeness     | Medical data access logging      | P0       | 5-7        |
| Patient data export (GDPR)   | HL7 FHIR format compliance       | P1       | 6-8        |
| CNP validation edge cases    | Birth year before 1900           | P2       | 2-3        |
| Multi-insurance coordination | Co-payment calculations          | P1       | 4-6        |

**Required Tests:**

```typescript
// File: packages/domain/src/patients/__tests__/hipaa-compliance.test.ts
describe('HIPAA Medical Records', () => {
  test('encrypts medical history at rest with AES-256');
  test('logs all medical data access with user ID');
  test('validates medical conditions against ICD-10');
  test('preserves historical data on updates (append-only)');
  test('requires dentist authentication for medical updates');
});

describe('GDPR Data Export', () => {
  test('exports data compatible with HL7 FHIR standard');
  test('includes all related appointments, treatments, payments');
  test('generates GDPR-compliant data inventory');
});
```

### 3. Booking & Scheduling - Critical Gaps

**Current Status:** 162 tests, ~85% coverage

**Missing Test Scenarios:**

| Test Category                | Gap                       | Priority | Est. Tests |
| ---------------------------- | ------------------------- | -------- | ---------- |
| Clinic operating hours       | Business hours validation | P1       | 6-8        |
| DST transitions              | Timezone edge cases       | P1       | 3-4        |
| Wait list management         | Cancellation fill logic   | P2       | 4-5        |
| Equipment reservation        | Surgical suite conflicts  | P1       | 3-4        |
| Multi-day treatment blocking | All-on-X consecutive days | P1       | 3-4        |

**Required Tests:**

```typescript
// File: packages/domain/src/bookings/__tests__/scheduling-edge-cases.test.ts
describe('Clinic Hours Validation', () => {
  test('blocks booking outside 9AM-6PM');
  test('blocks booking during national holidays');
  test('respects dentist vacation schedules');
});

describe('Timezone Handling', () => {
  test('handles DST transition correctly');
  test('converts patient timezone to clinic timezone');
  test('handles appointment spanning midnight');
});
```

### 4. AI Lead Scoring - Critical Gaps

**Current Status:** 110 tests, ~75% coverage

**Missing Test Scenarios:**

| Test Category              | Gap                          | Priority | Est. Tests |
| -------------------------- | ---------------------------- | -------- | ---------- |
| GPT-4o API integration     | No actual LLM call tests     | P0       | 8-12       |
| Token usage tracking       | Cost estimation missing      | P1       | 4-5        |
| Model drift detection      | Score consistency validation | P1       | 3-4        |
| Adversarial input handling | Prompt injection tests       | P0       | 5-6        |
| Performance benchmarks     | Response time validation     | P2       | 2-3        |

**Required Tests:**

```typescript
// File: packages/domain/src/scoring/__tests__/gpt4o-integration.test.ts
describe('GPT-4o Integration', () => {
  test('handles OpenAI rate limit (429) with backoff');
  test('validates score is between 1-5');
  test('falls back to rule-based scoring if AI fails');
  test('caches scores for 24h');
  test('logs all AI decisions for audit');
});

describe('Security', () => {
  test('sanitizes input to prevent prompt injection');
  test('validates response format strictly');
});
```

### 5. WhatsApp Business API - Critical Gaps

**Current Status:** 105 tests, ~85% coverage

**Missing Test Scenarios:**

| Test Category              | Gap                       | Priority | Est. Tests |
| -------------------------- | ------------------------- | -------- | ---------- |
| Media upload validation    | File size/type checks     | P1       | 5-7        |
| Template approval workflow | Pending template handling | P1       | 3-4        |
| Bulk campaign management   | Message queue persistence | P2       | 4-5        |
| Quality rating monitoring  | Account health checks     | P2       | 2-3        |

### 6. Voice/Vapi Integration - Critical Gaps

**Current Status:** 246 tests, ~90% coverage

**Missing Test Scenarios:**

| Test Category               | Gap                     | Priority | Est. Tests |
| --------------------------- | ----------------------- | -------- | ---------- |
| TCPA compliance             | Do-not-call validation  | P0       | 8-10       |
| Call recording consent      | Disclosure requirements | P0       | 4-5        |
| PII redaction in recordings | Transcript scrubbing    | P0       | 5-6        |
| Caller ID validation        | Spoofing prevention     | P1       | 3-4        |

### 7. Authentication - Critical Gaps

**Current Status:** 107 tests, ~80% coverage

**Missing Test Scenarios:**

| Test Category                | Gap                     | Priority | Est. Tests |
| ---------------------------- | ----------------------- | -------- | ---------- |
| OAuth/OIDC SSO               | External provider tests | P1       | 8-10       |
| Session hijacking prevention | Token rotation          | P0       | 6-8        |
| API key rotation             | Graceful key expiry     | P1       | 4-5        |

### 8. GDPR/Consent - Critical Gaps

**Current Status:** 216 tests, ~92% coverage

**Missing Test Scenarios:**

| Test Category                   | Gap                        | Priority | Est. Tests |
| ------------------------------- | -------------------------- | -------- | ---------- |
| Consent revocation verification | Downstream propagation     | P0       | 5-7        |
| Third-party data sharing        | Partner agreement tracking | P1       | 6-8        |
| CCPA/LGPD compliance            | Regional variations        | P2       | 4-6        |

---

## Remediation Roadmap

### Phase 1: Critical Compliance (Week 1-2)

**Focus:** P0 gaps only - Legal and safety critical

| Task                        | Tests | Owner   | Deadline |
| --------------------------- | ----- | ------- | -------- |
| HIPAA medical records tests | 12-15 | Backend | Day 3    |
| TCPA compliance tests       | 8-10  | Backend | Day 5    |
| PCI-DSS compliance tests    | 5-8   | Backend | Day 7    |
| GPT-4o integration tests    | 8-12  | AI Team | Day 10   |
| Fix 78 failing tests        | 78    | All     | Day 1-2  |

**Estimated Effort:** 35-45 new tests, 2 developers, 10 days

### Phase 2: High Priority (Week 3-4)

**Focus:** P1 gaps - Production reliability

| Task                      | Tests | Owner    | Deadline |
| ------------------------- | ----- | -------- | -------- |
| Payment edge cases        | 10-14 | Backend  | Day 14   |
| Authentication security   | 14-18 | Security | Day 17   |
| Scheduling constraints    | 11-15 | Backend  | Day 21   |
| WhatsApp media validation | 8-11  | Backend  | Day 24   |

**Estimated Effort:** 43-58 new tests, 2 developers, 14 days

### Phase 3: Hardening (Week 5-6)

**Focus:** P2 gaps - Quality of life

| Task                   | Tests | Owner        | Deadline |
| ---------------------- | ----- | ------------ | -------- |
| Low-priority gaps      | 27-45 | Team         | Day 35   |
| Performance benchmarks | 3-4   | DevOps       | Day 38   |
| Documentation updates  | -     | Tech Writing | Day 42   |

**Estimated Effort:** 30-49 new tests, 2 developers, 14 days

---

## CI/CD Integration

### Coverage Gates Configuration

Update `vitest.config.ts`:

```typescript
thresholds: {
  lines: 85,        // Currently set, enforce
  functions: 85,    // Currently set, enforce
  branches: 85,     // Increase from current
  statements: 85,   // Currently set, enforce
  // Critical path enforcement
  'packages/integrations/src/stripe*.ts': {
    lines: 100,
    functions: 100,
  },
  'packages/domain/src/patients/**/*.ts': {
    lines: 100,
    functions: 100,
  },
  'packages/domain/src/consent/**/*.ts': {
    lines: 100,
    functions: 100,
  },
}
```

### GitHub Actions Workflow

Add to `.github/workflows/ci.yml`:

```yaml
- name: Run tests with coverage
  run: pnpm test:coverage

- name: Check critical path coverage
  run: |
    # Ensure critical paths have 100% coverage
    pnpm vitest run --coverage \
      --coverage.include='packages/integrations/src/stripe*' \
      --coverage.include='packages/domain/src/patients/**' \
      --coverage.include='packages/domain/src/consent/**' \
      --coverage.thresholds.lines=100

- name: Upload coverage to Codecov
  uses: codecov/codecov-action@v4
  with:
    token: ${{ secrets.CODECOV_TOKEN }}
    fail_ci_if_error: true
```

---

## Test Quality Standards

### Test Naming Convention

```typescript
// Good: Describes behavior and expected outcome
test('should return HOT score (5/5) for explicit booking intent with urgency');
test('should reject payment with expired card and return card_declined error');

// Bad: Vague or implementation-focused
test('test scoring');
test('stripe works');
```

### Test Structure (AAA Pattern)

```typescript
test('should process refund within cancellation period', async () => {
  // Arrange
  const payment = await createPayment({ amount: 4500, currency: 'EUR' });
  const booking = await createBooking({ paymentId: payment.id });

  // Act
  const refund = await refundService.processRefund({
    bookingId: booking.id,
    reason: 'customer_cancellation',
  });

  // Assert
  expect(refund.status).toBe('succeeded');
  expect(refund.amount).toBe(4500);
  expect(booking.status).toBe('cancelled');
});
```

### Property-Based Testing (Critical Paths)

```typescript
import fc from 'fast-check';

describe('Lead Scoring Properties', () => {
  it('should always return score between 1-5', () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const result = scoringService.score({ message });
        return result.score >= 1 && result.score <= 5;
      })
    );
  });
});
```

---

## Monitoring & Alerts

### Test Health Dashboard

Track these metrics:

| Metric                 | Target | Alert Threshold |
| ---------------------- | ------ | --------------- |
| Test pass rate         | 100%   | < 99.5%         |
| Coverage (lines)       | 85%+   | < 80%           |
| Critical path coverage | 100%   | < 95%           |
| Test execution time    | < 2min | > 3min          |
| Flaky test rate        | 0%     | > 1%            |

### Weekly Review Checklist

- [ ] All tests passing
- [ ] No new flaky tests
- [ ] Coverage maintained or improved
- [ ] Critical paths at 100%
- [ ] No skipped tests in critical paths
- [ ] Test execution time stable

---

## Appendix: Test File Inventory

### Critical Component Test Files

```
packages/integrations/src/__tests__/
├── stripe.test.ts                 (Payment processing)
├── stripe-financing.test.ts       (Patient financing)
├── contracts/stripe.contract.test.ts
├── whatsapp.test.ts               (WhatsApp API)
├── vapi.test.ts                   (Voice AI)
├── vapi-edge-cases.test.ts
├── hubspot.test.ts                (CRM sync)
└── scheduling.test.ts             (Booking)

packages/domain/src/
├── __tests__/
│   ├── scoring.test.ts            (Lead scoring)
│   ├── scoring-comprehensive.test.ts
│   ├── scoring-property-based.test.ts
│   ├── consent.test.ts            (GDPR consent)
│   └── triage.test.ts
├── patients/
│   └── __tests__/Patient.test.ts  (Medical data)
└── consent/
    └── __tests__/consent-service.test.ts

packages/core/src/
├── auth/__tests__/                (Authentication)
├── ai-gateway/__tests__/          (AI scoring)
├── security/gdpr/__tests__/       (GDPR services)
└── rag/__tests__/                 (Knowledge base)

apps/api/src/__tests__/
├── stripe-webhook.test.ts
├── vapi-webhook.test.ts
├── booking-webhook.test.ts
├── gdpr.test.ts
└── api-auth.test.ts
```

---

## Success Criteria

### Phase 1 Exit Criteria

- [ ] All 78 failing tests fixed
- [ ] HIPAA compliance tests added (12-15)
- [ ] TCPA compliance tests added (8-10)
- [ ] PCI-DSS tests added (5-8)
- [ ] GPT-4o integration tests added (8-12)
- [ ] Overall coverage maintained at 85%+

### Phase 2 Exit Criteria

- [ ] All P1 gaps addressed
- [ ] Critical path coverage at 100%
- [ ] No flaky tests
- [ ] CI/CD coverage gates enforced

### Phase 3 Exit Criteria

- [ ] All P2 gaps addressed
- [ ] Documentation complete
- [ ] Performance benchmarks passing
- [ ] Weekly test health reviews established

---

_This audit framework is a living document. Update as test coverage improves._
