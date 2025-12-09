/**
 * @fileoverview Tests for Revenue Forecast Domain Events
 *
 * Tests factory functions, type guards, and event metadata generation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createRevenueForecastEventMetadata,
  createRevenueForecastGeneratedEvent,
  createRevenueGrowthDetectedEvent,
  createRevenueDeclineAlertEvent,
  createRevenueVolatilityDetectedEvent,
  createForecastAccuracyReviewedEvent,
  createSeasonalAnomalyDetectedEvent,
  createBatchForecastCompletedEvent,
  createForecastModelUpdatedEvent,
  isRevenueForecastGeneratedEvent,
  isRevenueGrowthDetectedEvent,
  isRevenueDeclineAlertEvent,
  isRevenueVolatilityDetectedEvent,
  isForecastAccuracyReviewedEvent,
  isSeasonalAnomalyDetectedEvent,
  isBatchForecastCompletedEvent,
  isForecastModelUpdatedEvent,
  type RevenueForecastDomainEvent,
  type RevenueForecastGeneratedPayload,
  type RevenueGrowthDetectedPayload,
  type RevenueDeclineAlertPayload,
  type RevenueVolatilityDetectedPayload,
  type ForecastAccuracyReviewedPayload,
  type SeasonalAnomalyDetectedPayload,
  type BatchForecastCompletedPayload,
  type ForecastModelUpdatedPayload,
} from '../revenue-forecast-events.js';
import type { EventMetadata } from '../lead-events.js';

describe('revenue-forecast-events', () => {
  const mockUUID = '550e8400-e29b-41d4-a716-446655440000';
  const mockTimestamp = '2024-01-15T10:30:00.000Z';
  const mockRandomUUID = vi.fn().mockReturnValue(mockUUID);

  beforeEach(() => {
    vi.stubGlobal('crypto', { randomUUID: mockRandomUUID });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(mockTimestamp));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  describe('createRevenueForecastEventMetadata', () => {
    it('should create metadata with correlationId only', () => {
      const metadata = createRevenueForecastEventMetadata('corr-123');

      expect(metadata).toEqual({
        eventId: mockUUID,
        timestamp: mockTimestamp,
        correlationId: 'corr-123',
        idempotencyKey: `forecast-corr-123-${mockUUID}`,
        version: 1,
        source: 'revenue-forecasting-service',
      });
    });

    it('should create metadata with causationId', () => {
      const metadata = createRevenueForecastEventMetadata('corr-123', 'cause-456');

      expect(metadata.causationId).toBe('cause-456');
      expect(metadata.correlationId).toBe('corr-123');
    });

    it('should create metadata with actor', () => {
      const metadata = createRevenueForecastEventMetadata('corr-123', undefined, 'system-cron');

      expect(metadata.actor).toBe('system-cron');
      expect(metadata.causationId).toBeUndefined();
    });

    it('should prioritize causationId over actor when both provided', () => {
      const metadata = createRevenueForecastEventMetadata('corr-123', 'cause-456', 'system-cron');

      expect(metadata.causationId).toBe('cause-456');
      expect(metadata.actor).toBeUndefined();
    });

    it('should generate unique idempotencyKey using correlationId', () => {
      const metadata = createRevenueForecastEventMetadata('unique-corr');

      expect(metadata.idempotencyKey).toContain('forecast-unique-corr-');
    });
  });

  describe('createRevenueForecastGeneratedEvent', () => {
    const payload: RevenueForecastGeneratedPayload = {
      clinicId: 'clinic-001',
      method: 'ensemble',
      confidenceLevel: 'HIGH',
      totalPredictedRevenue: 150000,
      forecastPeriods: 12,
      confidenceIntervalLower: 140000,
      confidenceIntervalUpper: 160000,
      trendDirection: 'GROWING',
      annualizedGrowthRate: 15.5,
      modelRSquared: 0.92,
      modelVersion: '2.1.0',
      dataPointsUsed: 36,
    };

    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-123',
      idempotencyKey: 'idem-123',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    it('should create RevenueForecastGenerated event with correct type', () => {
      const event = createRevenueForecastGeneratedEvent('agg-001', payload, metadata);

      expect(event.type).toBe('revenue_forecast.generated');
      expect(event.aggregateId).toBe('agg-001');
      expect(event.aggregateType).toBe('Lead');
      expect(event.payload).toEqual(payload);
      expect(event.metadata).toEqual(metadata);
    });

    it('should support all forecasting methods', () => {
      const methods = [
        'moving_average',
        'exponential_smoothing',
        'linear_regression',
        'ensemble',
      ] as const;

      methods.forEach((method) => {
        const event = createRevenueForecastGeneratedEvent(
          'agg-001',
          { ...payload, method },
          metadata
        );
        expect(event.payload.method).toBe(method);
      });
    });

    it('should support all trend directions', () => {
      const trends = ['GROWING', 'STABLE', 'DECLINING'] as const;

      trends.forEach((trend) => {
        const event = createRevenueForecastGeneratedEvent(
          'agg-001',
          { ...payload, trendDirection: trend },
          metadata
        );
        expect(event.payload.trendDirection).toBe(trend);
      });
    });

    it('should support all confidence levels', () => {
      const levels = ['HIGH', 'MEDIUM', 'LOW'] as const;

      levels.forEach((level) => {
        const event = createRevenueForecastGeneratedEvent(
          'agg-001',
          { ...payload, confidenceLevel: level },
          metadata
        );
        expect(event.payload.confidenceLevel).toBe(level);
      });
    });
  });

  describe('createRevenueGrowthDetectedEvent', () => {
    const payload: RevenueGrowthDetectedPayload = {
      clinicId: 'clinic-001',
      annualizedGrowthRate: 25.5,
      totalPredictedRevenue: 200000,
      confidenceLevel: 'HIGH',
      growthDrivers: ['new_patients', 'increased_procedures'],
      recommendedActions: ['increase_capacity', 'hire_staff'],
    };

    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-456',
      idempotencyKey: 'idem-456',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    it('should create RevenueGrowthDetected event', () => {
      const event = createRevenueGrowthDetectedEvent('agg-002', payload, metadata);

      expect(event.type).toBe('revenue_forecast.growth_detected');
      expect(event.aggregateId).toBe('agg-002');
      expect(event.aggregateType).toBe('Lead');
      expect(event.payload.annualizedGrowthRate).toBe(25.5);
      expect(event.payload.growthDrivers).toEqual(['new_patients', 'increased_procedures']);
    });

    it('should handle empty growth drivers and actions', () => {
      const event = createRevenueGrowthDetectedEvent(
        'agg-002',
        { ...payload, growthDrivers: [], recommendedActions: [] },
        metadata
      );

      expect(event.payload.growthDrivers).toEqual([]);
      expect(event.payload.recommendedActions).toEqual([]);
    });
  });

  describe('createRevenueDeclineAlertEvent', () => {
    const payload: RevenueDeclineAlertPayload = {
      clinicId: 'clinic-002',
      declineRate: -12.5,
      projectedRevenueLoss: 25000,
      previousRevenue: 200000,
      forecastedRevenue: 175000,
      riskFactors: ['economic_downturn', 'competition'],
      recommendedActions: ['marketing_campaign', 'retention_program'],
      severity: 'WARNING',
    };

    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-789',
      idempotencyKey: 'idem-789',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    it('should create RevenueDeclineAlert event with WARNING severity', () => {
      const event = createRevenueDeclineAlertEvent('agg-003', payload, metadata);

      expect(event.type).toBe('revenue_forecast.decline_alert');
      expect(event.payload.severity).toBe('WARNING');
      expect(event.payload.declineRate).toBe(-12.5);
    });

    it('should create RevenueDeclineAlert event with CRITICAL severity', () => {
      const event = createRevenueDeclineAlertEvent(
        'agg-003',
        { ...payload, severity: 'CRITICAL', declineRate: -25 },
        metadata
      );

      expect(event.payload.severity).toBe('CRITICAL');
      expect(event.payload.declineRate).toBe(-25);
    });
  });

  describe('createRevenueVolatilityDetectedEvent', () => {
    const payload: RevenueVolatilityDetectedPayload = {
      clinicId: 'clinic-003',
      volatilityCoefficient: 0.35,
      monthlyVariance: 15000,
      forecastConfidenceLevel: 'LOW',
      stabilizationActions: ['diversify_services', 'build_recurring_revenue'],
    };

    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-vol',
      idempotencyKey: 'idem-vol',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    it('should create RevenueVolatilityDetected event', () => {
      const event = createRevenueVolatilityDetectedEvent('agg-004', payload, metadata);

      expect(event.type).toBe('revenue_forecast.volatility_detected');
      expect(event.payload.volatilityCoefficient).toBe(0.35);
      expect(event.payload.forecastConfidenceLevel).toBe('LOW');
    });
  });

  describe('createForecastAccuracyReviewedEvent', () => {
    const payload: ForecastAccuracyReviewedPayload = {
      clinicId: 'clinic-004',
      periodStart: '2024-01-01',
      periodEnd: '2024-03-31',
      forecastedRevenue: 100000,
      actualRevenue: 105000,
      mape: 5.0,
      withinConfidenceInterval: true,
      bias: -5000,
      needsRecalibration: false,
    };

    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-acc',
      idempotencyKey: 'idem-acc',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    it('should create ForecastAccuracyReviewed event', () => {
      const event = createForecastAccuracyReviewedEvent('agg-005', payload, metadata);

      expect(event.type).toBe('revenue_forecast.accuracy_reviewed');
      expect(event.payload.mape).toBe(5.0);
      expect(event.payload.withinConfidenceInterval).toBe(true);
      expect(event.payload.needsRecalibration).toBe(false);
    });

    it('should handle recalibration needed scenario', () => {
      const event = createForecastAccuracyReviewedEvent(
        'agg-005',
        { ...payload, mape: 25, withinConfidenceInterval: false, needsRecalibration: true },
        metadata
      );

      expect(event.payload.needsRecalibration).toBe(true);
      expect(event.payload.withinConfidenceInterval).toBe(false);
    });
  });

  describe('createSeasonalAnomalyDetectedEvent', () => {
    const payload: SeasonalAnomalyDetectedPayload = {
      clinicId: 'clinic-005',
      month: '2024-12',
      expectedSeasonalFactor: 0.85,
      observedFactor: 1.15,
      deviationPercentage: 35.29,
      possibleCauses: ['holiday_effect', 'promotional_campaign'],
    };

    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-sea',
      idempotencyKey: 'idem-sea',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    it('should create SeasonalAnomalyDetected event', () => {
      const event = createSeasonalAnomalyDetectedEvent('agg-006', payload, metadata);

      expect(event.type).toBe('revenue_forecast.seasonal_anomaly');
      expect(event.payload.deviationPercentage).toBe(35.29);
      expect(event.payload.possibleCauses).toHaveLength(2);
    });
  });

  describe('createBatchForecastCompletedEvent', () => {
    const payload: BatchForecastCompletedPayload = {
      batchId: 'batch-001',
      totalClinics: 100,
      succeeded: 95,
      failed: 5,
      growthDetectedCount: 30,
      declineAlertCount: 10,
      totalPredictedRevenue: 15000000,
      averageGrowthRate: 8.5,
      durationMs: 45000,
    };

    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-batch',
      idempotencyKey: 'idem-batch',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    it('should create BatchForecastCompleted event', () => {
      const event = createBatchForecastCompletedEvent('agg-007', payload, metadata);

      expect(event.type).toBe('revenue_forecast.batch_completed');
      expect(event.payload.totalClinics).toBe(100);
      expect(event.payload.succeeded).toBe(95);
      expect(event.payload.failed).toBe(5);
    });

    it('should handle all failures scenario', () => {
      const event = createBatchForecastCompletedEvent(
        'agg-007',
        { ...payload, succeeded: 0, failed: 100, growthDetectedCount: 0, declineAlertCount: 0 },
        metadata
      );

      expect(event.payload.succeeded).toBe(0);
      expect(event.payload.failed).toBe(100);
    });
  });

  describe('createForecastModelUpdatedEvent', () => {
    const payload: ForecastModelUpdatedPayload = {
      previousVersion: '2.0.0',
      newVersion: '2.1.0',
      parametersChanged: ['seasonality_weight', 'trend_smoothing'],
      updateReason: 'Improved accuracy based on backtesting',
      affectedClinics: 500,
    };

    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-model',
      idempotencyKey: 'idem-model',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    it('should create ForecastModelUpdated event', () => {
      const event = createForecastModelUpdatedEvent('agg-008', payload, metadata);

      expect(event.type).toBe('revenue_forecast.model_updated');
      expect(event.payload.previousVersion).toBe('2.0.0');
      expect(event.payload.newVersion).toBe('2.1.0');
      expect(event.payload.parametersChanged).toHaveLength(2);
    });
  });

  describe('Type Guards', () => {
    const metadata: EventMetadata = {
      eventId: mockUUID,
      timestamp: mockTimestamp,
      correlationId: 'corr-guard',
      idempotencyKey: 'idem-guard',
      version: 1,
      source: 'revenue-forecasting-service',
    };

    const createAllEvents = (): RevenueForecastDomainEvent[] => {
      return [
        createRevenueForecastGeneratedEvent(
          'agg-1',
          {
            clinicId: 'clinic-001',
            method: 'ensemble',
            confidenceLevel: 'HIGH',
            totalPredictedRevenue: 150000,
            forecastPeriods: 12,
            confidenceIntervalLower: 140000,
            confidenceIntervalUpper: 160000,
            trendDirection: 'GROWING',
            annualizedGrowthRate: 15.5,
            modelRSquared: 0.92,
            modelVersion: '2.1.0',
            dataPointsUsed: 36,
          },
          metadata
        ),
        createRevenueGrowthDetectedEvent(
          'agg-2',
          {
            clinicId: 'clinic-001',
            annualizedGrowthRate: 25.5,
            totalPredictedRevenue: 200000,
            confidenceLevel: 'HIGH',
            growthDrivers: ['new_patients'],
            recommendedActions: ['increase_capacity'],
          },
          metadata
        ),
        createRevenueDeclineAlertEvent(
          'agg-3',
          {
            clinicId: 'clinic-002',
            declineRate: -12.5,
            projectedRevenueLoss: 25000,
            previousRevenue: 200000,
            forecastedRevenue: 175000,
            riskFactors: ['competition'],
            recommendedActions: ['marketing_campaign'],
            severity: 'WARNING',
          },
          metadata
        ),
        createRevenueVolatilityDetectedEvent(
          'agg-4',
          {
            clinicId: 'clinic-003',
            volatilityCoefficient: 0.35,
            monthlyVariance: 15000,
            forecastConfidenceLevel: 'LOW',
            stabilizationActions: ['diversify_services'],
          },
          metadata
        ),
        createForecastAccuracyReviewedEvent(
          'agg-5',
          {
            clinicId: 'clinic-004',
            periodStart: '2024-01-01',
            periodEnd: '2024-03-31',
            forecastedRevenue: 100000,
            actualRevenue: 105000,
            mape: 5.0,
            withinConfidenceInterval: true,
            bias: -5000,
            needsRecalibration: false,
          },
          metadata
        ),
        createSeasonalAnomalyDetectedEvent(
          'agg-6',
          {
            clinicId: 'clinic-005',
            month: '2024-12',
            expectedSeasonalFactor: 0.85,
            observedFactor: 1.15,
            deviationPercentage: 35.29,
            possibleCauses: ['holiday_effect'],
          },
          metadata
        ),
        createBatchForecastCompletedEvent(
          'agg-7',
          {
            batchId: 'batch-001',
            totalClinics: 100,
            succeeded: 95,
            failed: 5,
            growthDetectedCount: 30,
            declineAlertCount: 10,
            totalPredictedRevenue: 15000000,
            averageGrowthRate: 8.5,
            durationMs: 45000,
          },
          metadata
        ),
        createForecastModelUpdatedEvent(
          'agg-8',
          {
            previousVersion: '2.0.0',
            newVersion: '2.1.0',
            parametersChanged: ['seasonality_weight'],
            updateReason: 'Improved accuracy',
            affectedClinics: 500,
          },
          metadata
        ),
      ];
    };

    describe('isRevenueForecastGeneratedEvent', () => {
      it('should return true for RevenueForecastGenerated event', () => {
        const events = createAllEvents();
        const generatedEvent = events[0];

        expect(isRevenueForecastGeneratedEvent(generatedEvent)).toBe(true);
      });

      it('should return false for other event types', () => {
        const events = createAllEvents();

        events.slice(1).forEach((event) => {
          expect(isRevenueForecastGeneratedEvent(event)).toBe(false);
        });
      });
    });

    describe('isRevenueGrowthDetectedEvent', () => {
      it('should return true for RevenueGrowthDetected event', () => {
        const events = createAllEvents();
        const growthEvent = events[1];

        expect(isRevenueGrowthDetectedEvent(growthEvent)).toBe(true);
      });

      it('should return false for other event types', () => {
        const events = createAllEvents();

        [events[0], ...events.slice(2)].forEach((event) => {
          expect(isRevenueGrowthDetectedEvent(event)).toBe(false);
        });
      });
    });

    describe('isRevenueDeclineAlertEvent', () => {
      it('should return true for RevenueDeclineAlert event', () => {
        const events = createAllEvents();
        const declineEvent = events[2];

        expect(isRevenueDeclineAlertEvent(declineEvent)).toBe(true);
      });

      it('should return false for other event types', () => {
        const events = createAllEvents();

        [...events.slice(0, 2), ...events.slice(3)].forEach((event) => {
          expect(isRevenueDeclineAlertEvent(event)).toBe(false);
        });
      });
    });

    describe('isRevenueVolatilityDetectedEvent', () => {
      it('should return true for RevenueVolatilityDetected event', () => {
        const events = createAllEvents();
        const volatilityEvent = events[3];

        expect(isRevenueVolatilityDetectedEvent(volatilityEvent)).toBe(true);
      });

      it('should return false for other event types', () => {
        const events = createAllEvents();

        [...events.slice(0, 3), ...events.slice(4)].forEach((event) => {
          expect(isRevenueVolatilityDetectedEvent(event)).toBe(false);
        });
      });
    });

    describe('isForecastAccuracyReviewedEvent', () => {
      it('should return true for ForecastAccuracyReviewed event', () => {
        const events = createAllEvents();
        const accuracyEvent = events[4];

        expect(isForecastAccuracyReviewedEvent(accuracyEvent)).toBe(true);
      });

      it('should return false for other event types', () => {
        const events = createAllEvents();

        [...events.slice(0, 4), ...events.slice(5)].forEach((event) => {
          expect(isForecastAccuracyReviewedEvent(event)).toBe(false);
        });
      });
    });

    describe('isSeasonalAnomalyDetectedEvent', () => {
      it('should return true for SeasonalAnomalyDetected event', () => {
        const events = createAllEvents();
        const anomalyEvent = events[5];

        expect(isSeasonalAnomalyDetectedEvent(anomalyEvent)).toBe(true);
      });

      it('should return false for other event types', () => {
        const events = createAllEvents();

        [...events.slice(0, 5), ...events.slice(6)].forEach((event) => {
          expect(isSeasonalAnomalyDetectedEvent(event)).toBe(false);
        });
      });
    });

    describe('isBatchForecastCompletedEvent', () => {
      it('should return true for BatchForecastCompleted event', () => {
        const events = createAllEvents();
        const batchEvent = events[6];

        expect(isBatchForecastCompletedEvent(batchEvent)).toBe(true);
      });

      it('should return false for other event types', () => {
        const events = createAllEvents();

        [...events.slice(0, 6), events[7]].forEach((event) => {
          expect(isBatchForecastCompletedEvent(event)).toBe(false);
        });
      });
    });

    describe('isForecastModelUpdatedEvent', () => {
      it('should return true for ForecastModelUpdated event', () => {
        const events = createAllEvents();
        const modelEvent = events[7];

        expect(isForecastModelUpdatedEvent(modelEvent)).toBe(true);
      });

      it('should return false for other event types', () => {
        const events = createAllEvents();

        events.slice(0, 7).forEach((event) => {
          expect(isForecastModelUpdatedEvent(event)).toBe(false);
        });
      });
    });
  });

  describe('UUID Generation Fallback', () => {
    it('should use fallback UUID generation when crypto.randomUUID is unavailable', () => {
      vi.unstubAllGlobals();
      vi.stubGlobal('crypto', {});

      const metadata = createRevenueForecastEventMetadata('test-corr');

      expect(metadata.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      );
    });
  });
});
