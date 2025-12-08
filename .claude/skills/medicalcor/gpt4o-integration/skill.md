# GPT-4o Integration Expert

> Auto-activates when: GPT-4o, OpenAI, AI scoring, lead scoring, AI integration, LLM, language model, embeddings, RAG, vector search

## Overview

MedicalCor uses GPT-4o for AI-powered lead scoring and patient communication analysis. This skill covers integration patterns, prompt engineering, and HIPAA-compliant AI usage.

## Architecture

### AI Gateway Pattern

Location: `packages/domain/src/shared-kernel/repository-interfaces/ai-gateway.ts`

```typescript
interface AIGateway {
  scoreLead(lead: Lead, context: ScoringContext): Promise<LeadScore>;
  analyzeMessage(message: Message): Promise<MessageAnalysis>;
  generateResponse(context: ConversationContext): Promise<string>;
}
```

### Implementation

Location: `packages/integrations/src/openai/`

```typescript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export class OpenAIGateway implements AIGateway {
  async scoreLead(lead: Lead, context: ScoringContext): Promise<LeadScore> {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: LEAD_SCORING_PROMPT },
        { role: 'user', content: this.formatLeadData(lead, context) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3, // Lower for consistent scoring
    });

    return this.parseScoreResponse(response);
  }
}
```

## Lead Scoring

### Scoring Service

Location: `packages/domain/src/scoring/scoring-service.ts`

### Lead Score Value Object

Location: `packages/domain/src/shared-kernel/value-objects/lead-score.ts`

### Scoring Prompt Template

```typescript
const LEAD_SCORING_PROMPT = `You are a dental clinic lead scoring assistant.
Analyze the lead data and provide a score from 0-100 based on:

1. **Intent Signals (30%)**
   - Specific treatment mentioned
   - Urgency indicators
   - Insurance/payment questions

2. **Demographic Fit (25%)**
   - Location proximity
   - Age group alignment
   - Family situation

3. **Engagement Quality (25%)**
   - Response time
   - Message length/detail
   - Questions asked

4. **Conversion Likelihood (20%)**
   - Previous interactions
   - Referred by existing patient
   - Campaign source quality

Respond in JSON format:
{
  "score": number (0-100),
  "confidence": number (0-1),
  "factors": {
    "intent": { "score": number, "reason": string },
    "demographic": { "score": number, "reason": string },
    "engagement": { "score": number, "reason": string },
    "conversion": { "score": number, "reason": string }
  },
  "recommendation": "hot" | "warm" | "cold",
  "suggestedAction": string
}`;
```

### HIPAA-Compliant AI Usage

**Critical**: Never send PHI directly to OpenAI. Anonymize data first:

```typescript
function anonymizeLeadData(lead: Lead): AnonymizedLead {
  return {
    // Keep non-PHI data
    source: lead.source,
    treatmentInterest: lead.treatmentInterest,
    urgency: lead.urgency,
    messageContent: redactPHI(lead.messageContent),

    // Anonymize identifiers
    ageRange: getAgeRange(lead.dateOfBirth),
    locationZone: getLocationZone(lead.zipCode),

    // Remove completely
    // name, email, phone, address, SSN, etc.
  };
}

function redactPHI(text: string): string {
  return text
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[PHONE]')
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{5}(-\d{4})?\b/g, '[ZIP]');
}
```

## Embeddings & RAG

### pgvector Integration

MedicalCor uses PostgreSQL with pgvector for vector similarity search:

```typescript
// Generate embeddings
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
  });
  return response.data[0].embedding;
}

// Store in PostgreSQL
await db.query(
  `
  INSERT INTO knowledge_base (content, embedding)
  VALUES ($1, $2::vector)
`,
  [content, JSON.stringify(embedding)]
);

// Similarity search
async function findSimilar(query: string, limit = 5) {
  const queryEmbedding = await generateEmbedding(query);
  return db.query(
    `
    SELECT content, 1 - (embedding <=> $1::vector) as similarity
    FROM knowledge_base
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `,
    [JSON.stringify(queryEmbedding), limit]
  );
}
```

### RAG for Patient Q&A

```typescript
async function answerPatientQuestion(question: string): Promise<string> {
  // 1. Find relevant knowledge
  const relevantDocs = await findSimilar(question, 3);

  // 2. Build context
  const context = relevantDocs.map((d) => d.content).join('\n\n');

  // 3. Generate answer
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a helpful dental clinic assistant.
Answer patient questions based on the following knowledge base:

${context}

Be helpful but remind patients to consult with their dentist for specific medical advice.`,
      },
      { role: 'user', content: question },
    ],
  });

  return response.choices[0].message.content;
}
```

## Structured Outputs

### JSON Mode

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  response_format: { type: 'json_object' }
});

const result = JSON.parse(response.choices[0].message.content);
```

### Function Calling

```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  tools: [{
    type: 'function',
    function: {
      name: 'schedule_appointment',
      description: 'Schedule a dental appointment',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', format: 'date' },
          time: { type: 'string', pattern: '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' },
          treatment: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['date', 'time', 'treatment']
      }
    }
  }],
  tool_choice: 'auto'
});
```

## Error Handling

```typescript
import { logger } from '@medicalcor/core/logger';

async function callOpenAI<T>(fn: () => Promise<T>): Promise<T> {
  const maxRetries = 3;
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (error.status === 429) {
        // Rate limited - exponential backoff
        const delay = Math.pow(2, attempt) * 1000;
        logger.warn('OpenAI rate limited, retrying', { attempt, delay });
        await sleep(delay);
        continue;
      }

      if (error.status >= 500) {
        // Server error - retry
        logger.warn('OpenAI server error, retrying', { attempt });
        await sleep(1000 * attempt);
        continue;
      }

      // Client error - don't retry
      throw error;
    }
  }

  throw lastError;
}
```

## Cost Optimization

1. **Use appropriate model**: GPT-4o for complex scoring, GPT-4o-mini for simple tasks
2. **Cache responses**: Cache identical queries with Redis
3. **Batch requests**: Group similar operations
4. **Limit token usage**: Keep prompts concise, use max_tokens

```typescript
// Example: Redis caching
async function scoreLeadCached(lead: Lead): Promise<LeadScore> {
  const cacheKey = `lead:score:${hashLeadData(lead)}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return JSON.parse(cached);
  }

  const score = await aiGateway.scoreLead(lead);
  await redis.setex(cacheKey, 3600, JSON.stringify(score)); // 1 hour TTL

  return score;
}
```
