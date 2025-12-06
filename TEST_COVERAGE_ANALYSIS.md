# Test Coverage Analysis Report

**Generated:** 2025-12-06
**Repository:** medicalcor-core
**Analysis Type:** Exhaustive Total Coverage Audit

---

## Executive Summary

| Metric               | Value                                  | Status                 |
| -------------------- | -------------------------------------- | ---------------------- |
| **Total Test Files** | 127                                    | -                      |
| **Total Tests**      | 5,611                                  | -                      |
| **Passed Tests**     | 5,610                                  | 99.98%                 |
| **Failed Tests**     | 1                                      | `scheduling.test.ts`   |
| **Coverage Target**  | 60% lines, 60% functions, 50% branches | Per `vitest.config.ts` |

### Module Coverage Summary

| Module                    | Source Files | Test Files | Test Ratio | Status     |
| ------------------------- | :----------: | :--------: | :--------: | ---------- |
| **packages/integrations** |      24      |     19     |  **79%**   | Good       |
| **apps/trigger**          |      15      |     9      |  **60%**   | Acceptable |
| **apps/api**              |      27      |     9      |  **33%**   | Low        |
| **packages/types**        |      23      |     7      |  **30%**   | Low        |
| **packages/domain**       |      58      |     17     |  **29%**   | Low        |
| **packages/core**         |     179      |     49     |  **27%**   | Critical   |
| **packages/application**  |      16      |     3      | **18.8%**  | Critical   |
| **apps/web**              |     230      |     12     |  **5.2%**  | **SEVERE** |
| **TOTAL**                 |   **572**    |  **125**   | **21.9%**  | Poor       |

---

## Critical Gap Analysis

### 1. GDPR/Privacy Compliance (Priority 1 - Legal Risk)

**Files Without Tests:**

| File                                                        | Lines | Risk                                             |
| ----------------------------------------------------------- | ----- | ------------------------------------------------ |
| `apps/api/src/routes/gdpr.ts`                               | 607   | **CRITICAL** - No tests for data export/deletion |
| `apps/web/app/api/gdpr/delete-request/route.ts`             | -     | **CRITICAL** - No tests                          |
| `apps/web/app/api/gdpr/export/route.ts`                     | -     | **CRITICAL** - No tests                          |
| `packages/domain/src/consent/consent-service.ts`            | 640   | **CRITICAL** - No tests for consent management   |
| `packages/core/src/security/gdpr/data-inventory-service.ts` | -     | No tests                                         |
| `packages/core/src/security/gdpr/retention-service.ts`      | -     | No tests                                         |

**Impact:** GDPR non-compliance could result in fines up to 4% of annual revenue.

### 2. Clinical Scoring Engine (Priority 1 - Patient Safety)

**Files Without Tests:**

| File                                                     | Lines | Risk                                                       |
| -------------------------------------------------------- | ----- | ---------------------------------------------------------- |
| `packages/core/src/clinical/osax-scoring-engine.ts`      | 483   | **CRITICAL** - Orchestrates clinical scoring with no tests |
| `packages/core/src/ai-gateway/medical-functions.ts`      | -     | **CRITICAL** - Medical AI functions untested               |
| `packages/domain/src/osax/services/OsaxScoringPolicy.ts` | -     | No tests                                                   |
| `packages/domain/src/scoring/scoring-service.ts`         | -     | No tests                                                   |

**Impact:** Clinical scoring errors could affect patient treatment decisions.

### 3. Security & Encryption (Priority 1 - Security Risk)

**Files Without Tests:**

| File                                                       | Lines | Risk         |
| ---------------------------------------------------------- | ----- | ------------ |
| `packages/core/src/architecture/security/encryption.ts`    | -     | **CRITICAL** |
| `apps/api/src/plugins/csrf-protection.ts`                  | -     | **HIGH**     |
| `apps/api/src/plugins/api-auth.ts`                         | -     | **HIGH**     |
| `apps/api/src/plugins/verify-pipedrive-signature.ts`       | -     | **HIGH**     |
| `packages/core/src/architecture/security/authorization.ts` | -     | **HIGH**     |
| `packages/core/src/architecture/security/zero-trust.ts`    | -     | **HIGH**     |

### 4. Webhook Handlers (Priority 2 - Integration Reliability)

**Files Without Tests:**

| File                                       | Risk |
| ------------------------------------------ | ---- |
| `apps/api/src/routes/webhooks/crm.ts`      | HIGH |
| `apps/api/src/routes/webhooks/booking.ts`  | HIGH |
| `apps/api/src/routes/webhooks/vapi.ts`     | HIGH |
| `apps/api/src/routes/webhooks/voice.ts`    | HIGH |
| `apps/api/src/routes/webhooks/whatsapp.ts` | HIGH |

### 5. Frontend Critical Path (Priority 2)

**apps/web - 230 source files, only 12 test files (5.2% coverage)**

**Critical Untested Areas:**

- All server actions (27 files)
- All OSAX dashboard components (15 files)
- All page components (50+ pages)
- Authentication routes
- GDPR API routes

---

## Detailed Module Analysis

### packages/domain (58 source files | 17 test files | 29%)

**Well-Tested:**

- Triage service (comprehensive tests)
- Scoring (comprehensive + property-based tests)
- Value objects
- OSAX events and entities (partial)

**Missing Tests:**

- `consent/consent-service.ts` - GDPR-critical consent management
- `consent/consent-repository.ts` - Persistence layer
- `scheduling/scheduling-service.ts` - Patient scheduling
- `language/language-service.ts` - Localization
- `patient-acquisition/use-cases/score-lead.ts` - Lead scoring use case
- All AllOnX entities and services

### packages/core (179 source files | 49 test files | 27%)

**Well-Tested:**

- AI Gateway (function registry, response cache, conversation context)
- Auth (auth-service, mfa-service, password-reset)
- CQRS (commands, query-bus, event-replay)
- Infrastructure (redis-client, disaster-recovery)

**Missing Tests (Critical):**

- `clinical/osax-scoring-engine.ts` - Clinical scoring orchestration
- `ai-gateway/medical-functions.ts` - Medical AI functions
- `rag/*.ts` - RAG pipeline components
- `security/gdpr/*.ts` - GDPR services
- All architecture layer files (40+ files)
- All observability files

### packages/integrations (24 source files | 19 test files | 79%)

**Status:** Best coverage in codebase

**Missing Tests:**

- `mock.adapter.ts`
- `telemetry.ts`
- `notifications.ts`

### packages/application (16 source files | 3 test files | 18.8%)

**Well-Tested:**

- `rbac-policy.test.ts`
- `security-context.test.ts`
- `create-osax-case.test.ts`

**Missing Tests:**

- All port/interface definitions
- Audit service contracts
- Event publisher interface
- Domain error handling

### apps/api (27 source files | 9 test files | 33%)

**Well-Tested:**

- routes.test.ts (93 tests)
- webhooks.test.ts
- webhook-signature-validation.test.ts

**Missing Tests:**

- All GDPR routes
- All webhook handlers (crm, booking, vapi, voice, whatsapp)
- All plugins (auth, csrf, rate-limit)
- Supervisor WebSocket

### apps/trigger (15 source files | 9 test files | 60%)

**Well-Tested:**

- workflows.test.ts
- lead-scoring.test.ts
- urgent-case-escalation.test.ts

**Missing Tests:**

- cron-jobs.ts
- embedding-refresh.ts
- notification-dispatcher.ts
- patient-journey.ts

### apps/web (230 source files | 12 test files | 5.2%)

**CRITICAL GAP - Lowest coverage in codebase**

**Missing Tests:**

- 27 server action files
- 15 OSAX dashboard files
- 50+ page components
- All UI component library
- All feature components
- Route handlers

---

## Failing Test

```
FAIL packages/integrations/src/__tests__/scheduling.test.ts
  > SchedulingService API methods > getPatientAppointments > should build correct query parameters

AssertionError: expected 'https://scheduling.example.com/api/v1...' to contain 'status=confirmed'

Expected: "status=confirmed"
Received: "https://scheduling.example.com/api/v1/appointments?patient_phone=%2B40712345678&limit=10"
```

**Location:** `packages/integrations/src/__tests__/scheduling.test.ts:1010`

---

## Recommendations

### Immediate Actions (This Sprint)

1. **Add tests for GDPR endpoints**
   - `apps/api/src/routes/gdpr.ts` - export, delete, consent-status
   - `apps/web/app/api/gdpr/*` - route handlers

2. **Add tests for osax-scoring-engine.ts**
   - Score case flow
   - Batch scoring
   - Rescore case
   - Error handling

3. **Add tests for consent-service.ts**
   - Grant/withdraw consent
   - Consent validation
   - GDPR export/erasure
   - Audit trail

4. **Fix failing test in scheduling.test.ts**

### Short Term (Sprint 1-2)

1. Increase `packages/core` coverage to 50%+
2. Increase `packages/domain` coverage to 50%+
3. Add tests for all webhook handlers
4. Add tests for authentication/security plugins

### Medium Term (Sprint 3-4)

1. Increase `apps/web` coverage to 25%+
2. Add tests for OSAX dashboard components
3. Add tests for RAG pipeline
4. Complete `packages/application` coverage

### Long Term

1. Establish 60% minimum coverage for all modules
2. Add coverage gates to CI/CD pipeline
3. Create test templates for common patterns
4. Monthly coverage audits

---

## CI/CD Integration

Add to `.github/workflows/test.yml`:

```yaml
- name: Run tests with coverage
  run: pnpm test -- --coverage

- name: Check coverage thresholds
  run: |
    pnpm vitest run --coverage --coverage.thresholdAutoUpdate=false
```

Current thresholds from `vitest.config.ts`:

```typescript
thresholds: {
  lines: 60,
  functions: 60,
  branches: 50,
  statements: 60,
}
```

---

## Files Requiring Immediate Attention

| Priority | File                                                | Reason                            |
| -------- | --------------------------------------------------- | --------------------------------- |
| P0       | `packages/core/src/clinical/osax-scoring-engine.ts` | Clinical scoring - patient safety |
| P0       | `packages/domain/src/consent/consent-service.ts`    | GDPR compliance                   |
| P0       | `apps/api/src/routes/gdpr.ts`                       | GDPR compliance                   |
| P0       | `apps/web/app/api/gdpr/*`                           | GDPR compliance                   |
| P1       | `packages/core/src/ai-gateway/medical-functions.ts` | Medical AI                        |
| P1       | `apps/api/src/plugins/api-auth.ts`                  | Authentication                    |
| P1       | `apps/api/src/plugins/csrf-protection.ts`           | Security                          |
| P1       | `apps/api/src/routes/webhooks/*.ts`                 | Integration reliability           |
| P2       | `apps/web/app/actions/*.ts`                         | Server actions                    |
| P2       | `apps/web/app/osax-dashboard/*`                     | OSAX dashboard                    |

---

_Report generated by Claude Code analysis_
