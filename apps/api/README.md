# @medicalcor/api

Fastify-based webhook gateway for MedicalCor.

## Overview

This service acts as the ingestion layer for external webhooks:
- WhatsApp messages (via 360dialog)
- Voice calls (via Twilio)

All webhooks are validated using Zod schemas and forwarded to Trigger.dev for durable processing.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/ready` | Readiness probe (k8s) |
| GET | `/live` | Liveness probe (k8s) |
| GET | `/webhooks/whatsapp` | WhatsApp webhook verification |
| POST | `/webhooks/whatsapp` | WhatsApp message receiver |
| POST | `/webhooks/voice` | Twilio voice webhook |
| POST | `/webhooks/voice/status` | Twilio call status callback |

## Development

```bash
# From monorepo root
pnpm dev:api

# Or from this directory
pnpm dev
```

## Environment Variables

See `.env.example` in the root directory.

## Docker

```bash
docker build -t medicalcor-api -f apps/api/Dockerfile .
docker run -p 3000:3000 --env-file .env medicalcor-api
```
