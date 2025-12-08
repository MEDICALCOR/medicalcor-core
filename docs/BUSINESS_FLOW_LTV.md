# Business Flow: Lifetime Value (LTV)

Documentation for MedicalCor's Patient Lifetime Value (LTV) business flow, including predicted LTV (pLTV) scoring, cohort analysis, and revenue tracking.

## Table of Contents

- [Overview](#overview)
- [LTV Architecture](#ltv-architecture)
- [Sequence Diagrams](#sequence-diagrams)
  - [Lead-to-Patient Conversion](#lead-to-patient-conversion)
  - [pLTV Scoring Flow](#pltv-scoring-flow)
  - [High-Value Patient Workflow](#high-value-patient-workflow)
  - [Collections Flow](#collections-flow)
  - [Cohort Analysis](#cohort-analysis)
- [LTV Tier System](#ltv-tier-system)
- [Key Components](#key-components)
- [Domain Events](#domain-events)
- [Business Rules](#business-rules)
- [Database Schema](#database-schema)
- [Configuration](#configuration)

---

## Overview

The LTV business flow tracks patient value from initial lead capture through conversion and ongoing treatment. It enables:

- **Predictive Scoring**: ML-based pLTV prediction for prioritizing high-value leads
- **Tier Classification**: DIAMOND/PLATINUM/GOLD/SILVER/BRONZE segmentation
- **SLA-Based Follow-up**: Automated deadlines based on patient value tier
- **Cohort Analysis**: Revenue tracking by acquisition month
- **Collections Automation**: Escalating payment reminders

### Why LTV Matters

| Challenge               | Solution                                     |
| ----------------------- | -------------------------------------------- |
| Limited sales resources | Prioritize high-LTV leads                    |
| Unknown patient value   | Predict future value from behavioral signals |
| Inconsistent follow-up  | SLA-driven response times by tier            |
| Revenue leakage         | Automated collections workflows              |
| Marketing ROI unclear   | Cohort analysis by acquisition source        |

---

## LTV Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           LTV SYSTEM ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  │
│  │   Lead       │───▶│   Scoring    │───▶│   Patient    │                  │
│  │   Capture    │    │   Service    │    │   Acquisition│                  │
│  └──────────────┘    └──────────────┘    └──────┬───────┘                  │
│                                                  │                          │
│                                                  ▼                          │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                    Case & Revenue Tracking                   │           │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │           │
│  │  │ Treatment  │  │  Payment   │  │      Collections       │ │           │
│  │  │   Cases    │  │  Records   │  │ (Overdue Detection)    │ │           │
│  │  └────────────┘  └────────────┘  └────────────────────────┘ │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                      LTV Calculation Layer                   │           │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │           │
│  │  │ Historical │  │    pLTV    │  │   Cohort Analysis      │ │           │
│  │  │    LTV     │  │  Scoring   │  │      Service           │ │           │
│  │  └────────────┘  └────────────┘  └────────────────────────┘ │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                      Tier & Actions Layer                    │           │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │           │
│  │  │   Tier     │  │    SLA     │  │   Recommended          │ │           │
│  │  │ Assignment │  │  Deadlines │  │      Actions           │ │           │
│  │  └────────────┘  └────────────┘  └────────────────────────┘ │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐           │
│  │                     Analytics & Reporting                    │           │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │           │
│  │  │ Dashboard  │  │  Revenue   │  │   Segment              │ │           │
│  │  │   Stats    │  │   Trends   │  │   Distribution         │ │           │
│  │  └────────────┘  └────────────┘  └────────────────────────┘ │           │
│  └─────────────────────────────────────────────────────────────┘           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Sequence Diagrams

### Lead-to-Patient Conversion

The complete journey from lead acquisition to patient conversion:

```mermaid
sequenceDiagram
    autonumber
    participant C as Channel<br>(WhatsApp/Voice/Web)
    participant API as API Gateway
    participant SS as Scoring Service
    participant PA as Patient Acquisition
    participant HS as HubSpot
    participant DB as Database
    participant TD as Trigger.dev

    %% Lead Capture
    C->>API: Incoming message/call
    API->>API: Verify webhook signature
    API->>TD: Trigger async processing
    API-->>C: 200 OK (immediate)

    %% Lead Registration
    TD->>PA: registerLead()
    PA->>DB: Check existing lead (phone/email)
    alt Lead exists
        PA->>DB: Update lead record
    else New lead
        PA->>DB: Create lead record
    end
    PA->>HS: Sync contact to HubSpot
    HS-->>PA: HubSpot contact ID

    %% Lead Scoring
    PA->>SS: Score initial message
    SS->>SS: AI scoring (GPT-4o)
    alt AI Available
        SS-->>PA: AI score + classification
    else AI Unavailable
        SS->>SS: Rule-based fallback
        SS-->>PA: Fallback score
    end

    %% Qualification
    PA->>PA: qualifyLead()
    PA->>DB: Update status: qualified
    PA->>HS: Update HubSpot properties

    %% Agent Assignment
    PA->>PA: assignAgent()
    Note over PA: Round-robin / skill-match / language

    %% Conversion (after follow-up)
    PA->>PA: convertToPatient()
    PA->>DB: Create patient record
    PA->>HS: Create HubSpot deal
    PA->>TD: Trigger pLTV scoring
    HS-->>PA: Deal ID
    PA-->>API: Conversion complete
```

### pLTV Scoring Flow

Predicted Lifetime Value calculation with factor analysis:

```mermaid
sequenceDiagram
    autonumber
    participant TR as Trigger.dev
    participant UC as ScorePatientPLTV<br>Use Case
    participant REP as Patient Repository
    participant PS as pLTV Scoring<br>Service
    participant EB as Event Bus
    participant DB as Database

    TR->>UC: score_patient_pltv(leadId)
    UC->>UC: Validate input

    %% Data Gathering
    UC->>REP: Fetch patient data
    REP->>DB: Query historical LTV
    REP->>DB: Query payment behavior
    REP->>DB: Query engagement metrics
    REP->>DB: Query procedure interest
    DB-->>REP: Patient data bundle
    REP-->>UC: PLTVPredictionInput

    %% Check Recency
    UC->>DB: Get last pLTV score
    alt Score < 24h old & not forced
        UC-->>TR: Return cached score
    end

    %% Calculate pLTV
    UC->>PS: calculatePLTV(input)

    Note over PS: Factor Calculation
    PS->>PS: Payment multiplier (0.7-1.3)
    PS->>PS: Engagement multiplier (0.6-1.4)
    PS->>PS: Procedure multiplier (1.0-2.5)
    PS->>PS: Retention multiplier (0.5-1.2)
    PS->>PS: Tenure multiplier (0.8-1.3)
    PS->>PS: Growth multiplier (1.0-1.45)

    PS->>PS: Apply formula:<br>Base × All Multipliers
    PS->>PS: Determine tier (DIAMOND→BRONZE)
    PS->>PS: Calculate confidence
    PS->>PS: Generate reasoning
    PS-->>UC: PLTVScoringOutput

    %% Event Emission
    UC->>EB: Emit PLTVScored

    alt Tier >= GOLD
        UC->>EB: Emit HighValuePatientIdentified
    end

    alt Tier changed from previous
        UC->>EB: Emit PLTVTierChanged
    end

    %% Persist
    UC->>DB: Save pLTV score
    UC-->>TR: Return full output
```

### High-Value Patient Workflow

Triggered when a GOLD+ tier patient is identified:

```mermaid
sequenceDiagram
    autonumber
    participant EB as Event Bus
    participant TD as Trigger.dev
    participant NS as Notification<br>Service
    participant AS as Assignment<br>Service
    participant CAL as Calendar<br>Service
    participant WA as WhatsApp<br>Service
    participant HS as HubSpot

    EB->>TD: HighValuePatientIdentified event

    Note over TD: tier: DIAMOND/PLATINUM/GOLD<br>followUpDeadline: 2h/8h/24h

    par Parallel Actions
        %% Notify Team
        TD->>NS: Send team notification
        NS->>NS: Select notification channel
        NS-->>TD: Notification sent

        %% Priority Assignment
        TD->>AS: Assign VIP coordinator
        Note over AS: DIAMOND: Dedicated coordinator<br>PLATINUM: Senior agent<br>GOLD: Priority queue
        AS-->>TD: Agent assigned

        %% Update CRM
        TD->>HS: Update contact tier
        TD->>HS: Create high-priority task
        HS-->>TD: CRM updated
    end

    %% Calculate SLA deadline
    TD->>TD: Calculate SLA deadline
    Note over TD: DIAMOND: 2 hours<br>PLATINUM: 8 hours<br>GOLD: 24 hours

    %% Schedule follow-up check
    TD->>TD: Schedule SLA breach check

    %% VIP Communication
    alt tier == DIAMOND
        TD->>WA: Send VIP welcome message
        TD->>CAL: Block priority appointment slot
    else tier == PLATINUM
        TD->>WA: Send priority callback notification
    end

    TD-->>EB: Workflow complete
```

### Collections Flow

Automated payment reminder escalation:

```mermaid
sequenceDiagram
    autonumber
    participant CR as Cron Job<br>(Daily 9 AM)
    participant OD as Overdue Detection<br>Service
    participant DB as Database
    participant TD as Trigger.dev
    participant WA as WhatsApp
    participant EM as Email Service
    participant HS as HubSpot

    CR->>OD: detectOverdueInstallments(clinicId)
    OD->>DB: Query unpaid installments
    DB-->>OD: Installments with due dates

    loop For each installment
        OD->>OD: Calculate days overdue
        OD->>OD: Determine reminder level

        Note over OD: Level thresholds:<br>First: 1 day<br>Second: 7 days<br>Final: 14 days<br>Escalated: 21+ days

        alt Days overdue >= threshold
            OD->>OD: Check last reminder date
            alt >= 3 days since last reminder
                OD->>OD: Add to reminder queue
            end
        end
    end

    OD->>OD: groupByLead()
    OD-->>CR: Overdue summary

    CR->>TD: Trigger reminder workflows

    loop For each lead with overdue
        TD->>TD: Select reminder template

        alt First Reminder
            TD->>WA: Send friendly reminder
        else Second Reminder
            TD->>WA: Send reminder + late fee warning
            TD->>EM: Send payment link email
        else Final Reminder
            TD->>WA: Send final notice
            TD->>HS: Create escalation task
        else Escalated
            TD->>HS: Flag for manual follow-up
            TD->>HS: Update deal stage: Collections
        end

        TD->>DB: Record reminder sent
    end

    TD-->>CR: Reminders processed
```

### Cohort Analysis

Monthly cohort LTV tracking and comparison:

```mermaid
sequenceDiagram
    autonumber
    participant CR as Cron Job<br>(Daily 2 AM)
    participant CA as Cohort Analysis<br>Service
    participant DB as Database
    participant MV as Materialized Views
    participant DS as Dashboard Service

    %% View Refresh
    CR->>DB: refresh_cohort_ltv_views()

    DB->>MV: Refresh cohort_ltv_monthly
    Note over MV: Aggregates by:<br>clinic_id, cohort_month,<br>acquisition_source

    DB->>MV: Refresh cohort_ltv_evolution
    Note over MV: Tracks revenue curve<br>per cohort (24 months)

    MV-->>DB: Views refreshed
    DB-->>CR: Refresh complete

    %% Dashboard Query
    DS->>CA: getCohortDashboard(clinicId, options)
    CA->>DB: Query cohort_comparison_summary
    DB-->>CA: Cohort metrics

    CA->>CA: Calculate derived metrics
    Note over CA: - Conversion rate<br>- Collection rate<br>- YoY growth<br>- Health score

    CA-->>DS: CohortDashboard

    %% Evolution Analysis
    DS->>CA: getCohortEvolution(clinicId, cohortMonth)
    CA->>DB: Query cohort_ltv_evolution
    DB-->>CA: Monthly revenue data (24 points)

    CA->>CA: Calculate evolution curve
    Note over CA: Month 0 → Month 24<br>cumulative_ltv_per_lead

    CA-->>DS: CohortEvolution[]

    %% Payback Analysis
    DS->>CA: calculatePaybackAnalysis(evolution, CAC)
    CA->>CA: Find break-even month
    Note over CA: First month where<br>cumulative_ltv >= CAC

    CA-->>DS: PaybackAnalysis
```

---

## LTV Tier System

### Tier Definitions

| Tier         | pLTV Range        | % of Patients | Investment Priority |
| ------------ | ----------------- | ------------- | ------------------- |
| **DIAMOND**  | > €50,000         | ~5%           | PRIORITATE_MAXIMA   |
| **PLATINUM** | €30,000 - €50,000 | ~10%          | PRIORITATE_RIDICATA |
| **GOLD**     | €15,000 - €30,000 | ~15%          | PRIORITATE_MEDIE    |
| **SILVER**   | €5,000 - €15,000  | ~30%          | PRIORITATE_SCAZUTA  |
| **BRONZE**   | < €5,000          | ~40%          | PRIORITATE_SCAZUTA  |

### SLA Response Times

| Tier     | Follow-up SLA | Contact Method                 |
| -------- | ------------- | ------------------------------ |
| DIAMOND  | 2 hours       | Personal call from coordinator |
| PLATINUM | 8 hours       | Priority callback              |
| GOLD     | 24 hours      | Same-day callback              |
| SILVER   | 72 hours      | Standard follow-up             |
| BRONZE   | 72 hours      | Automated nurture              |

### Recommended Actions by Tier

```
DIAMOND (>€50k)
├── Assign dedicated patient coordinator
├── Priority scheduling for all appointments
├── Personalized treatment plan presentation
├── Direct line to clinic director
└── Complimentary premium services

PLATINUM (€30-50k)
├── Personal welcome call from senior staff
├── Priority appointment slots
├── Personalized treatment recommendations
└── VIP waiting room access

GOLD (€15-30k)
├── Priority callback within 24 hours
├── Comprehensive treatment plan
├── Flexible financing options
└── Regular check-in calls

SILVER (€5-15k)
├── Standard follow-up sequence
├── Educational content delivery
├── Promotional offers
└── Recall reminders

BRONZE (<€5k)
├── Automated nurture campaigns
├── Seasonal promotional outreach
├── Re-engagement campaigns
└── Basic recall reminders
```

---

## Key Components

### Service Layer

| Component                     | Path                                                   | Purpose                       |
| ----------------------------- | ------------------------------------------------------ | ----------------------------- |
| **pLTV Scoring Service**      | `packages/domain/src/ltv/pltv-scoring-service.ts`      | Calculate predicted LTV       |
| **LTV Service**               | `packages/domain/src/ltv/ltv-service.ts`               | Dashboard metrics & analytics |
| **Cohort Analysis Service**   | `packages/domain/src/ltv/cohort-analysis-service.ts`   | Cohort LTV tracking           |
| **Overdue Detection Service** | `packages/domain/src/ltv/overdue-detection-service.ts` | Collections automation        |
| **Lead Scoring Service**      | `packages/domain/src/scoring/scoring-service.ts`       | Initial lead classification   |

### Use Cases

| Component               | Path                                                                  | Purpose                  |
| ----------------------- | --------------------------------------------------------------------- | ------------------------ |
| **Score Patient pLTV**  | `packages/domain/src/ltv/use-cases/score-patient-pltv.ts`             | Orchestrate pLTV scoring |
| **Patient Acquisition** | `packages/application/src/ports/primary/PatientAcquisitionUseCase.ts` | Lead-to-patient pipeline |

### Value Objects

| Component        | Path                                                               | Purpose                       |
| ---------------- | ------------------------------------------------------------------ | ----------------------------- |
| **PredictedLTV** | `packages/domain/src/shared-kernel/value-objects/predicted-ltv.ts` | Immutable pLTV representation |

---

## Domain Events

### pLTV Lifecycle Events

```typescript
// Emitted whenever pLTV is calculated
PLTVScored {
  leadId: string;
  clinicId: string;
  predictedLTV: number;
  previousPLTV?: number;
  tier: PLTVTier;
  growthPotential: GrowthPotential;
  confidence: number;
  reasoning: string;
}

// Triggers VIP workflows for GOLD+ patients
HighValuePatientIdentified {
  leadId: string;
  predictedLTV: number;
  tier: 'DIAMOND' | 'PLATINUM' | 'GOLD';
  followUpDeadline: Date;      // SLA deadline
  recommendedActions: string[];
  patientName?: string;
  phone: string;
}

// Detects tier upgrades/downgrades
PLTVTierChanged {
  leadId: string;
  previousTier: PLTVTier;
  newTier: PLTVTier;
  changePercentage: number;
  direction: 'upgrade' | 'downgrade';
  changeReason: string;
}

// Alerts on significant value decline
PLTVDeclineDetected {
  leadId: string;
  previousPLTV: number;
  currentPLTV: number;
  declinePercentage: number;
  riskFactors: string[];
  recommendedInterventions: string[];
}

// Batch processing events
BatchPLTVScoringStarted {
  batchId: string;
  clinicId: string;
  totalPatients: number;
}

BatchPLTVScoringCompleted {
  batchId: string;
  scored: number;
  highValueCount: number;
  totalPredictedValue: number;
  errors: number;
  durationMs: number;
}
```

---

## Business Rules

### pLTV Calculation Formula

```
Predicted LTV = Base Value
  × Payment Multiplier (0.7-1.3)
  × Engagement Multiplier (0.6-1.4)
  × Procedure Interest Multiplier (1.0-2.5)
  × Retention Multiplier (0.5-1.2)
  × Tenure Multiplier (0.8-1.3)
  × Growth Multiplier (1.0-1.45)
```

### Factor Weights

| Factor                  | Range    | Description                                         |
| ----------------------- | -------- | --------------------------------------------------- |
| **Payment Reliability** | 0.7-1.3  | Based on on-time payment rate                       |
| **Engagement**          | 0.6-1.4  | Appointments kept, referrals, NPS                   |
| **Procedure Interest**  | 1.0-2.5  | All-on-X (2.5x), Implants (1.8x), Full-mouth (2.0x) |
| **Retention**           | 0.5-1.2  | Inverse of churn risk                               |
| **Tenure**              | 0.8-1.3  | Long tenure (365+ days) = 1.3x                      |
| **Growth**              | 1.0-1.45 | Lead source bonus (referral = 1.1x)                 |

### Collections Escalation

| Level         | Days Overdue | Actions                              |
| ------------- | ------------ | ------------------------------------ |
| **First**     | 1 day        | WhatsApp reminder                    |
| **Second**    | 7 days       | WhatsApp + Email + Late fee warning  |
| **Final**     | 14 days      | Final notice + HubSpot task          |
| **Escalated** | 21+ days     | Manual follow-up + Deal stage change |

### Cohort Health Scoring

Health score (0-100) based on:

- Conversion rate weight: 30%
- Collection rate weight: 25%
- Average LTV weight: 25%
- Retention indicators: 20%

---

## Database Schema

### Materialized Views

```sql
-- cohort_ltv_monthly
-- Groups leads by acquisition month
clinic_id, cohort_month, acquisition_source, acquisition_channel
cohort_size, converted_leads, conversion_rate
total_revenue, total_collected, avg_ltv, avg_ltv_converted
collection_rate, avg_days_to_first_case

-- cohort_ltv_evolution
-- Tracks revenue accumulation per cohort
clinic_id, cohort_month, months_since_acquisition
cohort_size, period_revenue, paying_customers
cumulative_revenue, cumulative_ltv_per_lead, paying_percentage

-- cohort_comparison_summary (view)
-- Quick comparison metrics
prev_cohort_avg_ltv, ltv_growth_vs_prev
yoy_cohort_avg_ltv, ltv_growth_yoy
```

### Refresh Schedule

```sql
-- Refresh daily at 2 AM
SELECT refresh_cohort_ltv_views();

-- Query functions
SELECT * FROM get_cohort_ltv_summary(clinic_id, start_month, end_month);
SELECT * FROM get_cohort_ltv_evolution(clinic_id, cohort_month);
```

---

## Configuration

### Default Thresholds

```typescript
const PLTV_CONFIG = {
  // Tier boundaries (EUR)
  tiers: {
    DIAMOND: 50000,
    PLATINUM: 30000,
    GOLD: 15000,
    SILVER: 5000,
    BRONZE: 0,
  },

  // Activity thresholds (days)
  activity: {
    recent: 30,
    inactive: 180,
    longTenure: 365,
  },

  // Confidence thresholds
  confidence: {
    high: 0.8,
    low: 0.5,
  },

  // Rescoring interval
  rescoringIntervalHours: 24,
};
```

### Collections Configuration

```typescript
const COLLECTIONS_CONFIG = {
  // Reminder thresholds (days)
  reminders: {
    first: 1,
    second: 7,
    final: 14,
    escalated: 21,
  },

  // Rate limiting
  minDaysBetweenReminders: 3,
  maxRemindersBeforeEscalation: 3,

  // Late fees
  lateFeeEnabled: true,
  lateFeePercentage: 0.02, // 2%
  lateFeeStartDay: 7,
};
```

---

## Further Reading

- [Workflows Guide](./README/WORKFLOWS.md) - Trigger.dev task patterns
- [Architecture](./ARCHITECTURE.md) - Hexagonal architecture overview
- [API Reference](./README/API_REFERENCE.md) - REST API documentation
- [Monitoring](./README/MONITORING.md) - Metrics and alerting
- [ADR-004: Cognitive Memory](./adr/004-cognitive-episodic-memory.md) - Episodic memory system
