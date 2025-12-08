# CLAUDE.md

## Purpose

MedicalCor Core is an **AI-powered medical CRM platform** for dental clinics featuring GPT-4o lead scoring, omnichannel communication (WhatsApp, Voice, Web), and HIPAA/GDPR-compliant infrastructure. It follows hexagonal architecture (ports & adapters) for testability and technology flexibility.

---

## Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.9 (strict mode) |
| Package Manager | pnpm | 10+ |
| Build System | Turborepo | 2.6.x |
| API Framework | Fastify | 5.x |
| Web Framework | Next.js | 15.x (App Router) |
| Database | PostgreSQL + pgvector | 15+ |
| Cache | Redis | 7+ |
| Background Jobs | Trigger.dev | 3.x |
| Testing | Vitest 4.x, Playwright 1.57, fast-check 4.x |
| UI | Radix UI + Tailwind CSS |
| Observability | Sentry + Prometheus + Grafana |
| AI/LLM | OpenAI GPT-4o, Claude Agent SDK 0.1.x |

## Monorepo Structure

```
apps/
  api/             → Fastify webhook gateway (port 3000)
  trigger/         → Trigger.dev workflows & cron jobs
  web/             → Next.js admin dashboard (port 3001)

packages/
  types/           → Zod schemas & TypeScript types
  core/            → Logger, CQRS, auth, RAG, encryption, errors, cognitive memory
  domain/          → Business logic (scoring, triage, consent, scheduling, LTV)
  application/     → Use cases, ports (hexagonal)
  infrastructure/  → Adapters (PostgreSQL, Supabase, OpenAI)
  integrations/    → External clients (HubSpot, WhatsApp, Vapi, Stripe, Twilio)
  infra/           → Environment validation, health checks

db/                → Database migrations (dbmate)
supabase/          → Supabase migrations
infra/             → Docker, Prometheus, Grafana, Alertmanager, Terraform
tools/             → xray-audit, migration tools
scripts/           → k6 load tests, smoke tests, audit scripts
.claude/           → Commands, hooks, skills
docs/              → Architecture, ADRs, runbooks
```

**Dependency Order**: `types → core → domain → application → infrastructure → integrations → apps`

**Critical rule**: Lower packages must never import from higher packages.

---

## Quick Commands

```bash
# Development
pnpm install && pnpm dev          # Install & start all services
pnpm dev:api                      # Start only API server
pnpm build && pnpm typecheck      # Build & type check

# Testing
pnpm test                         # Run all tests
pnpm test:coverage                # With coverage
pnpm --filter @medicalcor/domain test  # Test specific package

# Database
pnpm db:migrate                   # Run migrations
pnpm db:seed                      # Seed dev data
pnpm db:reset                     # Reset database
pnpm db:ingest                    # Ingest RAG knowledge base

# Quality
pnpm lint && pnpm format          # Lint & format
pnpm check:layer-boundaries       # Verify hexagonal architecture
pnpm audit:full                   # Full security + quality audit

# Load Testing
pnpm k6:smoke                     # API load test (1 min, 5 VUs)
pnpm k6:load                      # Load test (5 min, 50 VUs)
pnpm k6:stress                    # Stress test (10 min, 100 VUs)
```

---

## Key Conventions

### Logging (HIPAA/GDPR Compliant)

```typescript
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'my-service' });
logger.info({ leadId: 'abc' }, 'Processing lead');
// Auto-redacts PII (phone, email, names) - NEVER use console.log
```

### Error Handling

```typescript
import { ValidationError, NotFoundError } from '@medicalcor/core/errors';

throw new ValidationError('Invalid phone format', { field: 'phone' });
throw new NotFoundError('Lead');
```

### TypeScript Patterns

```typescript
import type { ScoringOutput } from '@medicalcor/types';  // Use type imports
import { ScoringOutputSchema } from '@medicalcor/types';
const result = ScoringOutputSchema.safeParse(data);      // Zod validation
```

### Testing (Vitest + fast-check)

```typescript
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

describe('ScoringService', () => {
  it('should return valid score range', () => {
    fc.assert(fc.property(fc.string(), (msg) => {
      const result = service.scoreMessage({ message: msg });
      return result.score >= 1 && result.score <= 5;
    }));
  });

  // Property-based test example
  it('should always return valid score range', () => {
    fc.assert(
      fc.property(fc.string(), (message) => {
        const result = service.scoreMessage({ message });
        return result.score >= 1 && result.score <= 5;
      })
    );
  });
});
```

**Test location**: `__tests__/*.test.ts` next to source files.

## Code Quality Rules (ESLint)

- No `any` (use `unknown`), No `console.log` (use logger)
- Max complexity: 15/function, Max lines: 100/function, 500/file
- Exhaustive switches, Type imports required, a11y for JSX

## Security Constraints

- Never commit secrets or `.env` files
- Never push directly to `main`, `master`, `production`, `staging`
- All webhooks require HMAC signature verification
- PII auto-redacted from logs, encryption at rest for PHI

---

## Domain Concepts

| Term | Description |
|------|-------------|
| Lead | Potential patient with scoring (HOT 4-5, WARM 3, COLD 2, UNQUALIFIED 1) |
| Triage | Urgency assessment with routing |
| Consent | GDPR tracking (2-year expiry) |
| All-on-X | Full-arch dental implant (premium) |
| Episode | Cognitive memory unit |

**Domain Services** (`packages/domain/src/`): scoring, triage, consent, scheduling, leads, patients, cases, ltv, retention, voice, routing, breach-notification, data-classification, behavioral-insights, capacity-planning

## Common Tasks

### Adding a Domain Service
1. Create in `packages/domain/src/{feature}/`
2. Define port in `packages/application/src/ports/`
3. Implement adapter in `packages/infrastructure/src/`
4. Add tests in `__tests__/`

### Adding a Webhook
1. Add route in `apps/api/src/routes/webhooks/`
2. Create Zod schema in `packages/types/src/`
3. Add HMAC signature verification
4. Create Trigger.dev task in `apps/trigger/src/`

### Adding an Integration
1. Create client in `packages/integrations/src/{service}.ts`
2. Implement retry logic with circuit breaker
3. Add to `clients-factory.ts`

### Adding a New Integration

1. Create client in `packages/integrations/src/{service}.ts`
2. Add types to `packages/types/src/`
3. Implement retry logic with circuit breaker
4. Add to `clients-factory.ts`
5. Add tests with MSW mocks

---

## Environment Variables

```bash
# Required - Core
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
DATA_ENCRYPTION_KEY=...      # 32-byte hex for PHI
MFA_ENCRYPTION_KEY=...       # 32-byte hex for MFA

# Integrations
HUBSPOT_ACCESS_TOKEN=...
WHATSAPP_API_KEY=...
STRIPE_SECRET_KEY=...
TWILIO_ACCOUNT_SID=...
VAPI_API_KEY=...

# RAG
RAG_ENABLED=true
RAG_EMBEDDING_MODEL=text-embedding-3-small
```

See `.env.example` for full list.

## GitHub Workflows

| Workflow | Purpose |
|----------|---------|
| `ci.yml` | Main CI (lint, typecheck, test, build, E2E) |
| `deploy.yml` / `rollback.yml` | Deployment & rollback |
| `security-ci.yml` | pnpm audit, gitleaks |
| `oss-security.yml` | OSSF Scorecard |
| `k6-load-tests.yml` | Load testing |
| `lighthouse-ci.yml` | Web performance |

## Claude Code Integration (`.claude/`)

**Commands**: `/analyze-tokens`, `/convert-to-toon`, `/discover-skills`, `/install-skill`, `/toon-encode`, `/toon-decode`, `/toon-validate`

**Hooks**: `settings-backup.sh`, `secret-scanner.sh`, `toon-validator.sh`, `markdown-formatter.sh`, `file-size-monitor.sh`

**Skills**: `medicalcor/` (HIPAA, GDPR, GPT-4o), `anthropic/`, `supabase/`, `stripe/`, `expo/`

---

## GitHub Workflows

| Workflow                   | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `ci.yml`                   | Main CI: lint, typecheck, test, build, E2E |
| `deploy.yml`               | Production deployment                      |
| `release.yml`              | Semantic release                           |
| `rollback.yml`             | Emergency rollback                         |
| `security-ci.yml`          | Security checks (pnpm audit, gitleaks)     |
| `security-monitoring.yml`  | Continuous security monitoring             |
| `oss-security.yml`         | OSS security (OSSF Scorecard)              |
| `smoke-tests.yml`          | Production smoke tests                     |
| `performance.yml`          | Performance benchmarks                     |
| `k6-load-tests.yml`        | k6 load testing                            |
| `lighthouse-ci.yml`        | Web performance (Lighthouse)               |
| `codeql-analysis.yml`      | CodeQL security scanning                   |
| `dependabot-automerge.yml` | Auto-merge safe updates                    |
| `trigger-deploy.yml`       | Trigger.dev deployment                     |

---

## Claude Code Integration

This project includes Claude Code configuration in `.claude/`:

### Commands (`.claude/commands/`)

| Command            | Purpose                |
| ------------------ | ---------------------- |
| `/analyze-tokens`  | Analyze token usage    |
| `/convert-to-toon` | Convert to TOON format |
| `/discover-skills` | Find available skills  |
| `/install-skill`   | Install a skill        |
| `/toon-encode`     | Encode to TOON         |
| `/toon-decode`     | Decode from TOON       |
| `/toon-validate`   | Validate TOON syntax   |

### Hooks (`.claude/hooks/`)

| Hook                    | Trigger                  | Purpose                |
| ----------------------- | ------------------------ | ---------------------- |
| `settings-backup.sh`    | PreToolUse (Edit/Write)  | Backup config files    |
| `secret-scanner.sh`     | PreToolUse (Edit/Write)  | Prevent secret commits |
| `toon-validator.sh`     | PostToolUse (Edit/Write) | Validate TOON syntax   |
| `markdown-formatter.sh` | PostToolUse (Edit/Write) | Auto-format markdown   |
| `file-size-monitor.sh`  | PostToolUse (Edit/Write) | Warn about large files |

### Skills (`.claude/skills/`)

| Skill         | Purpose                                                   |
| ------------- | --------------------------------------------------------- |
| `medicalcor/` | Domain-specific skills (HIPAA, GDPR, GPT-4o, Omnichannel) |
| `anthropic/`  | Claude API integration                                    |
| `supabase/`   | Supabase patterns                                         |
| `stripe/`     | Stripe integration                                        |
| `expo/`       | Mobile app development                                    |

---

## Documentation

| Document | Path |
|----------|------|
| Architecture | `docs/ARCHITECTURE.md` |
| API Reference | `docs/README/API_REFERENCE.md` |
| Deployment | `docs/README/DEPLOYMENT.md` |
| Testing | `docs/README/TESTING.md` |
| Security | `docs/README/SECURITY.md` |
| Workflows | `docs/README/WORKFLOWS.md` |
| Troubleshooting | `docs/README/TROUBLESHOOTING.md` |

**ADRs** (`docs/adr/`): 001-Hexagonal, 002-Cloud-Agnostic, 003-Architecture, 004-Cognitive-Memory, 005-HNSW-Vector

**Runbooks** (`docs/runbooks/`): COMMON_ISSUES, ESCALATION, INCIDENT_RESPONSE, ON_CALL, PARTITION_MAINTENANCE, ROLLBACK

## Change Classification

| Type | Examples | Requirements |
|------|----------|--------------|
| **FAST** | Bug fixes, tests, docs | Direct commit |
| **SLOW** | New services, schema changes | ADR required |
| **BLOCKED** | Direct main push, DROP TABLE | Never without approval |

## Layer Boundaries

**Forbidden in Domain**: `pg`, `openai`, `fastify`, `@supabase/supabase-js`

```bash
pnpm check:layer-boundaries  # Verify architecture
```

## Migration Safety

- **Never** modify existing migrations or use DROP without approval
- **Always** name as `YYYYMMDDHHMM_description.sql`, make idempotent

### Breach Notification

Use the breach notification service for security incidents:

```typescript
import { BreachNotificationService } from '@medicalcor/domain/breach-notification';
```

---

## Cognitive Memory System

Location: `packages/core/src/cognitive/`
See: `docs/adr/004-cognitive-episodic-memory.md`

- Never modify embedding dimensions without migration plan
- Never delete events (soft delete for GDPR)
- Pattern detection runs async via Trigger.dev

## Integrations

`packages/integrations/src/`: hubspot, whatsapp, vapi, flex, stripe, stripe-financing, openai, embeddings, embedding-cache, scheduling, insurance, notifications
