# CLAUDE.md - AI Assistant Guide for MedicalCor Core

This document provides essential context for AI assistants (Claude Code, GitHub Copilot, etc.) working on the MedicalCor codebase.

## Project Overview

MedicalCor Core is an **AI-powered medical CRM platform** for dental clinics, featuring:
- GPT-4o lead scoring and intelligent classification
- Omnichannel communication (WhatsApp, Voice, Web)
- CQRS + Event Sourcing architecture
- Durable workflows with Trigger.dev
- HIPAA/GDPR compliance-ready infrastructure

**Tech Stack**: Node.js 20+, TypeScript 5.6 (strict), pnpm 9+, Turborepo, Fastify 5, Next.js 15, PostgreSQL 15 + pgvector, Redis 7, Vitest, Playwright

## Repository Structure

```
medicalcor-core/
├── apps/
│   ├── api/              # Fastify webhook gateway (port 3000)
│   ├── trigger/          # Trigger.dev workers & cron jobs
│   └── web/              # Next.js admin dashboard (port 3001)
├── packages/
│   ├── types/            # Shared Zod schemas (@medicalcor/types)
│   ├── core/             # Logger, CQRS, auth, RAG, encryption (@medicalcor/core)
│   ├── domain/           # Scoring, triage, consent, scheduling (@medicalcor/domain)
│   ├── integrations/     # HubSpot, WhatsApp, OpenAI, Vapi clients (@medicalcor/integrations)
│   ├── infra/            # Infrastructure utilities (@medicalcor/infra)
│   └── infrastructure/   # Cloud-agnostic infrastructure (@medicalcor/infrastructure)
├── db/                   # Database migrations (dbmate)
├── infra/                # Infrastructure configs (Docker, K8s)
├── scripts/              # Utility scripts
└── docs/                 # Documentation
```

### Package Dependencies (Bottom-Up)
```
@medicalcor/types (foundation)
    ↓
@medicalcor/core (depends on types)
    ↓
@medicalcor/domain (depends on core, types)
    ↓
@medicalcor/integrations (depends on core, domain, types)
    ↓
apps/* (depend on all packages)
```

## Quick Commands

```bash
# Development
pnpm install              # Install all dependencies
pnpm dev                  # Start all services (Turborepo)
pnpm dev:api              # Start API only

# Building
pnpm build                # Build all packages
pnpm clean                # Clean all build artifacts

# Code Quality
pnpm lint                 # ESLint check
pnpm lint:fix             # Auto-fix lint issues
pnpm format               # Prettier format
pnpm format:check         # Check formatting
pnpm typecheck            # TypeScript type checking

# Testing
pnpm test                 # Run all tests (Vitest)
pnpm test:watch           # Watch mode
pnpm test:coverage        # With coverage report

# Database
pnpm db:migrate           # Run migrations
pnpm db:migrate:status    # Check migration status
pnpm db:seed              # Seed database

# Architecture Audit
pnpm xray-audit           # Run comprehensive architecture audit
pnpm xray-audit:report    # Generate audit report (saves to XRAY_AUDIT_REPORT.md)
```

## Code Style & Conventions

### TypeScript Rules (Strict Mode)
- **NO `any` types** - use `unknown` or proper types
- **NO unsafe operations** - `@typescript-eslint/no-unsafe-*` rules enforced
- **Consistent type imports**: `import { type Foo } from '...'`
- **Switch exhaustiveness**: All switch cases must be handled
- **Nullish coalescing**: Use `??` instead of `||` for defaults
- **Unused vars**: Prefix with `_` (e.g., `_unused`)

### Code Complexity Limits
- **Max cyclomatic complexity**: 15
- **Max function lines**: 100
- **Max file lines**: 500
- **Max nesting depth**: 4

### Import Organization
```typescript
// 1. Built-in modules
import path from 'path';

// 2. External packages
import { z } from 'zod';

// 3. Internal packages
import { type LeadContext } from '@medicalcor/types';

// 4. Parent/sibling/index
import { logger } from '../logger';
```

### Console Usage
- **NO `console.log`** in production code
- Use `console.warn`, `console.error`, `console.info`, or `console.debug`
- Prefer the structured logger: `import { logger } from '@medicalcor/core/logger'`

### Accessibility (JSX)
- All images require `alt` text
- All form controls require labels
- ARIA attributes must be valid
- Interactive elements must be focusable

## Commit Convention (Conventional Commits)

```
type(scope): description

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
```

**Examples**:
```bash
feat(api): add WhatsApp webhook rate limiting
fix(scoring): correct lead classification for cold leads
docs(readme): update deployment instructions
refactor(core): extract phone validation to separate module
test(integrations): add HubSpot mock server tests
```

**Rules**:
- Subject must be lowercase
- No period at end
- Max header length: 100 characters
- Use imperative mood ("add" not "added")

## Git Workflow

### Branch Protection
**NEVER push directly to**:
- `main`
- `master`
- `production`
- `staging`

### Branch Naming
```
feature/description       # New features
fix/description           # Bug fixes
hotfix/description        # Urgent production fixes
refactor/description      # Code improvements
docs/description          # Documentation
claude/description-xxx    # AI-assisted work
```

### Before Any Work
```bash
# 1. Verify current branch
git branch --show-current

# 2. If on main, create feature branch
git checkout -b feature/my-changes

# 3. Pull latest changes
git pull origin main
```

### Ending a Session
```bash
# 1. Commit changes
git add .
git commit -m "type(scope): description"

# 2. Push to remote
git push -u origin feature-branch-name
```

## Testing Strategy

### Test Files
- Unit/Integration: `*.test.ts` or `*.spec.ts`
- Location: Co-located in `__tests__/` directories
- E2E: `apps/api/e2e/` (Playwright)

### Running Tests
```bash
# All tests
pnpm test

# Specific package
pnpm --filter @medicalcor/core test

# With coverage
pnpm test:coverage
```

### Mocking
- Use **MSW (Mock Service Worker)** for HTTP mocking
- Mock files in `packages/integrations/src/__mocks__/`
- Test utilities in `vitest.setup.ts`

## CI/CD Pipeline

The CI workflow (`ci.yml`) runs on push/PR to main:

1. **Lint** - ESLint + Prettier check
2. **Type Check** - TypeScript compilation
3. **Unit Tests** - Vitest with coverage
4. **E2E Tests** - Playwright (sharded)
5. **Build** - Turborepo build
6. **Security Scan** - pnpm audit + Trivy
7. **Secrets Scan** - GitLeaks
8. **License Check** - Approved licenses only
9. **Schema Validation** - Database migration test
10. **Docker Build** - Multi-arch image (main only)

**Required checks before merge**:
- lint
- typecheck
- test
- e2e
- build
- secrets-scan
- schema-validation

## Security Guidelines

### NEVER Commit
- API keys, tokens, or credentials
- `.env` files with real values
- Private keys or certificates
- Patient data or PII

### Environment Variables
- Copy `.env.example` to `.env`
- Generate secrets: `openssl rand -base64 32`
- Password hashes: `npx bcryptjs hash "password" 12`

### Webhook Security
All webhooks require signature verification:
- WhatsApp: HMAC-SHA256 (`WHATSAPP_WEBHOOK_SECRET`)
- Stripe: Stripe signature (`STRIPE_WEBHOOK_SECRET`)
- Vapi: HMAC-SHA256 (`VAPI_WEBHOOK_SECRET`)
- Twilio: Twilio signature validation

### Data Protection
- PII redaction in logs (phone, email, CNP)
- GDPR consent tracking required
- Encryption at rest for sensitive fields
- TLS required for all connections

## Key Integrations

| Service | Purpose | Package |
|---------|---------|---------|
| HubSpot | CRM, contacts, deals | `@medicalcor/integrations/hubspot` |
| WhatsApp (360dialog) | Messaging | `@medicalcor/integrations/whatsapp` |
| OpenAI | GPT-4o scoring, embeddings | `@medicalcor/integrations/openai` |
| Vapi | Voice AI | `@medicalcor/integrations/vapi` |
| Stripe | Payments | Webhook handlers |
| Trigger.dev | Background jobs | `apps/trigger/` |

## Common Patterns

### Zod Schema Validation
```typescript
import { z } from 'zod';

const LeadSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  score: z.number().int().min(1).max(5),
});

type Lead = z.infer<typeof LeadSchema>;
```

### Error Handling
```typescript
import { AppError, NotFoundError } from '@medicalcor/core/errors';

// Throw domain-specific errors
throw new NotFoundError('Lead not found', { leadId });

// Handle in routes with structured response
```

### Logging with Context
```typescript
import { logger } from '@medicalcor/core/logger';

logger.info({ leadId, action: 'scored' }, 'Lead scoring complete');
logger.error({ err, context }, 'Failed to process webhook');
```

### Circuit Breaker for External Calls
```typescript
import { CircuitBreaker } from '@medicalcor/core';

const breaker = new CircuitBreaker('hubspot', {
  failureThreshold: 5,
  resetTimeout: 30000,
});

const result = await breaker.call(() => hubspotClient.getContact(id));
```

## Database Migrations

- Tool: **dbmate**
- Location: `db/migrations/`
- Naming: `YYYYMMDDHHMMSS_description.sql`

```bash
# Create new migration
cd db && dbmate new add_lead_scoring_column

# Run migrations
pnpm db:migrate

# Check status
pnpm db:migrate:status
```

## Troubleshooting

### Build Errors
```bash
# Clean and rebuild
pnpm clean && pnpm install && pnpm build
```

### Type Errors
```bash
# Check specific package
pnpm --filter @medicalcor/core typecheck
```

### Test Failures
```bash
# Run single test file
pnpm test -- packages/core/src/__tests__/phone.test.ts

# Run with verbose output
pnpm test -- --reporter=verbose
```

### Port Conflicts
- API: 3000
- Web: 3001
- PostgreSQL: 5432
- Redis: 6379

## Pull Request Checklist

Before submitting a PR:

- [ ] Branch is up to date with `main`
- [ ] All tests pass: `pnpm test`
- [ ] Linting passes: `pnpm lint`
- [ ] Types check: `pnpm typecheck`
- [ ] Format check: `pnpm format:check`
- [ ] No secrets in code
- [ ] Documentation updated if needed
- [ ] Commit messages follow conventions

## Documentation Links

- [Architecture](./docs/ARCHITECTURE.md)
- [API Reference](./docs/README/API_REFERENCE.md)
- [Configuration](./docs/README/CONFIGURATION.md)
- [Deployment](./docs/README/DEPLOYMENT.md)
- [Security](./docs/README/SECURITY.md)
- [Contributing](./docs/CONTRIBUTING.md)
- [ADRs](./docs/adr/)

## Emergency Procedures

### Accidentally on main
```bash
git stash
git checkout -b feature/my-changes
git stash pop
```

### Committed secrets
1. **IMMEDIATELY** rotate the exposed credentials
2. Remove from git history (force push with caution)
3. Notify security team: security@medicalcor.ro

---

*Last updated: December 2024*
