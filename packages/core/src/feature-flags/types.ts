/**
 * @fileoverview Feature Flag Types
 *
 * Core types for the feature flag system.
 *
 * @module core/feature-flags/types
 */

import { Ok, Err, type Result } from '../types/result.js';

// ============================================================================
// FEATURE FLAG TYPES
// ============================================================================

export interface FeatureFlag {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly targeting?: TargetingRules;
  readonly variants?: FlagVariant[];
  readonly metadata: FlagMetadata;
}

export interface FlagMetadata {
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly owner?: string;
  readonly tags?: string[];
}

export interface TargetingRules {
  readonly rules: TargetingRule[];
  readonly defaultServe: ServeConfig;
}

export interface TargetingRule {
  readonly id: string;
  readonly conditions: RuleCondition[];
  readonly serve: ServeConfig;
}

export interface RuleCondition {
  readonly attribute: string;
  readonly operator: ConditionOperator;
  readonly values: unknown[];
}

export type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'in' | 'not_in';

export interface ServeConfig {
  readonly variant?: string;
  readonly percentage?: { variants: { variant: string; weight: number }[] };
}

export interface FlagVariant {
  readonly name: string;
  readonly value: unknown;
}

// ============================================================================
// EVALUATION CONTEXT
// ============================================================================

export interface EvaluationContext {
  readonly userId?: string;
  readonly sessionId?: string;
  readonly tenantId?: string;
  readonly attributes: Record<string, unknown>;
}

export interface EvaluationResult<T = unknown> {
  readonly flagKey: string;
  readonly value: T;
  readonly variant?: string;
  readonly reason: 'default' | 'targeting_match' | 'percentage_rollout' | 'disabled' | 'not_found';
}

// ============================================================================
// FEATURE FLAG ERROR
// ============================================================================

export class FeatureFlagError extends Error {
  constructor(
    message: string,
    readonly code: FeatureFlagErrorCode
  ) {
    super(message);
    this.name = 'FeatureFlagError';
  }
}

export type FeatureFlagErrorCode = 'NOT_FOUND' | 'INVALID_FLAG' | 'EVALUATION_ERROR';

// ============================================================================
// FEATURE FLAG SERVICE
// ============================================================================

export interface FeatureFlagService {
  isEnabled(key: string, context?: EvaluationContext): Promise<boolean>;
  getValue<T>(key: string, defaultValue: T, context?: EvaluationContext): Promise<T>;
  evaluate<T>(key: string, context?: EvaluationContext): Promise<EvaluationResult<T>>;
  getAllFlags(): Promise<FeatureFlag[]>;
  upsertFlag(flag: FeatureFlag): Promise<Result<void, FeatureFlagError>>;
  deleteFlag(key: string): Promise<Result<void, FeatureFlagError>>;
}

// ============================================================================
// IN-MEMORY FEATURE FLAG SERVICE
// ============================================================================

export class InMemoryFeatureFlagService implements FeatureFlagService {
  private flags = new Map<string, FeatureFlag>();

  async isEnabled(key: string, context?: EvaluationContext): Promise<boolean> {
    const result = await this.evaluate<boolean>(key, context);
    return result.value;
  }

  async getValue<T>(key: string, defaultValue: T, context?: EvaluationContext): Promise<T> {
    const result = await this.evaluate<T>(key, context);
    return result.reason === 'not_found' ? defaultValue : result.value;
  }

  evaluate<T>(key: string, context?: EvaluationContext): Promise<EvaluationResult<T>> {
    const flag = this.flags.get(key);

    if (!flag) {
      return Promise.resolve({ flagKey: key, value: false as T, reason: 'not_found' });
    }

    if (!flag.enabled) {
      return Promise.resolve({ flagKey: key, value: false as T, reason: 'disabled' });
    }

    if (!flag.targeting) {
      return Promise.resolve({ flagKey: key, value: true as T, reason: 'default' });
    }

    for (const rule of flag.targeting.rules) {
      if (this.evaluateRule(rule, context)) {
        const value = this.getVariantValue(flag, rule.serve.variant) as T | undefined;
        return Promise.resolve({
          flagKey: key,
          value: value ?? (true as T),
          variant: rule.serve.variant,
          reason: 'targeting_match',
        });
      }
    }

    return Promise.resolve({ flagKey: key, value: true as T, reason: 'default' });
  }

  getAllFlags(): Promise<FeatureFlag[]> {
    return Promise.resolve(Array.from(this.flags.values()));
  }

  upsertFlag(flag: FeatureFlag): Promise<Result<void, FeatureFlagError>> {
    this.flags.set(flag.key, flag);
    return Promise.resolve(Ok(undefined));
  }

  deleteFlag(key: string): Promise<Result<void, FeatureFlagError>> {
    if (!this.flags.has(key)) {
      return Promise.resolve(Err(new FeatureFlagError('Flag not found', 'NOT_FOUND')));
    }
    this.flags.delete(key);
    return Promise.resolve(Ok(undefined));
  }

  private evaluateRule(rule: TargetingRule, context?: EvaluationContext): boolean {
    if (!context) return false;
    for (const condition of rule.conditions) {
      if (!this.evaluateCondition(condition, context)) return false;
    }
    return true;
  }

  private evaluateCondition(condition: RuleCondition, context: EvaluationContext): boolean {
    const value = this.getAttributeValue(condition.attribute, context);
    switch (condition.operator) {
      case 'equals':
        return condition.values.includes(value);
      case 'not_equals':
        return !condition.values.includes(value);
      case 'contains':
        return condition.values.some(
          (v) => typeof value === 'string' && typeof v === 'string' && value.includes(v)
        );
      case 'in':
        return condition.values.includes(value);
      case 'not_in':
        return !condition.values.includes(value);
      default: {
        // Exhaustive check - this should never happen
        const _exhaustiveCheck: never = condition.operator;
        return _exhaustiveCheck;
      }
    }
  }

  private getAttributeValue(attribute: string, context: EvaluationContext): unknown {
    if (attribute === 'userId') return context.userId;
    if (attribute === 'sessionId') return context.sessionId;
    if (attribute === 'tenantId') return context.tenantId;
    return context.attributes[attribute];
  }

  private getVariantValue(flag: FeatureFlag, variantName?: string): unknown {
    if (!variantName || !flag.variants) return undefined;
    const variant = flag.variants.find((v) => v.name === variantName);
    return variant?.value;
  }
}
