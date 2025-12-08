# The Quantum Leap - MedicalCor Architecture v2.0

This document describes the three major architectural changes that constitute "The Quantum Leap" for MedicalCor:

1. **AI-First API Gateway with Function Calling** — 10x easier for LLMs
2. **Event-Driven Architecture with CQRS + Event Sourcing** — improved scalability
3. **Observability-First with OpenTelemetry + Grafana** — 100ms diagnostics

## 1. AI-First API Gateway

### Overview

The AI-First API Gateway makes the MedicalCor API 10x easier for LLMs to use by providing:

- OpenAI-compatible function calling format
- Anthropic/Claude-compatible tool schemas
- Natural language intent detection
- Multi-step workflow execution

### Key Components

#### Function Registry (`packages/core/src/ai-gateway/function-registry.ts`)

Central registry for AI-callable functions:

```typescript
import { FunctionRegistry, functionRegistry } from '@medicalcor/core';

// Register a custom function
registry.register(functionDefinition, inputSchema, async (args, context) => {
  // Handle function call
  return result;
});
```

#### Medical Functions (`packages/core/src/ai-gateway/medical-functions.ts`)

Pre-defined functions for medical CRM operations:

| Function               | Category     | Description                  |
| ---------------------- | ------------ | ---------------------------- |
| `score_lead`           | leads        | Analyze and score a lead     |
| `get_patient`          | patients     | Retrieve patient information |
| `update_patient`       | patients     | Update patient data          |
| `schedule_appointment` | appointments | Schedule appointments        |
| `get_available_slots`  | appointments | Find available slots         |
| `cancel_appointment`   | appointments | Cancel appointments          |
| `send_whatsapp`        | messaging    | Send WhatsApp messages       |
| `record_consent`       | consent      | Record GDPR consent          |
| `check_consent`        | consent      | Check consent status         |
| `get_lead_analytics`   | analytics    | Get lead analytics           |
| `trigger_workflow`     | workflows    | Trigger background workflows |
| `get_workflow_status`  | workflows    | Check workflow status        |

#### AI Router (`packages/core/src/ai-gateway/ai-router.ts`)

Intelligent router for processing AI requests:

```typescript
import { createAIRouter } from '@medicalcor/core';

const router = createAIRouter(registry, {
  enableIntentDetection: true,
  minIntentConfidence: 0.7,
});

// Process natural language request
const response = await router.process({
  type: 'natural',
  query: 'Programează o curățare pentru mâine',
}, context);

// Process direct function calls
const response = await router.process({
  type: 'function_call',
  calls: [{ function: 'schedule_appointment', arguments: { ... } }],
}, context);
```

### API Endpoints

| Endpoint              | Method | Description                |
| --------------------- | ------ | -------------------------- |
| `/ai/functions`       | GET    | List available functions   |
| `/ai/functions/:name` | GET    | Get function details       |
| `/ai/execute`         | POST   | Execute function calls     |
| `/ai/openai/tools`    | GET    | OpenAI-compatible tools    |
| `/ai/anthropic/tools` | GET    | Anthropic-compatible tools |
| `/ai/categories`      | GET    | Function categories        |
| `/ai/schema`          | GET    | OpenAPI schema             |

---

## 2. CQRS + Event Sourcing

### Overview

The Event-Driven Architecture with CQRS + Event Sourcing provides:

- Separate read and write paths for scalability
- Full audit trail through event sourcing
- Projections for optimized read models
- Aggregate roots for consistency

### Key Components

#### Command Bus (`packages/core/src/cqrs/command-bus.ts`)

Handles write operations:

```typescript
import { createCommandBus, defineCommand } from '@medicalcor/core';

const commandBus = createCommandBus(eventStore);

// Define a command
const CreateLead = defineCommand(
  'CreateLead',
  z.object({
    phone: z.string(),
    channel: z.enum(['whatsapp', 'voice', 'web']),
  })
);

// Send a command
const result = await commandBus.send('CreateLead', {
  phone: '+40721234567',
  channel: 'whatsapp',
});
```

#### Query Bus (`packages/core/src/cqrs/query-bus.ts`)

Handles read operations with caching:

```typescript
import { createQueryBus, defineQuery } from '@medicalcor/core';

const queryBus = createQueryBus(60000); // 60s default cache TTL

// Query with caching
const result = await queryBus.query(
  'GetLeadStats',
  {
    startDate: '2024-01-01',
    endDate: '2024-12-31',
  },
  {
    cacheKey: 'lead-stats-2024',
    cacheTtlMs: 300000, // 5 minutes
  }
);
```

#### Aggregate Roots (`packages/core/src/cqrs/aggregate.ts`)

Event-sourced domain entities:

```typescript
import { LeadAggregate, LeadRepository } from '@medicalcor/core';

// Create a new lead
const lead = LeadAggregate.create(id, phone, 'whatsapp');
lead.score(85, 'HOT');
lead.qualify('HOT');

// Save to event store
await repository.save(lead);

// Load from event store (replays all events)
const loadedLead = await repository.getById(id);
```

#### Projections (`packages/core/src/cqrs/projections.ts`)

Read models built from events:

```typescript
import { defineProjection, createProjectionManager } from '@medicalcor/core';

const manager = createProjectionManager();

// Built-in projections:
// - LeadStatsProjection: Lead statistics
// - PatientActivityProjection: Recent patient activities
// - DailyMetricsProjection: Daily metrics aggregation

// Get projection state
const stats = manager.get<LeadStatsState>('lead-stats');
console.log(stats?.state.conversionRate);
```

### Event Types

| Event           | Aggregate | Description                |
| --------------- | --------- | -------------------------- |
| `LeadCreated`   | Lead      | New lead created           |
| `LeadScored`    | Lead      | Lead scored by AI          |
| `LeadQualified` | Lead      | Lead qualification changed |
| `LeadAssigned`  | Lead      | Lead assigned to user      |
| `LeadConverted` | Lead      | Lead converted to patient  |
| `LeadLost`      | Lead      | Lead marked as lost        |

---

## 3. Observability-First

### Overview

Observability-First with OpenTelemetry + Grafana provides:

- Prometheus-compatible metrics
- Distributed tracing with OpenTelemetry
- Auto-instrumentation for HTTP, DB, external services
- 100ms diagnostic snapshots
- Pre-configured Grafana dashboards

### Key Components

#### Metrics (`packages/core/src/observability/metrics.ts`)

Prometheus-compatible metrics:

```typescript
import {
  leadsCreated,
  leadsConverted,
  httpRequestDuration,
  commandsExecuted,
} from '@medicalcor/core';

// Increment counter
leadsCreated.inc({ channel: 'whatsapp', source: 'organic' });

// Record histogram
const timer = httpRequestDuration.startTimer({ method: 'POST', path: '/api/leads' });
// ... do work ...
timer(); // Records duration

// Get Prometheus text format
import { getPrometheusMetrics } from '@medicalcor/core';
const metrics = getPrometheusMetrics();
```

#### Auto-Instrumentation (`packages/core/src/observability/instrumentation.ts`)

Automatic tracing for Fastify:

```typescript
import { instrumentFastify, instrumentExternalCall } from '@medicalcor/core';

// Instrument Fastify
instrumentFastify(fastify, {
  serviceName: 'medicalcor-api',
  ignorePaths: ['/health', '/metrics'],
});

// Wrap external service calls
const tracedFetch = instrumentExternalCall(fetch, {
  service: 'hubspot',
  operation: 'createContact',
});
```

#### Diagnostics (`packages/core/src/observability/diagnostics.ts`)

100ms diagnostic snapshots:

```typescript
import { diagnostics, lookupTrace, searchTraces } from '@medicalcor/core';

// Get full diagnostic snapshot (< 100ms)
const snapshot = await diagnostics.getSnapshot();

// Quick health check (< 10ms)
const health = diagnostics.getQuickHealth();

// Lookup trace by ID
const trace = lookupTrace('trace-123');

// Search traces
const slowTraces = searchTraces({
  minDurationMs: 1000,
  status: 'error',
});
```

### Metrics Available

| Metric                                    | Type      | Description            |
| ----------------------------------------- | --------- | ---------------------- |
| `http_requests_total`                     | Counter   | Total HTTP requests    |
| `http_request_duration_seconds`           | Histogram | Request latency        |
| `medicalcor_leads_created_total`          | Counter   | Leads created          |
| `medicalcor_leads_converted_total`        | Counter   | Leads converted        |
| `medicalcor_appointments_scheduled_total` | Counter   | Appointments scheduled |
| `medicalcor_commands_executed_total`      | Counter   | Commands executed      |
| `medicalcor_queries_executed_total`       | Counter   | Queries executed       |
| `medicalcor_ai_function_calls_total`      | Counter   | AI function calls      |

### Diagnostics Endpoints

| Endpoint                  | Description              |
| ------------------------- | ------------------------ |
| `/metrics`                | Prometheus metrics       |
| `/metrics/json`           | JSON metrics             |
| `/diagnostics`            | Full diagnostic snapshot |
| `/diagnostics/quick`      | Quick health check       |
| `/diagnostics/health`     | Detailed health checks   |
| `/diagnostics/traces/:id` | Lookup trace             |
| `/diagnostics/traces`     | Search traces            |

### Grafana Dashboard

Import the dashboard from `infra/grafana/dashboards/medicalcor-overview.json`:

- Business KPIs (leads, conversions)
- HTTP latency percentiles (p50, p95, p99)
- AI Gateway function calls
- CQRS metrics (commands, queries, cache hit rate)
- External service health

---

## Quick Start

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Development Environment

```bash
# Start with monitoring stack
docker compose --profile monitoring up -d

# Start API server
pnpm dev:api
```

### 3. Access Services

- **API**: http://localhost:3000
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin)

### 4. Test AI Gateway

```bash
# List available functions
curl http://localhost:3000/ai/functions

# Get OpenAI-compatible tools
curl http://localhost:3000/ai/openai/tools

# Execute a function
curl -X POST http://localhost:3000/ai/execute \
  -H "Content-Type: application/json" \
  -d '{
    "type": "function_call",
    "calls": [{
      "function": "score_lead",
      "arguments": {
        "phone": "+40721234567",
        "channel": "whatsapp"
      }
    }]
  }'
```

### 5. Check Diagnostics

```bash
# Full diagnostic snapshot
curl http://localhost:3000/diagnostics

# Prometheus metrics
curl http://localhost:3000/metrics
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MedicalCor API                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │   AI Gateway    │    │  CQRS/ES Bus    │    │  Observability  │  │
│  │                 │    │                 │    │                 │  │
│  │  - Functions    │    │  - Command Bus  │    │  - Metrics      │  │
│  │  - Router       │    │  - Query Bus    │    │  - Tracing      │  │
│  │  - Intent       │    │  - Aggregates   │    │  - Diagnostics  │  │
│  │                 │    │  - Projections  │    │                 │  │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘  │
│           │                      │                      │           │
│           └──────────────────────┼──────────────────────┘           │
│                                  │                                   │
│  ┌───────────────────────────────┴───────────────────────────────┐  │
│  │                        Event Store                             │  │
│  │                     (PostgreSQL/JSONB)                         │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     External Services                                │
├─────────────────────────────────────────────────────────────────────┤
│  WhatsApp (360dialog)  │  HubSpot  │  OpenAI  │  Trigger.dev        │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                     Monitoring Stack                                 │
├─────────────────────────────────────────────────────────────────────┤
│      Prometheus        │       Grafana        │     OTLP Collector   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Migration Guide

### From v1.0 to v2.0 (Quantum Leap)

1. **AI Gateway**: No breaking changes. New endpoints available at `/ai/*`

2. **CQRS**: Existing code continues to work. To adopt CQRS:
   - Replace direct DB writes with commands
   - Replace direct DB reads with queries
   - Events are automatically stored

3. **Observability**: Automatic instrumentation is opt-in:
   ```typescript
   instrumentFastify(fastify);
   ```

---

## Performance Targets

| Metric              | Target  | Measurement                   |
| ------------------- | ------- | ----------------------------- |
| Diagnostic snapshot | < 100ms | `/diagnostics` endpoint       |
| Quick health check  | < 10ms  | `/diagnostics/quick` endpoint |
| AI function call    | < 500ms | p95 latency                   |
| Command execution   | < 100ms | p95 latency                   |
| Query execution     | < 50ms  | p95 latency (cached)          |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
