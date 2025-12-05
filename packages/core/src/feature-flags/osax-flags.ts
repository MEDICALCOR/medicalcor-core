/**
 * @fileoverview OSAX Feature Flags Configuration
 *
 * Feature flags for the OSAX (Obstructive Sleep Apnea eXtension) module.
 * Controls feature rollout, A/B testing, and experimental features.
 *
 * @module core/feature-flags/osax-flags
 */

import type { FeatureFlag, FeatureFlagService } from './types.js';

// ============================================================================
// OSAX FEATURE FLAG KEYS
// ============================================================================

/**
 * OSAX feature flag keys (type-safe constants)
 */
export const OSAX_FLAGS = {
  /** Master switch for OSAX module */
  OSAX_ENABLED: 'osax.enabled',

  /** Enable automated scoring */
  SCORING_AUTOMATED: 'osax.scoring.automated',

  /** Enable pediatric scoring adjustments */
  SCORING_PEDIATRIC: 'osax.scoring.pediatric',

  /** Enable cardiovascular risk calculation */
  RISK_CARDIOVASCULAR: 'osax.risk.cardiovascular',

  /** Enable treatment recommendation engine */
  TREATMENT_RECOMMENDATIONS: 'osax.treatment.recommendations',

  /** Enable GDPR compliance features */
  GDPR_COMPLIANCE: 'osax.gdpr.compliance',

  /** Enable real-time notifications */
  NOTIFICATIONS_REALTIME: 'osax.notifications.realtime',

  /** Enable CRM integration */
  CRM_INTEGRATION: 'osax.crm.integration',

  /** Enable workflow automation */
  WORKFLOW_AUTOMATION: 'osax.workflow.automation',

  /** Enable metrics collection */
  METRICS_ENABLED: 'osax.metrics.enabled',

  /** Enable audit logging */
  AUDIT_ENABLED: 'osax.audit.enabled',
} as const;

export type OsaxFlagKey = (typeof OSAX_FLAGS)[keyof typeof OSAX_FLAGS];

// ============================================================================
// DEFAULT FLAG DEFINITIONS
// ============================================================================

/**
 * Default OSAX feature flag definitions
 */
export const DEFAULT_OSAX_FLAGS: FeatureFlag[] = [
  {
    key: OSAX_FLAGS.OSAX_ENABLED,
    name: 'OSAX Module',
    description: 'Master switch for the OSAX clinical module',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'clinical-team',
      tags: ['osax', 'core'],
    },
  },
  {
    key: OSAX_FLAGS.SCORING_AUTOMATED,
    name: 'Automated Scoring',
    description: 'Enable automated clinical scoring based on sleep study data',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'clinical-team',
      tags: ['osax', 'scoring'],
    },
  },
  {
    key: OSAX_FLAGS.SCORING_PEDIATRIC,
    name: 'Pediatric Scoring',
    description: 'Enable age-adjusted scoring for pediatric patients',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'clinical-team',
      tags: ['osax', 'scoring', 'pediatric'],
    },
  },
  {
    key: OSAX_FLAGS.RISK_CARDIOVASCULAR,
    name: 'Cardiovascular Risk',
    description: 'Enable cardiovascular risk assessment',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'clinical-team',
      tags: ['osax', 'risk'],
    },
  },
  {
    key: OSAX_FLAGS.TREATMENT_RECOMMENDATIONS,
    name: 'Treatment Recommendations',
    description: 'Enable AI-powered treatment recommendations',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'clinical-team',
      tags: ['osax', 'treatment', 'ai'],
    },
  },
  {
    key: OSAX_FLAGS.GDPR_COMPLIANCE,
    name: 'GDPR Compliance',
    description: 'Enable GDPR compliance features (audit, consent, data retention)',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'security-team',
      tags: ['osax', 'gdpr', 'compliance'],
    },
  },
  {
    key: OSAX_FLAGS.NOTIFICATIONS_REALTIME,
    name: 'Real-time Notifications',
    description: 'Enable real-time notifications for urgent cases',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'platform-team',
      tags: ['osax', 'notifications'],
    },
  },
  {
    key: OSAX_FLAGS.CRM_INTEGRATION,
    name: 'CRM Integration',
    description: 'Enable CRM integration for case updates',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'integrations-team',
      tags: ['osax', 'crm', 'integration'],
    },
  },
  {
    key: OSAX_FLAGS.WORKFLOW_AUTOMATION,
    name: 'Workflow Automation',
    description: 'Enable automated workflow triggers',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'platform-team',
      tags: ['osax', 'workflow', 'automation'],
    },
  },
  {
    key: OSAX_FLAGS.METRICS_ENABLED,
    name: 'Metrics Collection',
    description: 'Enable OSAX metrics collection and observability',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'platform-team',
      tags: ['osax', 'metrics', 'observability'],
    },
  },
  {
    key: OSAX_FLAGS.AUDIT_ENABLED,
    name: 'Audit Logging',
    description: 'Enable OSAX audit logging for compliance',
    enabled: true,
    metadata: {
      createdAt: new Date('2025-01-29'),
      updatedAt: new Date('2025-01-29'),
      owner: 'security-team',
      tags: ['osax', 'audit', 'compliance'],
    },
  },
];

// ============================================================================
// OSAX FEATURE FLAG SERVICE
// ============================================================================

/**
 * OSAX-specific feature flag service wrapper
 *
 * Provides type-safe access to OSAX feature flags with caching.
 */
export class OsaxFeatureFlags {
  private readonly flagService: FeatureFlagService;
  private readonly cache = new Map<string, { value: boolean; expiresAt: number }>();
  private readonly cacheTtlMs: number;

  constructor(flagService: FeatureFlagService, cacheTtlMs = 60_000) {
    this.flagService = flagService;
    this.cacheTtlMs = cacheTtlMs;
  }

  /**
   * Check if OSAX module is enabled
   */
  async isOsaxEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.OSAX_ENABLED);
  }

  /**
   * Check if automated scoring is enabled
   */
  async isScoringAutomatedEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.SCORING_AUTOMATED);
  }

  /**
   * Check if pediatric scoring is enabled
   */
  async isPediatricScoringEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.SCORING_PEDIATRIC);
  }

  /**
   * Check if cardiovascular risk calculation is enabled
   */
  async isCardiovascularRiskEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.RISK_CARDIOVASCULAR);
  }

  /**
   * Check if treatment recommendations are enabled
   */
  async isTreatmentRecommendationsEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.TREATMENT_RECOMMENDATIONS);
  }

  /**
   * Check if GDPR compliance features are enabled
   */
  async isGdprComplianceEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.GDPR_COMPLIANCE);
  }

  /**
   * Check if real-time notifications are enabled
   */
  async isRealtimeNotificationsEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.NOTIFICATIONS_REALTIME);
  }

  /**
   * Check if CRM integration is enabled
   */
  async isCrmIntegrationEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.CRM_INTEGRATION);
  }

  /**
   * Check if workflow automation is enabled
   */
  async isWorkflowAutomationEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.WORKFLOW_AUTOMATION);
  }

  /**
   * Check if metrics collection is enabled
   */
  async isMetricsEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.METRICS_ENABLED);
  }

  /**
   * Check if audit logging is enabled
   */
  async isAuditEnabled(): Promise<boolean> {
    return this.isEnabled(OSAX_FLAGS.AUDIT_ENABLED);
  }

  /**
   * Generic flag check with caching
   */
  private async isEnabled(key: OsaxFlagKey): Promise<boolean> {
    const now = Date.now();
    const cached = this.cache.get(key);

    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    const value = await this.flagService.isEnabled(key);
    this.cache.set(key, { value, expiresAt: now + this.cacheTtlMs });
    return value;
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// ============================================================================
// FACTORY
// ============================================================================

/**
 * Create OSAX feature flags service
 */
export function createOsaxFeatureFlags(
  flagService: FeatureFlagService,
  cacheTtlMs?: number
): OsaxFeatureFlags {
  return new OsaxFeatureFlags(flagService, cacheTtlMs);
}

/**
 * Initialize default OSAX flags in the flag service
 */
export async function initializeOsaxFlags(flagService: FeatureFlagService): Promise<void> {
  for (const flag of DEFAULT_OSAX_FLAGS) {
    await flagService.upsertFlag(flag);
  }
}
