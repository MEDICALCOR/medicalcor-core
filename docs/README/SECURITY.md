# Security Guide

Comprehensive documentation of MedicalCor Core's security architecture and best practices.

## Table of Contents

- [Security Overview](#security-overview)
- [Authentication & Authorization](#authentication--authorization)
- [Webhook Security](#webhook-security)
- [API Security](#api-security)
- [Data Protection](#data-protection)
- [Infrastructure Security](#infrastructure-security)
- [Compliance](#compliance)
- [Security Checklist](#security-checklist)
- [Incident Response](#incident-response)

---

## Security Overview

MedicalCor Core implements defense-in-depth with multiple security layers:

```
┌─────────────────────────────────────────────────────────────┐
│                      Security Layers                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Layer 1: Network Security                           │   │
│  │  • TLS 1.3 encryption                               │   │
│  │  • Cloudflare/CDN protection                        │   │
│  │  • DDoS mitigation                                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Layer 2: Application Security                       │   │
│  │  • Rate limiting (Redis)                            │   │
│  │  • CORS validation                                  │   │
│  │  • Helmet.js headers                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Layer 3: Authentication                             │   │
│  │  • Webhook signatures (HMAC-SHA256)                 │   │
│  │  • API key authentication                           │   │
│  │  • Session management (NextAuth)                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Layer 4: Input Validation                           │   │
│  │  • Zod schema validation                            │   │
│  │  • Payload size limits                              │   │
│  │  • Type coercion prevention                         │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Layer 5: Data Protection                            │   │
│  │  • PII redaction in logs                            │   │
│  │  • Encryption at rest                               │   │
│  │  • Audit logging                                    │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Security Principles

| Principle            | Implementation                    |
| -------------------- | --------------------------------- |
| **Defense in Depth** | Multiple security layers          |
| **Least Privilege**  | Minimal permissions per component |
| **Fail Secure**      | Reject on validation failure      |
| **Zero Trust**       | Verify all requests               |
| **Audit Everything** | Complete audit trail              |

---

## Authentication & Authorization

### Webhook Authentication

All incoming webhooks require signature verification:

| Provider             | Algorithm   | Header                |
| -------------------- | ----------- | --------------------- |
| WhatsApp (360dialog) | HMAC-SHA256 | `X-Hub-Signature-256` |
| Twilio               | Twilio SDK  | `X-Twilio-Signature`  |
| Stripe               | HMAC-SHA256 | `Stripe-Signature`    |
| Vapi                 | HMAC-SHA256 | `X-Vapi-Signature`    |

#### Signature Verification Implementation

```typescript
import crypto from 'crypto';

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  // Use timing-safe comparison to prevent timing attacks
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(`sha256=${expectedSignature}`));
}
```

**Security Features**:

- Timing-safe comparison prevents timing attacks
- Raw body preserved for signature calculation
- Signature verification before any processing
- No bypass in any environment (dev or prod)

### API Key Authentication

Internal endpoints use API key authentication:

```typescript
// Header: X-Api-Key: your-api-key
app.addHook('onRequest', async (request, reply) => {
  const apiKey = request.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    throw new UnauthorizedError('Invalid API key');
  }
});
```

### User Authentication (Web Dashboard)

NextAuth.js handles user authentication:

```typescript
// Features:
// - Bcrypt password hashing (cost factor 12+)
// - JWT session tokens
// - Role-based access control
// - Session expiration

const roles = ['admin', 'doctor', 'receptionist'] as const;
```

**Password Requirements**:

- Minimum 12 characters
- Bcrypt hashing with cost factor 12
- No storage of plaintext passwords
- Environment-based user configuration

---

## Webhook Security

### Verification Matrix

| Check             | WhatsApp     | Twilio  | Stripe       | Vapi         |
| ----------------- | ------------ | ------- | ------------ | ------------ |
| Signature         | HMAC-SHA256  | SDK     | SDK          | HMAC-SHA256  |
| Timestamp         | 5 min window | -       | 5 min window | 5 min window |
| Replay Prevention | Idempotency  | -       | Event ID     | Idempotency  |
| Rate Limiting     | 200/min      | 100/min | 50/min       | 100/min      |

### Configuration

```typescript
// apps/api/src/config/security.ts
export const webhookConfig = {
  whatsapp: {
    secret: process.env.WHATSAPP_WEBHOOK_SECRET,
    rateLimit: 200,
    timestampTolerance: 300, // 5 minutes
  },
  stripe: {
    secret: process.env.STRIPE_WEBHOOK_SECRET,
    rateLimit: 50,
    timestampTolerance: 300,
  },
  // ...
};
```

### Idempotency

Duplicate webhooks are handled via idempotency keys:

```typescript
// Generate idempotency key
const idempotencyKey = `${provider}:${eventId}:${timestamp}`;

// Check if already processed
const exists = await redis.get(`idempotency:${idempotencyKey}`);
if (exists) {
  logger.info('Duplicate webhook, skipping', { idempotencyKey });
  return { success: true, duplicate: true };
}

// Mark as processed (with TTL)
await redis.setex(`idempotency:${idempotencyKey}`, 86400, '1');
```

---

## API Security

### Rate Limiting

Redis-backed rate limiting with configurable limits:

```typescript
// Rate limit configuration
const rateLimits = {
  '/webhooks/whatsapp': { max: 200, window: 60 },
  '/webhooks/voice': { max: 100, window: 60 },
  '/webhooks/stripe': { max: 50, window: 60 },
  '/webhooks/vapi': { max: 100, window: 60 },
  '/workflows/*': { max: 50, window: 60 },
  '/ai/execute': { max: 30, window: 60 },
  global: { max: 1000, window: 60 },
};
```

**Response Headers**:

```
X-RateLimit-Limit: 200
X-RateLimit-Remaining: 150
X-RateLimit-Reset: 1673776060
Retry-After: 30 (when limited)
```

### CORS Configuration

```typescript
// Production CORS configuration
const corsConfig = {
  origin: (origin, callback) => {
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];

    // No wildcard (*) in production
    if (process.env.NODE_ENV === 'production' && !origin) {
      callback(new Error('CORS not allowed'), false);
      return;
    }

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS not allowed'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
};
```

### Security Headers (Helmet.js)

```typescript
// Security headers applied to all responses
app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});
```

### Input Validation

All inputs validated with Zod at API boundaries:

```typescript
// Strict validation with bounded limits
const WebhookPayloadSchema = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(EntrySchema).max(10), // Bounded array
  messages: z.array(MessageSchema).max(50),
});

// Validation middleware
app.addHook('preValidation', async (request) => {
  const result = WebhookPayloadSchema.safeParse(request.body);

  if (!result.success) {
    throw new ValidationError('Invalid payload', {
      errors: result.error.issues,
    });
  }

  request.body = result.data;
});
```

---

## Data Protection

### PII Redaction

Automatic PII redaction in logs:

```typescript
// packages/core/src/logger/redaction.ts
const redactPatterns = [
  { key: 'phone', replacement: '[REDACTED_PHONE]' },
  { key: 'email', replacement: '[REDACTED_EMAIL]' },
  { key: 'content', replacement: '[REDACTED_CONTENT]' },
  { key: 'message', replacement: '[REDACTED_MESSAGE]' },
  { key: 'password', replacement: '[REDACTED]' },
  { key: 'token', replacement: '[REDACTED]' },
  { key: 'apiKey', replacement: '[REDACTED]' },
];

// Applied automatically to all log output
logger.info('Processing message', {
  phone: '+1234567890', // Logged as [REDACTED_PHONE]
  message: 'Patient data', // Logged as [REDACTED_MESSAGE]
  channel: 'whatsapp', // Logged normally
});
```

### Data at Rest

| Data Type | Storage        | Encryption          |
| --------- | -------------- | ------------------- |
| Events    | PostgreSQL     | AES-256 (Cloud SQL) |
| Sessions  | Redis          | TLS in transit      |
| Secrets   | Secret Manager | KMS encryption      |
| Backups   | Cloud Storage  | AES-256             |

### Data in Transit

- TLS 1.3 for all connections
- Certificate pinning for critical services
- HSTS preload enabled

### Message Logging

Messages stored with content hash instead of plaintext:

```sql
-- message_log table
CREATE TABLE message_log (
  id UUID PRIMARY KEY,
  phone TEXT NOT NULL,
  direction TEXT NOT NULL,
  channel TEXT NOT NULL,
  content_hash TEXT NOT NULL,  -- SHA-256 hash, not plaintext
  external_message_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## Infrastructure Security

### Secrets Management

```bash
# Production: GCP Secret Manager
gcloud secrets create HUBSPOT_ACCESS_TOKEN
gcloud secrets versions add HUBSPOT_ACCESS_TOKEN --data-file=secret.txt

# Access via environment variable injection in Cloud Run
```

**Validation on Startup**:

```typescript
// packages/core/src/env/validate.ts
export function validateSecrets() {
  const required = [
    'HUBSPOT_ACCESS_TOKEN',
    'WHATSAPP_API_KEY',
    'WHATSAPP_WEBHOOK_SECRET',
    'STRIPE_WEBHOOK_SECRET',
    'DATABASE_URL',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0 && process.env.NODE_ENV === 'production') {
    throw new Error(`Missing required secrets: ${missing.join(', ')}`);
  }

  // Log status without values
  required.forEach((key) => {
    logger.info(`Secret ${key}: ${process.env[key] ? 'configured' : 'missing'}`);
  });
}
```

### Network Security

```
┌─────────────────────────────────────────────────────────────┐
│                    Production Network                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Internet                                                    │
│      │                                                       │
│      ▼                                                       │
│  ┌───────────────┐                                          │
│  │ Cloud Armor   │  ← WAF rules, DDoS protection            │
│  │ (WAF)         │                                          │
│  └───────┬───────┘                                          │
│          ▼                                                   │
│  ┌───────────────┐                                          │
│  │ Load Balancer │  ← TLS termination                       │
│  │ (HTTPS)       │                                          │
│  └───────┬───────┘                                          │
│          ▼                                                   │
│  ┌───────────────┐  ┌───────────────┐                       │
│  │  Cloud Run    │──│  Cloud Run    │  ← Internal only      │
│  │  (API)        │  │  (Web)        │                       │
│  └───────┬───────┘  └───────────────┘                       │
│          │                                                   │
│          ▼                                                   │
│  ┌───────────────┐  ┌───────────────┐                       │
│  │  Cloud SQL    │  │  Memorystore  │  ← VPC only           │
│  │  (PostgreSQL) │  │  (Redis)      │                       │
│  └───────────────┘  └───────────────┘                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Container Security

```dockerfile
# Dockerfile security practices
FROM node:20-alpine AS base

# Non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Read-only filesystem where possible
USER appuser

# No secrets in image
# COPY .env  # NEVER do this

# Minimal attack surface
RUN apk --no-cache add dumb-init
ENTRYPOINT ["dumb-init", "--"]
```

---

## Compliance

### GDPR Compliance

| Requirement            | Implementation                           |
| ---------------------- | ---------------------------------------- |
| **Consent Management** | Explicit consent tracking with audit log |
| **Right to Access**    | Event store enables data export          |
| **Right to Erasure**   | Soft delete with anonymization           |
| **Data Minimization**  | Only collect necessary data              |
| **Purpose Limitation** | Consent per processing purpose           |
| **Accountability**     | Complete audit trail                     |

**Consent Types**:

```sql
-- Supported consent types
data_processing        -- Essential processing
marketing_whatsapp     -- WhatsApp marketing
marketing_email        -- Email marketing
marketing_sms          -- SMS marketing
appointment_reminders  -- Appointment notifications
treatment_updates      -- Treatment-related updates
third_party_sharing    -- Sharing with partners
```

**Consent Lifecycle**:

```
Request → Record → Active → [Withdrawn/Expired] → Archived
    │        │        │            │                  │
    └────────┴────────┴────────────┴──────────────────┘
                      │
                   Audited
```

### HIPAA Considerations

| Control               | Status                    |
| --------------------- | ------------------------- |
| Access Control        | Implemented (RBAC)        |
| Audit Controls        | Implemented (Event Store) |
| Transmission Security | Implemented (TLS 1.3)     |
| Integrity Controls    | Implemented (Checksums)   |
| PHI Encryption        | Implemented (AES-256)     |

### Data Processors

```sql
-- Registered third-party processors
| Processor | Data Types | DPA Signed |
|-----------|------------|------------|
| HubSpot   | contacts, activities | Yes |
| 360dialog | phone, messages | Yes |
| Twilio    | phone, calls | Yes |
| OpenAI    | messages (anonymized) | Yes |
| Stripe    | payment data | Yes |
| Trigger.dev | job metadata | Yes |
```

---

## Security Checklist

### Pre-Deployment

- [ ] All secrets in Secret Manager (not in code/env files)
- [ ] CORS configured for production domains only
- [ ] Rate limiting enabled on all public endpoints
- [ ] Webhook signatures verified (no bypass)
- [ ] PII redaction enabled in logs
- [ ] Database connections use SSL
- [ ] API keys have minimal required permissions
- [ ] Dependency vulnerabilities addressed (`pnpm audit`)
- [ ] Error messages don't leak sensitive info
- [ ] Security headers configured (Helmet.js)

### CI/CD Security

- [ ] Secrets scanning enabled (GitLeaks)
- [ ] Dependency review on PRs
- [ ] License compliance check
- [ ] Container image scanning (Trivy)
- [ ] SBOM generation
- [ ] OpenSSF Scorecard tracking

### Ongoing

- [ ] Regular dependency updates
- [ ] Security audit reviews
- [ ] Access log monitoring
- [ ] Anomaly detection
- [ ] Incident response plan tested

---

## Incident Response

### Severity Levels

| Level         | Description                                 | Response Time |
| ------------- | ------------------------------------------- | ------------- |
| P1 - Critical | Data breach, system compromise              | Immediate     |
| P2 - High     | Service disruption, vulnerability exploited | < 1 hour      |
| P3 - Medium   | Potential vulnerability, unusual activity   | < 4 hours     |
| P4 - Low      | Minor security issue                        | < 24 hours    |

### Response Procedure

1. **Detect** - Identify the incident via monitoring/alerts
2. **Contain** - Isolate affected systems
3. **Investigate** - Determine scope and root cause
4. **Remediate** - Fix the vulnerability
5. **Recover** - Restore normal operations
6. **Review** - Post-incident analysis and improvements

### Contact

Security issues should be reported to: security@medicalcor.com

Do NOT create public GitHub issues for security vulnerabilities.

---

## Further Reading

- [OWASP Top 10](https://owasp.org/Top10/)
- [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks)
- [GDPR Official Text](https://gdpr.eu/)
- [HIPAA Security Rule](https://www.hhs.gov/hipaa/for-professionals/security/)
