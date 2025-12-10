# EXECUTION MATRIX
## Surgical Constraints Implementation Tracker

**Status Key:**
- `[ ]` Not Started
- `[~]` In Progress
- `[x]` Completed
- `[!]` Blocked

---

## Sprint 1: Architecture Remediation (CRITICAL)

### Objective: Fix 5 Domain Layer Violations

| # | Task | Owner | Status | Deadline | Dependencies |
|---|------|-------|--------|----------|--------------|
| 1.1 | Create `AgentPerformanceRepositoryPort` in application layer | - | [ ] | - | None |
| 1.2 | Create `PostgresAgentPerformanceRepository` adapter | - | [ ] | - | 1.1 |
| 1.3 | Refactor `agent-performance-repository.ts` to use port | - | [ ] | - | 1.2 |
| 1.4 | Create `BehavioralInsightsRepositoryPort` | - | [ ] | - | None |
| 1.5 | Create `PostgresBehavioralInsightsRepository` adapter | - | [ ] | - | 1.4 |
| 1.6 | Refactor `behavioral-insights-service.ts` to use port | - | [ ] | - | 1.5 |
| 1.7 | Create `DataLineageRepositoryPort` | - | [ ] | - | None |
| 1.8 | Create `PostgresDataLineageRepository` adapter | - | [ ] | - | 1.7 |
| 1.9 | Refactor `data-lineage-service.ts` to use port | - | [ ] | - | 1.8 |
| 1.10 | Create `SupervisorStateRepositoryPort` | - | [ ] | - | None |
| 1.11 | Create `PostgresSupervisorStateRepository` adapter | - | [ ] | - | 1.10 |
| 1.12 | Refactor `supervisor-state-repository.ts` to use port | - | [ ] | - | 1.11 |
| 1.13 | Move `flex-routing-adapter.ts` to infrastructure layer | - | [ ] | - | None |
| 1.14 | Verify all violations fixed: `pnpm check:layer-boundaries` | - | [ ] | - | 1.3, 1.6, 1.9, 1.12, 1.13 |
| 1.15 | Update `KNOWN_VIOLATIONS` in check script to empty | - | [ ] | - | 1.14 |

**Success Criteria:**
```bash
$ pnpm check:layer-boundaries
Checking layer boundaries...
No layer boundary violations found.
```

---

## Sprint 2: Test Coverage Enhancement

### Objective: Achieve 80%+ Overall Coverage

| # | Task | Owner | Status | Deadline | Dependencies |
|---|------|-------|--------|----------|--------------|
| 2.1 | Create web auth test suite: `login.test.tsx` | - | [ ] | - | None |
| 2.2 | Create web auth test suite: `logout.test.tsx` | - | [ ] | - | None |
| 2.3 | Create web auth test suite: `session-management.test.tsx` | - | [ ] | - | None |
| 2.4 | Create web auth test suite: `mfa-flow.test.tsx` | - | [ ] | - | None |
| 2.5 | Create E2E: `lead-to-patient-conversion.spec.ts` | - | [ ] | - | None |
| 2.6 | Create E2E: `appointment-booking-flow.spec.ts` | - | [ ] | - | None |
| 2.7 | Create E2E: `consent-management.spec.ts` | - | [ ] | - | None |
| 2.8 | Create E2E: `webhook-processing.spec.ts` | - | [ ] | - | None |
| 2.9 | Add property-based tests for domain scoring | - | [ ] | - | None |
| 2.10 | Add property-based tests for triage service | - | [ ] | - | None |
| 2.11 | Run coverage report and verify thresholds | - | [ ] | - | 2.1-2.10 |

**Success Criteria:**
```bash
$ pnpm test:coverage
Coverage: 82% (Target: 80%)
Domain: 94% (Target: 90%)
Core: 91% (Target: 90%)
Web: 71% (Target: 70%)
```

---

## Sprint 3: Technical Debt Resolution

### Objective: Eliminate All High-Priority TODOs

| # | Task | Owner | Status | Deadline | Dependencies |
|---|------|-------|--------|----------|--------------|
| 3.1 | Implement workflow editor (workflows/page.tsx:97-98) | - | [ ] | - | None |
| 3.2 | Implement booking modal (calendar/page.tsx:99) | - | [ ] | - | None |
| 3.3 | Wire monitoring integration (api/routes/ai.ts:145) | - | [ ] | - | None |
| 3.4 | Implement case review check (osax-journey.ts:113) | - | [ ] | - | None |
| 3.5 | Review and close all FIXME comments | - | [ ] | - | None |
| 3.6 | Review and close all HACK comments | - | [ ] | - | None |
| 3.7 | Verify no TODO/FIXME in critical paths | - | [ ] | - | 3.1-3.6 |

**Success Criteria:**
```bash
$ grep -r "TODO\|FIXME\|HACK\|XXX" packages/ apps/ --include="*.ts" --include="*.tsx" | wc -l
0
```

---

## Sprint 4: Automation & Operations

### Objective: Automate Critical Operations

| # | Task | Owner | Status | Deadline | Dependencies |
|---|------|-------|--------|----------|--------------|
| 4.1 | Create key rotation Trigger.dev job | - | [ ] | - | None |
| 4.2 | Implement DEK rotation logic | - | [ ] | - | 4.1 |
| 4.3 | Implement KEK rotation logic | - | [ ] | - | 4.2 |
| 4.4 | Add rotation audit logging | - | [ ] | - | 4.3 |
| 4.5 | Add rotation alerting | - | [ ] | - | 4.4 |
| 4.6 | Create partition maintenance cron | - | [ ] | - | None |
| 4.7 | Create old partition cleanup job | - | [ ] | - | 4.6 |
| 4.8 | Implement soft-delete purge job (GDPR) | - | [ ] | - | None |
| 4.9 | Document runbook for manual rotation | - | [ ] | - | 4.5 |
| 4.10 | Test rotation in staging | - | [ ] | - | 4.9 |

**Success Criteria:**
- Key rotation runs quarterly without manual intervention
- Partitions auto-created 3 months ahead
- Old partitions cleaned up per retention policy

---

## Sprint 5: Observability Enhancement

### Objective: Full Distributed Tracing

| # | Task | Owner | Status | Deadline | Dependencies |
|---|------|-------|--------|----------|--------------|
| 5.1 | Add OpenTelemetry SDK to core | - | [ ] | - | None |
| 5.2 | Instrument API routes with spans | - | [ ] | - | 5.1 |
| 5.3 | Instrument Trigger.dev tasks with spans | - | [ ] | - | 5.1 |
| 5.4 | Instrument database operations | - | [ ] | - | 5.1 |
| 5.5 | Instrument external API calls | - | [ ] | - | 5.1 |
| 5.6 | Configure trace exporter (Jaeger/OTLP) | - | [ ] | - | 5.5 |
| 5.7 | Add trace context propagation to webhooks | - | [ ] | - | 5.6 |
| 5.8 | Create Grafana tracing dashboard | - | [ ] | - | 5.7 |
| 5.9 | Document tracing patterns | - | [ ] | - | 5.8 |

**Success Criteria:**
- End-to-end trace visibility from webhook to response
- P95 latency visible per operation
- Error traces immediately queryable

---

## Constraint Compliance Matrix

| Constraint | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 | Sprint 5 |
|------------|----------|----------|----------|----------|----------|
| HIPAA Encryption | ✅ | ✅ | ✅ | 🔧 (rotation) | ✅ |
| HIPAA Audit | ✅ | ✅ | ✅ | ✅ | 🔧 (traces) |
| GDPR Consent | ✅ | 🔧 (tests) | ✅ | ✅ | ✅ |
| GDPR Erasure | ✅ | 🔧 (tests) | ✅ | 🔧 (purge) | ✅ |
| Hexagonal Architecture | 🔧 (violations) | ✅ | ✅ | ✅ | ✅ |
| Test Coverage | ✅ | 🔧 (coverage) | ✅ | ✅ | ✅ |
| Technical Debt | ✅ | ✅ | 🔧 (TODOs) | ✅ | ✅ |
| Observability | ✅ | ✅ | 🔧 (monitoring) | ✅ | 🔧 (tracing) |

**Legend:**
- ✅ Maintained (no changes needed)
- 🔧 Active work in this sprint

---

## Risk Register

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Layer refactor breaks production | Low | High | Comprehensive test suite, staged rollout |
| Key rotation causes data loss | Very Low | Critical | Test in staging, maintain key history |
| Coverage effort takes longer | Medium | Medium | Prioritize critical paths first |
| TODO fixes introduce regressions | Low | Medium | Code review, test coverage |
| Tracing overhead impacts performance | Low | Medium | Sampling, async export |

---

## Definition of Done

### For Architecture Tasks:
- [ ] Code compiles without errors
- [ ] Layer boundary check passes
- [ ] Unit tests pass
- [ ] Integration tests pass (if applicable)
- [ ] Code reviewed by senior engineer
- [ ] Documentation updated

### For Test Tasks:
- [ ] Test file created with proper structure
- [ ] All assertions meaningful (no empty tests)
- [ ] Coverage threshold met for target code
- [ ] Tests pass in CI

### For Operations Tasks:
- [ ] Job implemented and tested locally
- [ ] Tested in staging environment
- [ ] Runbook documented
- [ ] Alerts configured
- [ ] Rollback procedure documented

---

## Review Schedule

| Review | Frequency | Participants |
|--------|-----------|--------------|
| Sprint Review | Bi-weekly | Engineering Team |
| Architecture Review | Monthly | Architecture Board |
| Compliance Review | Quarterly | Security + Legal |
| Audit | Annual | External Auditor |

---

**Last Updated:** 2025-12-10
**Next Review:** TBD
