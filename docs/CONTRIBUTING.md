# Contributing to MedicalCor

Thank you for contributing to MedicalCor! This guide will help you get started.

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0
- PostgreSQL 15+
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/casagest/medicalcor-core.git
cd medicalcor-core

# Install dependencies (also installs git hooks)
pnpm install

# Copy environment file
cp .env.example .env

# Start development
pnpm dev
```

## Development Workflow

### 1. Create a Branch

```bash
git checkout main
git pull origin main
git checkout -b feature/your-feature-name
```

### 2. Make Changes

- Write clean, readable code
- Follow existing code style
- Add tests for new functionality
- Update documentation as needed

### 3. Commit Changes

We use [Conventional Commits](https://www.conventionalcommits.org/):

```bash
git commit -m "feat(module): add new feature"
git commit -m "fix(api): resolve authentication bug"
git commit -m "docs: update README"
```

#### Commit Types

| Type       | Description             |
| ---------- | ----------------------- |
| `feat`     | New feature             |
| `fix`      | Bug fix                 |
| `docs`     | Documentation only      |
| `style`    | Code style (formatting) |
| `refactor` | Code restructure        |
| `perf`     | Performance improvement |
| `test`     | Adding tests            |
| `build`    | Build system changes    |
| `ci`       | CI configuration        |
| `chore`    | Maintenance             |

### 4. Push and Create PR

```bash
git push -u origin feature/your-feature-name
```

Then create a Pull Request on GitHub.

## Code Standards

### TypeScript

- Use strict TypeScript
- Define types for all parameters and returns
- Avoid `any` - use `unknown` if type is unclear
- Use interfaces for object shapes

### React

- Use functional components
- Use hooks for state and effects
- Keep components small and focused
- Use proper accessibility attributes

### Testing

- Write unit tests for utilities
- Write integration tests for API routes
- Write E2E tests for critical flows
- Aim for meaningful coverage, not 100%

### File Organization

```
src/
├── app/           # Next.js app router
├── components/    # React components
├── lib/           # Utilities and helpers
├── hooks/         # Custom React hooks
├── types/         # TypeScript types
└── __tests__/     # Test files
```

## Pull Request Guidelines

### Before Submitting

- [ ] Tests pass locally (`pnpm test`)
- [ ] Linting passes (`pnpm lint`)
- [ ] TypeScript compiles (`pnpm typecheck`)
- [ ] Changes are tested manually
- [ ] Documentation is updated

### PR Description

Include:

- **What**: What does this PR do?
- **Why**: Why is this change needed?
- **How**: How does it work?
- **Testing**: How was it tested?

### Review Process

1. Create PR with clear description
2. Request review from team members
3. Address feedback constructively
4. Get approval before merging
5. Squash and merge

## Code Review

### As a Reviewer

- Be constructive and respectful
- Focus on code, not the person
- Explain the "why" behind suggestions
- Approve when requirements are met

### As an Author

- Respond to all comments
- Don't take feedback personally
- Ask for clarification if needed
- Make requested changes promptly

## Need Help?

- Check existing documentation
- Search closed issues and PRs
- Ask in team chat
- Create a discussion on GitHub

## AI Assistant Guidelines

When using AI assistants (such as Claude Code, GitHub Copilot, or similar tools) to contribute to this repository:

### Branch-Based Workflow

1. **Never commit directly to main** - All changes must go through a feature branch
2. **Always create a new branch before modifying anything** - No exceptions
3. **Operate only on the GitHub repository** - Do not create or edit local-only files

### Branch Naming Convention

Use the following prefixes for branch names:

| Prefix      | Use Case                     | Example                       |
| ----------- | ---------------------------- | ----------------------------- |
| `feature/`  | New features or enhancements | `feature/user-authentication` |
| `fix/`      | Bug fixes                    | `fix/login-timeout`           |
| `refactor/` | Code restructuring           | `refactor/api-handlers`       |

### Workflow Example

```bash
# Create and switch to a new branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat(module): add new feature"

# Push to remote
git push -u origin feature/your-feature-name

# Create Pull Request for review
```

### Prohibited Actions

- ❌ Committing directly to `main`
- ❌ Creating local-only edits that bypass version control
- ❌ Modifying files without creating a branch first
- ❌ Force pushing to shared branches

## Code of Conduct

- Be respectful and inclusive
- Focus on the work, not personalities
- Help others learn and grow
- Keep discussions professional
