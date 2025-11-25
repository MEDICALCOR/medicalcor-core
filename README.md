<p align="center">
  <img src="./assets/logo.svg" alt="MedicalCor Logo" width="120" height="120" />
</p>

<h1 align="center">MedicalCor Core</h1>

<p align="center">
  <strong>Enterprise-Grade AI-Powered Medical CRM Platform</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-documentation">Documentation</a> •
  <a href="#-architecture">Architecture</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/GDPR-Compliant-success?style=flat-square" alt="GDPR" />
</p>

---

AI-powered lead management system for dental clinics with omnichannel communication, intelligent lead scoring, and durable workflow processing.

## Features

- **AI-Powered Lead Scoring** - GPT-4o analyzes conversations to score leads (1-5) with automatic HOT/WARM/COLD classification
- **Omnichannel Communication** - WhatsApp, Voice, Email, and Web support via unified inbox
- **Voice AI Integration** - Vapi.ai integration for intelligent voice calls with transcript analysis and lead qualification
- **Vector Search** - OpenAI embeddings for semantic search and intelligent document retrieval
- **Payment Processing** - Stripe integration for revenue tracking and payment analytics
- **Durable Workflows** - Trigger.dev ensures reliable background processing with automatic retries
- **GDPR Compliance** - Built-in consent management with audit trails
- **Event Sourcing** - Complete audit trail for compliance and debugging
- **PWA Support** - Progressive Web App with offline capabilities

## Architecture

```
medicalcor-core/
├── apps/
│   ├── api/                 # Fastify Server (Webhook Gateway)
│   ├── trigger/             # Trigger.dev Workers
│   └── web/                 # Next.js Admin Dashboard (PWA)
├── packages/
│   ├── core/                # Shared Business Logic (logger, errors, utils)
│   ├── types/               # Shared Zod Schemas
│   ├── integrations/        # External Services (HubSpot, WhatsApp, OpenAI, Vapi, Stripe)
│   ├── domain/              # Domain Logic (scoring, triage, scheduling, consent)
│   └── infra/               # Infrastructure utilities (migrations, deployment, env)
└── infra/                   # Infrastructure configs (Docker, CI/CD)
```

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# Copy environment template
cp .env.example .env

# Build all packages
pnpm build

# Start development servers
pnpm dev
```

Verify installation:
```bash
curl http://localhost:3000/health
# {"status":"healthy","timestamp":"..."}
```

## Packages

| Package | Description |
|---------|-------------|
| `@medicalcor/api` | Fastify webhook gateway with rate limiting and CORS |
| `@medicalcor/trigger` | Trigger.dev workflows and background jobs |
| `@medicalcor/web` | Next.js admin dashboard (PWA with offline support) |
| `@medicalcor/core` | Logger, errors, utilities, retry logic, env validation |
| `@medicalcor/types` | Zod schemas for all domains |
| `@medicalcor/domain` | Scoring, triage, scheduling, consent, language services |
| `@medicalcor/integrations` | HubSpot, WhatsApp, OpenAI, Vapi, Stripe, Embeddings |
| `@medicalcor/infra` | Infrastructure utilities, migrations, deployment configs |

## Documentation

### Essential Guides

| Document | Description |
|----------|-------------|
| [Getting Started](./docs/README/GETTING_STARTED.md) | Complete setup guide |
| [Architecture](./docs/README/ARCHITECTURE.md) | System design and data flow |
| [API Reference](./docs/README/API_REFERENCE.md) | Endpoint documentation |
| [Configuration](./docs/README/CONFIGURATION.md) | Environment variables |

### Development

| Document | Description |
|----------|-------------|
| [Development Guide](./docs/README/DEVELOPMENT.md) | Contributing guidelines |
| [Testing Guide](./docs/README/TESTING.md) | Test patterns and coverage |
| [Troubleshooting](./docs/README/TROUBLESHOOTING.md) | Common issues |

### Operations

| Document | Description |
|----------|-------------|
| [Deployment](./docs/README/DEPLOYMENT.md) | Production deployment |
| [Security](./docs/README/SECURITY.md) | Security architecture |
| [Monitoring](./docs/README/MONITORING.md) | Observability setup |

### Reference

| Document | Description |
|----------|-------------|
| [FAQ](./docs/README/FAQ.md) | Frequently asked questions |
| [Glossary](./docs/README/GLOSSARY.md) | Domain terminology |
| [Changelog](./docs/README/CHANGELOG.md) | Version history |

## Tech Stack

- **Runtime**: Node.js 20+
- **Package Manager**: pnpm 9+
- **Build System**: Turborepo
- **Language**: TypeScript 5.6 (strict mode)
- **API Framework**: Fastify 5
- **Web Framework**: Next.js 15 with React 19
- **UI Components**: Radix UI + Tailwind CSS
- **State Management**: React Query (TanStack Query)
- **Authentication**: NextAuth.js v5
- **Validation**: Zod
- **Background Jobs**: Trigger.dev
- **Database**: PostgreSQL 15
- **Cache**: Redis 7
- **AI/ML**: OpenAI GPT-4o, Text Embeddings
- **Voice AI**: Vapi.ai
- **Payments**: Stripe
- **Testing**: Vitest + MSW + Testing Library
- **Observability**: OpenTelemetry

## Commands

```bash
# Development
pnpm dev              # Start all services
pnpm dev:api          # Start API only
pnpm dev:web          # Start web dashboard

# Building
pnpm build            # Build all packages
pnpm clean            # Clean build artifacts

# Testing
pnpm test             # Run all tests
pnpm test:coverage    # With coverage report

# Code Quality
pnpm lint             # Run ESLint
pnpm typecheck        # Run TypeScript checks
```

## Environment Setup

Copy `.env.example` to `.env` and configure your credentials. See [Configuration Guide](./docs/README/CONFIGURATION.md) for details.

## Contributing

We welcome contributions! Please see our [Development Guide](./docs/README/DEVELOPMENT.md) for code standards and PR process.

## License

MIT License - see [LICENSE](./LICENSE) for details.

---

<p align="center">
  <a href="./docs/README/README.md">Full Documentation</a> •
  <a href="https://github.com/casagest/medicalcor-core/issues">Report Bug</a> •
  <a href="https://github.com/casagest/medicalcor-core/discussions">Discussions</a>
</p>
