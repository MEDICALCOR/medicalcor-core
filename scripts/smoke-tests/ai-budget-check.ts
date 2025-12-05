#!/usr/bin/env npx tsx
/**
 * AI Budget Controller Smoke Test
 *
 * Validates that the AI Budget Controller is functioning correctly by:
 * 1. Checking budget status
 * 2. Recording a test cost
 * 3. Verifying alerts are triggered at thresholds
 * 4. Checking Redis storage for budget data
 *
 * Usage:
 *   npx tsx scripts/smoke-tests/ai-budget-check.ts
 *   REDIS_URL=redis://localhost:6379 npx tsx scripts/smoke-tests/ai-budget-check.ts
 */

import { createSecureRedisClient } from '@medicalcor/core';
import {
  createAIBudgetController,
  type BudgetAlert,
  type BudgetCheckResult,
  type BudgetUsage,
} from '@medicalcor/core/ai-gateway/ai-budget-controller.js';
import { logger } from '@medicalcor/core/logger.js';

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

const results: TestResult[] = [];

function logResult(result: TestResult): void {
  const icon = result.passed ? '\u2705' : '\u274c';
  console.log(`${icon} ${result.name}: ${result.message}`);
  if (result.details) {
    console.log('   Details:', JSON.stringify(result.details, null, 2));
  }
  results.push(result);
}

async function runTests(): Promise<void> {
  console.log('\n========================================');
  console.log('  AI Budget Controller Smoke Test');
  console.log('========================================\n');

  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  console.log(`Redis URL: ${redisUrl.replace(/:[^:]*@/, ':***@')}\n`);

  let redis: Awaited<ReturnType<typeof createSecureRedisClient>> | null = null;

  try {
    // Test 1: Redis Connection
    console.log('--- Test 1: Redis Connection ---');
    try {
      redis = await createSecureRedisClient({ url: redisUrl });
      const pingResult = await redis.ping();
      logResult({
        name: 'Redis Connection',
        passed: pingResult === 'PONG',
        message:
          pingResult === 'PONG' ? 'Connected successfully' : `Unexpected response: ${pingResult}`,
      });
    } catch (error) {
      logResult({
        name: 'Redis Connection',
        passed: false,
        message: `Failed to connect: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });
      throw new Error('Cannot proceed without Redis connection');
    }

    // Test 2: Create Budget Controller
    console.log('\n--- Test 2: Create Budget Controller ---');
    const alertsReceived: BudgetAlert[] = [];
    const controller = createAIBudgetController(redis, {
      enabled: true,
      defaultDailyBudget: 10, // Low budget for testing
      defaultMonthlyBudget: 100,
      globalDailyBudget: 50,
      globalMonthlyBudget: 500,
      alertThresholds: [0.5, 0.75, 0.9],
      blockOnExceeded: true,
      onAlert: (alert) => {
        alertsReceived.push(alert);
        logger.info({ alert }, 'AI budget alert received');
      },
    });

    logResult({
      name: 'Budget Controller Creation',
      passed: true,
      message: 'Controller created with test configuration',
      details: controller.getConfig(),
    });

    // Test 3: Check Initial Budget Status
    console.log('\n--- Test 3: Check Initial Budget Status ---');
    const testUserId = `smoke-test-${Date.now()}`;
    const testTenantId = `tenant-smoke-${Date.now()}`;

    const initialCheck: BudgetCheckResult = await controller.checkBudget({
      userId: testUserId,
      tenantId: testTenantId,
      estimatedCost: 0.01,
      model: 'gpt-4o',
    });

    logResult({
      name: 'Initial Budget Check',
      passed: initialCheck.allowed && initialCheck.status === 'ok',
      message: `Budget check: allowed=${initialCheck.allowed}, status=${initialCheck.status}`,
      details: {
        remainingDaily: initialCheck.remainingDaily,
        remainingMonthly: initialCheck.remainingMonthly,
        estimatedCost: initialCheck.estimatedCost,
      },
    });

    if (initialCheck.allowed) {
      console.log('\u2714\ufe0f AI budget check passed');
    }

    // Test 4: Record a Cost
    console.log('\n--- Test 4: Record Cost ---');
    await controller.recordCost(0.05, {
      userId: testUserId,
      tenantId: testTenantId,
      model: 'gpt-4o',
      operation: 'smoke-test',
    });

    const usageAfterCost: BudgetUsage = await controller.getUsage('user', testUserId);

    logResult({
      name: 'Cost Recording',
      passed: usageAfterCost.dailySpend > 0,
      message: `Recorded spend: $${usageAfterCost.dailySpend.toFixed(4)}`,
      details: {
        dailySpend: usageAfterCost.dailySpend,
        monthlySpend: usageAfterCost.monthlySpend,
        dailyPercentUsed: usageAfterCost.dailyPercentUsed,
        status: usageAfterCost.status,
      },
    });

    // Test 5: Check Global Budget
    console.log('\n--- Test 5: Check Global Budget ---');
    const globalUsage: BudgetUsage = await controller.getUsage('global', 'global');

    logResult({
      name: 'Global Budget Status',
      passed: globalUsage.dailyBudget > 0,
      message: `Global daily budget: $${globalUsage.dailyBudget}`,
      details: {
        dailySpend: globalUsage.dailySpend,
        dailyBudget: globalUsage.dailyBudget,
        monthlySpend: globalUsage.monthlySpend,
        monthlyBudget: globalUsage.monthlyBudget,
        status: globalUsage.status,
      },
    });

    // Test 6: Verify Budget Limits Work
    console.log('\n--- Test 6: Test Budget Limit Enforcement ---');
    // Record enough cost to exceed the test user's daily budget ($10)
    for (let i = 0; i < 10; i++) {
      await controller.recordCost(1.5, {
        userId: testUserId,
        tenantId: testTenantId,
        model: 'gpt-4o',
        operation: 'smoke-test-stress',
      });
    }

    const checkAfterExceed: BudgetCheckResult = await controller.checkBudget({
      userId: testUserId,
      tenantId: testTenantId,
      estimatedCost: 1.0,
      model: 'gpt-4o',
    });

    logResult({
      name: 'Budget Limit Enforcement',
      passed: !checkAfterExceed.allowed && checkAfterExceed.status === 'exceeded',
      message: checkAfterExceed.allowed
        ? 'WARNING: Budget not enforced'
        : `Budget exceeded, request blocked: ${checkAfterExceed.reason}`,
      details: {
        allowed: checkAfterExceed.allowed,
        status: checkAfterExceed.status,
        reason: checkAfterExceed.reason,
        remainingDaily: checkAfterExceed.remainingDaily,
      },
    });

    // Test 7: Check Alerts Were Triggered
    console.log('\n--- Test 7: Budget Alerts ---');
    const activeAlerts = await controller.getActiveAlerts();

    logResult({
      name: 'Alert Generation',
      passed: alertsReceived.length > 0 || activeAlerts.length > 0,
      message: `Alerts received: ${alertsReceived.length}, Active alerts in Redis: ${activeAlerts.length}`,
      details: {
        alertsReceived: alertsReceived.map((a) => ({
          threshold: a.threshold,
          scope: a.scope,
          percentUsed: a.percentUsed,
        })),
      },
    });

    // Test 8: Check Spend by Model
    console.log('\n--- Test 8: Spend Tracking by Model ---');
    const finalUsage: BudgetUsage = await controller.getUsage('user', testUserId);

    logResult({
      name: 'Model Spend Tracking',
      passed: Object.keys(finalUsage.spendByModel).length > 0,
      message: `Tracking ${Object.keys(finalUsage.spendByModel).length} model(s)`,
      details: {
        spendByModel: finalUsage.spendByModel,
        spendByOperation: finalUsage.spendByOperation,
      },
    });

    // Cleanup: Remove test data from Redis
    console.log('\n--- Cleanup ---');
    const dailyKey = new Date().toISOString().split('T')[0];
    const monthlyKey = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

    const keysToClean = [
      `ai:budget:spend:user:${testUserId}:daily:${dailyKey}`,
      `ai:budget:spend:user:${testUserId}:monthly:${monthlyKey}`,
      `ai:budget:spend:tenant:${testTenantId}:daily:${dailyKey}`,
      `ai:budget:spend:tenant:${testTenantId}:monthly:${monthlyKey}`,
      `ai:budget:count:user:${testUserId}:daily:${dailyKey}`,
      `ai:budget:count:user:${testUserId}:monthly:${monthlyKey}`,
    ];

    for (const key of keysToClean) {
      await redis.del(key);
    }
    console.log(`Cleaned up ${keysToClean.length} test keys`);
  } finally {
    if (redis) {
      await redis.quit();
    }
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

  if (failed > 0) {
    console.log('\nFailed tests:');
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.name}: ${r.message}`);
      });
    process.exit(1);
  }

  console.log('\n\u2705 All AI Budget Controller tests passed!\n');
}

// Run tests
runTests().catch((error) => {
  console.error('\n\u274c Fatal error:', error);
  process.exit(1);
});
