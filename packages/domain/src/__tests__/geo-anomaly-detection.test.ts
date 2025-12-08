/**
 * @fileoverview Geographic Anomaly Detection Service Tests
 *
 * Comprehensive tests for IP-based geolocation anomaly detection.
 * Tests impossible travel, new location detection, and suspicious IP handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  GeoAnomalyDetectionService,
  createGeoAnomalyDetectionService,
  DEFAULT_GEO_ANOMALY_CONFIG,
  type IGeoIPService,
  type ILocationHistoryRepository,
} from '../security/geo-anomaly-detection-service.js';
import type {
  GeoLocation,
  GeoAnomalyAlert,
  GeoAnomalyConfig,
  LocationHistoryEntry,
  GeoAlertStats,
  GeoAlertStatus,
} from '@medicalcor/types';
import {
  calculateDistanceKm,
  calculateRequiredSpeed,
  isImpossibleTravel,
  getAnomalySeverity,
  getRecommendedAction,
  getAnomalyDescription,
} from '@medicalcor/types';

/**
 * Create a mock GeoIP service for testing
 */
function createMockGeoIPService(overrides?: Partial<Record<string, GeoLocation>>): IGeoIPService {
  const defaultLocation: GeoLocation = {
    ip: '127.0.0.1',
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
      accuracy: 10,
    },
    isProxy: false,
    isVpn: false,
    isTor: false,
    isHosting: false,
    isBot: false,
    threatLevel: 'none',
    resolvedAt: new Date(),
  };

  const cache = new Map<string, GeoLocation>(Object.entries(overrides ?? {}));

  return {
    async resolve(request) {
      const cached = cache.get(request.ip);
      if (cached) {
        return {
          success: true,
          location: { ...cached, resolvedAt: new Date() },
          cached: true,
          provider: 'mock',
        };
      }

      return {
        success: true,
        location: { ...defaultLocation, ip: request.ip, resolvedAt: new Date() },
        cached: false,
        provider: 'mock',
      };
    },

    isInTrustedRange(ip, trustedRanges) {
      if (ip === '127.0.0.1' || ip === '::1') {
        return true;
      }
      // Simple CIDR check for testing - check if IP is in the same network
      return trustedRanges.some((range) => {
        const [network, mask] = range.split('/');
        if (!mask) {
          return ip === network;
        }
        // For /24, check first 3 octets match
        const ipParts = ip.split('.');
        const networkParts = network.split('.');
        const maskNum = parseInt(mask, 10);
        const octetsToCheck = Math.floor(maskNum / 8);
        for (let i = 0; i < octetsToCheck; i++) {
          if (ipParts[i] !== networkParts[i]) {
            return false;
          }
        }
        return true;
      });
    },
  };
}

/**
 * Create an in-memory location history repository for testing
 */
function createInMemoryLocationHistoryRepository(): ILocationHistoryRepository {
  const locations: LocationHistoryEntry[] = [];
  const alerts: GeoAnomalyAlert[] = [];
  let globalConfig: GeoAnomalyConfig = { ...DEFAULT_GEO_ANOMALY_CONFIG };

  return {
    async recordLocation(entry) {
      const newEntry: LocationHistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      };
      locations.push(newEntry);
      return newEntry;
    },

    async getLastLocation(userId) {
      const userLocations = locations
        .filter((l) => l.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return userLocations[0] ?? null;
    },

    async getRecentLocations(userId, windowMinutes) {
      const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000);
      return locations
        .filter((l) => l.userId === userId && l.createdAt >= cutoff)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    },

    async isNewLocation(userId, location, level) {
      const userLocations = locations.filter((l) => l.userId === userId);
      switch (level) {
        case 'country':
          return !userLocations.some((l) => l.location.country === location.country);
        case 'region':
          return !userLocations.some(
            (l) => l.location.country === location.country && l.location.region === location.region
          );
        case 'city':
          return !userLocations.some(
            (l) =>
              l.location.country === location.country &&
              l.location.region === location.region &&
              l.location.city === location.city
          );
      }
    },

    async getEffectiveConfig() {
      return { ...globalConfig };
    },

    async updateGlobalConfig(config) {
      globalConfig = { ...globalConfig, ...config };
      return { ...globalConfig };
    },

    async createAlert(alert) {
      const newAlert: GeoAnomalyAlert = {
        ...alert,
        id: crypto.randomUUID(),
        detectedAt: new Date(),
      };
      alerts.push(newAlert);
      return newAlert;
    },

    async getRecentAlerts(userId, limit = 10) {
      return alerts
        .filter((a) => a.userId === userId)
        .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
        .slice(0, limit);
    },

    async updateAlertStatus(alertId, status, updatedBy, notes) {
      const alert = alerts.find((a) => a.id === alertId);
      if (!alert) {
        throw new Error(`Alert not found: ${alertId}`);
      }

      alert.status = status;
      if (status === 'acknowledged') {
        alert.acknowledgedAt = new Date();
        alert.acknowledgedBy = updatedBy;
      } else if (status === 'resolved' || status === 'false_positive') {
        alert.resolvedAt = new Date();
        alert.resolvedBy = updatedBy;
        if (notes) {
          alert.resolutionNotes = notes;
        }
      }

      return alert;
    },

    async checkAlertRateLimit(userId, clinicId, config) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const userAlerts = alerts.filter(
        (a) => a.userId === userId && a.detectedAt >= oneHourAgo
      ).length;
      return userAlerts < config.maxAlertsPerUserPerHour;
    },

    async getAlertStats(clinicId, startDate, endDate) {
      const filtered = alerts.filter(
        (a) =>
          (!clinicId || a.clinicId === clinicId) &&
          (!startDate || a.detectedAt >= startDate) &&
          (!endDate || a.detectedAt <= endDate)
      );

      const alertsByType: Record<string, number> = {};
      const alertsBySeverity: Record<string, number> = {};
      const alertsByStatus: Record<string, number> = {};
      const userSet = new Set<string>();

      for (const alert of filtered) {
        alertsByType[alert.anomalyType] = (alertsByType[alert.anomalyType] ?? 0) + 1;
        alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] ?? 0) + 1;
        alertsByStatus[alert.status] = (alertsByStatus[alert.status] ?? 0) + 1;
        userSet.add(alert.userId);
      }

      return {
        totalAlerts: filtered.length,
        alertsByType: alertsByType as GeoAlertStats['alertsByType'],
        alertsBySeverity: alertsBySeverity as GeoAlertStats['alertsBySeverity'],
        alertsByStatus: alertsByStatus as GeoAlertStats['alertsByStatus'],
        alertsByCountry: [],
        uniqueUsersAffected: userSet.size,
        blockedAccessCount: 0,
        periodStart: startDate ?? new Date(0),
        periodEnd: endDate ?? new Date(),
      };
    },

    async getLocationHistory(userId, options) {
      let filtered = locations.filter((l) => l.userId === userId);
      if (options?.startDate) {
        filtered = filtered.filter((l) => l.createdAt >= options.startDate!);
      }
      if (options?.endDate) {
        filtered = filtered.filter((l) => l.createdAt <= options.endDate!);
      }
      filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return options?.limit ? filtered.slice(0, options.limit) : filtered;
    },
  };
}

describe('GeoAnomalyDetectionService', () => {
  let service: GeoAnomalyDetectionService;
  let mockGeoIPService: IGeoIPService;
  let mockLocationRepo: ILocationHistoryRepository;

  const sanFranciscoLocation: GeoLocation = {
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
    isProxy: false,
    isVpn: false,
    isTor: false,
    isHosting: false,
    isBot: false,
    threatLevel: 'none',
    resolvedAt: new Date(),
  };

  const londonLocation: GeoLocation = {
    ip: '203.0.113.1',
    country: 'GB',
    countryName: 'United Kingdom',
    region: 'ENG',
    regionName: 'England',
    city: 'London',
    postalCode: 'EC1A',
    timezone: 'Europe/London',
    coordinates: {
      latitude: 51.5074,
      longitude: -0.1278,
    },
    isProxy: false,
    isVpn: false,
    isTor: false,
    isHosting: false,
    isBot: false,
    threatLevel: 'none',
    resolvedAt: new Date(),
  };

  const torExitLocation: GeoLocation = {
    ip: '192.0.2.1',
    country: 'NL',
    countryName: 'Netherlands',
    city: 'Amsterdam',
    timezone: 'Europe/Amsterdam',
    coordinates: {
      latitude: 52.3676,
      longitude: 4.9041,
    },
    isProxy: false,
    isVpn: false,
    isTor: true,
    isHosting: false,
    isBot: false,
    threatLevel: 'high',
    resolvedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mocks with predefined locations
    mockGeoIPService = createMockGeoIPService({
      '198.51.100.1': sanFranciscoLocation,
      '203.0.113.1': londonLocation,
      '192.0.2.1': torExitLocation,
    });

    mockLocationRepo = createInMemoryLocationHistoryRepository();

    service = createGeoAnomalyDetectionService(
      { defaultConfig: DEFAULT_GEO_ANOMALY_CONFIG },
      {
        geoIPService: mockGeoIPService,
        locationHistoryRepository: mockLocationRepo,
      }
    );
  });

  describe('checkForAnomalies', () => {
    it('should not detect anomalies for first access from a known location', async () => {
      // Pre-record this location so it's "known"
      await mockLocationRepo.recordLocation({
        userId: 'user-1',
        location: sanFranciscoLocation,
        accessType: 'login',
        correlationId: 'corr-0',
      });

      const result = await service.checkForAnomalies({
        userId: 'user-1',
        ip: '198.51.100.1',
        accessType: 'login',
        correlationId: 'corr-1',
      });

      expect(result.hasAnomalies).toBe(false);
      expect(result.alerts).toHaveLength(0);
      expect(result.location).toBeDefined();
      expect(result.location?.city).toBe('San Francisco');
    });

    it('should detect new country access', async () => {
      // Pre-record US location so it's known (with old timestamp to avoid rapid_location_change)
      const oldEntry = {
        userId: 'country-user-1',
        location: sanFranciscoLocation,
        accessType: 'login' as const,
        correlationId: 'corr-0',
      };
      const recorded = await mockLocationRepo.recordLocation(oldEntry);
      // Backdate the entry to 2 hours ago to avoid rapid_location_change detection
      (recorded as { createdAt: Date }).createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000);

      // Access from London (new country)
      const result = await service.checkForAnomalies({
        userId: 'country-user-1',
        ip: '203.0.113.1',
        accessType: 'login',
        correlationId: 'corr-1',
      });

      expect(result.hasAnomalies).toBe(true);
      // Should have new_country alert (may also have others based on timing)
      const newCountryAlert = result.alerts.find((a) => a.anomalyType === 'new_country');
      expect(newCountryAlert).toBeDefined();
      expect(newCountryAlert?.currentLocation.country).toBe('GB');
    });

    it('should detect suspicious IP (Tor exit node)', async () => {
      const result = await service.checkForAnomalies({
        userId: 'user-1',
        ip: '192.0.2.1',
        accessType: 'login',
        correlationId: 'corr-1',
      });

      expect(result.hasAnomalies).toBe(true);
      expect(result.alerts.some((a) => a.anomalyType === 'suspicious_ip')).toBe(true);
    });

    it('should detect impossible travel', async () => {
      // First access from San Francisco
      await mockLocationRepo.recordLocation({
        userId: 'user-1',
        location: sanFranciscoLocation,
        accessType: 'login',
        correlationId: 'corr-1',
      });

      // Immediately after, access from London (8,600 km away)
      const result = await service.checkForAnomalies({
        userId: 'user-1',
        ip: '203.0.113.1',
        accessType: 'login',
        correlationId: 'corr-2',
      });

      expect(result.hasAnomalies).toBe(true);
      const impossibleTravelAlert = result.alerts.find(
        (a) => a.anomalyType === 'impossible_travel'
      );
      expect(impossibleTravelAlert).toBeDefined();
      expect(impossibleTravelAlert?.impossibleTravelDetails).toBeDefined();
      expect(impossibleTravelAlert?.impossibleTravelDetails?.distanceKm).toBeGreaterThan(8000);
    });

    it('should respect trusted IP ranges', async () => {
      // Update config with trusted range
      await mockLocationRepo.updateGlobalConfig({
        trustedIpRanges: ['192.0.2.0/24'],
      });

      const result = await service.checkForAnomalies({
        userId: 'user-1',
        ip: '192.0.2.1',
        accessType: 'login',
        correlationId: 'corr-1',
      });

      expect(result.hasAnomalies).toBe(false);
    });

    it('should enforce rate limits for alerts', async () => {
      // Set very low rate limit
      await mockLocationRepo.updateGlobalConfig({
        maxAlertsPerUserPerHour: 1,
      });

      // First access triggers alert
      await service.checkForAnomalies({
        userId: 'user-1',
        ip: '192.0.2.1',
        accessType: 'login',
        correlationId: 'corr-1',
      });

      // Second access should not create new alert due to rate limit
      const result = await service.checkForAnomalies({
        userId: 'user-1',
        ip: '192.0.2.1',
        accessType: 'login',
        correlationId: 'corr-2',
      });

      expect(result.hasAnomalies).toBe(false);
    });

    it('should require MFA for high severity alerts', async () => {
      const result = await service.checkForAnomalies({
        userId: 'user-1',
        ip: '192.0.2.1', // Tor exit (high severity)
        accessType: 'login',
        correlationId: 'corr-1',
      });

      expect(result.blocked).toBe(false);
      expect(result.requiresMfa).toBe(true);
    });
  });

  describe('updateAlertStatus', () => {
    it('should update alert status to acknowledged', async () => {
      // Pre-record NL location to avoid new_country alert
      await mockLocationRepo.recordLocation({
        userId: 'status-user-1',
        location: torExitLocation,
        accessType: 'login',
        correlationId: 'corr-0',
      });

      await service.checkForAnomalies({
        userId: 'status-user-1',
        ip: '192.0.2.1',
        accessType: 'login',
        correlationId: 'corr-1',
      });

      const alerts = await service.getUserAlerts('status-user-1');
      expect(alerts.length).toBeGreaterThanOrEqual(1);

      const updatedAlert = await service.updateAlertStatus(
        alerts[0]!.id,
        'acknowledged',
        'admin-1'
      );

      expect(updatedAlert.status).toBe('acknowledged');
      expect(updatedAlert.acknowledgedBy).toBe('admin-1');
      expect(updatedAlert.acknowledgedAt).toBeDefined();
    });

    it('should update alert status to resolved with notes', async () => {
      await service.checkForAnomalies({
        userId: 'user-1',
        ip: '192.0.2.1',
        accessType: 'login',
        correlationId: 'corr-1',
      });

      const alerts = await service.getUserAlerts('user-1');

      const updatedAlert = await service.updateAlertStatus(
        alerts[0]!.id,
        'resolved',
        'admin-1',
        'Confirmed legitimate VPN use for remote work'
      );

      expect(updatedAlert.status).toBe('resolved');
      expect(updatedAlert.resolvedBy).toBe('admin-1');
      expect(updatedAlert.resolvedAt).toBeDefined();
      expect(updatedAlert.resolutionNotes).toContain('legitimate VPN');
    });
  });

  describe('getAlertStats', () => {
    it('should return aggregated statistics', async () => {
      // Pre-record NL location for both users to avoid new_country alerts
      await mockLocationRepo.recordLocation({
        userId: 'stats-user-1',
        location: torExitLocation,
        accessType: 'login',
        correlationId: 'corr-0a',
      });
      await mockLocationRepo.recordLocation({
        userId: 'stats-user-2',
        location: torExitLocation,
        accessType: 'login',
        correlationId: 'corr-0b',
      });

      // Create suspicious_ip alerts
      await service.checkForAnomalies({
        userId: 'stats-user-1',
        ip: '192.0.2.1',
        accessType: 'login',
        correlationId: 'corr-1',
      });

      await service.checkForAnomalies({
        userId: 'stats-user-2',
        ip: '192.0.2.1',
        accessType: 'login',
        correlationId: 'corr-2',
      });

      const stats = await service.getAlertStats();

      // Each user gets at least 1 suspicious_ip alert
      expect(stats.totalAlerts).toBeGreaterThanOrEqual(2);
      expect(stats.uniqueUsersAffected).toBe(2);
      expect(stats.alertsByType.suspicious_ip).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('Geolocation Helper Functions', () => {
  describe('calculateDistanceKm', () => {
    it('should calculate distance between San Francisco and London', () => {
      const sf = { latitude: 37.7749, longitude: -122.4194 };
      const london = { latitude: 51.5074, longitude: -0.1278 };

      const distance = calculateDistanceKm(sf, london);

      expect(distance).toBeGreaterThan(8500);
      expect(distance).toBeLessThan(8700);
    });

    it('should return 0 for same location', () => {
      const sf = { latitude: 37.7749, longitude: -122.4194 };
      expect(calculateDistanceKm(sf, sf)).toBe(0);
    });

    it('should calculate distance across the date line', () => {
      const tokyo = { latitude: 35.6762, longitude: 139.6503 };
      const losAngeles = { latitude: 34.0522, longitude: -118.2437 };

      const distance = calculateDistanceKm(tokyo, losAngeles);

      expect(distance).toBeGreaterThan(8700);
      expect(distance).toBeLessThan(9000);
    });
  });

  describe('calculateRequiredSpeed', () => {
    it('should calculate speed correctly', () => {
      const speed = calculateRequiredSpeed(100, 60);
      expect(speed).toBe(100);
    });

    it('should return Infinity for zero time', () => {
      const speed = calculateRequiredSpeed(100, 0);
      expect(speed).toBe(Infinity);
    });

    it('should handle fractional time', () => {
      const speed = calculateRequiredSpeed(100, 30);
      expect(speed).toBe(200);
    });
  });

  describe('isImpossibleTravel', () => {
    it('should detect impossible travel', () => {
      const sf = { latitude: 37.7749, longitude: -122.4194 };
      const london = { latitude: 51.5074, longitude: -0.1278 };
      expect(isImpossibleTravel(sf, london, 1)).toBe(true);
    });

    it('should allow reasonable travel time', () => {
      const sf = { latitude: 37.7749, longitude: -122.4194 };
      const london = { latitude: 51.5074, longitude: -0.1278 };
      expect(isImpossibleTravel(sf, london, 12 * 60)).toBe(false);
    });

    it('should respect custom max speed', () => {
      const sf = { latitude: 37.7749, longitude: -122.4194 };
      const london = { latitude: 51.5074, longitude: -0.1278 };
      expect(isImpossibleTravel(sf, london, 12 * 60, 500)).toBe(true);
    });
  });

  describe('getAnomalySeverity', () => {
    it('should return critical for high impossibility factor', () => {
      expect(getAnomalySeverity('impossible_travel', { impossibilityFactor: 10 })).toBe('critical');
    });

    it('should return high for Tor exit', () => {
      expect(getAnomalySeverity('suspicious_ip', { isTor: true })).toBe('high');
    });

    it('should return medium for VPN/proxy', () => {
      expect(getAnomalySeverity('suspicious_ip')).toBe('medium');
    });

    it('should return low for new city', () => {
      expect(getAnomalySeverity('new_city')).toBe('low');
    });
  });

  describe('getRecommendedAction', () => {
    it('should recommend immediate action for critical severity', () => {
      const action = getRecommendedAction('impossible_travel', 'critical');
      expect(action).toContain('Immediately');
    });

    it('should recommend MFA for suspicious IP', () => {
      const action = getRecommendedAction('suspicious_ip', 'medium');
      expect(action).toContain('MFA');
    });

    it('should recommend logging for new city', () => {
      const action = getRecommendedAction('new_city', 'low');
      expect(action).toContain('reference');
    });
  });

  describe('getAnomalyDescription', () => {
    const sfLocation: GeoLocation = {
      ip: '1.1.1.1',
      country: 'US',
      countryName: 'United States',
      city: 'San Francisco',
      regionName: 'California',
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
