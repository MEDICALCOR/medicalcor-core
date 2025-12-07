# E2E Test Setup - Visual Guide

Visual guide showing the complete E2E test setup flow for both local development and CI/CD.

## Setup Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    E2E Test Setup Flow                       │
└─────────────────────────────────────────────────────────────┘

                         ┌──────────────┐
                         │  Start Here  │
                         └──────┬───────┘
                                │
                                ├────────────────────────────────┐
                                │                                │
                     ┌──────────▼──────────┐        ┌──────────▼──────────┐
                     │  Local Development  │        │  CI/CD (GitHub)     │
                     └──────────┬──────────┘        └──────────┬──────────┘
                                │                                │
                     ┌──────────▼──────────┐        ┌──────────▼──────────┐
                     │ 1. Create Test User │        │ 1. Create Test User │
                     │    in Dev Env       │        │    in Test Env      │
                     └──────────┬──────────┘        └──────────┬──────────┘
                                │                                │
                     ┌──────────▼──────────┐        ┌──────────▼──────────┐
                     │ 2. Create           │        │ 2. Add GitHub       │
                     │    .env.local       │        │    Secrets          │
                     │    in apps/web/     │        │                     │
                     │                     │        │    - TEST_USER_     │
                     │  TEST_USER_EMAIL=   │        │      EMAIL          │
                     │  test@example.com   │        │    - TEST_USER_     │
                     │                     │        │      PASSWORD       │
                     │  TEST_USER_         │        │                     │
                     │  PASSWORD=***       │        │    Settings →       │
                     └──────────┬──────────┘        │    Secrets → Actions│
                                │                   └──────────┬──────────┘
                     ┌──────────▼──────────┐                  │
                     │ 3. Install          │                  │
                     │    Playwright       │                  │
                     │                     │        ┌──────────▼──────────┐
                     │  cd apps/web        │        │ 3. CI Workflow      │
                     │  pnpm exec          │        │    Auto-Uses        │
                     │  playwright install │        │    Secrets          │
                     │  --with-deps        │        │                     │
                     │  chromium           │        │  See: .github/      │
                     └──────────┬──────────┘        │  workflows/ci.yml   │
                                │                   └──────────┬──────────┘
                     ┌──────────▼──────────┐                  │
                     │ 4. Run Tests        │                  │
                     │                     │        ┌──────────▼──────────┐
                     │  pnpm test:e2e      │        │ 4. Push Code /      │
                     │                     │        │    Create PR        │
                     │  ✓ All tests pass   │        │                     │
                     └─────────────────────┘        │  ✓ E2E tests run    │
                                                    │    automatically    │
                                                    └─────────────────────┘
```

## Authentication Flow

```
┌────────────────────────────────────────────────────────────┐
│              E2E Test Authentication Flow                   │
└────────────────────────────────────────────────────────────┘

                    ┌─────────────────┐
                    │ Test Suite      │
                    │ Starts          │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ auth.setup.ts   │
                    │ Runs First      │
                    └────────┬────────┘
                             │
                    ┌────────▼────────────────────┐
                    │ Read Environment Variables  │
                    │                             │
                    │  • TEST_USER_EMAIL          │
                    │  • TEST_USER_PASSWORD       │
                    └────────┬────────────────────┘
                             │
                    ┌────────▼────────┐
                    │ Navigate to     │
                    │ /login          │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Fill Credentials│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Click Login     │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Wait for        │
                    │ Dashboard       │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │ Save Auth State │
                    │ to              │
                    │ e2e/.auth/      │
                    │ user.json       │
                    └────────┬────────┘
                             │
           ┌─────────────────┴─────────────────┐
           │                                   │
  ┌────────▼────────┐              ┌──────────▼──────────┐
  │ Test 1          │              │ Test 2              │
  │ (Uses saved     │              │ (Uses saved         │
  │  auth state)    │     ...      │  auth state)        │
  │                 │              │                     │
  │ ✓ Authenticated │              │ ✓ Authenticated     │
  └─────────────────┘              └─────────────────────┘
```

## Test Execution Flow

```
┌────────────────────────────────────────────────────────────┐
│                Test Execution in CI/CD                      │
└────────────────────────────────────────────────────────────┘

       ┌─────────────┐
       │  Git Push   │
       │  or PR      │
       └──────┬──────┘
              │
       ┌──────▼──────────────────────────────────┐
       │  GitHub Actions Workflow Triggered      │
       └──────┬──────────────────────────────────┘
              │
       ┌──────▼──────┐
       │  Checkout   │
       │  Code       │
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │  Install    │
       │  Dependencies│
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │  Build      │
       │  Web App    │
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │  Start      │
       │  Web Server │
       │  (port 3001)│
       └──────┬──────┘
              │
       ┌──────▼──────────────────────────────┐
       │  Load Secrets from GitHub           │
       │  • TEST_USER_EMAIL → $secrets.*    │
       │  • TEST_USER_PASSWORD → $secrets.* │
       └──────┬──────────────────────────────┘
              │
       ┌──────▼──────────────┐
       │  Run E2E Tests      │
       │  (Sharded: 2 jobs)  │
       └──────┬──────────────┘
              │
       ┌──────┴──────┐
       │             │
  ┌────▼────┐  ┌────▼────┐
  │ Shard 1 │  │ Shard 2 │
  │         │  │         │
  │ Tests   │  │ Tests   │
  │ 1-N/2   │  │ N/2-N   │
  └────┬────┘  └────┬────┘
       │             │
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │  Upload     │
       │  Reports &  │
       │  Artifacts  │
       └──────┬──────┘
              │
       ┌──────▼──────┐
       │  ✅ or ❌   │
       │  Results    │
       └─────────────┘
```

## Security Flow

```
┌────────────────────────────────────────────────────────────┐
│              Secret Management Security Flow                │
└────────────────────────────────────────────────────────────┘

┌──────────────────────┐
│ Secrets Storage      │
└──────────────────────┘

    LOCAL DEV                        CI/CD
    ─────────                        ─────

┌──────────────┐              ┌──────────────────┐
│ .env.local   │              │ GitHub Secrets   │
│              │              │ (Encrypted)      │
│ ✓ In .gitignore           │                  │
│ ✓ Not committed           │ ✓ Encrypted      │
│ ✓ Local only              │ ✓ Audit logged   │
│                           │ ✓ Access control  │
└──────┬───────┘              └────────┬─────────┘
       │                              │
       │ Read at runtime              │ Injected as env vars
       │                              │
┌──────▼───────┐              ┌───────▼──────────┐
│ Playwright   │              │ GitHub Actions   │
│ Test Runner  │              │ Runner           │
│              │              │                  │
│ ✓ Only in test│              │ ✓ Temp env only │
│ ✓ Not logged  │              │ ✓ Not in logs   │
└──────┬───────┘              └────────┬─────────┘
       │                              │
       └──────────────┬───────────────┘
                      │
             ┌────────▼─────────┐
             │ auth.setup.ts    │
             │                  │
             │ ✓ Uses credentials│
             │ ✓ No console.log │
             │ ✓ Secure storage │
             └──────────────────┘
```

## Troubleshooting Decision Tree

```
┌────────────────────────────────────────────────────────────┐
│                Troubleshooting E2E Tests                    │
└────────────────────────────────────────────────────────────┘

                    Tests Failed?
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        NO                YES               │
        │                 │                 │
    ┌───▼───┐     Error Message?           │
    │  ✅   │             │                 │
    │ Done  │   ┌─────────┼─────────┐      │
    └───────┘   │         │         │      │
                │         │         │      │
       "TEST_USER_EMAIL   │    "Login     │
        not defined"      │     failed"    │
                │         │         │      │
     ┌──────────▼─────┐  │  ┌──────▼──────▼─────┐
     │ Add .env.local │  │  │ Check credentials  │
     │ (local) or     │  │  │ • User exists?     │
     │ GitHub Secrets │  │  │ • Password correct?│
     │ (CI)           │  │  │ • Account active?  │
     └────────────────┘  │  └────────────────────┘
                         │
              "Browser not found"
                         │
              ┌──────────▼─────────┐
              │ Run:               │
              │ playwright install │
              │ --with-deps        │
              │ chromium           │
              └────────────────────┘
```

## Quick Reference URLs

### For Repository Maintainers

- **GitHub Secrets Setup**: `https://github.com/MEDICALCOR/medicalcor-core/settings/secrets/actions`
- **CI Workflow Config**: `.github/workflows/ci.yml`
- **Workflow Runs**: `https://github.com/MEDICALCOR/medicalcor-core/actions`

### For Developers

- **Local E2E Setup**: [apps/web/e2e/README.md](../../apps/web/e2e/README.md)
- **Complete Setup Guide**: [E2E_SETUP.md](./E2E_SETUP.md)
- **Testing Guide**: [TESTING.md](./TESTING.md)

### Documentation Index

```
docs/
├── README/
│   ├── E2E_SETUP.md               ← Complete setup guide
│   ├── E2E_SETUP_FLOWCHART.md     ← This file (visual guide)
│   └── TESTING.md                 ← General testing guide
│
apps/web/e2e/
├── README.md                       ← Developer quick start
├── auth.setup.ts                   ← Authentication setup
└── *.spec.ts                       ← Test files

.github/
├── E2E_SETUP_QUICK_REFERENCE.md    ← Quick reference card
└── workflows/
    ├── ci.yml                      ← CI configuration
    └── README.md                   ← Workflows documentation
```

## Next Steps

1. **Local Development**: Follow the [E2E Setup Guide](./E2E_SETUP.md#local-development-setup)
2. **CI/CD Setup**: Follow the [E2E Setup Guide](./E2E_SETUP.md#cicd-setup-github-actions)
3. **Writing Tests**: See [apps/web/e2e/README.md](../../apps/web/e2e/README.md#writing-new-tests)
4. **Troubleshooting**: Check [E2E Setup Guide](./E2E_SETUP.md#troubleshooting)

---

**Visual Guide Version**: 1.0  
**Last Updated**: 2024-12-07  
**Maintained by**: MedicalCor Team
