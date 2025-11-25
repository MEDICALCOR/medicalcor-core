# Glossary

Domain terminology and technical definitions used in MedicalCor Core.

## Table of Contents

- [Domain Terms](#domain-terms)
- [Technical Terms](#technical-terms)
- [Integrations](#integrations)
- [Acronyms](#acronyms)

---

## Domain Terms

### Lead

A potential patient who has shown interest in dental/medical services through any communication channel.

**Properties**:
- Phone number (E.164 format)
- Communication channel
- Message history
- Score and classification
- First touch timestamp

### Lead Classification

The categorization of a lead based on their likelihood to convert:

| Classification | Description | Typical Action |
|----------------|-------------|----------------|
| **HOT** | Ready to book, high intent | Immediate callback |
| **WARM** | Interested but not urgent | Follow-up within 24-48h |
| **COLD** | Low interest | Add to nurture campaign |
| **UNQUALIFIED** | Not a good fit | No follow-up |

### Lead Score

A numerical value (1-5) indicating the quality and readiness of a lead:

| Score | Meaning |
|-------|---------|
| 5 | Excellent - Ready to book high-value procedure |
| 4 | Good - Strong interest, needs timely follow-up |
| 3 | Average - Moderate interest |
| 2 | Below average - Low intent signals |
| 1 | Poor - Unlikely to convert |

### Lead Channel

The communication channel through which a lead contacted the clinic:

- **WhatsApp**: WhatsApp Business messages via 360dialog
- **Voice**: Phone calls via Twilio or Vapi
- **Email**: Email inquiries
- **Web**: Website form submissions or chat

### Consent

Permission granted by a patient for specific data processing activities.

**Types**:
- `data_processing`: Essential data handling
- `marketing_whatsapp`: WhatsApp marketing messages
- `marketing_email`: Email marketing
- `marketing_sms`: SMS marketing
- `appointment_reminders`: Appointment notifications
- `treatment_updates`: Treatment-related communications
- `third_party_sharing`: Sharing with partner organizations

**Status**:
- `granted`: Patient has given consent
- `denied`: Patient has declined
- `withdrawn`: Patient revoked previous consent
- `pending`: Awaiting patient response

### Triage

The process of evaluating a lead's urgency and determining appropriate routing:

**Urgency Levels**:
- **Critical**: Medical emergency (route to on-call)
- **High**: Urgent issue, same-day response needed
- **Medium**: Standard priority, 24-48h response
- **Low**: Non-urgent, can wait

### Recall

A scheduled follow-up appointment for returning patients, typically for:
- Routine checkups
- Cleaning appointments
- Treatment follow-ups
- Annual reviews

### Practitioner

A healthcare provider (dentist, hygienist, specialist) who sees patients and has bookable time slots.

### Time Slot

An available appointment period for a practitioner:
- Start time
- Duration
- Procedure types supported
- Booking status

### Appointment Status

| Status | Description |
|--------|-------------|
| `scheduled` | Appointment booked |
| `confirmed` | Patient confirmed attendance |
| `completed` | Appointment finished |
| `cancelled` | Cancelled before appointment |
| `no_show` | Patient didn't attend |

---

## Technical Terms

### Domain Event

An immutable record of something that happened in the system. Used for:
- Audit trails
- Event sourcing
- State reconstruction
- GDPR compliance

### Event Store

An append-only database table storing all domain events with:
- Event type
- Payload (JSONB)
- Correlation ID
- Timestamp
- Idempotency key

### Idempotency

The property that an operation can be applied multiple times without changing the result beyond the initial application. Used to prevent duplicate processing of webhooks.

### Idempotency Key

A unique identifier for an operation that ensures it's processed only once:
```
{provider}:{eventId}:{timestamp}
```

### Circuit Breaker

A resilience pattern that prevents repeated calls to a failing service:

| State | Behavior |
|-------|----------|
| **Closed** | Normal operation, requests pass through |
| **Open** | All requests fail immediately |
| **Half-Open** | Allow limited requests to test recovery |

### Rate Limiting

Controlling the number of requests a client can make in a time window to prevent abuse and ensure fair usage.

### Webhook

An HTTP callback that delivers data when an event occurs. Used for:
- WhatsApp messages (360dialog → API)
- Voice calls (Twilio → API)
- Payments (Stripe → API)
- Voice AI (Vapi → API)

### Signature Verification

Validating that a webhook request came from the expected sender using HMAC-SHA256:
1. Provider signs payload with shared secret
2. API calculates expected signature
3. Compare using timing-safe method

### Durable Workflow

A background process that:
- Survives application restarts
- Automatically retries on failure
- Maintains state across steps
- Provides exactly-once execution

### Correlation ID

A unique identifier that tracks a request through all system components for debugging and monitoring.

### PII (Personally Identifiable Information)

Data that can identify an individual:
- Phone numbers
- Email addresses
- Names
- Addresses
- Medical information

Automatically redacted in logs.

### Zod Schema

A TypeScript-first schema declaration and validation library. Used as the single source of truth for data shapes.

### Monorepo

A single repository containing multiple packages/applications:
```
medicalcor-core/
├── apps/          # Applications
├── packages/      # Shared libraries
└── infra/         # Infrastructure
```

### Turborepo

A build system for monorepos that:
- Caches build outputs
- Runs tasks in parallel
- Respects package dependencies

---

## Integrations

### 360dialog

WhatsApp Business API provider that enables:
- Sending/receiving WhatsApp messages
- Template message delivery
- Webhook notifications

### HubSpot

CRM platform for:
- Contact management
- Timeline activity logging
- Task creation
- Deal tracking

### Trigger.dev

Background job orchestration platform for:
- Durable workflow execution
- Scheduled cron jobs
- Automatic retries
- Visual monitoring

### Twilio

Communication platform for:
- Voice calls
- SMS messages
- Webhook notifications

### Vapi

Voice AI platform for:
- Conversational AI agents
- Call transcription
- Intent analysis

### OpenAI

AI platform providing:
- GPT-4o for lead scoring
- Natural language understanding
- Intent classification

### Stripe

Payment processing for:
- Invoice generation
- Payment collection
- Subscription management

---

## Acronyms

| Acronym | Full Form | Description |
|---------|-----------|-------------|
| **API** | Application Programming Interface | Interface for software communication |
| **CRM** | Customer Relationship Management | System for managing customer interactions |
| **CORS** | Cross-Origin Resource Sharing | Browser security mechanism |
| **E.164** | ITU-T E.164 | International phone number format (+15551234567) |
| **GDPR** | General Data Protection Regulation | EU data privacy law |
| **HIPAA** | Health Insurance Portability and Accountability Act | US healthcare data privacy law |
| **HMAC** | Hash-based Message Authentication Code | Cryptographic authentication |
| **HSTS** | HTTP Strict Transport Security | Force HTTPS connections |
| **JWT** | JSON Web Token | Token-based authentication |
| **KMS** | Key Management Service | Cryptographic key management |
| **LLM** | Large Language Model | AI model like GPT-4 |
| **MSW** | Mock Service Worker | API mocking library |
| **OTEL** | OpenTelemetry | Observability framework |
| **OTLP** | OpenTelemetry Protocol | Telemetry data transfer protocol |
| **PII** | Personally Identifiable Information | Data identifying individuals |
| **PWA** | Progressive Web App | Web app with native features |
| **RBAC** | Role-Based Access Control | Permission management |
| **SDK** | Software Development Kit | Development tools and libraries |
| **SLA** | Service Level Agreement | Performance guarantees |
| **SOC2** | Service Organization Control 2 | Security compliance standard |
| **TLS** | Transport Layer Security | Encryption protocol |
| **TTL** | Time To Live | Expiration duration |
| **UUID** | Universally Unique Identifier | 128-bit unique ID |
| **VPC** | Virtual Private Cloud | Isolated cloud network |
| **WAF** | Web Application Firewall | Web security service |
| **XSS** | Cross-Site Scripting | Web security vulnerability |

---

## Related Documentation

- [Architecture](./ARCHITECTURE.md) - System design overview
- [API Reference](./API_REFERENCE.md) - Endpoint documentation
- [Security Guide](./SECURITY.md) - Security architecture
