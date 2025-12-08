# GitHub Issues Backlog - Architecture Audit 2025-12-06

> Generated from comprehensive architecture audit. 29 issues total.
> Use with `gh issue create` or import via GitHub UI.

---

## HIGH PRIORITY (P0 - Must-Do for Production)

### H1: Verify Lead → LTV Event Chain with Integration Test

**Labels:** `priority: critical`, `type: testing`, `area: domain`

**Effort:** 2-3 hours

**Description:**
The Lead → LTV business flow lacks end-to-end verification. While individual components work, there's no integration test proving the complete event chain:

```
LeadCreated → LeadScored → LeadQualified → CaseCreated → PaymentReceived → LTVUpdated
```

**Acceptance Criteria:**

- [ ] Integration test traces a lead from creation to LTV calculation
- [ ] All domain events are emitted in correct order
- [ ] Event store contains complete audit trail
- [ ] LTV dashboard reflects accurate values after flow completion
- [ ] Test runs in CI pipeline

**Files Involved:**

- `packages/domain/src/leads/entities/Lead.ts`
- `packages/domain/src/ltv/ltv-service.ts`
- `packages/domain/src/cases/repositories/CaseRepository.ts`
- `apps/trigger/src/workflows/lead-scoring.ts`
- `apps/trigger/src/workflows/patient-journey.ts`
- `supabase/migrations/20251206000001_cases_payments.sql`

**Suggested Approach:**

1. Create `apps/api/src/__tests__/integration/lead-to-ltv.integration.test.ts`
2. Use test database with seeded data
3. Trigger lead creation, simulate scoring, case creation, payment
4. Assert on event store entries and LTV calculation

---

### H2: Wire Cognitive Memory to Agent Guidance Flows

**Labels:** `priority: critical`, `type: feature`, `area: cognitive-memory`

**Effort:** 3-4 hours

**Description:**
The Cognitive Memory module (episode builder, memory retrieval) is fully implemented but not integrated into agent-facing flows. Agents don't benefit from patient history during calls.

**Acceptance Criteria:**

- [ ] `MemoryRetrievalService` injected into guidance service
- [ ] Agent scripts receive relevant patient context from episodic memory
- [ ] Recent interactions displayed in agent workspace (when built)
- [ ] Semantic search used for "similar past interactions"
- [ ] Performance: retrieval < 200ms p95

**Files Involved:**

- `packages/core/src/cognitive/memory-retrieval.ts`
- `packages/core/src/cognitive/episode-builder.ts`
- `packages/domain/src/guidance/` (guidance service)
- `packages/domain/src/voice/supervisor-agent.ts`
- `apps/trigger/src/tasks/whatsapp-handler.ts`

**Suggested Approach:**

1. Create `CognitiveContextProvider` that wraps memory retrieval
2. Inject into guidance service constructor
3. Call `getSubjectSummary()` when preparing agent scripts
4. Add `recentInteractions` field to guidance response

---

### H3: Add Critical E2E Tests for Core Flows

**Labels:** `priority: critical`, `type: testing`, `area: e2e`

**Effort:** 4-6 hours

**Description:**
Currently only 4 E2E tests exist (`workflows.spec.ts`, `dashboard.spec.ts`, `patients.spec.ts`, `accessibility.spec.ts`). Medical software requires comprehensive E2E coverage of critical flows.

**Acceptance Criteria:**

- [ ] E2E test: Complete booking flow (search slot → book → confirm)
- [ ] E2E test: Payment flow (create invoice → process payment → receipt)
- [ ] E2E test: Lead scoring flow (receive message → score → triage)
- [ ] E2E test: Consent management (grant → verify → withdraw)
- [ ] E2E test: GDPR data export request
- [ ] All tests run in CI with Playwright
- [ ] Test data isolated per run

**Files Involved:**

- `apps/web/e2e/` (new test files)
- `apps/web/playwright.config.ts`
- `.github/workflows/ci.yml`

**Suggested Approach:**

1. Create `apps/web/e2e/booking.spec.ts`
2. Create `apps/web/e2e/payments.spec.ts`
3. Create `apps/web/e2e/lead-scoring.spec.ts`
4. Create `apps/web/e2e/consent.spec.ts`
5. Create `apps/web/e2e/gdpr.spec.ts`
6. Add test database seeding script

---

### H4: Load Test RLS Policies for Performance Validation

**Labels:** `priority: critical`, `type: testing`, `area: database`

**Effort:** 3-4 hours

**Description:**
Row-Level Security policies are implemented but not validated under load. RLS can cause significant query slowdown with large datasets, especially with complex policies.

**Acceptance Criteria:**

- [ ] k6 load test with 10K+ records per table
- [ ] Query latency < 100ms p95 with RLS enabled
- [ ] Compare RLS-on vs RLS-off performance
- [ ] Document any policies needing optimization
- [ ] Test multi-tenant isolation under concurrent load

**Files Involved:**

- `supabase/migrations/20240101000017_rls_policies.sql`
- `scripts/k6/` (load test scripts)
- `infra/` (test database provisioning)

**Suggested Approach:**

1. Create `scripts/k6/rls-load-test.js`
2. Seed test database with 10K leads, 50K interactions
3. Run concurrent queries from multiple "tenants"
4. Measure and document latency percentiles
5. Optimize slow policies if found

---

### H5: Implement Basic Agent Workspace UI

**Labels:** `priority: critical`, `type: feature`, `area: frontend`

**Effort:** 1-2 days

**Description:**
Backend routing, SLA monitoring, and disposition tracking exist, but agents have no native MedicalCor UI. They must use external tools (HubSpot, Twilio Flex) which fragments the experience.

**Acceptance Criteria:**

- [ ] Agent can view assigned queue with priority sorting
- [ ] Agent can accept/reject incoming tasks
- [ ] Agent can see lead context (name, score, history) on accept
- [ ] Agent can set disposition code after call
- [ ] Agent can add follow-up notes
- [ ] Real-time queue updates via WebSocket
- [ ] Mobile-responsive layout

**Files Involved:**

- `apps/web/src/app/agent-workspace/` (new directory)
- `apps/web/src/app/agent-workspace/page.tsx`
- `apps/web/src/app/agent-workspace/components/`
- `packages/domain/src/routing/skill-routing-service.ts`
- `apps/api/src/routes/supervisor-ws.ts` (extend for agent events)

**Suggested Approach:**

1. Create page layout with queue sidebar + main call panel
2. Add server action for fetching agent queue
3. Implement WebSocket subscription for real-time updates
4. Add disposition form with code selection
5. Integrate with skill routing service for task acceptance

---

### H6: Add Database Partitioning for Event Tables

**Labels:** `priority: critical`, `type: infrastructure`, `area: database`

**Effort:** 4-6 hours

**Description:**
`domain_events` and `audit_log` tables will grow unbounded. Without partitioning, query performance will degrade and maintenance (vacuum, backup) will become problematic.

**Acceptance Criteria:**

- [ ] `domain_events` partitioned by month (range on `created_at`)
- [ ] `audit_log` partitioned by month
- [ ] Automated partition creation (1 month ahead)
- [ ] Old partitions can be archived/dropped independently
- [ ] Zero downtime migration from existing data
- [ ] Documented retention policy per partition

**Files Involved:**

- `supabase/migrations/` (new migration)
- `apps/trigger/src/jobs/cron-jobs.ts` (partition maintenance job)

**Suggested Approach:**

1. Create migration with declarative partitioning
2. Use `pg_partman` extension for automated management
3. Migrate existing data to partitioned table
4. Add cron job for partition maintenance
5. Document archival procedure

---

### H7: Production Secrets Audit and Rotation Procedure

**Labels:** `priority: critical`, `type: security`, `area: infrastructure`

**Effort:** 2-3 hours

**Description:**
Ensure no secrets exist in codebase, all secrets are rotatable, and rotation procedures are documented. Critical for medical/HIPAA compliance.

**Acceptance Criteria:**

- [ ] Gitleaks scan passes with zero findings
- [ ] All secrets documented in `.env.example` with descriptions
- [ ] Each secret has documented rotation procedure
- [ ] Rotation can be done without downtime
- [ ] Secret access logged in audit trail
- [ ] Emergency rotation runbook exists

**Files Involved:**

- `.env.example`
- `.env.production.template`
- `.gitleaks.toml`
- `packages/core/src/secrets-validator.ts`
- `docs/runbooks/secret-rotation.md` (new)

**Suggested Approach:**

1. Run `gitleaks detect` on full history
2. Audit `.env.example` for completeness
3. Document rotation for each secret type (DB, API keys, encryption keys)
4. Create rotation runbook with step-by-step commands
5. Add secret rotation to incident response playbook

---

### H8: Complete Knowledge Graph Migration and Integration

**Labels:** `priority: critical`, `type: feature`, `area: cognitive-memory`

**Effort:** 4-6 hours

**Description:**
ADR-004 references `knowledge_entities` and `knowledge_relations` tables for the knowledge graph, but these are not present in migrations. The cognitive memory system is incomplete without graph-based knowledge.

**Acceptance Criteria:**

- [ ] Migration adds `knowledge_entities` table with embeddings
- [ ] Migration adds `knowledge_relations` table with typed edges
- [ ] Entity extraction integrated into episode builder
- [ ] Graph queries available in memory retrieval service
- [ ] GDPR erasure includes knowledge graph cleanup
- [ ] Basic visualization available for debugging

**Files Involved:**

- `supabase/migrations/` (new migration)
- `packages/core/src/cognitive/episode-builder.ts`
- `packages/core/src/cognitive/memory-retrieval.ts`
- `packages/core/src/cognitive/knowledge-graph.ts` (new)

**Suggested Approach:**

1. Create migration: `20251207000001_knowledge_graph.sql`
2. Add entity extraction to episode builder (extract entities already exists)
3. Create `KnowledgeGraphService` for graph queries
4. Wire entity persistence after episode creation
5. Add graph traversal to memory retrieval

---

## MEDIUM PRIORITY (P1 - Top 1% Level)

### M1: Consolidate Audit Tables into Unified Schema

**Labels:** `priority: high`, `type: refactor`, `area: database`

**Effort:** 4-6 hours

**Description:**
Multiple audit tables exist with similar structures: `auth_events`, `audit_logs`, `pii_access_log`, `audit_log`. This creates confusion and maintenance burden.

**Acceptance Criteria:**

- [ ] Single `unified_audit_log` table with type discriminator
- [ ] All existing audit data migrated
- [ ] Audit insertion abstracted through single service
- [ ] Backwards-compatible views for legacy queries
- [ ] Indexes optimized for common query patterns

**Files Involved:**

- `supabase/migrations/` (consolidation migration)
- `packages/core/src/observability/audit.ts`
- All files inserting into audit tables

---

### M2: Implement Predicted LTV (pLTV) Model Infrastructure

**Labels:** `priority: high`, `type: feature`, `area: analytics`

**Effort:** 2-3 days

**Description:**
Current LTV is historical only. Adding predicted LTV based on lead attributes enables proactive lead prioritization and marketing optimization.

**Acceptance Criteria:**

- [ ] pLTV model interface defined
- [ ] Feature extraction from lead attributes
- [ ] Model serving infrastructure (or API integration)
- [ ] pLTV score displayed on lead cards
- [ ] pLTV used in lead routing decisions
- [ ] Model retraining pipeline defined

**Files Involved:**

- `packages/domain/src/ltv/pltv-service.ts` (new)
- `packages/domain/src/ltv/pltv-model.ts` (new)
- `apps/web/src/app/ltv-dashboard/`
- `apps/trigger/src/workflows/lead-scoring.ts`

---

### M3: Implement Patient Aggregate with Full Lifecycle

**Labels:** `priority: high`, `type: feature`, `area: domain`

**Effort:** 1-2 days

**Description:**
Lead → Patient transition is undermodeled. There's no `Patient` aggregate to track the full patient lifecycle after conversion.

**Acceptance Criteria:**

- [ ] `PatientAggregateRoot` with lifecycle states
- [ ] Domain events: `PatientOnboarded`, `PatientActivated`, `PatientChurned`
- [ ] Conversion from Lead preserves history
- [ ] Patient timeline view in UI
- [ ] Retention scoring linked to patient aggregate

**Files Involved:**

- `packages/domain/src/patients/` (new directory)
- `packages/domain/src/patients/entities/Patient.ts`
- `packages/domain/src/patients/events/`
- `supabase/migrations/` (patients table if not exists)

---

### M4: Wire Feature Flags to Runtime UI

**Labels:** `priority: high`, `type: feature`, `area: infrastructure`

**Effort:** 3-4 hours

**Description:**
Feature flag schema exists (`20251206000007_feature_flags.sql`) but lacks runtime integration and UI for toggling flags.

**Acceptance Criteria:**

- [ ] `FeatureFlagProvider` React context
- [ ] `useFeatureFlag(flagName)` hook
- [ ] Admin UI for viewing/toggling flags
- [ ] Rollout percentage support
- [ ] Audit log for flag changes
- [ ] SSR-compatible flag evaluation

**Files Involved:**

- `apps/web/src/lib/feature-flags/` (new)
- `apps/web/src/app/settings/feature-flags/page.tsx` (new)
- `apps/web/src/app/actions/feature-flags.ts` (new)
- `supabase/migrations/20251206000007_feature_flags.sql`

---

### M5: Add Real-Time Queue Visualization Dashboard

**Labels:** `priority: high`, `type: feature`, `area: frontend`

**Effort:** 4-6 hours

**Description:**
Queue SLA monitoring backend exists but has no visualization. Supervisors can't see queue health in real-time.

**Acceptance Criteria:**

- [ ] Dashboard showing all active queues
- [ ] Real-time metrics: wait time, queue depth, SLA status
- [ ] Visual SLA breach alerts
- [ ] Historical queue performance charts
- [ ] Drill-down to individual agents in queue
- [ ] WebSocket updates for live data

**Files Involved:**

- `apps/web/src/app/queues/page.tsx` (new)
- `apps/web/src/app/queues/components/`
- `supabase/migrations/20251206000002_queue_sla.sql`
- `apps/api/src/routes/supervisor-ws.ts`

---

### M6: Complete Async Embedding Worker Pipeline

**Labels:** `priority: high`, `type: feature`, `area: cognitive-memory`

**Effort:** 3-4 hours

**Description:**
Episode builder works synchronously. The async embedding worker exists but isn't fully wired to domain events for background processing.

**Acceptance Criteria:**

- [ ] Domain events trigger embedding worker
- [ ] Batch processing for efficiency
- [ ] Retry logic for API failures
- [ ] Cron job for embedding refresh (stale embeddings)
- [ ] Metrics for embedding pipeline health
- [ ] Backfill command for historical data

**Files Involved:**

- `apps/trigger/src/tasks/embedding-worker.ts`
- `apps/trigger/src/jobs/embedding-refresh.ts`
- `packages/core/src/cognitive/episode-builder.ts`
- `packages/core/src/event-store.ts`

---

### M7: Add Cohort LTV Analysis View

**Labels:** `priority: high`, `type: feature`, `area: analytics`

**Effort:** 4-6 hours

**Description:**
No tracking of LTV by acquisition cohort. Can't answer "How does LTV change over time for leads acquired in January?"

**Acceptance Criteria:**

- [ ] Cohort definition by first contact month
- [ ] LTV progression over time per cohort
- [ ] Cohort comparison visualization
- [ ] Export cohort data for analysis
- [ ] Materialized view for performance

**Files Involved:**

- `packages/domain/src/ltv/cohort-analysis.ts` (new)
- `apps/web/src/app/ltv-dashboard/cohorts/page.tsx` (new)
- `supabase/migrations/` (materialized view)

---

### M8: Create Operational Runbooks

**Labels:** `priority: high`, `type: documentation`, `area: operations`

**Effort:** 4-6 hours

**Description:**
Good architecture documentation exists but no operational runbooks for incident response, escalation, or rollback procedures.

**Acceptance Criteria:**

- [ ] Incident response runbook (detection → triage → resolution)
- [ ] Rollback procedure for each service
- [ ] Database recovery procedure
- [ ] Scaling playbook (manual and automated)
- [ ] On-call rotation setup guide
- [ ] Postmortem template

**Files Involved:**

- `docs/runbooks/incident-response.md` (new)
- `docs/runbooks/rollback.md` (new)
- `docs/runbooks/database-recovery.md` (new)
- `docs/runbooks/scaling.md` (new)
- `docs/runbooks/on-call.md` (new)

---

### M9: Enhance Circuit Breaker Dashboard

**Labels:** `priority: medium`, `type: feature`, `area: observability`

**Effort:** 2-3 hours

**Description:**
Circuit breaker page exists but may not show real-time status. Backend circuit breakers need visibility for operations.

**Acceptance Criteria:**

- [ ] Real-time circuit state (open/closed/half-open)
- [ ] Failure rate metrics per circuit
- [ ] Manual circuit trip/reset capability
- [ ] Historical state changes timeline
- [ ] Alerts when circuits open

**Files Involved:**

- `apps/web/src/app/circuit-breaker/page.tsx`
- `packages/core/src/circuit-breaker.ts`
- `apps/api/src/routes/health.ts` (circuit breaker status)

---

### M10: Implement Data Lineage Visualization

**Labels:** `priority: medium`, `type: feature`, `area: compliance`

**Effort:** 4-6 hours

**Description:**
Data lineage tables exist but no visualization. Compliance officers need to trace data flows for GDPR/HIPAA audits.

**Acceptance Criteria:**

- [ ] Graph visualization of data flows
- [ ] Filter by data subject or resource
- [ ] Trace upstream sources for any data point
- [ ] Trace downstream impact of data changes
- [ ] Export lineage report for auditors
- [ ] HIPAA/GDPR compliance view

**Files Involved:**

- `apps/web/src/app/data-lineage/page.tsx` (new)
- `supabase/migrations/20251206000006_data_lineage.sql`
- `packages/core/src/data-lineage/`

---

### M11: Complete Supervisor Live Monitoring UI

**Labels:** `priority: medium`, `type: feature`, `area: frontend`

**Effort:** 4-6 hours

**Description:**
Supervisor state persistence exists but UI for live call monitoring is incomplete.

**Acceptance Criteria:**

- [ ] View all active calls with status
- [ ] Listen mode (silent monitoring)
- [ ] Whisper mode (speak to agent only)
- [ ] Barge mode (join call)
- [ ] Real-time transcript view
- [ ] Sentiment indicators
- [ ] Quick escalation actions

**Files Involved:**

- `apps/web/src/app/supervisor/page.tsx`
- `apps/web/src/app/supervisor/components/`
- `packages/domain/src/voice/supervisor-agent.ts`
- `supabase/migrations/20251206000002_supervisor_state_persistence.sql`

---

### M12: Add Contract Testing for External Integrations

**Labels:** `priority: medium`, `type: testing`, `area: integrations`

**Effort:** 4-6 hours

**Description:**
External adapters (HubSpot, Stripe, WhatsApp) lack contract tests. API changes could break integrations silently.

**Acceptance Criteria:**

- [ ] Pact contract tests for HubSpot API
- [ ] Pact contract tests for Stripe webhooks
- [ ] Pact contract tests for WhatsApp/360dialog
- [ ] Contract verification in CI
- [ ] Provider state management for test scenarios

**Files Involved:**

- `packages/integrations/src/__tests__/contracts/` (new)
- `packages/integrations/src/hubspot.ts`
- `packages/integrations/src/stripe.ts`
- `packages/integrations/src/whatsapp.ts`

---

### M13: Add Request Tracing Visualization

**Labels:** `priority: medium`, `type: feature`, `area: observability`

**Effort:** 3-4 hours

**Description:**
Correlation IDs flow through the system but there's no UI to visualize request traces.

**Acceptance Criteria:**

- [ ] Search traces by correlation ID
- [ ] Waterfall view of request flow
- [ ] Service-to-service hops visible
- [ ] Latency breakdown per hop
- [ ] Error highlighting in trace
- [ ] Link to related logs

**Files Involved:**

- `apps/web/src/app/traces/page.tsx` (new)
- `packages/core/src/observability/instrumentation.ts`
- `apps/api/src/instrumentation.ts`

---

## LOW PRIORITY (P2 - Polish)

### L1: Add Comprehensive Storybook Coverage

**Labels:** `priority: low`, `type: documentation`, `area: frontend`

**Effort:** 4-6 hours

**Description:**
UI components lack Storybook documentation. New developers struggle to understand component APIs.

**Acceptance Criteria:**

- [ ] Stories for all `components/ui/` primitives
- [ ] Stories for key feature components
- [ ] Interactive controls for props
- [ ] Accessibility addon configured
- [ ] Deployed Storybook for team reference

**Files Involved:**

- `apps/web/.storybook/`
- `apps/web/src/components/ui/__stories__/`

---

### L2: Implement Proper Dark Mode Toggle

**Labels:** `priority: low`, `type: feature`, `area: frontend`

**Effort:** 2-3 hours

**Description:**
CSS variables for dark mode exist but toggle functionality is incomplete.

**Acceptance Criteria:**

- [ ] Dark mode toggle in header/settings
- [ ] System preference detection
- [ ] Preference persisted in localStorage
- [ ] Smooth transition animation
- [ ] All components properly themed

**Files Involved:**

- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/providers.tsx`
- `apps/web/src/globals.css`

---

### L3: Create API Documentation Portal

**Labels:** `priority: low`, `type: documentation`, `area: api`

**Effort:** 3-4 hours

**Description:**
Swagger/OpenAPI exists in code but no hosted documentation portal for API consumers.

**Acceptance Criteria:**

- [ ] OpenAPI spec generated from routes
- [ ] Hosted docs (Redoc or Swagger UI)
- [ ] Authentication examples
- [ ] Request/response examples
- [ ] Webhook payload documentation

**Files Involved:**

- `apps/api/src/routes/`
- `apps/api/openapi.json` (generated)
- `docs/api/` (hosted docs)

---

### L4: Optimize Vector Search Performance

**Labels:** `priority: low`, `type: performance`, `area: database`

**Effort:** 2-3 hours

**Description:**
HNSW indexes exist but may not be optimally tuned for the workload.

**Acceptance Criteria:**

- [ ] Benchmark current query performance
- [ ] Tune HNSW parameters (m, ef_construction, ef_search)
- [ ] Document optimal settings
- [ ] Add performance regression test

**Files Involved:**

- `packages/infrastructure/src/ai/vector-search/PgVectorService.ts`
- `supabase/migrations/20240101000005_pgvector_rag.sql`

---

### L5: Add Mobile-Responsive Agent UI

**Labels:** `priority: low`, `type: feature`, `area: frontend`

**Effort:** 3-4 hours

**Description:**
Agent workspace (when built) should support tablet use for mobile agents.

**Acceptance Criteria:**

- [ ] Responsive breakpoints for tablet (768px+)
- [ ] Touch-friendly controls
- [ ] Collapsible sidebar
- [ ] Swipe gestures for common actions

**Files Involved:**

- `apps/web/src/app/agent-workspace/` (depends on H5)

---

### L6: Implement Webhook Replay UI

**Labels:** `priority: low`, `type: feature`, `area: debugging`

**Effort:** 3-4 hours

**Description:**
Debugging webhooks requires CLI access. Admin UI for replay would speed up troubleshooting.

**Acceptance Criteria:**

- [ ] View recent webhook deliveries
- [ ] Filter by source (WhatsApp, Stripe, etc.)
- [ ] Replay individual webhooks
- [ ] View request/response details
- [ ] Diff between original and replay

**Files Involved:**

- `apps/web/src/app/webhooks/page.tsx` (new)
- `apps/api/src/routes/webhooks/`

---

### L7: Add Performance Budgets and Lighthouse CI

**Labels:** `priority: low`, `type: infrastructure`, `area: performance`

**Effort:** 2-3 hours

**Description:**
No explicit performance targets. Core Web Vitals should be tracked in CI.

**Acceptance Criteria:**

- [ ] Lighthouse CI configured
- [ ] Performance budgets defined
- [ ] CI fails on budget violations
- [ ] Core Web Vitals dashboard
- [ ] Bundle size tracking

**Files Involved:**

- `.github/workflows/ci.yml`
- `lighthouserc.js` (new)
- `apps/web/`

---

### L8: Complete Localization Coverage

**Labels:** `priority: low`, `type: feature`, `area: i18n`

**Effort:** 3-4 hours

**Description:**
Romanian localization exists but coverage is incomplete. Missing translation keys cause fallback to English.

**Acceptance Criteria:**

- [ ] Audit all translation keys
- [ ] Complete Romanian translations
- [ ] Add language switcher UI
- [ ] Validate no missing keys in CI
- [ ] Document translation workflow

**Files Involved:**

- `apps/web/src/lib/i18n/`
- `apps/web/src/lib/i18n/locales/`

---

## Summary Statistics

| Priority    | Count  | Total Effort   |
| ----------- | ------ | -------------- |
| HIGH (P0)   | 8      | 3-5 days       |
| MEDIUM (P1) | 13     | 6-10 days      |
| LOW (P2)    | 8      | 3-4 days       |
| **TOTAL**   | **29** | **12-19 days** |

---

## Import Instructions

### Option 1: GitHub CLI (if available)

```bash
# Example for single issue
gh issue create \
  --title "H1: Verify Lead → LTV Event Chain with Integration Test" \
  --body "$(cat docs/issues/H1.md)" \
  --label "priority: critical,type: testing,area: domain"
```

### Option 2: GitHub API Bulk Import

```bash
# Use GitHub Issues API with personal access token
# See: https://docs.github.com/en/rest/issues/issues#create-an-issue
```

### Option 3: Manual Creation

Copy each issue section above into GitHub's "New Issue" form.

---

_Generated: 2025-12-06_
_Audit Session: claude/tech-audit-architecture-01SEK6QJHHUnYyWEDb4mJ7Ey_
