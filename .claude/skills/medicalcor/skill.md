# MedicalCor Expert

> Auto-activates when: MedicalCor, medical CRM, dental clinic, lead scoring, patient acquisition, dental leads

## Overview

MedicalCor Core is an AI-powered medical CRM platform for dental clinics featuring GPT-4o lead scoring, omnichannel communication (WhatsApp, Voice, Web), and HIPAA/GDPR-compliant infrastructure.

## Architecture

### Monorepo Structure

```
apps/
  api/        → Fastify webhook gateway (port 3000)
  trigger/    → Trigger.dev workers & cron jobs
  web/        → Next.js admin dashboard (port 3001)
packages/
  types/      → Shared Zod schemas (foundation)
  core/       → Logger, CQRS, auth, RAG, encryption
  domain/     → Scoring, triage, consent, scheduling
  integrations/ → HubSpot, WhatsApp, OpenAI, Vapi clients
  infrastructure/ → Database, cache, message queue implementations
  application/  → Application services and use cases
```

### Dependency Order

`types → core → domain → integrations → apps`

### Tech Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.6 (strict mode)
- **Package Manager**: pnpm 9+
- **Build System**: Turborepo
- **API Framework**: Fastify 5
- **Frontend**: Next.js 15
- **Database**: PostgreSQL 15 + pgvector
- **Cache**: Redis 7

## Domain Concepts

### Lead Scoring

AI-powered scoring using GPT-4o to evaluate dental patient leads:

- Location: `packages/domain/src/scoring/scoring-service.ts`
- Use case: `packages/domain/src/patient-acquisition/use-cases/score-lead.ts`
- Value object: `packages/domain/src/shared-kernel/value-objects/lead-score.ts`

### Patient Triage

Automated patient prioritization:

- Service: `packages/domain/src/triage/triage-service.ts`

### Consent Management

HIPAA/GDPR compliant consent tracking:

- Service: `packages/domain/src/consent/consent-service.ts`
- Repository: `packages/domain/src/consent/consent-repository.ts`

### Scheduling

Appointment management:

- Service: `packages/domain/src/scheduling/scheduling-service.ts`

### OSAX Clinical Cases

Clinical case management with scoring:

- Entity: `packages/domain/src/osax/entities/OsaxCase.ts`
- Scoring: `packages/domain/src/osax/services/OsaxScoringPolicy.ts`

## Key Patterns

### CQRS Pattern

Command Query Responsibility Segregation for separating reads and writes:

```typescript
// Commands mutate state
class CreateLeadCommand { ... }

// Queries read state
class GetLeadByIdQuery { ... }
```

### Domain Events

Event-driven architecture for decoupled systems:

- Lead events: `packages/domain/src/shared-kernel/domain-events/lead-events.ts`
- OSAX events: `packages/domain/src/osax/events/osax-events.ts`

### Repository Pattern

Abstracted data access:

- Lead repository: `packages/domain/src/shared-kernel/repository-interfaces/lead-repository.ts`
- CRM gateway: `packages/domain/src/shared-kernel/repository-interfaces/crm-gateway.ts`
- AI gateway: `packages/domain/src/shared-kernel/repository-interfaces/ai-gateway.ts`

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start all services
pnpm build            # Build all packages
pnpm test             # Run tests (Vitest)
pnpm lint             # Run ESLint
pnpm typecheck        # TypeScript validation
pnpm db:migrate       # Run database migrations
```

## Key Constraints

1. **Never commit secrets** or `.env` files
2. **Never push directly** to `main`, `master`, `production`, or `staging`
3. **Use structured logger** from `@medicalcor/core/logger` instead of `console.log`
4. **Follow dependency order**: types → core → domain → integrations → apps

## Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Security: `docs/README/SECURITY.md`
- API Reference: `docs/README/API_REFERENCE.md`
- Configuration: `docs/README/CONFIGURATION.md`
- Deployment: `docs/README/DEPLOYMENT.md`
- Contributing: `docs/CONTRIBUTING.md`

## Testing

Tests use Vitest and are co-located with source code in `__tests__` directories:

```
packages/domain/src/__tests__/
  scoring.test.ts
  triage.test.ts
  consent.test.ts
  value-objects.test.ts
  e2e-critical-flows.test.ts
```

Run tests:

```bash
pnpm test                    # All tests
pnpm test:watch             # Watch mode
pnpm test --filter=domain   # Specific package
```
