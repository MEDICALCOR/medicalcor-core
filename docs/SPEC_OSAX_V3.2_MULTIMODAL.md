# OSAX v3.2 Multimodal Specification

**Version**: 3.2.0
**Status**: Implementation Ready
**Last Updated**: 2025-12-05

---

## 1. Overview

OSAX v3.2 Multimodal extends the existing OSAX clinical case management system with:

1. **Multimodal Imaging Analysis** - AI-powered analysis of dental imaging (CBCT, panoramic, intraoral)
2. **Financial Prediction** - Case acceptance probability based on clinical and demographic factors
3. **Resource Orchestration** - Soft-hold mechanism for surgical resources (OR time, equipment, staff)

### 1.1 Architecture Principles

| Principle | Implementation |
|-----------|---------------|
| **DDD** | Domain layer contains pure business logic, no infrastructure dependencies |
| **Hexagonal** | Ports in Core, Adapters in Infrastructure |
| **Event-Driven** | All state changes emit append-only domain events |
| **Medical-Grade Security** | Zero PHI in logs, encrypted storage, HIPAA/GDPR compliant |
| **AI Gateway** | No direct AI SDK calls - all through abstracted ports |
| **Observability** | OpenTelemetry-ready spans for all operations |

### 1.2 Clinical Disclaimer

> **IMPORTANT**: This system provides decision support tools only. All imaging analysis results require verification by a qualified dental professional. The system does NOT provide medical diagnoses.

---

## 2. Domain Model

### 2.1 Value Objects

#### 2.1.1 ImagingFindings

Represents the results of AI-powered imaging analysis.

```typescript
interface ImagingFindings {
  // Array of anatomical region findings
  readonly findings: readonly RegionFinding[];

  // Overall analysis confidence (0-1)
  readonly overallConfidence: number;

  // Imaging modality analyzed
  readonly modality: ImagingModality;

  // Analysis timestamp
  readonly analyzedAt: Date;

  // Algorithm version used
  readonly algorithmVersion: string;
}

interface RegionFinding {
  // Anatomical region identifier
  readonly regionId: string;

  // Region name (e.g., "mandible-left-molar", "maxilla-anterior")
  readonly regionName: string;

  // Finding type
  readonly findingType: FindingType;

  // Confidence score for this finding (0-1)
  readonly confidence: number;

  // Bounding box coordinates (normalized 0-1)
  readonly boundingBox?: BoundingBox;

  // Clinical notes (non-PHI)
  readonly notes?: string;

  // Risk classification
  readonly riskClass: RiskClass;
}

type ImagingModality = 'CBCT' | 'PANORAMIC' | 'PERIAPICAL' | 'INTRAORAL_SCAN' | 'CEPHALOMETRIC';

type FindingType =
  | 'BONE_DENSITY_ADEQUATE'
  | 'BONE_DENSITY_COMPROMISED'
  | 'SINUS_PROXIMITY'
  | 'NERVE_PROXIMITY'
  | 'PATHOLOGY_SUSPECTED'
  | 'IMPLANT_SITE_SUITABLE'
  | 'IMPLANT_SITE_REQUIRES_AUGMENTATION'
  | 'ROOT_RESORPTION'
  | 'PERIODONTAL_BONE_LOSS';

type RiskClass = 'GREEN' | 'YELLOW' | 'RED';
```

**Business Rules:**
- `isComplete()`: All mandatory regions analyzed
- `aggregateConfidence()`: Weighted average of all findings
- `hasHighRiskFindings()`: Any RED risk class present
- `requiresSpecialistReview()`: Confidence < 0.7 OR any RED findings

#### 2.1.2 FinancialPrediction

Represents case acceptance probability prediction.

```typescript
interface FinancialPrediction {
  // Probability of case acceptance (0-1)
  readonly probability: number;

  // Confidence in prediction (0-1)
  readonly confidence: number;

  // Human-readable rationale
  readonly rationale: string;

  // Contributing factors
  readonly factors: readonly PredictionFactor[];

  // Predicted case value range
  readonly estimatedValueRange: {
    readonly min: number;
    readonly max: number;
    readonly currency: string;
  };

  // Prediction timestamp
  readonly predictedAt: Date;
}

interface PredictionFactor {
  readonly factor: string;
  readonly weight: number;
  readonly contribution: 'positive' | 'negative' | 'neutral';
}
```

**Business Rules:**
- `isHighProbability()`: probability >= 0.65
- `requiresFinancialConsultation()`: estimatedValue.max > threshold
- `getRecommendedAction()`: Based on probability tier

### 2.2 Entities

#### 2.2.1 ResourceBlock

Represents a soft-hold on surgical resources.

```typescript
interface ResourceBlock {
  // Unique identifier
  readonly id: string;

  // Associated case ID
  readonly caseId: string;

  // Resource type
  readonly resourceType: ResourceType;

  // Block status
  readonly status: ResourceBlockStatus;

  // Requested duration in minutes
  readonly durationMinutes: number;

  // Scheduled start time (if confirmed)
  readonly scheduledStart?: Date;

  // Expiration time for soft-hold
  readonly expiresAt: Date;

  // Created timestamp
  readonly createdAt: Date;

  // Last update timestamp
  readonly updatedAt: Date;
}

type ResourceType = 'OR_TIME' | 'CBCT_MACHINE' | 'SURGICAL_KIT' | 'SPECIALIST' | 'ANESTHESIOLOGIST';

type ResourceBlockStatus = 'SOFT_HELD' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED';
```

**Invariants:**
- Soft-hold expires after configured TTL (default: 72 hours)
- Confirmation requires case approval
- Release is idempotent

---

## 3. Ports (Hexagonal Architecture)

### 3.1 ImagingModelPort

```typescript
interface ImagingModelPort {
  readonly portName: 'imaging-model';
  readonly portType: 'outbound';

  /**
   * Analyze imaging data and return findings
   *
   * @param input - Image URL or reference (never raw data in memory)
   * @returns Array of anatomical findings
   *
   * SECURITY: Never log PHI or raw imaging data
   */
  analyzeImaging(input: ImagingAnalysisInput): Promise<RegionFinding[]>;

  /**
   * Check model availability and health
   */
  healthCheck(): Promise<{ available: boolean; latencyMs: number }>;
}

interface ImagingAnalysisInput {
  readonly imageRef: string;  // Signed URL or storage reference
  readonly modality: ImagingModality;
  readonly patientAgeGroup?: 'PEDIATRIC' | 'ADULT' | 'GERIATRIC';
  readonly analysisScope?: string[];  // Specific regions to analyze
}
```

### 3.2 StoragePort

```typescript
interface StoragePort {
  readonly portName: 'secure-storage';
  readonly portType: 'outbound';

  /**
   * Generate a signed URL for secure image access
   *
   * @param path - Storage path (bucket/key)
   * @param ttlSeconds - URL validity period
   * @returns Signed URL
   *
   * SECURITY: URLs are time-limited and single-use when possible
   */
  getSignedUrl(path: string, ttlSeconds: number): Promise<string>;

  /**
   * Verify file exists and is accessible
   */
  exists(path: string): Promise<boolean>;

  /**
   * Get file metadata without downloading
   */
  getMetadata(path: string): Promise<StorageMetadata>;
}

interface StorageMetadata {
  readonly size: number;
  readonly contentType: string;
  readonly uploadedAt: string;
  readonly checksumSha256: string;
}
```

### 3.3 FinancialModelPort

```typescript
interface FinancialModelPort {
  readonly portName: 'financial-model';
  readonly portType: 'outbound';

  /**
   * Predict case acceptance probability
   *
   * @param input - Clinical and demographic factors
   * @returns Financial prediction with rationale
   */
  predict(input: FinancialPredictionInput): Promise<FinancialPrediction>;
}

interface FinancialPredictionInput {
  readonly severity: string;
  readonly treatmentComplexity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly estimatedProcedures: number;
  readonly hasInsurance: boolean;
  readonly insuranceTier?: 'BASIC' | 'STANDARD' | 'PREMIUM';
  readonly patientEngagementScore?: number;
  readonly clinicConversionRate?: number;
}
```

### 3.4 ResourceSchedulerPort

```typescript
interface ResourceSchedulerPort {
  readonly portName: 'resource-scheduler';
  readonly portType: 'outbound';

  /**
   * Create a soft-hold on resources
   *
   * @param caseId - Associated case identifier
   * @param resources - Resources to hold
   * @param durationMinutes - Requested procedure duration
   * @returns Array of created resource blocks
   */
  softHoldResources(
    caseId: string,
    resources: ResourceType[],
    durationMinutes: number
  ): Promise<ResourceBlock[]>;

  /**
   * Confirm soft-held resources
   */
  confirmResources(blockIds: string[]): Promise<void>;

  /**
   * Release soft-held resources
   */
  releaseResources(blockIds: string[]): Promise<void>;

  /**
   * Check resource availability
   */
  checkAvailability(
    resources: ResourceType[],
    dateRange: { start: Date; end: Date }
  ): Promise<AvailabilityResult>;
}

interface AvailabilityResult {
  readonly available: boolean;
  readonly conflicts: readonly ResourceConflict[];
  readonly suggestedSlots: readonly TimeSlot[];
}
```

---

## 4. Domain Services

### 4.1 OsaxImagingService

Orchestrates imaging analysis workflow.

```typescript
class OsaxImagingService {
  constructor(
    private readonly imagingPort: ImagingModelPort,
    private readonly storagePort: StoragePort,
    private readonly eventPublisher: EventPublisher
  ) {}

  /**
   * Analyze imaging for a case
   *
   * SECURITY: Never log PHI or raw imaging data
   * TODO: Add OpenTelemetry span: osax.imaging.analyze
   */
  async analyzeImaging(
    caseId: string,
    imagePath: string,
    modality: ImagingModality
  ): Promise<ImagingFindings> {
    // 1. Get signed URL (time-limited)
    // 2. Call imaging model port
    // 3. Build ImagingFindings value object
    // 4. Emit osax.imaging.screened event
    // 5. Return findings
  }
}
```

### 4.2 OsaxFinancialService

Orchestrates financial prediction workflow.

```typescript
class OsaxFinancialService {
  constructor(
    private readonly financialPort: FinancialModelPort,
    private readonly eventPublisher: EventPublisher
  ) {}

  /**
   * Predict case financial outcome
   *
   * TODO: Add OpenTelemetry span: osax.financial.predict
   */
  async predictFinancialOutcome(
    caseId: string,
    input: FinancialPredictionInput
  ): Promise<FinancialPrediction> {
    // 1. Validate input
    // 2. Call financial model port
    // 3. Emit osax.case.financial_predicted event
    // 4. Return prediction
  }
}
```

### 4.3 OsaxConciergeService

Orchestrates resource management based on case scoring.

```typescript
class OsaxConciergeService {
  constructor(
    private readonly resourcePort: ResourceSchedulerPort,
    private readonly eventPublisher: EventPublisher
  ) {}

  /**
   * Orchestrate resources based on case assessment
   *
   * Business Rule:
   * IF riskClass == GREEN AND probability >= 0.65
   *   THEN soft-hold resources
   *
   * TODO: Add OpenTelemetry span: osax.concierge.orchestrate
   */
  async orchestrateResources(
    caseId: string,
    imagingFindings: ImagingFindings,
    financialPrediction: FinancialPrediction,
    requiredResources: ResourceType[],
    durationMinutes: number
  ): Promise<ResourceBlock[]> {
    // 1. Check eligibility (GREEN + probability >= 0.65)
    // 2. Call resource scheduler port
    // 3. Emit osax.case.resources_soft_held event
    // 4. Return resource blocks
  }
}
```

---

## 5. Domain Events

### 5.1 osax.imaging.screened

```typescript
interface OsaxImagingScreenedEvent {
  readonly type: 'osax.imaging.screened';
  readonly aggregateId: string;
  readonly aggregateType: 'OsaxCase';
  readonly payload: {
    readonly caseId: string;
    readonly modality: ImagingModality;
    readonly findingsCount: number;
    readonly overallConfidence: number;
    readonly hasHighRiskFindings: boolean;
    readonly requiresReview: boolean;
    readonly analyzedAt: string;
    readonly algorithmVersion: string;
    // SECURITY: No raw findings or PHI in event
  };
  readonly metadata: OsaxEventMetadata;
}
```

### 5.2 osax.case.financial_predicted

```typescript
interface OsaxFinancialPredictedEvent {
  readonly type: 'osax.case.financial_predicted';
  readonly aggregateId: string;
  readonly aggregateType: 'OsaxCase';
  readonly payload: {
    readonly caseId: string;
    readonly probability: number;
    readonly confidence: number;
    readonly probabilityTier: 'LOW' | 'MEDIUM' | 'HIGH';
    readonly estimatedValueMin: number;
    readonly estimatedValueMax: number;
    readonly currency: string;
    readonly predictedAt: string;
    // SECURITY: No detailed factors in event for audit trail
  };
  readonly metadata: OsaxEventMetadata;
}
```

### 5.3 osax.case.resources_soft_held

```typescript
interface OsaxResourcesSoftHeldEvent {
  readonly type: 'osax.case.resources_soft_held';
  readonly aggregateId: string;
  readonly aggregateType: 'OsaxCase';
  readonly payload: {
    readonly caseId: string;
    readonly resourceBlocks: readonly {
      readonly blockId: string;
      readonly resourceType: ResourceType;
      readonly durationMinutes: number;
      readonly expiresAt: string;
    }[];
    readonly totalDurationMinutes: number;
    readonly createdAt: string;
  };
  readonly metadata: OsaxEventMetadata;
}
```

---

## 6. Adapter Implementations

### 6.1 DummyImagingAdapter (Stub)

Returns mock findings for development/testing.

```
TODO: Integrate with AI Gateway (OpenAI Vision / Google Cloud Vision / Ultralytics)
```

### 6.2 SupabaseStorageAdapter (Stub)

Returns signed URLs using Supabase Storage.

```
TODO: Implement actual Supabase Storage integration
```

### 6.3 RuleBasedFinancialPredictor

Production-ready rule-based implementation.

**Rules:**
- Base probability: 0.5
- +0.15 if hasInsurance
- +0.10 if insuranceTier == PREMIUM
- +0.05 if treatmentComplexity == LOW
- -0.10 if treatmentComplexity == HIGH
- +0.10 if patientEngagementScore > 0.7
- Final probability clamped to [0.1, 0.95]

### 6.4 DummyResourceSchedulerAdapter (Stub)

Returns successful soft-holds for development.

```
TODO: Integrate with actual scheduling system
```

---

## 7. Security Considerations

### 7.1 PHI Protection

- **Never log** raw imaging data, patient identifiers, or clinical notes
- Use signed URLs with short TTL (max 5 minutes for analysis)
- Event payloads contain only aggregate metrics, not detailed findings
- All imaging data encrypted at rest (AES-256-GCM)

### 7.2 Audit Trail

- All events are append-only (immutable)
- Events include correlation IDs for distributed tracing
- Actor IDs tracked for all operations
- Retention policy: 7 years for clinical data

### 7.3 Compliance

- HIPAA: Business Associate Agreement required for AI providers
- GDPR: Data minimization, purpose limitation
- FDA: Clinical decision support disclaimer required

---

## 8. Observability

### 8.1 OpenTelemetry Spans (TODO)

| Span Name | Attributes |
|-----------|------------|
| `osax.imaging.analyze` | modality, findingsCount, confidence |
| `osax.financial.predict` | probability, tier |
| `osax.concierge.orchestrate` | resourceCount, eligible |
| `osax.storage.signUrl` | ttlSeconds |

### 8.2 Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `osax_imaging_analysis_total` | Counter | modality, riskClass |
| `osax_imaging_analysis_duration_ms` | Histogram | modality |
| `osax_financial_prediction_total` | Counter | tier |
| `osax_resources_soft_held_total` | Counter | resourceType |

---

## 9. Implementation Checklist

- [ ] Domain Value Objects
  - [ ] ImagingFindings
  - [ ] FinancialPrediction
- [ ] Domain Entities
  - [ ] ResourceBlock
- [ ] Ports
  - [ ] ImagingModelPort
  - [ ] StoragePort
  - [ ] FinancialModelPort
  - [ ] ResourceSchedulerPort
- [ ] Domain Services
  - [ ] OsaxImagingService
  - [ ] OsaxFinancialService
  - [ ] OsaxConciergeService
- [ ] Adapters (Stubs)
  - [ ] DummyImagingAdapter
  - [ ] SupabaseStorageAdapter.stub
  - [ ] RuleBasedFinancialPredictor
  - [ ] DummyResourceSchedulerAdapter
- [ ] Events
  - [ ] osax.imaging.screened
  - [ ] osax.case.financial_predicted
  - [ ] osax.case.resources_soft_held
- [ ] Tests
  - [ ] Value Object unit tests
  - [ ] Service integration tests
  - [ ] Event emission tests

---

## 10. Future Roadmap

### v3.3 (Planned)
- Real-time imaging analysis streaming
- Multi-image case analysis
- Treatment plan generation

### v4.0 (Planned)
- Full workflow integration with trigger.dev
- Patient portal integration
- Insurance pre-authorization automation
