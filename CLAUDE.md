# CLAUDE.md

## Purpose

MedicalCor Core is an **AI-powered medical CRM platform** for dental clinics featuring GPT-4o lead scoring, omnichannel communication (WhatsApp, Voice, Web), and HIPAA/GDPR-compliant infrastructure. It follows hexagonal architecture (ports & adapters) for testability and technology flexibility.

---

## Tech Stack

| Category         | Technology                    | Version           |
| ---------------- | ----------------------------- | ----------------- |
| Runtime          | Node.js                       | 20+               |
| Language         | TypeScript                    | 5.9 (strict mode) |
| Package Manager  | pnpm                          | 10+               |
| Build System     | Turborepo                     | 2.6.x             |
| API Framework    | Fastify                       | 5.x               |
| Web Framework    | Next.js                       | 15.x (App Router) |
| Database         | PostgreSQL + pgvector         | 15+               |
| Cache            | Redis                         | 7+                |
| Background Jobs  | Trigger.dev                   | 3.x               |
| Testing          | Vitest 4.x + Playwright 1.57  | -                 |
| Property Testing | fast-check                    | 4.x               |
| UI Components    | Radix UI + Tailwind CSS       | -                 |
| Observability    | Sentry + Prometheus + Grafana | -                 |
| AI/LLM           | OpenAI GPT-4o                 | -                 |
| Agent SDK        | Claude Agent SDK              | 0.1.x             |

---

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
import type { ScoringOutput } from '@medicalcor/types'; // Use type imports
import { ScoringOutputSchema } from '@medicalcor/types';
const result = ScoringOutputSchema.safeParse(data);

// Strict null checks - use optional chaining and nullish coalescing
const value = obj?.property ?? defaultValue;

// Exhaustive switch statements (enforced by ESLint)
switch (classification) {
  case 'HOT':
    return handleHot();
  case 'WARM':
    return handleWarm();
  case 'COLD':
    return handleCold();
  case 'UNQUALIFIED':
    return handleUnqualified();
  // No default needed - TypeScript ensures exhaustiveness
}
```

### Testing (Vitest + fast-check)

```typescript
import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

describe('ScoringService', () => {
  it('should return valid score range', () => {
    fc.assert(
      fc.property(fc.string(), (msg) => {
        const result = service.scoreMessage({ message: msg });
        return result.score >= 1 && result.score <= 5;
      })
    );
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

These are enforced by ESLint (`eslint.config.js`):

- **No `any`**: Use `unknown` or proper types
- **No `console.log`**: Use structured logger
- **Cyclomatic complexity**: Max 15 per function
- **Function length**: Max 100 lines
- **File length**: Max 500 lines
- **Nesting depth**: Max 4 levels
- **Exhaustive switches**: All cases must be handled
- **Type imports**: Use `import type` for types only
- **Accessibility**: JSX must follow a11y rules (medical apps requirement)

---

## Key Constraints

### Security

- Never commit secrets or `.env` files
- Never push directly to `main`, `master`, `production`, `staging`
- All webhooks require HMAC signature verification
- PII is automatically redacted from logs
- Rate limiting on all external endpoints
- Encryption at rest for PHI/PII (HIPAA requirement)

### Architecture

- Domain layer has no infrastructure dependencies
- External interactions go through ports (interfaces)
- Adapters implement ports exactly
- Use Zod schemas for all external data validation

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat(scoring): add rule-based fallback
fix(api): resolve webhook signature validation
docs: update API reference
refactor(domain): extract lead factory
test(core): add logger PII redaction tests
ci(workflows): fix pnpm setup order
perf(rag): optimize embedding cache
```

---

## Domain Concepts

| Term        | Description                                     |
| ----------- | ----------------------------------------------- |
| Lead        | Potential patient with contact info and scoring |
| LeadScore   | HOT (4-5), WARM (3), COLD (2), UNQUALIFIED (1)  |
| Triage      | Urgency assessment with routing recommendations |
| Consent     | GDPR consent tracking (2-year expiry)           |
| All-on-X    | Full-arch dental implant procedure (premium)    |
| OSAX        | MedicalCor's clinical workflow system           |
| LTV         | Lifetime Value prediction and analysis          |
| Case        | Treatment case management                       |
| Disposition | Lead outcome tracking                           |
| Episode     | Cognitive memory unit for patient interactions  |

### Domain Services (`packages/domain/src/`)

| Service                | Purpose                      |
| ---------------------- | ---------------------------- |
| `scoring/`             | AI-powered lead scoring      |
| `triage/`              | Urgency assessment           |
| `consent/`             | GDPR consent management      |
| `scheduling/`          | Appointment scheduling       |
| `leads/`               | Lead management              |
| `patients/`            | Patient records              |
| `cases/`               | Treatment case management    |
| `ltv/`                 | Lifetime value calculations  |
| `retention/`           | Patient retention strategies |
| `voice/`               | Voice call processing        |
| `routing/`             | Lead routing logic           |
| `breach-notification/` | HIPAA breach handling        |
| `data-classification/` | PHI/PII classification       |
| `behavioral-insights/` | Patient behavior analysis    |
| `capacity-planning/`   | Clinic capacity management   |

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

| Workflow                      | Purpose                                     |
| ----------------------------- | ------------------------------------------- |
| `ci.yml`                      | Main CI (lint, typecheck, test, build, E2E) |
| `deploy.yml` / `rollback.yml` | Deployment & rollback                       |
| `security-ci.yml`             | pnpm audit, gitleaks                        |
| `oss-security.yml`            | OSSF Scorecard                              |
| `k6-load-tests.yml`           | Load testing                                |
| `lighthouse-ci.yml`           | Web performance                             |

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

| Document                | Path                                    |
| ----------------------- | --------------------------------------- |
| Architecture            | `docs/ARCHITECTURE.md`                  |
| Getting Started         | `docs/README/GETTING_STARTED.md`        |
| API Reference           | `docs/README/API_REFERENCE.md`          |
| Deployment              | `docs/README/DEPLOYMENT.md`             |
| Testing                 | `docs/README/TESTING.md`                |
| E2E Setup               | `docs/README/E2E_SETUP.md`              |
| Security                | `docs/README/SECURITY.md`               |
| Monitoring              | `docs/README/MONITORING.md`             |
| Workflows (Trigger.dev) | `docs/README/WORKFLOWS.md`              |
| Troubleshooting         | `docs/README/TROUBLESHOOTING.md`        |
| FAQ                     | `docs/README/FAQ.md`                    |
| Glossary                | `docs/README/GLOSSARY.md`               |
| Key Rotation            | `docs/README/KEY_ROTATION_PROCEDURE.md` |
| Configuration           | `docs/README/CONFIGURATION.md`          |
| Contributing            | `docs/CONTRIBUTING.md`                  |
| OSAX Specification      | `docs/SPEC_OSAX_V3.2_MULTIMODAL.md`     |
| Claude Code Rules       | `docs/PROJECT_RULES_CLAUDE.md`          |

### ADRs (`docs/adr/`)

| ADR | Topic                          |
| --- | ------------------------------ |
| 001 | Hexagonal Architecture         |
| 002 | Cloud-Agnostic Strategy        |
| 003 | Architecture Improvements      |
| 004 | Cognitive Episodic Memory      |
| 005 | HNSW Vector Embedding Strategy |

### Runbooks (`docs/runbooks/`)

| Runbook                    | Purpose                       |
| -------------------------- | ----------------------------- |
| `COMMON_ISSUES.md`         | Known issues and solutions    |
| `ESCALATION.md`            | Escalation procedures         |
| `INCIDENT_RESPONSE.md`     | Incident handling             |
| `ON_CALL.md`               | On-call procedures            |
| `PARTITION_MAINTENANCE.md` | Database partition management |
| `ROLLBACK.md`              | Rollback procedures           |

**ADRs** (`docs/adr/`): 001-Hexagonal, 002-Cloud-Agnostic, 003-Architecture, 004-Cognitive-Memory, 005-HNSW-Vector

**Runbooks** (`docs/runbooks/`): COMMON_ISSUES, ESCALATION, INCIDENT_RESPONSE, ON_CALL, PARTITION_MAINTENANCE, ROLLBACK

## Change Classification

| Type                    | Examples                                               | Requirements                            |
| ----------------------- | ------------------------------------------------------ | --------------------------------------- |
| **FAST** (safe)         | Bug fixes, tests, docs, UI tweaks                      | Direct commit to feature branch         |
| **SLOW** (needs review) | New domain services, new integrations, schema changes  | Requires ADR or RFC discussion          |
| **BLOCKED** (forbidden) | Direct `main` push, migration drops, security bypasses | Never proceed without explicit approval |

### SLOW changes require ADR when:

- Adding new bounded context or aggregate
- Changing database schema (especially drops/renames)
- Adding new external service integration
- Modifying authentication/authorization logic
- Changes to `packages/core/src/cognitive/` (episodic memory)
- Changes to embedding dimensions or vector strategy

## Layer Boundaries

**Forbidden in Domain**: `pg`, `openai`, `fastify`, `@supabase/supabase-js`

### Forbidden in Domain Layer (`packages/domain/`)

```typescript
// NEVER import these in domain:
import { Pool } from 'pg'; // Infrastructure
import { OpenAI } from 'openai'; // External SDK
import { FastifyRequest } from 'fastify'; // HTTP framework
import { createClient } from '@supabase/supabase-js'; // Adapter
```

### Allowed Refactoring Zones

| Zone                           | Refactoring Allowed       | Notes                                 |
| ------------------------------ | ------------------------- | ------------------------------------- |
| `apps/web/src/components/`     | Yes                       | UI components, keep Storybook updated |
| `packages/domain/src/`         | Careful                   | Pure logic only, no infra leaks       |
| `packages/infrastructure/`     | Yes                       | Adapter implementations               |
| `packages/core/src/cognitive/` | **ADR Required**          | Critical AI memory system             |
| `db/migrations/`               | **Never modify existing** | Only add new migrations               |

### Detecting Layer Violations

Before committing, verify:

```bash
pnpm check:layer-boundaries  # Verify architecture
```

## Migration Safety

### Never

- Modify or delete existing migration files
- Use `DROP COLUMN` or `DROP TABLE` without explicit approval
- Add `NOT NULL` columns without defaults to existing tables

### Always

- Name migrations: `YYYYMMDDHHMM_description.sql`
- Make migrations idempotent (use `IF NOT EXISTS`, `IF EXISTS`)
- Test rollback: `pnpm db:migrate` then `pnpm db:reset`
- Add indexes concurrently for large tables: `CREATE INDEX CONCURRENTLY`

---

## Medical Compliance Rules (HIPAA/GDPR)

When writing code that handles patient/lead data:

### PII Handling

```typescript
// Correct - use structured logger with auto-redaction
logger.info({ phone: patient.phone }, 'Processing patient');

// Wrong - raw console.log exposes PII
console.log(`Processing patient ${patient.phone}`);
```

### PHI in Code

- Never hardcode phone numbers, emails, or names in tests (use faker)
- Never log message content without redaction
- Never store raw PII in error messages or stack traces

### Consent Checks

Before any outbound communication:

```typescript
// Always verify consent before messaging
const hasConsent = await consentService.hasValidConsent(leadId, 'marketing');
if (!hasConsent) {
  logger.warn({ leadId }, 'Skipping message - no valid consent');
  return;
}
```

### Breach Notification

Use the breach notification service for security incidents:

```typescript
import { BreachNotificationService } from '@medicalcor/domain/breach-notification';
```

---

## Cognitive Memory System

The episodic memory system (`packages/core/src/cognitive/`) is critical infrastructure.

**See**: `docs/adr/004-cognitive-episodic-memory.md` for full architecture.

### Key Components

| Component             | Purpose                                 |
| --------------------- | --------------------------------------- |
| `episode-builder.ts`  | Processes events into episodic memories |
| `memory-retrieval.ts` | Semantic + temporal queries             |
| `pattern-detector.ts` | Behavioral pattern recognition          |
| `knowledge-graph.ts`  | Entity relationships                    |
| `gdpr-erasure.ts`     | GDPR right-to-erasure implementation    |

### Rules for Cognitive System

- Never modify embedding dimensions without migration plan
- Never delete events (soft delete for GDPR)
- Pattern detection runs async via Trigger.dev

The RAG system provides context-aware AI responses:

```typescript
import { RAGService } from '@medicalcor/core/rag';

const ragService = new RAGService({
  embeddingModel: 'text-embedding-3-small',
  retrievalTopK: 5,
  similarityThreshold: 0.7,
});

const context = await ragService.retrieve(query);
```

### Ingesting Knowledge

```bash
pnpm db:ingest  # Ingest knowledge base documents
```

---

## Workflow Development

**See**: `docs/README/WORKFLOWS.md` for Trigger.dev patterns.

### Adding a New Workflow

1. Define task in `apps/trigger/src/tasks/`
2. Create workflow in `apps/trigger/src/workflows/`
3. Add Zod schema for payload validation
4. Configure retry policy (default: 3 attempts, exponential backoff)
5. Add to cron schedule if recurring (`apps/trigger/src/jobs/`)

### Workflow Idempotency

All workflows must be idempotent:

```typescript
// Use idempotency key to prevent duplicate processing
const idempotencyKey = `${taskName}:${payload.id}:${payload.timestamp}`;
const existing = await redis.get(idempotencyKey);
if (existing) return { skipped: true };
```

---

## Infrastructure

### Local Development

```bash
# Start full stack
docker-compose up -d

# Start with monitoring (Prometheus, Grafana)
docker-compose --profile monitoring up -d
```

### Production Infrastructure (`infra/`)

| Component      | Path                            |
| -------------- | ------------------------------- |
| Docker Compose | `infra/docker-compose.prod.yml` |
| Prometheus     | `infra/prometheus/`             |
| Grafana        | `infra/grafana/`                |
| Alertmanager   | `infra/alertmanager/`           |
| Terraform      | `infra/terraform/`              |

---

## Integrations (`packages/integrations/src/`)

| Integration           | Purpose                        |
| --------------------- | ------------------------------ |
| `hubspot.ts`          | HubSpot CRM sync               |
| `whatsapp.ts`         | WhatsApp messaging (360dialog) |
| `vapi.ts`             | Voice AI (Vapi)                |
| `flex.ts`             | Twilio Flex (supervisor)       |
| `stripe.ts`           | Payment processing             |
| `stripe-financing.ts` | Patient financing              |
| `openai.ts`           | GPT-4o integration             |
| `embeddings.ts`       | Vector embeddings              |
| `embedding-cache.ts`  | Embedding cache layer          |
| `scheduling.ts`       | Appointment scheduling         |
| `insurance.ts`        | Insurance verification         |
| `notifications.ts`    | Multi-channel notifications    |
