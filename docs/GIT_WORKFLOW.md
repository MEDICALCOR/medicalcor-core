# Git Workflow

Standard git workflow for MedicalCor development.

## Branch Naming Convention

| Prefix      | Purpose                 | Example                        |
| ----------- | ----------------------- | ------------------------------ |
| `feature/`  | New features            | `feature/patient-export`       |
| `fix/`      | Bug fixes               | `fix/login-timeout`            |
| `hotfix/`   | Urgent production fixes | `hotfix/critical-auth-bug`     |
| `refactor/` | Code improvements       | `refactor/api-structure`       |
| `docs/`     | Documentation           | `docs/api-endpoints`           |
| `test/`     | Test additions          | `test/e2e-coverage`            |
| `chore/`    | Maintenance             | `chore/update-deps`            |
| `claude/`   | AI-assisted development | `claude/implement-feature-xxx` |

## Standard Development Flow

### 1. Start from main

```bash
git checkout main
git pull origin main
```

### 2. Create feature branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make changes and commit

```bash
# Stage changes
git add .

# Commit with conventional message
git commit -m "feat(module): add new functionality"
```

### 4. Push feature branch

```bash
git push -u origin feature/your-feature-name
```

### 5. Create Pull Request

- Go to GitHub repository
- Click "Compare & pull request"
- Fill in PR template
- Request reviewers

### 6. Code Review

- Address reviewer feedback
- Push additional commits if needed
- Wait for approval

### 7. Merge

- Merge via GitHub (Squash and merge recommended)
- Delete feature branch after merge

## Commit Message Format

We use [Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
type(scope): description

[optional body]

[optional footer]
```

### Types

| Type       | Description                           |
| ---------- | ------------------------------------- |
| `feat`     | New feature                           |
| `fix`      | Bug fix                               |
| `docs`     | Documentation                         |
| `style`    | Formatting (no logic change)          |
| `refactor` | Code restructure (no behavior change) |
| `perf`     | Performance improvement               |
| `test`     | Tests                                 |
| `build`    | Build system                          |
| `ci`       | CI configuration                      |
| `chore`    | Maintenance                           |
| `revert`   | Revert commit                         |

### Examples

```bash
feat(auth): add password reset functionality
fix(api): resolve null pointer in patient lookup
docs: update API documentation
refactor(db): optimize query performance
test(patients): add integration tests
```

## Protected Branches

The following branches are protected:

- `main` - Production code
- `master` - Legacy (if exists)
- `production` - Production deployment
- `staging` - Staging deployment

### Protection Rules

1. **No direct pushes** - All changes via PR
2. **Required reviews** - Minimum 1 approval
3. **Status checks** - CI must pass
4. **Linear history** - Squash or rebase only

## Quick Reference

### Daily workflow

```bash
# Morning sync
git checkout main && git pull

# Start work
git checkout -b feature/task-name

# During work
git add . && git commit -m "type(scope): message"

# End of day
git push -u origin feature/task-name
```

### Common commands

```bash
# Check status
git status

# View branches
git branch -a

# Switch branch
git checkout branch-name

# Discard changes
git checkout -- file.txt

# Stash changes
git stash
git stash pop
```

## Troubleshooting

### Push rejected to main

This is expected! Use the correct workflow:

```bash
git checkout -b feature/my-changes
git push -u origin feature/my-changes
# Create PR on GitHub
```

### Merge conflicts

```bash
git checkout main
git pull
git checkout feature/your-branch
git merge main
# Resolve conflicts
git add .
git commit -m "fix: resolve merge conflicts"
git push
```

### Wrong branch

```bash
# Save your changes
git stash

# Go to correct branch
git checkout -b correct-branch

# Apply changes
git stash pop
```
