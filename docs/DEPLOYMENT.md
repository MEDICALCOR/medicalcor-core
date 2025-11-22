# MedicalCor Deployment Guide

This document covers the deployment process for the MedicalCor platform, including the API server and Trigger.dev background tasks.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Environment Configuration](#environment-configuration)
3. [Local Development](#local-development)
4. [CI/CD Pipeline](#cicd-pipeline)
5. [Trigger.dev Deployment](#triggerdev-deployment)
6. [API Server Deployment](#api-server-deployment)
7. [Monitoring & Observability](#monitoring--observability)
8. [Rollback Procedures](#rollback-procedures)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** (for containerized deployments)
- **Trigger.dev CLI** (for task deployment)

### Required Accounts/Services

- **Trigger.dev** - Background task orchestration
- **HubSpot** - CRM integration
- **360dialog** - WhatsApp Business API
- **OpenAI** - AI-powered lead scoring
- **Stripe** - Payment processing
- **PostgreSQL** - Event store database
- **Redis** - Caching (optional)

---

## Environment Configuration

### Required Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Trigger.dev
TRIGGER_ACCESS_TOKEN=tr_pat_xxxxx
TRIGGER_SECRET_KEY=tr_sk_xxxxx

# HubSpot CRM
HUBSPOT_ACCESS_TOKEN=pat-xxxxx

# WhatsApp (360dialog)
WHATSAPP_API_KEY=xxxxx
WHATSAPP_PHONE_NUMBER_ID=123456789
WHATSAPP_WEBHOOK_SECRET=xxxxx
WHATSAPP_VERIFY_TOKEN=xxxxx

# OpenAI
OPENAI_API_KEY=sk-xxxxx

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# Database
DATABASE_URL=postgresql://user:pass@host:5432/medicalcor

# Redis (optional)
REDIS_URL=redis://localhost:6379

# OpenTelemetry (optional)
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=medicalcor-api

# Security
CORS_ORIGIN=https://yourdomain.com
```

### Secrets Management

For production, use a secrets manager:

- **GitHub Secrets** - For CI/CD pipelines
- **AWS Secrets Manager** / **HashiCorp Vault** - For runtime secrets
- **Doppler** / **1Password Secrets** - For team secret sharing

---

## Local Development

### Setup

```bash
# Clone repository
git clone https://github.com/casagest/medicalcor-core.git
cd medicalcor-core

# Install dependencies
pnpm install

# Copy environment file
cp .env.example .env
# Edit .env with your credentials

# Build all packages
pnpm build

# Run tests
pnpm test

# Start API server in development mode
pnpm dev:api
```

### Running Trigger.dev Locally

```bash
# Start Trigger.dev dev server
cd apps/trigger
pnpm dev

# This will connect to Trigger.dev cloud and allow local task testing
```

---

## CI/CD Pipeline

### GitHub Actions Workflows

The project includes several GitHub Actions workflows:

#### 1. CI Pipeline (`.github/workflows/ci.yml`)

Runs on every PR and push to main:

- **Lint** - ESLint checks
- **Format** - Prettier checks
- **TypeCheck** - TypeScript compilation
- **Test** - Unit and integration tests
- **Build** - Full monorepo build
- **Security** - Dependency vulnerability scan
- **Docker** - Container build (main branch only)

#### 2. Trigger.dev Deploy (`.github/workflows/trigger-deploy.yml`)

Deploys Trigger.dev tasks on push to main:

- Builds all dependent packages
- Deploys tasks to Trigger.dev cloud

#### 3. API Deploy (`.github/workflows/deploy.yml`)

Deploys the API server:

- Builds Docker image
- Pushes to container registry
- Deploys to hosting platform

### Required GitHub Secrets

Configure these secrets in your GitHub repository:

```
TRIGGER_ACCESS_TOKEN     - Trigger.dev Personal Access Token
CODECOV_TOKEN            - CodeCov upload token (optional)
DOCKER_USERNAME          - Container registry username
DOCKER_PASSWORD          - Container registry password
```

---

## Trigger.dev Deployment

### Manual Deployment

```bash
# Build packages
pnpm build

# Navigate to trigger app
cd apps/trigger

# Deploy to Trigger.dev cloud
pnpm deploy
```

### Deployment via CI/CD

Push to main branch triggers automatic deployment when:

- Files in `apps/trigger/**` change
- Files in `packages/**` change

### Trigger.dev Configuration

The `trigger.config.ts` file configures:

```typescript
export default defineConfig({
  project: 'medicalcor-core',
  logLevel: 'info',
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
  dirs: ['./src/tasks', './src/workflows', './src/jobs'],
});
```

### Registered Tasks

| Task ID                     | Description                   | Retry Strategy |
| --------------------------- | ----------------------------- | -------------- |
| `whatsapp-message-handler`  | Process WhatsApp messages     | 3 attempts     |
| `payment-succeeded-handler` | Handle successful payments    | 3 attempts     |
| `voice-call-handler`        | Process voice calls           | 2 attempts     |
| `lead-scoring-workflow`     | AI-powered lead scoring       | 5 attempts     |
| `patient-journey-workflow`  | Patient journey orchestration | 5 attempts     |
| `booking-agent-workflow`    | Appointment booking           | 3 attempts     |

### Cron Jobs

| Schedule    | Task                  | Description                  |
| ----------- | --------------------- | ---------------------------- |
| `0 9 * * *` | Daily Recall Check    | Find patients due for recall |
| `0 * * * *` | Appointment Reminders | Send 24h/2h reminders        |
| `0 2 * * *` | Lead Scoring Refresh  | Re-score stale leads         |
| `0 8 * * 1` | Weekly Analytics      | Generate weekly report       |
| `0 3 * * 0` | Stale Lead Cleanup    | Archive inactive leads       |
| `0 4 * * *` | GDPR Consent Audit    | Check expiring consents      |

---

## API Server Deployment

### Docker Deployment

```bash
# Build Docker image
docker build -t medicalcor-api:latest -f apps/api/Dockerfile .

# Run container
docker run -d \
  --name medicalcor-api \
  -p 3000:3000 \
  --env-file .env \
  medicalcor-api:latest
```

### Docker Compose (Full Stack)

```yaml
version: '3.8'
services:
  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/medicalcor
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=medicalcor
      - POSTGRES_PASSWORD=password

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Cloud Platform Deployments

#### Fly.io

```bash
# Initialize Fly app
fly launch --name medicalcor-api

# Set secrets
fly secrets set HUBSPOT_ACCESS_TOKEN=xxx OPENAI_API_KEY=xxx ...

# Deploy
fly deploy
```

#### Railway

```bash
# Link to Railway
railway link

# Set environment variables
railway variables set KEY=VALUE

# Deploy
railway up
```

#### Render

1. Connect GitHub repository
2. Set build command: `pnpm install && pnpm build`
3. Set start command: `node apps/api/dist/app.js`
4. Add environment variables

---

## Monitoring & Observability

### OpenTelemetry Tracing

The platform includes built-in OpenTelemetry support:

```typescript
import { initTelemetry, withSpan, getTracer } from '@medicalcor/core';

// Initialize at startup
initTelemetry({
  serviceName: 'medicalcor-api',
  environment: 'production',
  otlpEndpoint: 'http://tempo:4318',
});

// Wrap functions with tracing
const tracer = getTracer('api');
await withSpan(tracer, 'handleWebhook', async (span) => {
  span.setAttribute('webhook.type', 'whatsapp');
  // ... handler logic
});
```

### Recommended Observability Stack

- **Grafana** - Dashboards and visualization
- **Tempo** - Distributed tracing
- **Loki** - Log aggregation
- **Prometheus** - Metrics collection

### Health Checks

The API exposes health check endpoints:

```
GET /health          - Basic health check
GET /health/ready    - Readiness probe (DB + Redis)
GET /health/live     - Liveness probe
```

### Alerting Recommendations

Set up alerts for:

- API error rate > 1%
- Response time P95 > 500ms
- Trigger.dev task failure rate > 5%
- Database connection errors
- External service failures (HubSpot, WhatsApp, OpenAI)

---

## Rollback Procedures

### Trigger.dev Rollback

Trigger.dev maintains version history:

1. Go to Trigger.dev dashboard
2. Navigate to your project
3. Select "Deployments"
4. Click "Rollback" on the desired version

### API Rollback

#### Docker/Container

```bash
# List available images
docker images medicalcor-api

# Rollback to previous version
docker stop medicalcor-api
docker run -d --name medicalcor-api medicalcor-api:previous-tag
```

#### Git-based Rollback

```bash
# Identify the commit to rollback to
git log --oneline

# Revert to specific commit
git revert HEAD~1

# Or reset (use with caution)
git reset --hard <commit-hash>
git push --force-with-lease
```

---

## Troubleshooting

### Common Issues

#### 1. Trigger.dev Tasks Not Running

**Symptoms**: Tasks are queued but not executing

**Solutions**:

- Verify `TRIGGER_ACCESS_TOKEN` is set correctly
- Check Trigger.dev dashboard for error logs
- Ensure tasks are properly exported
- Run `pnpm --filter @medicalcor/trigger build` to rebuild

#### 2. Webhook Signature Verification Failures

**Symptoms**: 401 errors on webhook endpoints

**Solutions**:

- Verify webhook secrets match provider configuration
- Check timestamp tolerance (default: 5 minutes)
- Ensure raw body is preserved for signature verification

#### 3. HubSpot Rate Limits

**Symptoms**: 429 errors from HubSpot

**Solutions**:

- Implement exponential backoff (already built-in)
- Batch API calls where possible
- Consider HubSpot API tier upgrade

#### 4. OpenAI Timeouts

**Symptoms**: Lead scoring timeouts

**Solutions**:

- Fallback to rule-based scoring is automatic
- Check `OPENAI_API_KEY` validity
- Monitor OpenAI status page

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug node apps/api/dist/app.js
```

Enable OpenTelemetry console exporter:

```typescript
initTelemetry({
  serviceName: 'medicalcor-api',
  debug: true, // Prints traces to console
});
```

### Support Channels

- **GitHub Issues**: Bug reports and feature requests
- **Trigger.dev Discord**: Task-related questions
- **Internal Slack**: Team communication

---

## Security Checklist

Before deploying to production:

- [ ] All secrets stored securely (not in code)
- [ ] CORS configured for production domains only
- [ ] Rate limiting enabled on public endpoints
- [ ] Webhook signatures verified
- [ ] PII redaction enabled in logs
- [ ] Database connections use SSL
- [ ] API keys have minimal required permissions
- [ ] Dependency vulnerabilities addressed
- [ ] Error messages don't leak sensitive info
