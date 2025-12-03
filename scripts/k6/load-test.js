/**
 * K6 Load Testing Script for MedicalCor API
 *
 * This script generates artificial traffic to validate:
 * - Grafana dashboard metrics visibility
 * - OpenTelemetry instrumentation
 * - API performance under load
 *
 * Usage:
 *   k6 run scripts/k6/load-test.js
 *   k6 run --env BASE_URL=https://staging-api.medicalcor.ro scripts/k6/load-test.js
 *   k6 run --env SCENARIO=smoke scripts/k6/load-test.js
 *
 * Available scenarios:
 *   - smoke: Quick 1-minute test with 5 VUs
 *   - load: 5-minute test ramping to 50 VUs
 *   - stress: 10-minute test ramping to 100 VUs
 *   - soak: 30-minute sustained load with 20 VUs
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const healthCheckDuration = new Trend('health_check_duration', true);
const apiRequestDuration = new Trend('api_request_duration', true);
const successfulRequests = new Counter('successful_requests');
const failedRequests = new Counter('failed_requests');

// Configuration
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SCENARIO = __ENV.SCENARIO || 'smoke';

// Define test scenarios
const scenarios = {
  smoke: {
    executor: 'constant-vus',
    vus: 5,
    duration: '1m',
    gracefulStop: '10s',
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 20 },
      { duration: '3m', target: 50 },
      { duration: '1m', target: 0 },
    ],
    gracefulStop: '30s',
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '5m', target: 100 },
      { duration: '2m', target: 100 },
      { duration: '1m', target: 0 },
    ],
    gracefulStop: '30s',
  },
  soak: {
    executor: 'constant-vus',
    vus: 20,
    duration: '30m',
    gracefulStop: '1m',
  },
};

// Export options
export const options = {
  scenarios: {
    default: scenarios[SCENARIO] || scenarios.smoke,
  },
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'], // 95% < 500ms, 99% < 1s
    errors: ['rate<0.05'], // Error rate < 5%
    health_check_duration: ['p(95)<200'], // Health checks < 200ms
  },
  tags: {
    environment: __ENV.ENVIRONMENT || 'local',
    testType: SCENARIO,
  },
};

// Request headers
const headers = {
  'Content-Type': 'application/json',
  'User-Agent': 'K6-LoadTest/1.0',
};

/**
 * Main test function
 */
export default function () {
  group('Health Checks', function () {
    testHealthEndpoint();
    testReadinessEndpoint();
    testLivenessEndpoint();
  });

  group('API Endpoints', function () {
    testMetricsEndpoint();
    testCircuitBreakersEndpoint();
    testDeepHealthCheck();
  });

  // Add some variability between requests
  sleep(Math.random() * 2 + 0.5); // 0.5-2.5 seconds
}

/**
 * Test main health endpoint
 */
function testHealthEndpoint() {
  const start = Date.now();
  const response = http.get(`${BASE_URL}/health`, { headers, tags: { name: 'health' } });
  const duration = Date.now() - start;

  healthCheckDuration.add(duration);

  const success = check(response, {
    'health: status is 200': (r) => r.status === 200,
    'health: response has status field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'ok' || body.status === 'degraded';
      } catch {
        return false;
      }
    },
    'health: response time < 500ms': () => duration < 500,
  });

  if (success) {
    successfulRequests.add(1);
    errorRate.add(0);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
  }
}

/**
 * Test readiness endpoint
 */
function testReadinessEndpoint() {
  const response = http.get(`${BASE_URL}/ready`, { headers, tags: { name: 'ready' } });

  const success = check(response, {
    'ready: status is 200': (r) => r.status === 200,
    'ready: has checks field': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.checks !== undefined;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successfulRequests.add(1);
    errorRate.add(0);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
  }
}

/**
 * Test liveness endpoint
 */
function testLivenessEndpoint() {
  const response = http.get(`${BASE_URL}/live`, { headers, tags: { name: 'live' } });

  const success = check(response, {
    'live: status is 200': (r) => r.status === 200,
    'live: status is alive': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.status === 'alive';
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successfulRequests.add(1);
    errorRate.add(0);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
  }
}

/**
 * Test metrics endpoint (Prometheus)
 */
function testMetricsEndpoint() {
  const start = Date.now();
  const response = http.get(`${BASE_URL}/metrics`, { headers, tags: { name: 'metrics' } });
  const duration = Date.now() - start;

  apiRequestDuration.add(duration);

  const success = check(response, {
    'metrics: status is 200': (r) => r.status === 200,
    'metrics: contains prometheus format': (r) => {
      return r.body && r.body.includes('# HELP') && r.body.includes('# TYPE');
    },
    'metrics: contains medicalcor metrics': (r) => {
      return r.body && r.body.includes('medicalcor_');
    },
  });

  if (success) {
    successfulRequests.add(1);
    errorRate.add(0);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
  }
}

/**
 * Test circuit breakers endpoint
 */
function testCircuitBreakersEndpoint() {
  const start = Date.now();
  const response = http.get(`${BASE_URL}/health/circuit-breakers`, {
    headers,
    tags: { name: 'circuit-breakers' },
  });
  const duration = Date.now() - start;

  apiRequestDuration.add(duration);

  const success = check(response, {
    'circuit-breakers: status is 200': (r) => r.status === 200,
    'circuit-breakers: has services array': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.services);
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successfulRequests.add(1);
    errorRate.add(0);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
  }
}

/**
 * Test deep health check (less frequently)
 */
function testDeepHealthCheck() {
  // Only run deep health check occasionally to avoid overload
  if (Math.random() > 0.2) return;

  const start = Date.now();
  const response = http.get(`${BASE_URL}/health/deep`, { headers, tags: { name: 'health-deep' } });
  const duration = Date.now() - start;

  apiRequestDuration.add(duration);

  const success = check(response, {
    'health/deep: status is 200 or 503': (r) => r.status === 200 || r.status === 503,
    'health/deep: has dependencies': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.dependencies);
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successfulRequests.add(1);
    errorRate.add(0);
  } else {
    failedRequests.add(1);
    errorRate.add(1);
  }
}

/**
 * Setup function - runs once before test
 */
export function setup() {
  console.log(`Starting ${SCENARIO} test against ${BASE_URL}`);

  // Verify the API is reachable
  const response = http.get(`${BASE_URL}/health`);
  if (response.status !== 200) {
    console.warn(`Warning: Health check returned ${response.status}`);
  }

  return { startTime: Date.now() };
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`Test completed in ${duration.toFixed(2)} seconds`);
}

/**
 * Handle summary generation
 */
export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: SCENARIO,
    baseUrl: BASE_URL,
    metrics: {
      totalRequests: data.metrics.http_reqs.values.count,
      successRate: (1 - data.metrics.errors.values.rate) * 100,
      avgDuration: data.metrics.http_req_duration.values.avg,
      p95Duration: data.metrics.http_req_duration.values['p(95)'],
      p99Duration: data.metrics.http_req_duration.values['p(99)'],
    },
    thresholds: Object.entries(data.metrics).reduce((acc, [name, metric]) => {
      if (metric.thresholds) {
        acc[name] = Object.entries(metric.thresholds).map(([threshold, passed]) => ({
          threshold,
          passed,
        }));
      }
      return acc;
    }, {}),
  };

  return {
    stdout: JSON.stringify(summary, null, 2) + '\n',
    'summary.json': JSON.stringify(summary, null, 2),
  };
}
