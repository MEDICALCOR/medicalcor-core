# Deployment Checklist

Pre-deployment verification checklist for MedicalCor releases.

## Pre-Deployment (Before Merge)

### 1. Code Quality

- [ ] All tests passing (`pnpm test`)
- [ ] TypeScript compiles (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] No console.logs in production code
- [ ] No hardcoded secrets or credentials

### 2. Security

- [ ] No new security vulnerabilities (`pnpm audit`)
- [ ] Sensitive data properly encrypted
- [ ] API endpoints properly authenticated
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention verified

### 3. Testing

- [ ] Unit tests for new functionality
- [ ] Integration tests updated
- [ ] E2E tests passing
- [ ] Manual testing completed
- [ ] Edge cases considered

### 4. Code Review

- [ ] PR has at least 1 approval
- [ ] All review comments addressed
- [ ] No unresolved conversations
- [ ] Changes match ticket requirements

### 5. Documentation

- [ ] API changes documented
- [ ] README updated if needed
- [ ] Breaking changes noted
- [ ] Migration guide if applicable

## Deployment (During Release)

### 6. Database

- [ ] Migrations tested locally
- [ ] Migrations tested on staging
- [ ] Rollback plan prepared
- [ ] Backup verified

### 7. Configuration

- [ ] Environment variables set
- [ ] Feature flags configured
- [ ] External service connections verified
- [ ] SSL certificates valid

### 8. Monitoring

- [ ] Sentry configured for new code
- [ ] Logging in place
- [ ] Alerts configured
- [ ] Health checks working

## Post-Deployment (After Release)

### 9. Verification

- [ ] Production health check passed
- [ ] Critical flows tested in production
- [ ] No new errors in monitoring
- [ ] Performance metrics normal

### 10. Communication

- [ ] Team notified of deployment
- [ ] Release notes published
- [ ] Stakeholders informed
- [ ] Support team briefed

### 11. Cleanup

- [ ] Feature branch deleted
- [ ] Temporary configs removed
- [ ] Debug code removed
- [ ] Documentation finalized

## Emergency Rollback

If issues are found:

1. **Assess severity** - Critical = immediate rollback
2. **Communicate** - Notify team immediately
3. **Rollback** - Revert to previous version
4. **Investigate** - Root cause analysis
5. **Fix** - Proper fix through normal workflow
6. **Post-mortem** - Document lessons learned

### Rollback Commands

```bash
# Identify last good commit
git log --oneline -10

# Revert to specific commit
git revert <commit-hash>

# Push revert
git push origin main
```

## Sign-Off

| Role      | Name | Date | Signature |
| --------- | ---- | ---- | --------- |
| Developer |      |      |           |
| Reviewer  |      |      |           |
| QA        |      |      |           |
| DevOps    |      |      |           |
