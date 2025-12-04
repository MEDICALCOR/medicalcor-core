# Fastify & Next.js Expert

> Auto-activates when: Fastify, Next.js, API routes, webhook, server, React, SSR, RSC, server components, app router

## Overview

MedicalCor uses Fastify 5 for the API gateway (`apps/api`) and Next.js 15 for the admin dashboard (`apps/web`).

## Fastify 5 (apps/api)

### Project Structure
```
apps/api/
├── src/
│   ├── routes/           # Route handlers
│   ├── plugins/          # Fastify plugins
│   ├── hooks/            # Request/response hooks
│   ├── schemas/          # JSON Schema definitions
│   └── index.ts          # Server entry point
├── package.json
└── tsconfig.json
```

### Basic Route Pattern
```typescript
import { FastifyPluginAsync } from 'fastify';

const routes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.post<{ Body: CreateLeadBody }>('/leads', {
    schema: {
      body: CreateLeadSchema,
      response: {
        201: LeadResponseSchema
      }
    }
  }, async (request, reply) => {
    const lead = await leadService.create(request.body);
    return reply.status(201).send(lead);
  });
};

export default routes;
```

### Webhook Handlers
```typescript
// WhatsApp webhook
fastify.post('/webhooks/whatsapp', {
  schema: {
    body: WhatsAppWebhookSchema
  }
}, async (request, reply) => {
  const { messages } = request.body;
  await messageQueue.publish('whatsapp.incoming', messages);
  return reply.status(200).send({ received: true });
});

// HubSpot webhook
fastify.post('/webhooks/hubspot', async (request, reply) => {
  const signature = request.headers['x-hubspot-signature'];
  if (!verifyHubspotSignature(signature, request.body)) {
    return reply.status(401).send({ error: 'Invalid signature' });
  }
  // Process webhook...
});
```

### Validation with Zod
```typescript
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const CreateLeadSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  source: z.enum(['web', 'whatsapp', 'voice', 'referral'])
});

// Convert to JSON Schema for Fastify
const jsonSchema = zodToJsonSchema(CreateLeadSchema);
```

### Error Handling
```typescript
import { logger } from '@medicalcor/core/logger';

fastify.setErrorHandler((error, request, reply) => {
  logger.error('Request failed', {
    error: error.message,
    stack: error.stack,
    url: request.url,
    method: request.method
  });

  if (error.validation) {
    return reply.status(400).send({
      error: 'Validation Error',
      details: error.validation
    });
  }

  return reply.status(500).send({
    error: 'Internal Server Error',
    requestId: request.id
  });
});
```

### Authentication Plugin
```typescript
import fp from 'fastify-plugin';

export default fp(async (fastify) => {
  fastify.decorateRequest('user', null);

  fastify.addHook('preHandler', async (request, reply) => {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const user = await authService.verifyToken(token);
    request.user = user;
  });
});
```

## Next.js 15 (apps/web)

### Project Structure
```
apps/web/
├── app/                  # App Router
│   ├── layout.tsx       # Root layout
│   ├── page.tsx         # Home page
│   ├── dashboard/       # Dashboard routes
│   ├── leads/           # Leads management
│   ├── patients/        # Patient management
│   └── api/             # API routes (if needed)
├── components/          # React components
├── lib/                 # Utility functions
├── hooks/               # Custom React hooks
└── package.json
```

### App Router Patterns

#### Server Components (default)
```typescript
// app/leads/page.tsx
import { getLeads } from '@/lib/api';

export default async function LeadsPage() {
  const leads = await getLeads();

  return (
    <div>
      <h1>Leads</h1>
      <LeadsList leads={leads} />
    </div>
  );
}
```

#### Client Components
```typescript
// components/LeadForm.tsx
'use client';

import { useState } from 'react';
import { createLead } from '@/lib/actions';

export function LeadForm() {
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setPending(true);
    await createLead(formData);
    setPending(false);
  }

  return (
    <form action={handleSubmit}>
      <input name="firstName" required />
      <input name="lastName" required />
      <input name="email" type="email" required />
      <button type="submit" disabled={pending}>
        {pending ? 'Creating...' : 'Create Lead'}
      </button>
    </form>
  );
}
```

#### Server Actions
```typescript
// lib/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export async function createLead(formData: FormData) {
  const data = {
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    email: formData.get('email')
  };

  await fetch(`${process.env.API_URL}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  revalidatePath('/leads');
  redirect('/leads');
}
```

#### Route Handlers
```typescript
// app/api/leads/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = searchParams.get('page') ?? '1';

  const leads = await fetchLeads({ page: parseInt(page) });
  return NextResponse.json(leads);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const lead = await createLead(body);
  return NextResponse.json(lead, { status: 201 });
}
```

### Data Fetching

#### With React Query (Client)
```typescript
'use client';

import { useQuery } from '@tanstack/react-query';

export function useLeads() {
  return useQuery({
    queryKey: ['leads'],
    queryFn: async () => {
      const res = await fetch('/api/leads');
      return res.json();
    }
  });
}
```

#### With Server Components
```typescript
// Direct database/API access in Server Components
async function getLeads() {
  const res = await fetch(`${process.env.API_URL}/leads`, {
    next: { revalidate: 60 } // Cache for 60 seconds
  });
  return res.json();
}
```

### Authentication
```typescript
// lib/auth.ts
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session');

  if (!token) return null;

  const session = await verifyToken(token.value);
  return session;
}

export async function requireAuth() {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}
```

## Port Configuration

- **API (Fastify)**: Port 3000
- **Web (Next.js)**: Port 3001

Run both in development:
```bash
pnpm dev  # Starts all apps via Turborepo
```
