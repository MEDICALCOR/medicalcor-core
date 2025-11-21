# medicalcor-core

Medical lead management system with AI-powered scoring and omnichannel communication.

## Architecture

```
medicalcor-core/
├── apps/
│   ├── api/                 # Fastify Server (Webhook Gateway)
│   └── trigger/             # Trigger.dev Workers
├── packages/
│   ├── core/                # Shared Business Logic (logger, errors, utils)
│   ├── types/               # Shared Zod Schemas
│   ├── integrations/        # External Services (HubSpot, WhatsApp, OpenAI)
│   └── domain/              # Domain Logic (scoring, triage, scheduling)
└── infra/                   # Infrastructure configs
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev

# Start only API server
pnpm dev:api

# Build all packages
pnpm build

# Run linting
pnpm lint

# Run type checking
pnpm typecheck
```

## Packages

| Package | Description |
|---------|-------------|
| `@medicalcor/api` | Fastify webhook gateway |
| `@medicalcor/trigger` | Trigger.dev workflows and jobs |
| `@medicalcor/core` | Logger, errors, utilities, env validation |
| `@medicalcor/types` | Zod schemas for all domains |
| `@medicalcor/domain` | Scoring, triage, scheduling services |
| `@medicalcor/integrations` | HubSpot, WhatsApp, OpenAI clients |

## Environment Setup

Copy `.env.example` to `.env` and configure your credentials.

## Tech Stack

- **Runtime**: Node.js 20+
- **Package Manager**: pnpm 9+
- **Build System**: Turborepo
- **Language**: TypeScript (strict mode)
- **API Framework**: Fastify 5
- **Validation**: Zod
- **Background Jobs**: Trigger.dev
- **Testing**: Vitest + MSW
- **Linting**: ESLint 9 + Prettier

## Testing

```bash
pnpm test              # Run all tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # With coverage report
```

## Documentation

- [Architecture](./docs/ARCHITECTURE.md) - System design with Mermaid diagrams
- [Infrastructure](./infra/README.md) - Docker and Terraform setup
