/**
 * @module architecture/security/zero-trust
 *
 * Zero Trust Security Model
 * =========================
 *
 * "Never trust, always verify" - Every request must be authenticated,
 * authorized, and validated regardless of source.
 */

import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';
import type { Identity, AuthContext } from './authentication.js';
import type { AuthorizationContext, AuthorizationDecision } from './authorization.js';

// ============================================================================
// ZERO TRUST TYPES
// ============================================================================

/**
 * Trust score (0-100)
 */
export interface TrustScore {
  readonly score: number;
  readonly factors: TrustFactor[];
  readonly calculatedAt: Date;
  readonly expiresAt: Date;
}

export interface TrustFactor {
  readonly name: string;
  readonly score: number;
  readonly weight: number;
  readonly details?: Record<string, unknown>;
}

/**
 * Security context for a request
 */
export interface SecurityContext {
  readonly identity: Identity | null;
  readonly trustScore: TrustScore;
  readonly device: DeviceContext;
  readonly network: NetworkContext;
  readonly session: SessionContext;
  readonly risk: RiskAssessment;
}

export interface DeviceContext {
  readonly deviceId?: string;
  readonly deviceType?: 'desktop' | 'mobile' | 'tablet' | 'server' | 'iot' | 'unknown';
  readonly os?: string;
  readonly browser?: string;
  readonly isManaged?: boolean;
  readonly isCompliant?: boolean;
  readonly lastSeen?: Date;
}

export interface NetworkContext {
  readonly ipAddress: string;
  readonly isVPN?: boolean;
  readonly isTor?: boolean;
  readonly isProxy?: boolean;
  readonly country?: string;
  readonly asn?: string;
  readonly isCorporateNetwork?: boolean;
}

export interface SessionContext {
  readonly sessionId?: string;
  readonly createdAt?: Date;
  readonly lastActivityAt?: Date;
  readonly mfaVerified?: boolean;
  readonly elevatedPrivileges?: boolean;
}

export interface RiskAssessment {
  readonly level: RiskLevel;
  readonly score: number;
  readonly signals: RiskSignal[];
  readonly recommendations: string[];
}

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskSignal {
  readonly type: string;
  readonly severity: RiskLevel;
  readonly description: string;
  readonly detectedAt: Date;
}

// ============================================================================
// TRUST SCORE CALCULATOR
// ============================================================================

/**
 * Calculate trust score based on various factors
 */
export class TrustScoreCalculator {
  private factors: TrustFactorEvaluator[] = [];

  /**
   * Register a trust factor evaluator
   */
  registerFactor(evaluator: TrustFactorEvaluator): void {
    this.factors.push(evaluator);
  }

  /**
   * Calculate trust score
   */
  async calculate(context: Partial<SecurityContext>): Promise<TrustScore> {
    const factors: TrustFactor[] = [];
    let totalScore = 0;
    let totalWeight = 0;

    for (const evaluator of this.factors) {
      const factor = await evaluator.evaluate(context);
      factors.push(factor);
      totalScore += factor.score * factor.weight;
      totalWeight += factor.weight;
    }

    const score = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 50;

    return {
      score,
      factors,
      calculatedAt: new Date(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    };
  }
}

export interface TrustFactorEvaluator {
  readonly name: string;
  readonly weight: number;
  evaluate(context: Partial<SecurityContext>): Promise<TrustFactor>;
}

// ============================================================================
// DEFAULT TRUST FACTOR EVALUATORS
// ============================================================================

/**
 * Authentication strength factor
 */
export class AuthenticationStrengthFactor implements TrustFactorEvaluator {
  readonly name = 'authentication_strength';
  readonly weight = 30;

  async evaluate(context: Partial<SecurityContext>): Promise<TrustFactor> {
    let score = 0;

    if (context.identity) {
      score = 50; // Base score for authenticated

      if (context.session?.mfaVerified) {
        score += 30;
      }

      if (context.identity.type === 'user') {
        score += 10;
      }

      if (context.session?.elevatedPrivileges) {
        score += 10;
      }
    }

    return {
      name: this.name,
      score: Math.min(score, 100),
      weight: this.weight,
      details: {
        authenticated: !!context.identity,
        mfaVerified: context.session?.mfaVerified ?? false,
      },
    };
  }
}

/**
 * Device trust factor
 */
export class DeviceTrustFactor implements TrustFactorEvaluator {
  readonly name = 'device_trust';
  readonly weight = 20;

  async evaluate(context: Partial<SecurityContext>): Promise<TrustFactor> {
    let score = 50; // Default for unknown device

    if (context.device) {
      if (context.device.isManaged) {
        score += 25;
      }

      if (context.device.isCompliant) {
        score += 25;
      }

      if (context.device.deviceType === 'unknown') {
        score -= 20;
      }
    }

    return {
      name: this.name,
      score: Math.max(0, Math.min(score, 100)),
      weight: this.weight,
      details: {
        deviceType: context.device?.deviceType,
        isManaged: context.device?.isManaged,
      },
    };
  }
}

/**
 * Network trust factor
 */
export class NetworkTrustFactor implements TrustFactorEvaluator {
  readonly name = 'network_trust';
  readonly weight = 25;

  private trustedIPs = new Set<string>();
  private blockedIPs = new Set<string>();

  addTrustedIP(ip: string): void {
    this.trustedIPs.add(ip);
  }

  addBlockedIP(ip: string): void {
    this.blockedIPs.add(ip);
  }

  async evaluate(context: Partial<SecurityContext>): Promise<TrustFactor> {
    let score = 50;

    if (context.network) {
      if (this.blockedIPs.has(context.network.ipAddress)) {
        score = 0;
      } else if (this.trustedIPs.has(context.network.ipAddress)) {
        score = 100;
      } else {
        if (context.network.isCorporateNetwork) {
          score += 30;
        }

        if (context.network.isVPN) {
          score -= 10; // Slightly suspicious
        }

        if (context.network.isTor) {
          score -= 40;
        }

        if (context.network.isProxy) {
          score -= 20;
        }
      }
    }

    return {
      name: this.name,
      score: Math.max(0, Math.min(score, 100)),
      weight: this.weight,
      details: {
        ipAddress: context.network?.ipAddress,
        isCorporate: context.network?.isCorporateNetwork,
      },
    };
  }
}

/**
 * Behavior analysis factor
 */
export class BehaviorAnalysisFactor implements TrustFactorEvaluator {
  readonly name = 'behavior_analysis';
  readonly weight = 25;

  async evaluate(context: Partial<SecurityContext>): Promise<TrustFactor> {
    let score = 70; // Default trust

    // Analyze risk signals
    if (context.risk) {
      for (const signal of context.risk.signals) {
        switch (signal.severity) {
          case 'critical':
            score -= 50;
            break;
          case 'high':
            score -= 30;
            break;
          case 'medium':
            score -= 15;
            break;
          case 'low':
            score -= 5;
            break;
        }
      }
    }

    return {
      name: this.name,
      score: Math.max(0, Math.min(score, 100)),
      weight: this.weight,
      details: {
        riskSignals: context.risk?.signals.length ?? 0,
      },
    };
  }
}

// ============================================================================
// ZERO TRUST POLICY ENGINE
// ============================================================================

/**
 * Zero Trust Policy
 */
export interface ZeroTrustPolicy {
  readonly policyId: string;
  readonly name: string;
  readonly resource: string;
  readonly action: string;
  readonly conditions: PolicyCondition[];
  readonly minTrustScore: number;
  readonly requiredFactors?: string[];
  readonly mfaRequired?: boolean;
  readonly riskTolerance?: RiskLevel;
}

export interface PolicyCondition {
  readonly type: 'trust_score' | 'risk_level' | 'device' | 'network' | 'time' | 'custom';
  readonly operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'in' | 'not_in';
  readonly value: unknown;
}

/**
 * Zero Trust Policy Engine
 */
export class ZeroTrustPolicyEngine {
  private policies: ZeroTrustPolicy[] = [];

  /**
   * Register a policy
   */
  registerPolicy(policy: ZeroTrustPolicy): void {
    this.policies.push(policy);
  }

  /**
   * Evaluate access request
   */
  evaluate(resource: string, action: string, securityContext: SecurityContext): ZeroTrustDecision {
    // Find applicable policies
    const applicablePolicies = this.policies.filter(
      (p) =>
        (p.resource === '*' || p.resource === resource) && (p.action === '*' || p.action === action)
    );

    if (applicablePolicies.length === 0) {
      return {
        allowed: false,
        reason: 'No applicable policy found - default deny',
        trustScore: securityContext.trustScore.score,
        requiredActions: [],
      };
    }

    // Evaluate each policy
    for (const policy of applicablePolicies) {
      const result = this.evaluatePolicy(policy, securityContext);
      if (!result.passed) {
        return {
          allowed: false,
          reason: result.reason,
          policy: policy.policyId,
          trustScore: securityContext.trustScore.score,
          requiredActions: result.requiredActions,
        };
      }
    }

    return {
      allowed: true,
      reason: 'All policies passed',
      trustScore: securityContext.trustScore.score,
      requiredActions: [],
    };
  }

  private evaluatePolicy(
    policy: ZeroTrustPolicy,
    context: SecurityContext
  ): PolicyEvaluationResult {
    const requiredActions: string[] = [];

    // Check trust score
    if (context.trustScore.score < policy.minTrustScore) {
      return {
        passed: false,
        reason: `Trust score ${context.trustScore.score} below minimum ${policy.minTrustScore}`,
        requiredActions: ['increase_trust_score'],
      };
    }

    // Check MFA requirement
    if (policy.mfaRequired && !context.session.mfaVerified) {
      return {
        passed: false,
        reason: 'MFA verification required',
        requiredActions: ['verify_mfa'],
      };
    }

    // Check risk tolerance
    if (policy.riskTolerance) {
      const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'critical'];
      const currentRiskIndex = riskOrder.indexOf(context.risk.level);
      const toleranceIndex = riskOrder.indexOf(policy.riskTolerance);

      if (currentRiskIndex > toleranceIndex) {
        return {
          passed: false,
          reason: `Risk level ${context.risk.level} exceeds tolerance ${policy.riskTolerance}`,
          requiredActions: ['reduce_risk'],
        };
      }
    }

    // Check required factors
    if (policy.requiredFactors) {
      const factorNames = context.trustScore.factors.map((f) => f.name);
      const missingFactors = policy.requiredFactors.filter((f) => !factorNames.includes(f));

      if (missingFactors.length > 0) {
        return {
          passed: false,
          reason: `Missing required trust factors: ${missingFactors.join(', ')}`,
          requiredActions: missingFactors.map((f) => `verify_${f}`),
        };
      }
    }

    // Check conditions
    for (const condition of policy.conditions) {
      if (!this.evaluateCondition(condition, context)) {
        return {
          passed: false,
          reason: `Policy condition failed: ${condition.type}`,
          requiredActions: [],
        };
      }
    }

    return { passed: true, reason: 'All checks passed', requiredActions: [] };
  }

  private evaluateCondition(condition: PolicyCondition, context: SecurityContext): boolean {
    switch (condition.type) {
      case 'trust_score':
        return this.compareValue(context.trustScore.score, condition.operator, condition.value);

      case 'risk_level':
        return this.compareValue(context.risk.level, condition.operator, condition.value);

      case 'device':
        return this.compareValue(context.device.deviceType, condition.operator, condition.value);

      case 'network':
        return this.compareValue(
          context.network.isCorporateNetwork,
          condition.operator,
          condition.value
        );

      default:
        return true;
    }
  }

  private compareValue(
    actual: unknown,
    operator: PolicyCondition['operator'],
    expected: unknown
  ): boolean {
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'not_equals':
        return actual !== expected;
      case 'greater_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual > expected;
      case 'less_than':
        return typeof actual === 'number' && typeof expected === 'number' && actual < expected;
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'not_in':
        return Array.isArray(expected) && !expected.includes(actual);
      default:
        return false;
    }
  }
}

interface PolicyEvaluationResult {
  passed: boolean;
  reason: string;
  requiredActions: string[];
}

export interface ZeroTrustDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly policy?: string;
  readonly trustScore: number;
  readonly requiredActions: string[];
}

// ============================================================================
// DEFAULT INSTANCES
// ============================================================================

export const trustScoreCalculator = new TrustScoreCalculator();
trustScoreCalculator.registerFactor(new AuthenticationStrengthFactor());
trustScoreCalculator.registerFactor(new DeviceTrustFactor());
trustScoreCalculator.registerFactor(new NetworkTrustFactor());
trustScoreCalculator.registerFactor(new BehaviorAnalysisFactor());

export const zeroTrustPolicyEngine = new ZeroTrustPolicyEngine();
