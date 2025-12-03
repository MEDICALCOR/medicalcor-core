#!/bin/bash
#
# MedicalCor Operational Smoke Test Runner
#
# This script orchestrates all smoke tests for operational validation:
# 1. API Health Checks
# 2. Observability Stack (OpenTelemetry, Prometheus metrics)
# 3. AI Budget Controller
# 4. K6 Load Test (optional traffic generation)
#
# Usage:
#   ./scripts/smoke-tests/run-all.sh
#   ./scripts/smoke-tests/run-all.sh --with-k6
#   BASE_URL=https://staging-api.medicalcor.ro ./scripts/smoke-tests/run-all.sh
#
# Environment variables:
#   BASE_URL     - API base URL (default: http://localhost:3000)
#   REDIS_URL    - Redis URL for budget tests (default: redis://localhost:6379)
#   GRAFANA_URL  - Grafana URL (default: http://localhost:3002)
#   K6_SCENARIO  - K6 test scenario (default: smoke)
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3002}"
K6_SCENARIO="${K6_SCENARIO:-smoke}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Parse arguments
RUN_K6=false
for arg in "$@"; do
  case $arg in
    --with-k6)
      RUN_K6=true
      shift
      ;;
    --help)
      echo "Usage: $0 [--with-k6]"
      echo ""
      echo "Options:"
      echo "  --with-k6    Run K6 load test to generate traffic"
      echo ""
      echo "Environment variables:"
      echo "  BASE_URL     API base URL (default: http://localhost:3000)"
      echo "  REDIS_URL    Redis URL (default: redis://localhost:6379)"
      echo "  GRAFANA_URL  Grafana URL (default: http://localhost:3002)"
      echo "  K6_SCENARIO  K6 scenario: smoke|load|stress|soak (default: smoke)"
      exit 0
      ;;
  esac
done

# Results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
declare -a FAILED_TEST_NAMES

# Helper functions
log_header() {
  echo ""
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}  $1${NC}"
  echo -e "${BLUE}========================================${NC}"
  echo ""
}

log_success() {
  echo -e "${GREEN}✅ $1${NC}"
  ((PASSED_TESTS++))
  ((TOTAL_TESTS++))
}

log_failure() {
  echo -e "${RED}❌ $1${NC}"
  ((FAILED_TESTS++))
  ((TOTAL_TESTS++))
  FAILED_TEST_NAMES+=("$1")
}

log_warning() {
  echo -e "${YELLOW}⚠️  $1${NC}"
}

log_info() {
  echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

#
# Step 1: Basic Health Checks
#
run_health_checks() {
  log_header "Step 1: API Health Checks"

  log_info "Testing: $BASE_URL"
  echo ""

  # Health endpoint
  echo "Checking /health..."
  HTTP_CODE=$(curl -sf -w "%{http_code}" -o /tmp/health_response.json "$BASE_URL/health" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    STATUS=$(jq -r '.status' /tmp/health_response.json 2>/dev/null || echo "unknown")
    if [ "$STATUS" = "ok" ] || [ "$STATUS" = "degraded" ]; then
      log_success "Health check: $STATUS (HTTP $HTTP_CODE)"
    else
      log_failure "Health check: unexpected status $STATUS"
    fi
  else
    log_failure "Health check: HTTP $HTTP_CODE"
  fi

  # Readiness endpoint
  echo "Checking /ready..."
  HTTP_CODE=$(curl -sf -w "%{http_code}" -o /tmp/ready_response.json "$BASE_URL/ready" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    log_success "Readiness check: ready (HTTP $HTTP_CODE)"
  else
    log_failure "Readiness check: HTTP $HTTP_CODE"
  fi

  # Liveness endpoint
  echo "Checking /live..."
  HTTP_CODE=$(curl -sf -w "%{http_code}" -o /tmp/live_response.json "$BASE_URL/live" 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    log_success "Liveness check: alive (HTTP $HTTP_CODE)"
  else
    log_failure "Liveness check: HTTP $HTTP_CODE"
  fi

  # Response time check
  echo "Checking response time..."
  TOTAL_TIME=0
  for i in {1..5}; do
    TIME=$(curl -sf -o /dev/null -w "%{time_total}" "$BASE_URL/health" 2>/dev/null || echo "5")
    TIME_MS=$(awk "BEGIN {print int($TIME * 1000)}")
    TOTAL_TIME=$((TOTAL_TIME + TIME_MS))
  done
  AVG_TIME=$((TOTAL_TIME / 5))

  if [ "$AVG_TIME" -lt 500 ]; then
    log_success "Response time: ${AVG_TIME}ms average (< 500ms threshold)"
  else
    log_warning "Response time: ${AVG_TIME}ms average (>= 500ms threshold)"
    ((TOTAL_TESTS++))
  fi
}

#
# Step 2: Observability Checks
#
run_observability_checks() {
  log_header "Step 2: Observability Stack (Grafana/Prometheus)"

  # Metrics endpoint
  echo "Checking /metrics..."
  METRICS_RESPONSE=$(curl -sf "$BASE_URL/metrics" 2>/dev/null || echo "")

  if echo "$METRICS_RESPONSE" | grep -q "# HELP"; then
    log_success "Prometheus metrics endpoint available"

    # Check for MedicalCor metrics
    if echo "$METRICS_RESPONSE" | grep -q "medicalcor_"; then
      log_success "MedicalCor custom metrics present"
    else
      log_warning "MedicalCor custom metrics not found - check OpenTelemetry instrumentation"
      ((TOTAL_TESTS++))
    fi

    # Check for HTTP request metrics
    if echo "$METRICS_RESPONSE" | grep -q "http_request"; then
      log_success "HTTP request metrics present"
    else
      log_warning "HTTP request metrics not found"
      ((TOTAL_TESTS++))
    fi
  else
    log_failure "Prometheus metrics endpoint not available"
  fi

  # Circuit breakers
  echo "Checking circuit breakers..."
  CB_RESPONSE=$(curl -sf "$BASE_URL/health/circuit-breakers" 2>/dev/null || echo "")
  if [ -n "$CB_RESPONSE" ]; then
    OPEN_CIRCUITS=$(echo "$CB_RESPONSE" | jq -r '.openCircuits | length' 2>/dev/null || echo "0")
    SERVICE_COUNT=$(echo "$CB_RESPONSE" | jq -r '.services | length' 2>/dev/null || echo "0")
    if [ "$OPEN_CIRCUITS" = "0" ]; then
      log_success "Circuit breakers: $SERVICE_COUNT services, 0 open"
    else
      log_warning "Circuit breakers: $SERVICE_COUNT services, $OPEN_CIRCUITS OPEN"
      ((TOTAL_TESTS++))
    fi
  else
    log_failure "Circuit breaker endpoint not available"
  fi

  # Run detailed observability check
  if command_exists npx; then
    echo ""
    echo "Running detailed observability tests..."
    cd "$PROJECT_ROOT"
    if BASE_URL="$BASE_URL" GRAFANA_URL="$GRAFANA_URL" npx tsx "$SCRIPT_DIR/observability-check.ts" 2>/dev/null; then
      log_success "Detailed observability tests passed"
    else
      log_warning "Some observability tests had issues"
      ((TOTAL_TESTS++))
    fi
  fi
}

#
# Step 3: AI Budget Controller Check
#
run_ai_budget_check() {
  log_header "Step 3: AI Budget Controller"

  if ! command_exists npx; then
    log_warning "npx not found - skipping AI Budget Controller tests"
    return
  fi

  echo "Running AI Budget Controller smoke test..."
  cd "$PROJECT_ROOT"

  if REDIS_URL="$REDIS_URL" npx tsx "$SCRIPT_DIR/ai-budget-check.ts" 2>&1; then
    log_success "AI Budget Controller tests passed"
  else
    log_failure "AI Budget Controller tests failed"
  fi
}

#
# Step 4: K6 Load Test (Optional)
#
run_k6_load_test() {
  if [ "$RUN_K6" = false ]; then
    log_info "Skipping K6 load test (use --with-k6 to enable)"
    return
  fi

  log_header "Step 4: K6 Load Test (Traffic Generation)"

  if ! command_exists k6; then
    log_warning "k6 not installed - skipping load test"
    echo "Install k6: https://k6.io/docs/getting-started/installation/"
    return
  fi

  echo "Running K6 $K6_SCENARIO test..."
  cd "$PROJECT_ROOT"

  if k6 run --env BASE_URL="$BASE_URL" --env SCENARIO="$K6_SCENARIO" "$SCRIPT_DIR/../k6/load-test.js" 2>&1; then
    log_success "K6 load test completed"
  else
    log_failure "K6 load test failed"
  fi
}

#
# Step 5: Grafana Dashboard Verification
#
check_grafana_dashboard() {
  log_header "Step 5: Grafana Dashboard Verification"

  echo "Checking Grafana availability..."
  GRAFANA_HEALTH=$(curl -sf "$GRAFANA_URL/api/health" 2>/dev/null || echo "")

  if [ -n "$GRAFANA_HEALTH" ]; then
    log_success "Grafana is reachable at $GRAFANA_URL"
    echo ""
    echo -e "${YELLOW}Manual verification required:${NC}"
    echo "1. Open Grafana: $GRAFANA_URL"
    echo "2. Navigate to 'MedicalCor - API Performance' dashboard"
    echo "3. Verify graphs are showing data (Request Rate > 0)"
    echo "4. If graphs are flat, OpenTelemetry instrumentation may not be sending data"
    echo ""
    log_info "Target: Request Rate should be > 0 after generating traffic"
  else
    log_warning "Grafana not reachable at $GRAFANA_URL (optional for API smoke tests)"
    ((TOTAL_TESTS++))
  fi
}

#
# Summary
#
print_summary() {
  log_header "Smoke Test Summary"

  echo "Environment:"
  echo "  API URL:     $BASE_URL"
  echo "  Redis URL:   ${REDIS_URL//:*@/:***@}"
  echo "  Grafana URL: $GRAFANA_URL"
  echo ""
  echo "Results:"
  echo "  Total Tests: $TOTAL_TESTS"
  echo -e "  ${GREEN}Passed:${NC}      $PASSED_TESTS"
  echo -e "  ${RED}Failed:${NC}      $FAILED_TESTS"
  echo ""

  if [ $FAILED_TESTS -gt 0 ]; then
    echo -e "${RED}Failed tests:${NC}"
    for test_name in "${FAILED_TEST_NAMES[@]}"; do
      echo "  - $test_name"
    done
    echo ""
    echo -e "${RED}❌ SMOKE TESTS FAILED${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "  1. Check if API is running: curl $BASE_URL/health"
    echo "  2. Check Redis connectivity: redis-cli -u $REDIS_URL ping"
    echo "  3. Check OpenTelemetry config: verify OTEL_ENABLED=true"
    echo "  4. Review API logs for errors"
    exit 1
  else
    echo -e "${GREEN}✅ ALL SMOKE TESTS PASSED${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Verify Grafana dashboards show metrics"
    echo "  2. Run K6 load test: $0 --with-k6"
    echo "  3. Check AI budget alerts in Redis"
  fi
}

#
# Main execution
#
main() {
  log_header "MedicalCor Operational Smoke Tests"

  echo "Configuration:"
  echo "  API URL:     $BASE_URL"
  echo "  Redis URL:   ${REDIS_URL//:*@/:***@}"
  echo "  Grafana URL: $GRAFANA_URL"
  echo "  K6 Scenario: $K6_SCENARIO"
  echo "  Run K6:      $RUN_K6"

  # Run all test steps
  run_health_checks
  run_observability_checks
  run_ai_budget_check
  run_k6_load_test
  check_grafana_dashboard

  # Print summary
  print_summary
}

# Run main
main
