# Disaster Recovery Procedures

## Overview

This document outlines the disaster recovery (DR) procedures for MedicalCor Core infrastructure, including backup strategies, restore procedures, and testing protocols.

## Recovery Objectives

| Metric                             | Target     | Description                         |
| ---------------------------------- | ---------- | ----------------------------------- |
| **RTO** (Recovery Time Objective)  | 15 minutes | Maximum acceptable downtime         |
| **RPO** (Recovery Point Objective) | 60 minutes | Maximum acceptable data loss window |

## Infrastructure Components

### 1. PostgreSQL Database (Cloud SQL)

**Configuration (Production):**

- Instance: `medicalcor-db-prod`
- Version: PostgreSQL 15
- Region: europe-west3 (Frankfurt)
- Tier: db-custom-2-4096

**Backup Configuration:**

```hcl
backup_configuration {
  enabled                        = true
  point_in_time_recovery_enabled = true
  start_time                     = "03:00"
  transaction_log_retention_days = 7
}
```

### 2. Redis (Memorystore)

**Configuration (Production):**

- Instance: `medicalcor-redis-prod`
- Version: Redis 7.0
- Tier: STANDARD_HA (High Availability)
- Memory: 2GB
- Transit Encryption: TLS enabled
- AUTH: Enabled

**Persistence:**

- AOF (Append-Only File) mode enabled
- Automatic recovery on restart

### 3. Backup Storage (GCS)

**Bucket:** `medicalcor-backups-{environment}`

- Location: EU (multi-region)
- Storage Class: STANDARD
- Versioning: Enabled
- Lifecycle: 90-day retention

## Backup Schedule

| Type               | Frequency           | Retention | Storage             |
| ------------------ | ------------------- | --------- | ------------------- |
| Full Database      | Daily (03:00 UTC)   | 7 days    | Cloud SQL automated |
| Incremental        | Hourly              | 24 hours  | Application-level   |
| WAL Logs           | Continuous          | 7 days    | Cloud SQL PITR      |
| Application Backup | Daily (02:00 Local) | 12 months | GCS                 |

## Recovery Procedures

### Scenario 1: Database Corruption

**Symptoms:**

- Data inconsistency detected
- Application errors related to data integrity
- Checksum validation failures

**Recovery Steps:**

1. **Assess the damage:**

   ```bash
   # Check database connectivity
   psql $DATABASE_URL -c "SELECT 1"

   # Check table integrity
   psql $DATABASE_URL -c "SELECT COUNT(*) FROM patients"
   ```

2. **Identify last good backup:**

   ```bash
   # List available backups
   gcloud sql backups list --instance=medicalcor-db-prod
   ```

3. **Restore from backup:**

   ```bash
   # Restore to point-in-time (before corruption)
   gcloud sql backups restore BACKUP_ID \
     --restore-instance=medicalcor-db-prod \
     --backup-instance=medicalcor-db-prod
   ```

4. **Verify restoration:**
   ```bash
   # Run integrity checks
   npm run test:dr -- --filter "Data Integrity"
   ```

### Scenario 2: Complete Database Loss

**Recovery Steps:**

1. **Create new instance (if needed):**

   ```bash
   cd infra/terraform
   terraform apply -target=google_sql_database_instance.postgres
   ```

2. **Restore from latest backup:**

   ```bash
   # Using Cloud SQL automated backup
   gcloud sql backups restore BACKUP_ID \
     --restore-instance=medicalcor-db-prod \
     --backup-instance=medicalcor-db-prod

   # OR using application-level backup
   npm run backup:restore -- --backup-id=backup-2024-01-15-03-00-abc123
   ```

3. **Update connection strings (if instance changed):**
   ```bash
   # Update Cloud Run service
   gcloud run services update medicalcor-api \
     --update-env-vars DATABASE_URL=$NEW_DATABASE_URL
   ```

### Scenario 3: Redis Cache Loss

**Recovery Steps:**

1. **Verify Redis status:**

   ```bash
   redis-cli -h $REDIS_HOST -p 6379 --tls ping
   ```

2. **If instance is down, recreate:**

   ```bash
   cd infra/terraform
   terraform apply -target=google_redis_instance.cache
   ```

3. **Application handles cache miss gracefully:**
   - Cache is self-healing
   - Data repopulates from database on cache miss
   - No manual intervention required for cache data

### Scenario 4: Regional Outage

**Recovery Steps:**

1. **Failover to secondary region (if configured):**

   ```bash
   # For Cloud SQL HA
   gcloud sql instances failover medicalcor-db-prod
   ```

2. **Update DNS/Load Balancer:**

   ```bash
   # Update Cloud DNS
   gcloud dns record-sets update api.medicalcor.com \
     --zone=medicalcor-zone \
     --rrdatas=$SECONDARY_IP
   ```

3. **Restore from cross-region backup (if needed):**
   ```bash
   # Backups are replicated to EU multi-region
   gsutil ls gs://medicalcor-backups-prod/
   ```

## Testing Procedures

### Weekly Automated Tests

The DR test suite runs automatically via CI/CD:

```bash
# Run full DR test suite
npm run test:dr

# Run specific tests
npm run test:dr -- --filter "Backup"
npm run test:dr -- --filter "Restore"
```

### Monthly Manual Exercise

1. **Schedule maintenance window** (low-traffic period)

2. **Notify stakeholders:**
   - Development team
   - Operations team
   - Customer support (for user communication)

3. **Execute DR exercise:**

   ```bash
   # Create fresh backup
   npm run backup:create -- --type=full --tags='{"exercise":"monthly"}'

   # Restore to staging
   npm run backup:restore -- --target=staging --verify-first

   # Run integration tests on staging
   npm run test:integration -- --env=staging
   ```

4. **Document results:**
   - RTO achieved
   - RPO achieved
   - Issues encountered
   - Recommendations

### Quarterly Full Exercise

Complete failover simulation:

1. **Simulate production failure** (in staging)
2. **Execute full recovery procedure**
3. **Measure actual RTO/RPO**
4. **Update procedures based on findings**

## Application-Level Backup Service

### Creating Backups

```typescript
import { createBackupService } from '@medicalcor/core/infrastructure/backup-service';

const backupService = createBackupService({
  databaseUrl: process.env.DATABASE_URL,
  storage: {
    provider: 's3',
    bucket: 'medicalcor-backups-prod',
    region: 'eu-central-1',
  },
  retention: {
    hourlyRetention: 24,
    dailyRetention: 7,
    weeklyRetention: 4,
    monthlyRetention: 12,
  },
  encryption: {
    enabled: true,
    key: process.env.BACKUP_ENCRYPTION_KEY,
  },
});

// Create full backup
const backup = await backupService.createBackup('full', {
  reason: 'scheduled',
  operator: 'system',
});

console.log(`Backup created: ${backup.id}`);
```

### Restoring Backups

```typescript
// List available backups
const backups = backupService.listBackups({
  type: 'full',
  status: 'verified',
  limit: 10,
});

// Restore specific backup
await backupService.restore({
  backupId: backups[0].id,
  targetDatabaseUrl: process.env.STAGING_DATABASE_URL,
  verifyFirst: true,
  dropExisting: true,
});
```

### Monitoring Backup Health

```typescript
// Get backup statistics
const stats = backupService.getStats();
console.log(`Total backups: ${stats.totalBackups}`);
console.log(`Storage used: ${stats.totalStorageBytes / 1024 / 1024} MB`);
console.log(`Last backup: ${stats.newestBackup}`);

// Check backup age (for alerting)
const latestAge = Date.now() - stats.newestBackup.getTime();
if (latestAge > 2 * 60 * 60 * 1000) {
  // > 2 hours
  alert('Backup is older than 2 hours!');
}
```

## Environment Variables

Required for backup operations:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/medicalcor

# Backup Storage
BACKUP_STORAGE_PROVIDER=s3
BACKUP_STORAGE_BUCKET=medicalcor-backups-prod
BACKUP_STORAGE_REGION=eu-central-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# Encryption
BACKUP_ENCRYPTION_KEY=your-32-byte-hex-key

# Schedule
BACKUP_SCHEDULE_ENABLED=true
BACKUP_FULL_FREQUENCY=daily
BACKUP_INCREMENTAL_FREQUENCY=hourly
BACKUP_PREFERRED_HOUR=2
BACKUP_TIMEZONE=Europe/Bucharest

# Retention
BACKUP_RETENTION_DAILY=7
BACKUP_RETENTION_WEEKLY=4
BACKUP_RETENTION_MONTHLY=12
```

## Runbook Checklist

### Before Disaster

- [ ] Verify daily backup completion in monitoring
- [ ] Run weekly DR tests
- [ ] Review backup storage usage
- [ ] Test restore procedure monthly
- [ ] Update contact list for emergencies

### During Disaster

- [ ] Assess impact and scope
- [ ] Notify incident commander
- [ ] Identify appropriate recovery scenario
- [ ] Execute recovery procedure
- [ ] Monitor recovery progress
- [ ] Verify data integrity post-recovery
- [ ] Update status page

### After Disaster

- [ ] Document incident timeline
- [ ] Calculate actual RTO/RPO achieved
- [ ] Identify root cause
- [ ] Update procedures if needed
- [ ] Schedule post-mortem meeting
- [ ] Communicate resolution to stakeholders

## Contact Information

| Role                | Contact      | Escalation |
| ------------------- | ------------ | ---------- |
| On-Call Engineer    | PagerDuty    | 15 min     |
| Database Admin      | [DBA Team]   | 30 min     |
| Infrastructure Lead | [Infra Team] | 1 hour     |
| CTO                 | [Executive]  | 2 hours    |

## Revision History

| Date       | Version | Author        | Changes                    |
| ---------- | ------- | ------------- | -------------------------- |
| 2024-01-15 | 1.0     | Platform Team | Initial document           |
| 2024-02-01 | 1.1     | Platform Team | Added PITR procedures      |
| 2024-03-01 | 1.2     | Platform Team | Updated retention policies |
