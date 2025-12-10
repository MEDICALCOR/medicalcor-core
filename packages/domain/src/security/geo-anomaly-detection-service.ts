/**
 * @fileoverview Geographic Anomaly Detection Service
 *
 * Domain service for detecting geographic access anomalies from IP addresses.
 * Implements impossible travel detection, new location alerts, and suspicious IP
 * detection for security monitoring.
 *
 * @module domain/security/geo-anomaly-detection-service
 *
 * DETECTION ALGORITHMS:
 *
 * 1. Impossible Travel
 *    - Calculates distance between consecutive access locations
 *    - Computes time between accesses
 *    - Determines required travel speed
 *    - Flags if speed exceeds max reasonable (900 km/h - subsonic flight)
 *
 * 2. New Location Detection
 *    - Tracks user's location history
 *    - Alerts on first access from new country/region/city
 *    - Configurable grace period for revisiting locations
 *
 * 3. Suspicious IP Detection
 *    - Checks for VPN/proxy/Tor exit nodes
 *    - Detects datacenter/hosting provider IPs
 *    - Flags high-risk countries
 *
 * COMPLIANCE:
 * - IP addresses are PII and logged with appropriate redaction
 * - Location data retention follows GDPR requirements
 */

/* eslint-disable max-lines-per-function, complexity */
import { createLogger } from '@medicalcor/core';
import {
  type GeoLocation,
  type GeoAnomalyType,
  type GeoAnomalyAlert,
  type GeoAnomalyConfig,
  type GeoAlertStatus,
  type ImpossibleTravelDetails,
  type CheckGeoAnomalyRequest,
  type CheckGeoAnomalyResponse,
  type LocationHistoryEntry,
  type ResolveGeoLocationRequest,
  type ResolveGeoLocationResponse,
  type GeoAlertStats,
  calculateDistanceKm,
  calculateRequiredSpeed,
  getAnomalySeverity,
  getRecommendedAction,
  getAnomalyDescription,
} from '@medicalcor/types';

/**
 * Port interface for GeoIP service
 * Defined here to avoid circular dependencies with application layer
 */
export interface IGeoIPService {
  resolve(request: ResolveGeoLocationRequest): Promise<ResolveGeoLocationResponse>;
  isInTrustedRange(ip: string, trustedRanges: string[]): boolean;
}

/**
 * Port interface for Location History Repository
 * Defined here to avoid circular dependencies with application layer
 */
export interface ILocationHistoryRepository {
  recordLocation(
    entry: Omit<LocationHistoryEntry, 'id' | 'createdAt'>
  ): Promise<LocationHistoryEntry>;
  getLastLocation(userId: string): Promise<LocationHistoryEntry | null>;
  getRecentLocations(userId: string, windowMinutes: number): Promise<LocationHistoryEntry[]>;
  isNewLocation(
    userId: string,
    location: GeoLocation,
    level: 'country' | 'region' | 'city'
  ): Promise<boolean>;
  getEffectiveConfig(clinicId?: string): Promise<GeoAnomalyConfig>;
  updateGlobalConfig(config: Partial<GeoAnomalyConfig>): Promise<GeoAnomalyConfig>;
  createAlert(alert: Omit<GeoAnomalyAlert, 'id' | 'detectedAt'>): Promise<GeoAnomalyAlert>;
  getRecentAlerts(userId: string, limit?: number): Promise<GeoAnomalyAlert[]>;
  updateAlertStatus(
    alertId: string,
    status: GeoAlertStatus,
    updatedBy: string,
    notes?: string
  ): Promise<GeoAnomalyAlert>;
  checkAlertRateLimit(
    userId: string,
    clinicId: string | undefined,
    config: GeoAnomalyConfig
  ): Promise<boolean>;
  getAlertStats(clinicId?: string, startDate?: Date, endDate?: Date): Promise<GeoAlertStats>;
  getLocationHistory(
    userId: string,
    options?: { limit?: number; startDate?: Date; endDate?: Date }
  ): Promise<LocationHistoryEntry[]>;
}

const logger = createLogger({ name: 'geo-anomaly-detection' });

/**
 * Configuration for the anomaly detection service
 */
export interface GeoAnomalyDetectionServiceConfig {
  /** Default configuration (can be overridden per clinic) */
  defaultConfig: GeoAnomalyConfig;
}

/**
 * Dependencies for the anomaly detection service
 */
export interface GeoAnomalyDetectionServiceDeps {
  /** GeoIP service for IP resolution */
  geoIPService: IGeoIPService;
  /** Repository for location history and alerts */
  locationHistoryRepository: ILocationHistoryRepository;
}

/**
 * Geographic Anomaly Detection Service
 *
 * Core domain service for detecting geographic access anomalies.
 * Uses ports from the application layer for infrastructure access.
 */
export class GeoAnomalyDetectionService {
  private readonly geoIPService: IGeoIPService;
  private readonly locationHistoryRepository: ILocationHistoryRepository;
  private readonly defaultConfig: GeoAnomalyConfig;

  constructor(config: GeoAnomalyDetectionServiceConfig, deps: GeoAnomalyDetectionServiceDeps) {
    this.defaultConfig = config.defaultConfig;
    this.geoIPService = deps.geoIPService;
    this.locationHistoryRepository = deps.locationHistoryRepository;
  }

  /**
   * Check for geographic anomalies in an access attempt
   *
   * This is the main entry point for anomaly detection.
   */
  async checkForAnomalies(request: CheckGeoAnomalyRequest): Promise<CheckGeoAnomalyResponse> {
    const { userId, clinicId, ip, accessType, userAgent, sessionId, correlationId } = request;

    logger.info({ userId, accessType, correlationId }, 'Checking for geographic anomalies');

    // Get effective configuration (clinic-specific or global)
    const config = await this.locationHistoryRepository.getEffectiveConfig(clinicId);

    // Check if IP is in trusted range
    if (
      config.trustedIpRanges.length > 0 &&
      this.geoIPService.isInTrustedRange(ip, config.trustedIpRanges)
    ) {
      logger.debug({ ip, correlationId }, 'IP in trusted range, skipping anomaly check');
      return { hasAnomalies: false, alerts: [], blocked: false, requiresMfa: false };
    }

    // Resolve IP to location
    const geoResult = await this.geoIPService.resolve({
      ip,
      includeSecurityInfo: true,
      correlationId,
    });
    if (!geoResult.success || !geoResult.location) {
      logger.warn({ ip, error: geoResult.error, correlationId }, 'Failed to resolve IP location');
      return { hasAnomalies: false, alerts: [], blocked: false, requiresMfa: false };
    }

    const currentLocation = geoResult.location;
    const alerts: GeoAnomalyAlert[] = [];
    let blocked = false;
    let requiresMfa = false;

    // Check trusted ASNs
    if (config.trustedAsns.length > 0 && currentLocation.asn) {
      if (config.trustedAsns.includes(currentLocation.asn)) {
        logger.debug(
          { ip, asn: currentLocation.asn, correlationId },
          'IP in trusted ASN, skipping anomaly check'
        );
        return {
          hasAnomalies: false,
          location: currentLocation,
          alerts: [],
          blocked: false,
          requiresMfa: false,
        };
      }
    }

    // Get previous location for comparison
    const previousLocationEntry = await this.locationHistoryRepository.getLastLocation(userId);
    const previousLocation = previousLocationEntry?.location;

    // Run all detection checks
    const detectedAnomalies: { type: GeoAnomalyType; details?: ImpossibleTravelDetails }[] = [];

    // 1. Impossible Travel Detection

    if (previousLocation && previousLocationEntry) {
      const impossibleTravel = this.checkImpossibleTravel(
        previousLocation,
        currentLocation,
        previousLocationEntry.createdAt,
        new Date(),
        config
      );
      if (impossibleTravel) {
        detectedAnomalies.push({ type: 'impossible_travel', details: impossibleTravel });
      }
    }

    // 2. New Location Detection
    if (config.alertOnNewCountry) {
      const isNewCountry = await this.locationHistoryRepository.isNewLocation(
        userId,
        currentLocation,
        'country'
      );
      if (isNewCountry) {
        detectedAnomalies.push({ type: 'new_country' });
      }
    }

    if (config.alertOnNewRegion && currentLocation.region) {
      const isNewRegion = await this.locationHistoryRepository.isNewLocation(
        userId,
        currentLocation,
        'region'
      );
      if (isNewRegion) {
        detectedAnomalies.push({ type: 'new_region' });
      }
    }

    if (config.alertOnNewCity && currentLocation.city) {
      const isNewCity = await this.locationHistoryRepository.isNewLocation(
        userId,
        currentLocation,
        'city'
      );
      if (isNewCity) {
        detectedAnomalies.push({ type: 'new_city' });
      }
    }

    // 3. Suspicious IP Detection
    if (config.alertOnProxy && currentLocation.isProxy) {
      detectedAnomalies.push({ type: 'suspicious_ip' });
    }
    if (config.alertOnVpn && currentLocation.isVpn) {
      detectedAnomalies.push({ type: 'suspicious_ip' });
    }
    if (config.alertOnTor && currentLocation.isTor) {
      detectedAnomalies.push({ type: 'suspicious_ip' });
    }
    if (config.alertOnHosting && currentLocation.isHosting) {
      detectedAnomalies.push({ type: 'suspicious_ip' });
    }
    if (config.alertOnBot && currentLocation.isBot) {
      detectedAnomalies.push({ type: 'suspicious_ip' });
    }

    // 4. High-Risk Country Detection
    if (config.highRiskCountries.includes(currentLocation.country)) {
      detectedAnomalies.push({ type: 'high_risk_country' });
    }

    // 5. Unusual Time Detection (based on user's timezone)
    if (config.alertOnUnusualTime && currentLocation.timezone) {
      const isUnusualTime = this.checkUnusualTime(currentLocation.timezone, config);
      if (isUnusualTime) {
        detectedAnomalies.push({ type: 'unusual_time' });
      }
    }

    // 6. Rapid Location Change Detection

    if (previousLocation && previousLocationEntry) {
      const isRapidChange = this.checkRapidLocationChange(
        previousLocation,
        currentLocation,
        previousLocationEntry.createdAt,
        new Date(),
        config
      );
      if (isRapidChange && !detectedAnomalies.some((a) => a.type === 'impossible_travel')) {
        detectedAnomalies.push({ type: 'rapid_location_change' });
      }
    }

    // Check rate limit before creating alerts
    const canCreateAlert = await this.locationHistoryRepository.checkAlertRateLimit(
      userId,
      clinicId,
      config
    );

    // Create alerts for detected anomalies
    if (canCreateAlert && detectedAnomalies.length > 0) {
      // Deduplicate suspicious_ip alerts
      const uniqueAnomalies = this.deduplicateAnomalies(detectedAnomalies);

      for (const anomaly of uniqueAnomalies) {
        const severity = getAnomalySeverity(anomaly.type, {
          impossibilityFactor: anomaly.details?.impossibilityFactor,
          isTor: currentLocation.isTor,
        });

        const description = getAnomalyDescription(
          anomaly.type,
          currentLocation,
          previousLocation,
          anomaly.details
        );

        const recommendedAction = getRecommendedAction(anomaly.type, severity);

        const alert = await this.locationHistoryRepository.createAlert({
          userId,
          clinicId,
          anomalyType: anomaly.type,
          severity,
          status: 'new',
          currentLocation,
          previousLocation,
          impossibleTravelDetails: anomaly.details,
          description,
          recommendedAction,
          accessType,
          sessionId,
          correlationId,
        });

        alerts.push(alert);

        // Check if we should block or require MFA
        if (severity === 'critical' && config.autoBlockOnCritical) {
          blocked = true;
        }
        if (severity === 'high' || severity === 'critical') {
          requiresMfa = true;
        }

        logger.warn(
          {
            alertId: alert.id,
            userId,
            anomalyType: anomaly.type,
            severity,
            correlationId,
          },
          'Geographic anomaly detected'
        );
      }
    }

    // Record the location in history
    await this.locationHistoryRepository.recordLocation({
      userId,
      clinicId,
      location: currentLocation,
      accessType,
      userAgent,
      sessionId,
      correlationId,
    });

    return {
      hasAnomalies: alerts.length > 0,
      location: currentLocation,
      alerts,
      blocked,
      requiresMfa,
    };
  }

  /**
   * Check for impossible travel between two locations
   */
  private checkImpossibleTravel(
    previousLocation: GeoLocation,
    currentLocation: GeoLocation,
    previousTime: Date,
    currentTime: Date,
    config: GeoAnomalyConfig
  ): ImpossibleTravelDetails | null {
    // Need coordinates for both locations
    if (!previousLocation.coordinates || !currentLocation.coordinates) {
      return null;
    }

    const distanceKm = calculateDistanceKm(
      previousLocation.coordinates,
      currentLocation.coordinates
    );

    // Skip if distance is below threshold
    if (distanceKm < config.minDistanceForTravelCheckKm) {
      return null;
    }

    const timeDifferenceMinutes = (currentTime.getTime() - previousTime.getTime()) / (1000 * 60);

    // Skip if enough time has passed (24+ hours)
    if (timeDifferenceMinutes >= 24 * 60) {
      return null;
    }

    const requiredSpeedKmh = calculateRequiredSpeed(distanceKm, timeDifferenceMinutes);
    const impossibilityFactor = requiredSpeedKmh / config.maxReasonableSpeedKmh;

    // Only flag if significantly faster than max reasonable speed
    if (impossibilityFactor >= config.impossibilityFactorThreshold) {
      return {
        previousLocation,
        currentLocation,
        distanceKm,
        timeDifferenceMinutes,
        requiredSpeedKmh,
        maxReasonableSpeedKmh: config.maxReasonableSpeedKmh,
        impossibilityFactor,
      };
    }

    return null;
  }

  /**
   * Check for rapid location changes (not impossible but suspicious)
   */
  private checkRapidLocationChange(
    previousLocation: GeoLocation,
    currentLocation: GeoLocation,
    previousTime: Date,
    currentTime: Date,
    _config: GeoAnomalyConfig
  ): boolean {
    // Different country within 1 hour is suspicious
    if (previousLocation.country !== currentLocation.country) {
      const timeDifferenceMinutes = (currentTime.getTime() - previousTime.getTime()) / (1000 * 60);
      return timeDifferenceMinutes < 60;
    }

    // Different region within 15 minutes is suspicious
    if (previousLocation.region !== currentLocation.region) {
      const timeDifferenceMinutes = (currentTime.getTime() - previousTime.getTime()) / (1000 * 60);
      return timeDifferenceMinutes < 15;
    }

    return false;
  }

  /**
   * Check if access is at an unusual time for the timezone
   */
  private checkUnusualTime(timezone: string, config: GeoAnomalyConfig): boolean {
    try {
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      });
      const hour = parseInt(formatter.format(new Date()), 10);

      // Check if hour is within unusual hours range
      if (config.unusualHoursStart < config.unusualHoursEnd) {
        // Simple range (e.g., 1 AM - 5 AM)
        return hour >= config.unusualHoursStart && hour < config.unusualHoursEnd;
      } else {
        // Wrapping range (e.g., 23 PM - 5 AM)
        return hour >= config.unusualHoursStart || hour < config.unusualHoursEnd;
      }
    } catch {
      // Invalid timezone, skip check
      return false;
    }
  }

  /**
   * Deduplicate anomalies (e.g., multiple suspicious_ip flags)
   */
  private deduplicateAnomalies(
    anomalies: { type: GeoAnomalyType; details?: ImpossibleTravelDetails }[]
  ): { type: GeoAnomalyType; details?: ImpossibleTravelDetails }[] {
    const seen = new Set<GeoAnomalyType>();
    return anomalies.filter((anomaly) => {
      if (seen.has(anomaly.type)) {
        return false;
      }
      seen.add(anomaly.type);
      return true;
    });
  }

  /**
   * Get alerts for a user
   */
  async getUserAlerts(userId: string, limit?: number): Promise<GeoAnomalyAlert[]> {
    return this.locationHistoryRepository.getRecentAlerts(userId, limit);
  }

  /**
   * Get user's location history
   */
  async getUserLocationHistory(
    userId: string,
    options?: { limit?: number; startDate?: Date; endDate?: Date }
  ) {
    return this.locationHistoryRepository.getLocationHistory(userId, options);
  }

  /**
   * Update alert status
   */
  async updateAlertStatus(
    alertId: string,
    status: GeoAnomalyAlert['status'],
    updatedBy: string,
    notes?: string
  ): Promise<GeoAnomalyAlert> {
    return this.locationHistoryRepository.updateAlertStatus(alertId, status, updatedBy, notes);
  }

  /**
   * Get alert statistics
   */
  async getAlertStats(clinicId?: string, startDate?: Date, endDate?: Date) {
    return this.locationHistoryRepository.getAlertStats(clinicId, startDate, endDate);
  }
}

/**
 * Factory function to create the anomaly detection service
 */
export function createGeoAnomalyDetectionService(
  config: GeoAnomalyDetectionServiceConfig,
  deps: GeoAnomalyDetectionServiceDeps
): GeoAnomalyDetectionService {
  return new GeoAnomalyDetectionService(config, deps);
}

/**
 * Default configuration for anomaly detection
 */
export const DEFAULT_GEO_ANOMALY_CONFIG: GeoAnomalyConfig = {
  maxReasonableSpeedKmh: 900,
  minDistanceForTravelCheckKm: 100,
  impossibilityFactorThreshold: 1.5,
  alertOnUnusualTime: false,
  unusualHoursStart: 1,
  unusualHoursEnd: 5,
  alertOnNewCountry: true,
  alertOnNewRegion: false,
  alertOnNewCity: false,
  newLocationGracePeriodDays: 0,
  alertOnProxy: true,
  alertOnVpn: true,
  alertOnTor: true,
  alertOnHosting: true,
  alertOnBot: true,
  highRiskCountries: [],
  trustedIpRanges: [],
  trustedAsns: [],
  maxAlertsPerUserPerHour: 5,
  maxAlertsPerClinicPerHour: 50,
  notifySupervisors: true,
  notifySecurityTeam: true,
  notifyAffectedUser: false,
  autoBlockOnCritical: false,
};
