# CHECKLIST - CI & Quality Standards

## Must Have Before Merge

### Code Quality

- [ ] Formatting is correct (Prettier) - `pnpm format:check`
- [ ] Lint is clean (ESLint) - `pnpm lint`
- [ ] TypeScript type check passes - `pnpm typecheck`
- [ ] Code duplication is within acceptable limits

### Testing

- [ ] Unit tests pass with acceptable coverage - `pnpm test:coverage`
- [ ] E2E tests pass (if applicable)
- [ ] Build succeeds - `pnpm build`

### Security

- [ ] CodeQL scan: zero high/critical findings (or findings triaged)
- [ ] Trivy vulnerability scan passes
- [ ] pnpm audit: no critical/high vulnerabilities
- [ ] Gitleaks: no secrets detected
- [ ] Dependency Review: no vulnerable dependencies added

### Compliance

- [ ] License check passes (only approved licenses)
- [ ] Dependabot alerts addressed

### Review

- [ ] PR has at least 1 approval
- [ ] All CI checks pass

## Post-Merge

- [ ] Release notes generated (if applicable)
- [ ] Deploy pipeline runs successfully (if applicable)
- [ ] OpenSSF Scorecard maintained

## Branch Protection Requirements

The following checks are required for merging to `main`:

- `Lint`
- `Type Check`
- `Test`
- `E2E Tests`
- `Build`
- `Secrets Scan`
- `Schema Validation`
- `CI Success`

## Quick Commands

```bash
# Run all checks locally
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Fix formatting issues
pnpm format

# Fix lint issues (where possible)
pnpm lint --fix
```
