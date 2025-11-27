# Runbook: Patient Journey Debugging

**Version**: 1.0
**Last Updated**: 27 Noiembrie 2025
**Owner**: Engineering Team

---

## Quick Reference

| Symptom | Jump To |
|---------|---------|
| Lead not scored | [Scenario 1](#scenario-1-lead-not-scored) |
| Scoring timeout/slow | [Scenario 2](#scenario-2-scoring-timeout-or-slow) |
| HubSpot not updated | [Scenario 3](#scenario-3-hubspot-not-updated) |
| WhatsApp message not sent | [Scenario 4](#scenario-4-whatsapp-message-not-sent) |
| Booking failed | [Scenario 5](#scenario-5-booking-failed) |
| Journey stuck | [Scenario 6](#scenario-6-journey-stuck-in-stage) |

---

## Prerequisites

### Tools Required
```bash
# Access to these systems:
- Trigger.dev Dashboard (https://cloud.trigger.dev)
- Grafana (http://localhost:3001 or production URL)
- Redis CLI
- PostgreSQL access
- Sentry (https://sentry.io)
```

### Key Correlation IDs
Every Patient Journey has a `correlationId` that links all events across systems:
- Format: UUID v4 (e.g., `550e8400-e29b-41d4-a716-446655440000`)
- Passed through: Webhooks -> Trigger.dev -> HubSpot -> WhatsApp -> EventStore

---

## Scenario 1: Lead Not Scored

### Symptoms
- Lead appears in HubSpot without `lead_score` property
- No `lead.scored` event in EventStore
- Patient Journey stuck at initial stage

### Diagnostic Steps

#### Step 1: Check Trigger.dev Dashboard
```
1. Go to Trigger.dev Dashboard
2. Navigate to Jobs -> "lead-scoring-workflow"
3. Filter by phone number or correlationId
4. Check job status: PENDING | RUNNING | COMPLETED | FAILED
```

#### Step 2: Check Redis Queue
```bash
# Connect to Redis
redis-cli -h localhost -p 6379

# Check pending jobs
LLEN trigger:queue:lead-scoring

# Check recent job IDs
LRANGE trigger:queue:lead-scoring 0 10
```

#### Step 3: Check Logs
```bash
# Search for correlationId in logs
grep -r "correlationId\":\"${CORRELATION_ID}" /var/log/medicalcor/

# Or via Grafana Loki
{app="trigger"} |= "correlationId" |= "${CORRELATION_ID}"
```

#### Step 4: Check EventStore
```sql
-- Find all events for a phone number
SELECT * FROM domain_events
WHERE payload->>'phone' = '+40712345678'
ORDER BY occurred_at DESC
LIMIT 20;
```

### Resolution Actions

| Cause | Action |
|-------|--------|
| Job stuck in PENDING | Restart Trigger.dev worker: `npm run trigger:dev` |
| Job FAILED with OpenAI error | Check OpenAI status, verify API key, retry job |
| Job FAILED with HubSpot error | Verify HubSpot token, check contact exists |
| No job found | Check webhook received, verify payload format |

### Manual Retry
```bash
# Trigger manual scoring via API
curl -X POST http://localhost:3000/ai/execute \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "scoreMessage",
    "input": {
      "phone": "+40712345678",
      "message": "Vreau informatii despre implant dentar",
      "channel": "whatsapp"
    }
  }'
```

---

## Scenario 2: Scoring Timeout or Slow

### Symptoms
- Scoring takes >5 seconds (should be instant with fallback)
- High latency visible in Grafana
- Users report slow responses

### Diagnostic Steps

#### Step 1: Check Adaptive Timeout Metrics
```promql
# In Grafana, run these queries:

# Scoring p95 latency (should be <5s)
histogram_quantile(0.95, rate(medicalcor_ai_scoring_duration_seconds_bucket[5m]))

# Timeout count
sum(increase(medicalcor_ai_timeout_total{operation="scoring"}[1h]))

# Fallback rate
sum(rate(medicalcor_ai_instant_fallback_total[5m])) / sum(rate(medicalcor_ai_requests_total[5m]))
```

#### Step 2: Check Provider Health
```promql
# Provider error rate
sum(rate(medicalcor_ai_requests_total{status="error"}[5m])) by (provider)

# Provider latency by provider
histogram_quantile(0.95, rate(medicalcor_ai_operation_duration_seconds_bucket[5m])) by (provider)
```

#### Step 3: Check Circuit Breaker Status
```bash
# Via API
curl http://localhost:3000/health/circuit-breakers

# Expected response shows breaker state:
{
  "openai": { "state": "closed", "failures": 0, "successes": 10 },
  "anthropic": { "state": "closed", "failures": 0, "successes": 5 }
}
```

### Resolution Actions

| Cause | Action |
|-------|--------|
| OpenAI degraded | Multi-provider gateway auto-switches to Anthropic |
| All providers slow | Fallback to rule-based scoring (confidence: 0.7) |
| Circuit breaker open | Wait for auto-recovery or manual reset |
| High traffic spike | Check rate limiting, consider scaling |

### Manual Circuit Breaker Reset
```bash
# Reset OpenAI circuit breaker
curl -X POST http://localhost:3000/health/circuit-breakers/openai/reset

# Reset all breakers
curl -X POST http://localhost:3000/health/circuit-breakers/reset-all
```

---

## Scenario 3: HubSpot Not Updated

### Symptoms
- Lead scored but HubSpot `lead_score` property empty
- `lead.scored` event exists but HubSpot shows old data

### Diagnostic Steps

#### Step 1: Verify HubSpot Contact Exists
```bash
# Check HubSpot API
curl -X GET "https://api.hubapi.com/crm/v3/objects/contacts/${HUBSPOT_CONTACT_ID}" \
  -H "Authorization: Bearer ${HUBSPOT_TOKEN}"
```

#### Step 2: Check HubSpot Rate Limits
```promql
# HubSpot error rate
sum(rate(medicalcor_external_service_requests_total{service="hubspot",status="error"}[5m]))
```

#### Step 3: Check Workflow Logs
```bash
# In Trigger.dev logs, search for:
# "Failed to update HubSpot contact"
```

### Resolution Actions

| Cause | Action |
|-------|--------|
| Contact not found | Create contact first, then retry scoring |
| Rate limited | Wait 10s, HubSpot auto-recovers |
| Invalid property | Verify `lead_score` property exists in HubSpot |
| Auth error | Rotate HubSpot API token |

### Manual HubSpot Update
```bash
curl -X PATCH "https://api.hubapi.com/crm/v3/objects/contacts/${HUBSPOT_CONTACT_ID}" \
  -H "Authorization: Bearer ${HUBSPOT_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "properties": {
      "lead_score": "4",
      "lead_status": "hot"
    }
  }'
```

---

## Scenario 4: WhatsApp Message Not Sent

### Symptoms
- Patient Journey progressed but WhatsApp reply not received
- `whatsapp.message.sent` event missing

### Diagnostic Steps

#### Step 1: Check WhatsApp Handler
```bash
# In Trigger.dev, check "whatsapp-handler" job
# Filter by phone number
```

#### Step 2: Verify WhatsApp Business API
```bash
# Check WhatsApp API health
curl -X GET "https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}" \
  -H "Authorization: Bearer ${WHATSAPP_TOKEN}"
```

#### Step 3: Check Message Template
```sql
-- Verify template was used correctly
SELECT * FROM domain_events
WHERE type = 'whatsapp.message.queued'
  AND payload->>'phone' = '+40712345678'
ORDER BY occurred_at DESC;
```

### Resolution Actions

| Cause | Action |
|-------|--------|
| Template not approved | Use approved templates only |
| 24h window expired | Send template message to re-engage |
| Phone format error | Ensure E.164 format (+40...) |
| Rate limited | Wait, WhatsApp has hourly limits |

---

## Scenario 5: Booking Failed

### Symptoms
- User requested booking but no appointment created
- `booking.failed` event in EventStore

### Diagnostic Steps

#### Step 1: Check Booking Workflow
```bash
# In Trigger.dev, check "booking-agent-workflow"
# Look for race condition errors
```

#### Step 2: Check Slot Availability
```sql
-- Check available slots
SELECT * FROM available_slots
WHERE practitioner_id = ${PRACTITIONER_ID}
  AND slot_date >= CURRENT_DATE
  AND is_available = true
ORDER BY slot_date, slot_time;
```

#### Step 3: Check Concurrent Bookings
```bash
# Check Redis for booking locks
redis-cli KEYS "booking:lock:*"
```

### Resolution Actions

| Cause | Action |
|-------|--------|
| Slot taken (race condition) | Workflow auto-retries with new slot |
| No slots available | Notify patient, add to waitlist |
| Practitioner unavailable | Route to another practitioner |
| Payment required | Trigger payment flow |

---

## Scenario 6: Journey Stuck in Stage

### Symptoms
- Patient stuck in WARM or COLD stage
- No progression for >24 hours

### Diagnostic Steps

#### Step 1: Check Current Stage
```sql
-- Get lead current stage
SELECT
  l.phone,
  l.classification,
  l.ai_score,
  l.updated_at,
  NOW() - l.updated_at as time_in_stage
FROM leads l
WHERE l.phone = '+40712345678';
```

#### Step 2: Check Nurture Sequence
```bash
# In Trigger.dev, check "nurture-sequence-workflow"
# Verify scheduled follow-ups
```

#### Step 3: Check Event Timeline
```sql
-- Full event timeline for lead
SELECT
  type,
  occurred_at,
  payload->>'classification' as classification,
  payload->>'suggestedAction' as action
FROM domain_events
WHERE aggregate_id = ${LEAD_ID}
  OR payload->>'phone' = '+40712345678'
ORDER BY occurred_at;
```

### Resolution Actions

| Cause | Action |
|-------|--------|
| Nurture not triggered | Manually trigger nurture sequence |
| Classification wrong | Re-score with fresh context |
| User unresponsive | Mark as COLD, reduce follow-up frequency |
| System error | Check logs, fix bug, re-process |

---

## Grafana Queries Reference

### Lead Scoring Health
```promql
# Scoring success rate
sum(rate(medicalcor_ai_requests_total{operation="scoring",status="success"}[5m]))
/ sum(rate(medicalcor_ai_requests_total{operation="scoring"}[5m]))

# Average scoring latency
histogram_quantile(0.50, rate(medicalcor_ai_scoring_duration_seconds_bucket[5m]))

# Fallback usage rate
sum(rate(medicalcor_ai_instant_fallback_total{operation="scoring"}[5m]))
/ sum(rate(medicalcor_ai_requests_total{operation="scoring"}[5m]))
```

### Journey Stage Distribution
```promql
# Current leads by stage
sum(medicalcor_lead_classification_current) by (classification)

# Stage transitions per hour
sum(increase(medicalcor_patient_journey_stage_total[1h])) by (stage)
```

### Cost Monitoring
```promql
# Current daily spend
sum(medicalcor_ai_daily_spend_usd)

# Projected daily spend (based on current rate)
sum(rate(medicalcor_ai_spend_usd[1h])) * 24

# Cost per lead scored
sum(increase(medicalcor_ai_spend_usd[24h]))
/ sum(increase(medicalcor_ai_requests_total{operation="scoring"}[24h]))
```

---

## Escalation Matrix

| Severity | Condition | Action |
|----------|-----------|--------|
| **P1 Critical** | All scoring failing, >10min | Page on-call, escalate to AI team |
| **P2 High** | Scoring degraded >50%, >30min | Alert Slack, investigate |
| **P3 Medium** | Single provider down | Monitor, auto-failover active |
| **P4 Low** | Latency elevated <2x | Monitor, no immediate action |

### On-Call Contacts
- Primary: Engineering Lead
- Secondary: Platform Team
- Escalation: CTO

---

## Appendix: Common Log Patterns

### Successful Scoring
```
INFO [lead-scoring] Starting lead scoring workflow {"phone":"+40...","correlationId":"..."}
INFO [lead-scoring] Lead context built {"correlationId":"...","hasUTM":true}
INFO [lead-scoring] AI scoring completed {"score":4,"classification":"HOT","confidence":0.92}
INFO [lead-scoring] HubSpot contact updated with score {"hubspotContactId":"..."}
INFO [lead-scoring] Lead scoring workflow completed
```

### Fallback to Rule-Based
```
WARN [lead-scoring] AI scoring failed, falling back to rule-based {"error":"timeout"}
INFO [lead-scoring] Lead scoring completed {"score":3,"classification":"WARM","confidence":0.7}
```

### Circuit Breaker Trip
```
WARN [circuit-breaker] Circuit breaker opened for openai {"failures":5,"threshold":5}
INFO [multi-provider] Switching to anthropic provider
```

---

**Document maintained by**: Engineering Team
**Review schedule**: Monthly or after incidents
