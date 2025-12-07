# E2E Test Setup - Quick Reference

**Purpose**: Quick reference card for setting up E2E test credentials.

## For Repository Maintainers

### GitHub Secrets Setup (5 minutes)

1. **Navigate to Secrets Settings**

   ```
   https://github.com/MEDICALCOR/medicalcor-core/settings/secrets/actions
   ```

   Or: Repository → Settings → Secrets and variables → Actions

2. **Add Two Secrets**

   Click "New repository secret" and add:

   | Secret Name          | Value Example        |
   | -------------------- | -------------------- |
   | `TEST_USER_EMAIL`    | `test@example.com`   |
   | `TEST_USER_PASSWORD` | `SecurePassword123!` |

3. **Verify CI Integration**

   The secrets are automatically used in `.github/workflows/ci.yml`:

   ```yaml
   env:
     TEST_USER_EMAIL: ${{ secrets.TEST_USER_EMAIL }}
     TEST_USER_PASSWORD: ${{ secrets.TEST_USER_PASSWORD }}
   ```

4. **Done!**

   E2E tests will now run in GitHub Actions.

## For Developers (Local Setup)

### Quick Start (3 minutes)

1. **Create `.env.local`** in `apps/web/`:

   ```bash
   # apps/web/.env.local
   TEST_USER_EMAIL=test@example.com
   TEST_USER_PASSWORD=your-password
   ```

2. **Install Playwright browsers**:

   ```bash
   cd apps/web
   pnpm exec playwright install --with-deps chromium
   ```

3. **Run tests**:
   ```bash
   pnpm test:e2e
   ```

## Test User Requirements

✅ **DO:**

- Use a dedicated test account
- Use strong passwords
- Run against test/staging environment
- Grant minimal required permissions

❌ **DON'T:**

- Use production accounts
- Commit credentials to git
- Share credentials in chat/email
- Give admin access unless required

## Security Checklist

- [ ] Test user exists in test environment
- [ ] `.env.local` is in `.gitignore`
- [ ] GitHub secrets are set
- [ ] Test user has minimal permissions
- [ ] Credentials are strong and unique
- [ ] Testing against non-production environment

## Troubleshooting

| Problem                     | Solution                                            |
| --------------------------- | --------------------------------------------------- |
| "TEST_USER_EMAIL not found" | Add to `.env.local` (local) or GitHub Secrets (CI)  |
| "Login failed"              | Verify test user exists and credentials are correct |
| "Browser not installed"     | Run `pnpm exec playwright install chromium`         |
| Tests timeout               | Check app is running: `curl http://localhost:3001`  |

## Complete Documentation

📖 **[Full E2E Setup Guide](../docs/README/E2E_SETUP.md)**

Includes:

- Detailed step-by-step instructions
- Security best practices
- CI/CD configuration
- Advanced troubleshooting
- Test writing guidelines

---

**Last Updated**: 2024-12-07
**Maintained by**: MedicalCor Team
