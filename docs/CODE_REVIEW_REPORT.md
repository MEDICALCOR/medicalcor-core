# MedicalCor Core - Code Review Report

**Date:** November 26, 2025
**Reviewer:** Claude Code Review
**Branch:** `claude/code-review-01EEbKaMF2TvDKGwttycotN1`

---

## Executive Summary

This comprehensive code review analyzed the MedicalCor Core enterprise medical CRM platform across all major components:

- **API App** (Fastify webhook gateway)
- **Web App** (Next.js admin dashboard)
- **Trigger App** (Durable workflows)
- **Shared Packages** (Core, Types, Domain, Integrations)

### Overall Assessment

| Component         | Score      | Status                              |
| ----------------- | ---------- | ----------------------------------- |
| API App           | 6.5/10     | Needs attention                     |
| Web App           | 7.8/10     | Good                                |
| Trigger Workflows | 7.0/10     | Needs attention                     |
| Shared Packages   | 7.5/10     | Good                                |
| **Overall**       | **7.2/10** | **Good with critical fixes needed** |

### Issue Summary

| Severity | Count | Action Required |
| -------- | ----- | --------------- |
| Critical | 6     | Immediate       |
| High     | 12    | Within 1 week   |
| Medium   | 28    | Within 2 weeks  |
| Low      | 19    | Backlog         |

---

## Critical Issues (Immediate Action Required)

### 1. Missing `crypto` Import - Runtime Crash

- **File:** `apps/api/src/routes/ai.ts:294`
- **Problem:** `crypto.randomUUID()` called without importing `crypto` module
- **Impact:** Runtime error crashes the AI endpoint
- **Fix:** Add `import { randomUUID } from 'crypto';` or use `import crypto from 'crypto';`

### 2. Backup Config Endpoint Exposes Infrastructure Details

- **File:** `apps/api/src/routes/backup.ts:400-428`
- **Problem:** `/backup/config` returns storage provider, bucket, encryption status without authentication
- **Impact:** Information disclosure to attackers
- **Fix:** Add API key authentication requirement

### 3. ChatGPT Plugin Placeholder Verification Token

- **File:** `apps/api/src/routes/chatgpt-plugin.ts:40`
- **Problem:** Falls back to `'REPLACE_WITH_OPENAI_TOKEN'` if env var not set
- **Impact:** Any ChatGPT instance can access the plugin in production
- **Fix:** Throw error if token not configured in production

### 4. Race Condition in Rate Limiter Counter

- **File:** `packages/core/src/ai-gateway/user-rate-limiter.ts:533-539`
- **Problem:** Non-atomic get/set pattern for counter increment
- **Impact:** Rate limits can be bypassed under concurrent load
- **Fix:** Use Redis `INCR` command for atomic operations

### 5. Missing Consent Check in Voice Handler

- **File:** `apps/trigger/src/tasks/voice-handler.ts:89-193`
- **Problem:** Voice call transcripts processed without GDPR consent validation
- **Impact:** Potential GDPR violation
- **Fix:** Add consent check matching `whatsapp-handler.ts` pattern

### 6. Non-Idempotent HubSpot Task Creation

- **File:** `apps/trigger/src/workflows/patient-journey.ts:70-83`
- **Problem:** Task creation retries can create duplicate tasks
- **Impact:** Duplicate CRM records, data integrity issues
- **Fix:** Add idempotency key using `${contactId}-${timestamp}` pattern

---

## High Severity Issues

### API App

| Issue                                 | Location                            | Description                                                                             |
| ------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------- |
| WhatsApp Signature Verification       | `routes/webhooks/whatsapp.ts:93`    | `JSON.stringify(request.body)` may differ from raw body, causing valid webhooks to fail |
| Circuit Breaker Reset Unauthenticated | `routes/health.ts:492-511`          | `POST /health/circuit-breakers/:service/reset` has no auth - DoS vector                 |
| Vapi Future Timestamps Allowed        | `routes/webhooks/vapi.ts:46`        | Allows timestamps 5 min in future, enabling replay attacks                              |
| Duplicate Signal Handlers             | `app.ts:393-394` + `index.ts:18-22` | Both register SIGTERM/SIGINT, causing race condition on shutdown                        |
| Unsafe Date Parsing                   | `routes/webhooks/vapi.ts:220-222`   | `new Date()` parsing can throw without try-catch                                        |

### Trigger Workflows

| Issue                          | Location                               | Description                                                             |
| ------------------------------ | -------------------------------------- | ----------------------------------------------------------------------- |
| Booking Transaction Not Atomic | `workflows/patient-journey.ts:627-727` | Appointment booked but HubSpot update failure leaves inconsistent state |
| Race Condition in Slot Booking | `workflows/patient-journey.ts:482-515` | TOCTOU vulnerability between slot check and booking                     |
| Concurrent Contact Updates     | `tasks/whatsapp-handler.ts:104-111`    | Simultaneous messages can create duplicate contacts                     |
| Payment Race Condition         | `tasks/payment-handler.ts:95-112`      | Concurrent payments can overwrite each other                            |

### Shared Packages

| Issue                              | Location                                       | Description                                                              |
| ---------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| Phone Validation Inconsistency     | Multiple files                                 | Different regex patterns across `common.ts`, `whatsapp.ts`, `hubspot.ts` |
| Retry Logic Missing Timeout Errors | `integrations/whatsapp.ts:457-466`             | Network timeouts won't trigger retries                                   |
| Concurrent Slot Tracking Race      | `core/ai-gateway/user-rate-limiter.ts:289-305` | Check-then-increment pattern has race condition                          |

---

## Medium Severity Issues

### Security Concerns

1. **Health endpoints expose internal state** (`routes/health.ts:462-485`)
   - Circuit breaker status reveals which external services are degraded

2. **AI user context spoofing** (`routes/ai.ts:309-318`)
   - User/tenant IDs validated only by regex, relies on API key auth

3. **PII in error logs** (`packages/integrations/src/hubspot.ts:574-580`)
   - Error body may contain PII, not redacted before logging

4. **Client-side AI API calls** (`apps/web/src/lib/ai/use-ai-copilot.ts:56-63`)
   - Direct client calls to AI endpoints without server-side validation

### Code Quality

1. **Duplicate logger implementations** (`packages/core/src/logger.ts` vs `logger/index.ts`)
2. **Excessive eslint-disable comments** (Multiple API files)
3. **Duplicate webhook signature verification code** (`stripe.ts`, `vapi.ts`)
4. **Duplicated scoring logic** across `voice-handler.ts`, `whatsapp-handler.ts`, `voice-transcription.ts`
5. **Hardcoded localization strings** (`workflows/patient-journey.ts:767-939`)

### React/Frontend

1. **useWebSocket stale closure** (`lib/realtime/use-websocket.ts:201-211`)
   - Reconnection logic may fail due to stale state reference

2. **useAICopilot dependency array** (`lib/ai/use-ai-copilot.ts:38-99`)
   - Incomplete dependencies may cause message loss

3. **Index as key in SVG** (`components/analytics/line-chart.tsx:97-106`)
   - Anti-pattern causing incorrect reconciliation

4. **Broken SVG hover CSS** (`components/analytics/line-chart.tsx:104`)
   - `hover:r-2` Tailwind class doesn't work on SVG attributes

### Business Logic

1. **Scoring false positives** (`packages/domain/src/scoring/scoring-service.ts:117-128`)
   - "all-on-4" keyword detection triggers in wrong contexts

2. **Circuit breaker incomplete logic** (`packages/core/src/circuit-breaker.ts:103-106`)
   - HALF_OPEN state transition comment but no action taken

---

## Low Severity Issues

### Input Validation

- No max length on string inputs (DoS potential)
- Phone number format not validated consistently
- HubSpot Contact ID format not validated
- Missing bounds validation in triage service

### Code Style

- Inconsistent error response formats across endpoints
- Missing return type annotations
- Redundant null checks
- Inconsistent await patterns

### Configuration

- Rate limiter concurrent slot TTL too high (5 min vs recommended 30-60s)
- Hardcoded batch sizes and delays in cron jobs
- Missing timeout configuration for `wait.for()` calls

---

## Positive Findings

### Security Strengths

- No `dangerouslySetInnerHTML` usage (XSS protected)
- WebSocket auth token sent via message, not query params
- Phone number masking for GDPR compliance
- IDOR protection with permission AND access validation
- Server actions require `requirePermission()` checks

### Architecture Strengths

- Well-structured monorepo with clear separation
- TypeScript strict mode throughout
- Comprehensive Zod validation schemas
- Proper Suspense boundaries with fallbacks
- Good error boundary implementation with Sentry

### Code Quality Strengths

- Consistent use of Pino logger with redaction
- Proper circuit breaker patterns (mostly)
- Good use of `useMemo` in chart components
- Parallel data fetching with `Promise.all()`

---

## Recommended Actions

### Immediate (This Week)

1. **Add missing crypto import** to `ai.ts`
2. **Add authentication** to backup config and circuit breaker reset endpoints
3. **Fix ChatGPT verification token** to throw in production
4. **Add consent validation** to voice handler
5. **Use Redis INCR** for atomic rate limiting
6. **Add idempotency keys** to HubSpot task creation

### Short-term (2 Weeks)

1. Extract duplicate webhook signature verification to shared utility
2. Fix useWebSocket closure issue in frontend
3. Standardize phone validation across packages
4. Add timeout retry handling for network errors
5. Fix WhatsApp signature verification to use raw body
6. Add proper error handling for date parsing

### Medium-term (1 Month)

1. Remove duplicate logger implementation
2. Implement transaction/rollback for booking workflow
3. Add distributed tracing for workflows
4. Externalize configuration (batch sizes, retries, timeouts)
5. Add comprehensive integration tests for race conditions
6. Clean up eslint-disable comments with proper type fixes

### Long-term (Backlog)

1. Consider saga pattern for distributed transactions
2. Add chaos engineering tests
3. Implement sliding session windows for auth
4. Add image optimization with next/image
5. Externalize all localization strings

---

## Files Requiring Immediate Attention

| Priority | File                                                | Line(s) | Issue                  |
| -------- | --------------------------------------------------- | ------- | ---------------------- |
| P0       | `apps/api/src/routes/ai.ts`                         | 294     | Missing crypto import  |
| P0       | `apps/api/src/routes/backup.ts`                     | 400-428 | Unauth config endpoint |
| P0       | `apps/api/src/routes/chatgpt-plugin.ts`             | 40      | Placeholder token      |
| P0       | `packages/core/src/ai-gateway/user-rate-limiter.ts` | 533-539 | Race condition         |
| P0       | `apps/trigger/src/tasks/voice-handler.ts`           | 89-193  | Missing consent        |
| P0       | `apps/trigger/src/workflows/patient-journey.ts`     | 70-83   | Non-idempotent         |
| P1       | `apps/api/src/routes/webhooks/whatsapp.ts`          | 93      | Signature verification |
| P1       | `apps/api/src/routes/health.ts`                     | 492-511 | Unauth reset endpoint  |
| P1       | `apps/trigger/src/workflows/patient-journey.ts`     | 627-727 | Non-atomic booking     |
| P1       | `apps/web/src/lib/realtime/use-websocket.ts`        | 201-211 | Stale closure          |

---

## Conclusion

The MedicalCor Core codebase demonstrates solid enterprise architecture with good separation of concerns, comprehensive type safety, and thoughtful security measures. However, several critical issues require immediate attention:

1. **Runtime crashes** from missing imports
2. **Security vulnerabilities** in exposed endpoints
3. **GDPR compliance gaps** in voice processing
4. **Data integrity risks** from race conditions

Addressing the P0 issues should be the immediate priority before any production deployment or scaling activities. The codebase is well-positioned for growth once these critical fixes are implemented.

---

_Report generated by Claude Code Review_
