# Project Rules for AI Development

Rules and guidelines for AI-assisted development (Claude Code, GitHub Copilot, etc.).

## Core Rules

### 1. Branch Protection

**NEVER push directly to protected branches.**

Protected branches:

- `main`
- `master`
- `production`
- `staging`

Always use feature branches and Pull Requests.

### 2. Branch Naming

Use appropriate prefixes:

```
feature/description     # New features
fix/description         # Bug fixes
hotfix/description      # Urgent fixes
refactor/description    # Code improvements
docs/description        # Documentation
claude/description-xxx  # AI-assisted work
```

### 3. Commit Messages

Follow Conventional Commits:

```
type(scope): description

Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore
```

### 4. Before Any Changes

```bash
# Always verify current branch
git branch --show-current

# Never work on main
git checkout -b feature/my-changes
```

### 5. Security

- Never commit secrets, tokens, or credentials
- Never bypass security checks
- Always validate user inputs
- Use parameterized queries

## AI Development Guidelines

### Starting a Session

1. Check current branch:

   ```bash
   git branch --show-current
   ```

2. If on main, create feature branch:

   ```bash
   git checkout -b feature/task-description
   ```

3. Pull latest changes:
   ```bash
   git pull origin main
   ```

### During Development

- Make small, focused commits
- Test changes before committing
- Keep changes related to the task
- Don't modify unrelated code

### Ending a Session

1. Commit all changes:

   ```bash
   git add .
   git commit -m "type(scope): description"
   ```

2. Push feature branch:

   ```bash
   git push -u origin feature-branch-name
   ```

3. Create PR if work is complete

## Code Standards

### Do

- Follow existing code patterns
- Add tests for new code
- Update documentation
- Handle errors properly
- Use TypeScript strictly

### Don't

- Add console.logs in production code
- Skip type definitions
- Ignore test failures
- Create overly complex solutions
- Modify database without migrations

## Pull Request Requirements

Before creating PR:

- [ ] Tests pass
- [ ] Linting passes
- [ ] TypeScript compiles
- [ ] Changes are tested
- [ ] Branch is up to date with main

## Emergency Procedures

### Accidentally on main

```bash
# Save changes
git stash

# Create proper branch
git checkout -b feature/my-changes

# Apply changes
git stash pop
```

### Pushed to wrong branch

```bash
# Notify team immediately
# Coordinate rollback if needed
# Follow incident procedures
```

## Remember

1. **Always check branch before working**
2. **Never push to main directly**
3. **Use conventional commits**
4. **Test before committing**
5. **Create PRs for all changes**
