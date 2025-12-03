#!/usr/bin/env npx tsx
/**
 * Observability Stack Smoke Test
 *
 * Validates that OpenTelemetry instrumentation and metrics are flowing correctly by:
 * 1. Checking Prometheus metrics endpoint
 * 2. Verifying expected metrics are present
 * 3. Generating test traffic and checking metric updates
 * 4. Validating Grafana dashboard data sources (if available)
 *
 * Usage:
 *   npx tsx scripts/smoke-tests/observability-check.ts
 *   BASE_URL=https://staging-api.medicalcor.ro npx tsx scripts/smoke-tests/observability-check.ts
 */

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface MetricInfo {
  name: string;
  type: string;
  help: string;
  values: { labels: string; value: string }[];
}

const results: TestResult[] = [];

function logResult(result: TestResult): void {
  const icon = result.passed ? '\u2705' : '\u274c';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.details && Object.keys(result.details).length > 0) {
    console.log('   Details:', JSON.stringify(result.details, null, 2));
  }
  results.push(result);
}

function parsePrometheusMetrics(text: string): MetricInfo[] {
  const metrics: MetricInfo[] = [];
  const lines = text.split('\n');

  let currentMetric: MetricInfo | null = null;

  for (const line of lines) {
    if (line.startsWith('# HELP ')) {
      const match = line.match(/^# HELP (\S+) (.*)$/);
      if (match) {
        if (currentMetric) {
          metrics.push(currentMetric);
        }
        currentMetric = {
          name: match[1] ?? '',
          type: '',
          help: match[2] ?? '',
          values: [],
        };
      }
    } else if (line.startsWith('# TYPE ')) {
      const match = line.match(/^# TYPE (\S+) (\S+)$/);
      if (match && currentMetric && currentMetric.name === match[1]) {
        currentMetric.type = match[2] ?? '';
      }
    } else if (!line.startsWith('#') && line.trim()) {
      const match = line.match(/^(\S+?)(?:\{([^}]*)\})?\s+(.+)$/);
      if (match && currentMetric) {
        const metricName = match[1] ?? '';
        if (metricName === currentMetric.name || metricName.startsWith(`${currentMetric.name}_`)) {
          currentMetric.values.push({
            labels: match[2] ?? '',
            value: match[3] ?? '',
          });
        }
      }
    }
  }

  if (currentMetric) {
    metrics.push(currentMetric);
  }

  return metrics;
}

async function runTests(): Promise<void> {
  console.log('\n========================================');
  console.log('  Observability Stack Smoke Test');
  console.log('========================================\n');

  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const grafanaUrl = process.env.GRAFANA_URL || 'http://localhost:3002';

  console.log(`API Base URL: ${baseUrl}`);
  console.log(`Grafana URL: ${grafanaUrl}\n`);

  // Test 1: API Health Check
  console.log('--- Test 1: API Health Check ---');
  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();

    logResult({
      name: 'API Health',
      passed: healthResponse.ok && (healthData.status === 'ok' || healthData.status === 'degraded'),
      message: `Status: ${healthData.status}, HTTP: ${healthResponse.status}`,
      details: {
        version: healthData.version,
        uptime: healthData.uptime,
        checks: healthData.checks
          ? Object.entries(healthData.checks).map(([k, v]: [string, unknown]) => ({
              name: k,
              status: (v as Record<string, unknown>).status,
            }))
          : [],
      },
    });
  } catch (error) {
    logResult({
      name: 'API Health',
      passed: false,
      message: `Failed to reach API: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  // Test 2: Prometheus Metrics Endpoint
  console.log('\n--- Test 2: Prometheus Metrics Endpoint ---');
  let metricsText = '';
  try {
    const metricsResponse = await fetch(`${baseUrl}/metrics`);
    metricsText = await metricsResponse.text();

    const hasPrometheusFormat = metricsText.includes('# HELP') && metricsText.includes('# TYPE');

    logResult({
      name: 'Metrics Endpoint',
      passed: metricsResponse.ok && hasPrometheusFormat,
      message: hasPrometheusFormat
        ? 'Prometheus format metrics available'
        : 'Invalid metrics format',
      details: {
        contentLength: metricsText.length,
        lineCount: metricsText.split('\n').length,
      },
    });
  } catch (error) {
    logResult({
      name: 'Metrics Endpoint',
      passed: false,
      message: `Failed to fetch metrics: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  // Test 3: MedicalCor Custom Metrics
  console.log('\n--- Test 3: MedicalCor Custom Metrics ---');
  const expectedMetrics = [
    'medicalcor_',
    'http_request',
    'process_',
    'nodejs_',
  ];

  const foundMetrics: string[] = [];
  const missingMetrics: string[] = [];

  for (const metric of expectedMetrics) {
    if (metricsText.includes(metric)) {
      foundMetrics.push(metric);
    } else {
      missingMetrics.push(metric);
    }
  }

  logResult({
    name: 'Custom Metrics',
    passed: foundMetrics.includes('medicalcor_'),
    message: foundMetrics.includes('medicalcor_')
      ? `Found ${foundMetrics.length}/${expectedMetrics.length} metric prefixes`
      : 'MedicalCor custom metrics not found - check OpenTelemetry instrumentation',
    details: {
      found: foundMetrics,
      missing: missingMetrics,
    },
  });

  // Test 4: Parse and Analyze Metrics
  console.log('\n--- Test 4: Metrics Analysis ---');
  const metrics = parsePrometheusMetrics(metricsText);
  const medicalcorMetrics = metrics.filter((m) => m.name.startsWith('medicalcor_'));

  logResult({
    name: 'Metrics Analysis',
    passed: metrics.length > 0,
    message: `Total metrics: ${metrics.length}, MedicalCor metrics: ${medicalcorMetrics.length}`,
    details: {
      totalMetrics: metrics.length,
      medicalcorMetrics: medicalcorMetrics.map((m) => ({
        name: m.name,
        type: m.type,
        valueCount: m.values.length,
      })),
    },
  });

  // Test 5: Generate Traffic and Check Metrics Update
  console.log('\n--- Test 5: Traffic Generation & Metrics Update ---');
  try {
    // Make several requests to generate metrics
    const requests = Array(5).fill(null).map(() => fetch(`${baseUrl}/health`));
    await Promise.all(requests);

    // Wait a moment for metrics to update
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Fetch metrics again
    const updatedMetricsResponse = await fetch(`${baseUrl}/metrics`);
    const updatedMetricsText = await updatedMetricsResponse.text();

    // Check for HTTP request metrics
    const hasRequestMetrics =
      updatedMetricsText.includes('http_request') || updatedMetricsText.includes('http_requests_total');

    logResult({
      name: 'Traffic Metrics',
      passed: hasRequestMetrics,
      message: hasRequestMetrics
        ? 'HTTP request metrics are being recorded'
        : 'HTTP request metrics not found - check instrumentation',
    });
  } catch (error) {
    logResult({
      name: 'Traffic Metrics',
      passed: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  // Test 6: JSON Metrics Endpoint
  console.log('\n--- Test 6: JSON Metrics Endpoint ---');
  try {
    const jsonMetricsResponse = await fetch(`${baseUrl}/metrics/json`);
    const jsonMetrics = await jsonMetricsResponse.json();

    logResult({
      name: 'JSON Metrics',
      passed: jsonMetricsResponse.ok && typeof jsonMetrics === 'object',
      message: jsonMetricsResponse.ok ? 'JSON metrics endpoint available' : 'Failed to fetch',
      details: {
        metricCount: Array.isArray(jsonMetrics) ? jsonMetrics.length : Object.keys(jsonMetrics).length,
      },
    });
  } catch (error) {
    logResult({
      name: 'JSON Metrics',
      passed: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  // Test 7: Circuit Breaker Metrics
  console.log('\n--- Test 7: Circuit Breaker Status ---');
  try {
    const cbResponse = await fetch(`${baseUrl}/health/circuit-breakers`);
    const cbData = await cbResponse.json();

    const openCircuits = cbData.openCircuits || [];
    const services = cbData.services || [];

    logResult({
      name: 'Circuit Breakers',
      passed: cbResponse.ok,
      message: `${services.length} services monitored, ${openCircuits.length} circuits open`,
      details: {
        openCircuits,
        services: services.map((s: Record<string, unknown>) => ({
          name: s.name,
          state: s.state,
          successRate: s.successRate,
        })),
      },
    });
  } catch (error) {
    logResult({
      name: 'Circuit Breakers',
      passed: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  // Test 8: Grafana Connectivity (Optional)
  console.log('\n--- Test 8: Grafana Connectivity (Optional) ---');
  try {
    const grafanaResponse = await fetch(`${grafanaUrl}/api/health`, {
      headers: { 'Accept': 'application/json' },
    });

    if (grafanaResponse.ok) {
      const grafanaData = await grafanaResponse.json();
      logResult({
        name: 'Grafana Health',
        passed: true,
        message: `Grafana is healthy: ${grafanaData.database || 'connected'}`,
        details: grafanaData,
      });
    } else {
      logResult({
        name: 'Grafana Health',
        passed: true, // Optional, so pass even if not available
        message: `Grafana not available (HTTP ${grafanaResponse.status}) - this is optional`,
      });
    }
  } catch {
    logResult({
      name: 'Grafana Health',
      passed: true, // Optional check
      message: 'Grafana not reachable - this is optional for smoke tests',
    });
  }

  // Test 9: Memory Metrics
  console.log('\n--- Test 9: Memory & System Metrics ---');
  try {
    const healthResponse = await fetch(`${baseUrl}/health`);
    const healthData = await healthResponse.json();

    const memory = healthData.memory;
    const hasMemoryMetrics = memory && typeof memory.heapUsed === 'number';

    logResult({
      name: 'System Metrics',
      passed: hasMemoryMetrics,
      message: hasMemoryMetrics
        ? `Heap: ${memory.heapUsed}MB / ${memory.heapTotal}MB`
        : 'Memory metrics not available',
      details: memory,
    });
  } catch (error) {
    logResult({
      name: 'System Metrics',
      passed: false,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }

  // Summary
  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`\nTotal: ${results.length} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  // Determine overall status
  const criticalTests = ['API Health', 'Metrics Endpoint', 'Custom Metrics'];
  const criticalFailures = results.filter((r) => criticalTests.includes(r.name) && !r.passed);

  if (criticalFailures.length > 0) {
    console.log('\nCritical failures:');
    criticalFailures.forEach((r) => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
    console.log('\n\u274c Observability smoke test FAILED - OpenTelemetry may not be sending data\n');
    process.exit(1);
  }

  if (failed > 0) {
    console.log('\nNon-critical failures:');
    results.filter((r) => !r.passed).forEach((r) => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
    console.log('\n\u26a0\ufe0f Observability smoke test passed with warnings\n');
  } else {
    console.log('\n\u2705 All observability tests passed!\n');
  }
}

// Run tests
runTests().catch((error) => {
  console.error('\n\u274c Fatal error:', error);
  process.exit(1);
});
