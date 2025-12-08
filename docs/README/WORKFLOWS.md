# Trigger.dev Workflows Guide

Documentation for MedicalCor's durable workflow system powered by Trigger.dev.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tasks](#tasks)
- [Workflows](#workflows)
- [Cron Jobs](#cron-jobs)
- [Configuration](#configuration)
- [Monitoring](#monitoring)
- [Troubleshooting](#troubleshooting)

---

## Overview

MedicalCor uses [Trigger.dev](https://trigger.dev) for durable workflow execution. This provides:

- **Reliability**: Automatic retries with exponential backoff
- **Durability**: Workflows survive server restarts
- **Visibility**: Full execution history and debugging
- **Scalability**: Automatic scaling based on queue depth

### Why Trigger.dev?

| Challenge                            | Solution                                                    |
| ------------------------------------ | ----------------------------------------------------------- |
| Webhook handlers must return quickly | Tasks process asynchronously after immediate acknowledgment |
| External API failures                | Automatic retries with configurable backoff                 |
| Complex multi-step operations        | Durable workflows maintain state across steps               |
| Scheduled operations                 | Built-in cron job support                                   |
| Debugging distributed systems        | Full execution traces and logs                              |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Webhook Flow                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  External Service                                                │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   API       │───▶│  Task       │───▶│  Trigger.dev│         │
│  │  (Fastify)  │    │  Trigger    │    │   Cloud     │         │
│  └─────────────┘    └─────────────┘    └──────┬──────┘         │
│       │                                        │                 │
│       │ 200 OK                                │                 │
│       │ (immediate)                           ▼                 │
│       │                               ┌─────────────┐           │
│       │                               │   Worker    │           │
│       │                               │  (Task)     │           │
│       │                               └──────┬──────┘           │
│       │                                      │                  │
│       │                                      ▼                  │
│       │                               ┌─────────────┐           │
│       │                               │ Integrations│           │
│       │                               │ (HubSpot,   │           │
│       │                               │  OpenAI)    │           │
│       │                               └─────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Project Structure

```
apps/trigger/
├── src/
│   ├── tasks/              # Individual task handlers
│   │   ├── process-whatsapp-message.ts
│   │   ├── process-voice-call.ts
│   │   ├── score-lead.ts
│   │   └── sync-hubspot.ts
│   ├── workflows/          # Multi-step workflows
│   │   ├── lead-scoring-workflow.ts
│   │   ├── appointment-reminder-workflow.ts
│   │   └── consent-renewal-workflow.ts
│   ├── jobs/               # Scheduled cron jobs
│   │   └── cron-jobs.ts
│   └── index.ts            # Task exports
├── trigger.config.ts       # Trigger.dev configuration
└── package.json
```

---

## Tasks

Tasks are the basic unit of work. Each task handles a specific operation.

### Available Tasks

| Task                        | Description                       | Trigger             |
| --------------------------- | --------------------------------- | ------------------- |
| `process-whatsapp-message`  | Handle incoming WhatsApp messages | WhatsApp webhook    |
| `process-voice-call`        | Process completed voice calls     | Twilio/Vapi webhook |
| `score-lead`                | AI-powered lead scoring           | Message processing  |
| `sync-hubspot-contact`      | Create/update HubSpot contact     | Lead scored         |
| `send-whatsapp-message`     | Send outbound WhatsApp message    | Various workflows   |
| `send-appointment-reminder` | Send appointment reminder         | Cron job            |

### Task Structure

```typescript
// apps/trigger/src/tasks/score-lead.ts
import { task } from '@trigger.dev/sdk/v3';
import { scoringService } from '@medicalcor/domain';
import { z } from 'zod';

const ScoreLeadPayloadSchema = z.object({
  phone: z.string(),
  message: z.string(),
  channel: z.enum(['whatsapp', 'voice', 'web']),
  correlationId: z.string().optional(),
});

export const scoreLeadTask = task({
  id: 'score-lead',
  retry: {
    maxAttempts: 3,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30000,
    factor: 2,
  },
  run: async (payload: z.infer<typeof ScoreLeadPayloadSchema>) => {
    // Validate payload
    const validated = ScoreLeadPayloadSchema.parse(payload);

    // Score the lead
    const result = await scoringService.scoreLead({
      phone: validated.phone,
      message: validated.message,
      channel: validated.channel,
    });

    return {
      score: result.score,
      classification: result.classification,
      confidence: result.confidence,
    };
  },
});
```

### Triggering Tasks

From the API:

```typescript
// apps/api/src/routes/webhooks/whatsapp.ts
import { tasks } from '@trigger.dev/sdk/v3';

app.post('/webhooks/whatsapp', async (request, reply) => {
  // Validate webhook signature
  // ...

  // Trigger task asynchronously
  await tasks.trigger('process-whatsapp-message', {
    phone: message.from,
    text: message.text.body,
    messageId: message.id,
    timestamp: message.timestamp,
  });

  // Return immediately
  return reply.send({ success: true });
});
```

---

## Workflows

Workflows are multi-step operations that maintain state across steps.

### Lead Scoring Workflow

```typescript
// apps/trigger/src/workflows/lead-scoring-workflow.ts
import { task } from '@trigger.dev/sdk/v3';

export const leadScoringWorkflow = task({
  id: 'lead-scoring-workflow',
  run: async (payload) => {
    // Step 1: Score the lead
    const scoringResult = await scoreLeadTask.triggerAndWait({
      phone: payload.phone,
      message: payload.message,
      channel: payload.channel,
    });

    // Step 2: Sync to HubSpot
    const hubspotResult = await syncHubspotContactTask.triggerAndWait({
      phone: payload.phone,
      score: scoringResult.score,
      classification: scoringResult.classification,
    });

    // Step 3: Send notification if HOT lead
    if (scoringResult.classification === 'HOT') {
      await sendNotificationTask.trigger({
        type: 'hot_lead',
        phone: payload.phone,
        score: scoringResult.score,
      });
    }

    return {
      scored: true,
      synced: hubspotResult.success,
      notified: scoringResult.classification === 'HOT',
    };
  },
});
```

### Appointment Reminder Workflow

```typescript
// apps/trigger/src/workflows/appointment-reminder-workflow.ts
import { task, wait } from '@trigger.dev/sdk/v3';

export const appointmentReminderWorkflow = task({
  id: 'appointment-reminder-workflow',
  run: async (payload) => {
    const { appointmentId, appointmentTime, patientPhone } = payload;

    // Calculate wait times
    const now = new Date();
    const appointmentDate = new Date(appointmentTime);
    const reminder24h = new Date(appointmentDate.getTime() - 24 * 60 * 60 * 1000);
    const reminder2h = new Date(appointmentDate.getTime() - 2 * 60 * 60 * 1000);

    // Wait until 24h before
    if (reminder24h > now) {
      await wait.until({ date: reminder24h });
    }

    // Send 24h reminder
    await sendWhatsappMessageTask.trigger({
      phone: patientPhone,
      template: 'appointment_reminder_24h',
      params: {
        appointmentTime: appointmentDate.toLocaleString(),
      },
    });

    // Wait until 2h before
    if (reminder2h > now) {
      await wait.until({ date: reminder2h });
    }

    // Send 2h reminder
    await sendWhatsappMessageTask.trigger({
      phone: patientPhone,
      template: 'appointment_reminder_2h',
      params: {
        appointmentTime: appointmentDate.toLocaleString(),
      },
    });

    return { reminders_sent: 2 };
  },
});
```

---

## Cron Jobs

Scheduled jobs that run at specified intervals.

### Available Cron Jobs

| Schedule    | Job                     | Description                          |
| ----------- | ----------------------- | ------------------------------------ |
| `0 9 * * *` | `daily-recall-check`    | Find patients due for recall         |
| `0 * * * *` | `hourly-reminder-check` | Check for upcoming appointments      |
| `0 2 * * *` | `stale-lead-refresh`    | Re-score leads not updated in 7 days |
| `0 8 * * 1` | `weekly-report`         | Generate weekly analytics report     |
| `0 3 * * *` | `consent-expiry-check`  | Check for expiring consents          |

### Cron Job Implementation

```typescript
// apps/trigger/src/jobs/cron-jobs.ts
import { schedules } from '@trigger.dev/sdk/v3';

// Daily recall check at 9 AM
export const dailyRecallCheck = schedules.task({
  id: 'daily-recall-check',
  cron: '0 9 * * *',
  run: async () => {
    const patientsNeedingRecall = await findPatientsForRecall();

    for (const patient of patientsNeedingRecall) {
      await sendRecallReminderTask.trigger({
        patientId: patient.id,
        phone: patient.phone,
        lastVisit: patient.lastVisit,
      });
    }

    return { processed: patientsNeedingRecall.length };
  },
});

// Hourly appointment reminder check
export const hourlyReminderCheck = schedules.task({
  id: 'hourly-reminder-check',
  cron: '0 * * * *',
  run: async () => {
    const upcomingAppointments = await findUpcomingAppointments({
      windowStart: new Date(),
      windowEnd: new Date(Date.now() + 25 * 60 * 60 * 1000), // 25 hours
    });

    for (const appointment of upcomingAppointments) {
      if (!appointment.reminder24hSent) {
        await appointmentReminderWorkflow.trigger({
          appointmentId: appointment.id,
          appointmentTime: appointment.scheduledAt,
          patientPhone: appointment.patientPhone,
        });
      }
    }

    return { scheduled: upcomingAppointments.length };
  },
});

// Consent expiry check at 3 AM
export const consentExpiryCheck = schedules.task({
  id: 'consent-expiry-check',
  cron: '0 3 * * *',
  run: async () => {
    const expiringConsents = await findExpiringConsents({
      daysUntilExpiry: 30,
    });

    for (const consent of expiringConsents) {
      await consentRenewalWorkflow.trigger({
        phone: consent.phone,
        consentType: consent.type,
        expiresAt: consent.expiresAt,
      });
    }

    return { processed: expiringConsents.length };
  },
});
```

---

## Configuration

### trigger.config.ts

```typescript
// apps/trigger/trigger.config.ts
import { defineConfig } from '@trigger.dev/sdk/v3';

export default defineConfig({
  project: 'medicalcor-core',
  logLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 3,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 30000,
      factor: 2,
    },
  },
  machine: 'small-1x', // or 'medium-1x', 'large-1x'
});
```

### Environment Variables

```bash
# Trigger.dev credentials
TRIGGER_API_KEY=tr_xxx        # From Trigger.dev dashboard
TRIGGER_API_URL=https://api.trigger.dev

# Integration credentials (passed to tasks)
HUBSPOT_ACCESS_TOKEN=xxx
WHATSAPP_API_KEY=xxx
OPENAI_API_KEY=xxx
```

### Deployment

```bash
# Navigate to trigger app
cd apps/trigger

# Deploy to Trigger.dev cloud
npx trigger.dev@latest deploy

# Or using pnpm script
pnpm deploy
```

---

## Monitoring

### Trigger.dev Dashboard

Access at [cloud.trigger.dev](https://cloud.trigger.dev):

- **Runs**: View all task executions
- **Schedules**: Monitor cron job schedules
- **Logs**: Full execution logs
- **Metrics**: Throughput, latency, error rates

### Key Metrics to Monitor

| Metric            | Alert Threshold | Description                 |
| ----------------- | --------------- | --------------------------- |
| Task failure rate | > 5%            | Tasks failing after retries |
| Queue depth       | > 1000          | Backlog of pending tasks    |
| P95 latency       | > 30s           | Slow task execution         |
| Cron job missed   | Any             | Scheduled job didn't run    |

### Integration with Prometheus

Tasks can emit custom metrics:

```typescript
import { metrics } from '@medicalcor/core';

export const scoreLeadTask = task({
  id: 'score-lead',
  run: async (payload) => {
    const startTime = Date.now();

    try {
      const result = await scoringService.scoreLead(payload);

      metrics.leadScoringCounter.inc({
        classification: result.classification,
        fallback: result.fallbackUsed ? 'true' : 'false',
      });

      metrics.leadScoringDuration.observe({ model: result.model }, (Date.now() - startTime) / 1000);

      return result;
    } catch (error) {
      metrics.leadScoringErrors.inc({ error: error.code });
      throw error;
    }
  },
});
```

---

## Troubleshooting

### Task Not Running

1. **Check Trigger.dev dashboard** for errors
2. **Verify API key** is set correctly
3. **Check task is exported** in `src/index.ts`
4. **Verify deployment** completed successfully

### Task Failing

1. **Check execution logs** in dashboard
2. **Review retry attempts** and errors
3. **Verify external services** are available
4. **Check payload validation** with Zod schema

### Cron Job Missed

1. **Check schedule syntax** (use crontab.guru)
2. **Verify timezone** configuration
3. **Check for overlapping runs**
4. **Review Trigger.dev status page**

### Performance Issues

1. **Increase machine size** in config
2. **Optimize external API calls**
3. **Use batch processing** for large datasets
4. **Consider parallel task execution**

### Debug Mode

```typescript
// Enable detailed logging
import { logger } from '@trigger.dev/sdk/v3';

logger.setLogLevel('debug');
```

---

## Best Practices

### Idempotency

Always design tasks to be idempotent:

```typescript
export const syncHubspotTask = task({
  id: 'sync-hubspot',
  run: async (payload) => {
    // Use idempotency key to prevent duplicates
    const idempotencyKey = `hubspot:${payload.phone}:${payload.timestamp}`;

    const existing = await redis.get(idempotencyKey);
    if (existing) {
      return { skipped: true, reason: 'duplicate' };
    }

    // Process...
    await redis.setex(idempotencyKey, 86400, '1');

    return { success: true };
  },
});
```

### Error Handling

Throw errors to trigger retries, return errors for non-retryable failures:

```typescript
export const externalApiTask = task({
  id: 'external-api',
  run: async (payload) => {
    try {
      return await externalApi.call(payload);
    } catch (error) {
      if (error.status === 429) {
        // Rate limited - retry
        throw error;
      }
      if (error.status === 400) {
        // Bad request - don't retry
        return { error: 'invalid_payload', details: error.message };
      }
      throw error;
    }
  },
});
```

### Payload Validation

Always validate payloads with Zod:

```typescript
const PayloadSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  message: z.string().max(4096),
  timestamp: z.string().datetime(),
});

export const myTask = task({
  id: 'my-task',
  run: async (payload) => {
    const validated = PayloadSchema.parse(payload);
    // Use validated payload
  },
});
```

---

## Further Reading

- [Trigger.dev Documentation](https://trigger.dev/docs)
- [API Reference](./API_REFERENCE.md)
- [Monitoring Guide](./MONITORING.md)
- [Configuration Guide](./CONFIGURATION.md)
