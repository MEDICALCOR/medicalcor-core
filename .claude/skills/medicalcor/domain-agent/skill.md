# Domain Agent - Pure Business Logic Expert

> Auto-activates when: domain logic, business rules, entity, value object, aggregate, use case, domain service, DDD, scoring policy, pure function, All-on-X logic, medical rules, clinical scoring

## Agent Operating Protocol

### Auto-Update (Mandatory Before Every Operation)
```bash
# STEP 1: Sync with latest main
git fetch origin main && git rebase origin/main

# STEP 2: Validate domain purity (CRITICAL)
pnpm typecheck && pnpm check:layer-boundaries

# STEP 3: Verify no infrastructure imports
rg "from 'pg'|from '@supabase'" packages/domain/ && exit 1 || echo "Clean"

# STEP 4: Proceed only if validation passes
```

### Auto-Improve Protocol
```yaml
self_improvement:
  enabled: true
  version: 3.0.0-platinum-evolving

  triggers:
    - After every domain service creation
    - When new DDD patterns discovered
    - When layer violations detected
    - When new medical rules added

  actions:
    - Learn from successful DDD implementations
    - Update domain modeling patterns
    - Evolve value object designs
    - Incorporate new medical domain knowledge
    - Adapt to clinical guideline changes

  domain_learning:
    - Track domain service patterns
    - Analyze aggregate boundary decisions
    - Learn from event sourcing patterns
    - Monitor pure function success rates
    - Study medical scoring algorithm evolution
```

## Role

**Domain Agent** is the guardian of pure business logic in MedicalCor Core. It enforces zero infrastructure dependencies and ensures all domain code remains portable, testable, and aligned with Domain-Driven Design (DDD) principles.

## Core Principles

### 1. Zero Infrastructure Dependencies

The domain layer MUST NOT import:

```typescript
// ❌ FORBIDDEN in packages/domain/
import { Pool } from 'pg';                      // Database
import { OpenAI } from 'openai';                // External SDK
import { FastifyRequest } from 'fastify';       // HTTP framework
import { createClient } from '@supabase/supabase-js'; // Adapter
import Redis from 'ioredis';                    // Cache
import fetch from 'node-fetch';                 // Network
```

### 2. Allowed Dependencies

```typescript
// ✅ ALLOWED in packages/domain/
import type { ScoringOutput } from '@medicalcor/types';  // Types only
import { ScoringOutputSchema } from '@medicalcor/types'; // Zod schemas
import { createLogger } from '@medicalcor/core';         // Core utilities
```

### 3. Pure Functions Pattern

All domain services must follow pure function principles:

```typescript
// ✅ CORRECT - Pure domain logic
export function calculateScore(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig = DEFAULT_SCORING_CONFIG
): AllOnXScoringResult {
  // Pure computation - no I/O, no side effects
  const componentScores = calculateComponentScores(indicators, config);
  const riskFlags = identifyRiskFlags(indicators, config);
  return { componentScores, riskFlags, ... };
}

// ❌ WRONG - Side effects in domain
export async function calculateScore(indicators) {
  const result = await fetch('/api/score');  // I/O!
  await db.insert(result);                   // Side effect!
  return result;
}
```

## Domain Structure

### Location: `packages/domain/src/`

```
packages/domain/src/
├── allonx/                    # All-on-X dental implant domain
│   ├── entities/              # AllOnXCase aggregate root
│   ├── events/                # Domain events
│   ├── value-objects/         # AllOnXClinicalScore, etc.
│   ├── services/              # AllOnXScoringPolicy (pure)
│   └── repositories/          # Repository interfaces (ports)
├── breach-notification/       # HIPAA breach handling
├── cases/                     # Treatment case management
├── consent/                   # GDPR consent management
├── data-classification/       # PHI/PII classification
├── disposition/               # Lead outcome tracking
├── guidance/                  # Clinical guidance
├── inventory/                 # Supply chain strategies
├── language/                  # Language detection
├── scoring/                   # AI-powered lead scoring
├── triage/                    # Patient urgency assessment
└── shared-kernel/             # Shared domain primitives
```

## Building Blocks

### 1. Entities

Identity-based objects with lifecycle:

```typescript
// packages/domain/src/allonx/entities/AllOnXCase.ts
export class AllOnXCase {
  private constructor(
    public readonly id: string,
    public readonly patientId: string,
    public readonly clinicalScore: AllOnXClinicalScore,
    public readonly status: AllOnXCaseStatus,
    private readonly events: DomainEvent[] = []
  ) {}

  static create(props: CreateAllOnXCaseProps): AllOnXCase {
    const case_ = new AllOnXCase(
      generateId(),
      props.patientId,
      AllOnXClinicalScore.fromIndicators(props.indicators),
      'ASSESSMENT'
    );
    case_.events.push(new AllOnXCaseCreated(case_.id));
    return case_;
  }

  updateScore(indicators: AllOnXClinicalIndicators): void {
    const newScore = AllOnXClinicalScore.fromIndicators(indicators);
    this.clinicalScore = newScore;
    this.events.push(new AllOnXScoreUpdated(this.id, newScore));
  }
}
```

### 2. Value Objects

Immutable, identity-less objects:

```typescript
// packages/domain/src/allonx/value-objects/AllOnXClinicalScore.ts
export class AllOnXClinicalScore {
  private constructor(
    public readonly compositeScore: number,
    public readonly eligibility: AllOnXEligibility,
    public readonly riskLevel: AllOnXRiskLevel,
    public readonly recommendedProcedure: AllOnXProcedureType
  ) {
    Object.freeze(this);
  }

  static fromIndicators(
    indicators: AllOnXClinicalIndicators,
    confidence = 0.75
  ): AllOnXClinicalScore {
    // Pure calculation logic
    const composite = calculateCompositeScore(indicators);
    const eligibility = classifyEligibility(composite);
    const risk = calculateRiskLevel(indicators);
    const procedure = determineProcedure(indicators, eligibility);

    return new AllOnXClinicalScore(composite, eligibility, risk, procedure);
  }

  isCandidate(): boolean {
    return this.eligibility !== 'CONTRAINDICATED';
  }

  isImmediateLoadingFeasible(): boolean {
    return this.riskLevel === 'LOW' && this.compositeScore >= 70;
  }
}
```

### 3. Domain Events

Capture what happened in the domain:

```typescript
// packages/domain/src/allonx/events/allonx-events.ts
export class AllOnXCaseCreated implements DomainEvent {
  readonly occurredOn = new Date();
  constructor(public readonly caseId: string) {}
}

export class AllOnXScoreUpdated implements DomainEvent {
  readonly occurredOn = new Date();
  constructor(
    public readonly caseId: string,
    public readonly newScore: AllOnXClinicalScore
  ) {}
}
```

### 4. Domain Services

Stateless operations that don't belong to entities:

```typescript
// packages/domain/src/allonx/services/AllOnXScoringPolicy.ts
export function calculateScore(
  indicators: AllOnXClinicalIndicators,
  config: AllOnXScoringConfig = DEFAULT_SCORING_CONFIG
): AllOnXScoringResult {
  // Pure domain logic - see actual implementation for details
  const componentScores = calculateComponentScores(indicators, config);
  const riskFlags = identifyRiskFlags(indicators, config);
  const clinicalNotes = generateClinicalNotes(indicators, riskFlags);

  return {
    clinicalScore: AllOnXClinicalScore.fromIndicators(indicators),
    componentScores,
    riskFlags,
    clinicalNotes,
    // ...
  };
}
```

### 5. Repository Interfaces (Ports)

Define contracts without implementation:

```typescript
// packages/domain/src/allonx/repositories/AllOnXCaseRepository.ts
export interface AllOnXCaseRepository {
  findById(id: string): Promise<AllOnXCase | null>;
  findByPatientId(patientId: string): Promise<AllOnXCase[]>;
  save(case_: AllOnXCase): Promise<void>;
  delete(id: string): Promise<void>;
}
// Implementation lives in packages/infrastructure/
```

## Medical Domain Rules

### All-on-X Clinical Scoring

The scoring policy uses pure functions with clinical guidelines:

| Component | Weight | Source |
|-----------|--------|--------|
| Bone Quality | 35% | ITI Treatment Guide |
| Medical Risk | 30% | EAO Guidelines |
| Oral Health | 20% | AAID Standards |
| Procedural Complexity | 10% | Clinical consensus |
| Patient Factors | 5% | AAOMS Position |

### Risk Flags

Pure domain constants for clinical attention:

```typescript
export type AllOnXRiskFlag =
  | 'HEAVY_SMOKER'
  | 'UNCONTROLLED_DIABETES'
  | 'BISPHOSPHONATE_THERAPY'
  | 'RADIATION_HISTORY'
  | 'POOR_BONE_QUALITY'
  | 'ACTIVE_PERIODONTAL_DISEASE';
```

### Eligibility Classification

```typescript
export function classifyEligibilityFromScore(
  compositeScore: number
): AllOnXEligibility {
  if (compositeScore >= 80) return 'IDEAL';
  if (compositeScore >= 60) return 'SUITABLE';
  if (compositeScore >= 40) return 'CONDITIONAL';
  return 'CONTRAINDICATED';
}
```

## Testing Domain Logic

All domain services must have property-based tests:

```typescript
// packages/domain/src/__tests__/allonx-scoring-engine-property-based.test.ts
import fc from 'fast-check';
import { calculateScore } from '../allonx/services/AllOnXScoringPolicy';

describe('AllOnX Scoring Policy', () => {
  it('should always return valid eligibility', () => {
    fc.assert(
      fc.property(indicatorsArbitrary, (indicators) => {
        const result = calculateScore(indicators);
        return ['IDEAL', 'SUITABLE', 'CONDITIONAL', 'CONTRAINDICATED']
          .includes(result.clinicalScore.eligibility);
      })
    );
  });

  it('should be deterministic', () => {
    fc.assert(
      fc.property(indicatorsArbitrary, (indicators) => {
        const result1 = calculateScore(indicators);
        const result2 = calculateScore(indicators);
        return result1.clinicalScore.compositeScore ===
               result2.clinicalScore.compositeScore;
      })
    );
  });
});
```

## Layer Boundary Enforcement

Before committing, verify:

```bash
pnpm check:layer-boundaries  # Automated architecture check
```

This validates:
- No infrastructure imports in domain
- No cross-layer violations
- Dependency order: types → core → domain → application → infrastructure

## Common Anti-Patterns to Avoid

### ❌ Async in Pure Domain Logic

```typescript
// WRONG - Async implies I/O
async function calculateRisk(data) {
  const score = await computeScore(data);  // Why await?
  return score;
}
```

### ❌ Logger Side Effects in Scoring

```typescript
// WRONG - Logging is a side effect
function calculateScore(data) {
  logger.info('Calculating score...');  // Side effect!
  return compute(data);
}
```

### ❌ Direct Database Access

```typescript
// WRONG - Infrastructure in domain
function getPatientScore(id: string) {
  const patient = await db.query(`SELECT * FROM patients WHERE id = $1`, [id]);
  return calculateScore(patient);
}
```

## Correct Patterns

### ✅ Pure Computation

```typescript
// CORRECT - Pure function
function calculateScore(
  indicators: AllOnXClinicalIndicators
): AllOnXScoringResult {
  const composite = calculateCompositeScore(indicators);
  const eligibility = classifyEligibility(composite);
  return { composite, eligibility };
}
```

### ✅ Use Cases Orchestrate I/O

```typescript
// packages/application/src/use-cases/score-lead.ts
export class ScoreLeadUseCase {
  constructor(
    private readonly patientRepo: PatientRepository,
    private readonly caseRepo: AllOnXCaseRepository,
    private readonly logger: Logger
  ) {}

  async execute(patientId: string): Promise<ScoringResult> {
    // I/O happens in application layer
    const patient = await this.patientRepo.findById(patientId);
    this.logger.info({ patientId }, 'Scoring patient');

    // Pure domain logic
    const indicators = extractIndicators(patient);
    const result = calculateScore(indicators);

    // I/O for persistence
    await this.caseRepo.save(AllOnXCase.create({ patientId, result }));
    return result;
  }
}
```

## Summary

Domain Agent ensures:

1. **Purity**: All domain logic is pure functions without side effects
2. **Isolation**: No infrastructure dependencies leak into domain
3. **Testability**: Everything testable without mocks
4. **Portability**: Domain can be moved to any runtime
5. **DDD Alignment**: Proper use of entities, value objects, events, services
