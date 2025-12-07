# Incident Response Runbook

Procedures for detecting, responding to, and resolving incidents in MedicalCor Core platform.

---

## Table of Contents

- [Incident Lifecycle](#incident-lifecycle)
- [Detection](#detection)
- [Initial Response](#initial-response)
- [Investigation](#investigation)
- [Mitigation](#mitigation)
- [Resolution](#resolution)
- [Post-Incident](#post-incident)
- [Incident Types](#incident-types)
- [Communication Templates](#communication-templates)

---

## Incident Lifecycle

```
┌──────────────────────────────────────────────────────────────────┐
│                     INCIDENT LIFECYCLE                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────┐   ┌─────────┐   ┌──────────────┐   ┌───────────┐   │
│  │ Detect  │ → │ Respond │ → │ Investigate  │ → │  Mitigate │   │
│  └────┬────┘   └────┬────┘   └──────┬───────┘   └─────┬─────┘   │
│       │             │               │                 │          │
│       ▼             ▼               ▼                 ▼          │
│   Alerts        Assess          Root Cause        Stop the       │
│   Monitors      Severity        Analysis          Bleeding       │
│   Reports       Communicate     Logs/Traces       Workaround     │
│                 Escalate                                          │
│                                                                   │
│  ┌─────────┐   ┌─────────────┐                                   │
│  │ Resolve │ → │ Post-Mortem │                                   │
│  └────┬────┘   └──────┬──────┘                                   │
│       │               │                                           │
│       ▼               ▼                                           │
│   Fix Root        Document                                        │
│   Cause           Learn                                           │
│   Verify          Improve                                         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Detection

### Alert Sources

| Source | Type | Access |
|--------|------|--------|
| **PagerDuty** | Critical/High alerts | pagerduty.com/medicalcor |
| **Grafana** | Dashboards, warning alerts | grafana.medicalcor.com |
| **Slack #alerts** | All alerts | Slack channel |
| **Sentry** | Error tracking | sentry.io/medicalcor |
| **Trigger.dev** | Job failures | cloud.trigger.dev |
| **GCP Console** | Infrastructure alerts | console.cloud.google.com |

### Key Metrics to Monitor

| Metric | Warning Threshold | Critical Threshold |
|--------|------------------|-------------------|
| Error Rate (5xx) | > 1% for 5 min | > 5% for 2 min |
| Latency P95 | > 500ms for 5 min | > 2s for 2 min |
| API Availability | < 99.9% (rolling) | < 99% (rolling) |
| Circuit Breakers | 1 open | > 2 open |
| AI Fallback Rate | > 30% for 10 min | > 50% for 5 min |
| Queue Depth | > 500 pending | > 1000 pending |
| Database Connections | > 80% pool | > 95% pool |

### Quick Health Check

```bash
# Check all services
curl -s https://api.medicalcor.com/health | jq .
curl -s https://api.medicalcor.com/ready | jq .
curl -s https://api.medicalcor.com/health/deep | jq .

# Check circuit breakers
curl -s https://api.medicalcor.com/health/circuit-breakers | jq .

# Check metrics endpoint
curl -s https://api.medicalcor.com/metrics | grep -E "^(http_requests|medicalcor_)"
```

---

## Initial Response

### Step 1: Acknowledge (Within SLA)

| Severity | Ack Time | Action |
|----------|----------|--------|
| P1 | 5 min | Acknowledge in PagerDuty immediately |
| P2 | 15 min | Acknowledge in PagerDuty |
| P3 | 30 min | Acknowledge in Slack |
| P4 | 4 hours | Acknowledge in Slack |

### Step 2: Assess Severity

Use this decision matrix:

| Question | Yes → Higher Severity | No → Lower Severity |
|----------|----------------------|---------------------|
| Is the API completely down? | P1 | Check next |
| Are > 50% of requests failing? | P1 | Check next |
| Is payment processing affected? | P1-P2 | Check next |
| Are patient communications blocked? | P2 | Check next |
| Is lead scoring completely unavailable? | P2-P3 | Check next |
| Is only one integration affected? | P3 | Check next |
| Is it affecting only staging/dev? | P4 | P3-P4 |

### Step 3: Open Incident Channel

For P1/P2 incidents:

1. Create dedicated Slack channel: `#inc-YYYYMMDD-brief-description`
2. Post initial status:

```
**Incident Declared**
- Severity: P1/P2
- Time: [HH:MM UTC]
- Impact: [Brief description]
- Incident Commander: @[your-name]
- Status: Investigating
```

### Step 4: Notify Stakeholders

| Severity | Notify Immediately | Notify Within 15 min |
|----------|-------------------|---------------------|
| P1 | On-call, Eng Manager | VP Eng, Customer Support |
| P2 | On-call | Eng Manager |
| P3 | - | On-call |
| P4 | - | - |

---

## Investigation

### Gather Information

```bash
# 1. Check recent deployments
gcloud run revisions list --service=medicalcor-api --limit=5

# 2. Check recent config changes
gcloud run services describe medicalcor-api --format="yaml(spec.template.spec.containers[0].env)"

# 3. Check application logs (last 30 minutes)
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=100 --format="table(timestamp,textPayload)"

# 4. Check for correlation IDs in errors
gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.level="error"' \
  --limit=50 --format=json | jq '.[].jsonPayload.correlationId'
```

### Trace a Request

```bash
# If you have a correlation ID
gcloud logging read 'jsonPayload.correlationId="<CORRELATION_ID>"' \
  --format="table(timestamp,jsonPayload.msg,jsonPayload.component)"

# Check in Grafana Tempo (if configured)
# Navigate to: Explore → Tempo → Search by trace ID
```

### Check External Dependencies

```bash
# HubSpot Status
curl -s https://api.hubspot.com/status

# OpenAI Status
curl -s https://status.openai.com/api/v2/status.json | jq .

# 360dialog (WhatsApp) Status
curl -s https://status.360dialog.com/api/v2/status.json | jq .

# Stripe Status
curl -s https://status.stripe.com/api/v2/status.json | jq .
```

### Database Investigation

```bash
# Check active connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active';"

# Check long-running queries
psql $DATABASE_URL -c "SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' AND query_start < now() - interval '30 seconds';"

# Check table sizes
psql $DATABASE_URL -c "SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;"
```

### Redis Investigation

```bash
# Check Redis connectivity and info
redis-cli -u $REDIS_URL INFO | grep -E "connected_clients|used_memory|blocked_clients"

# Check queue sizes
redis-cli -u $REDIS_URL LLEN "medicalcor:dlq"

# Check rate limit keys
redis-cli -u $REDIS_URL KEYS "rate_limit:*" | wc -l
```

---

## Mitigation

### Priority Actions

1. **Stop the bleeding** - Prevent further damage
2. **Preserve evidence** - Don't destroy logs/state
3. **Communicate** - Keep stakeholders informed
4. **Fix forward if safe** - Or rollback

### Common Mitigations

#### High Error Rate

```bash
# Option 1: Scale up (if capacity issue)
gcloud run services update medicalcor-api --max-instances=20

# Option 2: Enable circuit breaker (if external dependency)
# Circuit breakers auto-activate after 5 failures

# Option 3: Rollback (if recent deploy)
# See ROLLBACK.md
```

#### Database Connection Issues

```bash
# Check current connections
psql $DATABASE_URL -c "SELECT count(*) FROM pg_stat_activity;"

# Terminate idle connections (be careful!)
psql $DATABASE_URL -c "SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE state = 'idle' AND query_start < now() - interval '5 minutes';"
```

#### AI Service Degraded

```bash
# Check fallback is working
curl -s https://api.medicalcor.com/metrics | grep "lead_scoring_fallback"

# If fallback is also failing, check OpenAI status and circuit breaker
curl -s https://api.medicalcor.com/health/circuit-breakers | jq '.openai'
```

#### Webhook Processing Backlog

```bash
# Check DLQ size
curl -s https://api.medicalcor.com/metrics | grep "dlq_pending"

# If needed, pause incoming webhooks (extreme measure)
# Configure at load balancer or rate limit to 0
```

---

## Resolution

### Verify Fix

```bash
# 1. Check health endpoints
curl -s https://api.medicalcor.com/health | jq .

# 2. Verify metrics returning to normal
curl -s https://api.medicalcor.com/metrics | grep -E "http_requests_total|error"

# 3. Run smoke tests
pnpm run test:smoke

# 4. Check for new errors in logs
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=10 --freshness=5m
```

### Close Incident

1. Update incident channel:
   ```
   **Incident Resolved**
   - Resolution Time: [HH:MM UTC]
   - Root Cause: [Brief description]
   - Fix Applied: [What was done]
   - Duration: [X hours Y minutes]
   - Next Steps: Post-mortem scheduled
   ```

2. Resolve PagerDuty incident
3. Update status page (if applicable)
4. Notify stakeholders of resolution

---

## Post-Incident

### Timeline (for P1/P2)

| Action | Deadline |
|--------|----------|
| Incident Summary | Within 4 hours |
| Preliminary Root Cause | Within 24 hours |
| Full Post-Mortem | Within 72 hours |
| Action Items Assigned | Within 1 week |
| Action Items Completed | Track to closure |

### Post-Mortem Template

```markdown
# Post-Mortem: [Incident Title]

**Date:** YYYY-MM-DD
**Duration:** X hours Y minutes
**Severity:** P1/P2
**Author:** [Name]

## Summary
[2-3 sentence summary of what happened]

## Impact
- Users affected: [Number or percentage]
- Requests failed: [Number]
- Revenue impact: [If applicable]
- Error budget consumed: [Percentage]

## Timeline (UTC)
| Time | Event |
|------|-------|
| HH:MM | [First symptom detected] |
| HH:MM | [Incident declared] |
| HH:MM | [Root cause identified] |
| HH:MM | [Mitigation applied] |
| HH:MM | [Incident resolved] |

## Root Cause
[Detailed explanation of what caused the incident]

## Resolution
[What was done to fix the issue]

## Lessons Learned
### What went well
- [Point 1]
- [Point 2]

### What could be improved
- [Point 1]
- [Point 2]

## Action Items
| Priority | Action | Owner | Due Date |
|----------|--------|-------|----------|
| P1 | [Action] | @name | YYYY-MM-DD |
| P2 | [Action] | @name | YYYY-MM-DD |
```

---

## Incident Types

### 1. API Outage

**Symptoms:**
- Health checks failing
- 5xx errors on all endpoints
- No traffic in monitoring

**Quick Diagnosis:**
```bash
# Check service status
gcloud run services describe medicalcor-api --format="yaml(status)"

# Check recent revisions
gcloud run revisions list --service=medicalcor-api --limit=3
```

**Common Causes:**
- Bad deployment
- Database unavailable
- Misconfiguration

**Mitigation:** See [ROLLBACK.md](./ROLLBACK.md)

---

### 2. Database Outage

**Symptoms:**
- `/ready` endpoint failing
- Connection errors in logs
- All data operations failing

**Quick Diagnosis:**
```bash
# Test direct connection
psql $DATABASE_URL -c "SELECT 1"

# Check Cloud SQL status (GCP)
gcloud sql instances describe medicalcor-db --format="yaml(state,serviceAccountEmailAddress)"
```

**Mitigation:** See [DR-PROCEDURES.md](../DR-PROCEDURES.md)

---

### 3. External Integration Failure

**Symptoms:**
- Circuit breaker open
- Specific operation failing
- Fallback metrics elevated

**Quick Diagnosis:**
```bash
# Check circuit breaker status
curl -s https://api.medicalcor.com/health/circuit-breakers | jq .

# Check integration-specific logs
gcloud logging read 'jsonPayload.component="hubspot" OR jsonPayload.component="openai"' \
  --limit=50 --freshness=30m
```

**Mitigation:**
- Wait for circuit breaker to recover
- Check external service status pages
- If persistent, contact integration support

---

### 4. Performance Degradation

**Symptoms:**
- Elevated latency
- Slow responses but not errors
- Queue backlog growing

**Quick Diagnosis:**
```bash
# Check current latency
curl -s https://api.medicalcor.com/metrics | grep "http_request_duration"

# Check for slow database queries
psql $DATABASE_URL -c "SELECT query, calls, mean_exec_time
FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;"
```

**Mitigation:**
- Scale up resources
- Add missing indexes
- Enable query caching

---

### 5. Security Incident

**Symptoms:**
- Unusual access patterns
- Credential exposure
- Data exfiltration alerts

**Immediate Actions:**
1. **DO NOT** discuss in public channels
2. Notify Security Team immediately: security@medicalcor.com
3. Preserve all logs and evidence
4. Follow [Security Incident Playbook](../README/SECURITY.md#incident-response)

---

## Communication Templates

### Internal Status Update (Slack)

```
**Incident Update - [Time UTC]**
- Status: Investigating / Identified / Mitigating / Resolved
- Impact: [Current impact description]
- Progress: [What's been done]
- ETA: [If known, or "Investigating"]
- Next Update: [Time of next update]
```

### Customer Communication (Support)

```
We are currently experiencing [brief description of issue]. Our team is actively working on a resolution.

Impact: [What customers may experience]
Started: [Time]
Current Status: [Investigating/Fixing]

We will provide updates as we have more information. We apologize for any inconvenience.
```

### Status Page Update

```
Title: [Service] Degraded Performance / Outage

[Time] - Investigating
We are investigating reports of [issue description].

[Time] - Identified
The issue has been identified as [root cause]. We are working on a fix.

[Time] - Monitoring
A fix has been implemented. We are monitoring the situation.

[Time] - Resolved
This incident has been resolved. [Brief description of fix].
```

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2024-12 | 1.0 | Platform Team | Initial runbook creation |
