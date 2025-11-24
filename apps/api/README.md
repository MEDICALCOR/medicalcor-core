# @medicalcor/api

Fastify-based webhook gateway for MedicalCor.

## Overview

This service acts as the ingestion layer for external webhooks:
- WhatsApp messages (via 360dialog)
- Voice calls (via Twilio)
- Stripe payment events
- Vapi voice AI callbacks

All webhooks are validated using Zod schemas and signature verification, then forwarded to Trigger.dev for durable processing.

## Security Features

### Webhook Signature Verification
All webhook endpoints verify signatures to prevent spoofing:
- **WhatsApp**: HMAC-SHA256 signature in `X-Hub-Signature-256` header
- **Twilio**: Twilio signature in `X-Twilio-Signature` header
- **Stripe**: Signature verification via `stripe-signature` header
- **Vapi**: HMAC-SHA256 with `X-Vapi-Signature` header

### Rate Limiting
IP-based rate limiting with per-endpoint tiers:
- WhatsApp: 200 req/min (handles message bursts)
- Voice: 100 req/min
- Stripe: 50 req/min
- Booking: 100 req/min
- Global: 1000 req/min

Rate limit headers included in responses:
- `X-RateLimit-Limit`: Maximum requests allowed
- `X-RateLimit-Remaining`: Requests remaining
- `X-RateLimit-Reset`: Reset timestamp

### Input Validation
All inputs validated with Zod schemas before processing.
Request timeouts: 30 seconds for all external API calls.

## Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/health` | Health check | None |
| GET | `/ready` | Readiness probe (k8s) | None |
| GET | `/live` | Liveness probe (k8s) | None |
| GET | `/webhooks/whatsapp` | WhatsApp webhook verification | Signature |
| POST | `/webhooks/whatsapp` | WhatsApp message receiver | Signature |
| POST | `/webhooks/voice` | Twilio voice webhook | Signature |
| POST | `/webhooks/voice/status` | Twilio call status callback | Signature |
| POST | `/webhooks/stripe` | Stripe payment events | Signature |
| POST | `/webhooks/vapi` | Vapi voice AI callbacks | Signature |

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
