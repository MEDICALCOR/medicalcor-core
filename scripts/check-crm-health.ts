#!/usr/bin/env tsx
/**
 * CRM Health Check Script
 *
 * CLI tool to verify CRM connectivity and health status.
 * Useful for CI/CD pipelines, monitoring, and debugging.
 *
 * Features:
 * - Comprehensive health check with detailed output
 * - CI-friendly exit codes
 * - JSON and human-readable output formats
 * - Configurable timeout and thresholds
 * - Environment variable support
 *
 * Usage:
 *   pnpm tsx scripts/check-crm-health.ts
 *   pnpm tsx scripts/check-crm-health.ts --json
 *   pnpm tsx scripts/check-crm-health.ts --timeout=10000
 *   pnpm crm:health
 *
 * Exit Codes:
 *   0 - CRM is healthy
 *   1 - CRM is degraded (warning)
 *   2 - CRM is unhealthy (error)
 *   3 - Configuration error
 */

import { getCRMProvider, resetCRMProvider } from '@medicalcor/integrations';
import {
  CrmHealthCheckService,
  formatCrmHealthResult,
  type CrmHealthResult,
} from '@medicalcor/infra';

// =============================================================================
// Types
// =============================================================================

interface CliOptions {
  /** Output format */
  format: 'text' | 'json';
  /** Health check timeout in ms */
  timeout: number;
  /** Degraded latency threshold in ms */
  degradedThreshold: number;
  /** Unhealthy latency threshold in ms */
  unhealthyThreshold: number;
  /** Enable verbose output */
  verbose: boolean;
  /** Treat degraded as failure */
  strictMode: boolean;
}

// =============================================================================
// Configuration
// =============================================================================

const DEFAULT_OPTIONS: CliOptions = {
  format: 'text',
  timeout: 5000,
  degradedThreshold: 2000,
  unhealthyThreshold: 5000,
  verbose: false,
  strictMode: false,
};

// =============================================================================
// Argument Parsing
// =============================================================================

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: CliOptions = { ...DEFAULT_OPTIONS };

  for (const arg of args) {
    if (arg === '--json') {
      options.format = 'json';
    } else if (arg === '-v' || arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--strict') {
      options.strictMode = true;
    } else if (arg.startsWith('--timeout=')) {
      const value = parseInt(arg.split('=')[1] ?? '', 10);
      if (!isNaN(value) && value > 0) {
        options.timeout = value;
      }
    } else if (arg.startsWith('--degraded-threshold=')) {
      const value = parseInt(arg.split('=')[1] ?? '', 10);
      if (!isNaN(value) && value > 0) {
        options.degradedThreshold = value;
      }
    } else if (arg.startsWith('--unhealthy-threshold=')) {
      const value = parseInt(arg.split('=')[1] ?? '', 10);
      if (!isNaN(value) && value > 0) {
        options.unhealthyThreshold = value;
      }
    } else if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  // Override from environment variables
  if (process.env.CRM_HEALTH_TIMEOUT) {
    const value = parseInt(process.env.CRM_HEALTH_TIMEOUT, 10);
    if (!isNaN(value) && value > 0) {
      options.timeout = value;
    }
  }

  if (process.env.CRM_HEALTH_FORMAT === 'json') {
    options.format = 'json';
  }

  if (process.env.CRM_HEALTH_STRICT === 'true') {
    options.strictMode = true;
  }

  return options;
}

function printHelp(): void {
  console.log(`
CRM Health Check Tool

Usage:
  pnpm tsx scripts/check-crm-health.ts [options]

Options:
  --json                      Output in JSON format
  -v, --verbose               Enable verbose output
  --strict                    Treat degraded status as failure
  --timeout=<ms>              Health check timeout (default: 5000)
  --degraded-threshold=<ms>   Latency threshold for degraded (default: 2000)
  --unhealthy-threshold=<ms>  Latency threshold for unhealthy (default: 5000)
  -h, --help                  Show this help message

Environment Variables:
  CRM_PROVIDER                CRM provider to use (pipedrive, mock)
  CRM_MOCK_SCENARIO           Mock scenario (success, partial, error, slow, flaky)
  CRM_HEALTH_TIMEOUT          Health check timeout in ms
  CRM_HEALTH_FORMAT           Output format (text, json)
  CRM_HEALTH_STRICT           Treat degraded as failure (true/false)

Exit Codes:
  0  Healthy
  1  Degraded (warning)
  2  Unhealthy (error)
  3  Configuration error

Examples:
  # Basic health check
  pnpm tsx scripts/check-crm-health.ts

  # JSON output for CI/CD
  pnpm tsx scripts/check-crm-health.ts --json

  # Strict mode (fail on degraded)
  pnpm tsx scripts/check-crm-health.ts --strict

  # Test with mock CRM
  CRM_PROVIDER=mock pnpm tsx scripts/check-crm-health.ts

  # Test error scenarios
  CRM_PROVIDER=mock CRM_MOCK_SCENARIO=error pnpm tsx scripts/check-crm-health.ts
`);
}

// =============================================================================
// Output Formatting
// =============================================================================

function printTextResult(result: CrmHealthResult, options: CliOptions): void {
  console.log('\n================================================');
  console.log('  CRM Health Check Results');
  console.log('================================================\n');

  // Status with emoji
  const statusEmoji = {
    healthy: '✅',
    degraded: '⚠️',
    unhealthy: '❌',
  }[result.status];

  console.log(`Status:    ${statusEmoji} ${result.status.toUpperCase()}`);
  console.log(`Provider:  ${result.provider}`);
  console.log(`Latency:   ${result.latencyMs}ms`);
  console.log(`Timestamp: ${result.timestamp.toISOString()}`);

  if (result.message) {
    console.log(`Message:   ${result.message}`);
  }

  if (options.verbose) {
    console.log('\n--- Details ---');
    console.log(`Configured:    ${result.details.configured ? 'Yes' : 'No'}`);
    console.log(`API Connected: ${result.details.apiConnected ? 'Yes' : 'No'}`);
    console.log(`Authenticated: ${result.details.authenticated ? 'Yes' : 'No'}`);

    if (result.details.apiVersion) {
      console.log(`API Version:   ${result.details.apiVersion}`);
    }

    if (result.details.rateLimit) {
      console.log(
        `Rate Limit:    ${result.details.rateLimit.remaining}/${result.details.rateLimit.limit} remaining`
      );
    }

    if (result.details.lastSuccessfulCall) {
      console.log(`Last Success:  ${result.details.lastSuccessfulCall.toISOString()}`);
    }

    if (result.details.error) {
      console.log('\n--- Error Details ---');
      console.log(`Code:      ${result.details.error.code}`);
      console.log(`Message:   ${result.details.error.message}`);
      console.log(`Retryable: ${result.details.error.isRetryable ? 'Yes' : 'No'}`);
    }
  }

  console.log('\n================================================\n');
}

function printJsonResult(result: CrmHealthResult): void {
  console.log(
    JSON.stringify(
      {
        ...result,
        timestamp: result.timestamp.toISOString(),
        details: {
          ...result.details,
          lastSuccessfulCall: result.details.lastSuccessfulCall?.toISOString(),
          rateLimit: result.details.rateLimit
            ? {
                ...result.details.rateLimit,
                resetAt: result.details.rateLimit.resetAt?.toISOString(),
              }
            : undefined,
        },
      },
      null,
      2
    )
  );
}

// =============================================================================
// Main Execution
// =============================================================================

async function main(): Promise<void> {
  const startTime = Date.now();
  const options = parseArgs();

  // Log header for text mode
  if (options.format === 'text' && options.verbose) {
    console.log('\n🔍 Running CRM Health Check...');
    console.log(`   Provider: ${process.env.CRM_PROVIDER ?? 'pipedrive (default)'}`);
    console.log(`   Timeout:  ${options.timeout}ms`);
  }

  try {
    // Reset the singleton to ensure fresh state
    resetCRMProvider();

    // Get the CRM provider
    const crmProvider = getCRMProvider();

    // Create health check service
    const healthService = new CrmHealthCheckService({
      timeoutMs: options.timeout,
      degradedThresholdMs: options.degradedThreshold,
      unhealthyThresholdMs: options.unhealthyThreshold,
      providerName: 'crm',
      verbose: options.verbose,
    });

    // Execute health check
    const result = await healthService.check(crmProvider);

    // Output result
    if (options.format === 'json') {
      printJsonResult(result);
    } else {
      printTextResult(result, options);
    }

    // Determine exit code
    switch (result.status) {
      case 'healthy':
        process.exit(0);
        break;
      case 'degraded':
        if (options.strictMode) {
          if (options.format === 'text') {
            console.log('⚠️  Exiting with error due to --strict mode\n');
          }
          process.exit(1);
        }
        process.exit(0); // Degraded is still OK in non-strict mode
        break;
      case 'unhealthy':
        process.exit(2);
        break;
    }
  } catch (error) {
    // Handle configuration/initialization errors
    if (options.format === 'json') {
      console.log(
        JSON.stringify(
          {
            status: 'error',
            error: {
              code: 'CONFIGURATION_ERROR',
              message: error instanceof Error ? error.message : String(error),
            },
            timestamp: new Date().toISOString(),
            durationMs: Date.now() - startTime,
          },
          null,
          2
        )
      );
    } else {
      console.error('\n❌ CRM Health Check Failed');
      console.error(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      console.error(`   Duration: ${Date.now() - startTime}ms\n`);
    }

    process.exit(3);
  }
}

// Run
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(3);
});
