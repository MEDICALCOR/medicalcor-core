# k6 Load Testing

This directory contains [k6](https://k6.io/) performance and load testing scripts for MedicalCor Core.

## Test Suites

### 1. General API Load Testing (`load-test.js`)

Tests core API endpoints including health checks, metrics, and circuit breaker endpoints.

**Usage:**
```bash
# Smoke test (1 minute, 5 VUs)
pnpm k6:smoke
# or
k6 run scripts/k6/load-test.js

# Load test (5 minutes, ramping to 50 VUs)
pnpm k6:load
# or
k6 run --env SCENARIO=load scripts/k6/load-test.js

# Stress test (10 minutes, ramping to 100 VUs)
pnpm k6:stress
# or
k6 run --env SCENARIO=stress scripts/k6/load-test.js

# Soak test (30 minutes, 20 VUs sustained)
k6 run --env SCENARIO=soak scripts/k6/load-test.js
```

**Tested Endpoints:**
- `/health` - Main health check
- `/ready` - Readiness probe
- `/live` - Liveness probe
- `/metrics` - Prometheus metrics
- `/health/circuit-breakers` - Circuit breaker status
- `/health/deep` - Deep health check

**Thresholds:**
- p95 response time < 500ms
- p99 response time < 1000ms
- Error rate < 5%
- Health check < 200ms

---

### 2. RLS Performance Testing (`rls-performance.js`)

Tests Row-Level Security (RLS) policy performance to ensure PostgreSQL RLS doesn't degrade query performance under load.

**Usage:**
```bash
# Smoke test (1 min, 5 VUs)
pnpm k6:rls
# or
k6 run scripts/k6/rls-performance.js

# Load test (5 min, up to 50 VUs)
pnpm k6:rls:load
# or
k6 run --env SCENARIO=load scripts/k6/rls-performance.js

# Stress test (10 min, up to 100 VUs)
pnpm k6:rls:stress
# or
k6 run --env SCENARIO=stress scripts/k6/rls-performance.js

# Soak test (30 minutes, 25 VUs sustained)
pnpm k6:rls:soak
# or
k6 run --env SCENARIO=soak scripts/k6/rls-performance.js
```

**RLS Patterns Tested:**
- **clinic_id isolation**: Multi-tenant data separation
- **user_id isolation**: User-specific data access (sessions, MFA)
- **phone-based lookups**: Consent and message queries
- **admin bypass**: System-level access
- **cross-tenant isolation**: Security validation

**Tables Tested:**
- `users`
- `consent_records`
- `message_log`
- `lead_scoring`
- `sessions`
- `mfa_secrets`
- `encrypted_data`

**Thresholds:**
- p95 clinic_id queries < 100ms
- p95 user_id queries < 100ms
- p95 phone queries < 150ms
- p95 admin queries < 50ms
- RLS overhead < 50% vs non-RLS baseline
- Zero RLS violations (cross-tenant leakage)

**Custom Metrics:**
- `rls_clinic_id_query_duration` - Clinic isolation query latency
- `rls_user_id_query_duration` - User isolation query latency
- `rls_phone_query_duration` - Phone lookup query latency
- `rls_admin_query_duration` - Admin bypass query latency
- `rls_violations` - Count of RLS security violations
- `rls_overhead_percentage` - RLS overhead compared to non-RLS

---

## Available Scenarios

All test scripts support the following scenarios via the `SCENARIO` environment variable:

| Scenario | Duration | VUs | Ramp | Purpose |
|----------|----------|-----|------|---------|
| `baseline` | 30s | 1 | Constant | Quick baseline metrics |
| `smoke` | 1m | 5 | Constant | Minimal load verification |
| `load` | 5m | 50 | Ramping | Normal production load simulation |
| `stress` | 10m | 100 | Ramping | Peak load testing |
| `soak` | 30m | 20-25 | Constant | Sustained load for leak detection |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | API base URL |
| `SCENARIO` | `smoke` | Test scenario (smoke/load/stress/soak) |
| `API_SECRET_KEY` | `test-api-key` | API authentication key |
| `ENVIRONMENT` | `local` | Environment tag for metrics |
| `DASHBOARD_API_URL` | - | Optional: POST results to dashboard |

**Examples:**
```bash
# Test against staging
k6 run --env BASE_URL=https://staging-api.medicalcor.ro \
       --env ENVIRONMENT=staging \
       scripts/k6/rls-performance.js

# Load test with custom API key
k6 run --env SCENARIO=load \
       --env API_SECRET_KEY=prod-key \
       scripts/k6/load-test.js
```

## Output

All tests produce:
- **Console output**: Real-time test progress and summary
- **JSON summary**: Exported to `summary.json` (general) or `rls-performance-summary.json` (RLS)
- **Metrics**: Custom metrics tracked and reported
- **Pass/fail status**: Based on defined thresholds

**Example RLS Summary** (sample output):
```
============================================================
  RLS PERFORMANCE TEST RESULTS
============================================================

SCENARIO: load
TIMESTAMP: 2024-12-07T10:00:00.000Z
STATUS: ✅ PASSED

QUERY LATENCY (p95 in ms):
  clinic_id isolation:  89.23 ms
  user_id isolation:    92.45 ms
  phone lookup:         134.67 ms
  admin bypass:         42.12 ms
  no RLS baseline:      65.34 ms

RLS OVERHEAD:
  Average overhead:     38.45%
  Acceptable (<50%):    ✅ YES

SECURITY:
  RLS violations:       0
  Tenant isolation:     ✅ VERIFIED

SUMMARY:
  Total queries:        1250
  Successful:           1247
  Failed:               3
  Error rate:           0.24%

============================================================
```

Note: Values shown are example output. Actual results will vary based on infrastructure and load.

## CI/CD Integration

k6 load tests are **automatically run** via GitHub Actions (`.github/workflows/k6-load-tests.yml`):

### Automatic Triggers

| Event | Scenario | Tests |
|-------|----------|-------|
| Pull Request | `smoke` (1 min) | API + RLS |
| Push to `main` | `load` (5 min) | API + RLS |
| Weekly (Sunday 2AM UTC) | `load` | API + RLS |

### Manual Trigger

Run tests manually via **Actions → k6 Load Tests → Run workflow**:

- **Scenario**: Choose `smoke`, `load`, or `stress`
- **Test Suite**: Run `all`, `api` only, or `rls` only
- **Base URL**: Optionally test against staging/production

### PR Comments

On pull requests, a bot comment is posted with:
- Test status (pass/fail)
- Key metrics (p95 latency, success rate)
- RLS overhead percentage
- Security validation results

### Workflow Features

- **Fast feedback**: Smoke tests on PRs (~1 minute)
- **Thorough validation**: Load tests on main (~5 minutes)
- **Artifact uploads**: JSON summaries retained for 30 days
- **Status checks**: Failures block PR merges
- **GitHub step summaries**: Visual results in workflow runs

### Manual k6 Integration (for other pipelines)

```yaml
# Example for custom CI/CD
- name: Run RLS Performance Tests
  run: |
    k6 run --env SCENARIO=smoke \
           --env BASE_URL=${{ secrets.STAGING_API_URL }} \
           scripts/k6/rls-performance.js
```

## Requirements

- **k6**: Install from [k6.io](https://k6.io/docs/getting-started/installation/)
  - macOS: `brew install k6`
  - Ubuntu/Debian: 
    ```bash
    sudo gpg -k
    sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
    echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
    sudo apt-get update
    sudo apt-get install k6
    ```
    Or via snap: `snap install k6`
  - Windows: `choco install k6`

- **Running API**: The target API must be running and accessible at `BASE_URL`

## Best Practices

1. **Start with smoke tests**: Always run smoke tests first to validate setup
2. **Monitor during load tests**: Watch metrics, logs, and database during tests
3. **Baseline first**: Run baseline scenarios to establish normal performance
4. **Incremental stress**: Gradually increase load to find breaking points
5. **Analyze results**: Review JSON summaries and identify bottlenecks
6. **Test RLS regularly**: RLS performance can degrade with data growth

## Troubleshooting

### Connection Errors
```bash
# Check if API is running
curl http://localhost:3000/health

# Check network connectivity
ping localhost
```

### RLS Test Endpoints Not Found (404)
The RLS test requires special `/rls-test/*` endpoints. Ensure:
- API is running with RLS test mode enabled
- Or use production endpoints by modifying the test script

### High Error Rates
- Increase API resources (CPU, memory)
- Check database connection pool settings
- Review application logs for errors
- Reduce VU count or test duration

### Threshold Failures
- Review which specific thresholds failed
- Check if infrastructure is correctly sized
- Analyze slow queries in database logs
- Consider optimizing RLS policies or indexes

## Additional Resources

- [k6 Documentation](https://k6.io/docs/)
- [k6 Test Types](https://k6.io/docs/test-types/introduction/)
- [PostgreSQL RLS Performance](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [MedicalCor Testing Guide](../../docs/README/TESTING.md)
