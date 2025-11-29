# MedicalCor Core - Security Policy

> **Classification**: CONFIDENTIAL
>
> This document outlines security policies and practices for MedicalCor Core.
> All team members must understand and follow these guidelines.

---

## Table of Contents

1. [Security Overview](#1-security-overview)
2. [Regulatory Compliance](#2-regulatory-compliance)
3. [Data Protection](#3-data-protection)
4. [Authentication & Authorization](#4-authentication--authorization)
5. [Encryption Standards](#5-encryption-standards)
6. [Row Level Security (RLS)](#6-row-level-security-rls)
7. [API Security](#7-api-security)
8. [Infrastructure Security](#8-infrastructure-security)
9. [Audit Logging](#9-audit-logging)
10. [Vulnerability Management](#10-vulnerability-management)
11. [Incident Response](#11-incident-response)
12. [Security Checklist for Developers](#12-security-checklist-for-developers)

---

## 1. Security Overview

### Security Principles

MedicalCor Core follows these core security principles:

1. **Defense in Depth** - Multiple layers of security controls
2. **Least Privilege** - Minimum access needed to perform tasks
3. **Zero Trust** - Verify everything, trust nothing
4. **Security by Design** - Security built in, not bolted on
5. **Fail Secure** - System fails to a secure state

### Threat Model

| Asset | Threats | Controls |
|-------|---------|----------|
| Patient Data | Unauthorized access, data breach | RLS, encryption, audit logs |
| API Endpoints | Injection, CSRF, abuse | Input validation, rate limiting |
| Authentication | Credential theft, session hijacking | MFA, secure sessions |
| Infrastructure | Unauthorized access, DDoS | Network policies, WAF |

---

## 2. Regulatory Compliance

### GDPR (General Data Protection Regulation)

MedicalCor must comply with GDPR for EU patients:

| Requirement | Implementation |
|-------------|----------------|
| Data Minimization | Collect only necessary data |
| Purpose Limitation | Use data only for stated purposes |
| Right to Access | Data export functionality |
| Right to Erasure | Soft delete + hard delete after retention |
| Data Portability | Export in standard formats |
| Consent Management | Explicit consent tracking |

### CMSR 2025 (Romanian Medical Data Regulation)

Specific requirements for Romanian medical data:

| Requirement | Implementation |
|-------------|----------------|
| Data Localization | EU-based infrastructure |
| Encryption | AES-256 for data at rest |
| Access Logging | Complete audit trail |
| Retention Periods | 10 years for medical records |
| Anonymization | De-identification for analytics |

### Compliance Checklist

- [ ] Privacy policy is up to date
- [ ] Consent mechanisms are working
- [ ] Data retention policies are enforced
- [ ] Access logs are retained for required period
- [ ] DPO contact is published
- [ ] Breach notification procedures are documented

---

## 3. Data Protection

### Data Classification

| Level | Description | Examples | Controls |
|-------|-------------|----------|----------|
| **Critical** | Highly sensitive personal data | Medical records, diagnoses | Encryption + RLS + audit |
| **Sensitive** | Personal identifiable information | Name, email, phone | Encryption + RLS |
| **Internal** | Business data | Appointments, settings | Access control |
| **Public** | Non-sensitive data | Public content | Standard controls |

### Data Handling Rules

1. **Never log sensitive data**
   ```typescript
   // Bad
   console.log('Patient data:', patient);

   // Good
   console.log('Processing patient:', patient.id);
   ```

2. **Mask sensitive data in responses**
   ```typescript
   // Return masked CNP (Romanian ID)
   const maskedCnp = cnp.slice(0, 1) + '******' + cnp.slice(-4);
   ```

3. **Secure data deletion**
   ```typescript
   // Soft delete first (for recovery)
   await db.patient.update({
     where: { id },
     data: { deletedAt: new Date() }
   });

   // Hard delete after retention period
   await db.patient.delete({ where: { id } });
   ```

### Data Retention

| Data Type | Retention Period | After Expiry |
|-----------|------------------|--------------|
| Medical Records | 10 years | Archive then delete |
| Audit Logs | 7 years | Archive then delete |
| Session Data | 30 days | Auto-delete |
| Temporary Files | 24 hours | Auto-delete |

---

## 4. Authentication & Authorization

### Authentication Methods

| Method | Use Case | Security Level |
|--------|----------|----------------|
| Email/Password | Standard login | Medium |
| OAuth (Google) | SSO | High |
| Magic Links | Passwordless | Medium |
| MFA (TOTP) | Additional factor | High |

### Password Policy

- Minimum 12 characters
- Must include: uppercase, lowercase, number, special character
- Not in common password lists
- Cannot reuse last 5 passwords
- Expires after 90 days (for admin accounts)

### Session Management

```typescript
// Session configuration
{
  maxAge: 24 * 60 * 60, // 24 hours
  secure: true,         // HTTPS only
  httpOnly: true,       // No JavaScript access
  sameSite: 'strict',   // CSRF protection
  rolling: true         // Extend on activity
}
```

### Authorization Model

We use Role-Based Access Control (RBAC):

| Role | Permissions |
|------|-------------|
| `admin` | Full access |
| `doctor` | Read/write own patients, appointments |
| `receptionist` | Read/write appointments, limited patient data |
| `patient` | Read own data only |

```typescript
// Authorization check example
async function checkAccess(user: User, resource: Resource): Promise<boolean> {
  // Admin has full access
  if (user.role === 'admin') return true;

  // Check resource-specific policies
  return await evaluatePolicy(user, resource);
}
```

---

## 5. Encryption Standards

### Encryption at Rest

| Data Type | Algorithm | Key Size |
|-----------|-----------|----------|
| Database fields | AES-256-GCM | 256-bit |
| File storage | AES-256-CBC | 256-bit |
| Backups | AES-256 | 256-bit |

### Encryption in Transit

- TLS 1.3 required for all connections
- Strong cipher suites only
- HSTS enabled with preload
- Certificate pinning for mobile apps

### Key Management

```typescript
// Key rotation procedure (automated)
async function rotateEncryptionKey() {
  // 1. Generate new key
  const newKey = await generateKey();

  // 2. Re-encrypt data in batches
  await reencryptAllData(currentKey, newKey);

  // 3. Update key in secrets manager
  await updateSecrets(newKey);

  // 4. Archive old key (for recovery)
  await archiveKey(currentKey);
}
```

### Encryption Service Usage

```typescript
import { encryptionService } from '@/lib/encryption';

// Encrypt sensitive data before storage
const encryptedCnp = await encryptionService.encrypt(patientCnp);
await db.patient.create({
  data: { cnp: encryptedCnp }
});

// Decrypt when reading
const patient = await db.patient.findUnique({ where: { id } });
const cnp = await encryptionService.decrypt(patient.cnp);
```

---

## 6. Row Level Security (RLS)

### RLS Implementation

All tables with patient data must have RLS policies:

```sql
-- Enable RLS on table
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own patients
CREATE POLICY "Users see own patients"
ON patients
FOR SELECT
USING (
  organization_id = current_setting('app.organization_id')::uuid
);

-- Policy: Doctors can only update their assigned patients
CREATE POLICY "Doctors update assigned patients"
ON patients
FOR UPDATE
USING (
  doctor_id = current_setting('app.user_id')::uuid
  OR organization_id = current_setting('app.organization_id')::uuid
);
```

### Setting RLS Context

```typescript
// Set RLS context before queries
async function setRlsContext(userId: string, orgId: string) {
  await db.$executeRaw`
    SELECT set_config('app.user_id', ${userId}, true);
    SELECT set_config('app.organization_id', ${orgId}, true);
  `;
}
```

### RLS Audit

Regular RLS audits must verify:
- [ ] All sensitive tables have RLS enabled
- [ ] Policies cover all CRUD operations
- [ ] No policies use `USING (true)` without justification
- [ ] Cross-tenant queries are impossible

---

## 7. API Security

### Input Validation

All API inputs must be validated using Zod:

```typescript
import { z } from 'zod';

const patientSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  cnp: z.string().regex(/^[1-9]\d{12}$/),
  birthDate: z.string().datetime()
});

// In route handler
const result = patientSchema.safeParse(request.body);
if (!result.success) {
  return Response.json({ error: result.error }, { status: 400 });
}
```

### Rate Limiting

| Endpoint Type | Rate Limit | Window |
|---------------|------------|--------|
| Authentication | 5 requests | 1 minute |
| API general | 100 requests | 1 minute |
| File upload | 10 requests | 1 minute |
| Search | 30 requests | 1 minute |

### CORS Configuration

```typescript
const corsOptions = {
  origin: ['https://app.medicalcor.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400
};
```

### Security Headers

Required headers for all responses:

```typescript
{
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Content-Security-Policy': "default-src 'self'",
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

---

## 8. Infrastructure Security

### Network Security

- VPC with private subnets for databases
- Security groups with minimal ports open
- WAF for DDoS protection
- No public IPs on database servers

### Secret Management

- Use environment variables (never hardcode)
- Secrets in secure vault (Supabase secrets, Vercel env)
- Rotate secrets quarterly
- Different secrets per environment

### Container Security

- Minimal base images (distroless/alpine)
- No root user in containers
- Read-only file systems where possible
- Regular vulnerability scans

---

## 9. Audit Logging

### What to Log

| Event Type | Details to Log |
|------------|----------------|
| Authentication | User, IP, success/failure, method |
| Authorization | User, resource, action, result |
| Data Access | User, record type, record ID |
| Data Modification | User, record, old/new values (hashed) |
| Admin Actions | User, action, target, parameters |

### Log Format

```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "info",
  "event": "data.access",
  "userId": "user-123",
  "resourceType": "patient",
  "resourceId": "patient-456",
  "action": "read",
  "ip": "192.168.1.1",
  "userAgent": "Mozilla/5.0...",
  "organizationId": "org-789"
}
```

### Log Retention

- Keep logs for minimum 7 years (regulatory requirement)
- Encrypt logs at rest
- Immutable log storage
- Regular log integrity checks

---

## 10. Vulnerability Management

### Dependency Scanning

```bash
# Run weekly
pnpm audit

# Check for updates
pnpm outdated
```

### Vulnerability Response

| Severity | Response Time | Action |
|----------|---------------|--------|
| Critical | 24 hours | Immediate patch + deploy |
| High | 72 hours | Priority patch |
| Medium | 2 weeks | Scheduled patch |
| Low | Next release | Include in regular cycle |

### Security Testing

- [ ] Quarterly penetration testing
- [ ] Monthly dependency audits
- [ ] Continuous SAST in CI
- [ ] Annual security review

---

## 11. Incident Response

### Incident Classification

| Level | Description | Example |
|-------|-------------|---------|
| P1 | Critical - Data breach | Unauthorized data access |
| P2 | High - System compromise | Server intrusion |
| P3 | Medium - Vulnerability | Exploitable bug |
| P4 | Low - Minor issue | Failed attack attempt |

### Response Procedure

1. **Detect** - Identify the incident
2. **Contain** - Stop the spread
3. **Eradicate** - Remove the threat
4. **Recover** - Restore services
5. **Learn** - Post-incident review

### Communication

- P1/P2: Notify within 1 hour
- GDPR breach: Notify authority within 72 hours
- Affected users: Notify as required by law

### Contacts

| Role | Responsibility |
|------|----------------|
| Security Lead | Incident command |
| Tech Lead | Technical response |
| Legal | Regulatory compliance |
| Communications | External messaging |

---

## 12. Security Checklist for Developers

### Before Writing Code

- [ ] Understand the data sensitivity level
- [ ] Plan for input validation
- [ ] Consider authorization requirements
- [ ] Review relevant security policies

### During Development

- [ ] No hardcoded secrets
- [ ] All inputs validated with Zod
- [ ] Outputs properly encoded
- [ ] Parameterized queries only
- [ ] Appropriate error handling (no stack traces to users)
- [ ] Logging doesn't include sensitive data

### Before Committing

```bash
# Check for secrets
git diff --staged | grep -iE '(password|secret|key|token)'

# Run security lint
pnpm audit
```

### Code Review Focus

- [ ] Authentication/authorization correct
- [ ] Input validation complete
- [ ] No SQL/XSS/CSRF vulnerabilities
- [ ] Sensitive data handling appropriate
- [ ] Error messages don't leak info
- [ ] Logging is appropriate

---

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do NOT** create a public GitHub issue
2. Email security concerns to the Tech Lead
3. Provide detailed reproduction steps
4. Allow time for fix before disclosure

We take security seriously and appreciate responsible disclosure.

---

> **Remember**: Security is everyone's responsibility. When in doubt, ask!
