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
| `@medicalcor/core` | Logger, errors, utilities |
| `@medicalcor/types` | Zod schemas for all domains |

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