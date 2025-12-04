# HIPAA Compliance Expert

> Auto-activates when: HIPAA, PHI, protected health information, patient data, healthcare compliance, medical privacy, patient privacy, encryption, audit log

## Overview

This skill provides guidance on HIPAA compliance for the MedicalCor medical CRM platform, ensuring proper handling of Protected Health Information (PHI).

## HIPAA Key Requirements

### Protected Health Information (PHI)

PHI includes any individually identifiable health information:
- Patient names, addresses, dates (birth, admission, discharge, death)
- Phone numbers, fax numbers, email addresses
- Social Security numbers, medical record numbers
- Health plan beneficiary numbers
- Account numbers, certificate/license numbers
- Vehicle identifiers, device identifiers
- Web URLs, IP addresses
- Biometric identifiers, photographs
- Any other unique identifying number or code

### Technical Safeguards

#### 1. Access Control (§164.312(a))
```typescript
// Example: Role-based access control
interface AccessControl {
  userId: string;
  role: 'admin' | 'provider' | 'staff' | 'patient';
  permissions: Permission[];
  accessLevel: 'full' | 'limited' | 'read-only';
}

// Implement minimum necessary access
const canAccessPatientData = (user: User, patient: Patient): boolean => {
  return user.hasActiveRelationship(patient) &&
         user.hasPermission('read:patient-records');
};
```

#### 2. Encryption (§164.312(a)(2)(iv))
```typescript
// Data at rest - use AES-256
import { encrypt, decrypt } from '@medicalcor/core/encryption';

// Data in transit - enforce TLS 1.2+
// Configure in Fastify:
const fastify = Fastify({
  https: {
    minVersion: 'TLSv1.2',
    key: fs.readFileSync('key.pem'),
    cert: fs.readFileSync('cert.pem')
  }
});
```

#### 3. Audit Controls (§164.312(b))
```typescript
// Log all PHI access
import { logger } from '@medicalcor/core/logger';

logger.audit({
  action: 'PHI_ACCESS',
  userId: user.id,
  patientId: patient.id,
  resourceType: 'medical_record',
  resourceId: record.id,
  timestamp: new Date().toISOString(),
  ipAddress: request.ip
});
```

#### 4. Integrity Controls (§164.312(c)(1))
```typescript
// Implement data integrity verification
interface AuditableRecord {
  id: string;
  data: EncryptedData;
  checksum: string;
  lastModified: Date;
  modifiedBy: string;
}
```

#### 5. Transmission Security (§164.312(e)(1))
- Always use HTTPS/TLS for API communications
- Encrypt email containing PHI
- Secure WebSocket connections for real-time features

### MedicalCor Compliance Implementation

#### Consent Management
Location: `packages/domain/src/consent/`
```typescript
// Always obtain and verify consent before processing PHI
const consent = await consentService.getPatientConsent(patientId);
if (!consent.isValid() || !consent.covers('data-processing')) {
  throw new ConsentRequiredError('Valid consent required for this operation');
}
```

#### Data Minimization
```typescript
// Return only necessary fields
const patientSummary = await patientRepo.findById(id, {
  select: ['id', 'firstName', 'lastName', 'appointmentDate'],
  // Don't include: SSN, full address, medical history, etc.
});
```

#### Secure Logging
```typescript
// Never log PHI directly
import { logger } from '@medicalcor/core/logger';

// BAD - logs PHI
logger.info('Processing patient: ' + patient.ssn);

// GOOD - logs only identifiers
logger.info('Processing patient', { patientId: patient.id });
```

### Business Associate Agreements (BAA)

Required for all third-party services that may access PHI:
- **OpenAI** - BAA required for GPT-4o lead scoring
- **HubSpot** - BAA required for CRM integration
- **WhatsApp Business** - BAA required for patient communication
- **Vapi** - BAA required for voice services
- **Database hosting** - BAA with cloud provider

### Breach Notification

Implement breach detection and notification:
```typescript
interface BreachReport {
  detectedAt: Date;
  affectedPatients: string[];
  dataTypes: string[];
  cause: string;
  containmentActions: string[];
  notificationStatus: 'pending' | 'notified' | 'resolved';
}

// Notify within 60 days of discovery
// Individual notification to affected patients
// HHS notification if 500+ affected
```

## Best Practices

1. **Encrypt PHI at rest and in transit**
2. **Implement role-based access control**
3. **Log all PHI access for audit trails**
4. **Train all team members on HIPAA**
5. **Conduct regular risk assessments**
6. **Maintain BAAs with all vendors**
7. **Implement automatic session timeout**
8. **Use unique user identification**
9. **Implement emergency access procedures**
10. **Regular backup and disaster recovery testing**

## Common Pitfalls to Avoid

- Storing PHI in logs or error messages
- Sending PHI via unencrypted email
- Using shared accounts or credentials
- Lacking proper audit trails
- Inadequate access termination procedures
- Missing or outdated BAAs
