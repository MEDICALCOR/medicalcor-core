# Refactoring Analysis: Large File Candidates

This document analyzes three large files identified as refactoring candidates and provides specific, actionable recommendations for improving code organization, maintainability, and testability.

## Summary

| File                                            | Lines | Primary Issues                                                  | Priority |
| ----------------------------------------------- | ----- | --------------------------------------------------------------- | -------- |
| `apps/web/src/app/actions/get-patients.ts`      | 1447  | Mixed concerns, multiple domains in one file                    | High     |
| `apps/trigger/src/workflows/patient-journey.ts` | 941   | Multiple workflows, helper functions mixed with business logic  | Medium   |
| `apps/trigger/src/jobs/cron-jobs.ts`            | 930   | Multiple cron jobs, repeated patterns, date utilities scattered | Medium   |

---

## 1. `apps/web/src/app/actions/get-patients.ts` (1447 lines)

### Current Structure Analysis

This file contains server actions for multiple unrelated domains:

- Dashboard statistics
- Patient/lead listing
- Triage board management
- Calendar/scheduling
- Analytics
- Messaging/conversations
- Patient details

### Issues Identified

1. **Single Responsibility Violation**: File handles 6+ distinct feature domains
2. **Type Definitions Scattered**: 15+ interfaces defined inline instead of shared types
3. **Helper Functions Mixed with Actions**: Utility functions (masking, formatting) mixed with business logic
4. **Large Analytics Action**: `getAnalyticsDataAction` spans 330 lines (lines 865-1195)

### Recommended Refactoring

#### Phase 1: Extract Types (Low Risk)

Create `apps/web/src/app/actions/types/` directory:

```
types/
├── triage.types.ts      # TriageLead, TriageColumn
├── calendar.types.ts    # CalendarSlot
├── analytics.types.ts   # AnalyticsMetrics, TimeSeriesPoint, LeadsBySource,
│                        # ConversionFunnelStep, TopProcedure, OperatorPerformance, AnalyticsData
├── messages.types.ts    # Conversation, Message
└── patient.types.ts     # PatientDetailData, PatientTimelineEvent
```

#### Phase 2: Extract Utilities (Low Risk)

Create `apps/web/src/app/actions/utils/`:

```typescript
// utils/hubspot-mappers.ts
export function mapHubSpotStageToStatus(stage?: string): PatientStatus { ... }
export function mapScoreToClassification(score?: string): LeadClassification { ... }
export function mapLeadSource(source?: string): LeadSource { ... }

// utils/formatters.ts
export function maskPhone(phone: string): string { ... }
export function formatRelativeTime(date: string): string { ... }

// utils/clients.ts
export function getHubSpotClient(): HubSpotClient { ... }
export function getStripeClient(): StripeClient | MockStripeClient { ... }
export function getSchedulingService(): SchedulingService { ... }
```

#### Phase 3: Split Actions by Domain (Medium Risk)

Create separate action files:

```
actions/
├── get-patients.ts           # getPatientsAction, getPatientsActionPaginated (keep as main)
├── get-dashboard.ts          # getDashboardStatsAction, getRecentLeadsAction
├── get-triage.ts             # getTriageLeadsAction
├── get-calendar.ts           # getCalendarSlotsAction
├── get-analytics.ts          # getAnalyticsDataAction (largest - 330 lines)
├── get-messages.ts           # getConversationsAction, getMessagesAction
├── get-patient-detail.ts     # getPatientByIdAction, getPatientTimelineAction
├── types/
│   └── index.ts              # Re-exports all types
└── utils/
    └── index.ts              # Re-exports all utilities
```

### Specific Line Ranges for Extraction

| New File                   | Lines in Original    | Functions/Interfaces                                                   |
| -------------------------- | -------------------- | ---------------------------------------------------------------------- |
| `utils/hubspot-mappers.ts` | 119-174              | `mapHubSpotStageToStatus`, `mapScoreToClassification`, `mapLeadSource` |
| `utils/formatters.ts`      | 177-204              | `maskPhone`, `formatRelativeTime`                                      |
| `utils/clients.ts`         | 40-75                | `getHubSpotClient`, `getStripeClient`, `getSchedulingService`          |
| `types/triage.types.ts`    | 493-510              | `TriageLead`, `TriageColumn`                                           |
| `types/calendar.types.ts`  | 716-725              | `CalendarSlot`                                                         |
| `types/analytics.types.ts` | 803-859              | All analytics interfaces                                               |
| `types/messages.types.ts`  | 1200-1224            | `Conversation`, `Message`                                              |
| `types/patient.types.ts`   | 1353-1369, 1425-1430 | `PatientDetailData`, `PatientTimelineEvent`                            |
| `get-dashboard.ts`         | 321-452              | `getRecentLeadsAction`, `getDashboardStatsAction`                      |
| `get-triage.ts`            | 516-710              | `getTriageLeadsAction`                                                 |
| `get-calendar.ts`          | 730-796              | `getCalendarSlotsAction`                                               |
| `get-analytics.ts`         | 865-1194             | `getAnalyticsDataAction`                                               |
| `get-messages.ts`          | 1231-1347            | `getConversationsAction`, `getMessagesAction`                          |
| `get-patient-detail.ts`    | 1375-1447            | `getPatientByIdAction`, `getPatientTimelineAction`                     |

### Expected Outcome

After refactoring:

- Main file: ~300 lines (patient listing + shared imports)
- Each domain file: 80-330 lines (focused, testable)
- Utilities: ~100 lines (reusable across actions)
- Types: ~150 lines (shared, documented)

---

## 2. `apps/trigger/src/workflows/patient-journey.ts` (941 lines)

### Current Structure Analysis

This file contains three distinct workflows:

- `patientJourneyWorkflow` (main orchestration)
- `nurtureSequenceWorkflow` (automated nurture sequences)
- `bookingAgentWorkflow` (appointment booking)

Plus helper functions for formatting and localization.

### Issues Identified

1. **Multiple Workflows in One File**: Three workflows with different responsibilities
2. **Localization Inline**: Translation strings embedded in code (lines 731-771)
3. **Helper Functions at End**: 200+ lines of helpers mixed with workflow definitions
4. **Large Booking Workflow**: `bookingAgentWorkflow` spans 350 lines (lines 370-722)

### Recommended Refactoring

#### Phase 1: Extract Localization (Low Risk)

Create `apps/trigger/src/workflows/i18n/`:

```typescript
// i18n/booking-messages.ts
export const bookingMessages = {
  slots_header: {
    ro: 'Programări Disponibile',
    en: 'Available Appointments',
    de: 'Verfügbare Termine',
  },
  // ... all other messages from lines 732-770
};

export function getLocalizedMessage(
  key: keyof typeof bookingMessages,
  language: 'ro' | 'en' | 'de'
): string { ... }
```

#### Phase 2: Extract Formatters (Low Risk)

Create `apps/trigger/src/workflows/utils/`:

```typescript
// utils/slot-formatters.ts
export function formatSlotsMessage(...) { ... }
export function formatSlotDescription(...) { ... }
export function formatSlotsFallbackText(...) { ... }
export function formatAppointmentDetails(...) { ... }

// utils/event-emitter.ts
export async function emitEvent(...) { ... }
```

#### Phase 3: Split Workflows (Medium Risk)

```
workflows/
├── patient-journey.ts        # Main orchestration workflow only
├── nurture-sequence.ts       # Nurture sequence workflow
├── booking-agent.ts          # Booking agent workflow
├── i18n/
│   └── booking-messages.ts   # Localization strings
└── utils/
    ├── slot-formatters.ts    # Slot formatting helpers
    └── event-emitter.ts      # Domain event helper
```

### Specific Line Ranges for Extraction

| New File                   | Lines in Original | Content                                                   |
| -------------------------- | ----------------- | --------------------------------------------------------- |
| `i18n/booking-messages.ts` | 731-771           | `getLocalizedMessage` + message objects                   |
| `utils/slot-formatters.ts` | 776-904           | All formatting functions                                  |
| `utils/event-emitter.ts`   | 909-941           | `emitEvent` helper                                        |
| `nurture-sequence.ts`      | 245-342           | `NurtureSequencePayloadSchema`, `nurtureSequenceWorkflow` |
| `booking-agent.ts`         | 355-722           | `BookingAgentPayloadSchema`, `bookingAgentWorkflow`       |

### Expected Outcome

After refactoring:

- `patient-journey.ts`: ~240 lines (main workflow + imports)
- `nurture-sequence.ts`: ~100 lines (focused workflow)
- `booking-agent.ts`: ~370 lines (includes booking logic)
- Utilities: ~200 lines (reusable formatters)

---

## 3. `apps/trigger/src/jobs/cron-jobs.ts` (930 lines)

### Current Structure Analysis

This file contains six scheduled cron jobs:

- `dailyRecallCheck` - Patient recall reminders
- `appointmentReminders` - Appointment reminders (24h and 2h)
- `leadScoringRefresh` - Re-score stale leads
- `weeklyAnalyticsReport` - Weekly metrics
- `staleLeadCleanup` - Archive old leads
- `gdprConsentAudit` - GDPR compliance checks

### Issues Identified

1. **Multiple Cron Jobs in One File**: Six unrelated scheduled tasks
2. **Repeated Date Utility Patterns**: Multiple similar date calculation functions
3. **Batch Processing Duplication**: Same pattern used across jobs
4. **HubSpot Search Patterns**: Similar search queries repeated

### Recommended Refactoring

#### Phase 1: Extract Date Utilities (Low Risk)

Create `apps/trigger/src/utils/`:

```typescript
// utils/date-helpers.ts
export function generateCorrelationId(): string { ... }
export function daysAgo(days: number): string { ... }
export function monthsAgo(months: number): string { ... }
export function isWithinHours(dateStr: string, minHours: number, maxHours: number): boolean { ... }
export function formatDate(dateStr: string, language: 'ro' | 'en' | 'de'): string { ... }
export function formatTime(dateStr: string): string { ... }
```

This consolidates:

- `sixMonthsAgo()` → `monthsAgo(6)`
- `sevenDaysAgo()` → `daysAgo(7)`
- `ninetyDaysAgo()` → `daysAgo(90)`
- `almostTwoYearsAgo()` → `monthsAgo(23)`
- `isIn24Hours()` → `isWithinHours(date, 23, 25)`
- `isIn2Hours()` → `isWithinHours(date, 1.5, 2.5)`

#### Phase 2: Extract Batch Processing (Low Risk)

Create shared utility:

```typescript
// utils/batch-processor.ts
export const BATCH_SIZE = 10;

export async function processBatch<T>(
  items: T[],
  processor: (item: T) => Promise<void>,
  logger: Logger
): Promise<BatchResult<T>> { ... }

export interface BatchResult<T> {
  successes: number;
  errors: Array<{ item: T; error: unknown }>;
}
```

#### Phase 3: Group Cron Jobs by Domain (Medium Risk)

```
jobs/
├── index.ts                     # Re-exports all cron jobs
├── recall-jobs.ts               # dailyRecallCheck
├── appointment-jobs.ts          # appointmentReminders
├── lead-management-jobs.ts      # leadScoringRefresh, staleLeadCleanup
├── analytics-jobs.ts            # weeklyAnalyticsReport
├── compliance-jobs.ts           # gdprConsentAudit
└── shared/
    ├── date-helpers.ts          # Date utilities
    ├── batch-processor.ts       # Batch processing
    └── event-emitter.ts         # Job event helper
```

### Specific Line Ranges for Extraction

| New File                    | Lines in Original | Content                                       |
| --------------------------- | ----------------- | --------------------------------------------- |
| `shared/date-helpers.ts`    | 96-152            | All date helper functions                     |
| `shared/batch-processor.ts` | 50-90             | `BATCH_SIZE`, `processBatch`                  |
| `shared/event-emitter.ts`   | 907-929           | `emitJobEvent`                                |
| `recall-jobs.ts`            | 161-251           | `dailyRecallCheck`                            |
| `appointment-jobs.ts`       | 257-443           | `appointmentReminders`                        |
| `lead-management-jobs.ts`   | 450-550, 675-747  | `leadScoringRefresh`, `staleLeadCleanup`      |
| `analytics-jobs.ts`         | 557-668, 878-902  | `weeklyAnalyticsReport`, `formatWeeklyReport` |
| `compliance-jobs.ts`        | 754-868           | `gdprConsentAudit`                            |

### Expected Outcome

After refactoring:

- Each job file: 100-200 lines (focused, testable)
- Shared utilities: ~100 lines (reusable across jobs)
- Index file: ~20 lines (clean re-exports)

---

## Implementation Priority

### High Priority (Do First)

1. **Extract types from `get-patients.ts`**
   - Low risk, high value
   - Improves IDE experience and documentation
   - Enables better type reuse

2. **Extract date utilities from `cron-jobs.ts`**
   - Low risk, reduces duplication
   - Creates reusable utilities for other modules

### Medium Priority

3. **Split `get-patients.ts` into domain files**
   - Medium risk, high value
   - Most impactful change for maintainability
   - Requires updating imports in consumers

4. **Extract batch processor utility**
   - Low risk, medium value
   - Standardizes error handling across jobs

### Lower Priority

5. **Split `patient-journey.ts` workflows**
   - Medium risk, medium value
   - Workflows are logically connected

6. **Split `cron-jobs.ts` by domain**
   - Medium risk, medium value
   - Jobs are independent but share patterns

---

## Testing Considerations

### Before Refactoring

1. Ensure existing tests pass for each file
2. Add tests for untested utility functions
3. Document current behavior for regression testing

### During Refactoring

1. Use git commits at each phase
2. Run tests after each extraction
3. Use TypeScript's type checking to catch import issues

### After Refactoring

1. Verify all re-exports work correctly
2. Check for circular dependency issues
3. Ensure tree-shaking works as expected

---

## Migration Notes

### Backward Compatibility

When splitting files, maintain re-exports in original locations temporarily:

```typescript
// get-patients.ts (temporary)
export * from './get-dashboard';
export * from './get-triage';
export * from './get-analytics';
// ... deprecation notices with timeline
```

### Import Updates

After splitting, update imports across the codebase:

```typescript
// Before
import { getAnalyticsDataAction, AnalyticsData } from '@/app/actions/get-patients';

// After
import { getAnalyticsDataAction } from '@/app/actions/get-analytics';
import type { AnalyticsData } from '@/app/actions/types';
```

---

## Metrics for Success

After refactoring:

- No single file exceeds 400 lines
- Each file has a single clear responsibility
- Utility functions are tested independently
- Types are documented and reusable
- Import paths are intuitive and consistent
