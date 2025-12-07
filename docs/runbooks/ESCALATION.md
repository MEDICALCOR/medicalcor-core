# Escalation Runbook

Escalation paths, decision criteria, and contact information for MedicalCor Core platform incidents.

---

## Table of Contents

- [Escalation Matrix](#escalation-matrix)
- [When to Escalate](#when-to-escalate)
- [Escalation Paths](#escalation-paths)
- [Contact Directory](#contact-directory)
- [Escalation Procedures](#escalation-procedures)
- [De-escalation](#de-escalation)
- [External Escalations](#external-escalations)

---

## Escalation Matrix

### By Severity

| Severity | Initial Responder | 15 min | 30 min | 1 hour | 2 hours |
|----------|------------------|--------|--------|--------|---------|
| **P1** | On-Call | Eng Manager | VP Engineering | CTO | CEO |
| **P2** | On-Call | Eng Manager | VP Engineering | - | - |
| **P3** | On-Call | - | Eng Manager | - | - |
| **P4** | On-Call | - | - | - | - |

### By Domain

| Domain | Primary | Secondary | Tertiary |
|--------|---------|-----------|----------|
| **API/Backend** | Backend On-Call | Backend Lead | VP Engineering |
| **Database** | DBA On-Call | Database Lead | VP Engineering |
| **AI/Scoring** | ML On-Call | ML Lead | VP Engineering |
| **Infrastructure** | Platform On-Call | Platform Lead | VP Engineering |
| **Security** | Security On-Call | Security Lead | CISO |
| **Integrations** | Integration On-Call | Integration Lead | VP Engineering |

---

## When to Escalate

### Automatic Escalation Triggers

| Condition | Escalation Level | Reason |
|-----------|-----------------|--------|
| Incident unacknowledged > 15 min | +1 level | Response SLA breach |
| No progress in 30 min | +1 level | Stalled investigation |
| Impact expanding | +1 level | Growing severity |
| Customer-facing P1 > 30 min | VP Engineering | Business impact |
| Security/data incident | Security Lead immediately | Compliance requirement |
| Financial system affected | VP Engineering + Finance | Revenue impact |

### Manual Escalation Triggers

Escalate when you need:

| Need | Escalate To |
|------|-------------|
| **Domain expertise** | Domain specialist |
| **More hands** | Additional on-call |
| **Decision authority** | Engineering Manager |
| **Cross-team coordination** | VP Engineering |
| **External vendor contact** | Integration Lead |
| **Customer communication** | Customer Success + Eng Manager |
| **Legal/compliance guidance** | Legal + CISO |

### Do NOT Delay Escalation When:

- You're stuck and don't know the next step
- The issue is beyond your expertise
- You need approval for a risky mitigation
- Customer data may be compromised
- Multiple systems are affected
- You've been troubleshooting for > 30 min with no progress

---

## Escalation Paths

### Path 1: Technical Escalation

For technical complexity or domain expertise needs.

```
┌─────────────────────────────────────────────────────┐
│                Technical Escalation                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│   On-Call Engineer                                   │
│         │                                            │
│         ▼                                            │
│   Domain Specialist (based on issue type)            │
│         │                                            │
│         ▼                                            │
│   Tech Lead / Domain Lead                            │
│         │                                            │
│         ▼                                            │
│   VP Engineering                                     │
│         │                                            │
│         ▼                                            │
│   CTO (for architectural decisions)                  │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**When to use:** Need technical expertise, domain knowledge, or architectural guidance.

### Path 2: Severity Escalation

For increasing business impact or prolonged incidents.

```
┌─────────────────────────────────────────────────────┐
│                Severity Escalation                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│   On-Call Engineer                                   │
│         │                                            │
│         ▼                                            │
│   Engineering Manager                                │
│         │                                            │
│         ▼                                            │
│   VP Engineering                                     │
│         │                                            │
│         ▼                                            │
│   CTO                                               │
│         │                                            │
│         ▼                                            │
│   CEO (P1 > 2 hours, major customer impact)          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**When to use:** Incident duration exceeds SLA, business impact is significant.

### Path 3: Security Escalation

For security incidents or potential data breaches.

```
┌─────────────────────────────────────────────────────┐
│                Security Escalation                   │
├─────────────────────────────────────────────────────┤
│                                                      │
│   Incident Detected                                  │
│         │                                            │
│         ▼                                            │
│   Security On-Call (IMMEDIATE)                       │
│         │                                            │
│         ▼                                            │
│   Security Lead / CISO                               │
│         │                                            │
│         ├──────────────┐                             │
│         ▼              ▼                             │
│   VP Engineering    Legal Team                       │
│         │              │                             │
│         └──────┬───────┘                             │
│                ▼                                     │
│              CTO                                     │
│                │                                     │
│                ▼                                     │
│              CEO                                     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

**When to use:** Any security incident, credential exposure, unauthorized access, data breach.

---

## Contact Directory

### On-Call Rotations

| Rotation | PagerDuty Service | Schedule |
|----------|------------------|----------|
| Primary On-Call | `medicalcor-primary` | 24/7, weekly rotation |
| Backend On-Call | `medicalcor-backend` | Business hours |
| Infrastructure On-Call | `medicalcor-infra` | 24/7, weekly rotation |
| Security On-Call | `medicalcor-security` | 24/7, weekly rotation |

### Leadership Contacts

| Role | Name | PagerDuty | Slack | Phone |
|------|------|-----------|-------|-------|
| Engineering Manager | [Name] | @eng-manager | @eng-manager | [Number] |
| VP Engineering | [Name] | @vp-eng | @vp-eng | [Number] |
| CTO | [Name] | @cto | @cto | [Number] |
| CISO | [Name] | @ciso | @ciso | [Number] |

### Domain Experts

| Domain | Primary | Backup | Slack Channel |
|--------|---------|--------|---------------|
| Database/PostgreSQL | [Name] | [Name] | #db-support |
| AI/OpenAI | [Name] | [Name] | #ai-support |
| HubSpot | [Name] | [Name] | #integrations |
| WhatsApp/360dialog | [Name] | [Name] | #integrations |
| Stripe | [Name] | [Name] | #payments |
| Trigger.dev | [Name] | [Name] | #background-jobs |
| Infrastructure/GCP | [Name] | [Name] | #infrastructure |

### External Contacts

| Vendor | Support Portal | Priority Line | Account Manager |
|--------|---------------|---------------|-----------------|
| Google Cloud | console.cloud.google.com/support | [Number] | [Name] |
| OpenAI | platform.openai.com/support | N/A | N/A |
| HubSpot | help.hubspot.com | [Number] | [Name] |
| 360dialog | support.360dialog.com | [Number] | [Name] |
| Stripe | dashboard.stripe.com/support | [Number] | [Name] |
| Trigger.dev | trigger.dev/support | N/A | N/A |

---

## Escalation Procedures

### How to Escalate

#### Via PagerDuty

```bash
# Escalate current incident to next level
# In PagerDuty web UI or mobile app:
# 1. Open incident
# 2. Click "Escalate"
# 3. Select escalation policy or specific person

# Or use PagerDuty CLI
pd incident escalate --incident-id <ID> --escalation-level 2
```

#### Via Slack

```
@[person] - Escalating incident #INC-XXX
- Severity: P1
- Duration: 45 minutes
- Impact: [description]
- Help needed: [specific ask]
- Incident channel: #inc-YYYYMMDD-description
```

#### Via Phone (P1 only, after hours)

1. Check PagerDuty on-call schedule for current responder
2. Call the on-call phone number
3. If no answer in 5 minutes, escalate to next level
4. Document all contact attempts in incident channel

### Escalation Message Template

When escalating, include:

```markdown
**Escalation Request**

**Incident:** #INC-XXX or [brief description]
**Current Severity:** P1/P2/P3
**Duration:** X minutes/hours
**Current Impact:**
- [Specific impact 1]
- [Specific impact 2]

**What's been tried:**
1. [Action 1 - Result]
2. [Action 2 - Result]

**Why escalating:**
- [Reason: stuck, need expertise, need approval, etc.]

**Specific ask:**
- [What you need from the escalation target]

**Incident Channel:** #inc-YYYYMMDD-description
```

---

## De-escalation

### When to De-escalate

- Issue is contained and no longer expanding
- Root cause identified and fix in progress
- No longer need senior resources
- Incident approaching resolution

### De-escalation Procedure

1. **Announce in incident channel:**
   ```
   **De-escalation Notice**
   - Time: [HH:MM UTC]
   - Reason: [Issue contained, fix in progress]
   - Who can stand down: [Names/Roles]
   - Remaining responders: [Names]
   - Next update: [Time]
   ```

2. **Thank senior responders** for their time

3. **Update PagerDuty** if applicable

4. **Continue with resolution** with remaining team

---

## External Escalations

### Google Cloud Support

For infrastructure issues:

1. **Assess severity:**
   - P1: Critical impact, production down
   - P2: Severe impact, major functionality affected
   - P3: Moderate impact, workaround available
   - P4: Low impact, question

2. **Create support case:**
   ```
   # Via Console
   console.cloud.google.com > Support > Create Case

   # Include:
   - Project ID
   - Service affected (Cloud Run, Cloud SQL, etc.)
   - Error messages (full text)
   - Timeline of issue
   - Steps to reproduce
   ```

3. **For P1:** Call support hotline after creating case

### OpenAI Support

1. Check status page: status.openai.com
2. If outage, wait for resolution
3. For API issues: platform.openai.com/support
4. For rate limit issues: Review usage dashboard

### HubSpot Support

1. Check status: status.hubspot.com
2. For API issues: developers.hubspot.com/support
3. For urgent issues: Contact account manager
4. Include: Portal ID, API calls, error responses

### 360dialog (WhatsApp)

1. Check status: status.360dialog.com
2. For webhook issues: support.360dialog.com
3. For urgent issues: Contact account manager
4. Include: WABA ID, phone number, message examples

### Stripe Support

1. Check status: status.stripe.com
2. For API issues: dashboard.stripe.com/support
3. For urgent payment issues: Priority phone line
4. Include: Request IDs, charge IDs, error messages

---

## Escalation Don'ts

| Don't | Instead |
|-------|---------|
| Skip escalation levels | Follow the chain unless emergency |
| Escalate without trying | Document what you've tried first |
| Escalate without context | Use the escalation template |
| Wait too long to escalate | When in doubt, escalate early |
| Escalate via email for P1 | Use phone or PagerDuty |
| Leave escalated person hanging | Provide regular updates |
| Forget to de-escalate | Release people when no longer needed |

---

## Escalation Metrics

Track these to improve escalation effectiveness:

| Metric | Target | Review Frequency |
|--------|--------|-----------------|
| Time to first escalation | < 30 min for P1 | Weekly |
| Escalation acknowledgment time | < 10 min | Weekly |
| Escalations per incident | < 3 levels | Monthly |
| Unnecessary escalations | < 10% | Monthly |
| Missed escalations | 0 | Weekly |

---

## Revision History

| Date | Version | Author | Changes |
|------|---------|--------|---------|
| 2024-12 | 1.0 | Platform Team | Initial runbook creation |
