<p align="center">
  <img src="./assets/logo.svg" alt="MedicalCor Logo" width="120" height="120" />
</p>

<h1 align="center">MedicalCor Core</h1>

<p align="center">
  <strong>Enterprise-Grade AI-Powered Medical CRM Platform</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-documentation">Documentation</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/GDPR-Compliant-success?style=flat-square" alt="GDPR" />
  <img src="https://img.shields.io/badge/HIPAA-Ready-success?style=flat-square" alt="HIPAA" />
</p>

---

> **Production Readiness Notice**
>
> This project is under active development. Before deploying to production, please review:
> - [Security Guide](./docs/README/SECURITY.md) - Authentication, webhook security, data protection
> - [Deployment Guide](./docs/README/DEPLOYMENT.md) - Production deployment checklist
> - [Audit Reports](./COMPREHENSIVE_AUDIT_REPORT.md) - Known issues and remediation status
>
> Key requirements before production:
> - Configure all webhook secrets (WhatsApp, Twilio, Stripe, Vapi)
> - Set up proper authentication for web dashboard
> - Enable TLS/SSL for all connections
> - Review and test GDPR consent workflows
> - Configure monitoring and alerting

---

AI-powered lead management system for dental clinics with omnichannel communication, intelligent lead scoring, and durable workflow processing.

## Features

### AI-First Architecture

| Feature | Description |
|---------|-------------|
| **GPT-4o Lead Scoring** | AI-powered lead scoring (1-5) with automatic HOT/WARM/COLD classification, procedure interest detection, and urgency analysis |
| **AI Gateway** | OpenAI & Anthropic compatible function calling with natural language intent detection and multi-step workflow execution |
| **RAG Pipeline** | Retrieval-Augmented Generation with pgvector, hybrid semantic + keyword search, and HubSpot patient context integration |
| **AI Copilot** | Smart response suggestions, patient history summaries, and procedure recommendations for clinic operators |
| **Voice AI Integration** | Vapi-powered voice calls with real-time transcription, lead qualification extraction, and CRM sync |

### Omnichannel Communication

| Channel | Capabilities |
|---------|--------------|
| **WhatsApp Business** | Template messaging, rich media, consent tracking, multi-language support (RO/EN/DE) |
| **Voice (Vapi)** | Outbound calls, transcript analysis, keyword extraction, automated summaries |
| **Web Forms** | Lead capture with UTM tracking, GDPR consent collection |
| **Email** | Integration-ready with HubSpot workflows |

### Enterprise Infrastructure

| Component | Description |
|-----------|-------------|
| **CQRS + Event Sourcing** | Command/Query separation with aggregate roots, projections, and complete audit trails |
| **Circuit Breaker** | Resilient external service calls with automatic fallback and registry management |
| **Durable Workflows** | Trigger.dev-powered background processing with automatic retries and idempotency |
| **Observability** | OpenTelemetry instrumentation, Prometheus metrics, structured logging with correlation IDs |
| **HIPAA-Compliant Logging** | Medical-grade PII redaction with pattern-based detection and explicit field enumeration |

### Security & Compliance

| Feature | Implementation |
|---------|----------------|
| **GDPR Consent Management** | Explicit consent tracking, automatic renewal reminders, audit trails |
| **PII Redaction** | Automatic redaction of 50+ PII fields including Romanian CNP, phone, email, medical history |
| **Authentication** | Session management, password policies, rate limiting, login attempt tracking |
| **Webhook Security** | HMAC signature verification for WhatsApp, Stripe, Vapi webhooks |
| **TLS/SSL** | Redis TLS support, secure database connections |

### Intelligent Automation

| Workflow | Description |
|----------|-------------|
| **Patient Journey** | Automated nurture sequences based on lead score and engagement |
| **Appointment Reminders** | 24h and 2h automated WhatsApp reminders with consent verification |
| **Daily Recall** | Automatic follow-up for patients due for 6-month checkups |
| **Lead Scoring Refresh** | Nightly re-scoring of inactive leads |
| **GDPR Consent Audit** | Daily check for expiring consent with automatic renewal requests |
| **Stale Lead Cleanup** | Weekly archival of leads with 90+ days inactivity |
| **Weekly Analytics** | Automated performance reports with conversion metrics |

### Web Dashboard

| Feature | Description |
|---------|-------------|
| **Real-time Inbox** | Unified view of WhatsApp, voice, and web conversations |
| **AI Copilot Panel** | Context-aware chat, smart suggestions, patient summaries |
| **Visual Workflow Builder** | Drag-and-drop automation with triggers, conditions, and actions |
| **Analytics Dashboard** | Conversion funnels, operator performance, lead source analysis |
| **Push Notifications** | Browser notifications for urgencies, new leads, appointments |
| **Quick Search** | Keyboard-driven command palette (Cmd+K) |
| **Data Export** | CSV and XLSX export for leads, appointments, reports |

## Architecture

```
medicalcor-core/
├── apps/
│   ├── api/                    # Fastify Server (Webhook Gateway)
│   │   ├── routes/             # Health, webhooks, AI, diagnostics
│   │   └── plugins/            # Auth, rate limiting
│   ├── trigger/                # Trigger.dev Workers
│   │   ├── workflows/          # Lead scoring, voice transcription
│   │   ├── tasks/              # WhatsApp, voice, payment handlers
│   │   └── jobs/               # Cron jobs (reminders, GDPR audit)
│   └── web/                    # Next.js Admin Dashboard
│       ├── components/         # AI copilot, analytics, workflows
│       └── lib/                # Hooks, utilities, i18n
├── packages/
│   ├── core/                   # Shared Infrastructure
│   │   ├── ai-gateway/         # Function registry, AI router, caching
│   │   ├── auth/               # Sessions, password reset, rate limiting
│   │   ├── cqrs/               # Commands, queries, aggregates, projections
│   │   ├── observability/      # Metrics, instrumentation, diagnostics
│   │   ├── rag/                # Knowledge base, vector search, embeddings
│   │   └── infrastructure/     # Redis client, backup service
│   ├── domain/                 # Business Logic
│   │   ├── scoring/            # AI + rule-based lead scoring
│   │   ├── triage/             # Priority routing and scheduling
│   │   ├── consent/            # GDPR consent management
│   │   └── language/           # Multi-language detection
│   ├── integrations/           # External Services
│   │   ├── hubspot/            # CRM integration
│   │   ├── whatsapp/           # Meta Business API
│   │   ├── vapi/               # Voice AI
│   │   ├── stripe/             # Payments
│   │   └── openai/             # GPT-4o, embeddings
│   └── types/                  # Shared Zod Schemas
└── infra/                      # Infrastructure configs
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
| `@medicalcor/api` | Fastify webhook gateway with AI routes |
| `@medicalcor/trigger` | Trigger.dev workflows, tasks, and cron jobs |
| `@medicalcor/web` | Next.js admin dashboard with AI copilot |
| `@medicalcor/core` | CQRS, event sourcing, AI gateway, RAG, auth, observability |
| `@medicalcor/types` | Zod schemas for all domains |
| `@medicalcor/domain` | Scoring, triage, consent, language services |
| `@medicalcor/integrations` | HubSpot, WhatsApp, OpenAI, Vapi, Stripe clients |

## Tech Stack

### Runtime & Build
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm 9+
- **Build System**: Turborepo
- **Language**: TypeScript 5.6 (strict mode)

### Backend
- **API Framework**: Fastify 5
- **Background Jobs**: Trigger.dev v3
- **Database**: PostgreSQL 15 + pgvector
- **Cache**: Redis 7 with TLS
- **Validation**: Zod

### Frontend
- **Framework**: Next.js 15
- **Styling**: Tailwind CSS
- **State**: React hooks

### AI & ML
- **LLM**: OpenAI GPT-4o
- **Voice**: Vapi
- **Embeddings**: text-embedding-3-small
- **Vector Search**: pgvector

### Observability
- **Tracing**: OpenTelemetry
- **Metrics**: Prometheus-compatible
- **Logging**: Pino with PII redaction
- **Error Tracking**: Sentry

### Testing
- **Unit/Integration**: Vitest
- **Mocking**: MSW (Mock Service Worker)
- **E2E**: Playwright

## Commands

```bash
# Development
pnpm dev              # Start all services
pnpm dev:api          # Start API only

# Building
pnpm build            # Build all packages
pnpm clean            # Clean build artifacts

# Testing
pnpm test             # Run all tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # With coverage report

# Code Quality
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix linting issues
pnpm format           # Format with Prettier
pnpm typecheck        # Run TypeScript checks
```

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
| [Workflows](./docs/README/WORKFLOWS.md) | Trigger.dev workflows |

### Reference

| Document | Description |
|----------|-------------|
| [FAQ](./docs/README/FAQ.md) | Frequently asked questions |
| [Glossary](./docs/README/GLOSSARY.md) | Domain terminology |
| [Changelog](./docs/README/CHANGELOG.md) | Version history |

## Environment Setup

Copy `.env.example` to `.env` and configure your credentials. See [Configuration Guide](./docs/README/CONFIGURATION.md) for details.

Required integrations:
- **HubSpot** - CRM integration
- **WhatsApp Business API** - Messaging
- **OpenAI** - AI scoring and embeddings
- **Vapi** - Voice AI (optional)
- **Stripe** - Payments (optional)

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
