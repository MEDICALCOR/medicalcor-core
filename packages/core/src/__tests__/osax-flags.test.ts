import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OSAX_FLAGS,
  DEFAULT_OSAX_FLAGS,
  OsaxFeatureFlags,
  createOsaxFeatureFlags,
  initializeOsaxFlags,
  type OsaxFlagKey,
} from '../feature-flags/osax-flags.js';
import type { FeatureFlagService } from '../feature-flags/types.js';

describe('OSAX Feature Flags', () => {
  describe('OSAX_FLAGS constants', () => {
    it('should have all required flag keys', () => {
      expect(OSAX_FLAGS.OSAX_ENABLED).toBe('osax.enabled');
      expect(OSAX_FLAGS.SCORING_AUTOMATED).toBe('osax.scoring.automated');
      expect(OSAX_FLAGS.SCORING_PEDIATRIC).toBe('osax.scoring.pediatric');
      expect(OSAX_FLAGS.RISK_CARDIOVASCULAR).toBe('osax.risk.cardiovascular');
      expect(OSAX_FLAGS.TREATMENT_RECOMMENDATIONS).toBe('osax.treatment.recommendations');
      expect(OSAX_FLAGS.GDPR_COMPLIANCE).toBe('osax.gdpr.compliance');
      expect(OSAX_FLAGS.NOTIFICATIONS_REALTIME).toBe('osax.notifications.realtime');
      expect(OSAX_FLAGS.CRM_INTEGRATION).toBe('osax.crm.integration');
      expect(OSAX_FLAGS.WORKFLOW_AUTOMATION).toBe('osax.workflow.automation');
      expect(OSAX_FLAGS.METRICS_ENABLED).toBe('osax.metrics.enabled');
      expect(OSAX_FLAGS.AUDIT_ENABLED).toBe('osax.audit.enabled');
    });
  });

  describe('DEFAULT_OSAX_FLAGS', () => {
    it('should have correct number of flags', () => {
      expect(DEFAULT_OSAX_FLAGS).toHaveLength(11);
    });

    it('should have all flags enabled by default', () => {
      DEFAULT_OSAX_FLAGS.forEach((flag) => {
        expect(flag.enabled).toBe(true);
      });
    });

    it('should have correct metadata on each flag', () => {
      DEFAULT_OSAX_FLAGS.forEach((flag) => {
        expect(flag.key).toBeDefined();
        expect(flag.name).toBeDefined();
        expect(flag.description).toBeDefined();
        expect(flag.metadata).toBeDefined();
        expect(flag.metadata.owner).toBeDefined();
        expect(flag.metadata.tags).toBeDefined();
      });
    });

    it('should have correct owners', () => {
      const clinicalTeamFlags = DEFAULT_OSAX_FLAGS.filter(
        (f) => f.metadata.owner === 'clinical-team'
      );
      const securityTeamFlags = DEFAULT_OSAX_FLAGS.filter(
        (f) => f.metadata.owner === 'security-team'
      );
      const platformTeamFlags = DEFAULT_OSAX_FLAGS.filter(
        (f) => f.metadata.owner === 'platform-team'
      );

      expect(clinicalTeamFlags.length).toBeGreaterThan(0);
      expect(securityTeamFlags.length).toBeGreaterThan(0);
      expect(platformTeamFlags.length).toBeGreaterThan(0);
    });
  });

  describe('OsaxFeatureFlags class', () => {
    let mockFlagService: FeatureFlagService;
    let osaxFlags: OsaxFeatureFlags;

    beforeEach(() => {
      mockFlagService = {
        isEnabled: vi.fn().mockResolvedValue(true),
        upsertFlag: vi.fn().mockResolvedValue(undefined),
        getFlag: vi.fn(),
        getAllFlags: vi.fn(),
        deleteFlag: vi.fn(),
      } as unknown as FeatureFlagService;

      osaxFlags = new OsaxFeatureFlags(mockFlagService);
    });

    describe('isOsaxEnabled', () => {
      it('should check OSAX_ENABLED flag', async () => {
        const result = await osaxFlags.isOsaxEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.OSAX_ENABLED);
      });
    });

    describe('isScoringAutomatedEnabled', () => {
      it('should check SCORING_AUTOMATED flag', async () => {
        const result = await osaxFlags.isScoringAutomatedEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.SCORING_AUTOMATED);
      });
    });

    describe('isPediatricScoringEnabled', () => {
      it('should check SCORING_PEDIATRIC flag', async () => {
        const result = await osaxFlags.isPediatricScoringEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.SCORING_PEDIATRIC);
      });
    });

    describe('isCardiovascularRiskEnabled', () => {
      it('should check RISK_CARDIOVASCULAR flag', async () => {
        const result = await osaxFlags.isCardiovascularRiskEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.RISK_CARDIOVASCULAR);
      });
    });

    describe('isTreatmentRecommendationsEnabled', () => {
      it('should check TREATMENT_RECOMMENDATIONS flag', async () => {
        const result = await osaxFlags.isTreatmentRecommendationsEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(
          OSAX_FLAGS.TREATMENT_RECOMMENDATIONS
        );
      });
    });

    describe('isGdprComplianceEnabled', () => {
      it('should check GDPR_COMPLIANCE flag', async () => {
        const result = await osaxFlags.isGdprComplianceEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.GDPR_COMPLIANCE);
      });
    });

    describe('isRealtimeNotificationsEnabled', () => {
      it('should check NOTIFICATIONS_REALTIME flag', async () => {
        const result = await osaxFlags.isRealtimeNotificationsEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.NOTIFICATIONS_REALTIME);
      });
    });

    describe('isCrmIntegrationEnabled', () => {
      it('should check CRM_INTEGRATION flag', async () => {
        const result = await osaxFlags.isCrmIntegrationEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.CRM_INTEGRATION);
      });
    });

    describe('isWorkflowAutomationEnabled', () => {
      it('should check WORKFLOW_AUTOMATION flag', async () => {
        const result = await osaxFlags.isWorkflowAutomationEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.WORKFLOW_AUTOMATION);
      });
    });

    describe('isMetricsEnabled', () => {
      it('should check METRICS_ENABLED flag', async () => {
        const result = await osaxFlags.isMetricsEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.METRICS_ENABLED);
      });
    });

    describe('isAuditEnabled', () => {
      it('should check AUDIT_ENABLED flag', async () => {
        const result = await osaxFlags.isAuditEnabled();
        expect(result).toBe(true);
        expect(mockFlagService.isEnabled).toHaveBeenCalledWith(OSAX_FLAGS.AUDIT_ENABLED);
      });
    });

    describe('caching', () => {
      it('should cache flag values', async () => {
        // First call - should hit the service
        await osaxFlags.isOsaxEnabled();
        expect(mockFlagService.isEnabled).toHaveBeenCalledTimes(1);

        // Second call - should use cache
        await osaxFlags.isOsaxEnabled();
        expect(mockFlagService.isEnabled).toHaveBeenCalledTimes(1);
      });

      it('should expire cache after TTL', async () => {
        vi.useFakeTimers();

        // Create with short TTL
        const shortTtlFlags = new OsaxFeatureFlags(mockFlagService, 100);

        await shortTtlFlags.isOsaxEnabled();
        expect(mockFlagService.isEnabled).toHaveBeenCalledTimes(1);

        // Advance time past TTL
        vi.advanceTimersByTime(200);

        await shortTtlFlags.isOsaxEnabled();
        expect(mockFlagService.isEnabled).toHaveBeenCalledTimes(2);

        vi.useRealTimers();
      });

      it('should clear cache on demand', async () => {
        await osaxFlags.isOsaxEnabled();
        expect(mockFlagService.isEnabled).toHaveBeenCalledTimes(1);

        osaxFlags.clearCache();

        await osaxFlags.isOsaxEnabled();
        expect(mockFlagService.isEnabled).toHaveBeenCalledTimes(2);
      });
    });

    describe('disabled flags', () => {
      it('should return false when flag is disabled', async () => {
        vi.mocked(mockFlagService.isEnabled).mockResolvedValue(false);

        const result = await osaxFlags.isOsaxEnabled();
        expect(result).toBe(false);
      });
    });
  });

  describe('createOsaxFeatureFlags', () => {
    it('should create OsaxFeatureFlags instance', () => {
      const mockService = {
        isEnabled: vi.fn(),
      } as unknown as FeatureFlagService;

      const flags = createOsaxFeatureFlags(mockService);
      expect(flags).toBeInstanceOf(OsaxFeatureFlags);
    });

    it('should accept custom TTL', () => {
      const mockService = {
        isEnabled: vi.fn(),
      } as unknown as FeatureFlagService;

      const flags = createOsaxFeatureFlags(mockService, 30000);
      expect(flags).toBeInstanceOf(OsaxFeatureFlags);
    });
  });

  describe('initializeOsaxFlags', () => {
    it('should upsert all default flags', async () => {
      const mockService = {
        upsertFlag: vi.fn().mockResolvedValue(undefined),
      } as unknown as FeatureFlagService;

      await initializeOsaxFlags(mockService);

      expect(mockService.upsertFlag).toHaveBeenCalledTimes(DEFAULT_OSAX_FLAGS.length);

      DEFAULT_OSAX_FLAGS.forEach((flag) => {
        expect(mockService.upsertFlag).toHaveBeenCalledWith(flag);
      });
    });
  });
});
