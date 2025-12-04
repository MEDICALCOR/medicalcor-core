# GDPR Compliance Expert

> Auto-activates when: GDPR, data protection, EU, European, personal data, data subject, consent, right to erasure, data portability, privacy policy

## Overview

MedicalCor serves dental clinics in the EU and must comply with GDPR (General Data Protection Regulation) in addition to HIPAA requirements.

## Key GDPR Principles

### 1. Lawfulness, Fairness, and Transparency
- Process data lawfully with a valid legal basis
- Be transparent about data processing
- Provide clear privacy notices

### 2. Purpose Limitation
- Collect data for specific, explicit purposes
- Don't process data for incompatible purposes

### 3. Data Minimization
- Collect only necessary data
- Don't store more than needed

### 4. Accuracy
- Keep data accurate and up-to-date
- Provide mechanisms for correction

### 5. Storage Limitation
- Don't keep data longer than necessary
- Implement retention policies

### 6. Integrity and Confidentiality
- Ensure appropriate security
- Protect against unauthorized access

## Legal Bases for Processing

For MedicalCor, the primary legal bases are:

```typescript
enum LegalBasis {
  CONSENT = 'consent',                    // Patient explicitly agrees
  CONTRACT = 'contract',                  // Necessary for service delivery
  LEGAL_OBLIGATION = 'legal_obligation',  // Required by law
  LEGITIMATE_INTEREST = 'legitimate_interest' // Business necessity
}

interface ProcessingRecord {
  dataType: string;
  purpose: string;
  legalBasis: LegalBasis;
  retentionPeriod: string;
  recipients?: string[];
}
```

## Data Subject Rights

### Implementation Patterns

#### 1. Right of Access (Article 15)
```typescript
// packages/domain/src/consent/gdpr-service.ts

export async function handleSubjectAccessRequest(
  patientId: string
): Promise<SubjectAccessResponse> {
  const patient = await patientRepo.findById(patientId);

  // Compile all data held about the patient
  const data = {
    personalInfo: patient.personalInfo,
    appointments: await appointmentRepo.findByPatientId(patientId),
    communications: await messageRepo.findByPatientId(patientId),
    consents: await consentRepo.findByPatientId(patientId),
    leadScoring: await scoringRepo.findByPatientId(patientId),
    processingActivities: getProcessingRecords()
  };

  // Log the request (audit trail)
  await auditLog.record({
    type: 'SAR_FULFILLED',
    patientId,
    timestamp: new Date()
  });

  return data;
}
```

#### 2. Right to Rectification (Article 16)
```typescript
export async function handleRectificationRequest(
  patientId: string,
  corrections: PatientDataCorrections
): Promise<void> {
  await patientRepo.update(patientId, corrections);

  await auditLog.record({
    type: 'RECTIFICATION_REQUEST',
    patientId,
    corrections: Object.keys(corrections),
    timestamp: new Date()
  });
}
```

#### 3. Right to Erasure (Article 17)
```typescript
export async function handleErasureRequest(
  patientId: string
): Promise<ErasureResult> {
  // Check for legal retention requirements
  const retentionCheck = await checkLegalRetention(patientId);

  if (retentionCheck.mustRetain) {
    return {
      success: false,
      reason: 'Data subject to legal retention requirements',
      retainedUntil: retentionCheck.retainUntil
    };
  }

  // Anonymize instead of delete (preserve statistics)
  await patientRepo.anonymize(patientId);
  await messageRepo.anonymize(patientId);
  await appointmentRepo.anonymize(patientId);

  await auditLog.record({
    type: 'ERASURE_REQUEST',
    patientId: '[ANONYMIZED]', // Don't log the actual ID after erasure
    timestamp: new Date()
  });

  return { success: true };
}
```

#### 4. Right to Data Portability (Article 20)
```typescript
export async function handlePortabilityRequest(
  patientId: string,
  format: 'json' | 'csv'
): Promise<DataExport> {
  const data = await compilePatientData(patientId);

  const export_ = format === 'json'
    ? JSON.stringify(data, null, 2)
    : convertToCSV(data);

  await auditLog.record({
    type: 'PORTABILITY_REQUEST',
    patientId,
    format,
    timestamp: new Date()
  });

  return {
    data: export_,
    format,
    generatedAt: new Date()
  };
}
```

#### 5. Right to Withdraw Consent (Article 7)
```typescript
export async function withdrawConsent(
  patientId: string,
  consentType: ConsentType
): Promise<void> {
  await consentRepo.revoke(patientId, consentType);

  // Stop all processing based on this consent
  if (consentType === 'marketing') {
    await marketingService.unsubscribe(patientId);
  }

  await auditLog.record({
    type: 'CONSENT_WITHDRAWN',
    patientId,
    consentType,
    timestamp: new Date()
  });
}
```

## Consent Management

Location: `packages/domain/src/consent/`

### Consent Record Structure
```typescript
interface ConsentRecord {
  id: string;
  patientId: string;
  type: ConsentType;
  version: string;         // Policy version consented to
  grantedAt: Date;
  expiresAt?: Date;
  withdrawnAt?: Date;
  source: 'web' | 'whatsapp' | 'voice' | 'paper';
  ipAddress?: string;
  evidenceUrl?: string;    // Link to signed form if applicable
}

enum ConsentType {
  DATA_PROCESSING = 'data_processing',    // Required for service
  MARKETING = 'marketing',                 // Optional
  THIRD_PARTY_SHARING = 'third_party',    // For integrations
  AI_PROCESSING = 'ai_processing',         // For GPT-4o scoring
  RESEARCH = 'research'                    // Optional
}
```

### Collecting Valid Consent
```typescript
// Consent must be:
// - Freely given (not bundled with service)
// - Specific (per purpose)
// - Informed (clear explanation)
// - Unambiguous (active opt-in)

const consentForm = {
  title: 'Communication Preferences',
  items: [
    {
      type: 'data_processing',
      required: true,
      description: 'We process your data to provide dental services...',
      legalBasis: 'contract'
    },
    {
      type: 'marketing',
      required: false,
      description: 'Receive promotional offers and dental care tips...',
      legalBasis: 'consent'
    },
    {
      type: 'ai_processing',
      required: false,
      description: 'Use AI to personalize your experience...',
      legalBasis: 'consent'
    }
  ]
};
```

## Data Retention

```typescript
const RETENTION_POLICIES: Record<string, string> = {
  // Medical records - legal requirement
  medical_records: '10 years after last treatment',

  // Financial records - tax requirements
  invoices: '7 years',

  // Communication logs
  messages: '3 years',

  // Marketing data
  marketing_preferences: 'until consent withdrawn',

  // Lead data (non-patients)
  leads: '2 years from last activity',

  // Anonymized analytics
  analytics: 'indefinite'
};

// Automated cleanup job
export const dataRetentionJob = task({
  id: 'data-retention-cleanup',
  cron: '0 2 * * 0', // Weekly at 2 AM Sunday
  run: async () => {
    for (const [dataType, policy] of Object.entries(RETENTION_POLICIES)) {
      await cleanupExpiredData(dataType, policy);
    }
  }
});
```

## Cross-Border Transfers

### Standard Contractual Clauses
For transfers outside the EU (e.g., to US-based services):

```typescript
interface DataTransferAgreement {
  recipient: string;
  country: string;
  safeguard: 'adequacy_decision' | 'scc' | 'bcr';
  dataTypes: string[];
  purposes: string[];
  documentUrl: string;
}

const THIRD_PARTY_TRANSFERS: DataTransferAgreement[] = [
  {
    recipient: 'OpenAI',
    country: 'US',
    safeguard: 'scc',
    dataTypes: ['anonymized lead data'],
    purposes: ['AI-powered lead scoring'],
    documentUrl: '/legal/openai-dpa.pdf'
  },
  {
    recipient: 'HubSpot',
    country: 'US',
    safeguard: 'scc',
    dataTypes: ['contact information', 'communication history'],
    purposes: ['CRM management'],
    documentUrl: '/legal/hubspot-dpa.pdf'
  }
];
```

## Privacy by Design

### Data Flow Documentation
```
Patient → Web Form → Fastify API → Database (EU)
                ↓
          WhatsApp Webhook
                ↓
          OpenAI (anonymized) → Lead Score
                ↓
          HubSpot CRM (with DPA)
```

### Technical Measures
1. **Encryption**: AES-256 at rest, TLS 1.2+ in transit
2. **Pseudonymization**: Use internal IDs, not names
3. **Access Control**: Role-based, principle of least privilege
4. **Audit Logging**: All data access logged
5. **Data Isolation**: Multi-tenant separation

## Documentation Requirements

### Records of Processing Activities (Article 30)
```typescript
const PROCESSING_ACTIVITIES = [
  {
    activity: 'Patient Registration',
    purposes: ['Service delivery', 'Appointment management'],
    categories: ['Identity', 'Contact', 'Health'],
    recipients: ['Clinic staff', 'Healthcare providers'],
    retention: '10 years after last treatment',
    security: ['Encryption', 'Access control', 'Audit logs']
  },
  {
    activity: 'Lead Scoring',
    purposes: ['Marketing optimization'],
    categories: ['Contact', 'Behavioral'],
    recipients: ['Sales team', 'OpenAI (anonymized)'],
    retention: '2 years',
    security: ['Anonymization', 'Encryption']
  }
];
```

## Breach Notification

72-hour notification requirement to supervisory authority:

```typescript
interface DataBreach {
  detectedAt: Date;
  nature: string;
  categoriesAffected: string[];
  approximateCount: number;
  consequences: string[];
  measuresTaken: string[];
  dpoNotified: boolean;
  authorityNotified?: Date;
  subjectsNotified?: Date;
}

async function handleDataBreach(breach: DataBreach): Promise<void> {
  // Log immediately
  await auditLog.record({
    type: 'DATA_BREACH',
    details: breach,
    timestamp: new Date()
  });

  // Notify DPO
  await notifyDPO(breach);

  // If high risk, notify authority within 72 hours
  if (isHighRisk(breach)) {
    await notifySupervisoryAuthority(breach);
    await notifyAffectedSubjects(breach);
  }
}
```
