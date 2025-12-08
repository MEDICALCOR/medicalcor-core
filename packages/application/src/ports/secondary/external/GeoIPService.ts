/* eslint-disable max-lines-per-function */
/**
 * @fileoverview Secondary Port - GeoIPService
 *
 * Defines what the application needs for IP geolocation services (driven side).
 * This is a hexagonal architecture SECONDARY PORT for IP-to-location resolution
 * and geographic security analysis.
 *
 * @module application/ports/secondary/external/GeoIPService
 *
 * SECURITY COMPLIANCE:
 * - IP addresses are PII and must be handled according to GDPR/HIPAA
 * - Geolocation data should not be stored longer than necessary
 * - All lookups should be logged for audit purposes
 */

import type {
  GeoLocation,
  ResolveGeoLocationRequest,
  ResolveGeoLocationResponse,
} from '@medicalcor/types';

/**
 * SECONDARY PORT: IP Geolocation Service
 *
 * This interface defines how the application resolves IP addresses
 * to geographic locations for security monitoring.
 *
 * @example
 * ```typescript
 * // MaxMind Adapter implementing this port
 * class MaxMindGeoIPService implements GeoIPService {
 *   async resolve(request: ResolveGeoLocationRequest): Promise<ResolveGeoLocationResponse> {
 *     const city = this.reader.city(request.ip);
 *     return {
 *       success: true,
 *       location: {
 *         ip: request.ip,
 *         country: city.country.isoCode,
 *         countryName: city.country.names.en,
 *         // ...
 *       },
 *     };
 *   }
 * }
 * ```
 */
export interface GeoIPService {
  /**
   * Resolve an IP address to a geographic location
   *
   * @param request - The resolution request containing IP and options
   * @returns Resolution response with location data or error
   */
  resolve(request: ResolveGeoLocationRequest): Promise<ResolveGeoLocationResponse>;

  /**
   * Resolve multiple IP addresses in batch
   *
   * More efficient than multiple individual calls for bulk operations.
   *
   * @param ips - Array of IP addresses to resolve
   * @param includeSecurityInfo - Whether to include VPN/proxy detection
   * @returns Map of IP to resolution response
   */
  resolveBatch(
    ips: string[],
    includeSecurityInfo?: boolean
  ): Promise<Map<string, ResolveGeoLocationResponse>>;

  /**
   * Check if an IP address is from a suspicious source
   *
   * Performs lightweight security checks without full geolocation.
   *
   * @param ip - IP address to check
   * @returns Security assessment
   */
  checkSecurity(ip: string): Promise<GeoIPSecurityCheck>;

  /**
   * Check if an IP is within a trusted range
   *
   * @param ip - IP address to check
   * @param trustedRanges - Array of CIDR ranges
   * @returns Whether the IP is in a trusted range
   */
  isInTrustedRange(ip: string, trustedRanges: string[]): boolean;

  /**
   * Check if an IP belongs to a specific ASN
   *
   * @param ip - IP address to check
   * @param asns - Array of ASN numbers to check against
   * @returns Whether the IP belongs to one of the ASNs
   */
  isInAsn(ip: string, asns: number[]): Promise<boolean>;

  /**
   * Get service health status
   *
   * @returns Service health information
   */
  getHealth(): Promise<GeoIPServiceHealth>;

  /**
   * Warm up the cache with common IPs (optional)
   *
   * @param ips - Array of IP addresses to pre-cache
   */
  warmCache?(ips: string[]): Promise<void>;

  /**
   * Clear the cache (optional)
   *
   * @param ip - Specific IP to clear, or all if not provided
   */
  clearCache?(ip?: string): Promise<void>;
}

/**
 * Security check result for an IP address
 */
export interface GeoIPSecurityCheck {
  /** IP address that was checked */
  ip: string;

  /** Overall risk level */
  riskLevel: 'none' | 'low' | 'medium' | 'high';

  /** Whether the IP is a known proxy */
  isProxy: boolean;

  /** Whether the IP is a VPN exit node */
  isVpn: boolean;

  /** Whether the IP is a Tor exit node */
  isTor: boolean;

  /** Whether the IP is from a hosting/datacenter provider */
  isHosting: boolean;

  /** Whether the IP shows bot-like behavior */
  isBot: boolean;

  /** Whether the IP is on any known blocklist */
  isBlocklisted: boolean;

  /** Country code (ISO 3166-1 alpha-2) */
  country?: string;

  /** Autonomous System Number */
  asn?: number;

  /** ASN organization name */
  asnOrganization?: string;

  /** Additional threat indicators */
  threatIndicators?: string[];

  /** When this check was performed */
  checkedAt: Date;
}

/**
 * GeoIP service health status
 */
export interface GeoIPServiceHealth {
  /** Whether the service is healthy */
  healthy: boolean;

  /** Service provider name */
  provider: string;

  /** Database/API version */
  version?: string;

  /** Last database update time */
  lastUpdate?: Date;

  /** Cache hit rate (0-1) */
  cacheHitRate?: number;

  /** Average response time in milliseconds */
  avgResponseTimeMs?: number;

  /** Number of lookups in the last hour */
  lookupsLastHour?: number;

  /** Error rate in the last hour (0-1) */
  errorRate?: number;

  /** Any warning messages */
  warnings?: string[];
}

/**
 * Configuration for GeoIP service adapter
 */
export interface GeoIPServiceConfig {
  /** Provider to use */
  provider: 'maxmind' | 'ip-api' | 'ipstack' | 'ipinfo' | 'mock';

  /** API key for the provider (if required) */
  apiKey?: string;

  /** Path to local database file (for MaxMind) */
  databasePath?: string;

  /** Whether to enable caching */
  cacheEnabled?: boolean;

  /** Cache TTL in seconds */
  cacheTtlSeconds?: number;

  /** Maximum cache size */
  maxCacheSize?: number;

  /** Request timeout in milliseconds */
  timeoutMs?: number;

  /** Whether to include security info by default */
  includeSecurityInfo?: boolean;

  /** Fallback provider if primary fails */
  fallbackProvider?: 'maxmind' | 'ip-api' | 'ipstack' | 'ipinfo';

  /** Custom high-risk countries list */
  highRiskCountries?: string[];
}

/**
 * Create a mock GeoIP service for testing
 */
export function createMockGeoIPService(
  overrides?: Partial<Record<string, GeoLocation>>
): GeoIPService {
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
    resolve(request): Promise<ResolveGeoLocationResponse> {
      const cached = cache.get(request.ip);
      if (cached) {
        return Promise.resolve({
          success: true,
          location: { ...cached, resolvedAt: new Date() },
          cached: true,
          provider: 'mock',
        });
      }

      return Promise.resolve({
        success: true,
        location: { ...defaultLocation, ip: request.ip, resolvedAt: new Date() },
        cached: false,
        provider: 'mock',
      });
    },

    resolveBatch(ips, _includeSecurityInfo): Promise<Map<string, ResolveGeoLocationResponse>> {
      const results = new Map<string, ResolveGeoLocationResponse>();
      for (const ip of ips) {
        const cached = cache.get(ip);
        results.set(ip, {
          success: true,
          location: cached
            ? { ...cached, resolvedAt: new Date() }
            : { ...defaultLocation, ip, resolvedAt: new Date() },
          cached: !!cached,
          provider: 'mock',
        });
      }
      return Promise.resolve(results);
    },

    checkSecurity(ip): Promise<GeoIPSecurityCheck> {
      const cached = cache.get(ip);
      return Promise.resolve({
        ip,
        riskLevel: cached?.threatLevel ?? 'none',
        isProxy: cached?.isProxy ?? false,
        isVpn: cached?.isVpn ?? false,
        isTor: cached?.isTor ?? false,
        isHosting: cached?.isHosting ?? false,
        isBot: cached?.isBot ?? false,
        isBlocklisted: false,
        country: cached?.country ?? 'US',
        checkedAt: new Date(),
      });
    },

    isInTrustedRange(ip, trustedRanges) {
      if (ip === '127.0.0.1' || ip === '::1') {
        return true;
      }
      return trustedRanges.some((range) => ip.startsWith(range.split('/')[0]));
    },

    isInAsn(ip, asns): Promise<boolean> {
      const cached = cache.get(ip);
      if (cached?.asn) {
        return Promise.resolve(asns.includes(cached.asn));
      }
      return Promise.resolve(false);
    },

    getHealth(): Promise<GeoIPServiceHealth> {
      return Promise.resolve({
        healthy: true,
        provider: 'mock',
        version: '1.0.0',
        lastUpdate: new Date(),
        cacheHitRate: 0.5,
        avgResponseTimeMs: 1,
        lookupsLastHour: 100,
        errorRate: 0,
      });
    },

    warmCache(_ips): Promise<void> {
      return Promise.resolve();
    },

    clearCache(ip): Promise<void> {
      if (ip) {
        cache.delete(ip);
      } else {
        cache.clear();
      }
      return Promise.resolve();
    },
  };
}
