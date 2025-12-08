/**
 * @fileoverview Secondary Port - LocationHistoryRepository
 *
 * Defines what the application needs for storing and querying user location history.
 * This is a hexagonal architecture SECONDARY PORT for geographic access tracking.
 *
 * @module application/ports/secondary/persistence/LocationHistoryRepository
 *
 * SECURITY & COMPLIANCE:
 * - Location data is considered PII under GDPR
 * - Retention policies must be enforced
 * - Access to location history must be audited
 */

/* eslint-disable max-lines-per-function, @typescript-eslint/require-await, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-condition */
import type {
  LocationHistoryEntry,
  GeoLocation,
  GeoAnomalyAlert,
  GeoAlertStatus,
  GeoAlertQueryFilters,
  GeoAlertQueryResult,
  GeoAlertStats,
  GeoAnomalyConfig,
  ClinicGeoConfig,
} from '@medicalcor/types';

/**
 * SECONDARY PORT: Location History Repository
 *
 * This interface defines how the application persists and queries
 * user location history for geographic anomaly detection.
 */
export interface LocationHistoryRepository {
  // ==========================================================================
  // LOCATION HISTORY OPERATIONS
  // ==========================================================================

  /**
   * Record a new location access entry
   *
   * @param entry - The location entry to record
   */
  recordLocation(
    entry: Omit<LocationHistoryEntry, 'id' | 'createdAt'>
  ): Promise<LocationHistoryEntry>;

  /**
   * Record multiple location entries in batch
   *
   * @param entries - Array of location entries
   */
  recordLocationBatch(
    entries: Omit<LocationHistoryEntry, 'id' | 'createdAt'>[]
  ): Promise<LocationHistoryEntry[]>;

  /**
   * Get location history for a user
   *
   * @param userId - User ID
   * @param options - Query options
   */
  getLocationHistory(
    userId: string,
    options?: LocationHistoryQueryOptions
  ): Promise<LocationHistoryEntry[]>;

  /**
   * Get the most recent location for a user
   *
   * @param userId - User ID
   * @returns Most recent location entry or null
   */
  getLastLocation(userId: string): Promise<LocationHistoryEntry | null>;

  /**
   * Get recent locations for a user within a time window
   *
   * @param userId - User ID
   * @param windowMinutes - Time window in minutes
   */
  getRecentLocations(userId: string, windowMinutes: number): Promise<LocationHistoryEntry[]>;

  /**
   * Get unique countries a user has accessed from
   *
   * @param userId - User ID
   * @param sinceDate - Optional date to filter from
   */
  getUniqueCountries(userId: string, sinceDate?: Date): Promise<string[]>;

  /**
   * Get unique regions a user has accessed from
   *
   * @param userId - User ID
   * @param country - Filter by country
   * @param sinceDate - Optional date to filter from
   */
  getUniqueRegions(userId: string, country?: string, sinceDate?: Date): Promise<string[]>;

  /**
   * Get unique cities a user has accessed from
   *
   * @param userId - User ID
   * @param country - Filter by country
   * @param region - Filter by region
   * @param sinceDate - Optional date to filter from
   */
  getUniqueCities(
    userId: string,
    country?: string,
    region?: string,
    sinceDate?: Date
  ): Promise<string[]>;

  /**
   * Check if a location is new for a user
   *
   * @param userId - User ID
   * @param location - Location to check
   * @param level - Level of granularity (country, region, city)
   */
  isNewLocation(
    userId: string,
    location: GeoLocation,
    level: 'country' | 'region' | 'city'
  ): Promise<boolean>;

  /**
   * Delete location history for a user (GDPR erasure)
   *
   * @param userId - User ID
   */
  deleteUserHistory(userId: string): Promise<number>;

  /**
   * Delete location history older than a date (retention policy)
   *
   * @param beforeDate - Delete entries before this date
   */
  deleteOldHistory(beforeDate: Date): Promise<number>;

  // ==========================================================================
  // ALERT OPERATIONS
  // ==========================================================================

  /**
   * Create a new geolocation alert
   *
   * @param alert - Alert to create (without id and timestamps)
   */
  createAlert(alert: Omit<GeoAnomalyAlert, 'id' | 'detectedAt'>): Promise<GeoAnomalyAlert>;

  /**
   * Get an alert by ID
   *
   * @param alertId - Alert ID
   */
  getAlert(alertId: string): Promise<GeoAnomalyAlert | null>;

  /**
   * Query alerts with filters
   *
   * @param filters - Query filters
   */
  queryAlerts(filters: GeoAlertQueryFilters): Promise<GeoAlertQueryResult>;

  /**
   * Update alert status
   *
   * @param alertId - Alert ID
   * @param status - New status
   * @param updatedBy - User making the update
   * @param notes - Optional notes
   */
  updateAlertStatus(
    alertId: string,
    status: GeoAlertStatus,
    updatedBy: string,
    notes?: string
  ): Promise<GeoAnomalyAlert>;

  /**
   * Get recent alerts for a user
   *
   * @param userId - User ID
   * @param limit - Maximum number of alerts
   */
  getRecentAlerts(userId: string, limit?: number): Promise<GeoAnomalyAlert[]>;

  /**
   * Get unresolved alerts count
   *
   * @param clinicId - Optional clinic filter
   */
  getUnresolvedAlertCount(clinicId?: string): Promise<number>;

  /**
   * Get alert statistics
   *
   * @param clinicId - Optional clinic filter
   * @param startDate - Period start
   * @param endDate - Period end
   */
  getAlertStats(clinicId?: string, startDate?: Date, endDate?: Date): Promise<GeoAlertStats>;

  /**
   * Check rate limit for alerts
   *
   * @param userId - User ID
   * @param clinicId - Clinic ID
   * @param config - Rate limit configuration
   * @returns Whether a new alert can be created
   */
  checkAlertRateLimit(
    userId: string,
    clinicId: string | undefined,
    config: GeoAnomalyConfig
  ): Promise<boolean>;

  // ==========================================================================
  // CONFIGURATION OPERATIONS
  // ==========================================================================

  /**
   * Get the global anomaly detection configuration
   */
  getGlobalConfig(): Promise<GeoAnomalyConfig>;

  /**
   * Update the global anomaly detection configuration
   *
   * @param config - New configuration
   */
  updateGlobalConfig(config: Partial<GeoAnomalyConfig>): Promise<GeoAnomalyConfig>;

  /**
   * Get clinic-specific configuration
   *
   * @param clinicId - Clinic ID
   */
  getClinicConfig(clinicId: string): Promise<ClinicGeoConfig | null>;

  /**
   * Set clinic-specific configuration
   *
   * @param config - Clinic configuration
   */
  setClinicConfig(
    config: Omit<ClinicGeoConfig, 'createdAt' | 'updatedAt'>
  ): Promise<ClinicGeoConfig>;

  /**
   * Delete clinic-specific configuration (fall back to global)
   *
   * @param clinicId - Clinic ID
   */
  deleteClinicConfig(clinicId: string): Promise<void>;

  /**
   * Get effective configuration for a clinic (merged with global)
   *
   * @param clinicId - Clinic ID
   */
  getEffectiveConfig(clinicId?: string): Promise<GeoAnomalyConfig>;
}

/**
 * Options for querying location history
 */
export interface LocationHistoryQueryOptions {
  /** Maximum number of entries to return */
  limit?: number;

  /** Offset for pagination */
  offset?: number;

  /** Filter by access type */
  accessType?: LocationHistoryEntry['accessType'];

  /** Filter by start date */
  startDate?: Date;

  /** Filter by end date */
  endDate?: Date;

  /** Filter by country */
  country?: string;

  /** Sort order */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Create an in-memory location history repository for testing
 */
export function createInMemoryLocationHistoryRepository(): LocationHistoryRepository {
  const locations: LocationHistoryEntry[] = [];
  const alerts: GeoAnomalyAlert[] = [];
  let globalConfig: GeoAnomalyConfig = {
    maxReasonableSpeedKmh: 900,
    minDistanceForTravelCheckKm: 100,
    impossibilityFactorThreshold: 1.5,
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
  const clinicConfigs = new Map<string, ClinicGeoConfig>();

  return {
    // Location History
    async recordLocation(entry) {
      const newEntry: LocationHistoryEntry = {
        ...entry,
        id: crypto.randomUUID(),
        createdAt: new Date(),
      };
      locations.push(newEntry);
      return newEntry;
    },

    async recordLocationBatch(entries) {
      const results: LocationHistoryEntry[] = [];
      for (const entry of entries) {
        const newEntry: LocationHistoryEntry = {
          ...entry,
          id: crypto.randomUUID(),
          createdAt: new Date(),
        };
        locations.push(newEntry);
        results.push(newEntry);
      }
      return results;
    },

    async getLocationHistory(userId, options) {
      let filtered = locations.filter((l) => l.userId === userId);

      if (options?.accessType) {
        filtered = filtered.filter((l) => l.accessType === options.accessType);
      }
      if (options?.startDate) {
        filtered = filtered.filter((l) => l.createdAt >= options.startDate!);
      }
      if (options?.endDate) {
        filtered = filtered.filter((l) => l.createdAt <= options.endDate!);
      }
      if (options?.country) {
        filtered = filtered.filter((l) => l.location.country === options.country);
      }

      filtered.sort((a, b) => {
        const order = options?.sortOrder === 'asc' ? 1 : -1;
        return order * (b.createdAt.getTime() - a.createdAt.getTime());
      });

      const offset = options?.offset ?? 0;
      const limit = options?.limit ?? 100;
      return filtered.slice(offset, offset + limit);
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

    async getUniqueCountries(userId, sinceDate) {
      const filtered = locations.filter(
        (l) => l.userId === userId && (!sinceDate || l.createdAt >= sinceDate)
      );
      return [...new Set(filtered.map((l) => l.location.country))];
    },

    async getUniqueRegions(userId, country, sinceDate) {
      const filtered = locations.filter(
        (l) =>
          l.userId === userId &&
          (!country || l.location.country === country) &&
          (!sinceDate || l.createdAt >= sinceDate) &&
          l.location.region
      );
      return [...new Set(filtered.map((l) => l.location.region!))];
    },

    async getUniqueCities(userId, country, region, sinceDate) {
      const filtered = locations.filter(
        (l) =>
          l.userId === userId &&
          (!country || l.location.country === country) &&
          (!region || l.location.region === region) &&
          (!sinceDate || l.createdAt >= sinceDate) &&
          l.location.city
      );
      return [...new Set(filtered.map((l) => l.location.city!))];
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
        default:
          return true;
      }
    },

    async deleteUserHistory(userId) {
      const before = locations.length;
      const indices: number[] = [];
      locations.forEach((l, i) => {
        if (l.userId === userId) indices.push(i);
      });
      for (let i = indices.length - 1; i >= 0; i--) {
        locations.splice(indices[i], 1);
      }
      return before - locations.length;
    },

    async deleteOldHistory(beforeDate) {
      const before = locations.length;
      const indices: number[] = [];
      locations.forEach((l, i) => {
        if (l.createdAt < beforeDate) indices.push(i);
      });
      for (let i = indices.length - 1; i >= 0; i--) {
        locations.splice(indices[i], 1);
      }
      return before - locations.length;
    },

    // Alerts
    async createAlert(alert) {
      const newAlert: GeoAnomalyAlert = {
        ...alert,
        id: crypto.randomUUID(),
        detectedAt: new Date(),
      };
      alerts.push(newAlert);
      return newAlert;
    },

    async getAlert(alertId) {
      return alerts.find((a) => a.id === alertId) ?? null;
    },

    async queryAlerts(filters) {
      let filtered = [...alerts];

      if (filters.userId) {
        filtered = filtered.filter((a) => a.userId === filters.userId);
      }
      if (filters.clinicId) {
        filtered = filtered.filter((a) => a.clinicId === filters.clinicId);
      }
      if (filters.anomalyType) {
        filtered = filtered.filter((a) => a.anomalyType === filters.anomalyType);
      }
      if (filters.severity) {
        filtered = filtered.filter((a) => a.severity === filters.severity);
      }
      if (filters.status) {
        filtered = filtered.filter((a) => a.status === filters.status);
      }
      if (filters.country) {
        filtered = filtered.filter((a) => a.currentLocation.country === filters.country);
      }
      if (filters.startDate) {
        filtered = filtered.filter((a) => a.detectedAt >= filters.startDate!);
      }
      if (filters.endDate) {
        filtered = filtered.filter((a) => a.detectedAt <= filters.endDate!);
      }

      // Sort
      filtered.sort((a, b) => {
        const order = filters.sortOrder === 'asc' ? 1 : -1;
        switch (filters.sortBy) {
          case 'severity': {
            const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            return order * (severityOrder[b.severity] - severityOrder[a.severity]);
          }
          case 'status':
            return order * a.status.localeCompare(b.status);
          case 'detectedAt':
          default:
            return order * (b.detectedAt.getTime() - a.detectedAt.getTime());
        }
      });

      const total = filtered.length;
      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? 100;
      const paged = filtered.slice(offset, offset + limit);

      return {
        alerts: paged,
        total,
        hasMore: offset + limit < total,
      };
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

    async getRecentAlerts(userId, limit = 10) {
      return alerts
        .filter((a) => a.userId === userId)
        .sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime())
        .slice(0, limit);
    },

    async getUnresolvedAlertCount(clinicId) {
      return alerts.filter(
        (a) =>
          (!clinicId || a.clinicId === clinicId) &&
          !['resolved', 'false_positive'].includes(a.status)
      ).length;
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
      const countryMap = new Map<string, number>();
      const userSet = new Set<string>();

      for (const alert of filtered) {
        alertsByType[alert.anomalyType] = (alertsByType[alert.anomalyType] ?? 0) + 1;
        alertsBySeverity[alert.severity] = (alertsBySeverity[alert.severity] ?? 0) + 1;
        alertsByStatus[alert.status] = (alertsByStatus[alert.status] ?? 0) + 1;
        countryMap.set(
          alert.currentLocation.country,
          (countryMap.get(alert.currentLocation.country) ?? 0) + 1
        );
        userSet.add(alert.userId);
      }

      return {
        totalAlerts: filtered.length,
        alertsByType: alertsByType as GeoAlertStats['alertsByType'],
        alertsBySeverity: alertsBySeverity as GeoAlertStats['alertsBySeverity'],
        alertsByStatus: alertsByStatus as GeoAlertStats['alertsByStatus'],
        alertsByCountry: Array.from(countryMap.entries()).map(([country, count]) => ({
          country,
          countryName: country, // Simplified
          count,
        })),
        uniqueUsersAffected: userSet.size,
        blockedAccessCount: 0, // Would need tracking
        periodStart: startDate ?? new Date(0),
        periodEnd: endDate ?? new Date(),
      };
    },

    async checkAlertRateLimit(userId, clinicId, config) {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      // Check user rate limit
      const userAlerts = alerts.filter(
        (a) => a.userId === userId && a.detectedAt >= oneHourAgo
      ).length;
      if (userAlerts >= config.maxAlertsPerUserPerHour) {
        return false;
      }

      // Check clinic rate limit
      if (clinicId) {
        const clinicAlerts = alerts.filter(
          (a) => a.clinicId === clinicId && a.detectedAt >= oneHourAgo
        ).length;
        if (clinicAlerts >= config.maxAlertsPerClinicPerHour) {
          return false;
        }
      }

      return true;
    },

    // Configuration
    async getGlobalConfig() {
      return { ...globalConfig };
    },

    async updateGlobalConfig(config) {
      globalConfig = { ...globalConfig, ...config };
      return { ...globalConfig };
    },

    async getClinicConfig(clinicId) {
      return clinicConfigs.get(clinicId) ?? null;
    },

    async setClinicConfig(config) {
      const now = new Date();
      const existing = clinicConfigs.get(config.clinicId);
      const fullConfig: ClinicGeoConfig = {
        ...config,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      clinicConfigs.set(config.clinicId, fullConfig);
      return fullConfig;
    },

    async deleteClinicConfig(clinicId) {
      clinicConfigs.delete(clinicId);
    },

    async getEffectiveConfig(clinicId) {
      if (!clinicId) {
        return { ...globalConfig };
      }

      const clinicConfig = clinicConfigs.get(clinicId);
      if (!clinicConfig?.enabled) {
        return { ...globalConfig };
      }

      // Merge clinic config over global
      return { ...globalConfig, ...clinicConfig.config };
    },
  };
}
