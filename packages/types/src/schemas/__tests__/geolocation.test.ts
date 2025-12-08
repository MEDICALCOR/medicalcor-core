/**
 * @fileoverview Geolocation Schema Tests
 *
 * Tests for IP geolocation schemas, helper functions, and validation.
 */

import { describe, it, expect } from 'vitest';
import {
  GeoCoordinatesSchema,
  GeoLocationSchema,
  LocationHistoryEntrySchema,
  GeoAnomalyAlertSchema,
  GeoAnomalyConfigSchema,
  CheckGeoAnomalyRequestSchema,
  GeoAlertQueryFiltersSchema,
  calculateDistanceKm,
  calculateRequiredSpeed,
  isImpossibleTravel,
  getAnomalySeverity,
  getRecommendedAction,
  getAnomalyDescription,
  type GeoLocation,
  type GeoCoordinates,
} from '../geolocation.js';

describe('GeoCoordinatesSchema', () => {
  it('should validate valid coordinates', () => {
    const result = GeoCoordinatesSchema.safeParse({
      latitude: 37.7749,
      longitude: -122.4194,
    });
    expect(result.success).toBe(true);
  });

  it('should accept optional accuracy', () => {
    const result = GeoCoordinatesSchema.safeParse({
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 10,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accuracy).toBe(10);
    }
  });

  it('should reject invalid latitude', () => {
    const result = GeoCoordinatesSchema.safeParse({
      latitude: 91, // Invalid: > 90
      longitude: -122.4194,
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid longitude', () => {
    const result = GeoCoordinatesSchema.safeParse({
      latitude: 37.7749,
      longitude: 181, // Invalid: > 180
    });
    expect(result.success).toBe(false);
  });

  it('should accept edge case coordinates', () => {
    // North Pole
    expect(GeoCoordinatesSchema.safeParse({ latitude: 90, longitude: 0 }).success).toBe(true);

    // South Pole
    expect(GeoCoordinatesSchema.safeParse({ latitude: -90, longitude: 0 }).success).toBe(true);

    // Date Line
    expect(GeoCoordinatesSchema.safeParse({ latitude: 0, longitude: 180 }).success).toBe(true);
    expect(GeoCoordinatesSchema.safeParse({ latitude: 0, longitude: -180 }).success).toBe(true);
  });
});

describe('GeoLocationSchema', () => {
  const validLocation = {
    ip: '198.51.100.1',
    country: 'US',
    countryName: 'United States',
    region: 'CA',
    regionName: 'California',
    city: 'San Francisco',
    postalCode: '94102',
    timezone: 'America/Los_Angeles',
    coordinates: {
      latitude: 37.7749,
      longitude: -122.4194,
    },
    isp: 'Example ISP',
    organization: 'Example Org',
    isProxy: false,
    isVpn: false,
    isTor: false,
    isHosting: false,
    isBot: false,
    threatLevel: 'none' as const,
    resolvedAt: new Date(),
  };

  it('should validate a complete location', () => {
    const result = GeoLocationSchema.safeParse(validLocation);
    expect(result.success).toBe(true);
  });

  it('should validate minimal required fields', () => {
    const result = GeoLocationSchema.safeParse({
      ip: '198.51.100.1',
      country: 'US',
      countryName: 'United States',
      resolvedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should validate IPv6 addresses', () => {
    const result = GeoLocationSchema.safeParse({
      ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
      country: 'US',
      countryName: 'United States',
      resolvedAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid IP address', () => {
    const result = GeoLocationSchema.safeParse({
      ...validLocation,
      ip: 'invalid-ip',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid country code', () => {
    const result = GeoLocationSchema.safeParse({
      ...validLocation,
      country: 'USA', // Should be 2 characters
    });
    expect(result.success).toBe(false);
  });

  it('should default security flags to false', () => {
    const result = GeoLocationSchema.safeParse({
      ip: '198.51.100.1',
      country: 'US',
      countryName: 'United States',
      resolvedAt: new Date(),
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isProxy).toBe(false);
      expect(result.data.isVpn).toBe(false);
      expect(result.data.isTor).toBe(false);
      expect(result.data.isHosting).toBe(false);
      expect(result.data.isBot).toBe(false);
      expect(result.data.threatLevel).toBe('none');
    }
  });

  it('should validate all threat levels', () => {
    for (const level of ['none', 'low', 'medium', 'high'] as const) {
      const result = GeoLocationSchema.safeParse({
        ...validLocation,
        threatLevel: level,
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('GeoAnomalyConfigSchema', () => {
  it('should validate with defaults', () => {
    const result = GeoAnomalyConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.maxReasonableSpeedKmh).toBe(900);
      expect(result.data.alertOnNewCountry).toBe(true);
      expect(result.data.alertOnVpn).toBe(true);
    }
  });

  it('should validate custom high-risk countries', () => {
    const result = GeoAnomalyConfigSchema.safeParse({
      highRiskCountries: ['KP', 'IR', 'SY'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.highRiskCountries).toHaveLength(3);
    }
  });

  it('should validate trusted IP ranges', () => {
    const result = GeoAnomalyConfigSchema.safeParse({
      trustedIpRanges: ['10.0.0.0/8', '192.168.0.0/16'],
    });
    expect(result.success).toBe(true);
  });

  it('should validate unusual hours configuration', () => {
    const result = GeoAnomalyConfigSchema.safeParse({
      unusualHoursStart: 23,
      unusualHoursEnd: 6,
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid unusual hours', () => {
    const result = GeoAnomalyConfigSchema.safeParse({
      unusualHoursStart: 25, // Invalid
    });
    expect(result.success).toBe(false);
  });
});

describe('CheckGeoAnomalyRequestSchema', () => {
  it('should validate a complete request', () => {
    const result = CheckGeoAnomalyRequestSchema.safeParse({
      userId: '123e4567-e89b-12d3-a456-426614174000',
      clinicId: '123e4567-e89b-12d3-a456-426614174001',
      ip: '198.51.100.1',
      accessType: 'login',
      userAgent: 'Mozilla/5.0',
      sessionId: 'session-123',
      correlationId: 'corr-123',
    });
    expect(result.success).toBe(true);
  });

  it('should validate all access types', () => {
    const accessTypes = ['login', 'api_call', 'session_activity', 'password_reset', 'mfa_setup'];
    for (const accessType of accessTypes) {
      const result = CheckGeoAnomalyRequestSchema.safeParse({
        userId: '123e4567-e89b-12d3-a456-426614174000',
        ip: '198.51.100.1',
        accessType,
        correlationId: 'corr-123',
      });
      expect(result.success).toBe(true);
    }
  });
});

describe('GeoAlertQueryFiltersSchema', () => {
  it('should validate with defaults', () => {
    const result = GeoAlertQueryFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(100);
      expect(result.data.offset).toBe(0);
      expect(result.data.sortBy).toBe('detectedAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should validate date range filters', () => {
    const result = GeoAlertQueryFiltersSchema.safeParse({
      startDate: '2024-01-01',
      endDate: '2024-12-31',
    });
    expect(result.success).toBe(true);
  });

  it('should validate all anomaly types', () => {
    const anomalyTypes = [
      'impossible_travel',
      'new_country',
      'new_region',
      'new_city',
      'suspicious_ip',
      'high_risk_country',
      'unusual_time',
      'rapid_location_change',
      'simultaneous_sessions',
    ];
    for (const anomalyType of anomalyTypes) {
      const result = GeoAlertQueryFiltersSchema.safeParse({ anomalyType });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid limit', () => {
    const result = GeoAlertQueryFiltersSchema.safeParse({ limit: 2000 });
    expect(result.success).toBe(false);
  });
});

describe('Helper Functions', () => {
  describe('calculateDistanceKm', () => {
    it('should calculate distance correctly', () => {
      // San Francisco to New York: ~4,130 km
      const sf: GeoCoordinates = { latitude: 37.7749, longitude: -122.4194 };
      const ny: GeoCoordinates = { latitude: 40.7128, longitude: -74.006 };

      const distance = calculateDistanceKm(sf, ny);

      expect(distance).toBeGreaterThan(4000);
      expect(distance).toBeLessThan(4300);
    });

    it('should return 0 for same location', () => {
      const coords: GeoCoordinates = { latitude: 37.7749, longitude: -122.4194 };
      expect(calculateDistanceKm(coords, coords)).toBe(0);
    });
  });

  describe('calculateRequiredSpeed', () => {
    it('should calculate speed in km/h', () => {
      // 100 km in 60 minutes = 100 km/h
      expect(calculateRequiredSpeed(100, 60)).toBeCloseTo(100, 5);

      // 500 km in 30 minutes = 1000 km/h
      expect(calculateRequiredSpeed(500, 30)).toBeCloseTo(1000, 5);
    });

    it('should return Infinity for zero time', () => {
      expect(calculateRequiredSpeed(100, 0)).toBe(Infinity);
    });
  });

  describe('isImpossibleTravel', () => {
    const sf: GeoCoordinates = { latitude: 37.7749, longitude: -122.4194 };
    const london: GeoCoordinates = { latitude: 51.5074, longitude: -0.1278 };

    it('should detect impossible travel', () => {
      // SF to London (~8,600 km) in 1 minute is impossible
      expect(isImpossibleTravel(sf, london, 1)).toBe(true);
    });

    it('should allow reasonable travel', () => {
      // SF to London in 12 hours (~717 km/h) is possible by plane
      expect(isImpossibleTravel(sf, london, 12 * 60)).toBe(false);
    });

    it('should use custom max speed', () => {
      // With max 500 km/h, 12 hours isn't enough
      expect(isImpossibleTravel(sf, london, 12 * 60, 500)).toBe(true);
    });
  });

  describe('getAnomalySeverity', () => {
    it('should return correct severity for impossible travel', () => {
      expect(getAnomalySeverity('impossible_travel', { impossibilityFactor: 10 })).toBe('critical');
      expect(getAnomalySeverity('impossible_travel', { impossibilityFactor: 2 })).toBe('high');
    });

    it('should return correct severity for suspicious IP', () => {
      expect(getAnomalySeverity('suspicious_ip', { isTor: true })).toBe('high');
      expect(getAnomalySeverity('suspicious_ip')).toBe('medium');
    });

    it('should return correct severity for new locations', () => {
      expect(getAnomalySeverity('new_country')).toBe('medium');
      expect(getAnomalySeverity('new_region')).toBe('low');
      expect(getAnomalySeverity('new_city')).toBe('low');
    });
  });

  describe('getRecommendedAction', () => {
    it('should return appropriate actions', () => {
      expect(getRecommendedAction('impossible_travel', 'critical')).toContain('Immediately');
      expect(getRecommendedAction('suspicious_ip', 'medium')).toContain('MFA');
      expect(getRecommendedAction('new_country', 'medium')).toContain('Verify');
    });
  });

  describe('getAnomalyDescription', () => {
    const sfLocation: GeoLocation = {
      ip: '1.1.1.1',
      country: 'US',
      countryName: 'United States',
      city: 'San Francisco',
      isProxy: false,
      isVpn: false,
      isTor: false,
      isHosting: false,
      isBot: false,
      threatLevel: 'none',
      resolvedAt: new Date(),
    };

    it('should describe new country', () => {
      const desc = getAnomalyDescription('new_country', sfLocation);
      expect(desc).toContain('United States');
    });

    it('should describe suspicious IP', () => {
      const torLocation: GeoLocation = { ...sfLocation, isTor: true };
      const desc = getAnomalyDescription('suspicious_ip', torLocation);
      expect(desc).toContain('Tor');
    });
  });
});
