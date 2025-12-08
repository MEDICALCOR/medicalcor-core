# MedicalCor Operational Smoke Tests

This directory contains smoke tests for validating the operational health of MedicalCor after deployment.

## Quick Start

```bash
# Run all smoke tests
pnpm smoke-test

# Run with K6 load testing
pnpm smoke-test:k6

# Run individual tests
pnpm smoke-test:observability
pnpm smoke-test:budget
```

## Test Categories

### 1. Health Checks

Validates basic API availability:

- `/health` - Comprehensive health check
- `/ready` - Kubernetes readiness probe
- `/live` - Kubernetes liveness probe
- Response time validation (< 500ms threshold)

### 2. Observability Stack

Validates OpenTelemetry and metrics:

- Prometheus metrics endpoint (`/metrics`)
- MedicalCor custom metrics presence
- HTTP request metrics
- Circuit breaker status
- Memory and system metrics

### 3. AI Budget Controller

Validates AI spending controls:

- Redis connectivity
- Budget check functionality
- Cost recording
- Alert generation at thresholds (50%, 75%, 90%)
- Budget limit enforcement

### 4. K6 Load Testing

Generates artificial traffic for dashboard validation:

- `smoke`: Quick 1-minute test with 5 VUs
- `load`: 5-minute test ramping to 50 VUs
- `stress`: 10-minute test ramping to 100 VUs
- `soak`: 30-minute sustained load with 20 VUs

## Configuration

Environment variables:

| Variable      | Default                  | Description                |
| ------------- | ------------------------ | -------------------------- |
| `BASE_URL`    | `http://localhost:3000`  | API base URL               |
| `REDIS_URL`   | `redis://localhost:6379` | Redis URL for budget tests |
| `GRAFANA_URL` | `http://localhost:3002`  | Grafana URL                |
| `K6_SCENARIO` | `smoke`                  | K6 test scenario           |

## Grafana Dashboard Validation

After running smoke tests:

1. Open Grafana at `$GRAFANA_URL`
2. Navigate to "MedicalCor - API Performance" dashboard
3. Verify graphs are showing data:
   - **Request Rate > 0**: OpenTelemetry is sending data
   - **Flat line**: Check instrumentation configuration

### Expected Metrics

The following metrics should be visible:

- `http_requests_total` - Request count
- `http_request_duration_seconds` - Latency histogram
- `medicalcor_*` - Custom business metrics

## AI Budget Controller Validation

After running budget tests:

1. Check logs for "AI budget check passed" messages
2. Verify alerts in Redis:
   ```bash
   redis-cli LRANGE ai:budget:alerts 0 -1
   ```
3. Check budget usage:
   ```bash
   redis-cli KEYS "ai:budget:spend:*"
   ```

## Troubleshooting

### API Not Reachable

```bash
curl http://localhost:3000/health
```

### Metrics Not Available

```bash
curl http://localhost:3000/metrics | head -20
```

### Redis Connection Failed

```bash
redis-cli -u redis://localhost:6379 ping
```

### OpenTelemetry Not Sending Data

Check these environment variables:

- `OTEL_ENABLED=true`
- `OTEL_SERVICE_NAME=medicalcor-api`
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318`

## CI/CD Integration

These tests are automatically run in the GitHub Actions workflow:

- `.github/workflows/smoke-tests.yml`

The workflow runs after deployments to staging/production and sends Slack notifications on failure.

## K6 Installation

To run K6 load tests locally:

```bash
# macOS
brew install k6

# Linux
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Docker
docker run -i grafana/k6 run - <scripts/k6/load-test.js
```
