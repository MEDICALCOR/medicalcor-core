/**
 * AI Budget Controller
 *
 * Monitors and controls AI spending with:
 * - Daily and monthly budget limits
 * - Alerts at 50%, 75%, 90% thresholds
 * - Per-user and per-tenant budgets
 * - Cost tracking by model and operation
 * - Automatic throttling when budget exceeded
 */

import { z } from 'zod';
import crypto from 'crypto';
import type { SecureRedisClient } from '../infrastructure/redis-client.js';
import { MODEL_PRICING } from './token-estimator.js';

/**
 * Budget alert thresholds
 */
export const ALERT_THRESHOLDS = [0.5, 0.75, 0.9] as const;
export type AlertThreshold = (typeof ALERT_THRESHOLDS)[number];

/**
 * Budget period
 */
export type BudgetPeriod = 'daily' | 'monthly';

/**
 * Budget status
 */
export type BudgetStatus = 'ok' | 'warning' | 'critical' | 'exceeded';

/**
 * Alert event
 */
export interface BudgetAlert {
  /** Alert ID */
  id: string;
  /** When alert was triggered */
  timestamp: Date;
  /** Budget scope (user, tenant, global) */
  scope: 'user' | 'tenant' | 'global';
  /** Scope ID (userId, tenantId, or 'global') */
  scopeId: string;
  /** Budget period */
  period: BudgetPeriod;
  /** Threshold that was crossed */
  threshold: AlertThreshold;
  /** Current spend */
  currentSpend: number;
  /** Budget limit */
  budgetLimit: number;
  /** Percentage used */
  percentUsed: number;
  /** Whether alert was acknowledged */
  acknowledged: boolean;
}

/**
 * Budget usage statistics
 */
export interface BudgetUsage {
  /** Scope (user, tenant, global) */
  scope: 'user' | 'tenant' | 'global';
  /** Scope ID */
  scopeId: string;
  /** Current period spend */
  dailySpend: number;
  /** Monthly spend */
  monthlySpend: number;
  /** Daily budget limit */
  dailyBudget: number;
  /** Monthly budget limit */
  monthlyBudget: number;
  /** Daily percentage used */
  dailyPercentUsed: number;
  /** Monthly percentage used */
  monthlyPercentUsed: number;
  /** Current status */
  status: BudgetStatus;
  /** Requests today */
  requestsToday: number;
  /** Requests this month */
  requestsThisMonth: number;
  /** Spend by model */
  spendByModel: Record<string, number>;
  /** Spend by operation type */
  spendByOperation: Record<string, number>;
  /** Daily reset time */
  dailyResetAt: Date;
  /** Monthly reset time */
  monthlyResetAt: Date;
}

/**
 * Budget check result
 */
export interface BudgetCheckResult {
  /** Whether request is allowed */
  allowed: boolean;
  /** Current status */
  status: BudgetStatus;
  /** Reason if blocked */
  reason?: string | undefined;
  /** Estimated cost of the request */
  estimatedCost: number;
  /** Remaining daily budget */
  remainingDaily: number;
  /** Remaining monthly budget */
  remainingMonthly: number;
  /** Alerts triggered by this check */
  alerts: BudgetAlert[];
}

/**
 * Configuration schema
 */
export const AIBudgetControllerConfigSchema = z.object({
  /** Enable budget control */
  enabled: z.boolean().default(true),
  /** Redis key prefix */
  keyPrefix: z.string().default('ai:budget:'),
  /** Default daily budget (USD) */
  defaultDailyBudget: z.number().min(0).default(50),
  /** Default monthly budget (USD) */
  defaultMonthlyBudget: z.number().min(0).default(1000),
  /** Global daily budget (USD) */
  globalDailyBudget: z.number().min(0).default(500),
  /** Global monthly budget (USD) */
  globalMonthlyBudget: z.number().min(0).default(10000),
  /** Alert thresholds (percentages) */
  alertThresholds: z.array(z.number().min(0).max(1)).default([0.5, 0.75, 0.9]),
  /** Block requests when budget exceeded */
  blockOnExceeded: z.boolean().default(true),
  /** Soft limit mode (warn but don't block) */
  softLimitMode: z.boolean().default(false),
  /** Alert callback */
  onAlert: z
    .function()
    .args(z.custom<BudgetAlert>())
    .returns(z.void().or(z.promise(z.void())))
    .optional(),
  /** Enable per-user budgets */
  enableUserBudgets: z.boolean().default(true),
  /** Enable per-tenant budgets */
  enableTenantBudgets: z.boolean().default(true),
});

export type AIBudgetControllerConfig = z.infer<typeof AIBudgetControllerConfigSchema>;

/**
 * Custom budget limits
 */
export interface CustomBudgetLimits {
  dailyBudget?: number;
  monthlyBudget?: number;
}

/**
 * AI Budget Controller
 */
export class AIBudgetController {
  private config: AIBudgetControllerConfig;
  private redis: SecureRedisClient;
  private alertsTriggered: Set<string> = new Set(); // Track triggered alerts to avoid duplicates
  private customLimits: Map<string, CustomBudgetLimits> = new Map();

  constructor(redis: SecureRedisClient, config: Partial<AIBudgetControllerConfig> = {}) {
    this.config = AIBudgetControllerConfigSchema.parse(config);
    this.redis = redis;
  }

  /**
   * Check if a request is allowed within budget
   */
  async checkBudget(
    options: {
      userId?: string;
      tenantId?: string;
      estimatedCost?: number;
      model?: string;
      estimatedTokens?: { input: number; output: number };
    } = {}
  ): Promise<BudgetCheckResult> {
    if (!this.config.enabled) {
      return {
        allowed: true,
        status: 'ok',
        estimatedCost: 0,
        remainingDaily: Infinity,
        remainingMonthly: Infinity,
        alerts: [],
      };
    }

    // Calculate estimated cost if not provided
    let estimatedCost = options.estimatedCost ?? 0;
    if (!estimatedCost && options.estimatedTokens) {
      const pricing = MODEL_PRICING[options.model ?? 'gpt-4o'] ?? MODEL_PRICING['gpt-4o']!;
      estimatedCost =
        (options.estimatedTokens.input / 1000) * pricing.input +
        (options.estimatedTokens.output / 1000) * pricing.output;
    }

    const alerts: BudgetAlert[] = [];
    let worstStatus: BudgetStatus = 'ok';
    let blockReason: string | undefined;
    let remainingDaily = Infinity;
    let remainingMonthly = Infinity;

    // Check global budget
    const globalUsage = await this.getUsage('global', 'global');
    const globalCheck = this.evaluateBudget(globalUsage, estimatedCost, 'global', 'global');
    alerts.push(...globalCheck.alerts);
    worstStatus = this.getWorstStatus(worstStatus, globalCheck.status);
    if (globalCheck.blocked) {
      blockReason = globalCheck.reason;
    }
    remainingDaily = Math.min(remainingDaily, globalUsage.dailyBudget - globalUsage.dailySpend);
    remainingMonthly = Math.min(
      remainingMonthly,
      globalUsage.monthlyBudget - globalUsage.monthlySpend
    );

    // Check tenant budget
    if (this.config.enableTenantBudgets && options.tenantId) {
      const tenantUsage = await this.getUsage('tenant', options.tenantId);
      const tenantCheck = this.evaluateBudget(
        tenantUsage,
        estimatedCost,
        'tenant',
        options.tenantId
      );
      alerts.push(...tenantCheck.alerts);
      worstStatus = this.getWorstStatus(worstStatus, tenantCheck.status);
      if (tenantCheck.blocked && !blockReason) {
        blockReason = tenantCheck.reason;
      }
      remainingDaily = Math.min(
        remainingDaily,
        tenantUsage.dailyBudget - tenantUsage.dailySpend
      );
      remainingMonthly = Math.min(
        remainingMonthly,
        tenantUsage.monthlyBudget - tenantUsage.monthlySpend
      );
    }

    // Check user budget
    if (this.config.enableUserBudgets && options.userId) {
      const userUsage = await this.getUsage('user', options.userId);
      const userCheck = this.evaluateBudget(userUsage, estimatedCost, 'user', options.userId);
      alerts.push(...userCheck.alerts);
      worstStatus = this.getWorstStatus(worstStatus, userCheck.status);
      if (userCheck.blocked && !blockReason) {
        blockReason = userCheck.reason;
      }
      remainingDaily = Math.min(remainingDaily, userUsage.dailyBudget - userUsage.dailySpend);
      remainingMonthly = Math.min(
        remainingMonthly,
        userUsage.monthlyBudget - userUsage.monthlySpend
      );
    }

    // Trigger alert callbacks
    for (const alert of alerts) {
      await this.triggerAlert(alert);
    }

    const allowed =
      !blockReason || this.config.softLimitMode || !this.config.blockOnExceeded;

    return {
      allowed,
      status: worstStatus,
      reason: blockReason,
      estimatedCost,
      remainingDaily: Math.max(0, remainingDaily),
      remainingMonthly: Math.max(0, remainingMonthly),
      alerts,
    };
  }

  /**
   * Record actual cost after a request completes
   */
  async recordCost(
    cost: number,
    options: {
      userId?: string;
      tenantId?: string;
      model?: string;
      operation?: string;
    } = {}
  ): Promise<void> {
    if (!this.config.enabled) return;

    const now = Date.now();
    const dailyKey = this.getDailyKey(now);
    const monthlyKey = this.getMonthlyKey(now);

    // Update global spend
    await this.incrementSpend('global', 'global', cost, dailyKey, monthlyKey);

    // Update model spend
    if (options.model) {
      await this.incrementModelSpend('global', 'global', options.model, cost);
    }

    // Update operation spend
    if (options.operation) {
      await this.incrementOperationSpend('global', 'global', options.operation, cost);
    }

    // Update tenant spend
    if (this.config.enableTenantBudgets && options.tenantId) {
      await this.incrementSpend('tenant', options.tenantId, cost, dailyKey, monthlyKey);
      if (options.model) {
        await this.incrementModelSpend('tenant', options.tenantId, options.model, cost);
      }
      if (options.operation) {
        await this.incrementOperationSpend('tenant', options.tenantId, options.operation, cost);
      }
    }

    // Update user spend
    if (this.config.enableUserBudgets && options.userId) {
      await this.incrementSpend('user', options.userId, cost, dailyKey, monthlyKey);
      if (options.model) {
        await this.incrementModelSpend('user', options.userId, options.model, cost);
      }
      if (options.operation) {
        await this.incrementOperationSpend('user', options.userId, options.operation, cost);
      }
    }
  }

  /**
   * Get budget usage for a scope
   * RESILIENCE: Uses Promise.allSettled with fallback defaults to prevent
   * Redis outages from blocking budget checks entirely
   */
  async getUsage(scope: 'user' | 'tenant' | 'global', scopeId: string): Promise<BudgetUsage> {
    const now = Date.now();
    const dailyKey = this.getDailyKey(now);
    const monthlyKey = this.getMonthlyKey(now);

    // RESILIENCE FIX: Use Promise.allSettled instead of Promise.all
    // If Redis has a temporary outage, we return default values instead of failing
    const results = await Promise.allSettled([
      this.getSpend(scope, scopeId, 'daily', dailyKey),
      this.getSpend(scope, scopeId, 'monthly', monthlyKey),
      this.getRequestCount(scope, scopeId, 'daily', dailyKey),
      this.getRequestCount(scope, scopeId, 'monthly', monthlyKey),
      this.getModelSpend(scope, scopeId),
      this.getOperationSpend(scope, scopeId),
    ]);

    // Extract values with fallback defaults for any failures
    const dailySpend = results[0].status === 'fulfilled' ? results[0].value : 0;
    const monthlySpend = results[1].status === 'fulfilled' ? results[1].value : 0;
    const requestsToday = results[2].status === 'fulfilled' ? results[2].value : 0;
    const requestsMonth = results[3].status === 'fulfilled' ? results[3].value : 0;
    const modelSpend = results[4].status === 'fulfilled' ? results[4].value : {};
    const opSpend = results[5].status === 'fulfilled' ? results[5].value : {};

    // Log any failures for monitoring
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length > 0) {
      // Note: In production, this would use the logger instead of console
      console.warn(`[AIBudgetController] ${failures.length} Redis queries failed, using defaults`);
    }

    const { dailyBudget, monthlyBudget } = this.getBudgetLimits(scope, scopeId);

    const dailyPercentUsed = dailyBudget > 0 ? dailySpend / dailyBudget : 0;
    const monthlyPercentUsed = monthlyBudget > 0 ? monthlySpend / monthlyBudget : 0;

    let status: BudgetStatus = 'ok';
    const maxPercent = Math.max(dailyPercentUsed, monthlyPercentUsed);
    if (maxPercent >= 1) status = 'exceeded';
    else if (maxPercent >= 0.9) status = 'critical';
    else if (maxPercent >= 0.75) status = 'warning';

    // Calculate reset times
    const dailyResetAt = this.getNextDailyReset();
    const monthlyResetAt = this.getNextMonthlyReset();

    return {
      scope,
      scopeId,
      dailySpend,
      monthlySpend,
      dailyBudget,
      monthlyBudget,
      dailyPercentUsed,
      monthlyPercentUsed,
      status,
      requestsToday,
      requestsThisMonth: requestsMonth,
      spendByModel: modelSpend,
      spendByOperation: opSpend,
      dailyResetAt,
      monthlyResetAt,
    };
  }

  /**
   * Set custom budget limits
   */
  setCustomLimits(
    scope: 'user' | 'tenant',
    scopeId: string,
    limits: CustomBudgetLimits
  ): void {
    const key = `${scope}:${scopeId}`;
    this.customLimits.set(key, limits);
  }

  /**
   * Get budget limits for a scope
   */
  getBudgetLimits(
    scope: 'user' | 'tenant' | 'global',
    scopeId: string
  ): { dailyBudget: number; monthlyBudget: number } {
    if (scope === 'global') {
      return {
        dailyBudget: this.config.globalDailyBudget,
        monthlyBudget: this.config.globalMonthlyBudget,
      };
    }

    const key = `${scope}:${scopeId}`;
    const custom = this.customLimits.get(key);

    return {
      dailyBudget: custom?.dailyBudget ?? this.config.defaultDailyBudget,
      monthlyBudget: custom?.monthlyBudget ?? this.config.defaultMonthlyBudget,
    };
  }

  /**
   * Get all active alerts
   */
  async getActiveAlerts(): Promise<BudgetAlert[]> {
    const alertsKey = `${this.config.keyPrefix}alerts`;
    const alertsJson = await this.redis.lrange(alertsKey, 0, 100);
    return alertsJson.map((json) => JSON.parse(json) as BudgetAlert);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string): Promise<void> {
    const alertsKey = `${this.config.keyPrefix}alerts`;
    const alerts = await this.getActiveAlerts();
    const updatedAlerts = alerts.map((alert) =>
      alert.id === alertId ? { ...alert, acknowledged: true } : alert
    );
    await this.redis.del(alertsKey);
    for (const alert of updatedAlerts) {
      await this.redis.rpush(alertsKey, JSON.stringify(alert));
    }
  }

  /**
   * Get spending summary
   */
  async getSpendingSummary(): Promise<{
    global: BudgetUsage;
    topTenants: BudgetUsage[];
    topUsers: BudgetUsage[];
  }> {
    const global = await this.getUsage('global', 'global');

    // In a real implementation, you'd track all tenant/user IDs and fetch their usage
    // For now, return empty arrays
    return {
      global,
      topTenants: [],
      topUsers: [],
    };
  }

  /**
   * Evaluate budget and generate alerts
   */
  private evaluateBudget(
    usage: BudgetUsage,
    estimatedCost: number,
    scope: 'user' | 'tenant' | 'global',
    scopeId: string
  ): { status: BudgetStatus; blocked: boolean; reason?: string; alerts: BudgetAlert[] } {
    const alerts: BudgetAlert[] = [];

    // Check if would exceed budget
    const wouldExceedDaily = usage.dailySpend + estimatedCost > usage.dailyBudget;
    const wouldExceedMonthly = usage.monthlySpend + estimatedCost > usage.monthlyBudget;

    // Generate threshold alerts
    for (const threshold of this.config.alertThresholds as number[]) {
      // Daily threshold
      const dailyPercent = (usage.dailySpend + estimatedCost) / usage.dailyBudget;
      if (dailyPercent >= threshold && usage.dailyPercentUsed < threshold) {
        const alert = this.createAlert(
          scope,
          scopeId,
          'daily',
          threshold as AlertThreshold,
          usage.dailySpend + estimatedCost,
          usage.dailyBudget
        );
        if (alert) alerts.push(alert);
      }

      // Monthly threshold
      const monthlyPercent = (usage.monthlySpend + estimatedCost) / usage.monthlyBudget;
      if (monthlyPercent >= threshold && usage.monthlyPercentUsed < threshold) {
        const alert = this.createAlert(
          scope,
          scopeId,
          'monthly',
          threshold as AlertThreshold,
          usage.monthlySpend + estimatedCost,
          usage.monthlyBudget
        );
        if (alert) alerts.push(alert);
      }
    }

    let status: BudgetStatus = 'ok';
    const maxPercent = Math.max(usage.dailyPercentUsed, usage.monthlyPercentUsed);
    if (wouldExceedDaily || wouldExceedMonthly) status = 'exceeded';
    else if (maxPercent >= 0.9) status = 'critical';
    else if (maxPercent >= 0.75) status = 'warning';

    const blocked = this.config.blockOnExceeded && (wouldExceedDaily || wouldExceedMonthly);

    const result: { status: BudgetStatus; blocked: boolean; reason?: string; alerts: BudgetAlert[] } = {
      status,
      blocked,
      alerts,
    };

    if (blocked) {
      result.reason = wouldExceedDaily
        ? `Daily budget exceeded for ${scope} ${scopeId}`
        : `Monthly budget exceeded for ${scope} ${scopeId}`;
    }

    return result;
  }

  /**
   * Create an alert
   */
  private createAlert(
    scope: 'user' | 'tenant' | 'global',
    scopeId: string,
    period: BudgetPeriod,
    threshold: AlertThreshold,
    currentSpend: number,
    budgetLimit: number
  ): BudgetAlert | null {
    const alertKey = `${scope}:${scopeId}:${period}:${threshold}:${this.getDailyKey(Date.now())}`;

    // Don't create duplicate alerts
    if (this.alertsTriggered.has(alertKey)) {
      return null;
    }

    this.alertsTriggered.add(alertKey);

    // SECURITY: Use crypto-secure randomness for alert IDs
    return {
      id: `alert-${Date.now()}-${crypto.randomUUID().slice(0, 12)}`,
      timestamp: new Date(),
      scope,
      scopeId,
      period,
      threshold,
      currentSpend,
      budgetLimit,
      percentUsed: currentSpend / budgetLimit,
      acknowledged: false,
    };
  }

  /**
   * Trigger alert callback
   */
  private async triggerAlert(alert: BudgetAlert): Promise<void> {
    // Store alert in Redis with TTL (7 days)
    const alertsKey = `${this.config.keyPrefix}alerts`;
    await this.redis.rpush(alertsKey, JSON.stringify(alert));
    await this.redis.expire(alertsKey, 86400 * 7); // 7 days TTL

    // Call custom alert handler
    if (this.config.onAlert) {
      try {
        await this.config.onAlert(alert);
      } catch {
        // Alert handler failed, continue silently
      }
    }
  }

  /**
   * Get worst status
   */
  private getWorstStatus(current: BudgetStatus, newStatus: BudgetStatus): BudgetStatus {
    const order: BudgetStatus[] = ['ok', 'warning', 'critical', 'exceeded'];
    return order.indexOf(newStatus) > order.indexOf(current) ? newStatus : current;
  }

  // Redis helper methods

  private async incrementSpend(
    scope: string,
    scopeId: string,
    amount: number,
    dailyKey: string,
    monthlyKey: string
  ): Promise<void> {
    const dailySpendKey = `${this.config.keyPrefix}spend:${scope}:${scopeId}:daily:${dailyKey}`;
    const monthlySpendKey = `${this.config.keyPrefix}spend:${scope}:${scopeId}:monthly:${monthlyKey}`;
    const dailyCountKey = `${this.config.keyPrefix}count:${scope}:${scopeId}:daily:${dailyKey}`;
    const monthlyCountKey = `${this.config.keyPrefix}count:${scope}:${scopeId}:monthly:${monthlyKey}`;

    // Store amounts as integers (cents * 100 for 4 decimal precision)
    const amountCents = Math.round(amount * 10000);

    await Promise.all([
      this.redis.incrbyWithExpire(dailySpendKey, amountCents, 86400 * 2), // 2 days TTL
      this.redis.incrbyWithExpire(monthlySpendKey, amountCents, 86400 * 35), // 35 days TTL
      this.redis.incrbyWithExpire(dailyCountKey, 1, 86400 * 2),
      this.redis.incrbyWithExpire(monthlyCountKey, 1, 86400 * 35),
    ]);
  }

  private async incrementModelSpend(
    scope: string,
    scopeId: string,
    model: string,
    amount: number
  ): Promise<void> {
    // Store as separate keys since hincrbyfloat isn't available
    const key = `${this.config.keyPrefix}model:${scope}:${scopeId}:${this.getMonthlyKey(Date.now())}:${model}`;
    const amountCents = Math.round(amount * 10000);
    await this.redis.incrbyWithExpire(key, amountCents, 86400 * 35);
  }

  private async incrementOperationSpend(
    scope: string,
    scopeId: string,
    operation: string,
    amount: number
  ): Promise<void> {
    // Store as separate keys
    const key = `${this.config.keyPrefix}op:${scope}:${scopeId}:${this.getMonthlyKey(Date.now())}:${operation}`;
    const amountCents = Math.round(amount * 10000);
    await this.redis.incrbyWithExpire(key, amountCents, 86400 * 35);
  }

  private async getSpend(
    scope: string,
    scopeId: string,
    period: 'daily' | 'monthly',
    periodKey: string
  ): Promise<number> {
    const key = `${this.config.keyPrefix}spend:${scope}:${scopeId}:${period}:${periodKey}`;
    const value = await this.redis.get(key);
    // Convert back from cents to dollars
    return (parseInt(value ?? '0', 10) || 0) / 10000;
  }

  private async getRequestCount(
    scope: string,
    scopeId: string,
    period: 'daily' | 'monthly',
    periodKey: string
  ): Promise<number> {
    const key = `${this.config.keyPrefix}count:${scope}:${scopeId}:${period}:${periodKey}`;
    const value = await this.redis.get(key);
    return parseInt(value ?? '0', 10);
  }

  private async getModelSpend(scope: string, scopeId: string): Promise<Record<string, number>> {
    // Since we're using separate keys, we need to scan for model keys
    const pattern = `${this.config.keyPrefix}model:${scope}:${scopeId}:${this.getMonthlyKey(Date.now())}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      return {};
    }

    // PERFORMANCE FIX: Use MGET instead of N individual GET calls
    // This reduces Redis roundtrips from O(n) to O(1)
    const values = await this.redis.mget(keys);
    const result: Record<string, number> = {};

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const model = key.split(':').pop() ?? '';
      const value = values[i];
      result[model] = (parseInt(value ?? '0', 10) || 0) / 10000;
    }

    return result;
  }

  private async getOperationSpend(scope: string, scopeId: string): Promise<Record<string, number>> {
    // Since we're using separate keys, we need to scan for operation keys
    const pattern = `${this.config.keyPrefix}op:${scope}:${scopeId}:${this.getMonthlyKey(Date.now())}:*`;
    const keys = await this.redis.keys(pattern);

    if (keys.length === 0) {
      return {};
    }

    // PERFORMANCE FIX: Use MGET instead of N individual GET calls
    // This reduces Redis roundtrips from O(n) to O(1)
    const values = await this.redis.mget(keys);
    const result: Record<string, number> = {};

    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!;
      const op = key.split(':').pop() ?? '';
      const value = values[i];
      result[op] = (parseInt(value ?? '0', 10) || 0) / 10000;
    }

    return result;
  }

  private getDailyKey(timestamp: number): string {
    return new Date(timestamp).toISOString().split('T')[0]!;
  }

  private getMonthlyKey(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private getNextDailyReset(): Date {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  private getNextMonthlyReset(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  /**
   * Get configuration
   */
  getConfig(): AIBudgetControllerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AIBudgetControllerConfig>): void {
    this.config = AIBudgetControllerConfigSchema.parse({ ...this.config, ...updates });
  }

  /**
   * Reset daily alerts (call at midnight)
   */
  resetDailyAlerts(): void {
    // Clear alerts that contain today's daily key
    const todayKey = this.getDailyKey(Date.now());
    for (const key of this.alertsTriggered) {
      if (key.includes(':daily:') && !key.includes(todayKey)) {
        this.alertsTriggered.delete(key);
      }
    }
  }
}

/**
 * Factory function
 */
export function createAIBudgetController(
  redis: SecureRedisClient,
  config?: Partial<AIBudgetControllerConfig>
): AIBudgetController {
  return new AIBudgetController(redis, config);
}
