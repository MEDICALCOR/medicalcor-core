# Common Issues Runbook

Quick reference for diagnosing and resolving frequently encountered issues in MedicalCor Core platform.

---

## Table of Contents

- [Quick Diagnosis Checklist](#quick-diagnosis-checklist)
- [API Issues](#api-issues)
- [Database Issues](#database-issues)
- [Redis Issues](#redis-issues)
- [AI/OpenAI Issues](#aiopenai-issues)
- [Integration Issues](#integration-issues)
- [Webhook Issues](#webhook-issues)
- [Background Job Issues](#background-job-issues)
- [Performance Issues](#performance-issues)
- [Authentication Issues](#authentication-issues)

---

## Quick Diagnosis Checklist

When something goes wrong, start here:

### 1. Is it a recent deployment?

```bash
# Check recent deployments
gcloud run revisions list --service=medicalcor-api --limit=3

# If yes, consider rollback
# See ROLLBACK.md
```

### 2. Is it external?

```bash
# Check health of dependencies
curl -s https://api.medicalcor.com/health/deep | jq .

# Check external service status pages
# - status.openai.com
# - status.hubspot.com
# - status.stripe.com
# - status.360dialog.com
```

### 3. What do the metrics show?

```bash
# Check key metrics
curl -s https://api.medicalcor.com/metrics | grep -E "error|latency|circuit"
```

### 4. What do the logs say?

```bash
# Recent errors
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=20 --freshness=15m --format="table(timestamp,textPayload)"
```

---

## API Issues

### Issue: High Error Rate (5xx)

**Symptoms:**

- Elevated error rate in metrics
- Users reporting errors
- Alert: `HighErrorRate`

**Diagnosis:**

```bash
# 1. Check what errors are happening
gcloud logging read 'jsonPayload.level="error"' --limit=50 --freshness=30m | jq '.jsonPayload.msg'

# 2. Check if related to specific endpoint
curl -s https://api.medicalcor.com/metrics | grep 'http_requests_total{.*status="5'

# 3. Check circuit breakers
curl -s https://api.medicalcor.com/health/circuit-breakers | jq .
```

**Common Causes & Fixes:**

| Cause                 | How to Verify                     | Fix                     |
| --------------------- | --------------------------------- | ----------------------- |
| Bad deployment        | Recent deploy matches error start | Rollback                |
| Database down         | `/ready` shows database error     | Check DB                |
| External service down | Circuit breaker open              | Wait or disable feature |
| Memory exhaustion     | OOM in logs                       | Scale up or fix leak    |
| Unhandled exception   | Stack trace in logs               | Deploy fix              |

---

### Issue: Slow Response Times

**Symptoms:**

- High latency in metrics
- Users reporting slowness
- Alert: `SlowResponses`

**Diagnosis:**

```bash
# 1. Check P95/P99 latency
curl -s https://api.medicalcor.com/metrics | grep "http_request_duration_seconds"

# 2. Check which endpoints are slow
gcloud logging read 'jsonPayload.duration > 2000' --limit=20

# 3. Check database query times
psql $DATABASE_URL -c "SELECT query, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

**Common Causes & Fixes:**

| Cause                 | How to Verify               | Fix                           |
| --------------------- | --------------------------- | ----------------------------- |
| Slow database queries | High mean_exec_time         | Add indexes, optimize queries |
| External API latency  | External duration in logs   | Check external service        |
| High traffic          | Request count spike         | Scale up                      |
| Memory pressure       | GC time in logs             | Scale up or optimize          |
| Cold starts           | Latency spikes at intervals | Increase min instances        |

---

### Issue: API Not Responding

**Symptoms:**

- Health check failing
- Connection timeouts
- Alert: `ServiceDown`

**Diagnosis:**

```bash
# 1. Check service status
gcloud run services describe medicalcor-api --region=europe-west3 --format="yaml(status)"

# 2. Check recent events
gcloud run revisions list --service=medicalcor-api --limit=5

# 3. Check container logs
gcloud logging read 'resource.type="cloud_run_revision"' --limit=50 --freshness=5m
```

**Common Causes & Fixes:**

| Cause               | How to Verify              | Fix                   |
| ------------------- | -------------------------- | --------------------- |
| Container crash     | Restart count high         | Check logs, fix crash |
| Failed deployment   | Revision not serving       | Rollback              |
| Resource exhaustion | OOM or CPU throttling      | Scale up              |
| Network issue       | GCP status                 | Check GCP status      |
| Secrets missing     | "Secret not found" in logs | Fix secret reference  |

---

## Database Issues

### Issue: Connection Pool Exhausted

**Symptoms:**

- "Connection pool exhausted" errors
- Slow response times
- `/ready` intermittently failing

**Diagnosis:**

```bash
# Check active connections
psql $DATABASE_URL -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check max connections
psql $DATABASE_URL -c "SHOW max_connections;"

# Check waiting queries
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE wait_event_type IS NOT NULL;"
```

**Fix:**

```bash
# 1. Kill idle connections (safe)
psql $DATABASE_URL -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle'
AND query_start < now() - interval '5 minutes'
AND pid <> pg_backend_pid();"

# 2. If issue persists, increase pool size in application config
# Update DATABASE_POOL_SIZE environment variable

# 3. If still an issue, increase max_connections on Cloud SQL
```

---

### Issue: Slow Queries

**Symptoms:**

- High latency on database operations
- Specific endpoints slow
- "statement timeout" errors

**Diagnosis:**

```bash
# Find slow queries
psql $DATABASE_URL -c "
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 10;"

# Check for missing indexes
psql $DATABASE_URL -c "
SELECT relname, seq_scan, idx_scan
FROM pg_stat_user_tables
WHERE seq_scan > 1000 AND idx_scan < seq_scan / 10
ORDER BY seq_scan DESC;"

# Check table sizes
psql $DATABASE_URL -c "
SELECT relname, n_live_tup
FROM pg_stat_user_tables
ORDER BY n_live_tup DESC
LIMIT 10;"
```

**Fix:**

```sql
-- Add missing index (example)
CREATE INDEX CONCURRENTLY idx_leads_phone ON leads(phone);

-- Analyze tables
ANALYZE leads;

-- Vacuum if needed
VACUUM ANALYZE leads;
```

---

### Issue: Database Disk Full

**Symptoms:**

- Write operations failing
- "no space left on device" errors

**Diagnosis:**

```bash
# GCP Cloud SQL - check storage
gcloud sql instances describe medicalcor-db-prod --format="yaml(settings.dataDiskSizeGb,currentDiskSize)"
```

**Fix:**

```bash
# 1. Increase disk size (Cloud SQL)
gcloud sql instances patch medicalcor-db-prod --storage-size=100GB

# 2. Clean up old data
psql $DATABASE_URL -c "DELETE FROM domain_events WHERE occurred_at < now() - interval '90 days';"

# 3. Vacuum to reclaim space
psql $DATABASE_URL -c "VACUUM FULL domain_events;"
```

---

## Redis Issues

### Issue: Redis Connection Failed

**Symptoms:**

- Rate limiting not working
- Session errors
- `/ready` shows Redis error

**Diagnosis:**

```bash
# Test connection
redis-cli -u $REDIS_URL PING

# Check if Redis is up (Memorystore)
gcloud redis instances describe medicalcor-cache --region=europe-west3 --format="yaml(state)"
```

**Fix:**

| Cause           | Fix                                   |
| --------------- | ------------------------------------- |
| Network issue   | Check VPC peering, firewall rules     |
| Auth failed     | Verify REDIS_URL has correct password |
| Instance down   | Check GCP status, restart instance    |
| Max connections | Scale Redis or reduce pool size       |

---

### Issue: Redis Memory Full

**Symptoms:**

- "OOM command not allowed" errors
- Eviction happening

**Diagnosis:**

```bash
redis-cli -u $REDIS_URL INFO memory | grep -E "used_memory|maxmemory|evicted_keys"
```

**Fix:**

```bash
# 1. Clear rate limit keys (safe, they'll regenerate)
redis-cli -u $REDIS_URL EVAL "for i, key in ipairs(redis.call('KEYS', 'rate_limit:*')) do redis.call('DEL', key) end return 'done'" 0

# 2. Scale up Redis instance
gcloud redis instances update medicalcor-cache --size=4 --region=europe-west3
```

---

## AI/OpenAI Issues

### Issue: AI Scoring Failing

**Symptoms:**

- High fallback rate
- Lead scoring timeouts
- Circuit breaker open for OpenAI

**Diagnosis:**

```bash
# Check fallback rate
curl -s https://api.medicalcor.com/metrics | grep "lead_scoring_fallback"

# Check circuit breaker
curl -s https://api.medicalcor.com/health/circuit-breakers | jq '.openai'

# Check OpenAI status
curl -s https://status.openai.com/api/v2/status.json | jq '.status.description'
```

**Fix:**

| Cause           | Fix                           |
| --------------- | ----------------------------- |
| OpenAI outage   | Wait, fallback is automatic   |
| Rate limited    | Check usage, request increase |
| API key invalid | Rotate key                    |
| Timeout         | Check if request is too large |

**Fallback behavior:**

- Rule-based scoring activates automatically
- Confidence score is lower (0.7 vs 0.8-0.95)
- No immediate action needed

---

### Issue: High AI Costs

**Symptoms:**

- AI spend alerts firing
- Unexpected usage spikes

**Diagnosis:**

```bash
# Check token usage
curl -s https://api.medicalcor.com/metrics | grep "ai_tokens"

# Check daily spend
curl -s https://api.medicalcor.com/metrics | grep "ai_daily_spend"
```

**Fix:**

1. Identify source of high usage (logs)
2. Check for scoring loops or duplicate requests
3. Consider rate limiting AI calls per user
4. Switch to cheaper model for non-critical tasks

---

## Integration Issues

### Issue: HubSpot Sync Failing

**Symptoms:**

- Contacts not syncing
- "HubSpot API error" in logs
- Circuit breaker open

**Diagnosis:**

```bash
# Check HubSpot circuit breaker
curl -s https://api.medicalcor.com/health/circuit-breakers | jq '.hubspot'

# Check HubSpot-related errors
gcloud logging read 'jsonPayload.component="hubspot"' --limit=20 --freshness=30m

# Check HubSpot status
curl -s https://api.hubspot.com/status
```

**Common Fixes:**

| Error            | Fix                                      |
| ---------------- | ---------------------------------------- |
| 401 Unauthorized | Rotate access token                      |
| 429 Rate Limited | Implement backoff, reduce sync frequency |
| 500 Server Error | Wait for HubSpot to recover              |
| Timeout          | Check HubSpot status                     |

---

### Issue: WhatsApp Messages Not Sending

**Symptoms:**

- Messages queued but not delivered
- 360dialog errors in logs

**Diagnosis:**

```bash
# Check WhatsApp-related errors
gcloud logging read 'jsonPayload.component="whatsapp"' --limit=20 --freshness=30m

# Check DLQ for failed messages
curl -s https://api.medicalcor.com/metrics | grep "dlq_pending"
```

**Common Fixes:**

| Error                 | Fix                       |
| --------------------- | ------------------------- |
| Invalid phone number  | Check E.164 format        |
| Template not approved | Check 360dialog dashboard |
| Rate limited          | Reduce send rate          |
| Auth failed           | Rotate API key            |

---

## Webhook Issues

### Issue: Webhooks Not Processing

**Symptoms:**

- No activity from external services
- DLQ growing
- Signature validation errors

**Diagnosis:**

```bash
# Check webhook endpoints are responding
curl -s https://api.medicalcor.com/webhooks/whatsapp/health

# Check for signature errors
gcloud logging read 'jsonPayload.error:"signature"' --limit=20 --freshness=1h

# Check DLQ
curl -s https://api.medicalcor.com/metrics | grep "dlq"
```

**Common Fixes:**

| Issue              | Fix                                           |
| ------------------ | --------------------------------------------- |
| Signature mismatch | Verify webhook secret matches external config |
| Timeout            | Increase webhook handler timeout              |
| 4xx errors         | Check validation, fix request handling        |
| DLQ full           | Process/clear DLQ                             |

### Reprocess DLQ

```bash
# View DLQ contents
redis-cli -u $REDIS_URL LRANGE "medicalcor:dlq" 0 10

# Reprocess failed webhooks (admin API)
curl -X POST https://api.medicalcor.com/admin/dlq/reprocess \
  -H "X-Api-Key: $ADMIN_API_KEY"
```

---

## Background Job Issues

### Issue: Trigger.dev Jobs Failing

**Symptoms:**

- Jobs stuck or failing in dashboard
- Alerts for job failures
- DLQ growing

**Diagnosis:**

1. Go to [cloud.trigger.dev](https://cloud.trigger.dev)
2. Navigate to Runs > Failed
3. Click on failed run to see error details

**Common Fixes:**

| Issue                  | Fix                                  |
| ---------------------- | ------------------------------------ |
| External service error | Check service status, may auto-retry |
| Code bug               | Fix and redeploy                     |
| Timeout                | Increase timeout or optimize task    |
| Resource exhaustion    | Scale workers                        |

### Retry a Failed Job

1. In Trigger.dev dashboard
2. Find the failed run
3. Click "Retry" to reprocess

---

### Issue: Cron Jobs Not Running

**Symptoms:**

- Scheduled tasks not executing
- Missing daily reports/reminders

**Diagnosis:**

1. Check Trigger.dev dashboard > Schedules
2. Verify schedule is active
3. Check for errors in recent runs

**Fix:**

1. If schedule is paused, resume it
2. If schedule is missing, redeploy: `cd apps/trigger && pnpm deploy`
3. Check timezone configuration

---

## Performance Issues

### Issue: Memory Leak

**Symptoms:**

- Increasing memory over time
- OOM restarts
- Performance degradation

**Diagnosis:**

```bash
# Check container memory usage
gcloud run revisions describe $REVISION --format="yaml(status.containerStatuses)"

# Check for OOM in logs
gcloud logging read 'textPayload:"OOM"' --limit=10 --freshness=24h
```

**Fix:**

1. Identify leak source (heap snapshot)
2. Common causes: unclosed connections, growing caches
3. Short-term: increase memory, restart
4. Long-term: fix the leak

---

### Issue: High CPU Usage

**Symptoms:**

- CPU throttling
- Slow responses
- Auto-scaling maxed out

**Diagnosis:**

```bash
# Check metrics
curl -s https://api.medicalcor.com/metrics | grep "process_cpu"
```

**Fix:**

1. Profile hot code paths
2. Optimize algorithms
3. Add caching for expensive operations
4. Scale horizontally

---

## Authentication Issues

### Issue: API Key Rejected

**Symptoms:**

- 401 Unauthorized errors
- "Invalid API key" messages

**Diagnosis:**

```bash
# Verify key format
echo $API_KEY | wc -c

# Test authentication
curl -I https://api.medicalcor.com/api/v1/health \
  -H "X-Api-Key: $API_KEY"
```

**Fix:**

1. Verify correct key is being used
2. Check key hasn't expired
3. Regenerate key if compromised
4. Check secrets are deployed correctly

---

### Issue: Session/JWT Expired

**Symptoms:**

- Users logged out unexpectedly
- "Token expired" errors

**Diagnosis:**

```bash
# Check JWT expiry settings
gcloud run services describe medicalcor-web --format="yaml(spec.template.spec.containers[0].env)" | grep JWT
```

**Fix:**

1. Adjust token expiry if too short
2. Implement refresh token flow
3. Check server clock sync

---

## Quick Reference Commands

```bash
# Health checks
curl -s https://api.medicalcor.com/health | jq .
curl -s https://api.medicalcor.com/ready | jq .
curl -s https://api.medicalcor.com/health/deep | jq .

# Metrics
curl -s https://api.medicalcor.com/metrics | grep "error\|latency\|circuit"

# Logs
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' --limit=20

# Database
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Redis
redis-cli -u $REDIS_URL PING

# Circuit breakers
curl -s https://api.medicalcor.com/health/circuit-breakers | jq .

# Rollback
gcloud run services update-traffic medicalcor-api --to-revisions=PREV_REVISION=100
```

---

## Revision History

| Date    | Version | Author        | Changes                  |
| ------- | ------- | ------------- | ------------------------ |
| 2024-12 | 1.0     | Platform Team | Initial runbook creation |
