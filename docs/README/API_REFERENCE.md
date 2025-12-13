# API Reference

Complete documentation for the MedicalCor Core API endpoints.

## Table of Contents

- [Overview](#overview)
- [Authentication](#authentication)
- [Health Endpoints](#health-endpoints)
- [Webhook Endpoints](#webhook-endpoints)
- [Workflow Endpoints](#workflow-endpoints)
- [Booking Endpoints](#booking-endpoints)
- [Backup Endpoints](#backup-endpoints)
- [Diagnostics Endpoints](#diagnostics-endpoints)
- [Error Handling](#error-handling)
- [Rate Limiting](#rate-limiting)

---

## Overview

### Base URL

| Environment       | URL                                  |
| ----------------- | ------------------------------------ |
| Local Development | `http://localhost:3000`              |
| Staging           | `https://api-staging.medicalcor.com` |
| Production        | `https://api.medicalcor.com`         |

### Content Type

All requests and responses use JSON:

```
Content-Type: application/json
```

### Request Headers

| Header             | Required    | Description                                          |
| ------------------ | ----------- | ---------------------------------------------------- |
| `Content-Type`     | Yes         | Must be `application/json`                           |
| `X-Correlation-ID` | No          | Request tracking ID (auto-generated if not provided) |
| `X-Api-Key`        | Conditional | Required for workflow endpoints                      |

### Response Format

All responses follow this structure:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "correlationId": "uuid-here",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  },
  "meta": {
    "correlationId": "uuid-here",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

## Authentication

### Webhook Authentication

Webhooks use signature verification instead of API keys:

| Provider | Header                | Algorithm             |
| -------- | --------------------- | --------------------- |
| WhatsApp | `X-Hub-Signature-256` | HMAC-SHA256           |
| Twilio   | `X-Twilio-Signature`  | Twilio SDK validation |
| Stripe   | `Stripe-Signature`    | Stripe SDK validation |
| Vapi     | `X-Vapi-Signature`    | HMAC-SHA256           |

### API Key Authentication

For workflow and internal endpoints:

```bash
curl -X POST https://api.medicalcor.com/workflows/trigger \
  -H "Content-Type: application/json" \
  -H "X-Api-Key: your-api-key-here" \
  -d '{"task": "example"}'
```

---

## Health Endpoints

### GET /health

Basic health check endpoint.

**Authentication**: None

**Response**:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes**:

- `200` - Service is healthy
- `503` - Service is unhealthy

---

### GET /ready

Kubernetes readiness probe. Checks database and Redis connectivity.

**Authentication**: None

**Response**:

```json
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok"
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes**:

- `200` - Service is ready to accept traffic
- `503` - Service is not ready (dependency failure)

---

### GET /live

Kubernetes liveness probe. Simple ping check.

**Authentication**: None

**Response**:

```json
{
  "status": "alive",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

**Status Codes**:

- `200` - Service is alive

---

## Webhook Endpoints

### WhatsApp Webhooks

#### GET /webhooks/whatsapp

Webhook subscription verification (challenge-response).

**Authentication**: Query parameter verification

**Query Parameters**:

| Parameter          | Type   | Description             |
| ------------------ | ------ | ----------------------- |
| `hub.mode`         | string | Must be `subscribe`     |
| `hub.verify_token` | string | Your verification token |
| `hub.challenge`    | string | Challenge to echo back  |

**Response**: Plain text challenge value

**Example**:

```bash
curl "http://localhost:3000/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=your-token&hub.challenge=123456"
# Response: 123456
```

---

#### POST /webhooks/whatsapp

Receive incoming WhatsApp messages.

**Authentication**: HMAC-SHA256 signature in `X-Hub-Signature-256` header

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| `X-Hub-Signature-256` | Yes | `sha256=<signature>` |
| `Content-Type` | Yes | `application/json` |

**Request Body** (360dialog format):

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "WHATSAPP_BUSINESS_ACCOUNT_ID",
      "changes": [
        {
          "value": {
            "messaging_product": "whatsapp",
            "metadata": {
              "display_phone_number": "15550001234",
              "phone_number_id": "PHONE_NUMBER_ID"
            },
            "contacts": [
              {
                "profile": {
                  "name": "John Doe"
                },
                "wa_id": "15550005678"
              }
            ],
            "messages": [
              {
                "id": "wamid.xxx",
                "from": "15550005678",
                "timestamp": "1673776000",
                "type": "text",
                "text": {
                  "body": "I'm interested in dental implants"
                }
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

**Response**:

```json
{
  "success": true,
  "message": "Webhook received"
}
```

**Status Codes**:

- `200` - Webhook processed successfully
- `401` - Invalid signature
- `400` - Invalid payload
- `429` - Rate limited

---

### Voice Webhooks (Twilio)

#### POST /webhooks/voice

Handle incoming Twilio voice calls.

**Authentication**: Twilio signature validation

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| `X-Twilio-Signature` | Yes | Twilio request signature |

**Request Body** (form-urlencoded):

```
CallSid=CAxxxxxxxx&
AccountSid=ACxxxxxxxx&
From=+15550001234&
To=+15550005678&
CallStatus=ringing
```

**Response**: TwiML XML response

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. Please hold.</Say>
  <Dial>+15550009999</Dial>
</Response>
```

---

#### POST /webhooks/voice/status

Receive call status updates.

**Authentication**: Twilio signature validation

**Request Body**:

```
CallSid=CAxxxxxxxx&
CallStatus=completed&
CallDuration=120&
RecordingUrl=https://...
```

**Response**:

```json
{
  "success": true,
  "message": "Status received"
}
```

---

### Stripe Webhooks

#### POST /webhooks/stripe

Handle Stripe payment events.

**Authentication**: Stripe signature in `Stripe-Signature` header

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| `Stripe-Signature` | Yes | Stripe webhook signature |

**Supported Events**:

| Event                           | Description                    |
| ------------------------------- | ------------------------------ |
| `payment_intent.succeeded`      | Payment completed successfully |
| `payment_intent.payment_failed` | Payment failed                 |
| `invoice.paid`                  | Invoice was paid               |
| `invoice.payment_failed`        | Invoice payment failed         |
| `customer.subscription.created` | New subscription created       |
| `customer.subscription.deleted` | Subscription cancelled         |

**Request Body**:

```json
{
  "id": "evt_xxx",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_xxx",
      "amount": 10000,
      "currency": "usd",
      "customer": "cus_xxx"
    }
  }
}
```

**Response**:

```json
{
  "received": true
}
```

---

### Vapi Webhooks

#### POST /webhooks/vapi

Handle Vapi voice AI callbacks.

**Authentication**: HMAC-SHA256 signature in `X-Vapi-Signature` header

**Request Body**:

```json
{
  "type": "call.completed",
  "call": {
    "id": "call_xxx",
    "phoneNumber": "+15550001234",
    "transcript": "...",
    "duration": 180,
    "analysis": {
      "intent": "booking",
      "sentiment": "positive"
    }
  }
}
```

**Response**:

```json
{
  "success": true
}
```

---

## Workflow Endpoints

### POST /workflows/trigger

Manually trigger a workflow.

**Authentication**: API Key required

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| `X-Api-Key` | Yes | API secret key |

**Request Body**:

```json
{
  "workflow": "lead-scoring",
  "payload": {
    "phone": "+15550001234",
    "message": "I'm interested in All-on-X implants",
    "channel": "whatsapp"
  },
  "options": {
    "priority": "high",
    "idempotencyKey": "unique-key-here"
  }
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "runId": "run_xxx",
    "status": "queued",
    "workflow": "lead-scoring"
  }
}
```

---

### POST /ai/execute

Execute AI function calls.

**Authentication**: API Key required

**Request Body**:

```json
{
  "function": "score_lead",
  "parameters": {
    "message": "I need dental implants urgently",
    "context": {
      "previousMessages": [],
      "channel": "whatsapp"
    }
  }
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "score": 5,
    "classification": "HOT",
    "confidence": 0.92,
    "reasoning": "Urgent need expressed with high-value procedure interest",
    "suggestedAction": "Immediate callback from senior consultant"
  }
}
```

---

## Booking Endpoints

### POST /booking/slots

Get available appointment slots for a specific date range.

**Authentication**: API Key required

**Headers**:
| Header | Required | Description |
|--------|----------|-------------|
| `X-Api-Key` | Yes | API secret key |

**Request Body**:

```json
{
  "startDate": "2024-01-15",
  "endDate": "2024-01-22",
  "procedureType": "implant_consultation",
  "duration": 60,
  "doctorId": "doc_xxx"
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "slots": [
      {
        "date": "2024-01-15",
        "time": "09:00",
        "available": true,
        "doctorId": "doc_xxx",
        "duration": 60
      },
      {
        "date": "2024-01-15",
        "time": "10:00",
        "available": true,
        "doctorId": "doc_xxx",
        "duration": 60
      }
    ]
  }
}
```

---

### POST /booking/appointments

Create a new appointment.

**Authentication**: API Key required

**Request Body**:

```json
{
  "patientPhone": "+15550001234",
  "patientName": "John Doe",
  "patientEmail": "john@example.com",
  "date": "2024-01-15",
  "time": "09:00",
  "procedureType": "implant_consultation",
  "duration": 60,
  "doctorId": "doc_xxx",
  "notes": "First consultation for implants",
  "consentGiven": true
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "appointmentId": "apt_xxx",
    "status": "confirmed",
    "confirmationSent": true
  }
}
```

**Status Codes**:

- `200` - Appointment created successfully
- `400` - Invalid request (missing consent, invalid date)
- `409` - Slot no longer available
- `429` - Rate limited

---

### DELETE /booking/appointments/:id

Cancel an existing appointment.

**Authentication**: API Key required

**Response**:

```json
{
  "success": true,
  "data": {
    "appointmentId": "apt_xxx",
    "status": "cancelled",
    "notificationSent": true
  }
}
```

---

## Backup Endpoints

> **Note**: These endpoints are for internal use and require admin authentication.

### POST /admin/backup

Trigger a manual database backup.

**Authentication**: Admin API Key required

**Request Body**:

```json
{
  "type": "full",
  "destination": "gcs",
  "encrypt": true
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "backupId": "backup_xxx",
    "status": "in_progress",
    "estimatedDuration": 300
  }
}
```

---

### GET /admin/backup/:id/status

Get backup status.

**Authentication**: Admin API Key required

**Response**:

```json
{
  "success": true,
  "data": {
    "backupId": "backup_xxx",
    "status": "completed",
    "size": "1.2GB",
    "duration": 180,
    "location": "gs://medicalcor-backups/backup_xxx.enc"
  }
}
```

---

### POST /admin/restore

Restore from a backup.

**Authentication**: Admin API Key required

**Request Body**:

```json
{
  "backupId": "backup_xxx",
  "targetEnvironment": "staging",
  "verify": true
}
```

**Response**:

```json
{
  "success": true,
  "data": {
    "restoreId": "restore_xxx",
    "status": "in_progress"
  }
}
```

---

## Diagnostics Endpoints

### GET /diagnostics/health

Detailed health status with metrics.

**Authentication**: None (internal use)

**Response**:

```json
{
  "status": "healthy",
  "uptime": 86400,
  "version": "1.0.0",
  "dependencies": {
    "database": {
      "status": "healthy",
      "latency": 5
    },
    "redis": {
      "status": "healthy",
      "latency": 2
    },
    "hubspot": {
      "status": "healthy",
      "lastCheck": "2024-01-15T10:29:00.000Z"
    }
  },
  "metrics": {
    "requestsPerMinute": 150,
    "errorRate": 0.01,
    "p95Latency": 45
  }
}
```

---

### GET /diagnostics/ready

Service readiness with dependency checks.

**Response**:

```json
{
  "ready": true,
  "checks": [
    {
      "name": "database",
      "status": "pass",
      "latency": 5
    },
    {
      "name": "redis",
      "status": "pass",
      "latency": 2
    }
  ]
}
```

---

## Error Handling

### Error Codes

| Code                  | HTTP Status | Description                           |
| --------------------- | ----------- | ------------------------------------- |
| `VALIDATION_ERROR`    | 400         | Invalid request payload               |
| `SIGNATURE_INVALID`   | 401         | Webhook signature verification failed |
| `UNAUTHORIZED`        | 401         | Missing or invalid API key            |
| `FORBIDDEN`           | 403         | Insufficient permissions              |
| `NOT_FOUND`           | 404         | Resource not found                    |
| `RATE_LIMITED`        | 429         | Too many requests                     |
| `INTERNAL_ERROR`      | 500         | Internal server error                 |
| `SERVICE_UNAVAILABLE` | 503         | Dependency unavailable                |

### Error Response Examples

**Validation Error**:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": {
      "field": "phone",
      "issue": "Invalid phone number format"
    }
  }
}
```

**Rate Limited**:

```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests",
    "details": {
      "retryAfter": 60,
      "limit": 200,
      "remaining": 0
    }
  }
}
```

---

## Rate Limiting

### Limits by Endpoint

| Endpoint             | Limit | Window   |
| -------------------- | ----- | -------- |
| `/webhooks/whatsapp` | 200   | 1 minute |
| `/webhooks/voice`    | 100   | 1 minute |
| `/webhooks/stripe`   | 50    | 1 minute |
| `/webhooks/vapi`     | 100   | 1 minute |
| `/workflows/*`       | 50    | 1 minute |
| `/ai/execute`        | 30    | 1 minute |
| Global fallback      | 1000  | 1 minute |

### Rate Limit Headers

Responses include rate limit information:

```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 150
X-RateLimit-Reset: 1673776060
```

### Handling Rate Limits

When rate limited, implement exponential backoff:

```javascript
async function fetchWithRetry(url, options, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    const response = await fetch(url, options);

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || Math.pow(2, i);
      await sleep(retryAfter * 1000);
      continue;
    }

    return response;
  }
  throw new Error('Max retries exceeded');
}
```

---

## Testing Webhooks

### Local Development

Use ngrok or Cloudflare Tunnel to expose local endpoints:

```bash
# Using ngrok
ngrok http 3000

# Using Cloudflare Tunnel (built into docker-compose)
docker compose --profile tunnel up -d
```

### Webhook Testing Tools

**WhatsApp Test**:

```bash
curl -X POST http://localhost:3000/webhooks/whatsapp \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=<calculated-signature>" \
  -d @test-payload.json
```

**Stripe Test** (using Stripe CLI):

```bash
stripe trigger payment_intent.succeeded --webhook-endpoint http://localhost:3000/webhooks/stripe
```

---

## SDK Examples

### Node.js

```javascript
import { MedicalCorClient } from '@medicalcor/sdk';

const client = new MedicalCorClient({
  apiKey: process.env.API_KEY,
  baseUrl: 'https://api.medicalcor.com',
});

// Trigger a workflow
const result = await client.workflows.trigger('lead-scoring', {
  phone: '+15550001234',
  message: 'Interested in implants',
});

// Execute AI function
const score = await client.ai.execute('score_lead', {
  message: 'I need urgent dental care',
});
```

### Python

```python
from medicalcor import MedicalCorClient

client = MedicalCorClient(
    api_key=os.environ['API_KEY'],
    base_url='https://api.medicalcor.com'
)

# Trigger a workflow
result = client.workflows.trigger('lead-scoring', {
    'phone': '+15550001234',
    'message': 'Interested in implants'
})
```

---

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for API version history and breaking changes.
