# Rollback Runbook

Procedures for safely rolling back deployments, configurations, and database changes in MedicalCor Core platform.

---

## Table of Contents

- [Rollback Decision Matrix](#rollback-decision-matrix)
- [Pre-Rollback Checklist](#pre-rollback-checklist)
- [API Service Rollback](#api-service-rollback)
- [Web Dashboard Rollback](#web-dashboard-rollback)
- [Trigger.dev Rollback](#triggerdev-rollback)
- [Database Rollback](#database-rollback)
- [Configuration Rollback](#configuration-rollback)
- [Feature Flag Rollback](#feature-flag-rollback)
- [Rollback Verification](#rollback-verification)
- [Post-Rollback Actions](#post-rollback-actions)

---

## Rollback Decision Matrix

### When to Rollback vs. Fix Forward

| Scenario                            | Recommendation             | Reasoning            |
| ----------------------------------- | -------------------------- | -------------------- |
| Clear regression from recent deploy | **Rollback**               | Fast recovery        |
| Bug in new code, fix is simple      | Fix Forward                | Faster than rollback |
| Bug in new code, fix is complex     | **Rollback**               | Reduce MTTR          |
| Performance degradation > 50%       | **Rollback**               | Immediate impact     |
| Partial feature failure             | Fix Forward + Feature Flag | Surgical approach    |
| Database migration failed mid-way   | **Assess carefully**       | May need forward fix |
| Security vulnerability discovered   | **Rollback** + Rotate keys | Safety first         |
| Third-party integration broken      | Wait or workaround         | Not our deployment   |

### Rollback Decision Flowchart

```
┌─────────────────────────────────────────────────────────────┐
│                  ROLLBACK DECISION                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   Was there a recent deployment?                             │
│         │                                                    │
│    ┌────┴────┐                                               │
│    │         │                                               │
│   YES        NO                                              │
│    │         │                                               │
│    ▼         ▼                                               │
│   Is the    Check other causes:                              │
│   issue     - External dependency                            │
│   clearly   - Infrastructure                                 │
│   related?  - Configuration change                           │
│    │        - Traffic spike                                  │
│    ▼                                                         │
│   YES → ROLLBACK                                             │
│   NO  → Investigate further                                  │
│                                                              │
│   Can we fix in < 15 minutes?                                │
│    │                                                         │
│   YES → Fix Forward                                          │
│   NO  → ROLLBACK                                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Pre-Rollback Checklist

Before performing any rollback:

- [ ] **Confirm rollback is appropriate** (see decision matrix)
- [ ] **Identify target revision** (what to roll back TO)
- [ ] **Announce in incident channel**: "Initiating rollback to revision X"
- [ ] **Check for database migrations** that may conflict
- [ ] **Identify dependent services** that may need coordination
- [ ] **Prepare verification steps** (what proves rollback worked)

---

## API Service Rollback

### Cloud Run (Primary)

#### Step 1: List Available Revisions

```bash
# List recent revisions
gcloud run revisions list \
  --service=medicalcor-api \
  --region=europe-west3 \
  --limit=10

# Output example:
# REVISION                    ACTIVE  SERVICE         DEPLOYED
# medicalcor-api-00015-abc    yes     medicalcor-api  2024-12-07T10:00:00Z
# medicalcor-api-00014-def    no      medicalcor-api  2024-12-06T15:00:00Z
# medicalcor-api-00013-ghi    no      medicalcor-api  2024-12-05T12:00:00Z
```

#### Step 2: Identify Target Revision

```bash
# Get details of a specific revision
gcloud run revisions describe medicalcor-api-00014-def \
  --region=europe-west3 \
  --format="yaml(metadata.annotations,spec.containers[0].image)"

# Verify the revision was working (check deployment notes/commits)
```

#### Step 3: Execute Rollback

```bash
# Route 100% traffic to previous revision
gcloud run services update-traffic medicalcor-api \
  --region=europe-west3 \
  --to-revisions=medicalcor-api-00014-def=100

# Expected output:
# Traffic:
#   100% medicalcor-api-00014-def
```

#### Step 4: Verify Rollback

```bash
# Check health
curl -s https://api.medicalcor.com/health | jq .

# Check the serving revision
gcloud run services describe medicalcor-api \
  --region=europe-west3 \
  --format="yaml(status.traffic)"
```

### Gradual Rollback (If Uncertain)

If unsure, use gradual traffic shifting:

```bash
# First: 50/50 split
gcloud run services update-traffic medicalcor-api \
  --region=europe-west3 \
  --to-revisions=medicalcor-api-00014-def=50,medicalcor-api-00015-abc=50

# Monitor for 5 minutes, then complete rollback
gcloud run services update-traffic medicalcor-api \
  --region=europe-west3 \
  --to-revisions=medicalcor-api-00014-def=100
```

### Rollback to Specific Image Tag

If you know the Docker image tag:

```bash
# Deploy specific image
gcloud run deploy medicalcor-api \
  --image=gcr.io/PROJECT_ID/medicalcor-api:v1.2.3 \
  --region=europe-west3
```

---

## Web Dashboard Rollback

### Cloud Run (Web App)

Same procedure as API:

```bash
# List revisions
gcloud run revisions list \
  --service=medicalcor-web \
  --region=europe-west3 \
  --limit=5

# Rollback
gcloud run services update-traffic medicalcor-web \
  --region=europe-west3 \
  --to-revisions=medicalcor-web-00014-abc=100
```

### Vercel (If Using)

1. Go to Vercel Dashboard
2. Navigate to Project > Deployments
3. Find the last working deployment
4. Click "..." menu > "Promote to Production"

### CDN Cache Clear (If Needed)

```bash
# GCP CDN
gcloud compute url-maps invalidate-cdn-cache medicalcor-lb \
  --path="/*"

# Cloudflare
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"purge_everything":true}'
```

---

## Trigger.dev Rollback

### Via Dashboard (Recommended)

1. Go to [cloud.trigger.dev](https://cloud.trigger.dev)
2. Navigate to your project
3. Click "Deployments" in sidebar
4. Find the last working deployment
5. Click "Rollback to this version"

### Via CLI

```bash
# List deployments
cd apps/trigger
npx trigger.dev@latest deploy --dry-run

# Rollback to specific version
npx trigger.dev@latest deploy --to-version=<VERSION_ID>
```

### Disable Specific Task (Emergency)

If a specific task is causing issues:

1. Dashboard > Tasks > [Task Name]
2. Click "Pause" to stop new executions
3. Existing runs will complete

---

## Database Rollback

> **Warning:** Database rollbacks are complex and may cause data loss. Always involve a DBA for production rollbacks.

### Scenario 1: Failed Migration (Not Yet Applied)

If migration was tested but not applied to production:

```bash
# Simply don't run the migration
# Revert the migration file in git
git revert <commit-with-migration>
```

### Scenario 2: Revert a Simple Migration

For additive migrations (new columns, new tables):

```sql
-- Example: Migration added a column
-- Rollback SQL:
ALTER TABLE leads DROP COLUMN IF EXISTS new_column;

-- Example: Migration added a table
-- Rollback SQL:
DROP TABLE IF EXISTS new_table;
```

### Scenario 3: Point-in-Time Recovery

For data corruption or complex rollback needs:

```bash
# 1. List available backups
gcloud sql backups list --instance=medicalcor-db-prod

# 2. Create a new instance from backup (safer than restoring to production)
gcloud sql instances clone medicalcor-db-prod medicalcor-db-recovery \
  --point-in-time="2024-12-07T09:00:00Z"

# 3. Verify data in recovery instance
psql $RECOVERY_DATABASE_URL -c "SELECT count(*) FROM leads;"

# 4. If verified, migrate applications to recovery instance
# OR export/import specific data
```

### Scenario 4: Restore from Backup

```bash
# Full restore (replaces all data)
gcloud sql backups restore <BACKUP_ID> \
  --restore-instance=medicalcor-db-prod \
  --backup-instance=medicalcor-db-prod

# This requires downtime - coordinate with team
```

See [DR-PROCEDURES.md](../DR-PROCEDURES.md) for detailed database recovery procedures.

---

## Configuration Rollback

### Environment Variables (Cloud Run)

```bash
# 1. List current configuration
gcloud run services describe medicalcor-api \
  --region=europe-west3 \
  --format="yaml(spec.template.spec.containers[0].env)"

# 2. Rollback specific variable
gcloud run services update medicalcor-api \
  --region=europe-west3 \
  --update-env-vars KEY=old_value

# 3. Or rollback to previous revision (includes env vars)
gcloud run services update-traffic medicalcor-api \
  --region=europe-west3 \
  --to-revisions=PREVIOUS_REVISION=100
```

### Secret Rollback

```bash
# 1. List secret versions
gcloud secrets versions list API_SECRET_KEY

# 2. Enable previous version
gcloud secrets versions enable API_SECRET_KEY --version=PREVIOUS_VERSION

# 3. Disable current version (optional, after verification)
gcloud secrets versions disable API_SECRET_KEY --version=CURRENT_VERSION

# 4. Redeploy services to pick up old secret
gcloud run services update medicalcor-api \
  --region=europe-west3 \
  --update-secrets=API_SECRET_KEY=API_SECRET_KEY:PREVIOUS_VERSION
```

---

## Feature Flag Rollback

If using feature flags, rollback can be instantaneous:

### Disable a Feature Flag

```bash
# Via API (if exposed)
curl -X PATCH https://api.medicalcor.com/admin/feature-flags/new-scoring-model \
  -H "X-Api-Key: $ADMIN_API_KEY" \
  -d '{"enabled": false}'

# Via database
psql $DATABASE_URL -c "UPDATE feature_flags SET enabled = false WHERE name = 'new-scoring-model';"
```

### Emergency Kill Switch

For critical features, use the kill switch pattern:

```bash
# Redis-based kill switch (instant effect)
redis-cli -u $REDIS_URL SET "kill_switch:ai_scoring" "true"

# Application checks this before AI calls
```

---

## Rollback Verification

### Immediate Checks (Within 2 Minutes)

```bash
# 1. Health check
curl -s https://api.medicalcor.com/health | jq .
# Expected: {"status": "healthy"}

# 2. Ready check (includes dependencies)
curl -s https://api.medicalcor.com/ready | jq .
# Expected: {"status": "ready", "checks": {"database": "ok", "redis": "ok"}}

# 3. Basic API call
curl -s https://api.medicalcor.com/api/v1/health | jq .
```

### Metrics Verification (5-10 Minutes)

```bash
# Check error rate returning to normal
curl -s https://api.medicalcor.com/metrics | grep "http_requests_total" | grep "status=\"5"

# Check latency returning to normal
curl -s https://api.medicalcor.com/metrics | grep "http_request_duration_seconds"
```

### Functional Verification

```bash
# Run smoke tests
cd /home/user/medicalcor-core
pnpm run test:smoke

# Or specific integration tests
pnpm run test:integration -- --filter="webhook"
```

### Log Verification

```bash
# Check for new errors after rollback
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=20 --freshness=5m

# Should see fewer errors than before rollback
```

---

## Post-Rollback Actions

### Immediate (Within 1 Hour)

- [ ] **Announce rollback complete** in incident channel
- [ ] **Update incident status** to "Mitigated"
- [ ] **Document** what was rolled back and why
- [ ] **Notify stakeholders** of resolution

### Short-term (Within 24 Hours)

- [ ] **Root cause analysis** of the failed deployment
- [ ] **Identify fixes** needed before re-deployment
- [ ] **Add/improve tests** to catch the issue
- [ ] **Update deployment checklist** if needed

### Before Re-deploying

- [ ] **Fix identified issues** in the code
- [ ] **Add regression tests** for the specific bug
- [ ] **Test in staging** thoroughly
- [ ] **Gradual rollout** (canary deployment)
- [ ] **Enhanced monitoring** during rollout

---

## Rollback Scenarios Quick Reference

| Scenario                 | Command/Action                                                              |
| ------------------------ | --------------------------------------------------------------------------- |
| Bad API deployment       | `gcloud run services update-traffic medicalcor-api --to-revisions=PREV=100` |
| Bad web deployment       | `gcloud run services update-traffic medicalcor-web --to-revisions=PREV=100` |
| Bad Trigger.dev deploy   | Dashboard > Deployments > Rollback                                          |
| Bad environment variable | `gcloud run services update medicalcor-api --update-env-vars KEY=old_value` |
| Bad secret               | `gcloud secrets versions enable SECRET --version=PREV` + redeploy           |
| Bad feature flag         | Set flag to `false` in database or API                                      |
| Bad DB migration         | Execute rollback SQL or restore from backup                                 |

---

## Rollback Restrictions

### Do NOT Rollback Without Coordination

| Scenario                          | Risk                        | Action                      |
| --------------------------------- | --------------------------- | --------------------------- |
| Database has new required columns | App may crash               | Coordinate with DB team     |
| API has breaking changes          | Clients may break           | Check client compatibility  |
| Secrets were rotated              | Old secrets may be disabled | Re-enable old secrets first |
| Third-party webhook URLs changed  | Webhooks will fail          | Update external configs     |

### Rollback Blockers

If any of these are true, **stop and escalate**:

- Database schema is incompatible with old code
- Data has been migrated to new format
- External systems depend on new API contracts
- Old version has known security vulnerability

---

## Revision History

| Date    | Version | Author        | Changes                  |
| ------- | ------- | ------------- | ------------------------ |
| 2024-12 | 1.0     | Platform Team | Initial runbook creation |
