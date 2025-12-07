# CLAUDE.md

## Purpose

MedicalCor Core is an **AI-powered medical CRM platform** for dental clinics featuring GPT-4o lead scoring, omnichannel communication (WhatsApp, Voice, Web), and HIPAA/GDPR-compliant infrastructure. It follows hexagonal architecture (ports & adapters) for testability and technology flexibility.

## Tech Stack

| Category | Technology | Version |
|----------|------------|---------|
| Runtime | Node.js | 20+ |
| Language | TypeScript | 5.6 (strict mode) |
| Package Manager | pnpm | 9+ |
| Build System | Turborepo | 2.x |
| API Framework | Fastify | 5.x |
| Web Framework | Next.js | 15.x (App Router) |
| Database | PostgreSQL + pgvector | 15+ |
| Cache | Redis | 7+ |
| Background Jobs | Trigger.dev | 3.x |
| Testing | Vitest + Playwright | - |
| UI Components | Radix UI + Tailwind CSS | - |

## Monorepo Structure

```
apps/
  api/        → Fastify webhook gateway (port 3000)
  trigger/    → Trigger.dev durable workflows & cron jobs
  web/        → Next.js admin dashboard (port 3001)

packages/
  types/         → Zod schemas & TypeScript types (foundation)
  core/          → Logger, CQRS, auth, RAG, encryption, errors
  domain/        → Scoring, triage, consent, scheduling (business logic)
  application/   → Use cases, ports (hexagonal primary/secondary)
  infrastructure/→ Adapters (PostgreSQL, Supabase, OpenAI)
  integrations/  → HubSpot, WhatsApp, OpenAI, Vapi clients
  infra/         → Environment validation, health checks
```

### Dependency Order

```
types → core → domain → application → infrastructure → integrations → apps
```

**Critical rule**: Lower packages must never import from higher packages.

## Quick Commands

```bash
# Setup & Development
pnpm install              # Install dependencies (runs git hooks setup)
pnpm dev                  # Start all services (API:3000, Web:3001)
pnpm dev:api              # Start only API server

# Build & Validation
pnpm build                # Build all packages
pnpm typecheck            # TypeScript type checking
pnpm lint                 # Run ESLint
pnpm lint:fix             # Auto-fix lint issues
pnpm format               # Format with Prettier

# Testing
pnpm test                 # Run all tests (Vitest)
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage report
pnpm --filter @medicalcor/domain test  # Test specific package

# Database
pnpm db:migrate           # Run migrations
pnpm db:seed              # Seed development data
pnpm db:reset             # Reset database (Supabase)

# Quality
pnpm check:duplication    # Check code duplication (jscpd)
pnpm smoke-test           # Run smoke tests
pnpm k6:smoke             # k6 load testing (smoke)
```

## Key Conventions

### Logging

**Always use the structured logger** - never `console.log`:

```typescript
import { createLogger } from '@medicalcor/core';
// or
import { createLogger } from '@medicalcor/core/logger';

const logger = createLogger({ name: 'my-service' });

// With correlation ID for request tracing
const requestLogger = logger.child({ correlationId: 'req-123' });
requestLogger.info({ leadId: 'abc' }, 'Processing lead');
```

The logger automatically redacts PII (phone, email, names, etc.) for GDPR/HIPAA compliance.

### Error Handling

Use typed errors from `@medicalcor/core/errors`:

```typescript
import { ValidationError, NotFoundError, ExternalServiceError } from '@medicalcor/core/errors';

// Throw typed errors
throw new ValidationError('Invalid phone format', { field: 'phone' });
throw new NotFoundError('Lead');
throw new ExternalServiceError('HubSpot', 'Rate limited', originalError);

// Check operational vs programming errors
if (isOperationalError(error)) {
  return error.toSafeError(); // Safe for API response
}
```

### TypeScript Patterns

```typescript
// Use type imports
import type { ScoringOutput, LeadScore } from '@medicalcor/types';

// Zod schemas for runtime validation
import { ScoringOutputSchema } from '@medicalcor/types';
const result = ScoringOutputSchema.safeParse(data);

// Strict null checks - use optional chaining and nullish coalescing
const value = obj?.property ?? defaultValue;

// Exhaustive switch statements (enforced by ESLint)
switch (classification) {
  case 'HOT': return handleHot();
  case 'WARM': return handleWarm();
  case 'COLD': return handleCold();
  case 'UNQUALIFIED': return handleUnqualified();
  // No default needed - TypeScript ensures exhaustiveness
}
```

### Testing Patterns

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScoringService(config);
  });

  it('should return HOT score for All-on-X mentions', async () => {
    // Arrange
    const input = { message: 'I want All-on-X implants', context: mockContext };

    // Act
    const result = await service.scoreMessage(input);

    // Assert
    expect(result.score).toBe(5);
    expect(result.classification).toBe('HOT');
  });
});
```

**Test file location**: `__tests__/*.test.ts` next to source files or in `src/__tests__/`.

### Service Patterns

Services follow dependency injection:

```typescript
export interface ScoringServiceConfig {
  openaiApiKey: string;
  model?: string;
  fallbackEnabled?: boolean;
}

export interface ScoringServiceDeps {
  openai?: OpenAIClient;
}

export class ScoringService {
  constructor(config: ScoringServiceConfig, deps?: ScoringServiceDeps) {
    // ...
  }
}

// Factory function for convenience
export function createScoringService(config, deps): ScoringService {
  return new ScoringService(config, deps);
}
```

## Code Quality Rules

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

## Key Constraints

### Security
- Never commit secrets or `.env` files
- Never push directly to `main`, `master`, `production`, or `staging`
- All webhooks require HMAC signature verification
- PII is automatically redacted from logs
- Rate limiting on all external endpoints

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
```

## Domain Concepts

| Term | Description |
|------|-------------|
| Lead | Potential patient with contact info and scoring |
| LeadScore | HOT (4-5), WARM (3), COLD (2), UNQUALIFIED (1) |
| Triage | Urgency assessment with routing recommendations |
| Consent | GDPR consent tracking (2-year expiry) |
| All-on-X | Full-arch dental implant procedure (premium) |
| OSAX | MedicalCor's clinical workflow system |

## Common Tasks

### Adding a New Domain Service

1. Create service in `packages/domain/src/{feature}/`
2. Define port interface in `packages/application/src/ports/`
3. Implement adapter in `packages/infrastructure/src/`
4. Export from package `index.ts`
5. Add tests in `__tests__/`

### Adding a New Webhook

1. Add route in `apps/api/src/routes/webhooks/`
2. Create Zod schema in `packages/types/src/`
3. Add signature verification (see existing webhooks)
4. Create Trigger.dev task in `apps/trigger/src/`
5. Add integration tests

### Adding UI Components

1. Create in `apps/web/src/components/ui/`
2. Use Radix UI primitives + Tailwind
3. Add Storybook story (`*.stories.tsx`)
4. Ensure accessibility (a11y) compliance

## Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Required
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
HUBSPOT_ACCESS_TOKEN=pat-...

# Optional integrations
WHATSAPP_API_KEY=...
VAPI_API_KEY=...
STRIPE_SECRET_KEY=sk_...
```

See `.env.example` for full list with descriptions.

## Documentation

| Document | Path |
|----------|------|
| Architecture | `docs/ARCHITECTURE.md` |
| ADRs | `docs/adr/` |
| Cognitive Memory | `docs/adr/004-cognitive-episodic-memory.md` |
| OSAX Specification | `docs/SPEC_OSAX_V3.2_MULTIMODAL.md` |
| Workflows (Trigger.dev) | `docs/README/WORKFLOWS.md` |
| API Reference | `docs/README/API_REFERENCE.md` |
| Security | `docs/SECURITY.md` |
| Testing | `docs/README/TESTING.md` |
| Deployment | `docs/README/DEPLOYMENT.md` |
| Contributing | `docs/CONTRIBUTING.md` |
| Claude Code Rules | `docs/PROJECT_RULES_CLAUDE.md` |

---

## Change Classification (Quality Gates)

Before making changes, classify them:

| Type | Examples | Requirements |
|------|----------|--------------|
| **FAST** (safe) | Bug fixes, tests, docs, UI tweaks | Direct commit to feature branch |
| **SLOW** (needs review) | New domain services, new integrations, schema changes | Requires ADR or RFC discussion |
| **BLOCKED** (forbidden) | Direct `main` push, migration drops, security bypasses | Never proceed without explicit approval |

### SLOW changes require ADR when:
- Adding new bounded context or aggregate
- Changing database schema (especially drops/renames)
- Adding new external service integration
- Modifying authentication/authorization logic
- Changes to `packages/core/src/cognitive/` (episodic memory)

## Layer Boundaries & Refactoring Rules

### Forbidden in Domain Layer (`packages/domain/`)
```typescript
// NEVER import these in domain:
import { Pool } from 'pg';           // ❌ Infrastructure
import { OpenAI } from 'openai';     // ❌ External SDK
import { FastifyRequest } from 'fastify'; // ❌ HTTP framework
import { createClient } from '@supabase/supabase-js'; // ❌ Adapter
```

### Allowed Refactoring Zones
| Zone | Refactoring Allowed | Notes |
|------|---------------------|-------|
| `apps/web/src/components/` | Yes | UI components, keep Storybook updated |
| `packages/domain/src/` | Careful | Pure logic only, no infra leaks |
| `packages/infrastructure/` | Yes | Adapter implementations |
| `packages/core/src/cognitive/` | **ADR Required** | Critical AI memory system |
| `db/migrations/` | **Never modify existing** | Only add new migrations |

### Detecting Layer Violations
Before committing, verify:
```bash
# Check domain doesn't import infrastructure
pnpm --filter @medicalcor/domain build  # Should pass with no external deps
pnpm lint                                # ESLint catches import violations
```

## Migration Safety Rules

### Never
- Modify or delete existing migration files
- Use `DROP COLUMN` or `DROP TABLE` without explicit approval
- Add `NOT NULL` columns without defaults to existing tables

### Always
- Name migrations: `YYYYMMDDHHMM_description.sql`
- Make migrations idempotent (use `IF NOT EXISTS`, `IF EXISTS`)
- Test rollback: `pnpm db:migrate` then `pnpm db:reset`
- Add indexes concurrently for large tables: `CREATE INDEX CONCURRENTLY`

## Medical Compliance Rules (HIPAA/GDPR)

When writing code that handles patient/lead data:

### PII Handling
```typescript
// ✅ Correct - use structured logger with auto-redaction
logger.info({ phone: patient.phone }, 'Processing patient');

// ❌ Wrong - raw console.log exposes PII
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

## Cognitive Memory System

The episodic memory system (`packages/core/src/cognitive/`) is critical infrastructure.

**See**: `docs/adr/004-cognitive-episodic-memory.md` for full architecture.

### Key Components
| Component | Purpose |
|-----------|---------|
| `episode-builder.ts` | Processes events into episodic memories |
| `memory-retrieval.ts` | Semantic + temporal queries |
| `pattern-detector.ts` | Behavioral pattern recognition |
| `knowledge-graph.ts` | Entity relationships |
| `gdpr-erasure.ts` | GDPR right-to-erasure implementation |

### Rules for Cognitive System
- Never modify embedding dimensions without migration plan
- Never delete episodic events (use soft delete for GDPR)
- Always include `correlationId` when creating episodes
- Pattern detection runs async via Trigger.dev, never in request path

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
