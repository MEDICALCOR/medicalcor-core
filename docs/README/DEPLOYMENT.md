# Deployment Guide

Complete guide to deploying MedicalCor Core to production environments.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Cloud Deployments](#cloud-deployments)
- [CI/CD Pipeline](#cicd-pipeline)
- [Environment Configuration](#environment-configuration)
- [Trigger.dev Deployment](#triggerdev-deployment)
- [Monitoring Setup](#monitoring-setup)
- [Rollback Procedures](#rollback-procedures)
- [Security Checklist](#security-checklist)

---

## Overview

MedicalCor Core consists of three deployable applications:

| Application | Purpose | Default Port |
|-------------|---------|--------------|
| `apps/api` | Webhook gateway (Fastify) | 3000 |
| `apps/trigger` | Background workflows | Trigger.dev Cloud |
| `apps/web` | Admin dashboard (Next.js) | 3001 |

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Environment                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │   Load Balancer  │      │   CDN (Static)   │            │
│  │   (HTTPS)        │      │   (Next.js)      │            │
│  └────────┬─────────┘      └────────┬─────────┘            │
│           │                         │                       │
│           ▼                         ▼                       │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │   API Service    │      │   Web Service    │            │
│  │   (Cloud Run)    │      │   (Cloud Run)    │            │
│  │   Auto-scaling   │      │   Auto-scaling   │            │
│  └────────┬─────────┘      └──────────────────┘            │
│           │                                                  │
│           ▼                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │             Trigger.dev Cloud                        │   │
│  │        (Durable Workflow Execution)                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────┐      ┌──────────────────┐            │
│  │   PostgreSQL     │      │   Redis          │            │
│  │   (Cloud SQL)    │      │   (Memorystore)  │            │
│  └──────────────────┘      └──────────────────┘            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Required Tools

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20.0.0 | Runtime |
| pnpm | >= 9.0.0 | Package manager |
| Docker | >= 24.0 | Containerization |
| Git | >= 2.40 | Version control |

### Required Accounts

| Service | Purpose | Required |
|---------|---------|----------|
| Trigger.dev | Background jobs | Yes |
| HubSpot | CRM integration | Optional |
| 360dialog | WhatsApp API | Optional |
| OpenAI | AI scoring | Optional |
| Stripe | Payments | Optional |

---

## Local Development

### Quick Start

```bash
# Clone repository
git clone https://github.com/casagest/medicalcor-core.git
cd medicalcor-core

# Install dependencies
pnpm install

# Start infrastructure
docker compose up -d

# Copy environment template
cp .env.example .env

# Build all packages
pnpm build

# Start development servers
pnpm dev
```

### Service URLs

| Service | URL |
|---------|-----|
| API | http://localhost:3000 |
| Web | http://localhost:3001 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

### With Monitoring

```bash
# Start with Prometheus + Grafana
docker compose --profile monitoring up -d

# Access Grafana
open http://localhost:3001
```

### With Webhook Tunnel

```bash
# Start with Cloudflare tunnel
docker compose --profile tunnel up -d

# Get tunnel URL from logs
docker compose logs tunnel
```

---

## Docker Deployment

### Build Docker Image

```bash
# Build API image
docker build -t medicalcor-api:latest -f apps/api/Dockerfile .

# Build Web image
docker build -t medicalcor-web:latest -f apps/web/Dockerfile .
```

### Run Container

```bash
# Run API container
docker run -d \
  --name medicalcor-api \
  -p 3000:3000 \
  --env-file .env.production \
  medicalcor-api:latest

# Run Web container
docker run -d \
  --name medicalcor-web \
  -p 3001:3001 \
  --env-file .env.production \
  medicalcor-web:latest
```

### Docker Compose Production

```yaml
version: '3.8'
services:
  api:
    image: medicalcor-api:latest
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    depends_on:
      - db
      - redis
    healthcheck:
      test: ['CMD', 'curl', '-f', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3

  web:
    image: medicalcor-web:latest
    ports:
      - '3001:3001'
    environment:
      - NODE_ENV=production
      - NEXTAUTH_URL=${NEXTAUTH_URL}

  db:
    image: postgres:15-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./infra/init-db:/docker-entrypoint-initdb.d
    environment:
      - POSTGRES_DB=medicalcor
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

---

## Cloud Deployments

### Google Cloud Platform (Recommended)

#### Prerequisites

```bash
# Install gcloud CLI
brew install google-cloud-sdk  # macOS

# Authenticate
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

#### Deploy to Cloud Run

```bash
# Build and push image
gcloud builds submit --tag gcr.io/PROJECT_ID/medicalcor-api

# Deploy
gcloud run deploy medicalcor-api \
  --image gcr.io/PROJECT_ID/medicalcor-api \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars NODE_ENV=production \
  --set-secrets DATABASE_URL=DATABASE_URL:latest \
  --min-instances 1 \
  --max-instances 10 \
  --memory 1Gi \
  --cpu 2
```

#### Setup Cloud SQL

```bash
# Create instance
gcloud sql instances create medicalcor-db \
  --database-version POSTGRES_15 \
  --tier db-f1-micro \
  --region us-central1

# Create database
gcloud sql databases create medicalcor --instance medicalcor-db
```

#### Setup Memorystore (Redis)

```bash
# Create instance
gcloud redis instances create medicalcor-cache \
  --size 1 \
  --region us-central1 \
  --redis-version redis_7_0
```

### AWS

```bash
# Using AWS Copilot
copilot app init medicalcor
copilot env init --name production
copilot svc init --name api --svc-type "Load Balanced Web Service"
copilot svc deploy --name api --env production
```

### Fly.io

```bash
# Initialize
fly launch --name medicalcor-api

# Set secrets
fly secrets set DATABASE_URL=xxx REDIS_URL=xxx

# Deploy
fly deploy
```

### Railway

```bash
# Link project
railway link

# Set variables
railway variables set DATABASE_URL=xxx

# Deploy
railway up
```

---

## CI/CD Pipeline

### GitHub Actions

The repository includes pre-configured workflows:

#### CI Pipeline (`.github/workflows/ci.yml`)

Runs on every PR and push:
- Lint check (ESLint)
- Type check (TypeScript)
- Unit tests (Vitest)
- E2E tests (Playwright)
- Security audit
- Docker build

#### Deploy Pipeline (`.github/workflows/deploy.yml`)

Runs on push to main:
- Build Docker image
- Push to registry
- Deploy to staging
- Run smoke tests
- Manual approval for production
- Deploy to production

### Required GitHub Secrets

```
# Build & Deploy
DOCKER_USERNAME
DOCKER_PASSWORD
GCP_PROJECT_ID
GCP_SA_KEY

# Application
DATABASE_URL
REDIS_URL
HUBSPOT_ACCESS_TOKEN
WHATSAPP_API_KEY
WHATSAPP_WEBHOOK_SECRET
OPENAI_API_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
TRIGGER_API_KEY
NEXTAUTH_SECRET
API_SECRET_KEY
```

---

## Environment Configuration

### Development vs Production

| Variable | Development | Production |
|----------|-------------|------------|
| `NODE_ENV` | development | production |
| `LOG_LEVEL` | debug | info |
| `CORS_ORIGIN` | * | https://your-domain.com |
| `DATABASE_URL` | Local Docker | Cloud SQL |
| `REDIS_URL` | Local Docker | Memorystore |

### Secrets Management

| Environment | Method |
|-------------|--------|
| Local | `.env` file |
| CI/CD | GitHub Secrets |
| Production | GCP Secret Manager |

### Required Variables

```bash
# Minimum for production
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
NEXTAUTH_SECRET=xxx
API_SECRET_KEY=xxx
CORS_ORIGIN=https://your-domain.com
```

See [Configuration Guide](./CONFIGURATION.md) for complete reference.

---

## Trigger.dev Deployment

### Deploy Tasks

```bash
# Navigate to trigger app
cd apps/trigger

# Deploy to Trigger.dev cloud
pnpm deploy
```

### Configuration

```typescript
// trigger.config.ts
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
});
```

### Cron Jobs

| Schedule | Job | Description |
|----------|-----|-------------|
| `0 9 * * *` | Daily Recall | Find patients due |
| `0 * * * *` | Reminders | Send appointment reminders |
| `0 2 * * *` | Score Refresh | Re-score stale leads |
| `0 8 * * 1` | Weekly Report | Generate analytics |

---

## Monitoring Setup

### Health Checks

```bash
# Basic health
curl https://api.medicalcor.com/health

# Readiness (database + redis)
curl https://api.medicalcor.com/ready

# Liveness
curl https://api.medicalcor.com/live
```

### Kubernetes Probes

```yaml
livenessProbe:
  httpGet:
    path: /live
    port: 3000
  initialDelaySeconds: 10
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /ready
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 5
```

### Alerting Recommendations

| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | > 1% for 5 min | Critical |
| Slow Response | P95 > 500ms | Warning |
| Service Down | Health failing | Critical |
| Rate Limited | 100% used | Warning |

See [Monitoring Guide](./MONITORING.md) for detailed setup.

---

## Rollback Procedures

### Cloud Run

```bash
# List revisions
gcloud run revisions list --service medicalcor-api

# Rollback to previous
gcloud run services update-traffic medicalcor-api \
  --to-revisions PREVIOUS_REVISION=100
```

### Trigger.dev

1. Go to Trigger.dev Dashboard
2. Navigate to Deployments
3. Click "Rollback" on desired version

### Git-based

```bash
# Identify commit
git log --oneline

# Revert
git revert HEAD
git push
```

---

## Security Checklist

Before deploying to production:

- [ ] All secrets in Secret Manager (not in code)
- [ ] CORS configured for production domains only
- [ ] Rate limiting enabled
- [ ] Webhook signatures verified
- [ ] PII redaction enabled in logs
- [ ] Database SSL enabled
- [ ] API keys with minimal permissions
- [ ] Dependency vulnerabilities addressed
- [ ] Error messages sanitized
- [ ] Security headers configured

---

## Troubleshooting

### Common Issues

#### Container Won't Start

```bash
# Check logs
docker logs medicalcor-api

# Common causes:
# - Missing environment variables
# - Database connection failed
# - Port already in use
```

#### Health Check Failing

```bash
# Test locally
curl http://localhost:3000/health

# Check dependencies
curl http://localhost:3000/ready
```

#### Trigger.dev Tasks Not Running

1. Verify `TRIGGER_API_KEY` is set
2. Check Trigger.dev dashboard for errors
3. Ensure tasks are exported correctly

See [Troubleshooting Guide](./TROUBLESHOOTING.md) for more solutions.

---

## Further Reading

- [Architecture](./ARCHITECTURE.md) - System design
- [Security](./SECURITY.md) - Security best practices
- [Monitoring](./MONITORING.md) - Observability setup
- [Configuration](./CONFIGURATION.md) - Environment variables
