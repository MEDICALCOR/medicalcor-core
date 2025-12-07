# E2E Tests

End-to-end tests for MedicalCor web application using Playwright.

## Quick Start

### Prerequisites

Before running E2E tests, you must configure test user credentials:

1. **Create a test user account** in your development environment
2. **Add credentials to `.env.local`** in the `apps/web/` directory:
   ```bash
   # apps/web/.env.local
   TEST_USER_EMAIL=test@example.com
   TEST_USER_PASSWORD=your-secure-password
   ```
3. **Install Playwright browsers**:
   ```bash
   pnpm exec playwright install --with-deps chromium
   ```

### Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI mode (interactive)
pnpm test:e2e --ui

# Run specific test file
pnpm test:e2e e2e/dashboard.spec.ts

# Run specific browser
pnpm test:e2e --project=chromium
```

## Test Files

| File                    | Description                                  |
| ----------------------- | -------------------------------------------- |
| `auth.setup.ts`         | Authentication setup (runs before all tests) |
| `dashboard.spec.ts`     | Dashboard page tests                         |
| `patients.spec.ts`      | Patient management tests                     |
| `consent.spec.ts`       | GDPR consent workflow tests                  |
| `payment.spec.ts`       | Payment processing tests                     |
| `booking.spec.ts`       | Appointment booking tests                    |
| `workflows.spec.ts`     | Workflow builder tests                       |
| `lead-scoring.spec.ts`  | Lead scoring UI tests                        |
| `accessibility.spec.ts` | Accessibility compliance tests               |

## Authentication

Tests use a shared authentication state to avoid logging in for each test:

1. `auth.setup.ts` runs once before all tests
2. Logs in with credentials from environment variables
3. Saves authentication state to `e2e/.auth/user.json`
4. Other tests load this state to skip login

## Configuration

E2E tests are configured in `playwright.config.ts`:

- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Parallel**: Tests run in parallel for speed
- **Retries**: 2 retries on CI, 0 retries locally
- **Timeout**: 30 seconds per test
- **Screenshots**: Captured on failure
- **Videos**: Recorded on first retry

## CI/CD Integration

E2E tests run automatically in GitHub Actions:

- **Trigger**: On every pull request and push to `main`
- **Sharding**: Tests split across 2 parallel jobs
- **Secrets**: `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` from GitHub Secrets
- **Artifacts**: Test reports and videos uploaded for 7 days

### Setting Up CI/CD

Add these secrets to your GitHub repository:

1. Go to: `https://github.com/MEDICALCOR/medicalcor-core/settings/secrets/actions`
2. Click "New repository secret"
3. Add:
   - Name: `TEST_USER_EMAIL`, Value: Your test user email
   - Name: `TEST_USER_PASSWORD`, Value: Your test user password

## Writing New Tests

### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    // Navigate
    await page.goto('/path');

    // Interact
    await page.click('button[type="submit"]');

    // Assert
    await expect(page.locator('h1')).toContainText('Expected Text');
  });
});
```

### Using Page Object Model

For complex pages, use the Page Object Model pattern:

```typescript
// pages/dashboard.page.ts
export class DashboardPage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/dashboard');
  }

  async getLeadsCount() {
    return this.page.locator('[data-testid="leads-count"]').textContent();
  }
}

// dashboard.spec.ts
import { DashboardPage } from './pages/dashboard.page';

test('should display leads count', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.goto();

  const count = await dashboard.getLeadsCount();
  expect(count).toBeTruthy();
});
```

### Best Practices

1. **Use data-testid attributes** for stable selectors
2. **Test user behavior**, not implementation details
3. **Keep tests independent** - don't rely on test execution order
4. **Use meaningful test names** - describe what is being tested
5. **Clean up after tests** - restore state if needed
6. **Avoid hardcoded waits** - use Playwright's auto-waiting
7. **Test accessibility** - use Playwright's accessibility features

## Troubleshooting

### "TEST_USER_EMAIL is not defined"

**Solution**: Create `.env.local` file in `apps/web/` with test credentials.

### "Login failed" or "Invalid credentials"

**Solution**:

- Verify the test user exists in your test environment
- Check credentials are correct
- Ensure the account is active

### Tests timeout

**Solution**:

- Verify the application is running: `curl http://localhost:3001`
- Increase timeout in `playwright.config.ts`
- Check network connectivity

### Browser not installed

**Solution**: Run `pnpm exec playwright install --with-deps chromium`

## Complete Setup Guide

For detailed instructions on setting up E2E tests for both local development and CI/CD, see:

📖 **[E2E Setup Guide](../../../docs/README/E2E_SETUP.md)**

This guide includes:

- Test user requirements and security best practices
- Step-by-step CI/CD configuration
- Troubleshooting common issues
- Security considerations
