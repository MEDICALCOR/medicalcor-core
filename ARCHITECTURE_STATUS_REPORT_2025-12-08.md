# ARCHITECTURE STATUS REPORT: MedicalCor Core

**Audit Date:** 2025-12-08
**Auditor:** Chief Software Architect (Tech Audit)
**Repo:** medicalcor/medicalcor-core
**Codebase Size:** ~128,000 lines TypeScript + 14,885 lines SQL migrations

---

## EXECUTIVE SUMMARY

### Overall Status: YELLOW – Structurally Sound, Critical Gaps Remain

**One-sentence verdict:** This is a *legitimately enterprise-grade architecture* with excellent DDD/hexagonal foundations and ~92% implementation of core systems, but it is **NOT production-ready for medical/banking-grade** due to test coverage gaps, incomplete LTV pipeline, and call center workflow gaps.

| Area | Status | Short Comment |
|------|--------|---------------|
| **Domain Modeling (DDD)** | GREEN | Rich aggregates, value objects, event sourcing. Best-in-class for TypeScript. |
| **Hexagonal Boundaries** | GREEN | Ports/adapters properly separated. CI enforces layer violations. |
| **Cognitive Memory** | YELLOW | ~92% complete. Missing async embedding worker, RLS policies commented out. |
| **Lead → LTV Flow** | RED | ~35% implemented. Cases/payments tables exist but orchestration incomplete. |
| **Call Center / Agents** | YELLOW | Backend services exist but no persistent queue management UI. |
| **Database & Migrations** | GREEN | 40 migrations, partitioned tables, no destructive ops on live data. |
| **Security & Privacy** | GREEN | RLS, encryption, PII redaction, GDPR DSR service. Minor gaps in cognitive RLS. |
| **Observability** | GREEN | OpenTelemetry, Pino structured logging, Prometheus metrics, Sentry. |
| **Tests & CI** | YELLOW | 280 test files but only ~60% coverage. Medical standard is 80%+. |
| **Docs & Dev Experience** | GREEN | 5 ADRs, comprehensive guides, runbooks. Above average. |

---

## PHASE 1 – DETAILED ANALYSIS

### 1. DOMAIN & DDD

**Assessment: GREEN – This is real DDD, not a facade.**

#### What's Done Right:
- **Rich Domain Model** at `packages/domain/`:
  - `LeadAggregateRoot` with event sourcing (`getUncommittedEvents()`)
  - `PatientAggregateRoot` with lifecycle states
  - Value objects: `LeadScore`, `PhoneNumber`, `RetentionScore`, `PredictedLTV`, `AllOnXClinicalScore`
  - Domain events: `LeadScoredEvent`, `LeadQualifiedEvent`, `AppointmentScheduledEvent`, etc.
  - Repository interfaces with Specification pattern (`hotLeadsSpec`, `needsFollowUpSpec`)

- **Bounded Contexts** properly separated:
  - Lead acquisition context
  - Patient context
  - All-on-X clinical context (1,920 lines of property-based tests)
  - Consent/GDPR context
  - Voice/call center context
  - LTV/revenue context

- **Domain Services** with proper encapsulation:
  - `ScoringService` (rule-based + AI fallback)
  - `TriageService` (urgency routing)
  - `ConsentService` (GDPR 2-year expiry)
  - `RevenueForecastingService` (ARIMA, exponential smoothing)
  - `PLTVScoringService` (PLATINUM/GOLD/SILVER/BRONZE tiers)

#### Where Business Logic Lives:
| Location | Status |
|----------|--------|
| `packages/domain/src/` | Primary home – pure business logic |
| `packages/core/src/cognitive/` | Domain logic for episodic memory |
| `apps/api/src/routes/` | Some orchestration mixed with HTTP handling |
| `apps/web/src/app/actions/` | Some business logic in server actions |
| `apps/trigger/src/workflows/` | Workflow orchestration (acceptable for async) |

#### Gaps:
1. **Anemic areas**: `packages/application/` defines ports as **types only** – no use case implementations.
2. **Domain leaks**: One architecture violation – `pg` Pool imported in domain.
3. **Missing aggregate**: No `CaseAggregate` for treatment plan → payment lifecycle.

---

### 2. COGNITIVE MEMORY MODULE

**Assessment: YELLOW – ~92% complete, needs hardening**

#### Database Schema (Migration 205):
| Table | Purpose | Status |
|-------|---------|--------|
| `episodic_events` | AI-summarized interactions with embeddings | Created, partitioned |
| `behavioral_patterns` | Detected patient patterns | Created |
| `knowledge_entities` | Normalized concepts | Created |
| `knowledge_relations` | Entity relationships | Created |

#### Code Implementation:
| Component | Status |
|-----------|--------|
| `EpisodeBuilder` | Implemented |
| `MemoryRetrievalService` | Implemented |
| `PatternDetector` | Implemented |
| `KnowledgeGraph` | Implemented |
| `EntityDeduplication` | Implemented |
| `PIIMasking` | Implemented |
| `GDPRErasure` | Partial (OSAX-only) |
| `RealTimePatternStream` | Implemented |
| `AsyncEmbeddingWorker` | Missing |
| `EmbeddingCache` | Missing |

#### Critical Issues:
1. **RLS policies for cognitive tables are COMMENTED OUT** – security gap
2. GDPR erasure limited to OSAX subjects only
3. No embedding refresh job for stale embeddings

---

### 3. LEAD → LTV BUSINESS FLOW

**Assessment: RED – ~35% implemented**

| Component | Status |
|-----------|--------|
| Lead capture (WhatsApp/Voice/Web) | Complete |
| AI scoring | Complete |
| Lead → Patient conversion | Complete |
| `cases` table | Created |
| `payments` table | Created |
| Case lifecycle tracking | Partial |
| Payment-to-case linkage | Partial |
| LTV calculation service | Partial |
| pLTV (predicted LTV) | Complete |
| Cohort analysis | Partial |
| **LTV Dashboard UI** | Missing |

**What's Missing:**
1. Case Creation Workflow: Lead qualified → automatically create case
2. Payment Attribution: Stripe payment → attribute to case
3. LTV Calculation Job: Daily/weekly job to compute LTV
4. Cohort Analysis Scheduler: Monthly cohort LTV snapshots
5. Dashboard UI: `apps/web/src/app/ltv-dashboard/` page

---

### 4. CALL CENTER / AGENT WORKFLOW

**Assessment: YELLOW – Backend ready, UX incomplete**

| Component | Status |
|-----------|--------|
| Agent presence tracking | Complete |
| Supervisor monitoring | Complete |
| Skill-based routing | Complete |
| Round-robin assignment | Complete |
| Queue SLA monitoring | Complete |
| Twilio Flex integration | Complete |
| WebSocket presence | Complete |
| Agent guidance scripts | Complete |
| Memory-enriched guidance | Complete |
| **Queue Management UI** | Missing |
| **SLA Dashboard** | Missing |
| **Agent Performance Dashboard** | Partial |

---

### 5. TECH FOUNDATIONS

#### Database & Migrations: GREEN
- 40 migration files (14,885 lines SQL)
- Partitioned tables (domain_events, audit_log)
- 8+ HNSW vector indexes
- 15+ RLS policies
- No destructive ops on production data

#### Security & Privacy: GREEN (minor gaps)
- HMAC webhook verification
- Row-Level Security on 15+ tables
- PII auto-redaction in logging
- Encryption at rest
- MFA support (TOTP, email OTP, SMS OTP)
- GDPR DSR service
- **Gap:** Cognitive RLS commented out
- **Gap:** Redis auth disabled in staging

#### Observability: GREEN
- OpenTelemetry SDK
- Pino structured logging with correlation IDs
- Prometheus metrics
- Sentry error tracking
- Health checks (/health, /ready, /live)

#### Tests: YELLOW
- 280 test files
- ~60% coverage (needs 80%+ for medical)
- Property-based tests for All-on-X (1,920 lines)
- Contract tests configured (Pact)
- 11/26 API routes lack dedicated tests

#### CI/CD: GREEN
- 17 workflow files
- Layer boundary enforcement
- Code duplication checks
- Dependency vulnerability scanning
- Lighthouse CI
- k6 load testing
- Automated rollback

---

## PHASE 2 – PRIORITIZED TODO LIST

### HIGH PRIORITY (Must-do before production-grade)

| ID | Title | Why It Matters | Effort |
|----|-------|----------------|--------|
| **H1** | Enable Cognitive Memory RLS | Multi-tenant data leak risk | 2h |
| **H2** | Complete LTV Dashboard | Core business feature missing | 16h |
| **H3** | Implement Case Creation Workflow | Breaks LTV tracking | 8h |
| **H4** | Increase Test Coverage to 70% | Medical standard is 80%+ | Ongoing |
| **H5** | Add Async Embedding Worker | Latency risk | 8h |
| **H6** | Fix Redis Auth for Staging | Security gap | 1h |
| **H7** | Complete GDPR Erasure | Incomplete compliance | 4h |
| **H8** | Payment-to-Case Attribution | LTV calculation broken | 4h |
| **H9** | Add Queue Management UI | Agents have no queue visibility | 12h |
| **H10** | Reduce Password Reset Token to 5min | Security best practice | 30min |

### MEDIUM PRIORITY (Top 1% level)

| ID | Title | Why It Matters | Effort |
|----|-------|----------------|--------|
| **M1** | Implement Use Case Layer | Orchestration scattered in apps | 16h |
| **M2** | Add Embedding Cache (Redis) | Phase 4 ADR-003 incomplete | 8h |
| **M3** | Create SLA Dashboard | Backend exists, no UI | 8h |
| **M4** | Add Cohort Analysis Scheduler | LTV cohorts not computed | 4h |
| **M5** | Implement Call Disposition Flow | Agent efficiency | 8h |
| **M6** | Add Contract Tests | Sparse integration coverage | 8h |
| **M7** | Fix Architecture Violation | Domain imports pg directly | 1h |
| **M8** | Split Large Files | whatsapp.ts (892 lines) | 8h |
| **M9** | Centralize Magic Numbers | Hardcoded across codebase | 4h |
| **M10** | Add Load Test to CI | k6 exists but not in pipeline | 4h |
| **M11** | Create Agent Performance Dashboard | Page incomplete | 12h |
| **M12** | Implement NPS Collection | Schemas exist, no workflow | 8h |
| **M13** | Add Chaos Engineering Tests | No resilience testing | 16h |
| **M14** | Implement Collections Workflow | Overdue reminders missing | 8h |
| **M15** | Update Migration Timestamps | Collision risk | 2h |

### LOW PRIORITY (Nice-to-have)

| ID | Title | Why It Matters | Effort |
|----|-------|----------------|--------|
| **L1** | Upgrade NextAuth to Stable | Using beta version | 2h |
| **L2** | Add Financing Integration UI | Backend exists | 8h |
| **L3** | Create Article 30 Report Scheduler | GDPR automation | 4h |
| **L4** | Add Data Lineage Visualization | Service exists, no UI | 12h |
| **L5** | Implement Load Testing Dashboard | Results display | 8h |
| **L6** | Add Storybook for All Components | Gaps in library | 8h |
| **L7** | Implement Whisper/Barge UI | Backend ready | 12h |
| **L8** | Add OpenAPI Spec Generation | Auto-generate docs | 4h |
| **L9** | Create Mobile-Responsive Agent View | Desktop-only | 8h |
| **L10** | Add Keyboard Shortcuts for Agents | Efficiency | 4h |

---

## PHASE 3 – EXECUTION ROADMAP

### NOW (0-2 weeks) – Survival + Production-Ready

**Week 1:**
- [ ] H1: Enable cognitive memory RLS policies (2h)
- [ ] H6: Fix Redis auth for staging (1h)
- [ ] H10: Reduce password reset token to 5min (30min)
- [ ] H7: Complete GDPR erasure for all subjects (4h)
- [ ] M15: Verify migration timestamp ordering (2h)
- [ ] M7: Fix domain layer architecture violation (1h)

**Week 2:**
- [ ] H3: Implement case creation workflow (8h)
- [ ] H8: Payment-to-case attribution (4h)
- [ ] H4: Begin test coverage sprint – target 65%
- [ ] H5: Wire async embedding worker to Redis queue (8h)

### SOON (2-6 weeks) – Top 1% Foundation

**Week 3-4:**
- [ ] H2: Build LTV Dashboard page (16h)
- [ ] H9: Queue management UI for agents (12h)
- [ ] M4: Cohort analysis scheduler (4h)
- [ ] M2: Implement embedding cache with Redis (8h)

**Week 5-6:**
- [ ] M3: SLA dashboard for supervisors (8h)
- [ ] M5: Call disposition flow (8h)
- [ ] M1: Implement 3 core use cases (16h)
- [ ] H4: Test coverage to 70%
- [ ] M6: Add contract tests for HubSpot, Stripe (8h)
- [ ] M10: Add k6 smoke test to CI (4h)

### NEXT (6-12 weeks) – AgentOS / Automation

**Week 7-8:**
- [ ] M11: Agent performance dashboard (12h)
- [ ] M12: NPS collection workflow (8h)
- [ ] M14: Collections/overdue workflow (8h)
- [ ] M8: Split large files (8h)
- [ ] M9: Centralize magic numbers (4h)

**Week 9-10:**
- [ ] L7: Whisper/barge UI for supervisors (12h)
- [ ] L2: Financing integration UI (8h)
- [ ] M13: Chaos engineering tests (16h)
- [ ] H4: Test coverage to 75%

**Week 11-12:**
- [ ] L3: Article 30 report scheduler (4h)
- [ ] L4: Data lineage visualization (12h)
- [ ] L1: Upgrade NextAuth when stable (2h)
- [ ] L6: Complete Storybook coverage (8h)
- [ ] H4: Test coverage to 80% (target)

---

## PRODUCTION READINESS ASSESSMENT

### Ready For:
- Internal pilot with 1-2 agents (with caveats)
- Demo to investors
- Development/staging environments
- Non-production AI scoring
- WhatsApp/Voice ingestion

### Not Ready For:
- Production with real patients – cognitive RLS gap
- Multi-tenant deployment – security gaps
- 4+ agent call center – queue UI missing
- LTV-based business decisions – dashboard missing
- GDPR audit – erasure incomplete

### Verdict:
- **Current state:** ~75% to production-credible
- **Time to minimum viable production:** 2-3 weeks focused work
- **Time to Top 1% / banking-grade:** 8-12 weeks

---

## CODEBASE STATISTICS

| Metric | Value |
|--------|-------|
| TypeScript Lines | ~128,000 |
| SQL Migration Lines | 14,885 |
| Test Files | 280 |
| Migration Files | 40 |
| CI Workflow Files | 17 |
| ADRs | 5 |
| Packages | 7 |
| Apps | 3 |

---

*Report generated: 2025-12-08*
