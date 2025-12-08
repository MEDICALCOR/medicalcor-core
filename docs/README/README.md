<p align="center">
  <img src="../../assets/logo.svg" alt="MedicalCor Logo" width="200" height="200" />
</p>

<h1 align="center">MedicalCor Core</h1>

<p align="center">
  <strong>Enterprise-Grade AI-Powered Medical CRM Platform</strong>
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-documentation">Documentation</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen?style=flat-square&logo=node.js" alt="Node.js Version" />
  <img src="https://img.shields.io/badge/pnpm-%3E%3D9.0.0-orange?style=flat-square&logo=pnpm" alt="pnpm Version" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-blue?style=flat-square&logo=typescript" alt="TypeScript Version" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Fastify-5.x-black?style=flat-square&logo=fastify" alt="Fastify" />
  <img src="https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=next.js" alt="Next.js" />
  <img src="https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis" alt="Redis" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/GDPR-Compliant-success?style=flat-square" alt="GDPR Compliant" />
  <img src="https://img.shields.io/badge/HIPAA-Ready-success?style=flat-square" alt="HIPAA Ready" />
  <img src="https://img.shields.io/badge/SOC2-Aligned-success?style=flat-square" alt="SOC2 Aligned" />
</p>

---

## Overview

**MedicalCor Core** is a comprehensive, AI-powered Customer Relationship Management (CRM) platform specifically designed for dental clinics and medical practices. It combines intelligent lead scoring, omnichannel communication, and durable workflow processing to streamline patient acquisition and management.

### Why MedicalCor?

| Challenge                                   | Our Solution                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Manual lead qualification wastes staff time | AI-powered lead scoring with GPT-4o automatically classifies leads as HOT/WARM/COLD |
| Missed follow-ups hurt conversion rates     | Durable workflows with Trigger.dev ensure no lead falls through the cracks          |
| Fragmented communication across channels    | Unified inbox for WhatsApp, Voice, Email, and Web leads                             |
| Compliance complexity (GDPR, HIPAA)         | Built-in consent management with audit trails                                       |
| Integration headaches                       | Pre-built integrations with HubSpot, Stripe, Twilio, and more                       |

---

## Features

### Core Capabilities

#### AI-Powered Lead Intelligence

- **Intelligent Scoring**: GPT-4o analyzes conversations to score leads (1-5) with confidence levels
- **Automatic Classification**: HOT, WARM, COLD, or UNQUALIFIED based on intent signals
- **Procedure Detection**: Identifies interest in implants, veneers, whitening, All-on-X, etc.
- **Budget Signal Detection**: Recognizes financial readiness indicators
- **Rule-Based Fallback**: Continues working even if AI is unavailable

#### Omnichannel Communication

- **WhatsApp Business API** (via 360dialog)
- **Voice Calls** (Twilio + Vapi AI)
- **Email Integration**
- **Web Chat Widget**
- **SMS Notifications**

#### Workflow Automation

- **Durable Workflows**: Trigger.dev ensures reliability with automatic retries
- **Appointment Reminders**: Automated 24h and 2h notifications
- **Recall Management**: Never miss a patient follow-up
- **Lead Nurturing**: Automated sequences based on lead score
- **Consent Renewal**: GDPR-compliant consent lifecycle management

#### Enterprise Security

- **Webhook Signature Verification**: HMAC-SHA256 for all incoming webhooks
- **Rate Limiting**: Redis-backed, configurable per endpoint
- **PII Protection**: Automatic redaction in logs
- **Event Sourcing**: Complete audit trail for compliance
- **Role-Based Access Control**: Admin, Doctor, Receptionist roles

### Technical Highlights

```
Performance         Security            Compliance
─────────────────   ─────────────────   ─────────────────
• <100ms webhook    • Signature         • GDPR consent
  acknowledgment      verification        management
• Auto-scaling      • Rate limiting     • Audit logging
  (0-10 instances)  • Input validation  • PII redaction
• Redis caching     • CORS protection   • Data retention
• Event streaming   • Helmet headers    • Right to erasure
```

---

## Quick Start

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** & Docker Compose
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/casagest/medicalcor-core.git
cd medicalcor-core

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env

# Start infrastructure (PostgreSQL + Redis)
docker compose up -d

# Build all packages
pnpm build

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Verify Installation

```bash
# Check API health
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":"..."}
```

For detailed setup instructions, see [GETTING_STARTED.md](./GETTING_STARTED.md).

---

## Documentation

### Essential Guides

| Document                                | Description                                      |
| --------------------------------------- | ------------------------------------------------ |
| [Getting Started](./GETTING_STARTED.md) | Complete setup guide with prerequisites          |
| [Architecture](./ARCHITECTURE.md)       | System design, data flow, and component overview |
| [API Reference](./API_REFERENCE.md)     | Complete endpoint documentation                  |
| [Configuration](./CONFIGURATION.md)     | Environment variables reference                  |

### Development

| Document                                | Description                                |
| --------------------------------------- | ------------------------------------------ |
| [Development Guide](./DEVELOPMENT.md)   | Contributing guidelines and code standards |
| [Testing Guide](./TESTING.md)           | Test setup, patterns, and coverage         |
| [Troubleshooting](./TROUBLESHOOTING.md) | Common issues and solutions                |

### Operations

| Document                      | Description                              |
| ----------------------------- | ---------------------------------------- |
| [Deployment](./DEPLOYMENT.md) | Production deployment instructions       |
| [Security](./SECURITY.md)     | Security architecture and best practices |
| [Monitoring](./MONITORING.md) | Observability and alerting setup         |
| [Workflows](./WORKFLOWS.md)   | Trigger.dev workflows and scheduled jobs |

### Reference

| Document                    | Description                        |
| --------------------------- | ---------------------------------- |
| [Changelog](./CHANGELOG.md) | Version history and release notes  |
| [FAQ](./FAQ.md)             | Frequently asked questions         |
| [Glossary](./GLOSSARY.md)   | Domain terminology and definitions |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          External Services                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ WhatsApp │  │  Twilio  │  │  Stripe  │  │  HubSpot │  │  OpenAI  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘  │
└───────┼─────────────┼─────────────┼─────────────┼─────────────┼────────┘
        │             │             │             │             │
        └─────────────┴──────┬──────┴─────────────┴─────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        apps/api (Fastify Gateway)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │  Webhooks   │  │ Rate Limit  │  │  Signature  │  │    Zod      │    │
│  │  Routes     │  │   (Redis)   │  │ Verification│  │ Validation  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     apps/trigger (Durable Workflows)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │   Tasks     │  │  Workflows  │  │  Cron Jobs  │  │   Retries   │    │
│  │  Handlers   │  │  (Scoring)  │  │ (Reminders) │  │  (Backoff)  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Shared Packages                                  │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐            │
│  │  @types   │  │   @core   │  │  @domain  │  │@integrations│           │
│  │ (Schemas) │  │ (Logging) │  │ (Scoring) │  │ (HubSpot) │            │
│  └───────────┘  └───────────┘  └───────────┘  └───────────┘            │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           Infrastructure                                 │
│  ┌───────────────────────────────┐  ┌───────────────────────────────┐  │
│  │         PostgreSQL            │  │            Redis               │  │
│  │  • Event Store                │  │  • Rate Limiting               │  │
│  │  • Consent Records            │  │  • Session Cache               │  │
│  │  • Appointments               │  │  • Pub/Sub                     │  │
│  └───────────────────────────────┘  └───────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

For detailed architecture documentation, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Project Structure

```
medicalcor-core/
├── apps/
│   ├── api/                    # Fastify webhook gateway (port 3000)
│   │   ├── src/
│   │   │   ├── routes/         # Webhook handlers
│   │   │   ├── middleware/     # Auth, rate limiting
│   │   │   └── plugins/        # Fastify plugins
│   │   └── Dockerfile
│   ├── trigger/                # Trigger.dev durable workflows
│   │   ├── src/
│   │   │   ├── tasks/          # Event handlers
│   │   │   ├── workflows/      # Multi-step workflows
│   │   │   └── jobs/           # Scheduled cron jobs
│   │   └── trigger.config.ts
│   └── web/                    # Next.js 15 admin dashboard (port 3001)
│       ├── app/                # App router pages
│       ├── components/         # React components
│       └── lib/                # Utilities
├── packages/
│   ├── core/                   # Shared utilities
│   │   ├── src/
│   │   │   ├── logger/         # Pino structured logging
│   │   │   ├── errors/         # Domain error classes
│   │   │   ├── auth/           # Authentication service
│   │   │   └── observability/  # OpenTelemetry instrumentation
│   ├── types/                  # Zod schemas (single source of truth)
│   │   └── src/schemas/        # All domain schemas
│   ├── domain/                 # Business logic
│   │   ├── src/
│   │   │   ├── scoring/        # AI lead scoring
│   │   │   ├── triage/         # Lead routing
│   │   │   ├── scheduling/     # Appointment management
│   │   │   └── consent/        # GDPR consent tracking
│   └── integrations/           # External service clients
│       └── src/
│           ├── hubspot/        # CRM sync
│           ├── whatsapp/       # 360dialog client
│           ├── openai/         # GPT-4o integration
│           └── stripe/         # Payment processing
├── infra/                      # Infrastructure as Code
│   ├── docker-compose.yml      # Local development
│   ├── terraform/              # GCP deployment
│   └── init-db/                # Database migrations
├── docs/                       # Documentation
│   └── README/                 # This folder
└── .github/
    └── workflows/              # CI/CD pipelines
```

---

## Tech Stack

### Runtime & Build

| Technology | Version | Purpose               |
| ---------- | ------- | --------------------- |
| Node.js    | 20+     | JavaScript runtime    |
| pnpm       | 9+      | Package manager       |
| Turborepo  | 2.3     | Monorepo build system |
| TypeScript | 5.6     | Type safety           |

### Backend

| Technology  | Version | Purpose                        |
| ----------- | ------- | ------------------------------ |
| Fastify     | 5.1     | High-performance API framework |
| Trigger.dev | 3.1     | Durable workflow orchestration |
| Zod         | 3.23    | Runtime validation             |
| Pino        | 9.x     | Structured logging             |

### Frontend

| Technology   | Version | Purpose               |
| ------------ | ------- | --------------------- |
| Next.js      | 15.5    | React framework       |
| React        | 19      | UI library            |
| Tailwind CSS | 3.x     | Styling               |
| Radix UI     | Latest  | Accessible components |

### Database & Cache

| Technology | Version | Purpose                 |
| ---------- | ------- | ----------------------- |
| PostgreSQL | 15      | Primary database        |
| Redis      | 7       | Caching & rate limiting |

### Integrations

| Service   | Purpose               |
| --------- | --------------------- |
| HubSpot   | CRM data sync         |
| 360dialog | WhatsApp Business API |
| Twilio    | Voice calls & SMS     |
| Vapi      | Voice AI              |
| OpenAI    | Lead scoring AI       |
| Stripe    | Payment processing    |

### DevOps

| Technology     | Purpose                |
| -------------- | ---------------------- |
| Docker         | Containerization       |
| GitHub Actions | CI/CD                  |
| Terraform      | Infrastructure as Code |
| OpenTelemetry  | Distributed tracing    |
| Prometheus     | Metrics collection     |
| Grafana        | Dashboards             |

---

## Contributing

We welcome contributions! Please see our [Development Guide](./DEVELOPMENT.md) for:

- Code style guidelines
- Pull request process
- Testing requirements
- Commit conventions

### Quick Contribution Guide

```bash
# Fork and clone
git clone https://github.com/YOUR_USERNAME/medicalcor-core.git

# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and test
pnpm test
pnpm lint
pnpm typecheck

# Commit with conventional commits
git commit -m "feat: add awesome feature"

# Push and create PR
git push origin feature/your-feature-name
```

---

## Support

- **Documentation**: [docs/README/](./README.md)
- **Issues**: [GitHub Issues](https://github.com/casagest/medicalcor-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/casagest/medicalcor-core/discussions)

---

## License

This project is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

---

<p align="center">
  <sub>Built with care by the MedicalCor Team</sub>
</p>
