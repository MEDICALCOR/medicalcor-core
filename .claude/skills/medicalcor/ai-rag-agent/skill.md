# AI RAG Agent - Multi-Provider AI & RAG Expert

> Auto-activates when: AI gateway, multi-provider, RAG, embeddings, vector search, LLM, OpenAI, Anthropic, Gemini, Llama, Ollama, cognitive memory, episodic memory, knowledge graph, AI scoring, fine-tuning, token estimation, AI budget

## Agent Operating Protocol

### Auto-Update (Mandatory Before Every Operation)
```bash
# STEP 1: Sync with latest main
git fetch origin main && git rebase origin/main

# STEP 2: Validate AI/RAG code
pnpm typecheck && pnpm check:layer-boundaries

# STEP 3: Check embedding model status
# Verify vector store health

# STEP 4: Proceed only if validation passes
```

### Auto-Improve Protocol
```yaml
self_improvement:
  enabled: true
  version: 3.0.0-platinum-evolving

  triggers:
    - After every AI model update
    - When new embedding models release
    - When RAG performance degrades
    - When new provider SDKs update

  actions:
    - Learn from successful prompt patterns
    - Update embedding strategies from benchmarks
    - Evolve RAG retrieval parameters
    - Incorporate new model capabilities
    - Adapt to cost optimization patterns

  ai_learning:
    - Track prompt success rates
    - Monitor token usage trends
    - Analyze retrieval quality scores
    - Learn from cognitive memory patterns
    - Optimize multi-provider routing
```

## Role

**AI RAG Agent** is the expert for MedicalCor's advanced AI infrastructure. It handles multi-provider AI gateway configuration, RAG pipelines, cognitive memory systems, and AI cost optimization.

## Multi-Provider AI Gateway

### Location: `packages/core/src/ai-gateway/`

MedicalCor uses a **Strategy Pattern** for extensible AI provider support with automatic failover.

### Supported Providers

| Strategy | Provider | Models | Priority | Cost (per 1M tokens) |
|----------|----------|--------|----------|---------------------|
| `OpenAIStrategy` | OpenAI | GPT-4o, GPT-4, GPT-3.5-turbo | 1 (primary) | $2.50 in / $10 out |
| `AnthropicStrategy` | Anthropic | Claude 3.5 Sonnet, Claude 3 Opus | 2 | $3 in / $15 out |
| `GeminiStrategy` | Google | Gemini 1.5 Pro, Gemini 2.0 | 3 | $1.25 in / $5 out |
| `LlamaStrategy` | Local Llama | Llama 3.1, Llama 2 | 4 | Free (local) |
| `OllamaStrategy` | Ollama | Any Ollama model | 5 | Free (local) |

### Basic Usage

```typescript
import {
  createMultiProviderGateway,
  createMultiProviderGatewayFromEnv,
} from '@medicalcor/core/ai-gateway';

// Auto-configure from environment
const gateway = createMultiProviderGatewayFromEnv();

// Or manual configuration
const gateway = createMultiProviderGateway({
  fallbackOrder: ['openai', 'anthropic', 'gemini', 'llama'],
  enableFailover: true,
  enableCostAwareRouting: true,
});

// Configure providers
gateway.configureProvider('openai', {
  apiKey: process.env.OPENAI_API_KEY,
  enabled: true,
});

gateway.configureProvider('gemini', {
  apiKey: process.env.GOOGLE_AI_API_KEY,
  enabled: true,
});

// Make completion request
const response = await gateway.complete({
  messages: [
    { role: 'system', content: 'You are a dental assistant.' },
    { role: 'user', content: 'What is All-on-X?' },
  ],
  preferredProvider: 'openai',
  operation: 'function_call',
});

console.log(response.content);
console.log(`Provider: ${response.provider}, Cost: $${response.cost}`);
```

### Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_ORGANIZATION=org-...  # Optional

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google Gemini
GOOGLE_AI_API_KEY=...
# or
GEMINI_API_KEY=...

# Local LLMs
LLAMA_API_URL=http://localhost:8080/v1
OLLAMA_API_URL=http://localhost:11434/api
```

### Adding a New Provider Strategy

Implement `IAIProviderStrategy` interface:

```typescript
// packages/core/src/ai-gateway/strategies/my-provider-strategy.ts
import type { IAIProviderStrategy, AIProviderCallOptions, AIProviderCallResult } from './ai-provider-strategy.js';
import type { ProviderConfig } from '../multi-provider-gateway.js';

export class MyProviderStrategy implements IAIProviderStrategy {
  readonly providerName = 'my-provider';

  canHandle(config: ProviderConfig): boolean {
    return config.provider === 'my-provider' && config.enabled === true;
  }

  async execute(config: ProviderConfig, options: AIProviderCallOptions): Promise<AIProviderCallResult> {
    // Implementation
    return { content: '...', tokensUsed: { prompt: 0, completion: 0, total: 0 } };
  }
}
```

## AI Gateway Components

### Token Estimator

Pre-call cost estimation:

```typescript
import { TokenEstimator, estimateCost } from '@medicalcor/core/ai-gateway';

const estimate = estimateCost({
  messages: [{ role: 'user', content: 'Hello' }],
  model: 'gpt-4o',
});
console.log(`Estimated cost: $${estimate.totalCost}`);
```

### AI Budget Controller

Spending limits with alerts:

```typescript
import { AIBudgetController } from '@medicalcor/core/ai-gateway';

const budget = new AIBudgetController({
  dailyLimitUsd: 100,
  monthlyLimitUsd: 2000,
  alertThresholds: [50, 80, 90],
});

const check = await budget.checkBudget('gpt-4o', estimatedCost);
if (!check.allowed) {
  console.warn(`Budget exceeded: ${check.reason}`);
}
```

### User Rate Limiter

Per-user AI request limits:

```typescript
import { UserRateLimiter, DEFAULT_TIER_LIMITS } from '@medicalcor/core/ai-gateway';

const limiter = new UserRateLimiter({
  tierLimits: {
    free: { requestsPerMinute: 10, requestsPerDay: 100 },
    pro: { requestsPerMinute: 60, requestsPerDay: 1000 },
    enterprise: { requestsPerMinute: 300, requestsPerDay: 10000 },
  },
});

const result = await limiter.checkLimit(userId, 'pro');
if (!result.allowed) {
  throw new Error('Rate limit exceeded');
}
```

### AI Response Cache

Redis-backed caching for identical requests:

```typescript
import { AIResponseCache } from '@medicalcor/core/ai-gateway';

const cache = new AIResponseCache({
  redis,
  ttlSeconds: 3600,
  maxCacheSize: 10000,
});

const cached = await cache.get(messages, model);
if (cached) return cached;

const response = await gateway.complete({ messages, model });
await cache.set(messages, model, response);
```

### Fine-Tuning Export

Export conversation data for model fine-tuning:

```typescript
import { FineTuningExportService } from '@medicalcor/core/ai-gateway';

const exporter = new FineTuningExportService({
  piiPatterns: DEFAULT_PII_PATTERNS,
  minQualityScore: 0.7,
});

const examples = await exporter.exportConversations({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
  categories: ['lead_scoring', 'appointment_booking'],
});
```

## RAG System

### Location: `packages/core/src/rag/`

### Core Components

| Component | File | Purpose |
|-----------|------|---------|
| RAG Pipeline | `rag-pipeline.ts` | End-to-end orchestration |
| Vector Search | `vector-search-service.ts` | Semantic + hybrid search |
| Knowledge Base | `knowledge-base-repository.ts` | Document storage with pgvector |
| Conversation Embeddings | `conversation-embedding-service.ts` | Semantic search over conversations |
| HubSpot Context | `hubspot-context-provider.ts` | CRM context injection |

### RAG Pipeline Usage

```typescript
import { RAGPipeline } from '@medicalcor/core/rag';

const rag = new RAGPipeline({
  embeddingModel: 'text-embedding-3-small',
  retrievalTopK: 5,
  similarityThreshold: 0.7,
  maxContextTokens: 2000,
});

const context = await rag.retrieve('What is All-on-X pricing?');
const answer = await gateway.complete({
  messages: [
    { role: 'system', content: `Answer based on this context:\n${context}` },
    { role: 'user', content: 'What is All-on-X pricing?' },
  ],
});
```

### Embedding Versioning (M14)

Zero-downtime model migrations:

```typescript
import {
  EmbeddingModelRegistry,
  EmbeddingMigrationOrchestrator,
} from '@medicalcor/core/rag';

const registry = new EmbeddingModelRegistry();

// Check current models
console.log(registry.getActiveModels());

// Plan migration
const orchestrator = new EmbeddingMigrationOrchestrator({
  sourceModel: 'text-embedding-ada-002',
  targetModel: 'text-embedding-3-small',
  batchSize: 100,
});

await orchestrator.startMigration();
```

### Query Analytics (M4)

Monitor RAG performance:

```typescript
import { RAGQueryAnalytics } from '@medicalcor/core/rag';

const analytics = new RAGQueryAnalytics(db);

const summary = await analytics.getPerformanceSummary({
  startDate: new Date('2024-12-01'),
  endDate: new Date('2024-12-31'),
});

console.log(`P95 Latency: ${summary.latencyP95}ms`);
console.log(`Cache Hit Rate: ${summary.cacheHitRate}%`);
```

## Cognitive Episodic Memory

### Location: `packages/core/src/cognitive/`

AI-powered patient interaction memory system.

### Components

| Component | File | Purpose |
|-----------|------|---------|
| Episode Builder | `episode-builder.ts` | Event → Memory conversion |
| Memory Retrieval | `memory-retrieval.ts` | Temporal + semantic queries |
| Pattern Detector | `pattern-detector.ts` | Behavioral pattern recognition |
| Knowledge Graph | `knowledge-graph.ts` | Entity relationships |
| PII Masking | `pii-masking.ts` | Query-time role-based redaction |
| GDPR Erasure | `gdpr-erasure.ts` | Right-to-erasure implementation |

### Episode Builder Usage

```typescript
import { EpisodeBuilder } from '@medicalcor/core/cognitive';

const builder = new EpisodeBuilder({ openaiClient });

const episode = await builder.createEpisode({
  subjectType: 'lead',
  subjectId: leadId,
  eventType: 'message.received',
  sourceChannel: 'whatsapp',
  rawContent: messageContent,
});
// Episode includes: summary, entities, sentiment, intent, embedding
```

### Memory Retrieval

```typescript
import { MemoryRetrieval } from '@medicalcor/core/cognitive';

const retrieval = new MemoryRetrieval(db);

// Semantic search
const memories = await retrieval.searchSemantic({
  query: 'patient mentioned tooth pain',
  subjectId: patientId,
  limit: 10,
});

// Temporal retrieval
const recentMemories = await retrieval.getRecentEpisodes({
  subjectId: patientId,
  days: 30,
  channels: ['whatsapp', 'voice'],
});
```

### Masked Memory Retrieval (L6)

Role-based PII masking:

```typescript
import { MaskedMemoryRetrieval } from '@medicalcor/core/cognitive';

const masked = new MaskedMemoryRetrieval(db);

// Different users see different data
const adminView = await masked.retrieve(query, { role: 'admin' }); // Full data
const agentView = await masked.retrieve(query, { role: 'agent' }); // Masked PII
```

### Pattern Detection

```typescript
import { PatternDetector } from '@medicalcor/core/cognitive';

const detector = new PatternDetector(db);

const patterns = await detector.detectPatterns(patientId);
console.log(`Churn Risk: ${patterns.churnRisk}`);
console.log(`Engagement Score: ${patterns.engagementScore}`);
console.log(`Behavioral Sequences:`, patterns.sequences);
```

## HNSW Vector Strategy (ADR-005)

### Standardized Parameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| M (connections) | 24 | Optimal for 10K-100K vectors |
| ef_construction | 200 | Build-time quality |
| ef_search (adaptive) | 40-400 | Query-time accuracy/speed tradeoff |

### ef_search Modes

```typescript
const searchModes = {
  fast: 40,      // Quick lookups, lower accuracy
  balanced: 100, // Default mode
  accurate: 200, // Higher accuracy, slower
  exact: 400,    // Maximum accuracy
};
```

### Creating HNSW Index

```sql
CREATE INDEX CONCURRENTLY idx_episodic_events_embedding_hnsw
ON episodic_events
USING hnsw (embedding vector_cosine_ops)
WITH (m = 24, ef_construction = 200);
```

## AI Function Registry

### Medical Functions

Pre-built AI functions for medical CRM:

```typescript
import {
  ALL_MEDICAL_FUNCTIONS,
  FunctionExecutor,
  ScoreLeadFunction,
  ScheduleAppointmentFunction,
} from '@medicalcor/core/ai-gateway';

const executor = new FunctionExecutor({
  scoringService,
  hubspotService,
  whatsappService,
  schedulingService,
  consentService,
  workflowService,
});

// Execute function call from AI
const result = await executor.execute({
  name: 'score_lead',
  arguments: { leadId: '123', messageHistory: [...] },
});
```

### Available Functions

| Function | Purpose |
|----------|---------|
| `score_lead` | AI-powered lead scoring |
| `get_patient` | Retrieve patient info |
| `update_patient` | Update patient record |
| `schedule_appointment` | Book appointment |
| `get_available_slots` | Check availability |
| `cancel_appointment` | Cancel booking |
| `send_whatsapp` | Send WhatsApp message |
| `record_consent` | Record GDPR consent |
| `check_consent` | Verify consent status |
| `get_lead_analytics` | Lead analytics |
| `trigger_workflow` | Start Trigger.dev workflow |
| `get_workflow_status` | Check workflow status |

## Security Best Practices

### Prompt Injection Prevention

```typescript
import { detectPromptInjection, sanitizeMessageContent } from '@medicalcor/core/ai-gateway';

// Detect injection attempts
if (detectPromptInjection(userInput)) {
  throw new SecurityError('Potential prompt injection detected');
}

// Sanitize content
const safe = sanitizeMessageContent(userInput);
```

### HIPAA-Compliant AI Usage

```typescript
// NEVER send raw PHI to AI providers
function anonymizeForAI(patient: Patient): AnonymizedPatient {
  return {
    ageRange: getAgeRange(patient.dob),
    locationZone: getLocationZone(patient.zip),
    treatmentInterest: patient.treatmentInterest,
    // EXCLUDE: name, email, phone, SSN, medical records
  };
}
```

### PII Redaction in Logs

```typescript
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'ai-service' });

// Auto-redacts PII
logger.info({ patientId, phone }, 'Processing request');
// Output: { patientId: "123", phone: "[REDACTED]" }
```

## Conversation Context Manager

Maintain conversation state across AI calls:

```typescript
import { ConversationContextManager } from '@medicalcor/core/ai-gateway';

const context = new ConversationContextManager({
  redis,
  sessionTtlSeconds: 1800,
  maxHistoryLength: 20,
});

// Add message to context
await context.addMessage(sessionId, { role: 'user', content: 'Hello' });

// Get full context for AI call
const history = await context.getHistory(sessionId);

// Extract entities from conversation
const entities = await context.getExtractedEntities(sessionId);
```

## System Prompts Repository

Centralized, versioned prompt storage:

```typescript
import { SystemPromptsRepository, DEFAULT_PROMPTS } from '@medicalcor/core/ai-gateway';

const prompts = new SystemPromptsRepository(db);

// Get prompt by category
const scoringPrompt = await prompts.getPrompt({
  category: 'lead_scoring',
  language: 'en',
});

// Create new version
await prompts.createVersion({
  category: 'lead_scoring',
  content: '...',
  variables: ['treatment_type', 'urgency_level'],
});
```

## Monitoring & Metrics

### AI Metrics Repository

Persist all AI calls for analysis:

```typescript
import { PostgresAIMetricsRepository } from '@medicalcor/core/ai-gateway';

const metricsRepo = new PostgresAIMetricsRepository(db);

// Gateway auto-logs metrics
const gateway = new MultiProviderGateway({}, metricsRepo);

// Query metrics
const usage = await metricsRepo.getUsageByProvider({
  startDate: new Date('2024-12-01'),
  endDate: new Date('2024-12-31'),
});
```

### Provider Health Monitoring

```typescript
const gateway = createMultiProviderGatewayFromEnv();

// Check provider health
const health = gateway.getAllProviderHealth();
console.log('OpenAI:', health.openai.status);
console.log('Anthropic:', health.anthropic.status);

// Get fallback metrics
const metrics = gateway.getMetrics();
console.log(`Fallback Rate: ${gateway.getFallbackRate() * 100}%`);
```

## Testing AI Components

### Mocking AI Providers

```typescript
import { vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

mockFetch.mockResolvedValueOnce({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: 'Test response' } }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }),
});
```

### Testing RAG Retrieval

```typescript
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('RAG Pipeline', () => {
  it('should return relevant results', () => {
    fc.assert(
      fc.property(fc.string(), async (query) => {
        const results = await rag.retrieve(query);
        return results.every((r) => r.similarity >= 0.7);
      })
    );
  });
});
```

## Summary

AI RAG Agent manages:

1. **Multi-Provider Gateway**: OpenAI, Anthropic, Gemini, Llama, Ollama with auto-failover
2. **RAG Pipeline**: pgvector-powered semantic search with embedding versioning
3. **Cognitive Memory**: Episodic memory for patient interactions
4. **Cost Optimization**: Token estimation, budgets, caching
5. **Security**: Prompt injection prevention, PII masking, HIPAA compliance
6. **Monitoring**: Comprehensive metrics and health checks
