# @medicalcor/integrations

Third-party service integrations for MedicalCor.

## Overview

This package provides type-safe clients for external services:
- **HubSpot**: CRM operations (contacts, tasks, timeline events)
- **WhatsApp**: Messaging via 360dialog API
- **OpenAI**: AI scoring and response generation
- **Scheduling**: Appointment booking service
- **Vapi**: Voice AI integration

## Client Factory

The `createIntegrationClients()` factory provides a centralized way to initialize all clients from environment variables, eliminating code duplication across handlers.

### Usage

```typescript
import { createIntegrationClients } from '@medicalcor/integrations';

const clients = createIntegrationClients({
  source: 'whatsapp-handler',
  includeOpenAI: true,
  includeScheduling: true,
});

// Check required clients are configured
if (!clients.isConfigured(['hubspot', 'whatsapp'])) {
  logger.warn('Required clients not configured');
  return;
}

// Use clients with confidence
await clients.hubspot.syncContact({ phone, firstName });
await clients.whatsapp.sendText({ to: phone, text: response });
```

### Configuration

The factory reads from environment variables:

| Variable | Client | Required |
|----------|--------|----------|
| `HUBSPOT_ACCESS_TOKEN` | HubSpot | For CRM ops |
| `WHATSAPP_API_KEY` | WhatsApp | For messaging |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp | For messaging |
| `WHATSAPP_WEBHOOK_SECRET` | WhatsApp | Optional |
| `OPENAI_API_KEY` | OpenAI | If `includeOpenAI` |
| `SCHEDULING_SERVICE_URL` | Scheduling | If `includeScheduling` |
| `SCHEDULING_SERVICE_TOKEN` | Scheduling | If `includeScheduling` |

## Individual Clients

### HubSpot Client

```typescript
import { createHubSpotClient } from '@medicalcor/integrations/hubspot';

const hubspot = createHubSpotClient({
  accessToken: process.env.HUBSPOT_ACCESS_TOKEN,
});

// Sync a contact
const contact = await hubspot.syncContact({
  phone: '+40712345678',
  firstName: 'Ion',
  lastName: 'Popescu',
  email: 'ion@example.com',
});

// Create a task
await hubspot.createTask({
  hubspotId: contact.id,
  title: 'Follow up with lead',
  description: 'Hot lead interested in implants',
  priority: 'HIGH',
  dueDate: '2024-01-15',
});
```

### WhatsApp Client

```typescript
import { createWhatsAppClient } from '@medicalcor/integrations/whatsapp';

const whatsapp = createWhatsAppClient({
  apiKey: process.env.WHATSAPP_API_KEY,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
  webhookSecret: process.env.WHATSAPP_WEBHOOK_SECRET,
});

// Send text message
await whatsapp.sendText({
  to: '+40712345678',
  text: 'Buna ziua! Va multumim pentru mesaj.',
});

// Send template
await whatsapp.sendTemplate({
  to: '+40712345678',
  templateName: 'appointment_reminder',
  language: 'ro',
  components: [
    { type: 'body', parameters: [{ type: 'text', text: 'Dr. Popescu' }] },
  ],
});
```

### OpenAI Client

```typescript
import { createOpenAIClient } from '@medicalcor/integrations/openai';

const openai = createOpenAIClient({
  apiKey: process.env.OPENAI_API_KEY,
});

// Score a message
const scoring = await openai.scoreMessage({
  context: leadContext,
  message: incomingMessage,
});
```

## Security Features

### Input Validation
All clients validate inputs using Zod schemas:
- Phone numbers: E.164 format validation
- Messages: Length limits (4096 chars for WhatsApp)
- Configuration: Required fields checked at construction

### Request Timeouts
All HTTP requests have a 30-second timeout via AbortController to prevent hanging connections.

### Error Handling
Clients throw typed errors:
- `RateLimitError`: 429 responses with retry-after
- `ValidationError`: Invalid input data
- Network errors with context

## Testing

Mock handlers are provided for testing:

```typescript
import { setupServer } from 'msw/node';
import { handlers } from '@medicalcor/integrations/__mocks__/handlers';

const server = setupServer(...handlers);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```
