# E2E Test Setup Guide

Complete guide to setting up end-to-end (E2E) tests with Playwright for MedicalCor Core.

> 💡 **Visual Learner?** Check out the [E2E Setup Flowchart](./E2E_SETUP_FLOWCHART.md) for visual diagrams and quick reference.

## Table of Contents

- [Overview](#overview)
- [Local Development Setup](#local-development-setup)
- [CI/CD Setup (GitHub Actions)](#cicd-setup-github-actions)
- [Test User Requirements](#test-user-requirements)
- [Troubleshooting](#troubleshooting)
- [Security Best Practices](#security-best-practices)

---

## Overview

MedicalCor uses [Playwright](https://playwright.dev/) for end-to-end testing. E2E tests verify critical user flows such as:

- User authentication and session management
- Lead management and scoring
- Patient workflows
- Consent management
- Payment processing
- Booking and appointments
- Accessibility compliance

**Test Location**: `apps/web/e2e/`

**Test Authentication**: Uses a dedicated test user account configured via environment variables.

---

## Local Development Setup

### Step 1: Create Test User Account

Before running E2E tests locally, you need a test user account in your development environment:

1. Start your local development environment:

   ```bash
   pnpm dev
   ```

2. Create a test user through your authentication system or use the admin panel

3. **Note the credentials** - you'll need them in the next step

### Step 2: Configure Local Environment

Create a `.env.local` file in the `apps/web/` directory (this file is ignored by git):

```bash
# apps/web/.env.local

# E2E Test Credentials
TEST_USER_EMAIL=test@example.com
TEST_USER_PASSWORD=your-secure-test-password

# Playwright Base URL (optional, defaults to http://localhost:3001)
PLAYWRIGHT_BASE_URL=http://localhost:3001
```

**Security Note**: Never commit `.env.local` files to version control.

### Step 3: Install Playwright Browsers

```bash
cd apps/web
pnpm exec playwright install --with-deps chromium
```

### Step 4: Run E2E Tests

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

---

## CI/CD Setup (GitHub Actions)

### Step 1: Navigate to Repository Secrets

Go to your GitHub repository settings:

```
https://github.com/MEDICALCOR/medicalcor-core/settings/secrets/actions
```

Or navigate manually:

1. Go to your repository on GitHub
2. Click **Settings** tab
3. In the left sidebar, click **Secrets and variables** → **Actions**

### Step 2: Add Repository Secrets

Click **"New repository secret"** and add the following secrets:

| Secret Name          | Description                            | Example Value            |
| -------------------- | -------------------------------------- | ------------------------ |
| `TEST_USER_EMAIL`    | Email address of the test user account | `test@example.com`       |
| `TEST_USER_PASSWORD` | Password for the test user account     | `SecureTestPassword123!` |

**Important**: These secrets are required for E2E tests to run in CI/CD pipelines.

### Step 3: Verify Secrets Are Set

The secrets should now appear in the repository secrets list (values are hidden for security).

### Step 4: Verify CI/CD Integration

The E2E tests are automatically run in GitHub Actions via `.github/workflows/ci.yml`. The workflow:

1. Runs on every pull request and push to `main`
2. Uses the secrets you configured
3. Runs tests in parallel shards (2 shards by default)
4. Uploads test reports as artifacts

Check the workflow file section for E2E tests:

```yaml
- name: Run E2E tests (shard ${{ matrix.shard }})
  run: cd apps/web && pnpm test:e2e --shard=${{ matrix.shard }}/${{ matrix.total-shards }}
  env:
    TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
    TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
```

---

## Test User Requirements

### Account Specifications

The test user account should meet these requirements:

| Requirement             | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| **Dedicated Account**   | Use a separate account, not a real user account         |
| **Minimal Permissions** | Grant only the permissions needed for E2E test flows    |
| **Test Environment**    | Use a separate test database/environment                |
| **Stable Credentials**  | Don't change password or delete the account             |
| **Valid Session**       | Account should not have expired sessions or require MFA |

### Recommended Test User Configuration

```typescript
// Example test user profile
{
  email: "test@example.com",
  name: "E2E Test User",
  role: "admin", // or appropriate role for testing
  clinic_id: "test-clinic-001",
  permissions: [
    "view_leads",
    "manage_patients",
    "view_analytics",
    "manage_bookings",
    "process_payments"
  ]
}
```

### Security Considerations

1. **Use Strong Passwords**: Even for test accounts, use strong passwords
2. **Limit Scope**: Ensure test user can only access test data
3. **Separate Environment**: Run E2E tests against staging/test environment, not production
4. **Rotate Credentials**: Periodically update test user passwords and secrets
5. **Monitor Usage**: Review test user activity logs for any anomalies

---

## Troubleshooting

### Tests Fail with "TEST_USER_EMAIL is not defined"

**Cause**: Environment variables are not set.

**Solution**:

- **Local**: Create `.env.local` file in `apps/web/` with `TEST_USER_EMAIL` and `TEST_USER_PASSWORD`
- **CI**: Add secrets to GitHub repository settings

### Tests Fail with "Invalid credentials" or "Login failed"

**Cause**: Test user credentials are incorrect or account is disabled.

**Solution**:

1. Verify the test user account exists in your test environment
2. Verify credentials are correct
3. Check if the account is active and not locked
4. Ensure the account doesn't require MFA or additional verification

### Tests Timeout During Authentication

**Cause**: Application is slow to start or login page is not accessible.

**Solution**:

1. Increase timeout in `playwright.config.ts`:
   ```typescript
   timeout: 60000, // 60 seconds
   ```
2. Verify the application is running:
   ```bash
   curl http://localhost:3001/health
   ```
3. Check network connectivity

### "Browserengine executable not found"

**Cause**: Playwright browsers are not installed.

**Solution**:

```bash
cd apps/web
pnpm exec playwright install --with-deps chromium
```

### Tests Pass Locally but Fail in CI

**Cause**: Environment differences or missing secrets.

**Solution**:

1. Verify GitHub secrets are set correctly
2. Check CI logs for error messages
3. Ensure the test environment in CI matches local setup
4. Review the GitHub Actions workflow configuration

---

## Security Best Practices

### 1. Never Commit Credentials

- ✅ Use environment variables for all credentials
- ✅ Add `.env.local` to `.gitignore`
- ❌ Never hardcode credentials in test files
- ❌ Never commit `.env` files with real credentials

### 2. Use Dedicated Test Accounts

- ✅ Create separate accounts for E2E testing
- ✅ Use test-specific email addresses (e.g., `test@example.com`)
- ❌ Don't use real user accounts
- ❌ Don't use production accounts for testing

### 3. Limit Test Account Permissions

- ✅ Grant minimum permissions needed for tests
- ✅ Use role-based access control
- ✅ Restrict access to test data only
- ❌ Don't give test accounts admin privileges unless required

### 4. Use Separate Test Environment

- ✅ Run E2E tests against staging/test environment
- ✅ Use separate test database
- ✅ Isolate test data from production
- ❌ Never run E2E tests against production

### 5. Rotate Credentials Regularly

- ✅ Update test user passwords periodically
- ✅ Rotate GitHub secrets when team members leave
- ✅ Use password management tools
- ❌ Don't reuse passwords across environments

### 6. Monitor and Audit

- ✅ Review test user activity logs
- ✅ Monitor for suspicious login attempts
- ✅ Set up alerts for failed authentication
- ❌ Don't ignore security warnings

### 7. Secret Management in CI/CD

- ✅ Use GitHub Secrets for sensitive data
- ✅ Use environment-specific secrets
- ✅ Review secret access logs
- ❌ Don't expose secrets in logs or artifacts
- ❌ Don't print secrets during test runs

---

## Additional Resources

| Resource                                                                                    | Description                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------ |
| [Playwright Documentation](https://playwright.dev/)                                         | Official Playwright docs             |
| [TESTING.md](./TESTING.md)                                                                  | General testing guide for MedicalCor |
| [SECURITY.md](./SECURITY.md)                                                                | Security best practices              |
| [CI Workflow](.github/workflows/ci.yml)                                                     | GitHub Actions CI configuration      |
| [GitHub Secrets Docs](https://docs.github.com/en/actions/security-guides/encrypted-secrets) | GitHub's encrypted secrets guide     |

---

## Next Steps

After setting up E2E tests:

1. Run tests locally to verify setup: `pnpm test:e2e`
2. Create a pull request to verify CI integration
3. Review test results in GitHub Actions
4. Add new E2E tests for critical user flows
5. Monitor test stability and address flaky tests

---

**Need Help?**

- Check the [Troubleshooting](#troubleshooting) section above
- Review existing E2E tests in `apps/web/e2e/`
- Create a discussion on GitHub
- Consult the [TESTING.md](./TESTING.md) guide
