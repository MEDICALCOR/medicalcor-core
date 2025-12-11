# Risk Register

**Project**: MedicalCor Core
**Last Updated**: December 2025
**Owner**: Engineering Team
**Review Cycle**: Monthly

---

## Overview

This document provides a formal risk register for the MedicalCor Core platform. It tracks identified risks, their probability and impact assessments, mitigation strategies, and ownership.

For detailed technical analysis of operational risks, see:
- [Operational Risks Analysis](./operational-risks-analysis.md)
- [Operational Risks Slides](./slides/slide-02-operational-risks.md)

---

## Risk Assessment Matrix

| Impact / Probability | Very Low | Low | Medium | High | Very High |
|---------------------|----------|-----|--------|------|-----------|
| **Critical**        | Medium   | High | High | Critical | Critical |
| **High**            | Low      | Medium | High | High | Critical |
| **Medium**          | Low      | Low | Medium | Medium | High |
| **Low**             | Very Low | Low | Low | Medium | Medium |
| **Very Low**        | Very Low | Very Low | Low | Low | Medium |

---

## Active Risks

### Architecture & Development Risks

| ID | Risk | Probability | Impact | Score | Mitigation | Owner | Status |
|----|------|-------------|--------|-------|------------|-------|--------|
| AR-001 | Layer refactor breaks production | Low | High | High | Comprehensive test suite, staged rollout, layer boundary checks (`pnpm check:layer-boundaries`) | Engineering Lead | Mitigated |
| AR-002 | Key rotation causes data loss | Very Low | Critical | High | Test in staging, maintain key history, documented rollback procedure | Security Team | Mitigated |
| AR-003 | TODO fixes introduce regressions | Low | Medium | Medium | Code review process, test coverage requirements, CI/CD gates | Engineering Team | Active |
| AR-004 | Tracing overhead impacts performance | Low | Medium | Medium | Sampling (10% production), async export, performance benchmarks | Platform Team | Mitigated |
| AR-005 | Coverage effort takes longer than expected | Medium | Medium | Medium | Prioritize critical paths first, incremental coverage targets | Engineering Team | Active |

### Operational Risks

| ID | Risk | Probability | Impact | Score | Mitigation | Owner | Status |
|----|------|-------------|--------|-------|------------|-------|--------|
| OR-001 | Operational complexity in multi-system debugging | Medium | Medium | Medium | OpenTelemetry tracing, Prometheus metrics, Sentry integration, health checks | Platform Team | Mitigated |
| OR-002 | External dependency failures (OpenAI) | Medium | High | High | Adaptive timeouts, multi-provider gateway, rule-based fallback scoring | Platform Team | Mitigated |
| OR-003 | Database migration drift between environments | Low | High | Medium | dbmate migrations, schema validation in CI, reversible migrations | Database Team | Mitigated |
| OR-004 | AI cost scaling under DDoS attack | Low | Critical | High | Rate limiting, AI budget controller, token estimator, UserRateLimiter | Security Team | Active |

### Compliance Risks

| ID | Risk | Probability | Impact | Score | Mitigation | Owner | Status |
|----|------|-------------|--------|-------|------------|-------|--------|
| CR-001 | HIPAA violation through PII exposure | Very Low | Critical | High | Auto-redaction in structured logger, encryption at rest, RLS policies | Compliance Team | Mitigated |
| CR-002 | GDPR consent expiry not tracked | Low | High | Medium | Consent service with 2-year expiry, automated checks before outbound comms | Compliance Team | Mitigated |
| CR-003 | Breach notification delays | Low | Critical | High | Breach notification service, incident response runbook, escalation procedures | Security Team | Mitigated |

### Infrastructure Risks

| ID | Risk | Probability | Impact | Score | Mitigation | Owner | Status |
|----|------|-------------|--------|-------|------------|-------|--------|
| IR-001 | Database connection pool exhaustion | Low | High | Medium | Connection pooling, circuit breakers, health checks, alerting | Platform Team | Mitigated |
| IR-002 | Redis cache failures | Low | Medium | Low | Fallback to database, circuit breaker pattern, health monitoring | Platform Team | Mitigated |
| IR-003 | Webhook signature validation bypass | Very Low | Critical | High | HMAC-SHA256 verification, timestamp validation, replay attack prevention | Security Team | Mitigated |

---

## Risk History

| Date | Risk ID | Change | Reason |
|------|---------|--------|--------|
| Dec 2025 | OR-002 | Severity reduced from Critical to High | Multi-provider gateway implemented |
| Nov 2025 | OR-003 | Status changed to Mitigated | dbmate migration framework adopted |
| Nov 2025 | OR-004 | Added | Identified in operational risk analysis |

---

## Definition of Done

### For Architecture Tasks

- [ ] Code compiles without errors
- [ ] Layer boundary check passes (`pnpm check:layer-boundaries`)
- [ ] Unit tests pass
- [ ] Integration tests pass (if applicable)
- [ ] Code reviewed by senior engineer
- [ ] Documentation updated

### For Test Tasks

- [ ] Test file created with proper structure
- [ ] All assertions meaningful (no empty tests)
- [ ] Coverage threshold met for target code
- [ ] Tests pass in CI

### For Operations Tasks

- [ ] Job implemented and tested locally
- [ ] Tested in staging environment
- [ ] Runbook documented
- [ ] Alerts configured
- [ ] Rollback procedure documented

### For Security Tasks

- [ ] Security review completed
- [ ] No new vulnerabilities introduced (pnpm audit)
- [ ] Secrets scanning passed
- [ ] Compliance requirements verified
- [ ] Documentation updated

---

## Review Schedule

| Review Type | Frequency | Participants | Next Review |
|-------------|-----------|--------------|-------------|
| Sprint Review | Bi-weekly | Engineering Team | Rolling |
| Risk Assessment | Monthly | Engineering + Security | Jan 2026 |
| Architecture Review | Monthly | Architecture Board | Jan 2026 |
| Compliance Review | Quarterly | Security + Legal | Q1 2026 |
| External Audit | Annual | External Auditor | Dec 2026 |

---

## Escalation Matrix

| Risk Score | Response Time | Escalation Level | Actions Required |
|------------|---------------|------------------|------------------|
| Critical | < 1 hour | C-Level + Security Lead | Incident response, stakeholder notification |
| High | < 4 hours | Engineering Lead + Security | Root cause analysis, mitigation plan |
| Medium | < 24 hours | Team Lead | Assessment, mitigation scheduling |
| Low | < 1 week | Individual Contributor | Monitoring, backlog addition |

---

## Related Documentation

- [Security Documentation](./README/SECURITY.md)
- [Incident Response Runbook](./runbooks/INCIDENT_RESPONSE.md)
- [Escalation Procedures](./runbooks/ESCALATION.md)
- [Rollback Procedures](./runbooks/ROLLBACK.md)
- [Key Rotation Procedure](./README/KEY_ROTATION_PROCEDURE.md)
- [Operational Risks Analysis](./operational-risks-analysis.md)

---

## Appendix: Risk Categories

### Probability Definitions

| Level | Description | Likelihood |
|-------|-------------|------------|
| Very High | Almost certain to occur | > 80% |
| High | Likely to occur | 60-80% |
| Medium | Possible | 40-60% |
| Low | Unlikely | 20-40% |
| Very Low | Rare | < 20% |

### Impact Definitions

| Level | Description | Business Impact |
|-------|-------------|-----------------|
| Critical | Catastrophic | Complete service outage, major data breach, regulatory penalties |
| High | Major | Significant service degradation, data exposure, compliance issues |
| Medium | Moderate | Partial service impact, limited data exposure |
| Low | Minor | Minimal service impact, no data exposure |
| Very Low | Negligible | No noticeable impact |

---

**Document Version**: 1.0
**Created**: December 2025
**Next Review**: January 2026
