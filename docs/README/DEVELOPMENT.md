# Development Guide

Guidelines for contributing to MedicalCor Core.

## Table of Contents

- [Development Environment](#development-environment)
- [Code Standards](#code-standards)
- [Git Workflow](#git-workflow)
- [Pull Request Process](#pull-request-process)
- [Testing Requirements](#testing-requirements)
- [Code Review Guidelines](#code-review-guidelines)
- [Release Process](#release-process)

---

> **⚠️ Important**: GitHub Codespaces are disabled for security compliance.
> See [Development Environment Policy](./DEVELOPMENT_ENVIRONMENT.md) for requirements.

---

## Development Environment

### IDE Setup

#### VS Code (Recommended)

Install these extensions:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "prisma.prisma",
    "ms-azuretools.vscode-docker",
    "GitHub.copilot"
  ]
}
```

Configure workspace settings:

```json
// .vscode/settings.json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "typescript.preferences.importModuleSpecifier": "relative",
  "typescript.tsdk": "node_modules/typescript/lib"
}
```

#### JetBrains WebStorm

1. Enable ESLint: `Settings > Languages & Frameworks > JavaScript > Code Quality Tools > ESLint`
2. Enable Prettier: `Settings > Languages & Frameworks > JavaScript > Prettier`
3. Set Node interpreter: `Settings > Languages & Frameworks > Node.js`

### Local Development

```bash
# Start all services
pnpm dev

# Start specific services
pnpm dev:api      # API server (port 3000)
pnpm dev:web      # Web dashboard (port 3001)
pnpm dev:trigger  # Trigger.dev (connects to cloud)

# Start infrastructure
docker compose up -d              # Basic: PostgreSQL + Redis
docker compose --profile monitoring up -d  # With Prometheus + Grafana
docker compose --profile tunnel up -d      # With webhook tunnel
```

### Environment Variables

```bash
# Create local environment file
cp .env.example .env

# Key variables for development
NODE_ENV=development
LOG_LEVEL=debug
DATABASE_URL=postgresql://medicalcor:localdev@localhost:5432/medicalcor
```

See [CONFIGURATION.md](./CONFIGURATION.md) for complete variable reference.

---

## Code Standards

### TypeScript Guidelines

#### Use Strict Mode

All TypeScript code must pass strict mode checks:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noImplicitReturns": true
  }
}
```

#### Prefer Type Inference

```typescript
// Preferred: Let TypeScript infer
const count = 0;
const items = ['a', 'b'];

// Avoid: Unnecessary type annotations
const count: number = 0;
const items: string[] = ['a', 'b'];

// Exception: Function parameters and return types
function processLead(context: LeadContext): ScoringOutput {
  // ...
}
```

#### Use Zod for Runtime Validation

```typescript
// Define schema (single source of truth)
export const LeadContextSchema = z.object({
  phone: z.string().regex(/^\+[1-9]\d{1,14}$/),
  channel: z.enum(['whatsapp', 'voice', 'email', 'web']),
  messageHistory: z.array(MessageSchema).max(50),
});

// Infer types from schema
export type LeadContext = z.infer<typeof LeadContextSchema>;

// Validate at boundaries
const validated = LeadContextSchema.parse(rawInput);
```

#### Avoid `any` Type

```typescript
// Bad
function processData(data: any) { ... }

// Good
function processData(data: unknown) {
  const validated = DataSchema.parse(data);
  // Now TypeScript knows the shape
}

// Also good: Use generics
function processData<T extends BaseSchema>(data: T) { ... }
```

### ESLint Rules

Key rules enforced:

```javascript
// .eslintrc.js
module.exports = {
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
    'no-console': 'error', // Use logger instead
    'prefer-const': 'error',
    'no-var': 'error',
  }
};
```

### Prettier Configuration

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 80,
  "arrowParens": "avoid"
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files (components) | PascalCase | `LeadCard.tsx` |
| Files (utilities) | kebab-case | `scoring-service.ts` |
| Classes | PascalCase | `ScoringService` |
| Functions | camelCase | `calculateScore()` |
| Constants | UPPER_SNAKE | `MAX_RETRY_ATTEMPTS` |
| Types/Interfaces | PascalCase | `LeadContext` |
| Zod Schemas | PascalCase + Schema | `LeadContextSchema` |
| Environment vars | UPPER_SNAKE | `DATABASE_URL` |

### Import Order

```typescript
// 1. Node built-ins
import { readFile } from 'fs/promises';
import path from 'path';

// 2. External packages
import { z } from 'zod';
import { task } from '@trigger.dev/sdk/v3';

// 3. Internal packages (@medicalcor/*)
import { logger } from '@medicalcor/core';
import { LeadContextSchema } from '@medicalcor/types';

// 4. Relative imports
import { processMessage } from './message-handler';
import type { HandlerConfig } from './types';
```

### Error Handling

```typescript
// Use domain-specific errors
import { DomainError, ValidationError } from '@medicalcor/core';

// Throw specific errors
if (!validated.phone) {
  throw new ValidationError('Phone number is required', {
    field: 'phone',
    value: validated.phone,
  });
}

// Catch and handle appropriately
try {
  await processLead(context);
} catch (error) {
  if (error instanceof ValidationError) {
    logger.warn('Validation failed', { error: error.details });
    return { success: false, error: error.message };
  }

  if (error instanceof DomainError) {
    logger.error('Domain error', { error: error.toJSON() });
    throw error; // Re-throw for workflow retry
  }

  // Unknown errors
  logger.error('Unexpected error', { error });
  throw new DomainError('INTERNAL_ERROR', 'An unexpected error occurred');
}
```

### Logging Standards

```typescript
import { logger } from '@medicalcor/core';

// Use structured logging
logger.info('Processing lead', {
  phone: lead.phone,  // Will be redacted automatically
  channel: lead.channel,
  correlationId: context.correlationId,
});

// Log levels
logger.debug('Detailed debugging info');
logger.info('Normal operations');
logger.warn('Warning conditions');
logger.error('Error conditions', { error: err });

// Never use console.log
// console.log('Debug'); // ESLint error
```

---

## Git Workflow

### Branch Naming

```
feature/    - New features
fix/        - Bug fixes
refactor/   - Code refactoring
docs/       - Documentation updates
test/       - Test additions/changes
chore/      - Maintenance tasks

Examples:
feature/ai-scoring-v2
fix/webhook-signature-validation
refactor/consolidate-schemas
docs/api-reference
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting (no code change)
- `refactor`: Code restructuring
- `test`: Adding/updating tests
- `chore`: Maintenance

**Examples**:

```bash
feat(scoring): add procedure interest detection

Adds ability to detect specific dental procedures mentioned
in patient messages (implants, veneers, whitening, etc.)

Closes #123
```

```bash
fix(webhooks): correct signature verification timing

Use timing-safe comparison to prevent timing attacks
on webhook signature verification.
```

### Pre-commit Hooks

Husky runs these checks before each commit:

```bash
# .husky/pre-commit
pnpm lint-staged
```

```json
// package.json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
    "*.{json,md}": ["prettier --write"]
  }
}
```

---

## Pull Request Process

### Before Creating PR

1. **Update from main**:
   ```bash
   git fetch origin main
   git rebase origin/main
   ```

2. **Run all checks**:
   ```bash
   pnpm lint
   pnpm typecheck
   pnpm test
   pnpm build
   ```

3. **Test manually**:
   ```bash
   pnpm dev
   # Verify your changes work as expected
   ```

### PR Template

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## How Has This Been Tested?
- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing

## Checklist
- [ ] My code follows the project style guidelines
- [ ] I have performed a self-review
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing tests pass locally
- [ ] I have updated documentation as needed
- [ ] My changes generate no new warnings
```

### PR Size Guidelines

| Size | Lines Changed | Review Time |
|------|---------------|-------------|
| Small | < 200 | Same day |
| Medium | 200-500 | 1-2 days |
| Large | 500-1000 | 2-3 days |
| XL | > 1000 | Consider splitting |

**Best Practice**: Keep PRs under 400 lines when possible.

---

## Testing Requirements

### Test Structure

```
packages/
  core/
    src/
      logger/
        index.ts
        __tests__/
          logger.test.ts
    __tests__/
      integration/
        event-store.test.ts
```

### Writing Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScoringService } from '../scoring-service';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    service = new ScoringService({
      openaiClient: mockOpenAIClient,
    });
  });

  describe('scoreMessage', () => {
    it('should return HOT score for All-on-X mentions', async () => {
      const result = await service.scoreMessage({
        message: 'I want All-on-X implants',
        context: mockContext,
      });

      expect(result.score).toBe(5);
      expect(result.classification).toBe('HOT');
      expect(result.procedureInterest).toContain('all-on-x');
    });

    it('should fallback to rules when AI fails', async () => {
      vi.mocked(mockOpenAIClient.complete).mockRejectedValue(new Error('API error'));

      const result = await service.scoreMessage({
        message: 'I need dental implants urgently',
        context: mockContext,
      });

      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(result.fallbackUsed).toBe(true);
    });
  });
});
```

### Test Coverage Requirements

| Package | Minimum Coverage |
|---------|------------------|
| packages/core | 80% |
| packages/domain | 85% |
| packages/integrations | 70% |
| apps/api | 75% |
| apps/trigger | 75% |

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage report
pnpm test:coverage

# Specific package
pnpm --filter @medicalcor/core test

# Pattern matching
pnpm test -- scoring
```

---

## Code Review Guidelines

### For Authors

1. **Keep PRs focused** - One feature/fix per PR
2. **Write clear descriptions** - Explain the why, not just the what
3. **Respond promptly** - Address feedback within 24 hours
4. **Don't take it personally** - Reviews improve code quality

### For Reviewers

1. **Be respectful** - Critique code, not people
2. **Be specific** - Provide actionable feedback
3. **Prioritize** - Distinguish blockers from suggestions
4. **Approve when ready** - Don't nitpick indefinitely

### Review Checklist

- [ ] Code follows project conventions
- [ ] Tests are adequate and passing
- [ ] No security vulnerabilities introduced
- [ ] Error handling is appropriate
- [ ] Logging is sufficient
- [ ] Documentation is updated
- [ ] No unnecessary changes

### Comment Prefixes

| Prefix | Meaning |
|--------|---------|
| `nit:` | Minor suggestion, non-blocking |
| `question:` | Seeking clarification |
| `suggestion:` | Alternative approach |
| `blocker:` | Must be addressed before merge |

---

## Release Process

### Version Strategy

We follow [Semantic Versioning](https://semver.org/):

```
MAJOR.MINOR.PATCH

1.0.0 → 1.0.1  (patch: bug fix)
1.0.1 → 1.1.0  (minor: new feature, backward compatible)
1.1.0 → 2.0.0  (major: breaking change)
```

### Release Workflow

1. **Create release branch**:
   ```bash
   git checkout -b release/v1.2.0
   ```

2. **Update version**:
   ```bash
   pnpm version:bump 1.2.0
   ```

3. **Update CHANGELOG**:
   ```markdown
   ## [1.2.0] - 2024-01-15

   ### Added
   - New AI scoring model (#123)

   ### Fixed
   - Webhook timeout issue (#456)
   ```

4. **Create PR** to main

5. **After merge**, tag release:
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```

6. **CI automatically**:
   - Builds Docker image
   - Deploys to staging
   - Runs smoke tests
   - Awaits manual approval for production

---

## Troubleshooting Development

### Common Issues

#### TypeScript errors after pulling

```bash
pnpm clean
pnpm install
pnpm build
```

#### Tests failing locally but passing in CI

```bash
# Ensure clean state
rm -rf node_modules
rm -rf **/node_modules
pnpm install
pnpm build
pnpm test
```

#### Docker container issues

```bash
# Full reset
docker compose down -v
docker system prune -a
docker compose up -d
```

### Getting Help

- **Documentation**: [docs/README/](./README.md)
- **Issues**: [GitHub Issues](https://github.com/casagest/medicalcor-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/casagest/medicalcor-core/discussions)
