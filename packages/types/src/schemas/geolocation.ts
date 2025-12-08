/**
 * IP Geolocation Schemas (L5 Feature)
 *
 * Provides type-safe schemas for IP-based geolocation and geographic
 * anomaly detection for security alerts.
 *
 * Features:
 * - IP to geographic location resolution
 * - Location history tracking
 * - Impossible travel detection
 * - New location alerts
 * - Suspicious access pattern detection
 *
 * @see docs/adr/005-ip-geolocation-alerts.md
 */

import { z } from 'zod';

// =============================================================================
// GEOLOCATION CORE TYPES
// =============================================================================

/**
 * Geographic coordinates
 */
export const GeoCoordinatesSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracy: z.number().min(0).optional(), // accuracy radius in kilometers
});
export type GeoCoordinates = z.infer<typeof GeoCoordinatesSchema>;

/**
 * Geographic location resolved from IP address
 */
export const GeoLocationSchema = z.object({
  ip: z.string().ip(),
  country: z.string().min(2).max(2), // ISO 3166-1 alpha-2 (e.g., "US", "BR")
  countryName: z.string(),
  region: z.string().optional(), // state/province code
  regionName: z.string().optional(),
  city: z.string().optional(),
  postalCode: z.string().optional(),
  timezone: z.string().optional(), // IANA timezone (e.g., "America/New_York")
  coordinates: GeoCoordinatesSchema.optional(),
  isp: z.string().optional(),
  organization: z.string().optional(),
  asn: z.number().optional(), // Autonomous System Number
  asnOrganization: z.string().optional(),
  isProxy: z.boolean().default(false),
  isVpn: z.boolean().default(false),
  isTor: z.boolean().default(false),
  isHosting: z.boolean().default(false), // datacenter/hosting provider
  isBot: z.boolean().default(false),
  threatLevel: z.enum(['none', 'low', 'medium', 'high']).default('none'),
  resolvedAt: z.coerce.date(),
});
export type GeoLocation = z.infer<typeof GeoLocationSchema>;

/**
 * User location history entry
 */
export const LocationHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  clinicId: z.string().uuid().optional(),
  location: GeoLocationSchema,
  accessType: z.enum(['login', 'api_call', 'session_activity', 'password_reset', 'mfa_setup']),
  userAgent: z.string().optional(),
  sessionId: z.string().optional(),
  correlationId: z.string(),
  createdAt: z.coerce.date(),
});
export type LocationHistoryEntry = z.infer<typeof LocationHistoryEntrySchema>;

// =============================================================================
// ANOMALY DETECTION TYPES
// =============================================================================

/**
 * Alert severity levels for geolocation anomalies
 */
export const GeoAlertSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type GeoAlertSeverity = z.infer<typeof GeoAlertSeveritySchema>;

/**
 * Types of geographic anomalies detected
 */
export const GeoAnomalyTypeSchema = z.enum([
  'impossible_travel', // physically impossible to travel between locations in time
  'new_country', // first login from a new country
  'new_region', // first login from a new region/state
  'new_city', // first login from a new city
  'suspicious_ip', // IP flagged as proxy/VPN/Tor/hosting
  'high_risk_country', // login from a high-risk country
  'unusual_time', // login at unusual time for the timezone
  'rapid_location_change', // multiple locations in short time (not impossible but unusual)
  'simultaneous_sessions', // active sessions from different locations
]);
export type GeoAnomalyType = z.infer<typeof GeoAnomalyTypeSchema>;

/**
 * Alert status for tracking resolution
 */
export const GeoAlertStatusSchema = z.enum([
  'new', // just detected
  'acknowledged', // seen by security team
  'investigating', // under investigation
  'resolved', // confirmed as legitimate or threat addressed
  'false_positive', // marked as non-issue
  'escalated', // escalated to higher authority
]);
export type GeoAlertStatus = z.infer<typeof GeoAlertStatusSchema>;

/**
 * Impossible travel calculation details
 */
export const ImpossibleTravelDetailsSchema = z.object({
  previousLocation: GeoLocationSchema,
  currentLocation: GeoLocationSchema,
  distanceKm: z.number().min(0),
  timeDifferenceMinutes: z.number().min(0),
  requiredSpeedKmh: z.number().min(0), // speed required to make the trip
  maxReasonableSpeedKmh: z.number().default(900), // max speed considered reasonable (subsonic flight)
  impossibilityFactor: z.number().min(1), // how many times faster than max speed
});
export type ImpossibleTravelDetails = z.infer<typeof ImpossibleTravelDetailsSchema>;

/**
 * Geographic anomaly alert
 */
export const GeoAnomalyAlertSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  clinicId: z.string().uuid().optional(),
  userName: z.string().optional(),
  userEmail: z.string().email().optional(),
  anomalyType: GeoAnomalyTypeSchema,
  severity: GeoAlertSeveritySchema,
  status: GeoAlertStatusSchema.default('new'),
  currentLocation: GeoLocationSchema,
  previousLocation: GeoLocationSchema.optional(),
  impossibleTravelDetails: ImpossibleTravelDetailsSchema.optional(),
  description: z.string(),
  recommendedAction: z.string(),
  accessType: z.enum(['login', 'api_call', 'session_activity', 'password_reset', 'mfa_setup']),
  sessionId: z.string().optional(),
  correlationId: z.string(),
  metadata: z.record(z.unknown()).optional(),
  detectedAt: z.coerce.date(),
  acknowledgedAt: z.coerce.date().optional(),
  acknowledgedBy: z.string().optional(),
  resolvedAt: z.coerce.date().optional(),
  resolvedBy: z.string().optional(),
  resolutionNotes: z.string().optional(),
});
export type GeoAnomalyAlert = z.infer<typeof GeoAnomalyAlertSchema>;

// =============================================================================
// CONFIGURATION TYPES
// =============================================================================

/**
 * Configuration for anomaly detection thresholds
 */
export const GeoAnomalyConfigSchema = z.object({
  // Impossible travel settings
  maxReasonableSpeedKmh: z.number().default(900), // commercial flight speed
  minDistanceForTravelCheckKm: z.number().default(100), // minimum distance to check
  impossibilityFactorThreshold: z.number().default(1.5), // flag if 1.5x faster than max speed

  // Time-based settings
  unusualHoursStart: z.number().min(0).max(23).default(1), // 1 AM
  unusualHoursEnd: z.number().min(0).max(23).default(5), // 5 AM

  // New location settings
  alertOnNewCountry: z.boolean().default(true),
  alertOnNewRegion: z.boolean().default(false), // can be noisy
  alertOnNewCity: z.boolean().default(false), // can be noisy
  newLocationGracePeriodDays: z.number().default(0), // suppress if revisiting within N days

  // Suspicious IP settings
  alertOnProxy: z.boolean().default(true),
  alertOnVpn: z.boolean().default(true), // might want false for legitimate VPN users
  alertOnTor: z.boolean().default(true),
  alertOnHosting: z.boolean().default(true), // datacenter IPs
  alertOnBot: z.boolean().default(true),

  // High-risk countries (ISO 3166-1 alpha-2 codes)
  highRiskCountries: z.array(z.string().length(2)).default([]),

  // Trusted networks (bypass checks for these)
  trustedIpRanges: z.array(z.string()).default([]), // CIDR notation
  trustedAsns: z.array(z.number()).default([]),

  // Rate limiting for alerts
  maxAlertsPerUserPerHour: z.number().default(5),
  maxAlertsPerClinicPerHour: z.number().default(50),

  // Notification settings
  notifySupervisors: z.boolean().default(true),
  notifySecurityTeam: z.boolean().default(true),
  notifyAffectedUser: z.boolean().default(false), // might tip off attacker
  autoBlockOnCritical: z.boolean().default(false), // auto-lock account on critical alerts
});
export type GeoAnomalyConfig = z.infer<typeof GeoAnomalyConfigSchema>;

/**
 * Per-clinic configuration overrides
 */
export const ClinicGeoConfigSchema = z.object({
  clinicId: z.string().uuid(),
  enabled: z.boolean().default(true),
  config: GeoAnomalyConfigSchema.partial(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type ClinicGeoConfig = z.infer<typeof ClinicGeoConfigSchema>;

// =============================================================================
// REQUEST/RESPONSE TYPES
// =============================================================================

/**
 * Request to resolve IP to geolocation
 */
export const ResolveGeoLocationRequestSchema = z.object({
  ip: z.string().ip(),
  includeSecurityInfo: z.boolean().default(true), // VPN/proxy detection
  correlationId: z.string().optional(),
});
export type ResolveGeoLocationRequest = z.infer<typeof ResolveGeoLocationRequestSchema>;

/**
 * Response from geolocation resolution
 */
export const ResolveGeoLocationResponseSchema = z.object({
  success: z.boolean(),
  location: GeoLocationSchema.optional(),
  cached: z.boolean().default(false),
  provider: z.string().optional(), // which provider was used
  error: z.string().optional(),
});
export type ResolveGeoLocationResponse = z.infer<typeof ResolveGeoLocationResponseSchema>;

/**
 * Request to check for anomalies
 */
export const CheckGeoAnomalyRequestSchema = z.object({
  userId: z.string().uuid(),
  clinicId: z.string().uuid().optional(),
  ip: z.string().ip(),
  accessType: z.enum(['login', 'api_call', 'session_activity', 'password_reset', 'mfa_setup']),
  userAgent: z.string().optional(),
  sessionId: z.string().optional(),
  correlationId: z.string(),
});
export type CheckGeoAnomalyRequest = z.infer<typeof CheckGeoAnomalyRequestSchema>;

/**
 * Response from anomaly check
 */
export const CheckGeoAnomalyResponseSchema = z.object({
  hasAnomalies: z.boolean(),
  location: GeoLocationSchema.optional(),
  alerts: z.array(GeoAnomalyAlertSchema),
  blocked: z.boolean().default(false), // whether access was blocked
  requiresMfa: z.boolean().default(false), // whether step-up auth required
});
export type CheckGeoAnomalyResponse = z.infer<typeof CheckGeoAnomalyResponseSchema>;

/**
 * Query filters for alerts
 */
export const GeoAlertQueryFiltersSchema = z.object({
  userId: z.string().uuid().optional(),
  clinicId: z.string().uuid().optional(),
  anomalyType: GeoAnomalyTypeSchema.optional(),
  severity: GeoAlertSeveritySchema.optional(),
  status: GeoAlertStatusSchema.optional(),
  country: z.string().length(2).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().min(1).max(1000).default(100),
  offset: z.number().min(0).default(0),
  sortBy: z.enum(['detectedAt', 'severity', 'status']).default('detectedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type GeoAlertQueryFilters = z.infer<typeof GeoAlertQueryFiltersSchema>;

/**
 * Query result for alerts
 */
export const GeoAlertQueryResultSchema = z.object({
  alerts: z.array(GeoAnomalyAlertSchema),
  total: z.number(),
  hasMore: z.boolean(),
});
export type GeoAlertQueryResult = z.infer<typeof GeoAlertQueryResultSchema>;

/**
 * Update alert status request
 */
export const UpdateGeoAlertStatusSchema = z.object({
  alertId: z.string().uuid(),
  status: GeoAlertStatusSchema,
  notes: z.string().optional(),
  updatedBy: z.string(),
});
export type UpdateGeoAlertStatus = z.infer<typeof UpdateGeoAlertStatusSchema>;

// =============================================================================
// EVENT TYPES
// =============================================================================

/**
 * Event emitted when a geolocation anomaly is detected
 */
export const GeoAnomalyDetectedEventSchema = z.object({
  eventType: z.literal('geo.anomaly.detected'),
  eventId: z.string().uuid(),
  timestamp: z.coerce.date(),
  correlationId: z.string(),
  payload: z.object({
    alert: GeoAnomalyAlertSchema,
    userEmail: z.string().email().optional(),
    requiresImmediateAction: z.boolean(),
  }),
});
export type GeoAnomalyDetectedEvent = z.infer<typeof GeoAnomalyDetectedEventSchema>;

/**
 * Event emitted when alert status changes
 */
export const GeoAlertStatusChangedEventSchema = z.object({
  eventType: z.literal('geo.alert.status_changed'),
  eventId: z.string().uuid(),
  timestamp: z.coerce.date(),
  correlationId: z.string(),
  payload: z.object({
    alertId: z.string().uuid(),
    previousStatus: GeoAlertStatusSchema,
    newStatus: GeoAlertStatusSchema,
    changedBy: z.string(),
    notes: z.string().optional(),
  }),
});
export type GeoAlertStatusChangedEvent = z.infer<typeof GeoAlertStatusChangedEventSchema>;

/**
 * Event emitted when access is blocked due to geolocation
 */
export const GeoAccessBlockedEventSchema = z.object({
  eventType: z.literal('geo.access.blocked'),
  eventId: z.string().uuid(),
  timestamp: z.coerce.date(),
  correlationId: z.string(),
  payload: z.object({
    userId: z.string().uuid(),
    ip: z.string().ip(),
    location: GeoLocationSchema,
    reason: z.string(),
    alertId: z.string().uuid().optional(),
  }),
});
export type GeoAccessBlockedEvent = z.infer<typeof GeoAccessBlockedEventSchema>;

// =============================================================================
// DASHBOARD/STATISTICS TYPES
// =============================================================================

/**
 * Geographic distribution of access
 */
export const GeoAccessDistributionSchema = z.object({
  country: z.string().length(2),
  countryName: z.string(),
  accessCount: z.number(),
  uniqueUsers: z.number(),
  alertCount: z.number(),
  lastAccess: z.coerce.date(),
});
export type GeoAccessDistribution = z.infer<typeof GeoAccessDistributionSchema>;

/**
 * Statistics summary for geolocation alerts
 */
export const GeoAlertStatsSchema = z.object({
  totalAlerts: z.number(),
  alertsByType: z.record(GeoAnomalyTypeSchema, z.number()),
  alertsBySeverity: z.record(GeoAlertSeveritySchema, z.number()),
  alertsByStatus: z.record(GeoAlertStatusSchema, z.number()),
  alertsByCountry: z.array(
    z.object({
      country: z.string().length(2),
      countryName: z.string(),
      count: z.number(),
    })
  ),
  uniqueUsersAffected: z.number(),
  blockedAccessCount: z.number(),
  averageResolutionTimeMinutes: z.number().optional(),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
});
export type GeoAlertStats = z.infer<typeof GeoAlertStatsSchema>;

/**
 * Dashboard data for geolocation security
 */
export const GeoDashboardDataSchema = z.object({
  stats: GeoAlertStatsSchema,
  recentAlerts: z.array(GeoAnomalyAlertSchema),
  accessDistribution: z.array(GeoAccessDistributionSchema),
  topRiskUsers: z.array(
    z.object({
      userId: z.string().uuid(),
      userName: z.string().optional(),
      alertCount: z.number(),
      lastAlert: z.coerce.date(),
    })
  ),
});
export type GeoDashboardData = z.infer<typeof GeoDashboardDataSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate distance between two geographic coordinates using Haversine formula
 * @returns Distance in kilometers
 */
export function calculateDistanceKm(coord1: GeoCoordinates, coord2: GeoCoordinates): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = toRadians(coord2.latitude - coord1.latitude);
  const dLon = toRadians(coord2.longitude - coord1.longitude);
  const lat1 = toRadians(coord1.latitude);
  const lat2 = toRadians(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate required speed to travel between two locations
 * @returns Speed in km/h, or Infinity if time is 0
 */
export function calculateRequiredSpeed(distanceKm: number, timeMinutes: number): number {
  if (timeMinutes <= 0) return Infinity;
  return (distanceKm / timeMinutes) * 60; // km/h
}

/**
 * Determine if travel is physically impossible
 */
export function isImpossibleTravel(
  coord1: GeoCoordinates,
  coord2: GeoCoordinates,
  timeMinutes: number,
  maxSpeedKmh = 900
): boolean {
  const distance = calculateDistanceKm(coord1, coord2);
  const requiredSpeed = calculateRequiredSpeed(distance, timeMinutes);
  return requiredSpeed > maxSpeedKmh;
}

/**
 * Get severity based on anomaly type and details
 */
export function getAnomalySeverity(
  anomalyType: GeoAnomalyType,
  details?: { impossibilityFactor?: number; isTor?: boolean }
): GeoAlertSeverity {
  switch (anomalyType) {
    case 'impossible_travel':
      if (details?.impossibilityFactor && details.impossibilityFactor > 5) {
        return 'critical';
      }
      return 'high';

    case 'suspicious_ip':
      if (details?.isTor) return 'high';
      return 'medium';

    case 'high_risk_country':
      return 'high';

    case 'simultaneous_sessions':
      return 'high';

    case 'new_country':
      return 'medium';

    case 'rapid_location_change':
      return 'medium';

    case 'new_region':
    case 'new_city':
    case 'unusual_time':
      return 'low';

    default:
      return 'low';
  }
}

/**
 * Get recommended action based on anomaly type and severity
 */
export function getRecommendedAction(
  anomalyType: GeoAnomalyType,
  severity: GeoAlertSeverity
): string {
  if (severity === 'critical') {
    return 'Immediately investigate and consider temporarily suspending the account.';
  }

  switch (anomalyType) {
    case 'impossible_travel':
      return 'Verify user identity through MFA or direct contact. Check for compromised credentials.';

    case 'suspicious_ip':
      return 'Monitor for additional suspicious activity. Consider requiring MFA for sensitive operations.';

    case 'high_risk_country':
      return 'Verify if user has legitimate reason to access from this location.';

    case 'simultaneous_sessions':
      return 'Contact user to verify if they have multiple active sessions. Consider invalidating sessions.';

    case 'new_country':
      return 'Verify user identity if this is unexpected travel. May require acknowledgment.';

    case 'rapid_location_change':
      return 'Monitor for patterns. May indicate VPN usage or shared credentials.';

    case 'new_region':
    case 'new_city':
      return 'Log for reference. Consider user acknowledgment for new location.';

    case 'unusual_time':
      return 'Note unusual access time. May warrant follow-up if pattern continues.';

    default:
      return 'Review and monitor for additional suspicious activity.';
  }
}

/**
 * Generate human-readable description for an anomaly
 */
export function getAnomalyDescription(
  anomalyType: GeoAnomalyType,
  currentLocation: GeoLocation,
  previousLocation?: GeoLocation,
  details?: ImpossibleTravelDetails
): string {
  const currentDesc = `${currentLocation.city ?? currentLocation.regionName ?? 'Unknown'}, ${currentLocation.countryName}`;
  const previousDesc = previousLocation
    ? `${previousLocation.city ?? previousLocation.regionName ?? 'Unknown'}, ${previousLocation.countryName}`
    : undefined;

  switch (anomalyType) {
    case 'impossible_travel':
      if (details) {
        return `Impossible travel detected: ${previousDesc} → ${currentDesc} (${Math.round(details.distanceKm)} km in ${details.timeDifferenceMinutes} minutes would require ${Math.round(details.requiredSpeedKmh)} km/h)`;
      }
      return `Impossible travel detected between ${previousDesc} and ${currentDesc}`;

    case 'new_country':
      return `First access from new country: ${currentLocation.countryName}`;

    case 'new_region':
      return `First access from new region: ${currentLocation.regionName ?? 'Unknown'}, ${currentLocation.countryName}`;

    case 'new_city':
      return `First access from new city: ${currentDesc}`;

    case 'suspicious_ip': {
      const flags: string[] = [];
      if (currentLocation.isVpn) flags.push('VPN');
      if (currentLocation.isProxy) flags.push('Proxy');
      if (currentLocation.isTor) flags.push('Tor');
      if (currentLocation.isHosting) flags.push('Datacenter');
      if (currentLocation.isBot) flags.push('Bot');
      return `Suspicious IP detected (${flags.join(', ')}) from ${currentDesc}`;
    }

    case 'high_risk_country':
      return `Access from high-risk country: ${currentLocation.countryName}`;

    case 'unusual_time':
      return `Access at unusual time from ${currentDesc}`;

    case 'rapid_location_change':
      return `Rapid location change detected: ${previousDesc} → ${currentDesc}`;

    case 'simultaneous_sessions':
      return `Simultaneous sessions detected from different locations: ${previousDesc} and ${currentDesc}`;

    default:
      return `Geographic anomaly detected from ${currentDesc}`;
  }
}
