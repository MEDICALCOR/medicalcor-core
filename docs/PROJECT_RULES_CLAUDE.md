# MedicalCor Core - Quick Reference for AI Assistants

> **Purpose**: Quick reference card for Claude Code sessions.
> For full context, see `docs/CLAUDE_PROMPT.txt`.

---

## TL;DR Rules

| Rule | Enforcement |
|------|-------------|
| Never push to main | BLOCKED by hook |
| Always use feature branches | REQUIRED |
| Conventional commits | ENFORCED by hook |
| No hardcoded secrets | MANDATORY |
| Input validation (Zod) | REQUIRED |
| TypeScript strict mode | ENFORCED |
| Tests for new code | EXPECTED |

---

## Branch Quick Start

```bash
# ALWAYS do this first
git branch --show-current

# If on main, create feature branch
git checkout -b feature/short-description

# Valid branch prefixes
feature/  fix/  refactor/  docs/  test/  chore/
```

---

## Commit Quick Reference

```bash
# Format
<type>(<scope>): <description>

# Types
feat     # New feature
fix      # Bug fix
docs     # Documentation
refactor # Code restructure
test     # Add/fix tests
chore    # Maintenance

# Examples
git commit -m "feat(auth): add biometric login"
git commit -m "fix(api): correct date parsing"
```

---

## Before Committing

```bash
# Run ALL of these
pnpm lint
pnpm typecheck
pnpm test
```

---

## File Locations

| What | Where |
|------|-------|
| API code | `apps/api/` |
| Web code | `apps/web/` |
| Shared types | `packages/shared/` |
| UI components | `packages/ui/` |
| DB migrations | `db/migrations/` |
| Documentation | `docs/` |
| Scripts | `scripts/` |

---

## Security Reminders

1. **Secrets** → Environment variables only
2. **User input** → Always validate with Zod
3. **SQL queries** → Parameterized only
4. **Logging** → No PII or sensitive data
5. **RLS** → Required on patient data tables

---

## Common Commands

```bash
# Development
pnpm dev              # Start dev servers
pnpm build            # Build all

# Database
pnpm db:migrate       # Run migrations
pnpm db:migrate:status

# Quality
pnpm lint             # Check linting
pnpm lint:fix         # Fix linting
pnpm typecheck        # Type checking
pnpm test             # Run tests
pnpm test:coverage    # With coverage
```

---

## Do NOT Do

- Push directly to main/staging/production
- Use `any` type without justification
- Skip input validation
- Hardcode credentials
- Log patient data
- Disable ESLint rules without approval
- Skip tests for new features
- Create migrations without testing rollback

---

## Do Always

- Create feature branches
- Write conventional commit messages
- Validate all inputs
- Write tests for new code
- Run linting before commit
- Document breaking changes
- Follow the PR template

---

## Read Before Starting

1. `docs/GIT_WORKFLOW.md` - How to branch/commit
2. `docs/SECURITY.md` - Security requirements
3. `docs/CONTRIBUTING.md` - Code standards

---

> **When in doubt**: Ask first, code second.
