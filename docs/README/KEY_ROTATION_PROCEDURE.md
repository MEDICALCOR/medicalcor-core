# Key Rotation Procedure

Comprehensive guide for rotating secrets and encryption keys in MedicalCor Core production environments.

## Table of Contents

- [Overview](#overview)
- [Rotation Schedule](#rotation-schedule)
- [Encryption Key Rotation](#encryption-key-rotation)
- [API Secret Rotation](#api-secret-rotation)
- [Third-Party API Keys](#third-party-api-keys)
- [Webhook Secrets](#webhook-secrets)
- [Database Credentials](#database-credentials)
- [Emergency Rotation](#emergency-rotation)
- [Verification Checklist](#verification-checklist)

---

## Overview

All secrets in MedicalCor Core are designed to be rotatable without code changes. Secrets are loaded from environment variables and validated at startup using `@medicalcor/core/secrets-validator`.

### Rotation Principles

| Principle           | Description                                   |
| ------------------- | --------------------------------------------- |
| **Zero Downtime**   | All rotations support rolling updates         |
| **Dual-Key Period** | New key active before old key retired         |
| **Audit Trail**     | All rotations logged with fingerprints        |
| **Rollback Ready**  | Previous keys retained for emergency rollback |

---

## Rotation Schedule

| Secret Type          | Recommended Interval | Mandatory After       |
| -------------------- | -------------------- | --------------------- |
| DATA_ENCRYPTION_KEY  | 90 days              | Key compromise        |
| MFA_ENCRYPTION_KEY   | 90 days              | Key compromise        |
| API_SECRET_KEY       | 90 days              | Personnel change      |
| NEXTAUTH_SECRET      | 90 days              | Personnel change      |
| HUBSPOT_ACCESS_TOKEN | 1 year               | Token expiry          |
| OPENAI_API_KEY       | 1 year               | Billing/access change |
| STRIPE_SECRET_KEY    | 1 year               | As needed             |
| Webhook Secrets      | 6 months             | Integration change    |

---

## Encryption Key Rotation

The `DATA_ENCRYPTION_KEY` protects PHI/PII data at rest. Rotation re-encrypts all data with the new key.

### Prerequisites

1. Database backup completed
2. Maintenance window scheduled (data re-encryption may take time)
3. New key generated: `openssl rand -hex 32`

### Procedure

#### Step 1: Generate New Key

```bash
# Generate a new 32-byte encryption key
NEW_KEY=$(openssl rand -hex 32)
echo "New key: $NEW_KEY"
echo "Store this securely in your secrets manager!"
```

#### Step 2: Add New Key to Secret Manager (GCP)

```bash
# Create new version of the secret
echo -n "$NEW_KEY" | gcloud secrets versions add DATA_ENCRYPTION_KEY --data-file=-

# Verify the new version
gcloud secrets versions list DATA_ENCRYPTION_KEY
```

#### Step 3: Update Application Configuration

For Cloud Run deployments:

```bash
# Update the Cloud Run service with the new secret
gcloud run services update medicalcor-api \
  --update-secrets=DATA_ENCRYPTION_KEY=DATA_ENCRYPTION_KEY:latest \
  --region=us-central1
```

#### Step 4: Trigger Key Rotation in Application

The application provides a key rotation endpoint (admin only):

```bash
# Trigger rotation via API (requires admin API key)
curl -X POST https://api.medicalcor.io/admin/rotate-encryption-key \
  -H "X-Api-Key: $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"newKeyHex": "'$NEW_KEY'"}'
```

Or via the encryption service directly:

```typescript
import { createEncryptionService } from '@medicalcor/core/encryption';

const encryptionService = createEncryptionService(db);
const rotatedCount = await encryptionService.rotateEncryptionKey(newKeyHex);
console.log(`Rotated ${rotatedCount} records`);
```

#### Step 5: Verify Rotation

```sql
-- Check encryption keys table
SELECT version, fingerprint, status, created_at, retired_at
FROM encryption_keys
ORDER BY version DESC;

-- Verify all records use new key version
SELECT key_version, COUNT(*)
FROM encrypted_data
WHERE deleted_at IS NULL
GROUP BY key_version;
```

#### Step 6: Retire Old Key

After verification (wait at least 24 hours):

```bash
# Disable old secret version
gcloud secrets versions disable DATA_ENCRYPTION_KEY --version=<old-version>
```

---

## API Secret Rotation

The `API_SECRET_KEY` authenticates internal API calls.

### Procedure

#### Step 1: Generate New Key

```bash
NEW_API_KEY=$(openssl rand -base64 32)
echo "New API key: $NEW_API_KEY"
```

#### Step 2: Deploy with Dual-Key Support

Temporarily allow both old and new keys:

```bash
# Set both keys (comma-separated for transition period)
gcloud secrets versions add API_SECRET_KEY --data-file=- <<< "$NEW_API_KEY"
```

#### Step 3: Update All API Clients

Update all services that call the API:

- Trigger.dev workers
- Internal cron jobs
- Admin scripts

#### Step 4: Complete Rotation

After all clients updated:

```bash
# Disable old version
gcloud secrets versions disable API_SECRET_KEY --version=<old-version>
```

---

## Third-Party API Keys

### HubSpot Access Token

1. Generate new token in HubSpot > Settings > Integrations > Private Apps
2. Update in Secret Manager:
   ```bash
   gcloud secrets versions add HUBSPOT_ACCESS_TOKEN --data-file=-
   ```
3. Redeploy services
4. Revoke old token in HubSpot

### OpenAI API Key

1. Generate new key at platform.openai.com > API Keys
2. Update in Secret Manager:
   ```bash
   gcloud secrets versions add OPENAI_API_KEY --data-file=-
   ```
3. Redeploy services
4. Delete old key in OpenAI dashboard

### Stripe Keys

1. Roll keys in Stripe Dashboard > Developers > API Keys
2. Update both secret and publishable keys:
   ```bash
   gcloud secrets versions add STRIPE_SECRET_KEY --data-file=-
   gcloud secrets versions add STRIPE_PUBLISHABLE_KEY --data-file=-
   ```
3. Redeploy services

### WhatsApp API Key (360dialog)

1. Generate new key in 360dialog Partner Hub
2. Update in Secret Manager:
   ```bash
   gcloud secrets versions add WHATSAPP_API_KEY --data-file=-
   ```
3. Redeploy services
4. Deactivate old key in 360dialog

---

## Webhook Secrets

### Stripe Webhook Secret

1. In Stripe Dashboard > Webhooks > Your Endpoint
2. Click "Reveal" to get current signing secret
3. Click "Roll secret" to generate new one
4. Update in Secret Manager:
   ```bash
   gcloud secrets versions add STRIPE_WEBHOOK_SECRET --data-file=-
   ```
5. Redeploy services

### WhatsApp Webhook Secret

1. Generate new secret:
   ```bash
   openssl rand -hex 32
   ```
2. Update in 360dialog webhook configuration
3. Update in Secret Manager:
   ```bash
   gcloud secrets versions add WHATSAPP_WEBHOOK_SECRET --data-file=-
   ```
4. Redeploy services

---

## Database Credentials

### PostgreSQL Password Rotation

**Warning**: This requires careful coordination to avoid downtime.

#### Step 1: Create New User (Recommended Approach)

```sql
-- Create new user with same permissions
CREATE USER medicalcor_v2 WITH PASSWORD 'new-secure-password';
GRANT ALL PRIVILEGES ON DATABASE medicalcor TO medicalcor_v2;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO medicalcor_v2;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO medicalcor_v2;
```

#### Step 2: Update Connection String

```bash
# Update DATABASE_URL with new credentials
gcloud secrets versions add DATABASE_URL --data-file=- <<< \
  "postgresql://medicalcor_v2:new-secure-password@host:5432/medicalcor?sslmode=require"
```

#### Step 3: Rolling Restart

```bash
# Deploy with new credentials
gcloud run services update medicalcor-api \
  --update-secrets=DATABASE_URL=DATABASE_URL:latest
```

#### Step 4: Cleanup

After verification:

```sql
-- Revoke old user access
REVOKE ALL PRIVILEGES ON DATABASE medicalcor FROM medicalcor;
DROP USER medicalcor;
```

---

## Emergency Rotation

In case of suspected key compromise:

### Immediate Actions

1. **Assess Scope**: Determine which keys may be compromised
2. **Generate New Keys**: Create replacements immediately
3. **Update Secrets**: Push to Secret Manager
4. **Force Redeploy**: Restart all services
   ```bash
   gcloud run services update medicalcor-api --no-traffic
   gcloud run services update medicalcor-api --to-latest
   ```
5. **Revoke Old Keys**: Disable in Secret Manager and third-party services
6. **Audit Logs**: Review access logs for suspicious activity
7. **Notify**: Alert security team and follow incident response procedure

### Emergency Contacts

- Security Team: security@medicalcor.com
- On-Call Engineer: Check PagerDuty

---

## Verification Checklist

After any rotation, verify:

- [ ] Application starts without errors
- [ ] Health check endpoint returns 200
- [ ] Secrets validation passes at startup (check logs)
- [ ] API authentication works with new key
- [ ] Webhook signatures validate correctly
- [ ] Encryption/decryption operations succeed
- [ ] Third-party integrations respond correctly
- [ ] No error spikes in monitoring dashboards
- [ ] Old key versions disabled (after verification period)

### Automated Verification

```bash
# Run smoke tests
pnpm run test:smoke

# Check health endpoint
curl -s https://api.medicalcor.io/health | jq .

# Verify secrets fingerprints (logs show fingerprints, not values)
gcloud logging read 'resource.type="cloud_run_revision" AND textPayload:"Secrets validation"' --limit=5
```

---

## See Also

- [Security Guide](./SECURITY.md) - Overall security architecture
- [Configuration Guide](./CONFIGURATION.md) - Environment variable reference
- [Deployment Guide](./DEPLOYMENT.md) - Deployment procedures
