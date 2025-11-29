# Contributing to MedicalCor Core

> Thank you for contributing to MedicalCor Core! This guide will help you get started.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Development Setup](#development-setup)
3. [Code Standards](#code-standards)
4. [Making Changes](#making-changes)
5. [Testing](#testing)
6. [Documentation](#documentation)
7. [Pull Request Process](#pull-request-process)

---

## Getting Started

### Prerequisites

| Tool | Version | Check Command |
|------|---------|---------------|
| Node.js | >= 20.0.0 | `node --version` |
| pnpm | >= 9.0.0 | `pnpm --version` |
| Git | >= 2.30 | `git --version` |
| Docker | Latest | `docker --version` |

### Initial Setup

```bash
# 1. Clone the repository
git clone https://github.com/casagest/medicalcor-core.git
cd medicalcor-core

# 2. Install dependencies (also installs git hooks)
pnpm install

# 3. Copy environment file
cp .env.example .env.local

# 4. Configure your environment
# Edit .env.local with your values

# 5. Start development database (if using Docker)
docker compose up -d db

# 6. Run migrations
pnpm db:migrate

# 7. Start development server
pnpm dev
```

### Verify Setup

```bash
# Run all checks
pnpm lint && pnpm typecheck && pnpm test

# Verify git hooks are installed
./scripts/setup-git-hooks.sh --check

# Test that you cannot push to main
git checkout main
git push origin main  # Should be BLOCKED
```

---

## Development Setup

### Project Structure

```
medicalcor-core/
├── apps/
│   ├── api/          # Backend API (Hono)
│   └── web/          # Frontend (Next.js)
├── packages/
│   ├── db/           # Database utilities
│   ├── shared/       # Shared types & utilities
│   └── ui/           # UI component library
├── db/
│   └── migrations/   # Database migrations
├── docs/             # Documentation
├── scripts/          # Utility scripts
├── infra/            # Infrastructure config
└── tools/            # Development tools
```

### Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all services in development mode |
| `pnpm dev:api` | Start only the API server |
| `pnpm build` | Build all packages |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix ESLint issues |
| `pnpm format` | Format code with Prettier |
| `pnpm format:check` | Check formatting |
| `pnpm typecheck` | Run TypeScript checks |
| `pnpm test` | Run tests |
| `pnpm test:coverage` | Run tests with coverage |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:migrate:status` | Check migration status |

### IDE Setup

**VS Code** (Recommended):

Install these extensions:
- ESLint
- Prettier
- TypeScript and JavaScript Language Features
- Tailwind CSS IntelliSense

Settings (`.vscode/settings.json`):
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.preferences.importModuleSpecifier": "relative"
}
```

---

## Code Standards

### TypeScript

- Use TypeScript for all new code
- No `any` types unless absolutely necessary (document why)
- No `@ts-ignore` without documented justification
- Use strict mode (already configured)

```typescript
// Good
function getPatient(id: string): Promise<Patient | null> {
  return db.patient.findUnique({ where: { id } });
}

// Bad
function getPatient(id: any): any {
  return db.patient.findUnique({ where: { id } });
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | kebab-case | `patient-service.ts` |
| Components | PascalCase | `PatientCard.tsx` |
| Functions | camelCase | `getPatientById` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| Types/Interfaces | PascalCase | `PatientRecord` |
| CSS Classes | kebab-case | `patient-card-header` |

### Code Organization

```typescript
// File structure (in order)
// 1. Imports (external, then internal)
import { useState } from 'react';
import { Button } from '@/components/ui';

// 2. Type definitions
interface PatientCardProps {
  patient: Patient;
  onEdit: (id: string) => void;
}

// 3. Constants
const DEFAULT_AVATAR = '/images/default-avatar.png';

// 4. Component/function definition
export function PatientCard({ patient, onEdit }: PatientCardProps) {
  // ...
}

// 5. Helper functions (if not exported)
function formatName(patient: Patient): string {
  // ...
}
```

### Error Handling

```typescript
// Use typed errors
class PatientNotFoundError extends Error {
  constructor(id: string) {
    super(`Patient not found: ${id}`);
    this.name = 'PatientNotFoundError';
  }
}

// Handle errors gracefully
async function getPatient(id: string): Promise<Patient> {
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) {
    throw new PatientNotFoundError(id);
  }
  return patient;
}
```

### Security Requirements

1. **Never hardcode secrets** - Use environment variables
2. **Validate all inputs** - Use Zod schemas
3. **Sanitize outputs** - Prevent XSS
4. **Use parameterized queries** - Prevent SQL injection
5. **Apply RLS policies** - Row-level security for all tables
6. **Encrypt sensitive data** - Use the encryption service

```typescript
// Good - parameterized query
const patient = await db.patient.findFirst({
  where: { email: userInput }
});

// Bad - SQL injection risk
const result = await db.$queryRaw`
  SELECT * FROM patients WHERE email = ${userInput}
`;
```

---

## Making Changes

### Branch Workflow

1. **Always branch from main**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/your-feature
   ```

2. **Use proper branch names**
   - `feature/description` - New features
   - `fix/description` - Bug fixes
   - `refactor/description` - Code restructuring
   - `docs/description` - Documentation

3. **Never push directly to main** (blocked by hooks)

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting
- `refactor` - Code restructure
- `perf` - Performance
- `test` - Tests
- `build` - Build/deps
- `ci` - CI config
- `chore` - Maintenance

**Examples:**
```bash
git commit -m "feat(auth): add biometric login support"
git commit -m "fix(appointments): resolve timezone calculation"
git commit -m "docs(api): update endpoint documentation"
```

### File Changes

- **Keep changes focused** - One logical change per PR
- **Update tests** - Add/modify tests for your changes
- **Update docs** - Keep documentation in sync
- **No dead code** - Remove unused code completely

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test path/to/file.test.ts

# Watch mode
pnpm test:watch
```

### Writing Tests

Use Vitest for testing:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { getPatient } from './patient-service';

describe('PatientService', () => {
  describe('getPatient', () => {
    it('returns patient when found', async () => {
      const result = await getPatient('123');
      expect(result).toBeDefined();
      expect(result.id).toBe('123');
    });

    it('throws when patient not found', async () => {
      await expect(getPatient('invalid')).rejects.toThrow('not found');
    });
  });
});
```

### Test Requirements

- All new features must have tests
- Bug fixes should include regression tests
- Aim for >80% coverage on new code
- Test edge cases and error conditions

---

## Documentation

### When to Document

1. **New features** - Add usage examples
2. **API changes** - Update endpoint docs
3. **Configuration** - Document env vars
4. **Complex logic** - Add inline comments

### Documentation Standards

```typescript
/**
 * Retrieves a patient by their unique identifier.
 *
 * @param id - The patient's UUID
 * @returns The patient record, or null if not found
 * @throws {DatabaseError} If database connection fails
 *
 * @example
 * const patient = await getPatient('123e4567-e89b-12d3-a456-426614174000');
 */
export async function getPatient(id: string): Promise<Patient | null> {
  // ...
}
```

### README Updates

Update relevant README files when:
- Adding new packages or apps
- Changing setup procedures
- Adding new dependencies
- Modifying environment variables

---

## Pull Request Process

### Before Submitting

```bash
# Run all checks
pnpm lint
pnpm typecheck
pnpm test
pnpm build

# Ensure branch is up to date
git fetch origin main
git rebase origin/main
```

### PR Checklist

- [ ] Branch is up to date with main
- [ ] All tests pass
- [ ] No linting errors
- [ ] TypeScript compiles without errors
- [ ] Documentation updated (if applicable)
- [ ] No console.log or debug code
- [ ] No hardcoded secrets

### PR Description

Include:
1. **Summary** - What and why (1-3 sentences)
2. **Changes** - List of specific changes
3. **Testing** - How you tested
4. **Screenshots** - For UI changes

### Review Process

1. Create PR with descriptive title
2. Fill in the PR template
3. Request review from team member
4. Address feedback promptly
5. Get approval (minimum 1)
6. Squash and merge

### After Merge

```bash
# Switch to main and update
git checkout main
git pull origin main

# Delete your feature branch
git branch -d feature/your-feature
```

---

## Getting Help

- **Documentation**: Check `docs/` folder
- **Team Chat**: Ask in #dev-help
- **Issues**: Create a GitHub issue
- **Code Questions**: Ping Tech Lead

---

## Recognition

Contributors are recognized in our release notes and CONTRIBUTORS file. Thank you for helping improve MedicalCor!
