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
| API Reference | `docs/README/API_REFERENCE.md` |
| Security | `docs/README/SECURITY.md` |
| Testing | `docs/README/TESTING.md` |
| Deployment | `docs/README/DEPLOYMENT.md` |
| Contributing | `docs/CONTRIBUTING.md` |
