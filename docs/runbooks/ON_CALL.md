# On-Call Runbook

Comprehensive guide for on-call engineers at MedicalCor Core, including responsibilities, handoff procedures, and operational guidelines.

---

## Table of Contents

- [On-Call Responsibilities](#on-call-responsibilities)
- [Before Your Shift](#before-your-shift)
- [During Your Shift](#during-your-shift)
- [Handling Alerts](#handling-alerts)
- [Handoff Procedures](#handoff-procedures)
- [After Hours Guidelines](#after-hours-guidelines)
- [Self-Care and Burnout Prevention](#self-care-and-burnout-prevention)
- [On-Call Tools and Access](#on-call-tools-and-access)

---

## On-Call Responsibilities

### Primary On-Call

| Responsibility           | Description                                 |
| ------------------------ | ------------------------------------------- |
| **Acknowledge alerts**   | Within 5 min (P1), 15 min (P2), 30 min (P3) |
| **Initial triage**       | Assess severity and impact                  |
| **Begin investigation**  | Start diagnosis and mitigation              |
| **Escalate when needed** | Don't struggle alone                        |
| **Communicate**          | Keep stakeholders informed                  |
| **Document**             | Log actions in incident channel             |
| **Handoff**              | Brief incoming on-call                      |

### Secondary On-Call (Backup)

| Responsibility               | Description                  |
| ---------------------------- | ---------------------------- |
| **Available for escalation** | Reachable within 15 min      |
| **Support primary**          | Provide expertise when asked |
| **Take over if needed**      | If primary is unavailable    |

### What On-Call is NOT

- Not responsible for fixing all bugs
- Not expected to know everything
- Not required to stay awake 24/7 (escalate if exhausted)
- Not alone (escalation is encouraged)

---

## Before Your Shift

### One Week Before

- [ ] Confirm you're available for the rotation dates
- [ ] Arrange coverage if you have conflicts
- [ ] Review any ongoing incidents or known issues

### Day Before

- [ ] Check PagerDuty schedule shows you as on-call
- [ ] Verify your phone receives PagerDuty notifications
- [ ] Test your laptop/VPN access works remotely
- [ ] Review recent deployments and changes

### Shift Start Checklist

- [ ] Read handoff notes from previous on-call
- [ ] Check open incidents/tickets
- [ ] Review recent alerts and their resolutions
- [ ] Verify access to all required systems
- [ ] Join #on-call Slack channel

### Environment Setup

```bash
# Ensure you have access to production
gcloud auth login
gcloud config set project medicalcor-prod

# Test access
gcloud run services describe medicalcor-api --region=europe-west3

# Set up local monitoring
open https://grafana.medicalcor.com
open https://pagerduty.com

# Clone/update repository
cd ~/work
git clone https://github.com/medicalcor/medicalcor-core.git 2>/dev/null || cd medicalcor-core && git pull

# Verify you can run commands
curl -s https://api.medicalcor.com/health | jq .
```

---

## During Your Shift

### Daily Routine

| Time               | Action                           |
| ------------------ | -------------------------------- |
| **Start of shift** | Review handoff, check dashboards |
| **Hourly**         | Quick glance at key metrics      |
| **End of shift**   | Write handoff notes              |

### Key Dashboards to Monitor

| Dashboard                                                        | Purpose                 | Check Frequency |
| ---------------------------------------------------------------- | ----------------------- | --------------- |
| [MedicalCor Overview](https://grafana.medicalcor.com/d/overview) | System health summary   | Every 2 hours   |
| [API Performance](https://grafana.medicalcor.com/d/api)          | Request metrics, errors | On alert        |
| [AI Gateway](https://grafana.medicalcor.com/d/ai)                | AI service health       | Every 4 hours   |
| [Error Budget](https://grafana.medicalcor.com/d/slo)             | SLO status              | Start of shift  |

### Quick Health Check Script

```bash
#!/bin/bash
# Save as ~/bin/health-check.sh

echo "=== MedicalCor Health Check ==="
echo ""

echo "API Health:"
curl -s https://api.medicalcor.com/health | jq -r '.status'

echo ""
echo "Dependencies:"
curl -s https://api.medicalcor.com/ready | jq -r '.checks | to_entries[] | "\(.key): \(.value)"'

echo ""
echo "Circuit Breakers:"
curl -s https://api.medicalcor.com/health/circuit-breakers | jq -r 'to_entries[] | "\(.key): \(.value.state)"'

echo ""
echo "Recent Errors (last 10 min):"
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR' \
  --limit=5 --freshness=10m --format="table(timestamp,textPayload)"
```

---

## Handling Alerts

### Alert Response Workflow

```
┌─────────────────────────────────────────────────────────────┐
│                    ALERT RECEIVED                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. ACKNOWLEDGE (within SLA)                                │
│      └─→ PagerDuty: Click "Acknowledge"                     │
│                                                              │
│   2. ASSESS                                                  │
│      ├─→ What is the alert saying?                          │
│      ├─→ What is the actual impact?                         │
│      └─→ Is this a known issue?                             │
│                                                              │
│   3. DECIDE                                                  │
│      ├─→ False positive? → Suppress/tune alert              │
│      ├─→ Known fix? → Apply fix                             │
│      ├─→ Unknown? → Investigate                             │
│      └─→ Complex? → Escalate                                │
│                                                              │
│   4. ACT                                                     │
│      ├─→ Apply mitigation                                    │
│      ├─→ Document actions                                    │
│      └─→ Communicate status                                  │
│                                                              │
│   5. RESOLVE                                                 │
│      ├─→ Verify issue is fixed                              │
│      ├─→ Resolve in PagerDuty                               │
│      └─→ Update runbooks if needed                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Common Alerts and Initial Actions

| Alert                   | First Check                     | Common Fix                |
| ----------------------- | ------------------------------- | ------------------------- |
| **HighErrorRate**       | Recent deployments              | Rollback or fix           |
| **ServiceDown**         | Health endpoints                | Check GCP status, restart |
| **SlowResponses**       | Database queries, external APIs | Scale up, optimize        |
| **CircuitBreakerOpen**  | External service status         | Wait or disable feature   |
| **AIServiceDegraded**   | OpenAI status                   | Fallback is automatic     |
| **DatabaseConnections** | Pool utilization                | Scale pool or kill idle   |
| **DLQBacklog**          | Failed webhooks                 | Investigate, reprocess    |

### Noise vs. Signal

Signs of a **real issue**:

- Multiple related alerts
- User reports matching alert
- Metrics confirm the problem
- Alert persists after initial check

Signs of **noise**:

- Single transient alert
- Alert auto-resolves quickly
- Metrics look normal
- Known external issue

---

## Handoff Procedures

### Preparing Handoff Notes

Write handoff notes 30 minutes before shift end:

```markdown
## On-Call Handoff: [Date] [Your Name] → [Next On-Call]

### Shift Summary

- Total alerts: X
- Incidents declared: X
- Notable events: [brief description]

### Active Issues

[List any ongoing issues that need monitoring]

1. **Issue:** [Description]
   - Status: [Investigating/Monitoring/Waiting]
   - Context: [What's been done]
   - Next steps: [What to watch for]

### Recent Changes

[List any deployments or changes in the last 24 hours]

- [Time]: [Change description] by [Person]

### Upcoming Concerns

[List anything the next on-call should watch for]

- [Scheduled maintenance, expected traffic spike, etc.]

### Notes

[Any other relevant information]
```

### Handoff Meeting (If Required)

For P1/P2 incidents or complex situations:

1. **Schedule 10-15 min sync** at shift change
2. **Walk through active issues** together
3. **Transfer incident commander role** if applicable
4. **Confirm next on-call has access** to everything needed

### Async Handoff (Normal)

1. Post handoff notes in #on-call channel
2. Tag incoming on-call: "@next-oncall handoff notes above"
3. Be available for questions for 30 min after shift

---

## After Hours Guidelines

### Response Expectations

| Time                  | P1 Response | P2 Response | P3 Response       |
| --------------------- | ----------- | ----------- | ----------------- |
| Business hours (9-18) | 5 min       | 15 min      | 30 min            |
| After hours (18-22)   | 10 min      | 30 min      | Next business day |
| Night (22-9)          | 15 min      | 1 hour      | Next business day |
| Weekend               | 15 min      | 1 hour      | Next business day |

### What Warrants Waking Up

**Wake up for:**

- P1: Complete outage, data breach, payment processing down
- P2 persisting > 1 hour: Major feature broken affecting many users

**Can wait until morning:**

- P3: Single integration degraded with workaround
- P4: Non-critical issues
- Alerts that auto-resolve

### Sleep Mode Best Practices

```bash
# Configure PagerDuty for after-hours
# Set your "Personal Notification Rules" to:
# - Immediate: P1 calls + SMS
# - After 5 min: P2 calls
# - Email only: P3, P4

# Turn on Do Not Disturb for non-PagerDuty apps
# Keep PagerDuty exceptions enabled
```

---

## Self-Care and Burnout Prevention

### During Shift

- Take breaks - you don't need to stare at dashboards constantly
- Eat regular meals
- Stay hydrated
- Step away from screen hourly

### If Overwhelmed

1. **Escalate** - Get help, don't suffer alone
2. **Ask for coverage** - If sick or exhausted
3. **Communicate** - Let the team know you need support

### Post-Incident Recovery

After a stressful incident:

- Take a short break
- Debrief with someone
- Don't immediately jump into regular work
- Take comp time if needed

### Rotation Best Practices

| Practice                        | Why                          |
| ------------------------------- | ---------------------------- |
| 1-week rotations                | Sustainable, time to recover |
| At least 2 weeks between shifts | Prevent burnout              |
| Volunteer swaps allowed         | Flexibility                  |
| Post-incident recovery time     | Mental health                |

---

## On-Call Tools and Access

### Required Access

Before going on-call, verify access to:

| System         | Purpose                | How to Request               |
| -------------- | ---------------------- | ---------------------------- |
| PagerDuty      | Alert management       | IT ticket                    |
| Grafana        | Dashboards and metrics | IT ticket                    |
| GCP Console    | Cloud infrastructure   | IT ticket + manager approval |
| Slack #on-call | Communication          | Self-join                    |
| GitHub         | Code and deployments   | IT ticket                    |
| Trigger.dev    | Background jobs        | Eng manager                  |

### Essential Bookmarks

```
# Quick access links
https://pagerduty.com/medicalcor          # PagerDuty
https://grafana.medicalcor.com            # Grafana
https://console.cloud.google.com          # GCP Console
https://cloud.trigger.dev                 # Trigger.dev
https://sentry.io/medicalcor             # Sentry
https://api.medicalcor.com/health        # API Health
```

### Useful CLI Aliases

Add to your `~/.bashrc` or `~/.zshrc`:

```bash
# On-call aliases
alias health='curl -s https://api.medicalcor.com/health | jq .'
alias ready='curl -s https://api.medicalcor.com/ready | jq .'
alias circuits='curl -s https://api.medicalcor.com/health/circuit-breakers | jq .'

# Log shortcuts
alias prod-logs='gcloud logging read "resource.type=cloud_run_revision" --limit=50 --format="table(timestamp,textPayload)"'
alias prod-errors='gcloud logging read "resource.type=cloud_run_revision AND severity>=ERROR" --limit=20'

# Deployment info
alias prod-revisions='gcloud run revisions list --service=medicalcor-api --region=europe-west3 --limit=5'
```

### Mobile Setup

1. Install PagerDuty mobile app
2. Configure push notifications
3. Test that alerts reach your phone
4. Add bypass for Do Not Disturb

---

## On-Call Compensation

| Item              | Policy                |
| ----------------- | --------------------- |
| Shift pay         | Per company policy    |
| Incident response | Per company policy    |
| Comp time         | After major incidents |
| Weekend work      | Per company policy    |

---

## Emergency Contacts

For true emergencies where normal escalation fails:

| Situation                             | Contact               |
| ------------------------------------- | --------------------- |
| Can't reach anyone on escalation path | VP Engineering mobile |
| Security emergency                    | CISO mobile           |
| Major outage > 2 hours                | CTO mobile            |

---

## Frequently Asked Questions

**Q: What if I can't fix something?**
A: Escalate. That's what escalation is for. No shame in asking for help.

**Q: What if it's 3 AM and I'm exhausted?**
A: Escalate to secondary on-call. Your health matters.

**Q: What if it's a false positive alert?**
A: Resolve the alert and create a ticket to tune it.

**Q: What if I made a mistake during an incident?**
A: Document it, learn from it, fix it. Blame-free culture.

**Q: Can I do personal things during on-call?**
A: Yes, as long as you can respond within SLA. Stay near your laptop.

---

## Revision History

| Date    | Version | Author        | Changes                  |
| ------- | ------- | ------------- | ------------------------ |
| 2024-12 | 1.0     | Platform Team | Initial runbook creation |
