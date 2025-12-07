# Partition Maintenance Runbook

Procedures for managing PostgreSQL table partitions in MedicalCor Core.

**Version:** 1.0
**Last Updated:** December 2025
**Owner:** Platform Team

---

## Table of Contents

- [Overview](#overview)
- [Partitioned Tables](#partitioned-tables)
- [Routine Operations](#routine-operations)
  - [Creating Future Partitions](#creating-future-partitions)
  - [Monitoring Partition Health](#monitoring-partition-health)
  - [Archiving Old Partitions](#archiving-old-partitions)
- [Emergency Operations](#emergency-operations)
  - [Missing Partition Recovery](#missing-partition-recovery)
  - [Insert Failure Triage](#insert-failure-triage)
- [Maintenance Functions Reference](#maintenance-functions-reference)
- [Trigger.dev Automation](#triggerdev-automation)
- [Troubleshooting](#troubleshooting)
- [Compliance Considerations](#compliance-considerations)

---

## Overview

MedicalCor Core uses **monthly range partitioning** for high-volume time-series tables:

| Table | Partition Key | Purpose | Retention |
|-------|--------------|---------|-----------|
| `domain_events` | `created_at` | Event sourcing | 24 months |
| `audit_log` | `timestamp` | HIPAA/GDPR compliance | 24 months |
| `episodic_events` | `occurred_at` | Cognitive memory (ADR-004) | 24 months |

### Benefits

- **Query Performance**: Time-range queries scan fewer partitions
- **Efficient Maintenance**: VACUUM/ANALYZE run on smaller tables
- **Data Lifecycle**: Old data archived by dropping partitions (no DELETE)
- **Storage Optimization**: Each partition can be independently compressed

### Partition Naming Convention

```
{table_name}_y{YYYY}m{MM}
```

Examples:
- `domain_events_y2025m12` - December 2025
- `audit_log_y2026m01` - January 2026
- `episodic_events_y2025m06` - June 2025

---

## Partitioned Tables

### domain_events

Stores all domain events for event sourcing.

```sql
-- Partition key: created_at
CREATE TABLE domain_events (...) PARTITION BY RANGE (created_at);
```

### audit_log

HIPAA/GDPR compliance audit trail.

```sql
-- Partition key: timestamp
CREATE TABLE audit_log (...) PARTITION BY RANGE (timestamp);
```

### episodic_events

LLM-generated cognitive memory with vector embeddings.

```sql
-- Partition key: occurred_at
CREATE TABLE episodic_events (...) PARTITION BY RANGE (occurred_at);
```

---

## Routine Operations

### Creating Future Partitions

Partitions **must exist before** data is inserted. Create partitions proactively.

#### Automatic (Recommended)

A Trigger.dev cron job runs monthly to create partitions 3 months ahead:

```bash
# Verify cron is active
# Check Trigger.dev dashboard > Schedules > partition-maintenance
```

#### Manual - Create Next 3 Months

```sql
-- Creates partitions for all 3 tables, 3 months ahead
SELECT create_future_partitions(3);
-- Returns: Number of partitions created (9 = 3 tables x 3 months)
```

#### Manual - Specific Month

```sql
-- Create domain_events partition for March 2026
SELECT create_domain_events_partition(2026, 3);
-- Returns: 'domain_events_y2026m03'

-- Create audit_log partition for March 2026
SELECT create_audit_log_partition(2026, 3);
-- Returns: 'audit_log_y2026m03'

-- Create episodic_events partition for March 2026
SELECT create_episodic_events_partition(2026, 3);
-- Returns: 'episodic_events_y2026m03'
```

#### Manual - Date Range

```sql
-- Create partitions for all tables between two dates
SELECT * FROM ensure_partitions_exist('2026-01-01', '2026-12-31');
-- Returns table of created partitions
```

### Monitoring Partition Health

#### Check Partition Statistics

```sql
-- Domain events partitions
SELECT * FROM get_partition_stats('domain_events');

-- Audit log partitions
SELECT * FROM get_partition_stats('audit_log');

-- Episodic events partitions (detailed stats)
SELECT * FROM get_episodic_events_partition_stats();
```

**Example output:**

| partition_name | row_count | total_size | index_size | partition_range |
|---------------|-----------|------------|------------|-----------------|
| domain_events_y2025m11 | 142857 | 84 MB | 32 MB | FROM ('2025-11-01') TO ('2025-12-01') |
| domain_events_y2025m12 | 98234 | 58 MB | 22 MB | FROM ('2025-12-01') TO ('2026-01-01') |

#### Verify Future Partitions Exist

```sql
-- Check that partitions exist for next 3 months
WITH future_months AS (
    SELECT generate_series(
        date_trunc('month', CURRENT_DATE),
        date_trunc('month', CURRENT_DATE) + interval '3 months',
        interval '1 month'
    )::date AS month_start
)
SELECT
    fm.month_start,
    EXISTS(SELECT 1 FROM pg_class WHERE relname = 'domain_events_y' ||
           EXTRACT(YEAR FROM fm.month_start) || 'm' ||
           LPAD(EXTRACT(MONTH FROM fm.month_start)::text, 2, '0')) AS domain_events_exists,
    EXISTS(SELECT 1 FROM pg_class WHERE relname = 'audit_log_y' ||
           EXTRACT(YEAR FROM fm.month_start) || 'm' ||
           LPAD(EXTRACT(MONTH FROM fm.month_start)::text, 2, '0')) AS audit_log_exists,
    EXISTS(SELECT 1 FROM pg_class WHERE relname = 'episodic_events_y' ||
           EXTRACT(YEAR FROM fm.month_start) || 'm' ||
           LPAD(EXTRACT(MONTH FROM fm.month_start)::text, 2, '0')) AS episodic_events_exists
FROM future_months fm;
```

#### Monitor Partition Sizes

```sql
-- Alert if any partition exceeds 500MB
SELECT partition_name, total_size
FROM get_partition_stats('domain_events')
WHERE pg_total_relation_size(partition_name::regclass) > 500 * 1024 * 1024;
```

### Archiving Old Partitions

Old partitions should be dropped after the retention period. **Default retention: 24 months**.

#### Drop Old Partitions (Single Table)

```sql
-- Drop domain_events partitions older than 24 months
SELECT drop_old_partitions('domain_events', 24);

-- Drop audit_log partitions older than 24 months
SELECT drop_old_partitions('audit_log', 24);

-- Drop episodic_events partitions older than 24 months
SELECT drop_old_partitions('episodic_events', 24);
```

**Returns:** Number of partitions dropped.

#### Comprehensive Episodic Events Cleanup

For episodic_events, use the specialized cleanup function that also handles GDPR soft-deleted records:

```sql
-- Cleanup: purge soft-deleted records AND drop old partitions
SELECT * FROM cleanup_old_episodic_events(24);
```

**Returns:**

| action | count |
|--------|-------|
| soft_deleted_events_purged | 1523 |
| partitions_dropped | 3 |

#### Pre-Archival Checklist

Before dropping partitions:

1. **Verify backup exists**
   ```bash
   # Check recent backup in GCP
   gcloud sql backups list --instance=medicalcor-db-prod --limit=3
   ```

2. **Export to cold storage (optional)**
   ```sql
   -- Export partition data to CSV before dropping
   COPY (SELECT * FROM domain_events_y2023m12)
   TO '/tmp/domain_events_y2023m12.csv' WITH CSV HEADER;
   ```

3. **Verify no active queries**
   ```sql
   SELECT pid, query_start, query
   FROM pg_stat_activity
   WHERE query ILIKE '%domain_events_y2023m12%';
   ```

---

## Emergency Operations

### Missing Partition Recovery

**Symptom:** Insert fails with `ERROR: no partition of relation "domain_events" found for row`

**Immediate Fix:**

```sql
-- 1. Identify the missing partition date from the error
-- Example: Row date is 2026-07-15

-- 2. Create the missing partition immediately
SELECT create_domain_events_partition(2026, 7);
SELECT create_audit_log_partition(2026, 7);
SELECT create_episodic_events_partition(2026, 7);

-- 3. Retry the failed operation (automatic if using retry logic)
```

**Root Cause Investigation:**

```bash
# Check if Trigger.dev cron job is running
# Dashboard: Trigger.dev > Schedules > partition-maintenance

# Check recent runs
# Dashboard: Trigger.dev > Runs > Filter by "partition-maintenance"
```

### Insert Failure Triage

**Symptom:** Batch inserts failing with partition errors

**Diagnosis:**

```sql
-- 1. Check which dates are being inserted
SELECT DISTINCT date_trunc('month', created_at) AS month
FROM (VALUES
    -- Replace with actual failing dates
    (TIMESTAMPTZ '2026-07-15 10:30:00'),
    (TIMESTAMPTZ '2026-08-01 00:00:00')
) AS t(created_at);

-- 2. Check if partitions exist
SELECT relname FROM pg_class
WHERE relname LIKE 'domain_events_y2026m%';

-- 3. Create missing partitions
SELECT * FROM ensure_partitions_exist('2026-07-01', '2026-09-01');
```

---

## Maintenance Functions Reference

### create_domain_events_partition(year, month)

Creates a partition for `domain_events` table.

```sql
SELECT create_domain_events_partition(2026, 3);
-- Returns: 'domain_events_y2026m03'
```

### create_audit_log_partition(year, month)

Creates a partition for `audit_log` table.

```sql
SELECT create_audit_log_partition(2026, 3);
-- Returns: 'audit_log_y2026m03'
```

### create_episodic_events_partition(year, month)

Creates a partition for `episodic_events` table.

```sql
SELECT create_episodic_events_partition(2026, 3);
-- Returns: 'episodic_events_y2026m03'
```

### ensure_partitions_exist(start_date, end_date)

Creates partitions for **all three tables** within a date range.

```sql
SELECT * FROM ensure_partitions_exist('2026-01-01', '2026-06-30');
```

**Returns:**

| table_name | partition_name |
|------------|----------------|
| domain_events | domain_events_y2026m01 |
| audit_log | audit_log_y2026m01 |
| episodic_events | episodic_events_y2026m01 |
| domain_events | domain_events_y2026m02 |
| ... | ... |

### create_future_partitions(months_ahead)

Creates partitions for all tables for the next N months.

```sql
-- Default: 3 months ahead
SELECT create_future_partitions();
-- Returns: 12 (4 months x 3 tables)

-- Custom: 6 months ahead
SELECT create_future_partitions(6);
-- Returns: 21 (7 months x 3 tables)
```

### drop_old_partitions(table_name, retention_months)

Drops partitions older than retention period.

```sql
SELECT drop_old_partitions('domain_events', 24);
-- Returns: Number of partitions dropped
```

### get_partition_stats(table_name)

Returns statistics for all partitions of a table.

```sql
SELECT * FROM get_partition_stats('domain_events');
```

### get_episodic_events_partition_stats()

Returns detailed statistics for episodic_events partitions.

```sql
SELECT * FROM get_episodic_events_partition_stats();
```

### cleanup_old_episodic_events(retention_months)

Comprehensive cleanup: purges soft-deleted records and drops old partitions.

```sql
SELECT * FROM cleanup_old_episodic_events(24);
```

---

## Trigger.dev Automation

### Partition Maintenance Cron Job

The following Trigger.dev scheduled task handles automatic partition creation:

**Schedule:** First day of each month at 00:00 UTC
**Task:** `partition-maintenance`

**Expected behavior:**
1. Creates partitions for the next 3 months
2. Logs partition creation to audit_log
3. Alerts on failure via PagerDuty

### Setting Up the Cron Job

If the cron job doesn't exist, create it in `apps/trigger/src/jobs/`:

```typescript
// apps/trigger/src/jobs/partition-maintenance.ts
import { schedules } from '@trigger.dev/sdk/v3';
import { createLogger } from '@medicalcor/core';

const logger = createLogger({ name: 'partition-maintenance' });

export const partitionMaintenanceJob = schedules.task({
  id: 'partition-maintenance',
  cron: '0 0 1 * *', // First day of month at midnight
  run: async () => {
    const { pool } = await getDatabase();

    try {
      // Create partitions for next 3 months
      const result = await pool.query('SELECT create_future_partitions(3) as count');
      const count = result.rows[0].count;

      logger.info({ partitionsCreated: count }, 'Partition maintenance completed');

      return { success: true, partitionsCreated: count };
    } catch (error) {
      logger.error({ error }, 'Partition maintenance failed');
      throw error; // Triggers alert
    }
  },
});
```

### Verifying Automation

```bash
# Check recent partition maintenance runs
# Trigger.dev Dashboard > Runs > Filter: "partition-maintenance"

# Or via API
curl -H "Authorization: Bearer $TRIGGER_API_KEY" \
  "https://api.trigger.dev/v3/runs?taskId=partition-maintenance&limit=5"
```

---

## Troubleshooting

### Issue: "no partition found for row"

**Cause:** Attempting to insert data for a month without a partition.

**Fix:**

```sql
-- Identify the month from the error message
-- Create the missing partition
SELECT create_domain_events_partition(YYYY, MM);
SELECT create_audit_log_partition(YYYY, MM);
SELECT create_episodic_events_partition(YYYY, MM);
```

**Prevention:** Ensure cron job is running and creating partitions 3+ months ahead.

### Issue: Partition query slow

**Cause:** Query not using partition pruning.

**Diagnosis:**

```sql
-- Check if partition pruning is enabled
SHOW enable_partition_pruning;
-- Should be: on

-- Explain query to verify pruning
EXPLAIN ANALYZE
SELECT * FROM domain_events
WHERE created_at >= '2025-12-01' AND created_at < '2025-12-15';
-- Should show only 1 partition being scanned
```

**Fix:**

```sql
-- Enable partition pruning if disabled
SET enable_partition_pruning = on;
```

### Issue: Large partition sizes

**Cause:** High event volume or missed archival.

**Diagnosis:**

```sql
SELECT * FROM get_partition_stats('domain_events')
ORDER BY pg_total_relation_size(partition_name::regclass) DESC
LIMIT 5;
```

**Fix:**
1. If partition is current: Monitor, this is expected growth
2. If partition is old: Run archival immediately
3. Consider weekly partitioning for very high volume (requires migration)

### Issue: Cannot drop partition

**Cause:** Active queries or dependencies.

**Diagnosis:**

```sql
-- Check for active queries
SELECT pid, query_start, state, query
FROM pg_stat_activity
WHERE query ILIKE '%partition_name%';

-- Check for dependencies
SELECT
    dependent_ns.nspname as dependent_schema,
    dependent_view.relname as dependent_view
FROM pg_depend
JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid
JOIN pg_class as dependent_view ON pg_rewrite.ev_class = dependent_view.oid
JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
WHERE pg_depend.refobjid = 'partition_name'::regclass;
```

**Fix:**
1. Wait for queries to complete
2. Terminate blocking queries if urgent: `SELECT pg_terminate_backend(pid);`
3. Address dependencies before dropping

---

## Compliance Considerations

### HIPAA Requirements

- **Audit Log Retention:** Minimum 6 years for PHI access logs
- **Adjust Retention:** Override default 24-month retention for audit_log:
  ```sql
  -- Keep audit_log for 72 months (6 years) for HIPAA
  -- DO NOT use drop_old_partitions for audit_log with < 72 months
  SELECT drop_old_partitions('audit_log', 72);
  ```

### GDPR Requirements

- **Right to Erasure:** Episodic events use soft-delete (`deleted_at`)
- **Cleanup:** `cleanup_old_episodic_events()` permanently deletes soft-deleted records after retention period
- **Verification:** Before dropping partitions, ensure GDPR erasure requests have been processed

### Pre-Drop Compliance Checklist

1. Verify backup exists for compliance audits
2. Confirm retention period meets regulatory requirements
3. For `audit_log`: Ensure 6-year minimum retention (HIPAA)
4. For `episodic_events`: Run GDPR erasure job before dropping
5. Document the archival in change management system

---

## Quick Reference

### Monthly Maintenance (Manual)

```sql
-- 1. Create future partitions
SELECT create_future_partitions(3);

-- 2. Check partition health
SELECT * FROM get_partition_stats('domain_events');
SELECT * FROM get_partition_stats('audit_log');
SELECT * FROM get_episodic_events_partition_stats();

-- 3. Archive old partitions (respect retention policies!)
SELECT drop_old_partitions('domain_events', 24);
-- SELECT drop_old_partitions('audit_log', 72);  -- 6 years for HIPAA
SELECT * FROM cleanup_old_episodic_events(24);
```

### Emergency: Missing Partition

```sql
SELECT create_domain_events_partition(YYYY, MM);
SELECT create_audit_log_partition(YYYY, MM);
SELECT create_episodic_events_partition(YYYY, MM);
```

### Verify Setup

```sql
-- Count partitions per table
SELECT parent.relname, COUNT(*) as partition_count
FROM pg_class parent
JOIN pg_inherits i ON i.inhparent = parent.oid
JOIN pg_class child ON child.oid = i.inhrelid
WHERE parent.relname IN ('domain_events', 'audit_log', 'episodic_events')
GROUP BY parent.relname;
```

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2025-12 | 1.0 | Platform Team | Initial runbook creation |
