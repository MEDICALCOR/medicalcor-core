# Configuration Guide

Complete reference for all MedicalCor Core environment variables and configuration options.

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Files](#environment-files)
- [Variable Reference](#variable-reference)
- [Service-Specific Configuration](#service-specific-configuration)
- [Secrets Management](#secrets-management)
- [Configuration Best Practices](#configuration-best-practices)

---

## Quick Start

```bash
# Copy the template
cp .env.example .env

# Edit with your values
nano .env  # or use your preferred editor

# Validate configuration
pnpm build  # Will fail if required vars are missing
```

---

## Environment Files

| File | Purpose | Git Tracked |
|------|---------|-------------|
| `.env.example` | Template with all variables | Yes |
| `.env` | Local development values | No |
| `.env.test` | Test environment values | No |
| `.env.production.template` | Production template | Yes |

---

## Variable Reference

### Application Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | Yes | `development` | Environment: `development`, `staging`, `production` |
| `LOG_LEVEL` | No | `info` | Log level: `debug`, `info`, `warn`, `error` |
| `PORT` | No | `3000` | API server port |
| `HOST` | No | `0.0.0.0` | API server host |

```bash
NODE_ENV=development
LOG_LEVEL=info
PORT=3000
HOST=0.0.0.0
```

---

### Database (PostgreSQL)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DATABASE_URL` | Yes | - | PostgreSQL connection string |
| `POSTGRES_USER` | Docker | - | PostgreSQL username (docker-compose) |
| `POSTGRES_PASSWORD` | Docker | - | PostgreSQL password (docker-compose) |
| `POSTGRES_DB` | Docker | - | PostgreSQL database name (docker-compose) |

```bash
# Connection string format
DATABASE_URL=postgresql://user:password@host:5432/database

# Local development with Docker
DATABASE_URL=postgresql://medicalcor:localdev@localhost:5432/medicalcor
POSTGRES_USER=medicalcor
POSTGRES_PASSWORD=localdev
POSTGRES_DB=medicalcor

# Production (Cloud SQL)
DATABASE_URL=postgresql://user:password@/medicalcor?host=/cloudsql/project:region:instance
```

**Connection String Options**:

```bash
# With SSL
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require

# With connection pool
DATABASE_URL=postgresql://user:pass@host:5432/db?pool_max=20&pool_min=5
```

---

### Redis

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REDIS_URL` | No | - | Redis connection string |

```bash
# Local development
REDIS_URL=redis://localhost:6379

# With authentication
REDIS_URL=redis://:password@host:6379

# Production (Memorystore)
REDIS_URL=redis://10.0.0.1:6379
```

---

### HubSpot CRM

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `HUBSPOT_ACCESS_TOKEN` | Yes* | - | HubSpot Private App token |
| `HUBSPOT_PORTAL_ID` | No | - | HubSpot portal ID |

```bash
# Private App token (starts with pat-...)
HUBSPOT_ACCESS_TOKEN=pat-na1-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
HUBSPOT_PORTAL_ID=12345678
```

**Getting HubSpot Token**:
1. Go to HubSpot Settings > Integrations > Private Apps
2. Create new private app
3. Grant scopes: `crm.objects.contacts.read`, `crm.objects.contacts.write`, `timeline`
4. Copy the access token

---

### WhatsApp (360dialog)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WHATSAPP_API_KEY` | Yes* | - | 360dialog API key |
| `WHATSAPP_VERIFY_TOKEN` | Yes* | - | Webhook verification token |
| `WHATSAPP_PHONE_NUMBER_ID` | Yes* | - | WhatsApp phone number ID |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | No | - | Business account ID |
| `WHATSAPP_WEBHOOK_SECRET` | Yes* | - | Webhook signature secret |

```bash
WHATSAPP_API_KEY=your-360dialog-api-key
WHATSAPP_VERIFY_TOKEN=your-custom-verify-token
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_BUSINESS_ACCOUNT_ID=123456789012345
WHATSAPP_WEBHOOK_SECRET=your-webhook-secret
```

**Setting Up 360dialog**:
1. Create account at [360dialog.com](https://www.360dialog.com/)
2. Register WhatsApp Business phone number
3. Get API key from dashboard
4. Configure webhook URL: `https://your-api.com/webhooks/whatsapp`
5. Set verification token (any string you choose)
6. Get webhook secret for signature verification

---

### Voice (Twilio)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | Yes* | - | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Yes* | - | Twilio auth token |
| `TWILIO_PHONE_NUMBER` | Yes* | - | Twilio phone number (E.164) |
| `TWILIO_WEBHOOK_URL` | No | - | Webhook URL for signature validation |

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+15551234567
TWILIO_WEBHOOK_URL=https://your-api.com/webhooks/voice
```

---

### Vapi (Voice AI)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VAPI_API_KEY` | Yes* | - | Vapi API key |
| `VAPI_WEBHOOK_SECRET` | Yes* | - | Webhook signature secret |

```bash
VAPI_API_KEY=your-vapi-api-key
VAPI_WEBHOOK_SECRET=your-webhook-secret
```

---

### OpenAI

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes* | - | OpenAI API key |
| `OPENAI_MODEL` | No | `gpt-4o` | Model to use for scoring |

```bash
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_MODEL=gpt-4o
```

**Supported Models**:
- `gpt-4o` (recommended)
- `gpt-4-turbo`
- `gpt-3.5-turbo` (faster, less accurate)

---

### Stripe

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STRIPE_SECRET_KEY` | Yes* | - | Stripe secret key |
| `STRIPE_WEBHOOK_SECRET` | Yes* | - | Webhook signing secret |
| `STRIPE_PUBLISHABLE_KEY` | No | - | Publishable key (frontend) |

```bash
# Test mode
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx

# Live mode
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

**Setting Up Stripe Webhooks**:
1. Go to Stripe Dashboard > Developers > Webhooks
2. Add endpoint: `https://your-api.com/webhooks/stripe`
3. Select events: `payment_intent.succeeded`, `invoice.paid`, etc.
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

---

### Trigger.dev

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TRIGGER_API_KEY` | Yes* | - | Trigger.dev API key |
| `TRIGGER_SECRET_KEY` | Yes* | - | Secret key for verification |
| `TRIGGER_API_URL` | No | - | Custom API URL (self-hosted) |

```bash
TRIGGER_API_KEY=tr_dev_xxxxxxxxxxxxxxxx
TRIGGER_SECRET_KEY=tr_sk_xxxxxxxxxxxxxxxx
```

---

### Authentication (NextAuth.js)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NEXTAUTH_SECRET` | Yes | - | JWT signing secret |
| `NEXTAUTH_URL` | Yes | - | Application URL |

```bash
# Generate secret: openssl rand -base64 32
NEXTAUTH_SECRET=your-random-32-character-secret
NEXTAUTH_URL=http://localhost:3001
```

### User Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_ADMIN_EMAIL` | Yes | Admin email address |
| `AUTH_ADMIN_PASSWORD_HASH` | Yes | Bcrypt hash of admin password |
| `AUTH_ADMIN_NAME` | No | Admin display name |
| `AUTH_USER_N_EMAIL` | No | Additional user email |
| `AUTH_USER_N_PASSWORD_HASH` | No | Additional user password hash |
| `AUTH_USER_N_NAME` | No | Additional user name |
| `AUTH_USER_N_ROLE` | No | User role: `admin`, `doctor`, `receptionist` |
| `AUTH_USER_N_CLINIC_ID` | No | Associated clinic ID |

```bash
# Generate password hash: npx bcryptjs hash "your-password" 12
AUTH_ADMIN_EMAIL=admin@clinic.com
AUTH_ADMIN_PASSWORD_HASH=$2a$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AUTH_ADMIN_NAME=Administrator

# Additional users (replace N with 1, 2, 3, etc.)
AUTH_USER_1_EMAIL=doctor@clinic.com
AUTH_USER_1_PASSWORD_HASH=$2a$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AUTH_USER_1_NAME=Dr. Smith
AUTH_USER_1_ROLE=doctor
AUTH_USER_1_CLINIC_ID=clinic_001
```

---

### API Authentication

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_SECRET_KEY` | Yes* | - | API key for workflow endpoints |

```bash
# Generate: openssl rand -base64 32
API_SECRET_KEY=your-random-api-secret-key
```

---

### CORS Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CORS_ORIGIN` | No | - | Allowed origins (comma-separated) |

```bash
# Development
CORS_ORIGIN=http://localhost:3001

# Production
CORS_ORIGIN=https://app.medicalcor.com,https://admin.medicalcor.com
```

---

### Observability

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OTEL_ENABLED` | No | `false` | Enable OpenTelemetry |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | No | - | OTLP exporter endpoint |
| `OTEL_SERVICE_NAME` | No | `medicalcor-api` | Service name for traces |
| `SENTRY_DSN` | No | - | Sentry error tracking DSN |

```bash
OTEL_ENABLED=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318
OTEL_SERVICE_NAME=medicalcor-api
SENTRY_DSN=https://xxx@sentry.io/xxx
```

---

### Docker Development

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GF_ADMIN_USER` | Monitoring | `admin` | Grafana admin username |
| `GF_ADMIN_PASSWORD` | Monitoring | - | Grafana admin password |

```bash
GF_ADMIN_USER=admin
GF_ADMIN_PASSWORD=your-grafana-password
```

---

## Service-Specific Configuration

### Required Variables by Environment

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| `DATABASE_URL` | Required | Required | Required |
| `REDIS_URL` | Optional | Required | Required |
| `HUBSPOT_ACCESS_TOKEN` | Optional | Required | Required |
| `WHATSAPP_*` | Optional | Required | Required |
| `OPENAI_API_KEY` | Optional | Required | Required |
| `STRIPE_*` | Optional | Required | Required |
| `NEXTAUTH_SECRET` | Required | Required | Required |
| `API_SECRET_KEY` | Optional | Required | Required |

### Minimum Development Configuration

```bash
# Minimum for local development
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://medicalcor:localdev@localhost:5432/medicalcor
POSTGRES_USER=medicalcor
POSTGRES_PASSWORD=localdev
POSTGRES_DB=medicalcor
NEXTAUTH_SECRET=dev-secret-change-in-production
NEXTAUTH_URL=http://localhost:3001
```

---

## Secrets Management

### Local Development

Store secrets in `.env` file (never commit to git):

```bash
# .gitignore
.env
.env.local
.env.*.local
```

### Production (GCP)

Use Secret Manager:

```bash
# Create secret
gcloud secrets create HUBSPOT_ACCESS_TOKEN --replication-policy="automatic"

# Add version
echo -n "pat-xxx" | gcloud secrets versions add HUBSPOT_ACCESS_TOKEN --data-file=-

# Access in Cloud Run (automatic via service account)
# Secrets are mounted as environment variables
```

### CI/CD (GitHub Actions)

Store in GitHub Secrets:

```yaml
# .github/workflows/deploy.yml
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
  HUBSPOT_ACCESS_TOKEN: ${{ secrets.HUBSPOT_ACCESS_TOKEN }}
```

---

## Configuration Best Practices

### Do

- Use `.env.example` as documentation
- Validate all required variables at startup
- Use different values for each environment
- Rotate secrets regularly
- Use strong, random secrets (32+ characters)

### Don't

- Commit `.env` files to git
- Use default/weak passwords in production
- Share secrets via insecure channels
- Use the same secrets across environments
- Store secrets in code or Docker images

### Validation Example

```typescript
// packages/core/src/env/validate.ts
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  // ... more validations
});

export function validateEnv() {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    console.error('Environment validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}
```

---

## Troubleshooting

### Variable Not Loading

```bash
# Check if .env exists
ls -la .env

# Check variable value
echo $DATABASE_URL

# Verify in Node.js
node -e "console.log(process.env.DATABASE_URL)"
```

### Connection String Issues

```bash
# Test PostgreSQL connection
psql $DATABASE_URL -c "SELECT 1"

# Test Redis connection
redis-cli -u $REDIS_URL PING
```

### Secret Not Available

```bash
# Check Secret Manager (GCP)
gcloud secrets versions access latest --secret=HUBSPOT_ACCESS_TOKEN

# Check GitHub Secrets (in Actions log)
echo "Token length: ${#HUBSPOT_ACCESS_TOKEN}"
```
