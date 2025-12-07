# Testing Guide

Comprehensive guide to testing in MedicalCor Core.

## Table of Contents

- [Overview](#overview)
- [Test Stack](#test-stack)
- [Running Tests](#running-tests)
- [Load Testing with k6](#load-testing-with-k6)
- [Writing Tests](#writing-tests)
- [Test Patterns](#test-patterns)
- [Mocking](#mocking)
- [Coverage](#coverage)
- [CI Integration](#ci-integration)

---

## Overview

MedicalCor Core uses a comprehensive testing strategy with multiple test types:

| Type | Purpose | Location | Runner |
|------|---------|----------|--------|
| Unit | Test isolated functions/classes | `__tests__/*.test.ts` | Vitest |
| Integration | Test component interactions | `__tests__/integration/` | Vitest |
| E2E | Test full user flows | `e2e/` | Playwright |
| API | Test HTTP endpoints | `apps/api/__tests__/` | Vitest + Supertest |
| Load | Test performance under load | `scripts/k6/` | k6 |

---

## Test Stack

| Tool | Purpose |
|------|---------|
| **Vitest** | Test runner and assertion library |
| **MSW** | Mock Service Worker for API mocking |
| **Playwright** | End-to-end browser testing |
| **Supertest** | HTTP assertion library |
| **@faker-js/faker** | Generate test data |

---

## Running Tests

### Basic Commands

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run with coverage report
pnpm test:coverage

# Run specific package tests
pnpm --filter @medicalcor/core test
pnpm --filter @medicalcor/domain test
pnpm --filter @medicalcor/api test
```

### Filtering Tests

```bash
# Run tests matching pattern
pnpm test -- scoring

# Run specific test file
pnpm test -- scoring-service.test.ts

# Run tests with specific name
pnpm test -- -t "should score HOT leads"
```

### E2E Tests

> **Setup Required**: Before running E2E tests, you must configure test user credentials. See [E2E Setup Guide](./E2E_SETUP.md) for complete instructions.

```bash
# Run Playwright tests
pnpm test:e2e

# Run with UI mode
pnpm test:e2e --ui

# Run specific browser
pnpm test:e2e --project=chromium
```

**Quick Setup for E2E Tests:**
1. Create test user account in your development environment
2. Add credentials to `apps/web/.env.local`:
   ```bash
   TEST_USER_EMAIL=test@example.com
   TEST_USER_PASSWORD=your-secure-password
   ```
3. Install Playwright browsers: `cd apps/web && pnpm exec playwright install --with-deps chromium`
4. Run tests: `pnpm test:e2e`

For CI/CD setup, see the [E2E Setup Guide](./E2E_SETUP.md) for instructions on adding GitHub Secrets.

---

## Load Testing with k6

MedicalCor uses [k6](https://k6.io/) for load and performance testing. Two main test suites are available:

### General API Load Testing

Tests general API endpoints (health checks, metrics, circuit breakers):

```bash
# Smoke test (1 minute, 5 VUs)
pnpm k6:smoke

# Load test (5 minutes, ramping to 50 VUs)
pnpm k6:load

# Stress test (10 minutes, ramping to 100 VUs)
pnpm k6:stress
```

**Direct k6 commands:**
```bash
k6 run scripts/k6/load-test.js
k6 run --env SCENARIO=load scripts/k6/load-test.js
k6 run --env SCENARIO=stress scripts/k6/load-test.js
```

### RLS Performance Testing

Tests Row-Level Security (RLS) performance to ensure database policies don't degrade query performance:

```bash
# Smoke test (1 minute, 5 VUs)
pnpm k6:rls

# Load test (5 minutes, ramping to 50 VUs)
pnpm k6:rls:load

# Stress test (10 minutes, ramping to 100 VUs)
pnpm k6:rls:stress

# Soak test (30 minutes, 25 VUs sustained load)
pnpm k6:rls:soak
```

**Direct k6 commands:**
```bash
# Smoke test (1 min, 5 VUs)
k6 run scripts/k6/rls-performance.js

# Load test (5 min, up to 50 VUs)
k6 run --env SCENARIO=load scripts/k6/rls-performance.js

# Stress test (10 min, up to 100 VUs)
k6 run --env SCENARIO=stress scripts/k6/rls-performance.js
```

### RLS Performance Scenarios

The RLS test validates:
- **Clinic ID isolation**: Multi-tenant data separation
- **User ID isolation**: User-specific data access
- **Phone-based lookups**: Consent and message queries
- **Admin bypass**: System-level access
- **Cross-tenant isolation**: Ensures no data leakage

### Thresholds

| Metric | Target |
|--------|--------|
| Error rate | < 1% |
| RLS clinic_id query (p95) | < 100ms |
| RLS user_id query (p95) | < 100ms |
| RLS phone query (p95) | < 150ms |
| RLS overhead | < 50% vs non-RLS |

### Custom Environment Variables

```bash
# Test against different environments
k6 run --env BASE_URL=https://staging-api.medicalcor.ro scripts/k6/rls-performance.js

# Specify API key
k6 run --env API_SECRET_KEY=your-key scripts/k6/load-test.js
```

### Output and Reports

Test results include:
- Console summary with pass/fail status
- JSON summary file: `rls-performance-summary.json`
- Metrics exported to stdout
- Performance breakdown by RLS pattern

---

## Writing Tests

### File Structure

```
packages/domain/
├── src/
│   └── scoring/
│       ├── scoring-service.ts
│       └── __tests__/
│           └── scoring-service.test.ts
└── __tests__/
    └── integration/
        └── scoring-flow.test.ts
```

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('ScoringService', () => {
  let service: ScoringService;

  beforeEach(() => {
    // Setup before each test
    service = new ScoringService({
      openaiClient: mockOpenAIClient,
    });
  });

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('scoreMessage', () => {
    it('should return HOT score for All-on-X mentions', async () => {
      // Arrange
      const input = {
        message: 'I want All-on-X implants',
        context: createMockContext(),
      };

      // Act
      const result = await service.scoreMessage(input);

      // Assert
      expect(result.score).toBe(5);
      expect(result.classification).toBe('HOT');
    });

    it('should handle empty messages', async () => {
      const input = {
        message: '',
        context: createMockContext(),
      };

      await expect(service.scoreMessage(input)).rejects.toThrow(
        'Message cannot be empty'
      );
    });
  });
});
```

### Testing Async Code

```typescript
describe('async operations', () => {
  it('should handle successful async operations', async () => {
    const result = await asyncOperation();
    expect(result).toBeDefined();
  });

  it('should handle async errors', async () => {
    await expect(failingOperation()).rejects.toThrow('Expected error');
  });

  it('should resolve within timeout', async () => {
    const result = await asyncOperation();
    expect(result).toBe('success');
  }, 5000); // 5 second timeout
});
```

### Testing with Fixtures

```typescript
// __tests__/fixtures/leads.ts
export const hotLeadContext = {
  phone: '+15551234567',
  channel: 'whatsapp' as const,
  messageHistory: [
    { content: 'I need All-on-X implants urgently', timestamp: new Date() },
  ],
};

export const coldLeadContext = {
  phone: '+15559876543',
  channel: 'web' as const,
  messageHistory: [
    { content: 'Just browsing', timestamp: new Date() },
  ],
};

// In test file
import { hotLeadContext, coldLeadContext } from './fixtures/leads';

describe('LeadScoring', () => {
  it('should score hot lead correctly', async () => {
    const result = await scoreLead(hotLeadContext);
    expect(result.classification).toBe('HOT');
  });
});
```

---

## Test Patterns

### Testing Services

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScoringService } from '../scoring-service';
import { OpenAIClient } from '@medicalcor/integrations';

// Mock the integration
vi.mock('@medicalcor/integrations', () => ({
  OpenAIClient: vi.fn().mockImplementation(() => ({
    complete: vi.fn(),
  })),
}));

describe('ScoringService', () => {
  let service: ScoringService;
  let mockOpenAI: ReturnType<typeof vi.mocked<OpenAIClient>>;

  beforeEach(() => {
    mockOpenAI = new OpenAIClient() as any;
    service = new ScoringService({ openaiClient: mockOpenAI });
  });

  it('should call OpenAI with correct prompt', async () => {
    mockOpenAI.complete.mockResolvedValue({
      score: 5,
      classification: 'HOT',
    });

    await service.scoreMessage({
      message: 'Test message',
      context: mockContext,
    });

    expect(mockOpenAI.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o',
        messages: expect.arrayContaining([
          expect.objectContaining({ role: 'system' }),
        ]),
      })
    );
  });
});
```

### Testing API Endpoints

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '../app';
import request from 'supertest';

describe('Webhook Endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await createApp({ testing: true });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /webhooks/whatsapp', () => {
    it('should accept valid webhook', async () => {
      const payload = createValidWhatsAppPayload();
      const signature = generateSignature(payload);

      const response = await request(app.server)
        .post('/webhooks/whatsapp')
        .set('X-Hub-Signature-256', signature)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const payload = createValidWhatsAppPayload();

      const response = await request(app.server)
        .post('/webhooks/whatsapp')
        .set('X-Hub-Signature-256', 'sha256=invalid')
        .send(payload);

      expect(response.status).toBe(401);
    });
  });
});
```

### Testing Error Handling

```typescript
describe('error handling', () => {
  it('should throw ValidationError for invalid input', async () => {
    const invalidInput = { phone: 'invalid' };

    await expect(service.process(invalidInput)).rejects.toThrow(
      ValidationError
    );
  });

  it('should include error details', async () => {
    try {
      await service.process({ phone: 'invalid' });
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.details).toEqual({
        field: 'phone',
        message: 'Invalid phone number format',
      });
    }
  });

  it('should fallback on external service failure', async () => {
    mockExternalService.mockRejectedValue(new Error('API down'));

    const result = await service.scoreWithFallback(input);

    expect(result.fallbackUsed).toBe(true);
    expect(result.score).toBeDefined();
  });
});
```

### Snapshot Testing

```typescript
describe('response formatting', () => {
  it('should match expected response structure', async () => {
    const result = await formatScoringResult({
      score: 5,
      classification: 'HOT',
      confidence: 0.95,
    });

    expect(result).toMatchSnapshot();
  });

  it('should format error responses consistently', () => {
    const error = new ValidationError('Invalid input', {
      field: 'phone',
    });

    expect(formatErrorResponse(error)).toMatchSnapshot();
  });
});
```

---

## Mocking

### MSW (Mock Service Worker)

```typescript
// vitest.setup.ts
import { setupServer } from 'msw/node';
import { handlers } from './mocks/handlers';

export const server = setupServer(...handlers);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

```typescript
// mocks/handlers.ts
import { http, HttpResponse } from 'msw';

export const handlers = [
  // HubSpot mock
  http.post('https://api.hubapi.com/crm/v3/objects/contacts', () => {
    return HttpResponse.json({
      id: 'mock-contact-id',
      properties: { email: 'test@example.com' },
    });
  }),

  // OpenAI mock
  http.post('https://api.openai.com/v1/chat/completions', () => {
    return HttpResponse.json({
      choices: [
        {
          message: {
            content: JSON.stringify({
              score: 5,
              classification: 'HOT',
            }),
          },
        },
      ],
    });
  }),
];
```

### Override Handlers in Tests

```typescript
import { server } from '../vitest.setup';
import { http, HttpResponse } from 'msw';

describe('error scenarios', () => {
  it('should handle HubSpot rate limit', async () => {
    server.use(
      http.post('https://api.hubapi.com/*', () => {
        return HttpResponse.json(
          { message: 'Rate limited' },
          { status: 429 }
        );
      })
    );

    await expect(hubspotClient.createContact(data)).rejects.toThrow(
      'Rate limited'
    );
  });
});
```

### Mocking with vi.mock

```typescript
import { vi } from 'vitest';

// Mock entire module
vi.mock('@medicalcor/integrations', () => ({
  HubSpotClient: vi.fn().mockImplementation(() => ({
    createContact: vi.fn().mockResolvedValue({ id: 'mock-id' }),
    updateContact: vi.fn().mockResolvedValue({ id: 'mock-id' }),
  })),
}));

// Partial mock
vi.mock('@medicalcor/core', async () => {
  const actual = await vi.importActual('@medicalcor/core');
  return {
    ...actual,
    logger: {
      info: vi.fn(),
      error: vi.fn(),
    },
  };
});
```

### Mocking Time

```typescript
import { vi, describe, it, beforeEach, afterEach } from 'vitest';

describe('time-dependent tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should handle consent expiry', () => {
    const consent = createConsent({
      grantedAt: new Date('2022-01-15'),
      expiresAt: new Date('2024-01-15'),
    });

    expect(isConsentExpired(consent)).toBe(true);
  });

  it('should schedule reminder correctly', async () => {
    const appointment = createAppointment({
      dateTime: new Date('2024-01-16T10:00:00Z'),
    });

    scheduleReminder(appointment);

    // Advance time by 24 hours
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(sendReminder).toHaveBeenCalled();
  });
});
```

---

## Coverage

### Configuration

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '**/*.test.ts',
        '**/__tests__/**',
        '**/mocks/**',
      ],
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 80,
        lines: 80,
      },
    },
  },
});
```

### Coverage Requirements

| Package | Statements | Branches | Functions | Lines |
|---------|------------|----------|-----------|-------|
| @medicalcor/core | 80% | 75% | 80% | 80% |
| @medicalcor/domain | 85% | 80% | 85% | 85% |
| @medicalcor/integrations | 70% | 65% | 70% | 70% |
| @medicalcor/api | 75% | 70% | 75% | 75% |

### Viewing Coverage

```bash
# Generate coverage report
pnpm test:coverage

# Open HTML report
open coverage/index.html

# View summary in terminal
pnpm test:coverage -- --reporter=text
```

---

## CI Integration

### GitHub Actions

```yaml
# .github/workflows/ci.yml
test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4

    - name: Setup pnpm
      uses: pnpm/action-setup@v2
      with:
        version: 9

    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Run tests
      run: pnpm test:coverage

    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        files: ./coverage/coverage-final.json
        fail_ci_if_error: true
```

### E2E Tests in CI

```yaml
e2e:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      shard: [1, 2]
  steps:
    - uses: actions/checkout@v4

    - name: Setup
      # ... setup steps

    - name: Run E2E tests
      run: pnpm test:e2e --shard=${{ matrix.shard }}/2

    - name: Upload results
      uses: actions/upload-artifact@v4
      if: always()
      with:
        name: playwright-report-${{ matrix.shard }}
        path: playwright-report/
        retention-days: 7
```

---

## Best Practices

### Do

- Write tests before or alongside code (TDD/BDD)
- Test behavior, not implementation
- Use descriptive test names
- Keep tests focused and small
- Use fixtures for complex data
- Mock external services
- Clean up after tests

### Don't

- Test private methods directly
- Rely on test execution order
- Share state between tests
- Use production databases
- Skip error case testing
- Write flaky tests

### Test Naming Convention

```typescript
// Pattern: should [expected behavior] when [condition]
describe('ScoringService', () => {
  it('should return HOT classification when message mentions All-on-X', async () => {
    // ...
  });

  it('should fallback to rules when AI is unavailable', async () => {
    // ...
  });

  it('should throw ValidationError when phone is invalid', async () => {
    // ...
  });
});
```

---

## Troubleshooting

### Tests Failing in CI but Passing Locally

```bash
# Ensure clean state
rm -rf node_modules
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

### Timeout Issues

```typescript
// Increase timeout for slow tests
it('should complete within extended timeout', async () => {
  // ...
}, 30000); // 30 second timeout

// Or in config
export default defineConfig({
  test: {
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

### Mock Not Working

```typescript
// Ensure mock is before import
vi.mock('@medicalcor/integrations'); // This must be first

import { HubSpotClient } from '@medicalcor/integrations';

// For ESM modules, use vi.hoisted
const mockClient = vi.hoisted(() => ({
  createContact: vi.fn(),
}));

vi.mock('@medicalcor/integrations', () => ({
  HubSpotClient: vi.fn(() => mockClient),
}));
```
