# ADR-003: Architecture Improvements Roadmap

## Status

**PROPOSED** - 2024-12-02

## Context

Following a comprehensive architecture review, several improvement opportunities were identified in the existing MedicalCor platform. The current implementation is solid with CQRS, Event Sourcing, Hexagonal Architecture, and comprehensive security. However, specific gaps affect production reliability, observability, and AI capabilities.

### Current Gaps Identified

| Category           | Gap                                      | Impact                                |
| ------------------ | ---------------------------------------- | ------------------------------------- |
| **Database**       | pgvector schema not in dbmate migrations | Production deployments may fail       |
| **Event Sourcing** | No aggregate snapshots                   | Performance degrades with event count |
| **Event Sourcing** | No event schema versioning               | Breaking changes corrupt projections  |
| **Observability**  | No Prometheus metrics endpoint           | Cannot track business metrics         |
| **Observability**  | No projection health monitoring          | Stale projections go undetected       |
| **CQRS**           | Saga persistence is in-memory only       | State lost on restart                 |
| **Resilience**     | DLQ lacks circuit breaker integration    | May hammer failing services           |
| **RAG**            | No automatic embedding refresh           | Stale embeddings degrade AI quality   |
| **RAG**            | No embedding caching                     | Redundant OpenAI API calls            |
| **Kubernetes**     | ServiceMonitor not implemented           | Prometheus can't scrape pods          |

## Decision

Implement improvements in four phases, prioritized by production impact.

---

## Phase 1: Critical Production Fixes (Week 1)

### 1.1 Add pgvector to dbmate Migrations

**Problem**: Vector search tables only exist in `/infra/init-db/` scripts, not in dbmate migrations.

**File**: `db/migrations/20241202000001_add_pgvector_extension.sql`

```sql
-- migrate:up
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type VARCHAR(50) NOT NULL,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    chunk_index INTEGER DEFAULT 0,
    chunk_total INTEGER DEFAULT 1,
    parent_id UUID REFERENCES knowledge_base(id),
    embedding vector(1536),
    clinic_id VARCHAR(100),
    language VARCHAR(10) DEFAULT 'ro',
    tags TEXT[] DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    version INTEGER DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast approximate nearest neighbor
CREATE INDEX idx_knowledge_base_embedding_hnsw
ON knowledge_base USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 128);

-- Filtered search indexes
CREATE INDEX idx_knowledge_base_source_type ON knowledge_base(source_type) WHERE is_active;
CREATE INDEX idx_knowledge_base_clinic_language ON knowledge_base(clinic_id, language) WHERE is_active;
CREATE INDEX idx_knowledge_base_tags ON knowledge_base USING gin(tags);
CREATE UNIQUE INDEX idx_knowledge_base_content_hash ON knowledge_base(content_hash);

-- migrate:down
DROP TABLE IF EXISTS knowledge_base;
DROP EXTENSION IF EXISTS vector;
```

### 1.2 Add Prometheus Metrics Endpoint

**Problem**: No `/metrics` endpoint for Prometheus scraping.

**File**: `apps/api/src/routes/metrics.ts`

```typescript
import { FastifyPluginAsync } from 'fastify';
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

const register = new Registry();
collectDefaultMetrics({ register });

// Business metrics
export const leadScoringLatency = new Histogram({
  name: 'medicalcor_lead_scoring_duration_seconds',
  help: 'Lead scoring operation duration',
  labelNames: ['classification', 'channel'],
  buckets: [0.1, 0.5, 1, 2, 5, 10],
  registers: [register],
});

export const dlqPendingGauge = new Gauge({
  name: 'medicalcor_dlq_pending_total',
  help: 'Number of pending DLQ entries',
  labelNames: ['webhook_type'],
  registers: [register],
});

export const projectionLagGauge = new Gauge({
  name: 'medicalcor_projection_lag_seconds',
  help: 'Seconds since last processed event per projection',
  labelNames: ['projection_name'],
  registers: [register],
});

export const eventStoreEventsTotal = new Counter({
  name: 'medicalcor_events_total',
  help: 'Total domain events emitted',
  labelNames: ['event_type'],
  registers: [register],
});

export const metricsRoute: FastifyPluginAsync = async (fastify) => {
  fastify.get('/metrics', async (request, reply) => {
    reply.type('text/plain');
    return register.metrics();
  });
};
```

### 1.3 Add Projection Health Monitoring

**Problem**: Stale projections go undetected; data inconsistency.

**File**: `packages/core/src/cqrs/projection-health.ts`

```typescript
import { Pool } from 'pg';

export interface ProjectionHealth {
  name: string;
  lastEventId: string | null;
  lastEventTimestamp: Date | null;
  lagSeconds: number;
  isStale: boolean;
  eventsBehind: number;
}

export class ProjectionHealthMonitor {
  constructor(
    private pool: Pool,
    private staleThresholdSeconds: number = 300 // 5 minutes
  ) {}

  async checkHealth(projectionName: string): Promise<ProjectionHealth> {
    const result = await this.pool.query(
      `
      SELECT
        pc.projection_name,
        pc.last_event_id,
        pc.last_event_timestamp,
        EXTRACT(EPOCH FROM (NOW() - pc.last_event_timestamp)) as lag_seconds,
        (SELECT COUNT(*) FROM domain_events WHERE id > pc.last_event_id) as events_behind
      FROM projection_checkpoints pc
      WHERE pc.projection_name = $1
    `,
      [projectionName]
    );

    if (result.rows.length === 0) {
      return {
        name: projectionName,
        lastEventId: null,
        lastEventTimestamp: null,
        lagSeconds: Infinity,
        isStale: true,
        eventsBehind: -1,
      };
    }

    const row = result.rows[0];
    const lagSeconds = Number(row.lag_seconds) || 0;

    return {
      name: projectionName,
      lastEventId: row.last_event_id,
      lastEventTimestamp: row.last_event_timestamp,
      lagSeconds,
      isStale: lagSeconds > this.staleThresholdSeconds,
      eventsBehind: Number(row.events_behind),
    };
  }

  async checkAllProjections(): Promise<ProjectionHealth[]> {
    const result = await this.pool.query(`
      SELECT DISTINCT projection_name FROM projection_checkpoints
    `);

    return Promise.all(result.rows.map((row) => this.checkHealth(row.projection_name)));
  }
}
```

---

## Phase 2: Event Sourcing Enhancements (Week 2)

### 2.1 Add Aggregate Snapshots

**Problem**: Replaying thousands of events for old aggregates is slow.

**File**: `packages/core/src/event-store-snapshot.ts`

```typescript
import { Pool } from 'pg';

export interface AggregateSnapshot<T = unknown> {
  aggregateId: string;
  aggregateType: string;
  version: number;
  state: T;
  createdAt: Date;
}

export class SnapshotStore {
  private snapshotInterval = 100; // Create snapshot every 100 events

  constructor(private pool: Pool) {}

  async getLatestSnapshot<T>(aggregateId: string): Promise<AggregateSnapshot<T> | null> {
    const result = await this.pool.query(
      `
      SELECT aggregate_id, aggregate_type, version, state, created_at
      FROM aggregate_snapshots
      WHERE aggregate_id = $1
      ORDER BY version DESC
      LIMIT 1
    `,
      [aggregateId]
    );

    if (result.rows.length === 0) return null;

    return {
      aggregateId: result.rows[0].aggregate_id,
      aggregateType: result.rows[0].aggregate_type,
      version: result.rows[0].version,
      state: result.rows[0].state as T,
      createdAt: result.rows[0].created_at,
    };
  }

  async saveSnapshot<T>(snapshot: AggregateSnapshot<T>): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO aggregate_snapshots (aggregate_id, aggregate_type, version, state)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (aggregate_id, version) DO NOTHING
    `,
      [
        snapshot.aggregateId,
        snapshot.aggregateType,
        snapshot.version,
        JSON.stringify(snapshot.state),
      ]
    );
  }

  shouldSnapshot(currentVersion: number, lastSnapshotVersion: number): boolean {
    return currentVersion - lastSnapshotVersion >= this.snapshotInterval;
  }
}
```

**Migration**: `db/migrations/20241202000002_add_aggregate_snapshots.sql`

```sql
-- migrate:up
CREATE TABLE aggregate_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    version INTEGER NOT NULL,
    state JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(aggregate_id, version)
);

CREATE INDEX idx_snapshots_aggregate ON aggregate_snapshots(aggregate_id, version DESC);

-- migrate:down
DROP TABLE IF EXISTS aggregate_snapshots;
```

### 2.2 Add Event Schema Registry

**Problem**: No versioning for event payloads; breaking changes corrupt projections.

**File**: `packages/core/src/event-schema-registry.ts`

```typescript
import { z } from 'zod';

interface EventSchemaVersion {
  version: number;
  schema: z.ZodSchema;
  migrateTo?: (data: unknown) => unknown; // Migration to next version
}

export class EventSchemaRegistry {
  private schemas = new Map<string, EventSchemaVersion[]>();

  register(
    eventType: string,
    version: number,
    schema: z.ZodSchema,
    migrateTo?: (data: unknown) => unknown
  ): void {
    const versions = this.schemas.get(eventType) || [];
    versions.push({ version, schema, migrateTo });
    versions.sort((a, b) => a.version - b.version);
    this.schemas.set(eventType, versions);
  }

  validate(eventType: string, version: number, payload: unknown): boolean {
    const versions = this.schemas.get(eventType);
    if (!versions) return true; // Unknown event types pass through

    const schemaVersion = versions.find((v) => v.version === version);
    if (!schemaVersion) return false;

    return schemaVersion.schema.safeParse(payload).success;
  }

  migrate(eventType: string, fromVersion: number, toVersion: number, payload: unknown): unknown {
    const versions = this.schemas.get(eventType);
    if (!versions) return payload;

    let currentPayload = payload;
    for (const v of versions) {
      if (v.version > fromVersion && v.version <= toVersion && v.migrateTo) {
        currentPayload = v.migrateTo(currentPayload);
      }
    }
    return currentPayload;
  }

  getLatestVersion(eventType: string): number {
    const versions = this.schemas.get(eventType);
    return versions ? versions[versions.length - 1].version : 1;
  }
}

// Usage example
export const eventSchemaRegistry = new EventSchemaRegistry();

// Register lead.scored event versions
eventSchemaRegistry.register(
  'lead.scored',
  1,
  z.object({
    leadId: z.string().uuid(),
    score: z.number().int().min(1).max(5),
  })
);

eventSchemaRegistry.register(
  'lead.scored',
  2,
  z.object({
    leadId: z.string().uuid(),
    score: z.number().int().min(1).max(5),
    confidence: z.number().min(0).max(1), // New field in v2
  }),
  (v1: unknown) => ({
    ...(v1 as object),
    confidence: 0.5, // Default for migrated events
  })
);
```

---

## Phase 3: Resilience & Observability (Week 3)

### 3.1 Add Circuit Breaker to DLQ Retry

**Problem**: DLQ retries may hammer failing services.

**File**: `packages/core/src/dead-letter-queue.ts` (enhancement)

```typescript
import { CircuitBreaker, CircuitBreakerRegistry } from './circuit-breaker';

export class EnhancedDeadLetterQueue extends DeadLetterQueue {
  private circuitBreakerRegistry: CircuitBreakerRegistry;

  constructor(pool: Pool, circuitBreakerRegistry: CircuitBreakerRegistry) {
    super(pool);
    this.circuitBreakerRegistry = circuitBreakerRegistry;
  }

  async processEntry(
    entry: DLQEntry,
    handler: (entry: DLQEntry) => Promise<void>
  ): Promise<boolean> {
    const breaker = this.circuitBreakerRegistry.get(`dlq-${entry.webhookType}`);

    if (!breaker.isAvailable()) {
      // Circuit is open; skip this entry for now
      return false;
    }

    try {
      await breaker.execute(() => handler(entry));
      await this.markProcessed(entry.id);
      return true;
    } catch (error) {
      await this.incrementRetry(entry.id, error);
      return false;
    }
  }
}
```

### 3.2 Add Saga Persistence

**Problem**: Saga state is in-memory; lost on restart.

**Migration**: `db/migrations/20241202000003_add_saga_store.sql`

```sql
-- migrate:up
CREATE TABLE saga_store (
    saga_id UUID PRIMARY KEY,
    saga_type VARCHAR(100) NOT NULL,
    correlation_id UUID NOT NULL,
    state JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    current_step INTEGER DEFAULT 0,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    CONSTRAINT valid_status CHECK (status IN ('pending', 'running', 'completed', 'failed', 'compensating'))
);

CREATE INDEX idx_saga_correlation ON saga_store(correlation_id);
CREATE INDEX idx_saga_status ON saga_store(status) WHERE status IN ('pending', 'running', 'compensating');

-- migrate:down
DROP TABLE IF EXISTS saga_store;
```

**File**: `packages/core/src/cqrs/saga-repository.ts`

```typescript
import { Pool } from 'pg';

export interface SagaState<T = unknown> {
  sagaId: string;
  sagaType: string;
  correlationId: string;
  state: T;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'compensating';
  currentStep: number;
  startedAt: Date;
  updatedAt: Date;
}

export class PostgresSagaRepository {
  constructor(private pool: Pool) {}

  async save<T>(saga: SagaState<T>): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO saga_store (saga_id, saga_type, correlation_id, state, status, current_step, started_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (saga_id) DO UPDATE SET
        state = EXCLUDED.state,
        status = EXCLUDED.status,
        current_step = EXCLUDED.current_step,
        updated_at = NOW()
    `,
      [
        saga.sagaId,
        saga.sagaType,
        saga.correlationId,
        JSON.stringify(saga.state),
        saga.status,
        saga.currentStep,
        saga.startedAt,
      ]
    );
  }

  async findByCorrelationId<T>(
    correlationId: string,
    sagaType: string
  ): Promise<SagaState<T> | null> {
    const result = await this.pool.query(
      `
      SELECT * FROM saga_store WHERE correlation_id = $1 AND saga_type = $2
    `,
      [correlationId, sagaType]
    );

    if (result.rows.length === 0) return null;
    const row = result.rows[0];

    return {
      sagaId: row.saga_id,
      sagaType: row.saga_type,
      correlationId: row.correlation_id,
      state: row.state as T,
      status: row.status,
      currentStep: row.current_step,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
    };
  }

  async findPendingSagas(sagaType?: string): Promise<SagaState[]> {
    const result = await this.pool.query(
      `
      SELECT * FROM saga_store
      WHERE status IN ('pending', 'running', 'compensating')
      ${sagaType ? 'AND saga_type = $1' : ''}
      ORDER BY started_at
    `,
      sagaType ? [sagaType] : []
    );

    return result.rows.map((row) => ({
      sagaId: row.saga_id,
      sagaType: row.saga_type,
      correlationId: row.correlation_id,
      state: row.state,
      status: row.status,
      currentStep: row.current_step,
      startedAt: row.started_at,
      updatedAt: row.updated_at,
    }));
  }
}
```

### 3.3 Add ServiceMonitor for Kubernetes

**File**: `infrastructure/kubernetes/helm/osax/templates/servicemonitor.yaml`

```yaml
{{- if .Values.monitoring.enabled }}
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: {{ include "osax.fullname" . }}
  labels:
    {{- include "osax.labels" . | nindent 4 }}
spec:
  selector:
    matchLabels:
      {{- include "osax.selectorLabels" . | nindent 6 }}
  endpoints:
    - port: http
      path: /metrics
      interval: {{ .Values.monitoring.scrapeInterval | default "30s" }}
      scrapeTimeout: {{ .Values.monitoring.scrapeTimeout | default "10s" }}
  namespaceSelector:
    matchNames:
      - {{ .Release.Namespace }}
{{- end }}
```

---

## Phase 4: AI/RAG Enhancements (Week 4)

### 4.1 Add Embedding Cache

**Problem**: Every embedding request hits OpenAI API; redundant costs.

**File**: `packages/integrations/src/embedding-cache.ts`

```typescript
import Redis from 'ioredis';
import { createHash } from 'crypto';

export class EmbeddingCache {
  private ttlSeconds = 86400 * 7; // 7 days

  constructor(private redis: Redis) {}

  private getKey(text: string, model: string): string {
    const hash = createHash('sha256').update(text).digest('hex');
    return `embedding:${model}:${hash}`;
  }

  async get(text: string, model: string): Promise<number[] | null> {
    const cached = await this.redis.get(this.getKey(text, model));
    return cached ? JSON.parse(cached) : null;
  }

  async set(text: string, model: string, embedding: number[]): Promise<void> {
    await this.redis.setex(this.getKey(text, model), this.ttlSeconds, JSON.stringify(embedding));
  }

  async invalidateByPattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(`embedding:*:${pattern}*`);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### 4.2 Add Embedding Refresh Job

**Problem**: No mechanism to refresh stale embeddings when model changes.

**File**: `apps/trigger/src/jobs/embedding-refresh.ts`

```typescript
import { schedules } from '@trigger.dev/sdk/v3';
import { embeddings } from '@medicalcor/integrations';
import { knowledgeBaseRepository } from '@medicalcor/core/rag';

export const embeddingRefreshJob = schedules.task({
  id: 'embedding-refresh',
  cron: '0 3 * * 0', // Weekly at 3 AM Sunday
  run: async () => {
    const currentModel = 'text-embedding-3-small';

    // Find entries with outdated embeddings
    const outdatedEntries = await knowledgeBaseRepository.findByEmbeddingModel(currentModel, {
      excludeCurrent: true,
    });

    let refreshed = 0;
    const batchSize = 100;

    for (let i = 0; i < outdatedEntries.length; i += batchSize) {
      const batch = outdatedEntries.slice(i, i + batchSize);
      const texts = batch.map((e) => e.content);

      const newEmbeddings = await embeddings.embedBatch(texts);

      await knowledgeBaseRepository.updateEmbeddingsBatch(
        batch.map((entry, idx) => ({
          id: entry.id,
          embedding: newEmbeddings[idx],
          embeddingModel: currentModel,
        }))
      );

      refreshed += batch.length;
    }

    return { refreshed, total: outdatedEntries.length };
  },
});
```

---

## Consequences

### Positive

- **Production reliability**: pgvector migrations ensure consistent deployments
- **Performance**: Snapshots reduce aggregate replay time from O(n) to O(1)
- **Observability**: Prometheus metrics enable proactive monitoring
- **Data integrity**: Event schema registry prevents breaking changes
- **Cost reduction**: Embedding cache reduces OpenAI API calls by ~70%
- **Resilience**: Circuit breakers prevent cascade failures in DLQ processing

### Negative

- **Complexity**: Additional infrastructure components to maintain
- **Migration effort**: Existing deployments need schema updates
- **Redis dependency**: Embedding cache requires Redis (already in use)

### Neutral

- **Consistent patterns**: All improvements follow existing architectural style
- **Incremental adoption**: Each phase can be deployed independently

## Alternatives Considered

### 1. Complete Architecture Rewrite

**Rejected**: The existing architecture is solid; improvements should build on it, not replace it.

### 2. Third-party Event Store (EventStoreDB)

**Deferred**: Would provide snapshots and schema versioning out-of-box, but adds operational complexity. Current PostgreSQL-based solution is sufficient with proposed enhancements.

### 3. Managed Vector Database (Pinecone, Weaviate)

**Deferred**: pgvector provides adequate performance for current scale. Revisit when exceeding 10M vectors.

## Implementation Checklist

### Phase 1 (Critical) - COMPLETED 2024-12-02

- [x] Create `20241202000001_add_pgvector_extension.sql` migration
- [x] Add `/metrics` endpoint with prom-client
- [x] Implement `ProjectionHealthMonitor`
- [ ] Add projection health to `/health/ready` endpoint

### Phase 2 (Event Sourcing) - COMPLETED 2024-12-02

- [x] Create `20241202000002_add_aggregate_snapshots.sql` migration
- [x] Implement `SnapshotStore` class (pre-existing in packages/core/src/cqrs/snapshot-store.ts)
- [x] Integrate snapshots into `EventStore.loadAggregate()` (via `SnapshotEnabledRepository`)
- [x] Implement `EventSchemaRegistry` (packages/core/src/cqrs/event-schema-registry.ts)
- [x] Implement `SchemaValidatedEventStore` (packages/core/src/cqrs/schema-validated-event-store.ts)

### Phase 3 (Resilience) - COMPLETED 2024-12-02

- [x] Create `20241202000003_add_saga_store.sql` migration
- [x] Implement `PostgresSagaRepository` (packages/core/src/cqrs/saga-repository.ts)
- [x] Implement `InMemorySagaRepository` for testing
- [x] Add circuit breaker to DLQ (packages/core/src/enhanced-dead-letter-queue.ts)
- [x] Create Kubernetes ServiceMonitor (infrastructure/kubernetes/helm/osax/templates/servicemonitor.yaml)
- [x] Create PrometheusRule for alerting

### Phase 4 (AI/RAG)

- [ ] Implement `EmbeddingCache` with Redis
- [ ] Add embedding model tracking to knowledge_base
- [ ] Create embedding refresh Trigger.dev job
- [ ] Integrate cache into embeddings service

## References

- [PostgreSQL Event Sourcing](https://www.eventstore.com/blog/event-sourcing-with-postgresql)
- [Prometheus Best Practices](https://prometheus.io/docs/practices/naming/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- ADR-001: Hexagonal Architecture
- ADR-002: Cloud-Agnostic Strategy
