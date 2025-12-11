# Distributed Tracing Guide

## Overview

MedicalCor implements comprehensive distributed tracing using OpenTelemetry, providing:

- **End-to-end trace visibility** from webhook to response
- **P95 latency metrics** per operation
- **Error traces** immediately queryable
- **Cross-service correlation** between API and Trigger.dev workers

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Trace Flow                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  External Service          API Gateway           Trigger.dev Worker       │
│  ┌──────────────┐         ┌──────────────┐      ┌──────────────┐         │
│  │  WhatsApp    │ ──────► │  /webhooks/  │ ───► │  Task Handler │         │
│  │  Stripe      │         │  whatsapp    │      │              │         │
│  │  CRM         │         │              │      │  ┌─────────┐ │         │
│  └──────────────┘         │  ┌────────┐  │      │  │ Workflow│ │         │
│         │                 │  │Span A  │  │      │  │ Step 1  │ │         │
│   traceparent             │  │        │  │      │  └─────────┘ │         │
│   header                  │  └────────┘  │      │      │       │         │
│         │                 │      │       │      │  ┌─────────┐ │         │
│         ▼                 │      ▼       │      │  │ Workflow│ │         │
│                           │  Producer    │      │  │ Step 2  │ │         │
│                           │  Span        │      │  └─────────┘ │         │
│                           └──────────────┘      └──────────────┘         │
│                                  │                     ▲                  │
│                                  │  traceparent       │                  │
│                                  │  in payload        │                  │
│                                  └─────────────────────┘                  │
│                                                                           │
│                           OTLP Collector                                  │
│                           ┌──────────────┐                                │
│                           │   Tempo /    │                                │
│                           │   Jaeger     │                                │
│                           └──────────────┘                                │
│                                  │                                        │
│                                  ▼                                        │
│                           ┌──────────────┐                                │
│                           │   Grafana    │                                │
│                           │  Dashboard   │                                │
│                           └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Enable/disable tracing
OTEL_ENABLED=true

# OTLP endpoint for trace export
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# Service identification
OTEL_SERVICE_NAME=medicalcor-api

# Debug mode (uses SimpleSpanProcessor for immediate export)
OTEL_DEBUG=false

# Batch processing configuration
OTEL_BSP_MAX_EXPORT_BATCH_SIZE=512
OTEL_BSP_SCHEDULE_DELAY_MILLIS=5000
OTEL_BSP_EXPORT_TIMEOUT_MILLIS=30000
OTEL_BSP_MAX_QUEUE_SIZE=2048
```

### Service Names

| Service            | `OTEL_SERVICE_NAME`  |
| ------------------ | -------------------- |
| API Gateway        | `medicalcor-api`     |
| Trigger.dev Worker | `medicalcor-trigger` |
| Web App            | `medicalcor-web`     |

## Usage Patterns

### 1. Webhook Trace Context Propagation

When triggering tasks from webhooks, include trace context:

```typescript
import {
  createWebhookTraceContext,
  getTracer,
  createProducerSpan,
  endSpan,
  recordSpanError,
} from '@medicalcor/core/observability/tracing';
import { context, trace } from '@opentelemetry/api';

// In webhook handler
const tracer = getTracer('whatsapp-webhook');
const producerSpan = createProducerSpan(
  tracer,
  'trigger.dev',
  'whatsapp-message-handler',
  message.id,
  { correlationId }
);

// Get trace context to propagate
const traceContext = createWebhookTraceContext(correlationId);

// Include in task payload
const payload = {
  ...data,
  correlationId,
  ...traceContext, // Adds traceparent, tracestate
};

// Trigger within span context
await context.with(trace.setSpan(context.active(), producerSpan), async () => {
  try {
    const result = await tasks.trigger('handler', payload);
    producerSpan.setAttribute('trigger.task.handle_id', result.id);
    endSpan(producerSpan, 'ok');
    return result;
  } catch (err) {
    recordSpanError(producerSpan, err);
    throw err;
  }
});
```

### 2. Task Handler Tracing

In Trigger.dev tasks, continue the trace:

```typescript
import {
  withTaskSpan,
  TriggerSpanAttributes,
  addTriggerAttributes,
} from '../../instrumentation.js';

export const myTask = task({
  id: 'my-task',
  run: async (payload) => {
    return withTaskSpan('my-task', payload, async (span) => {
      // Add domain-specific attributes
      addTriggerAttributes(span, {
        [TriggerSpanAttributes.LEAD_ID]: payload.leadId,
        [TriggerSpanAttributes.WHATSAPP_MESSAGE_ID]: payload.messageId,
      });

      // Your task logic here
      const result = await processMessage(payload);

      span.addEvent('message_processed', {
        success: true,
        duration_ms: result.duration,
      });

      return result;
    });
  },
});
```

### 3. Workflow Step Tracing

For multi-step workflows:

```typescript
import { withWorkflowSpan } from '../../instrumentation.js';

export const scoringWorkflow = task({
  id: 'lead-scoring-workflow',
  run: async (payload, { ctx }) => {
    return withTaskSpan('lead-scoring-workflow', payload, async (parentSpan) => {
      // Step 1: Fetch lead data
      const leadData = await withWorkflowSpan(
        'lead-scoring',
        'fetch-data',
        async (span) => {
          span.setAttribute('lead.id', payload.leadId);
          return await fetchLeadData(payload.leadId);
        },
        parentSpan,
        { stepIndex: 0 }
      );

      // Step 2: Calculate score
      const score = await withWorkflowSpan(
        'lead-scoring',
        'calculate-score',
        async (span) => {
          return await calculateScore(leadData);
        },
        parentSpan,
        { stepIndex: 1 }
      );

      // Step 3: Update CRM
      await withWorkflowSpan(
        'lead-scoring',
        'update-crm',
        async (span) => {
          span.setAttribute('hubspot.contact_id', leadData.hubspotId);
          return await updateHubSpot(leadData.hubspotId, score);
        },
        parentSpan,
        { stepIndex: 2 }
      );

      return { score };
    });
  },
});
```

### 4. Database Operation Tracing

Database operations are auto-instrumented via `@opentelemetry/instrumentation-pg`.
For custom spans:

```typescript
import {
  getTracer,
  createDatabaseSpan,
  endSpan,
  recordSpanError,
} from '@medicalcor/core/observability/tracing';

const tracer = getTracer('database');

async function customQuery(query: string) {
  const span = createDatabaseSpan(tracer, 'custom_query', query);

  try {
    const result = await pool.query(query);
    span.setAttribute('db.rows_affected', result.rowCount);
    endSpan(span, 'ok');
    return result;
  } catch (error) {
    recordSpanError(span, error);
    throw error;
  }
}
```

### 5. Redis Operation Tracing

Redis operations are auto-instrumented via `@opentelemetry/instrumentation-ioredis`.
For custom spans:

```typescript
import { instrumentRedisCommand, getTracer } from '@medicalcor/core/observability/tracing';

const result = await instrumentRedisCommand('GET', 'user:123', () => redis.get('user:123'));
```

### 6. External API Call Tracing

For external service calls:

```typescript
import {
  getTracer,
  createClientSpan,
  endSpan,
  recordSpanError,
  TracingAttributes,
} from '@medicalcor/core/observability/tracing';
import { context, trace } from '@opentelemetry/api';

const tracer = getTracer('hubspot-client');

async function syncContact(contact: Contact) {
  const span = createClientSpan(tracer, 'POST', '/contacts', 'hubspot');
  span.setAttribute(TracingAttributes.MEDICALCOR_HUBSPOT_OPERATION, 'sync');

  return context.with(trace.setSpan(context.active(), span), async () => {
    try {
      const result = await fetch('https://api.hubspot.com/contacts', {
        method: 'POST',
        body: JSON.stringify(contact),
      });

      span.setAttribute(TracingAttributes.HTTP_STATUS_CODE, result.status);
      endSpan(span, result.ok ? 'ok' : 'error');
      return result;
    } catch (error) {
      recordSpanError(span, error);
      throw error;
    }
  });
}
```

## Span Attributes

### Standard Attributes

| Attribute          | Description     | Example              |
| ------------------ | --------------- | -------------------- |
| `http.method`      | HTTP method     | `POST`               |
| `http.url`         | Request URL     | `/webhooks/whatsapp` |
| `http.status_code` | Response status | `200`                |
| `http.route`       | Route pattern   | `/webhooks/:type`    |
| `db.system`        | Database type   | `postgresql`         |
| `db.operation`     | DB operation    | `SELECT`             |
| `redis.command`    | Redis command   | `GET`                |

### MedicalCor Domain Attributes

| Attribute                         | Description            | Example     |
| --------------------------------- | ---------------------- | ----------- |
| `medicalcor.correlation_id`       | Request correlation ID | `abc-123`   |
| `medicalcor.lead.id`              | Lead UUID              | `uuid`      |
| `medicalcor.lead.score`           | Lead score             | `4`         |
| `medicalcor.lead.classification`  | Lead classification    | `HOT`       |
| `medicalcor.whatsapp.message_id`  | WhatsApp message ID    | `wamid.xxx` |
| `medicalcor.hubspot.contact_id`   | HubSpot contact ID     | `12345`     |
| `medicalcor.openai.model`         | OpenAI model used      | `gpt-4o`    |
| `medicalcor.openai.tokens.input`  | Input tokens           | `500`       |
| `medicalcor.openai.tokens.output` | Output tokens          | `150`       |

### Task/Workflow Attributes

| Attribute                     | Description     | Example            |
| ----------------------------- | --------------- | ------------------ |
| `trigger.task.name`           | Task identifier | `whatsapp-handler` |
| `trigger.task.run_id`         | Task run ID     | `run_xxx`          |
| `trigger.task.attempt`        | Retry attempt   | `1`                |
| `trigger.workflow.name`       | Workflow name   | `lead-scoring`     |
| `trigger.workflow.step`       | Current step    | `calculate-score`  |
| `trigger.workflow.step_index` | Step index      | `1`                |

## Grafana Dashboard

The tracing dashboard provides:

1. **Trace Overview**
   - Total traces/hour
   - Error trace count
   - P50/P95/P99 latency gauges
   - Open circuit breakers

2. **Latency Distribution**
   - Latency by endpoint
   - External service latency

3. **Webhook & Task Tracing**
   - Webhook requests by type
   - Task executions by status
   - Task duration P95

4. **Database & Redis Tracing**
   - Query duration by type
   - Command duration by type

5. **Error Analysis**
   - Errors by category/service
   - HTTP 5xx by endpoint

6. **Trace Search**
   - TraceQL queries for Tempo
   - Error trace exploration

Access at: `/d/distributed-tracing`

## Querying Traces

### TraceQL Examples (Tempo)

```
# Find error traces from API
{resource.service.name="medicalcor-api" && status=error}

# Find slow WhatsApp webhook traces (>1s)
{resource.service.name="medicalcor-api" && span.http.route="/webhooks/whatsapp"} | duration > 1s

# Find traces with specific correlation ID
{resource.service.name=~"medicalcor.*"} | medicalcor.correlation_id = "abc-123"

# Find lead scoring traces
{name=~"trigger.task.lead-scoring.*"}

# Find traces with OpenAI calls
{span.medicalcor.openai.model != ""}
```

### Prometheus Metrics

```promql
# P95 latency by endpoint
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, path))

# Error rate by service
sum(rate(medicalcor_errors_total[5m])) by (service)

# Task execution rate
sum(rate(medicalcor_worker_tasks_total[5m])) by (task, status)
```

## Best Practices

### 1. Always propagate correlation IDs

```typescript
const correlationId = request.headers['x-correlation-id'] ?? generateCorrelationId();
```

### 2. Add domain-specific attributes

```typescript
span.setAttributes({
  'medicalcor.lead.id': lead.id,
  'medicalcor.lead.classification': lead.classification,
});
```

### 3. Record meaningful events

```typescript
span.addEvent('lead_scored', {
  score: 4,
  classification: 'HOT',
  duration_ms: 150,
});
```

### 4. Handle errors properly

```typescript
try {
  await operation();
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  throw error;
} finally {
  span.end();
}
```

### 5. Use appropriate span kinds

| Kind       | Use Case                     |
| ---------- | ---------------------------- |
| `SERVER`   | Incoming HTTP requests       |
| `CLIENT`   | Outgoing HTTP/DB/Redis calls |
| `PRODUCER` | Triggering async tasks       |
| `CONSUMER` | Processing async tasks       |
| `INTERNAL` | Internal operations          |

## Troubleshooting

### Traces not appearing

1. Check `OTEL_ENABLED=true`
2. Verify `OTEL_EXPORTER_OTLP_ENDPOINT` is correct
3. Check OTLP collector is running
4. Enable debug mode: `OTEL_DEBUG=true`

### Missing trace context propagation

1. Ensure `traceparent` is in task payload
2. Check `extractTraceContext` is called
3. Verify `withTaskSpan` wraps the handler

### High latency in trace export

1. Increase batch size: `OTEL_BSP_MAX_EXPORT_BATCH_SIZE`
2. Reduce delay: `OTEL_BSP_SCHEDULE_DELAY_MILLIS`
3. Consider sampling for high-volume endpoints

## Related Documentation

- [API Performance Dashboard](./MONITORING.md)
- [Worker Performance Dashboard](./WORKFLOWS.md)
- [Error Handling](./TROUBLESHOOTING.md)
- [OpenTelemetry Specification](https://opentelemetry.io/docs/)
