# MedicalCor Core - Git Workflow Guide

> **Authoritative guide for Git workflow and version control practices.**
>
> All team members must follow this workflow without exception.

---

## Table of Contents

1. [Branch Strategy](#1-branch-strategy)
2. [Feature Development Workflow](#2-feature-development-workflow)
3. [Commit Convention](#3-commit-convention)
4. [Pull Request Process](#4-pull-request-process)
5. [Code Review Guidelines](#5-code-review-guidelines)
6. [Merge Strategy](#6-merge-strategy)
7. [Hotfix Procedure](#7-hotfix-procedure)
8. [Common Scenarios](#8-common-scenarios)
9. [Troubleshooting](#9-troubleshooting)
10. [Git Hooks](#10-git-hooks)

---

## 1. Branch Strategy

### Protected Branches

| Branch | Purpose | Direct Push | Who Can Merge |
|--------|---------|-------------|---------------|
| `main` | Production code | **BLOCKED** | Tech Lead + CI |
| `staging` | Pre-production testing | **BLOCKED** | Team Lead + CI |

### Branch Naming Convention

```
<type>/<description>
```

**Types:**
- `feature/` - New features
- `fix/` - Bug fixes
- `hotfix/` - Urgent production fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates
- `test/` - Test additions/modifications
- `chore/` - Maintenance tasks

**Examples:**
```
feature/patient-biometric-auth
fix/appointment-timezone-offset
hotfix/critical-auth-bypass
refactor/extract-date-utils
docs/update-api-documentation
test/add-encryption-unit-tests
chore/update-dependencies
```

### Branch Lifecycle

```
main ─────────────────────────────────────────────► (production)
  │                                                      ▲
  │                                                      │
  └── feature/my-feature ──► PR ──► Code Review ──► Merge
          │
          ├── commit 1
          ├── commit 2
          └── commit 3
```

---

## 2. Feature Development Workflow

### Step 1: Start from Latest Main

```bash
# Ensure you're on main and up to date
git checkout main
git pull origin main
```

### Step 2: Create Feature Branch

```bash
# Create and switch to new branch
git checkout -b feature/your-feature-name

# Verify branch
git branch --show-current
# Output: feature/your-feature-name
```

### Step 3: Make Changes and Commit

```bash
# Stage changes
git add .

# Commit with conventional message
git commit -m "feat(scope): add new functionality"

# Multiple commits are fine - they'll be squashed
git commit -m "feat(scope): add tests"
git commit -m "feat(scope): update documentation"
```

### Step 4: Push to Remote

```bash
# First push - set upstream
git push -u origin feature/your-feature-name

# Subsequent pushes
git push
```

### Step 5: Create Pull Request

1. Go to GitHub repository
2. Click "Compare & pull request" (or "New pull request")
3. Fill in PR template
4. Request reviewers
5. Wait for CI checks
6. Address review feedback
7. Merge when approved

### Step 6: Cleanup

```bash
# After PR is merged, delete local branch
git checkout main
git pull origin main
git branch -d feature/your-feature-name
```

---

## 3. Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer]
```

### Types

| Type | Description | Triggers Release |
|------|-------------|------------------|
| `feat` | New feature | Minor |
| `fix` | Bug fix | Patch |
| `docs` | Documentation only | No |
| `style` | Formatting (no code change) | No |
| `refactor` | Code restructure (no behavior change) | No |
| `perf` | Performance improvement | Patch |
| `test` | Add/update tests | No |
| `build` | Build system/dependencies | No |
| `ci` | CI configuration | No |
| `chore` | Other maintenance | No |
| `revert` | Revert previous commit | Varies |

### Scope Examples

| Scope | Description |
|-------|-------------|
| `auth` | Authentication/authorization |
| `api` | API endpoints |
| `db` | Database/migrations |
| `ui` | User interface |
| `appointments` | Appointment module |
| `patients` | Patient management |
| `billing` | Billing/payments |
| `reports` | Reporting features |
| `security` | Security features |
| `encryption` | Encryption module |

### Examples

```bash
# Feature
git commit -m "feat(auth): add biometric login support"

# Bug fix
git commit -m "fix(appointments): resolve timezone offset calculation"

# Documentation
git commit -m "docs(api): update authentication endpoint docs"

# Refactoring
git commit -m "refactor(utils): extract date formatting to shared module"

# Performance
git commit -m "perf(queries): optimize patient search query"

# With body
git commit -m "fix(security): patch XSS vulnerability in form inputs

Sanitize all user inputs before rendering in templates.
Added DOMPurify for HTML sanitization.

Closes #123"
```

### Breaking Changes

For breaking changes, add `!` after type or `BREAKING CHANGE:` in footer:

```bash
# Using !
git commit -m "feat(api)!: change authentication endpoint structure"

# Using footer
git commit -m "feat(api): change authentication endpoint structure

BREAKING CHANGE: The /auth/login endpoint now returns a different JSON structure.
Migration guide: Update client code to handle new response format."
```

---

## 4. Pull Request Process

### PR Title

Use the same format as commits:
```
feat(auth): add biometric login support
```

### PR Description Template

```markdown
## Summary
Brief description of changes (1-3 bullet points)

## Changes Made
- Detailed list of changes
- Include file paths for major changes
- Note any configuration changes

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Screenshots (if UI changes)
Before: [image]
After: [image]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.log or debug code
- [ ] No hardcoded values that should be env vars
```

### PR Requirements

| Requirement | Description |
|-------------|-------------|
| Approvals | Minimum 1 approval required |
| CI Checks | All checks must pass |
| Conversations | All comments must be resolved |
| Up to date | Branch must be up to date with main |

### Review Checklist for Reviewers

- [ ] Code is readable and well-organized
- [ ] Logic is correct and handles edge cases
- [ ] No security vulnerabilities introduced
- [ ] Tests adequately cover changes
- [ ] No unnecessary complexity
- [ ] Performance implications considered
- [ ] Documentation is accurate

---

## 5. Code Review Guidelines

### For Authors

1. **Keep PRs small** - Aim for < 400 lines changed
2. **Self-review first** - Check your own code before requesting review
3. **Provide context** - Explain WHY, not just WHAT
4. **Respond promptly** - Address feedback within 24 hours
5. **Don't take it personally** - Reviews are about code, not you

### For Reviewers

1. **Be constructive** - Suggest improvements, don't just criticize
2. **Explain reasoning** - Help authors learn
3. **Prioritize feedback** - Mark blocking vs. nice-to-have
4. **Review promptly** - Within 24 hours when possible
5. **Use prefixes** for clarity:
   - `[blocking]` - Must fix before merge
   - `[suggestion]` - Nice to have
   - `[question]` - Need clarification
   - `[nit]` - Minor style preference

### Review Examples

**Good:**
```
[blocking] This query could cause N+1 issues with large datasets.
Consider using a join or preloading the relations:
`const patients = await db.patient.findMany({ include: { appointments: true } })`
```

**Bad:**
```
This is wrong.
```

---

## 6. Merge Strategy

### Squash and Merge (Default)

All PRs should use "Squash and merge":

1. Combines all commits into one clean commit
2. Keeps main history linear and readable
3. PR title becomes commit message

**When to use:** Always (default)

### Rebase and Merge (Rare)

Use only when:
- Each commit represents a logical, standalone change
- Commits are already clean and meaningful
- You want to preserve individual commits

### Never Use: Merge Commit

Avoid merge commits - they clutter history and make debugging harder.

---

## 7. Hotfix Procedure

For urgent production fixes:

### Step 1: Create Hotfix Branch from Main

```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue-description
```

### Step 2: Make Minimal Fix

- Fix ONLY the issue at hand
- No refactoring
- No "while I'm here" improvements

### Step 3: Push and Create PR

```bash
git add .
git commit -m "fix(module): critical issue description"
git push -u origin hotfix/critical-issue-description
```

### Step 4: Expedited Review

- Request immediate review in team chat
- Mark PR as urgent
- Minimum 1 approval (can be Tech Lead)

### Step 5: Merge and Deploy

- Squash and merge
- Deploy immediately
- Monitor production

### Step 6: Post-Mortem

- Document the incident
- Create follow-up tickets for root cause
- Update runbooks if needed

---

## 8. Common Scenarios

### Scenario 1: Update Branch with Latest Main

```bash
# Option A: Rebase (preferred - cleaner history)
git checkout feature/my-feature
git fetch origin main
git rebase origin/main

# Resolve any conflicts, then:
git push --force-with-lease

# Option B: Merge (if rebase causes issues)
git checkout feature/my-feature
git fetch origin main
git merge origin/main
git push
```

### Scenario 2: Fix Mistakes in Last Commit

```bash
# Amend the commit (only if not pushed!)
git add .
git commit --amend -m "feat(scope): corrected message"

# If already pushed, create a new commit instead
git add .
git commit -m "fix(scope): correct previous implementation"
git push
```

### Scenario 3: Undo Last Commit (Keep Changes)

```bash
git reset --soft HEAD~1
# Changes are now staged, ready to recommit
```

### Scenario 4: Undo Last Commit (Discard Changes)

```bash
git reset --hard HEAD~1
# WARNING: Changes are lost forever
```

### Scenario 5: Cherry-Pick a Commit

```bash
git checkout target-branch
git cherry-pick <commit-hash>
```

### Scenario 6: Stash Work in Progress

```bash
# Save current work
git stash push -m "WIP: feature description"

# Do other work...

# Restore saved work
git stash pop
```

### Scenario 7: View Branch History

```bash
# Graphical log
git log --oneline --graph --all

# Your branch vs main
git log origin/main..HEAD --oneline
```

---

## 9. Troubleshooting

### Problem: Push Rejected (Protected Branch)

```
Error: You cannot push to main - branch is protected
```

**Solution:** Create a feature branch and PR:
```bash
git checkout -b feature/my-changes
git push -u origin feature/my-changes
# Create PR on GitHub
```

### Problem: Merge Conflicts

```bash
# During rebase
git rebase origin/main
# CONFLICT in file.ts

# Fix conflicts in editor, then:
git add file.ts
git rebase --continue

# If too messy, abort and try merge:
git rebase --abort
git merge origin/main
```

### Problem: Detached HEAD

```bash
# You're not on a branch
git checkout -b new-branch-name
# Or return to existing branch
git checkout main
```

### Problem: Accidentally Committed to Main

```bash
# If not pushed yet:
git reset --soft HEAD~1
git checkout -b feature/my-feature
git commit -m "feat: my changes"

# If already pushed (unlikely due to hooks):
# Contact Tech Lead immediately
```

### Problem: Need to Undo a Merged PR

```bash
# Create revert commit
git checkout main
git pull origin main
git revert -m 1 <merge-commit-hash>
git push origin main
```

### Problem: Branch Out of Date

```bash
git fetch origin main
git rebase origin/main
# Or if on GitHub:
# Click "Update branch" button on PR
```

---

## 10. Git Hooks

### Installed Hooks

| Hook | Purpose | Enforcement |
|------|---------|-------------|
| `pre-commit` | Lint staged files | Automatic |
| `commit-msg` | Validate commit message | Automatic |
| `pre-push` | Block push to protected branches | Automatic |

### Installation

Hooks are automatically installed via Husky when you run:
```bash
pnpm install
```

### Manual Installation

If hooks aren't working:
```bash
./scripts/setup-git-hooks.sh
```

### Verifying Hooks

```bash
./scripts/setup-git-hooks.sh --check
```

### Bypass Hooks (Emergency Only)

```bash
# Pre-push bypass (requires justification)
ALLOW_DIRECT_PUSH=true git push origin main

# Commit-msg bypass (not recommended)
git commit --no-verify -m "message"
```

**WARNING:** Bypassing hooks is logged and should be explained to the team.

---

## Quick Reference Card

### Daily Commands

```bash
# Start work
git checkout main && git pull
git checkout -b feature/name

# During work
git add . && git commit -m "type(scope): message"

# Ready for review
git push -u origin feature/name

# After merge
git checkout main && git pull
git branch -d feature/name
```

### Branch Naming

```
feature/short-description
fix/issue-description
hotfix/critical-fix
refactor/what-is-changing
docs/documentation-update
```

### Commit Types

```
feat:     New feature
fix:      Bug fix
docs:     Documentation
style:    Formatting
refactor: Code restructure
perf:     Performance
test:     Tests
build:    Build/deps
ci:       CI config
chore:    Maintenance
revert:   Revert
```

---

## Resources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Git Documentation](https://git-scm.com/doc)
- [GitHub Flow](https://docs.github.com/en/get-started/quickstart/github-flow)

---

> **Questions?** Ask in #dev-help or ping the Tech Lead.
