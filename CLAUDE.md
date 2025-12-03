# CLAUDE.md

## Purpose (WHY)

MedicalCor Core is an **AI-powered medical CRM platform** for dental clinics featuring GPT-4o lead scoring, omnichannel communication (WhatsApp, Voice, Web), and HIPAA/GDPR-compliant infrastructure.

## Stack & Structure (WHAT)

**Tech**: Node.js 20+, TypeScript 5.6 (strict), pnpm 9+, Turborepo, Fastify 5, Next.js 15, PostgreSQL 15 + pgvector, Redis 7

**Monorepo Layout**:
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
```

**Dependency order**: types → core → domain → integrations → apps

## Workflow (HOW)

```bash
pnpm install          # Install dependencies
pnpm dev              # Start all services
pnpm build            # Build all packages
pnpm test             # Run tests (Vitest)
pnpm lint && pnpm typecheck   # Validate code
pnpm db:migrate       # Run database migrations
```

## Key Constraints

- Never commit secrets or `.env` files
- Never push directly to `main`, `master`, `production`, or `staging`
- Use structured logger from `@medicalcor/core/logger` instead of `console.log`

## Documentation

- Architecture: `docs/ARCHITECTURE.md`
- Security: `docs/README/SECURITY.md`
- API Reference: `docs/README/API_REFERENCE.md`
- Configuration: `docs/README/CONFIGURATION.md`
- Deployment: `docs/README/DEPLOYMENT.md`
- Contributing: `docs/CONTRIBUTING.md`
