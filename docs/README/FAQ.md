# Frequently Asked Questions

Common questions about MedicalCor Core.

## Table of Contents

- [General](#general)
- [Setup & Installation](#setup--installation)
- [Development](#development)
- [Features](#features)
- [Integrations](#integrations)
- [Security & Compliance](#security--compliance)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)

---

## General

### What is MedicalCor Core?

MedicalCor Core is an AI-powered Customer Relationship Management (CRM) platform specifically designed for dental clinics and medical practices. It combines intelligent lead scoring, omnichannel communication (WhatsApp, Voice, Email), and durable workflow processing to streamline patient acquisition and management.

### Who is MedicalCor for?

- Dental clinics looking to improve lead conversion
- Medical practices needing GDPR-compliant patient communication
- Healthcare organizations wanting AI-powered lead qualification
- Multi-location practices needing centralized lead management

### What makes MedicalCor different from generic CRMs?

1. **Medical-specific AI scoring**: Trained to recognize dental/medical terminology and urgency signals
2. **GDPR-compliant by design**: Built-in consent management with audit trails
3. **Durable workflows**: Guaranteed message delivery with automatic retries
4. **Omnichannel**: Unified inbox for WhatsApp, Voice, Email, and Web leads

### Is MedicalCor open source?

MedicalCor Core is licensed under the MIT License, making it free to use, modify, and distribute.

---

## Setup & Installation

### What are the system requirements?

| Component | Minimum | Recommended |
| --------- | ------- | ----------- |
| Node.js   | 20.0.0  | Latest LTS  |
| pnpm      | 9.0.0   | Latest      |
| RAM       | 8 GB    | 16 GB       |
| Disk      | 10 GB   | 20 GB       |
| Docker    | 24.0    | Latest      |

### How long does setup take?

First-time setup typically takes 10-15 minutes:

- Cloning and dependency installation: 3-5 minutes
- Docker containers startup: 1-2 minutes
- Initial build: 2-3 minutes
- Configuration: 5 minutes

### Can I run MedicalCor without Docker?

Yes, but you'll need to:

1. Install PostgreSQL 15 locally
2. Install Redis 7 locally
3. Configure connection strings in `.env`

Docker is recommended for consistency and ease of setup.

### Do I need all the integrations to get started?

No. For basic development:

- **Required**: PostgreSQL, Redis
- **Optional**: HubSpot, WhatsApp, OpenAI, Stripe, Twilio

The system uses fallback behaviors when integrations are unavailable (e.g., rule-based scoring instead of AI).

---

## Development

### Which IDE should I use?

We recommend **VS Code** with these extensions:

- ESLint
- Prettier
- Tailwind CSS IntelliSense
- Prisma
- Docker

**WebStorm** is also fully supported.

### How do I add a new package to the monorepo?

```bash
# Create package directory
mkdir -p packages/new-package/src

# Create package.json
cat > packages/new-package/package.json << 'EOF'
{
  "name": "@medicalcor/new-package",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --watch"
  }
}
EOF

# Add to workspace
pnpm install
```

### How do I debug Trigger.dev workflows?

```bash
# Run Trigger.dev in dev mode
cd apps/trigger
pnpm dev

# View logs in Trigger.dev dashboard
# https://cloud.trigger.dev
```

You can also add console.log statements - they appear in the dashboard.

### Where should I put new Zod schemas?

All schemas go in `packages/types/src/schemas/`. This is the single source of truth.

```typescript
// packages/types/src/schemas/my-schema.ts
import { z } from 'zod';

export const MySchema = z.object({
  // ...
});

export type My = z.infer<typeof MySchema>;
```

Don't forget to export from `packages/types/src/index.ts`.

---

## Features

### How does AI lead scoring work?

1. **Input**: Message content + lead context + conversation history
2. **Processing**: GPT-4o analyzes the text for intent, urgency, and procedure interest
3. **Output**: Score (1-5), classification (HOT/WARM/COLD), confidence, reasoning
4. **Fallback**: If AI fails, rule-based scoring kicks in automatically

### What scoring classifications are supported?

| Score | Classification | Description                                  |
| ----- | -------------- | -------------------------------------------- |
| 5     | HOT            | Ready to book, high-value procedure interest |
| 4     | HOT            | Strong interest, needs follow-up within 24h  |
| 3     | WARM           | Interested but not urgent                    |
| 2     | COLD           | Low interest, nurture campaign               |
| 1     | UNQUALIFIED    | Not a good fit                               |

### How are appointments managed?

1. **Practitioners** define their availability as time slots
2. **Leads** can be matched to available slots based on procedure type
3. **Appointments** track status: scheduled → confirmed → completed
4. **Reminders** are sent automatically at 24h and 2h before

### Can I customize the scoring model?

Yes, you can:

1. Modify the system prompt in `packages/domain/src/scoring/prompts.ts`
2. Adjust rule-based scoring in `packages/domain/src/scoring/rules.ts`
3. Add new procedure keywords
4. Change score thresholds

---

## Integrations

### Which CRMs are supported?

Currently **HubSpot** is the primary CRM integration. The architecture supports adding:

- Salesforce
- Pipedrive
- Zoho CRM
- Custom CRMs via API

### How do I set up WhatsApp?

1. Create account at [360dialog.com](https://360dialog.com)
2. Register your WhatsApp Business phone number
3. Configure webhook URL: `https://your-api.com/webhooks/whatsapp`
4. Add credentials to `.env`:
   ```bash
   WHATSAPP_API_KEY=your-key
   WHATSAPP_VERIFY_TOKEN=your-token
   WHATSAPP_WEBHOOK_SECRET=your-secret
   ```

### Can I use a different AI provider?

The architecture supports swapping OpenAI for:

- Azure OpenAI
- Anthropic Claude
- Google Gemini
- Local models via Ollama

Modify `packages/integrations/src/openai.ts` to use a different provider.

### How does the HubSpot sync work?

| Event              | Action                                 |
| ------------------ | -------------------------------------- |
| New lead message   | Create/update contact, log to timeline |
| Lead scored        | Update contact properties              |
| Appointment booked | Create engagement, set reminder task   |
| Lead marked HOT    | Create high-priority task for sales    |

---

## Security & Compliance

### Is MedicalCor GDPR compliant?

Yes, by design:

- **Consent management**: Explicit consent tracking with audit logs
- **Right to access**: Event store enables full data export
- **Right to erasure**: Soft delete with anonymization
- **Data minimization**: Only essential data collected
- **Audit trail**: Every action logged with timestamp

### How is patient data protected?

1. **Encryption at rest**: AES-256 via Cloud SQL
2. **Encryption in transit**: TLS 1.3
3. **PII redaction**: Phone, email, content redacted in logs
4. **Access control**: Role-based permissions
5. **Audit logging**: All access tracked

### Are webhooks secure?

Yes, all webhooks require signature verification:

- WhatsApp: HMAC-SHA256
- Twilio: Official SDK validation
- Stripe: Stripe signature verification
- Vapi: HMAC-SHA256

Signature verification cannot be bypassed in any environment.

### How should I handle API keys?

| Environment | Storage                    |
| ----------- | -------------------------- |
| Development | `.env` file (never commit) |
| Staging     | GCP Secret Manager         |
| Production  | GCP Secret Manager         |
| CI/CD       | GitHub Secrets             |

---

## Deployment

### Where can I deploy MedicalCor?

Tested and supported:

- **Google Cloud Platform** (Cloud Run, Cloud SQL)
- **AWS** (ECS, RDS)
- **Fly.io**
- **Railway**
- **Render**
- **Self-hosted** (Docker)

### How much does infrastructure cost?

Estimated monthly costs (GCP):

| Component   | Dev        | Production   |
| ----------- | ---------- | ------------ |
| Cloud Run   | $0-10      | $50-200      |
| Cloud SQL   | $10-20     | $50-100      |
| Memorystore | $20        | $50          |
| **Total**   | **$30-50** | **$150-350** |

Development can use the free tier with min 0 instances.

### How do I scale for high traffic?

Cloud Run auto-scales based on request load:

- **Min instances**: 1 (always warm)
- **Max instances**: 10 (adjust as needed)
- **Concurrent requests**: 80 per instance

For very high traffic (>1000 req/min), consider:

- Increase max instances
- Use regional load balancing
- Add caching layer

### How do I do zero-downtime deployments?

Cloud Run provides this automatically:

1. New revision is deployed
2. Traffic gradually shifts
3. Old revision kept warm for rollback
4. Health checks ensure readiness

---

## Troubleshooting

### Why are my webhooks not working?

Common causes:

1. **URL not accessible**: Use ngrok or Cloudflare tunnel for local development
2. **Signature mismatch**: Verify webhook secret matches provider configuration
3. **Firewall blocking**: Ensure provider IPs can reach your endpoint

### Why is lead scoring slow?

Possible causes:

1. **OpenAI latency**: Normal response time is 2-5 seconds
2. **Network issues**: Check OpenAI status page
3. **Rate limiting**: You may be hitting API limits

The fallback to rule-based scoring is instant.

### Why am I getting rate limited?

Check the endpoint-specific limits:

| Endpoint | Limit   |
| -------- | ------- |
| WhatsApp | 200/min |
| Voice    | 100/min |
| Stripe   | 50/min  |

If legitimate traffic, consider:

1. Batching requests
2. Adding caching
3. Increasing limits in config

### Where can I get help?

1. **Documentation**: [docs/README/](./README.md)
2. **GitHub Issues**: [Report bugs](https://github.com/casagest/medicalcor-core/issues)
3. **Discussions**: [Ask questions](https://github.com/casagest/medicalcor-core/discussions)

---

## Contributing

### How can I contribute?

1. Fork the repository
2. Create a feature branch
3. Make changes following our [Development Guide](./DEVELOPMENT.md)
4. Write tests
5. Submit a pull request

### What's the code review process?

1. CI must pass (lint, types, tests)
2. At least one approval required
3. All comments must be resolved
4. Squash merge to main

### Can I request features?

Yes! Open a [GitHub Discussion](https://github.com/casagest/medicalcor-core/discussions) with:

- Use case description
- Expected behavior
- Why it would be valuable
