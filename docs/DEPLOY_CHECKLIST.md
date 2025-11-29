# MedicalCor Core - Deploy Checklist

> **CRITICAL**: This checklist is NON-NEGOTIABLE. Every step must be verified before deploying to production.
>
> Last Updated: 2024
>
> Estimated Time: 30-45 minutes for full verification

---

## Table of Contents

1. [Pre-Deployment Verification](#1-pre-deployment-verification)
2. [Code Quality Gates](#2-code-quality-gates)
3. [Security Validation](#3-security-validation)
4. [Database Migration Checks](#4-database-migration-checks)
5. [Environment Configuration](#5-environment-configuration)
6. [Performance Validation](#6-performance-validation)
7. [Rollback Preparation](#7-rollback-preparation)
8. [Deployment Execution](#8-deployment-execution)
9. [Post-Deployment Verification](#9-post-deployment-verification)
10. [Monitoring & Alerts](#10-monitoring--alerts)
11. [Emergency Procedures](#11-emergency-procedures)

---

## 1. Pre-Deployment Verification

### 1.1 Branch Status

```bash
# Verify you're on the correct branch
git branch --show-current

# Ensure branch is up to date with main
git fetch origin main
git log origin/main..HEAD --oneline
```

- [ ] Current branch is `main` (or staging for staging deploys)
- [ ] All feature branches have been merged via approved PRs
- [ ] No pending commits that haven't been code-reviewed
- [ ] Git history is clean (no WIP commits, fixups are squashed)

### 1.2 Pull Request Verification

- [ ] All PRs have at least 1 approval
- [ ] All CI checks passed on the PR
- [ ] All conversations are resolved
- [ ] PR description accurately reflects changes
- [ ] Breaking changes are documented in PR

### 1.3 Version Control

```bash
# Tag the release (if applicable)
git tag -a v1.x.x -m "Release v1.x.x: Description"
```

- [ ] Version number updated in `package.json` (if applicable)
- [ ] CHANGELOG updated with release notes
- [ ] Release tag created (for production releases)

---

## 2. Code Quality Gates

### 2.1 Linting & Formatting

```bash
# Run all linting checks
pnpm lint

# Check formatting
pnpm format:check

# Fix any issues
pnpm lint:fix
pnpm format
```

- [ ] `pnpm lint` passes with 0 errors
- [ ] `pnpm format:check` passes (all files properly formatted)
- [ ] No ESLint warnings in critical paths

### 2.2 Type Checking

```bash
# Run TypeScript type checking
pnpm typecheck
```

- [ ] `pnpm typecheck` passes with 0 errors
- [ ] No `@ts-ignore` comments added without documented justification
- [ ] All new code has proper TypeScript types (no `any` unless justified)

### 2.3 Unit Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

- [ ] `pnpm test` passes with 0 failures
- [ ] Test coverage meets minimum threshold (aim for >80%)
- [ ] New code has corresponding test coverage
- [ ] No flaky tests (run tests 3x if uncertain)

### 2.4 Code Duplication

```bash
# Check for code duplication
pnpm check:duplication
```

- [ ] No significant code duplication detected
- [ ] Any flagged duplication is justified and documented

### 2.5 Build Verification

```bash
# Build all packages
pnpm build
```

- [ ] `pnpm build` completes successfully
- [ ] Build artifacts are generated in expected locations
- [ ] No build warnings that indicate potential issues

---

## 3. Security Validation

### 3.1 Dependency Security

```bash
# Check for vulnerable dependencies
pnpm audit

# Update if needed (careful with major versions)
pnpm audit fix
```

- [ ] `pnpm audit` shows no high or critical vulnerabilities
- [ ] Any known vulnerabilities have documented mitigations
- [ ] Dependencies are up to date (especially security-related)

### 3.2 Secret Detection

```bash
# Verify no secrets in code
git log -p --all -S 'password' --source
git log -p --all -S 'secret' --source
git log -p --all -S 'api_key' --source
```

- [ ] No hardcoded passwords or secrets in codebase
- [ ] All secrets are in environment variables
- [ ] `.env.example` doesn't contain real values
- [ ] No secrets accidentally committed in git history

### 3.3 Authentication & Authorization

- [ ] All API endpoints require proper authentication
- [ ] RLS (Row Level Security) policies are correctly configured
- [ ] JWT tokens have appropriate expiration times
- [ ] Password policies meet requirements

### 3.4 Data Protection (GDPR/CMSR 2025)

- [ ] Personal data is encrypted at rest (AES-256)
- [ ] Data in transit uses TLS 1.3
- [ ] Audit logging is enabled for sensitive operations
- [ ] Data retention policies are enforced
- [ ] User consent mechanisms are working

### 3.5 OWASP Top 10 Review

- [ ] SQL Injection: All queries use parameterized statements
- [ ] XSS: All user input is properly sanitized
- [ ] CSRF: Tokens are validated on state-changing requests
- [ ] Broken Access Control: Authorization checks at every layer
- [ ] Security Misconfiguration: No default credentials, debug disabled

---

## 4. Database Migration Checks

### 4.1 Migration Status

```bash
# Check migration status
pnpm db:migrate:status

# Run migrations in dry-run mode (if supported)
pnpm db:migrate --dry-run
```

- [ ] All pending migrations are reviewed
- [ ] Migrations are backward compatible (can rollback)
- [ ] No destructive migrations without explicit approval
- [ ] Migration order is correct

### 4.2 Migration Testing

```bash
# Test migrations on a staging database
DATABASE_URL=$STAGING_DATABASE_URL pnpm db:migrate
```

- [ ] Migrations tested on staging environment first
- [ ] Data integrity verified after migration
- [ ] Performance impact assessed for large tables
- [ ] Rollback scripts are tested

### 4.3 Schema Validation

```bash
# Validate database schema
pnpm db:schema:validate
```

- [ ] Schema matches expected state
- [ ] Foreign key constraints are correct
- [ ] Indexes exist for frequently queried columns
- [ ] RLS policies are up to date

### 4.4 Backup Verification

- [ ] Recent database backup exists (< 1 hour old)
- [ ] Backup restoration tested recently (< 1 week)
- [ ] Point-in-time recovery is configured
- [ ] Backup includes all schemas and data

---

## 5. Environment Configuration

### 5.1 Environment Variables

```bash
# Compare local env with production template
diff .env.local .env.production.template
```

- [ ] All required environment variables are set in production
- [ ] No development values in production config
- [ ] API keys and secrets are production values
- [ ] Feature flags are set correctly for production

### 5.2 Required Environment Variables

| Variable | Required | Verified |
|----------|----------|----------|
| `DATABASE_URL` | Yes | [ ] |
| `SUPABASE_URL` | Yes | [ ] |
| `SUPABASE_ANON_KEY` | Yes | [ ] |
| `SUPABASE_SERVICE_KEY` | Yes | [ ] |
| `NEXTAUTH_SECRET` | Yes | [ ] |
| `NEXTAUTH_URL` | Yes | [ ] |
| `ENCRYPTION_KEY` | Yes | [ ] |
| `SENTRY_DSN` | Yes | [ ] |
| `ANTHROPIC_API_KEY` | If AI features | [ ] |

### 5.3 Infrastructure Configuration

- [ ] DNS records are correct
- [ ] SSL certificates are valid (not expiring soon)
- [ ] Load balancer configuration is correct
- [ ] CDN cache rules are appropriate
- [ ] Rate limiting is configured

---

## 6. Performance Validation

### 6.1 Performance Testing

```bash
# Run performance benchmarks
pnpm test:performance

# Check bundle size
pnpm build && du -sh apps/web/.next
```

- [ ] API response times are within SLA (<200ms p95)
- [ ] Page load times are acceptable (<3s initial, <1s navigation)
- [ ] Bundle size hasn't increased significantly
- [ ] No N+1 query issues in new code

### 6.2 Load Testing

- [ ] Staging environment load tested
- [ ] System handles expected concurrent users
- [ ] Database connection pool is sized correctly
- [ ] Memory usage is stable under load

### 6.3 Resource Limits

- [ ] Memory limits are configured appropriately
- [ ] CPU allocation is sufficient
- [ ] Disk space is adequate
- [ ] Network bandwidth is sufficient

---

## 7. Rollback Preparation

### 7.1 Rollback Plan

```bash
# Document the current production version
git describe --tags --always

# Note the last known good commit
echo "Rollback to: $(git rev-parse HEAD~1)"
```

- [ ] Current production version documented
- [ ] Rollback procedure documented
- [ ] Rollback tested in staging
- [ ] Rollback doesn't require database migration reversal

### 7.2 Database Rollback

```bash
# Prepare rollback migration (if applicable)
# dbmate rollback
```

- [ ] Database rollback scripts prepared
- [ ] Data backup taken before migration
- [ ] Rollback script tested in staging
- [ ] Rollback won't cause data loss

### 7.3 Communication Plan

- [ ] Team notified of deployment window
- [ ] Stakeholders aware of changes
- [ ] Support team briefed on new features
- [ ] Rollback decision criteria defined

---

## 8. Deployment Execution

### 8.1 Pre-Deployment Steps

```bash
# Final checks
git status
git log -1 --oneline
pnpm test
pnpm build
```

- [ ] Clean working directory
- [ ] On correct commit
- [ ] All tests pass
- [ ] Build successful

### 8.2 Deployment Method

**For Vercel (Frontend):**
```bash
# Automatic on merge to main
# Or manual trigger:
vercel --prod
```

**For Backend/Infrastructure:**
```bash
# Follow infrastructure deployment procedure
# See infra/README.md
```

- [ ] Deployment initiated
- [ ] Deployment logs monitored
- [ ] No errors during deployment
- [ ] Deployment completed successfully

### 8.3 Database Migration Execution

```bash
# Run migrations in production
pnpm db:migrate
```

- [ ] Migration started
- [ ] Migration completed successfully
- [ ] No errors in migration logs
- [ ] Data integrity verified

---

## 9. Post-Deployment Verification

### 9.1 Smoke Tests

```bash
# Run smoke tests against production
pnpm test:e2e --env=production
```

- [ ] Homepage loads correctly
- [ ] Authentication works (login/logout)
- [ ] Critical user flows work:
  - [ ] Patient creation
  - [ ] Appointment scheduling
  - [ ] Document upload
  - [ ] AI features (if enabled)
- [ ] API health endpoints return 200

### 9.2 Integration Verification

- [ ] Third-party integrations working:
  - [ ] Supabase connection
  - [ ] Email service
  - [ ] Payment processing (if applicable)
  - [ ] AI/LLM services
- [ ] Webhooks receiving events
- [ ] Background jobs running

### 9.3 Data Verification

- [ ] Database connections established
- [ ] Read operations working
- [ ] Write operations working
- [ ] Cache is warming up correctly
- [ ] No orphaned data from migration

### 9.4 Performance Verification

```bash
# Quick performance check
curl -w "@curl-format.txt" -o /dev/null -s https://app.medicalcor.com/
```

- [ ] Response times within expected range
- [ ] No increased error rates
- [ ] Memory usage stable
- [ ] CPU usage normal

---

## 10. Monitoring & Alerts

### 10.1 Monitoring Setup

- [ ] Sentry error tracking enabled
- [ ] Application metrics being collected
- [ ] Database metrics visible
- [ ] Infrastructure metrics visible

### 10.2 Alert Configuration

- [ ] Error rate alerts configured
- [ ] Response time alerts configured
- [ ] Resource usage alerts configured
- [ ] On-call team notified of deployment

### 10.3 Log Verification

```bash
# Check application logs for errors
# Vercel: vercel logs
# Or your logging platform
```

- [ ] No unusual errors in logs
- [ ] No stack traces indicating issues
- [ ] Log volume is normal
- [ ] Audit logs recording correctly

### 10.4 Dashboard Review

- [ ] Metrics dashboards showing expected values
- [ ] No anomalies in traffic patterns
- [ ] Error rates at or below baseline
- [ ] All health checks passing

---

## 11. Emergency Procedures

### 11.1 Immediate Rollback Criteria

Rollback IMMEDIATELY if any of these occur:

- [ ] Error rate > 5% (baseline is typically <1%)
- [ ] P95 response time > 2s (baseline is <200ms)
- [ ] Critical functionality broken (auth, data access)
- [ ] Data corruption detected
- [ ] Security vulnerability discovered

### 11.2 Rollback Procedure

```bash
# 1. Notify team
# Slack: #incidents "Rolling back production"

# 2. Rollback deployment
# Vercel: vercel rollback
# Or: git revert HEAD && git push origin main

# 3. Rollback database (if needed)
# pnpm db:rollback

# 4. Verify rollback successful
# Run smoke tests

# 5. Document incident
# Create incident report in /docs/incidents/
```

### 11.3 Escalation Contacts

| Role | Contact | When to Escalate |
|------|---------|------------------|
| On-call Engineer | [Defined in runbook] | First responder |
| Tech Lead | [Defined in runbook] | P1 incidents |
| CTO | [Defined in runbook] | Data breach, extended outage |

### 11.4 Communication Templates

**Incident Start:**
```
🔴 INCIDENT: [Brief description]
Status: Investigating
Impact: [Users affected]
Started: [Time]
```

**Incident Update:**
```
🟡 UPDATE: [Brief description]
Status: [Mitigating/Monitoring]
Actions taken: [List]
ETA: [If known]
```

**Incident Resolved:**
```
🟢 RESOLVED: [Brief description]
Duration: [Time]
Root cause: [Brief]
Follow-up: [If needed]
```

---

## Deployment Sign-Off

### Final Verification

| Check | Verified By | Timestamp |
|-------|-------------|-----------|
| Pre-deployment complete | | |
| Code quality passed | | |
| Security validated | | |
| Database migrations ready | | |
| Environment configured | | |
| Performance acceptable | | |
| Rollback plan ready | | |
| Deployment successful | | |
| Post-deployment verified | | |
| Monitoring active | | |

### Approval

- [ ] **Deployer**: I have completed all checklist items and verified the deployment.
- [ ] **Reviewer** (optional for non-critical): I have reviewed the deployment and approve.

---

## Quick Reference

### Essential Commands

```bash
# Full verification suite
pnpm lint && pnpm typecheck && pnpm test && pnpm build

# Database operations
pnpm db:migrate           # Run migrations
pnpm db:migrate:status    # Check status
pnpm db:schema:validate   # Validate schema

# Deployment
vercel --prod            # Deploy to production (Vercel)
```

### Key URLs

| Environment | URL |
|-------------|-----|
| Production | https://app.medicalcor.com |
| Staging | https://staging.medicalcor.com |
| Vercel Dashboard | https://vercel.com/medicalcor |
| Supabase Dashboard | https://app.supabase.com/project/xxx |
| Sentry | https://sentry.io/organizations/medicalcor |

### Key Files

| File | Purpose |
|------|---------|
| `.env.production.template` | Production environment template |
| `docs/DEPLOYMENT.md` | Detailed deployment procedures |
| `docs/DR-PROCEDURES.md` | Disaster recovery procedures |
| `infra/` | Infrastructure configuration |

---

> **Remember**: When in doubt, DON'T DEPLOY. Ask for help.
>
> It's better to delay a deployment than to cause an incident.
