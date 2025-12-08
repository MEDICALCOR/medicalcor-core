# Operational Runbooks

Comprehensive operational runbooks for MedicalCor Core platform operations, incident response, and troubleshooting.

**Version:** 1.1
**Last Updated:** December 2025
**Owner:** Platform Team

---

## Table of Contents

| Runbook                                             | Description                                             | Audience               |
| --------------------------------------------------- | ------------------------------------------------------- | ---------------------- |
| [Incident Response](./INCIDENT_RESPONSE.md)         | Incident detection, response, and resolution procedures | On-call, All Engineers |
| [Escalation](./ESCALATION.md)                       | Escalation paths, contacts, and decision matrices       | On-call, Managers      |
| [Rollback](./ROLLBACK.md)                           | Service and database rollback procedures                | On-call, DevOps        |
| [On-Call](./ON_CALL.md)                             | On-call responsibilities, handoff, and procedures       | On-call Engineers      |
| [Common Issues](./COMMON_ISSUES.md)                 | Troubleshooting guide for frequent issues               | All Engineers          |
| [Partition Maintenance](./PARTITION_MAINTENANCE.md) | Database partition creation, monitoring, and archival   | DevOps, DBA            |

---

## Quick Reference

### Critical Contacts

| Role                | Contact                 | Availability   |
| ------------------- | ----------------------- | -------------- |
| On-Call Engineer    | PagerDuty               | 24/7           |
| Engineering Manager | Slack: @eng-manager     | Business hours |
| VP Engineering      | PagerDuty (P1 only)     | 24/7 for P1    |
| Security Team       | security@medicalcor.com | 24/7           |

### Severity Levels

| Level             | Response Time | Examples                                                       |
| ----------------- | ------------- | -------------------------------------------------------------- |
| **P1 - Critical** | 15 min        | Complete outage, data breach, all webhooks failing             |
| **P2 - High**     | 30 min        | Major feature broken, >50% error rate, payment processing down |
| **P3 - Medium**   | 2 hours       | Single integration degraded, elevated error rate (<10%)        |
| **P4 - Low**      | 24 hours      | Minor bugs, cosmetic issues, non-critical alerts               |

### Key Health Endpoints

```bash
# API Health
curl https://api.medicalcor.com/health
curl https://api.medicalcor.com/ready
curl https://api.medicalcor.com/live

# Deep Health (includes dependencies)
curl https://api.medicalcor.com/health/deep

# Circuit Breaker Status
curl https://api.medicalcor.com/health/circuit-breakers
```

### Quick Rollback Commands

```bash
# Cloud Run - rollback to previous revision
gcloud run services update-traffic medicalcor-api --to-revisions=PREV_REVISION=100

# Trigger.dev - via dashboard
# https://cloud.trigger.dev > Deployments > Rollback
```

---

## When to Use These Runbooks

### Incident Response

- Service is down or severely degraded
- Alerts firing in monitoring systems
- Users reporting issues
- Security incidents

### Escalation

- Current responder needs help
- Issue requires expertise outside your domain
- Business impact requires management visibility
- Compliance or legal implications

### Rollback

- Deployment caused regression
- Database migration failed
- Configuration change broke functionality
- Need to restore previous state

### On-Call

- Starting your on-call shift
- Handing off to next rotation
- Setting up local environment for incident response
- Understanding responsibilities

### Common Issues

- Troubleshooting known issues
- First responder checklist
- Quick diagnosis steps

---

## Related Documentation

| Document                                            | Purpose                                 |
| --------------------------------------------------- | --------------------------------------- |
| [DR Procedures](../DR-PROCEDURES.md)                | Disaster recovery and backup procedures |
| [Monitoring Guide](../README/MONITORING.md)         | Observability and alerting setup        |
| [Error Budget Policy](../ERROR_BUDGET_POLICY.md)    | SLO thresholds and actions              |
| [SLI Definition](../SLI_DEFINITION.md)              | Service level indicators                |
| [Deployment Guide](../README/DEPLOYMENT.md)         | Deployment procedures                   |
| [Security Guide](../README/SECURITY.md)             | Security practices                      |
| [Key Rotation](../README/KEY_ROTATION_PROCEDURE.md) | Secret rotation procedures              |

---

## Runbook Maintenance

### Review Schedule

| Frequency       | Action                                |
| --------------- | ------------------------------------- |
| Monthly         | Review and update contact information |
| Quarterly       | Full runbook review and validation    |
| Post-Incident   | Update based on lessons learned       |
| On Major Change | Update affected runbooks immediately  |

### Contributing

1. All changes require review from Platform Team
2. Test procedures in staging before documenting
3. Include realistic examples and command outputs
4. Keep commands copy-pasteable
5. Update revision history

---

## Revision History

| Date    | Version | Author        | Changes                             |
| ------- | ------- | ------------- | ----------------------------------- |
| 2024-12 | 1.0     | Platform Team | Initial runbook creation            |
| 2025-12 | 1.1     | Platform Team | Added Partition Maintenance runbook |
