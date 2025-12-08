# Monitoring Guide

Comprehensive guide to observability and monitoring in MedicalCor Core.

## Table of Contents

- [Overview](#overview)
- [Logging](#logging)
- [Tracing](#tracing)
- [Metrics](#metrics)
- [Health Checks](#health-checks)
- [Alerting](#alerting)
- [Dashboards](#dashboards)
- [Debugging](#debugging)

---

## Overview

MedicalCor Core implements the three pillars of observability:

```
┌─────────────────────────────────────────────────────────────┐
│                    Observability Stack                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Logging   │  │   Tracing   │  │   Metrics   │         │
│  │   (Pino)    │  │   (OTEL)    │  │ (Prometheus)│         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         ▼                ▼                ▼                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │    Loki     │  │    Tempo    │  │  Prometheus │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
│         └────────────────┴────────────────┘                 │
│                          │                                   │
│                          ▼                                   │
│                   ┌─────────────┐                           │
│                   │   Grafana   │                           │
│                   │ (Dashboards)│                           │
│                   └─────────────┘                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Logging

### Configuration

Logging is handled by Pino with structured JSON output:

```typescript
import { logger } from '@medicalcor/core';

// Basic logging
logger.info('Processing webhook');
logger.warn('Rate limit approaching');
logger.error('External service failed', { error: err });

// With context
logger.info('Lead scored', {
  phone: '+1555...', // Automatically redacted
  score: 5,
  classification: 'HOT',
  correlationId: ctx.correlationId,
});
```

### Log Levels

| Level   | When to Use             | Environment      |
| ------- | ----------------------- | ---------------- |
| `debug` | Detailed debugging info | Development only |
| `info`  | Normal operations       | All              |
| `warn`  | Warning conditions      | All              |
| `error` | Error conditions        | All              |

### Environment Configuration

```bash
# Log level
LOG_LEVEL=info  # debug, info, warn, error

# Format
NODE_ENV=production   # JSON output
NODE_ENV=development  # Pretty printed
```

### PII Redaction

The following fields are automatically redacted in logs:

| Field      | Replacement          |
| ---------- | -------------------- |
| `phone`    | `[REDACTED_PHONE]`   |
| `email`    | `[REDACTED_EMAIL]`   |
| `content`  | `[REDACTED_CONTENT]` |
| `message`  | `[REDACTED_MESSAGE]` |
| `password` | `[REDACTED]`         |
| `token`    | `[REDACTED]`         |
| `apiKey`   | `[REDACTED]`         |

### Child Loggers

Create context-specific loggers:

```typescript
const webhookLogger = logger.child({
  component: 'webhook',
  provider: 'whatsapp',
});

webhookLogger.info('Message received', { messageId: '...' });
// Output includes component and provider automatically
```

### Structured Log Format

```json
{
  "level": "info",
  "time": 1673776000000,
  "pid": 12345,
  "hostname": "api-pod-xxx",
  "correlationId": "uuid-xxx",
  "component": "webhook",
  "msg": "Lead scored",
  "score": 5,
  "classification": "HOT",
  "duration": 234
}
```

---

## Tracing

### OpenTelemetry Setup

MedicalCor uses OpenTelemetry for distributed tracing:

```typescript
// packages/core/src/observability/instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const sdk = new NodeSDK({
  serviceName: process.env.OTEL_SERVICE_NAME || 'medicalcor-api',
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  }),
});
```

### Environment Configuration

```bash
# Enable tracing
OTEL_ENABLED=true

# OTLP exporter endpoint (Tempo, Jaeger, etc.)
OTEL_EXPORTER_OTLP_ENDPOINT=http://tempo:4318

# Service identification
OTEL_SERVICE_NAME=medicalcor-api
OTEL_SERVICE_VERSION=1.0.0
```

### Manual Instrumentation

```typescript
import { getTracer, withSpan } from '@medicalcor/core';

const tracer = getTracer('lead-scoring');

async function scoreLead(context: LeadContext) {
  return withSpan(tracer, 'score_lead', async (span) => {
    span.setAttribute('lead.phone', context.phone);
    span.setAttribute('lead.channel', context.channel);

    const result = await aiScoring(context);

    span.setAttribute('lead.score', result.score);
    span.setAttribute('lead.classification', result.classification);

    return result;
  });
}
```

### Trace Context Propagation

Correlation IDs are propagated through:

- HTTP headers (`X-Correlation-ID`)
- Trigger.dev task metadata
- Log entries

```typescript
// In webhook handler
const correlationId = request.headers['x-correlation-id'] || generateUUID();

// Passed to Trigger.dev
await triggerTask('process-message', {
  payload: { ... },
  metadata: { correlationId },
});

// Available in logs
logger.info('Processing', { correlationId });
```

---

## Metrics

### Prometheus Metrics

Available at `/metrics` endpoint:

```
# Request metrics
http_request_duration_seconds{method="POST",route="/webhooks/whatsapp",status="200"}
http_requests_total{method="POST",route="/webhooks/whatsapp",status="200"}

# Lead scoring metrics
lead_scoring_total{classification="HOT"}
lead_scoring_duration_seconds{model="gpt-4o"}
lead_scoring_fallback_total

# Integration metrics
integration_request_duration_seconds{service="hubspot",operation="createContact"}
integration_errors_total{service="openai",error_type="timeout"}

# Rate limiting metrics
rate_limit_hits_total{route="/webhooks/whatsapp"}
```

### Local Monitoring Stack

```bash
# Start with monitoring profile
docker compose --profile monitoring up -d

# Access Grafana
open http://localhost:3001
# Default credentials: admin / (from .env GF_ADMIN_PASSWORD)

# Access Prometheus
open http://localhost:9090
```

### Custom Metrics

```typescript
import { Counter, Histogram } from 'prom-client';

const leadScoringCounter = new Counter({
  name: 'lead_scoring_total',
  help: 'Total lead scoring operations',
  labelNames: ['classification', 'fallback'],
});

const scoringDuration = new Histogram({
  name: 'lead_scoring_duration_seconds',
  help: 'Lead scoring duration in seconds',
  labelNames: ['model'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
});

// In scoring service
const timer = scoringDuration.startTimer({ model: 'gpt-4o' });
const result = await score(context);
timer();

leadScoringCounter.inc({
  classification: result.classification,
  fallback: result.fallbackUsed ? 'true' : 'false',
});
```

---

## Health Checks

### Available Endpoints

| Endpoint      | Purpose              | Checks              |
| ------------- | -------------------- | ------------------- |
| `GET /health` | Basic health         | Application running |
| `GET /ready`  | Kubernetes readiness | Database, Redis     |
| `GET /live`   | Kubernetes liveness  | Simple ping         |

### Response Format

```json
// GET /health
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z"
}

// GET /ready
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}

// GET /ready (unhealthy)
{
  "status": "not_ready",
  "checks": {
    "database": "ok",
    "redis": "error: connection refused"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Kubernetes Configuration

```yaml
# In deployment.yaml
spec:
  containers:
    - name: api
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

---

## Alerting

### Recommended Alerts

| Alert                | Condition                     | Severity |
| -------------------- | ----------------------------- | -------- |
| High Error Rate      | Error rate > 1% for 5 min     | Critical |
| Slow Response        | P95 latency > 500ms for 5 min | Warning  |
| Service Down         | Health check failing          | Critical |
| Database Issues      | Connection errors             | Critical |
| Rate Limit Exhausted | 100% limit used               | Warning  |
| AI Service Degraded  | Fallback rate > 50%           | Warning  |
| Webhook Backlog      | Queue depth > 1000            | Warning  |

### Prometheus Alert Rules

```yaml
# alerts.yml
groups:
  - name: medicalcor
    rules:
      - alert: HighErrorRate
        expr: |
          sum(rate(http_requests_total{status=~"5.."}[5m]))
          /
          sum(rate(http_requests_total[5m]))
          > 0.01
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: High error rate detected
          description: Error rate is {{ $value | humanizePercentage }}

      - alert: SlowResponses
        expr: |
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)
          ) > 0.5
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: Slow API responses
          description: P95 latency is {{ $value }}s

      - alert: AIServiceDegraded
        expr: |
          sum(rate(lead_scoring_fallback_total[5m]))
          /
          sum(rate(lead_scoring_total[5m]))
          > 0.5
        for: 10m
        labels:
          severity: warning
        annotations:
          summary: AI scoring fallback rate high
          description: {{ $value | humanizePercentage }} of scorings using fallback
```

### Alert Notification

Configure alertmanager for notifications:

- Slack
- PagerDuty
- Email
- SMS (via Twilio)

---

## Dashboards

### Grafana Dashboard Panels

#### Overview Dashboard

| Panel        | Metrics                              | Purpose          |
| ------------ | ------------------------------------ | ---------------- |
| Request Rate | `http_requests_total`                | Traffic volume   |
| Error Rate   | `http_requests_total{status=~"5.."}` | Error percentage |
| P95 Latency  | `http_request_duration_seconds`      | Response time    |
| Active Leads | Custom                               | Lead pipeline    |

#### Lead Scoring Dashboard

| Panel               | Metrics                         | Purpose                 |
| ------------------- | ------------------------------- | ----------------------- |
| Scores Distribution | `lead_scoring_total`            | HOT/WARM/COLD breakdown |
| Scoring Latency     | `lead_scoring_duration_seconds` | AI response time        |
| Fallback Rate       | `lead_scoring_fallback_total`   | AI health indicator     |
| Score Trend         | `lead_scoring_total` over time  | Conversion trends       |

#### Integration Health Dashboard

| Panel             | Metrics                                                   | Purpose               |
| ----------------- | --------------------------------------------------------- | --------------------- |
| HubSpot Latency   | `integration_request_duration_seconds{service="hubspot"}` | CRM health            |
| OpenAI Errors     | `integration_errors_total{service="openai"}`              | AI service health     |
| WhatsApp Delivery | Custom                                                    | Message delivery rate |

### Importing Dashboards

```bash
# Dashboard JSON files in /infra/grafana/dashboards/

# Auto-provisioned when using monitoring profile
docker compose --profile monitoring up -d
```

---

## Debugging

### Enable Debug Logging

```bash
# Start with debug logging
LOG_LEVEL=debug pnpm dev:api

# Or set in .env
LOG_LEVEL=debug
```

### View Trigger.dev Runs

1. Go to [Trigger.dev Dashboard](https://cloud.trigger.dev)
2. Navigate to your project
3. Select "Runs" to see execution history
4. Click a run to see detailed logs and steps

### Trace a Request

```bash
# 1. Get correlation ID from response headers or logs
# X-Correlation-ID: abc-123-def

# 2. Search in Grafana/Loki
{correlationId="abc-123-def"}

# 3. View distributed trace in Tempo
# Search by correlation ID
```

### Database Query Debugging

```bash
# Connect to database
docker compose exec db psql -U medicalcor -d medicalcor

# View recent events
SELECT * FROM domain_events ORDER BY occurred_at DESC LIMIT 10;

# View lead scoring history
SELECT * FROM lead_scoring_history WHERE phone = '+1555...' ORDER BY created_at DESC;
```

### Redis Debugging

```bash
# Connect to Redis
docker compose exec redis redis-cli

# View rate limit keys
KEYS rate_limit:*

# Check specific rate limit
GET rate_limit:/webhooks/whatsapp:192.168.1.1

# View idempotency keys
KEYS idempotency:*
```

---

## Production Monitoring

### Cloud-Specific Setup

#### Google Cloud (Recommended)

```bash
# Cloud Logging (automatic)
# Logs shipped automatically from Cloud Run

# Cloud Trace
OTEL_EXPORTER_OTLP_ENDPOINT=https://cloudtrace.googleapis.com

# Cloud Monitoring
# Metrics scraped automatically
```

#### AWS

```bash
# CloudWatch Logs
# Configure log driver in task definition

# X-Ray
OTEL_EXPORTER_OTLP_ENDPOINT=https://xray.region.amazonaws.com
```

### Log Retention

| Environment        | Retention |
| ------------------ | --------- |
| Development        | 7 days    |
| Staging            | 30 days   |
| Production         | 90 days   |
| Compliance (audit) | 7 years   |

### Data Privacy

Ensure monitoring data doesn't contain:

- Patient health information
- Unredacted PII
- API keys or tokens
- Payment card data

---

## Best Practices

### Do

- Use structured logging with context
- Include correlation IDs in all operations
- Set appropriate log levels by environment
- Create actionable alerts (not noise)
- Use dashboards for situational awareness
- Redact PII in all logs

### Don't

- Log sensitive data (passwords, tokens)
- Create alerts that fire too often
- Ignore warning alerts
- Use console.log in production code
- Store logs indefinitely without policy
