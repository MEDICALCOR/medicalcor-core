/**
 * K6 Load Testing Script for RLS (Row-Level Security) Performance
 *
 * This script validates that PostgreSQL RLS policies maintain acceptable
 * performance under load, measuring query latency across different
 * multi-tenant isolation patterns.
 *
 * RLS Patterns Tested:
 * - clinic_id isolation (multi-tenant data separation)
 * - user_id isolation (user-specific data access)
 * - phone-based lookups (consent/message queries)
 * - admin bypass (system-level access)
 *
 * Usage:
 *   k6 run scripts/k6/rls-performance.js
 *   k6 run --env SCENARIO=load scripts/k6/rls-performance.js
 *   k6 run --env BASE_URL=https://staging-api.medicalcor.ro scripts/k6/rls-performance.js
 *
 * Available scenarios:
 *   - baseline: Quick 30-second test to establish baseline metrics
 *   - smoke: 1-minute test with 5 VUs
 *   - load: 5-minute test ramping to 50 VUs
 *   - stress: 10-minute test ramping to 100 VUs
 *   - soak: 30-minute sustained load for detecting memory leaks/degradation
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// =============================================================================
// CUSTOM METRICS FOR RLS PERFORMANCE
// =============================================================================

// Error tracking
const errorRate = new Rate('rls_errors');
const rlsViolations = new Counter('rls_violations');

// Query latency by RLS pattern
const clinicIdQueryDuration = new Trend('rls_clinic_id_query_duration', true);
const userIdQueryDuration = new Trend('rls_user_id_query_duration', true);
const phoneQueryDuration = new Trend('rls_phone_query_duration', true);
const adminQueryDuration = new Trend('rls_admin_query_duration', true);
const noRlsQueryDuration = new Trend('rls_bypass_query_duration', true);

// Comparative metrics
const successfulQueries = new Counter('rls_successful_queries');
const failedQueries = new Counter('rls_failed_queries');

// Table-specific metrics
const usersTableDuration = new Trend('rls_users_table_duration', true);
const consentRecordsDuration = new Trend('rls_consent_records_duration', true);
const messageLogDuration = new Trend('rls_message_log_duration', true);
const leadScoringDuration = new Trend('rls_lead_scoring_duration', true);

// =============================================================================
// CONFIGURATION
// =============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SCENARIO = __ENV.SCENARIO || 'smoke';
const API_KEY = __ENV.API_SECRET_KEY || 'test-api-key';

// Test data - simulated multi-tenant identifiers
const TEST_CLINICS = [
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  '33333333-3333-3333-3333-333333333333',
  '44444444-4444-4444-4444-444444444444',
  '55555555-5555-5555-5555-555555555555',
];

const TEST_USERS = [
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
];

const TEST_PHONES = [
  '+40721111111',
  '+40722222222',
  '+40723333333',
  '+40724444444',
  '+40725555555',
];

// =============================================================================
// SCENARIO DEFINITIONS
// =============================================================================

const scenarios = {
  baseline: {
    executor: 'constant-vus',
    vus: 1,
    duration: '30s',
    gracefulStop: '5s',
    tags: { testType: 'baseline' },
  },
  smoke: {
    executor: 'constant-vus',
    vus: 5,
    duration: '1m',
    gracefulStop: '10s',
    tags: { testType: 'smoke' },
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },
      { duration: '1m', target: 25 },
      { duration: '2m', target: 50 },
      { duration: '1m', target: 50 },
      { duration: '30s', target: 0 },
    ],
    gracefulStop: '30s',
    tags: { testType: 'load' },
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '1m', target: 25 },
      { duration: '2m', target: 50 },
      { duration: '3m', target: 100 },
      { duration: '3m', target: 100 },
      { duration: '1m', target: 0 },
    ],
    gracefulStop: '30s',
    tags: { testType: 'stress' },
  },
  soak: {
    executor: 'constant-vus',
    vus: 25,
    duration: '30m',
    gracefulStop: '1m',
    tags: { testType: 'soak' },
  },
};

// =============================================================================
// K6 OPTIONS
// =============================================================================

export const options = {
  scenarios: {
    default: scenarios[SCENARIO] || scenarios.smoke,
  },
  thresholds: {
    // Overall error rate
    rls_errors: ['rate<0.01'], // < 1% error rate

    // RLS pattern thresholds (p95 in ms)
    rls_clinic_id_query_duration: ['p(95)<100', 'p(99)<200'],
    rls_user_id_query_duration: ['p(95)<100', 'p(99)<200'],
    rls_phone_query_duration: ['p(95)<150', 'p(99)<300'],
    rls_admin_query_duration: ['p(95)<50', 'p(99)<100'],
    rls_bypass_query_duration: ['p(95)<30', 'p(99)<50'],

    // Table-specific thresholds
    rls_users_table_duration: ['p(95)<100'],
    rls_consent_records_duration: ['p(95)<150'],
    rls_message_log_duration: ['p(95)<200'],
    rls_lead_scoring_duration: ['p(95)<150'],

    // RLS overhead should not exceed 50% compared to non-RLS queries
    rls_overhead_percentage: ['value<50'],

    // Standard HTTP thresholds
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
  },
  tags: {
    environment: __ENV.ENVIRONMENT || 'local',
    testType: SCENARIO,
    testCategory: 'rls-performance',
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Generate request headers with RLS context
 */
function getHeaders(rlsContext = {}) {
  return {
    'Content-Type': 'application/json',
    'X-API-Key': API_KEY,
    'User-Agent': 'K6-RLS-LoadTest/1.0',
    // RLS context headers (processed by API to set PostgreSQL session variables)
    ...(rlsContext.clinicId && { 'X-Clinic-ID': rlsContext.clinicId }),
    ...(rlsContext.userId && { 'X-User-ID': rlsContext.userId }),
    ...(rlsContext.phone && { 'X-Phone': rlsContext.phone }),
    ...(rlsContext.isAdmin && { 'X-Admin-Access': 'true' }),
    ...(rlsContext.isSystem && { 'X-System-Access': 'true' }),
  };
}

/**
 * Random element from array
 */
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Execute RLS query and record metrics
 */
function executeRlsQuery(endpoint, rlsContext, metricTrend, queryName) {
  const start = Date.now();
  const headers = getHeaders(rlsContext);

  const response = http.get(`${BASE_URL}${endpoint}`, {
    headers,
    tags: { name: queryName, rlsPattern: rlsContext.pattern || 'unknown' },
  });

  const duration = Date.now() - start;
  metricTrend.add(duration);

  const success = check(response, {
    [`${queryName}: status is 200`]: (r) => r.status === 200,
    [`${queryName}: response time < 500ms`]: () => duration < 500,
    [`${queryName}: valid JSON response`]: (r) => {
      try {
        JSON.parse(r.body);
        return true;
      } catch {
        return false;
      }
    },
  });

  if (success) {
    successfulQueries.add(1);
    errorRate.add(0);
  } else {
    failedQueries.add(1);
    errorRate.add(1);

    // Check for RLS violation (403 Forbidden)
    if (response.status === 403) {
      rlsViolations.add(1);
    }
  }

  return { response, duration, success };
}

// =============================================================================
// TEST FUNCTIONS
// =============================================================================

/**
 * Test clinic_id based RLS isolation
 * Simulates multi-tenant queries where data is filtered by clinic
 */
function testClinicIdRls() {
  const clinicId = randomChoice(TEST_CLINICS);

  // Test users table with clinic isolation
  executeRlsQuery(
    '/rls-test/users',
    { clinicId, pattern: 'clinic_id' },
    clinicIdQueryDuration,
    'clinic_id_users'
  );

  // Test consent records with clinic isolation
  executeRlsQuery(
    '/rls-test/consent-records',
    { clinicId, pattern: 'clinic_id' },
    clinicIdQueryDuration,
    'clinic_id_consents'
  );

  // Test message log with clinic isolation
  executeRlsQuery(
    '/rls-test/messages',
    { clinicId, pattern: 'clinic_id' },
    clinicIdQueryDuration,
    'clinic_id_messages'
  );
}

/**
 * Test user_id based RLS isolation
 * Simulates user-specific data access (sessions, MFA, encrypted data)
 */
function testUserIdRls() {
  const userId = randomChoice(TEST_USERS);
  const clinicId = randomChoice(TEST_CLINICS);

  // Test sessions table
  executeRlsQuery(
    '/rls-test/sessions',
    { userId, clinicId, pattern: 'user_id' },
    userIdQueryDuration,
    'user_id_sessions'
  );

  // Test MFA secrets
  executeRlsQuery(
    '/rls-test/mfa-secrets',
    { userId, clinicId, pattern: 'user_id' },
    userIdQueryDuration,
    'user_id_mfa'
  );

  // Test encrypted data
  executeRlsQuery(
    '/rls-test/encrypted-data',
    { userId, clinicId, pattern: 'user_id' },
    userIdQueryDuration,
    'user_id_encrypted'
  );
}

/**
 * Test phone-based RLS lookups
 * Simulates consent and message queries filtered by phone number
 */
function testPhoneRls() {
  const phone = randomChoice(TEST_PHONES);
  const clinicId = randomChoice(TEST_CLINICS);

  // Test consent records by phone
  const result1 = executeRlsQuery(
    `/rls-test/consent-records?phone=${encodeURIComponent(phone)}`,
    { phone, clinicId, pattern: 'phone' },
    phoneQueryDuration,
    'phone_consents'
  );
  consentRecordsDuration.add(result1.duration);

  // Test message log by phone
  const result2 = executeRlsQuery(
    `/rls-test/messages?phone=${encodeURIComponent(phone)}`,
    { phone, clinicId, pattern: 'phone' },
    phoneQueryDuration,
    'phone_messages'
  );
  messageLogDuration.add(result2.duration);

  // Test lead scoring history by phone
  const result3 = executeRlsQuery(
    `/rls-test/lead-scoring?phone=${encodeURIComponent(phone)}`,
    { phone, clinicId, pattern: 'phone' },
    phoneQueryDuration,
    'phone_lead_scoring'
  );
  leadScoringDuration.add(result3.duration);
}

/**
 * Test admin access (RLS bypass for privileged users)
 */
function testAdminRls() {
  const userId = randomChoice(TEST_USERS);

  // Admin access to users table
  const result1 = executeRlsQuery(
    '/rls-test/users',
    { userId, isAdmin: true, pattern: 'admin' },
    adminQueryDuration,
    'admin_users'
  );
  usersTableDuration.add(result1.duration);

  // Admin access to all consent records
  executeRlsQuery(
    '/rls-test/consent-records',
    { userId, isAdmin: true, pattern: 'admin' },
    adminQueryDuration,
    'admin_consents'
  );

  // Admin access to sensitive logs
  executeRlsQuery(
    '/rls-test/sensitive-logs',
    { userId, isAdmin: true, pattern: 'admin' },
    adminQueryDuration,
    'admin_sensitive_logs'
  );
}

/**
 * Test baseline queries without RLS (for overhead comparison)
 * Uses system context to bypass RLS
 */
function testNoRlsBaseline() {
  // System-level query (RLS bypassed)
  const result = executeRlsQuery(
    '/rls-test/baseline',
    { isSystem: true, pattern: 'no_rls' },
    noRlsQueryDuration,
    'baseline_no_rls'
  );

  // Calculate overhead if we have both measurements
  if (__ITER > 0 && result.duration > 0) {
    // We'll calculate this in the summary
  }
}

/**
 * Test cross-tenant isolation (should return 0 results or 403)
 */
function testCrossTenantIsolation() {
  const clinicId = randomChoice(TEST_CLINICS);
  const otherClinicId = TEST_CLINICS.find((id) => id !== clinicId) || clinicId;

  // Request data from clinic A while authenticated as clinic B
  const response = http.get(`${BASE_URL}/rls-test/users?targetClinic=${otherClinicId}`, {
    headers: getHeaders({ clinicId, pattern: 'cross_tenant' }),
    tags: { name: 'cross_tenant_test' },
  });

  const isolated = check(response, {
    'cross_tenant: correctly isolated (no data or 403)': (r) => {
      if (r.status === 403) return true;
      try {
        const body = JSON.parse(r.body);
        return Array.isArray(body.rows) && body.rows.length === 0;
      } catch {
        return false;
      }
    },
  });

  if (!isolated) {
    rlsViolations.add(1);
    console.error('RLS VIOLATION: Cross-tenant data exposure detected!');
  }
}

// =============================================================================
// MAIN TEST FUNCTION
// =============================================================================

export default function () {
  group('Clinic ID RLS', function () {
    testClinicIdRls();
  });

  group('User ID RLS', function () {
    testUserIdRls();
  });

  group('Phone-based RLS', function () {
    testPhoneRls();
  });

  group('Admin Access RLS', function () {
    testAdminRls();
  });

  group('Baseline (No RLS)', function () {
    testNoRlsBaseline();
  });

  group('Cross-Tenant Isolation', function () {
    testCrossTenantIsolation();
  });

  // Variable sleep between iterations
  sleep(Math.random() * 1 + 0.5); // 0.5-1.5 seconds
}

// =============================================================================
// SETUP & TEARDOWN
// =============================================================================

export function setup() {
  console.log(`\n${'='.repeat(60)}`);
  console.log('  RLS Performance Load Test');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Scenario: ${SCENARIO}`);
  console.log(`  Base URL: ${BASE_URL}`);
  console.log(`  Test Clinics: ${TEST_CLINICS.length}`);
  console.log(`  Test Users: ${TEST_USERS.length}`);
  console.log(`  Test Phones: ${TEST_PHONES.length}`);
  console.log(`${'='.repeat(60)}\n`);

  // Verify API is reachable
  const response = http.get(`${BASE_URL}/health`);
  if (response.status !== 200) {
    console.warn(`Warning: Health check returned ${response.status}`);
  }

  // Verify RLS test endpoints exist
  const rlsTestResponse = http.get(`${BASE_URL}/rls-test/health`, {
    headers: getHeaders({ isSystem: true }),
  });
  if (rlsTestResponse.status !== 200) {
    console.warn('Warning: RLS test endpoints may not be available');
  }

  return {
    startTime: Date.now(),
    scenario: SCENARIO,
  };
}

export function teardown(data) {
  const duration = (Date.now() - data.startTime) / 1000;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Test completed in ${duration.toFixed(2)} seconds`);
  console.log(`${'='.repeat(60)}\n`);
}

// =============================================================================
// SUMMARY HANDLER
// =============================================================================

export function handleSummary(data) {
  // Extract RLS-specific metrics
  const rlsMetrics = {
    clinicIdP95: data.metrics.rls_clinic_id_query_duration?.values?.['p(95)'] || 0,
    userIdP95: data.metrics.rls_user_id_query_duration?.values?.['p(95)'] || 0,
    phoneP95: data.metrics.rls_phone_query_duration?.values?.['p(95)'] || 0,
    adminP95: data.metrics.rls_admin_query_duration?.values?.['p(95)'] || 0,
    noRlsP95: data.metrics.rls_bypass_query_duration?.values?.['p(95)'] || 0,
  };

  // Calculate RLS overhead percentage
  const avgRlsP95 =
    (rlsMetrics.clinicIdP95 + rlsMetrics.userIdP95 + rlsMetrics.phoneP95) / 3;
  const overheadPercentage =
    rlsMetrics.noRlsP95 > 0
      ? ((avgRlsP95 - rlsMetrics.noRlsP95) / rlsMetrics.noRlsP95) * 100
      : 0;

  // Build summary report
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: SCENARIO,
    baseUrl: BASE_URL,
    testCategory: 'rls-performance',

    // RLS-specific metrics
    rlsMetrics: {
      clinicIdIsolation: {
        p50: data.metrics.rls_clinic_id_query_duration?.values?.med || 0,
        p95: rlsMetrics.clinicIdP95,
        p99: data.metrics.rls_clinic_id_query_duration?.values?.['p(99)'] || 0,
        avg: data.metrics.rls_clinic_id_query_duration?.values?.avg || 0,
      },
      userIdIsolation: {
        p50: data.metrics.rls_user_id_query_duration?.values?.med || 0,
        p95: rlsMetrics.userIdP95,
        p99: data.metrics.rls_user_id_query_duration?.values?.['p(99)'] || 0,
        avg: data.metrics.rls_user_id_query_duration?.values?.avg || 0,
      },
      phoneLookup: {
        p50: data.metrics.rls_phone_query_duration?.values?.med || 0,
        p95: rlsMetrics.phoneP95,
        p99: data.metrics.rls_phone_query_duration?.values?.['p(99)'] || 0,
        avg: data.metrics.rls_phone_query_duration?.values?.avg || 0,
      },
      adminBypass: {
        p50: data.metrics.rls_admin_query_duration?.values?.med || 0,
        p95: rlsMetrics.adminP95,
        p99: data.metrics.rls_admin_query_duration?.values?.['p(99)'] || 0,
        avg: data.metrics.rls_admin_query_duration?.values?.avg || 0,
      },
      noRlsBaseline: {
        p50: data.metrics.rls_bypass_query_duration?.values?.med || 0,
        p95: rlsMetrics.noRlsP95,
        p99: data.metrics.rls_bypass_query_duration?.values?.['p(99)'] || 0,
        avg: data.metrics.rls_bypass_query_duration?.values?.avg || 0,
      },
    },

    // Table-specific metrics
    tableMetrics: {
      users: {
        p95: data.metrics.rls_users_table_duration?.values?.['p(95)'] || 0,
      },
      consentRecords: {
        p95: data.metrics.rls_consent_records_duration?.values?.['p(95)'] || 0,
      },
      messageLog: {
        p95: data.metrics.rls_message_log_duration?.values?.['p(95)'] || 0,
      },
      leadScoring: {
        p95: data.metrics.rls_lead_scoring_duration?.values?.['p(95)'] || 0,
      },
    },

    // Overhead analysis
    overhead: {
      percentage: Math.round(overheadPercentage * 100) / 100,
      acceptable: overheadPercentage < 50,
      avgRlsP95: Math.round(avgRlsP95 * 100) / 100,
      baselineP95: Math.round(rlsMetrics.noRlsP95 * 100) / 100,
    },

    // Security metrics
    security: {
      rlsViolations: data.metrics.rls_violations?.values?.count || 0,
      crossTenantIsolationVerified: (data.metrics.rls_violations?.values?.count || 0) === 0,
    },

    // Summary stats
    summary: {
      totalQueries: (data.metrics.rls_successful_queries?.values?.count || 0) +
        (data.metrics.rls_failed_queries?.values?.count || 0),
      successfulQueries: data.metrics.rls_successful_queries?.values?.count || 0,
      failedQueries: data.metrics.rls_failed_queries?.values?.count || 0,
      errorRate: data.metrics.rls_errors?.values?.rate || 0,
    },

    // Threshold results
    thresholds: {},
  };

  // Add threshold results
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (metric.thresholds) {
      summary.thresholds[name] = Object.entries(metric.thresholds).map(
        ([threshold, passed]) => ({
          threshold,
          passed: passed.ok ?? passed,
        })
      );
    }
  }

  // Check if all thresholds passed
  summary.thresholdsPassed = Object.values(data.metrics).every((metric) => {
    if (!metric.thresholds) return true;
    return Object.values(metric.thresholds).every((result) => result.ok ?? result);
  });

  // Generate console output
  const consoleOutput = `
${'='.repeat(60)}
  RLS PERFORMANCE TEST RESULTS
${'='.repeat(60)}

SCENARIO: ${SCENARIO}
TIMESTAMP: ${summary.timestamp}
STATUS: ${summary.thresholdsPassed ? '✅ PASSED' : '❌ FAILED'}

QUERY LATENCY (p95 in ms):
  clinic_id isolation:  ${rlsMetrics.clinicIdP95.toFixed(2)} ms
  user_id isolation:    ${rlsMetrics.userIdP95.toFixed(2)} ms
  phone lookup:         ${rlsMetrics.phoneP95.toFixed(2)} ms
  admin bypass:         ${rlsMetrics.adminP95.toFixed(2)} ms
  no RLS baseline:      ${rlsMetrics.noRlsP95.toFixed(2)} ms

RLS OVERHEAD:
  Average overhead:     ${summary.overhead.percentage.toFixed(2)}%
  Acceptable (<50%):    ${summary.overhead.acceptable ? '✅ YES' : '❌ NO'}

SECURITY:
  RLS violations:       ${summary.security.rlsViolations}
  Tenant isolation:     ${summary.security.crossTenantIsolationVerified ? '✅ VERIFIED' : '❌ FAILED'}

SUMMARY:
  Total queries:        ${summary.summary.totalQueries}
  Successful:           ${summary.summary.successfulQueries}
  Failed:               ${summary.summary.failedQueries}
  Error rate:           ${(summary.summary.errorRate * 100).toFixed(2)}%

${'='.repeat(60)}
`;

  console.log(consoleOutput);

  return {
    stdout: consoleOutput,
    'rls-performance-summary.json': JSON.stringify(summary, null, 2),
  };
}
