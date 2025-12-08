/**
 * @fileoverview GeoIP Service Adapter
 *
 * Infrastructure adapter implementing the GeoIPService port.
 * Supports multiple providers: ip-api.com (free), MaxMind, IPStack.
 *
 * @module @medicalcor/infrastructure/services/GeoIPAdapter
 *
 * CACHING STRATEGY:
 * - IP geolocation data is cached for 24 hours by default
 * - Security checks are cached for 1 hour
 * - Private IPs return mock local data (no external lookup)
 */

/* eslint-disable max-lines, complexity, max-depth, @typescript-eslint/no-unnecessary-condition */
import { createLogger } from '@medicalcor/core';
import type {
  GeoLocation,
  ResolveGeoLocationRequest,
  ResolveGeoLocationResponse,
} from '@medicalcor/types';
import type {
  GeoIPService,
  GeoIPServiceConfig,
  GeoIPSecurityCheck,
  GeoIPServiceHealth,
} from '@medicalcor/application';

const logger = createLogger({ name: 'geoip-adapter' });

/**
 * GeoIP Service Adapter
 *
 * Implements the GeoIPService port with support for multiple providers.
 * Primary focus is on ip-api.com which provides free geolocation with
 * reasonable rate limits (45 requests/minute for free tier).
 */
export class GeoIPAdapter implements GeoIPService {
  private readonly config: Required<GeoIPServiceConfig>;
  private readonly cache: Map<string, { data: GeoLocation; expiry: number }>;
  private readonly securityCache: Map<string, { data: GeoIPSecurityCheck; expiry: number }>;
  private lookupCount = 0;
  private errorCount = 0;
  private cacheHits = 0;
  private totalLookups = 0;

  constructor(config: GeoIPServiceConfig) {
    this.config = {
      provider: config.provider ?? 'ip-api',
      apiKey: config.apiKey ?? '',
      databasePath: config.databasePath ?? '',
      cacheEnabled: config.cacheEnabled ?? true,
      cacheTtlSeconds: config.cacheTtlSeconds ?? 86400, // 24 hours
      maxCacheSize: config.maxCacheSize ?? 10000,
      timeoutMs: config.timeoutMs ?? 5000,
      includeSecurityInfo: config.includeSecurityInfo ?? true,
      fallbackProvider: config.fallbackProvider ?? 'ip-api',
      highRiskCountries: config.highRiskCountries ?? [],
    };
    this.cache = new Map();
    this.securityCache = new Map();

    logger.info(
      { provider: this.config.provider, cacheEnabled: this.config.cacheEnabled },
      'GeoIP adapter initialized'
    );
  }

  /**
   * Resolve an IP address to geographic location
   */
  async resolve(request: ResolveGeoLocationRequest): Promise<ResolveGeoLocationResponse> {
    const { ip, includeSecurityInfo = this.config.includeSecurityInfo, correlationId } = request;

    this.totalLookups++;

    // Check for private/reserved IPs
    if (this.isPrivateIP(ip)) {
      return {
        success: true,
        location: this.getPrivateIPLocation(ip),
        cached: false,
        provider: 'local',
      };
    }

    // Check cache
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(ip);
      if (cached && cached.expiry > Date.now()) {
        this.cacheHits++;
        logger.debug({ ip, correlationId }, 'GeoIP cache hit');
        return {
          success: true,
          location: cached.data,
          cached: true,
          provider: this.config.provider,
        };
      }
    }

    // Perform lookup based on provider
    try {
      const location = await this.performLookup(ip, includeSecurityInfo);
      this.lookupCount++;

      // Cache the result
      if (this.config.cacheEnabled && location) {
        this.cacheResult(ip, location);
      }

      return {
        success: true,
        location,
        cached: false,
        provider: this.config.provider,
      };
    } catch (error) {
      this.errorCount++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ ip, error: errorMessage, correlationId }, 'GeoIP lookup failed');

      // Try fallback provider if configured
      if (this.config.fallbackProvider && this.config.fallbackProvider !== this.config.provider) {
        logger.info(
          { ip, fallbackProvider: this.config.fallbackProvider },
          'Trying fallback provider'
        );
        try {
          const location = await this.performLookup(
            ip,
            includeSecurityInfo,
            this.config.fallbackProvider
          );
          if (this.config.cacheEnabled && location) {
            this.cacheResult(ip, location);
          }
          return {
            success: true,
            location,
            cached: false,
            provider: this.config.fallbackProvider,
          };
        } catch (fallbackError) {
          logger.error({ ip, error: fallbackError }, 'Fallback provider also failed');
        }
      }

      return {
        success: false,
        cached: false,
        error: errorMessage,
        provider: this.config.provider,
      };
    }
  }

  /**
   * Resolve multiple IPs in batch
   */
  async resolveBatch(
    ips: string[],
    includeSecurityInfo?: boolean
  ): Promise<Map<string, ResolveGeoLocationResponse>> {
    const results = new Map<string, ResolveGeoLocationResponse>();
    const uncachedIps: string[] = [];

    // First pass: check cache and private IPs
    for (const ip of ips) {
      if (this.isPrivateIP(ip)) {
        results.set(ip, {
          success: true,
          location: this.getPrivateIPLocation(ip),
          cached: false,
          provider: 'local',
        });
        continue;
      }

      if (this.config.cacheEnabled) {
        const cached = this.cache.get(ip);
        if (cached && cached.expiry > Date.now()) {
          this.cacheHits++;
          results.set(ip, {
            success: true,
            location: cached.data,
            cached: true,
            provider: this.config.provider,
          });
          continue;
        }
      }

      uncachedIps.push(ip);
    }

    // Batch lookup for uncached IPs
    if (uncachedIps.length > 0) {
      // ip-api supports batch lookups
      if (this.config.provider === 'ip-api') {
        try {
          const batchResults = await this.batchLookupIpApi(uncachedIps, includeSecurityInfo);
          for (const [ip, location] of batchResults) {
            if (this.config.cacheEnabled && location) {
              this.cacheResult(ip, location);
            }
            results.set(ip, {
              success: true,
              location,
              cached: false,
              provider: 'ip-api',
            });
          }
        } catch (_error) {
          // Fall back to individual lookups
          for (const ip of uncachedIps) {
            const result = await this.resolve({
              ip,
              includeSecurityInfo: includeSecurityInfo ?? this.config.includeSecurityInfo,
            });
            results.set(ip, result);
          }
        }
      } else {
        // Other providers: individual lookups
        for (const ip of uncachedIps) {
          const result = await this.resolve({
            ip,
            includeSecurityInfo: includeSecurityInfo ?? this.config.includeSecurityInfo,
          });
          results.set(ip, result);
        }
      }
    }

    return results;
  }

  /**
   * Quick security check for an IP
   */
  async checkSecurity(ip: string): Promise<GeoIPSecurityCheck> {
    // Check security cache
    const cached = this.securityCache.get(ip);
    if (cached && cached.expiry > Date.now()) {
      return cached.data;
    }

    // Perform lookup with security info
    const result = await this.resolve({ ip, includeSecurityInfo: true });

    const check: GeoIPSecurityCheck = {
      ip,
      riskLevel: 'none',
      isProxy: result.location?.isProxy ?? false,
      isVpn: result.location?.isVpn ?? false,
      isTor: result.location?.isTor ?? false,
      isHosting: result.location?.isHosting ?? false,
      isBot: result.location?.isBot ?? false,
      isBlocklisted: false,
      country: result.location?.country,
      asn: result.location?.asn,
      asnOrganization: result.location?.asnOrganization,
      checkedAt: new Date(),
    };

    // Determine risk level
    if (check.isTor) {
      check.riskLevel = 'high';
    } else if (check.isProxy || check.isVpn) {
      check.riskLevel = 'medium';
    } else if (check.isHosting || check.isBot) {
      check.riskLevel = 'low';
    }

    // Check high-risk countries
    if (check.country && this.config.highRiskCountries.includes(check.country)) {
      check.riskLevel = check.riskLevel === 'high' ? 'high' : 'medium';
      check.threatIndicators = [...(check.threatIndicators ?? []), 'high_risk_country'];
    }

    // Cache security check for 1 hour
    this.securityCache.set(ip, {
      data: check,
      expiry: Date.now() + 3600000,
    });

    return check;
  }

  /**
   * Check if IP is in trusted CIDR range
   */
  isInTrustedRange(ip: string, trustedRanges: string[]): boolean {
    const ipNum = this.ipToNumber(ip);
    if (ipNum === null) return false;

    for (const range of trustedRanges) {
      const [rangeIp, prefixStr] = range.split('/');
      if (!rangeIp) continue;
      const prefix = parseInt(prefixStr ?? '32', 10);
      const rangeNum = this.ipToNumber(rangeIp);
      if (rangeNum === null) continue;

      const mask = ~((1 << (32 - prefix)) - 1) >>> 0;
      if ((ipNum & mask) === (rangeNum & mask)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if IP belongs to specific ASNs
   */
  async isInAsn(ip: string, asns: number[]): Promise<boolean> {
    const result = await this.resolve({ ip, includeSecurityInfo: true });
    if (!result.success || !result.location?.asn) {
      return false;
    }
    return asns.includes(result.location.asn);
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<GeoIPServiceHealth> {
    const cacheHitRate = this.totalLookups > 0 ? this.cacheHits / this.totalLookups : 0;
    const errorRate = this.lookupCount > 0 ? this.errorCount / this.lookupCount : 0;

    // Simple health check: try to lookup a known IP
    let healthy = true;
    try {
      const testResult = await this.resolve({ ip: '8.8.8.8', includeSecurityInfo: false });
      healthy = testResult.success;
    } catch {
      healthy = false;
    }

    return {
      healthy,
      provider: this.config.provider,
      version: '1.0.0',
      lastUpdate: new Date(),
      cacheHitRate,
      avgResponseTimeMs: 50, // Would need actual tracking
      lookupsLastHour: this.lookupCount,
      errorRate,
      warnings: errorRate > 0.1 ? ['High error rate detected'] : undefined,
    };
  }

  /**
   * Warm cache with common IPs
   */
  async warmCache(ips: string[]): Promise<void> {
    logger.info({ count: ips.length }, 'Warming GeoIP cache');
    await this.resolveBatch(ips);
  }

  /**
   * Clear cache
   */
  clearCache(ip?: string): Promise<void> {
    if (ip) {
      this.cache.delete(ip);
      this.securityCache.delete(ip);
    } else {
      this.cache.clear();
      this.securityCache.clear();
    }
    logger.info({ ip: ip ?? 'all' }, 'GeoIP cache cleared');
    return Promise.resolve();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Perform lookup using the specified provider
   */
  private async performLookup(
    ip: string,
    includeSecurityInfo: boolean,
    provider?: GeoIPServiceConfig['provider']
  ): Promise<GeoLocation> {
    const providerToUse = provider ?? this.config.provider;

    switch (providerToUse) {
      case 'ip-api':
        return this.lookupIpApi(ip, includeSecurityInfo);
      case 'ipstack':
        return this.lookupIpStack(ip, includeSecurityInfo);
      case 'ipinfo':
        return this.lookupIpInfo(ip);
      case 'maxmind':
        throw new Error('MaxMind requires local database - not yet implemented');
      case 'mock':
        return this.getMockLocation(ip);
      default: {
        const _exhaustiveCheck: never = providerToUse;
        throw new Error(`Unknown provider: ${String(_exhaustiveCheck)}`);
      }
    }
  }

  /**
   * Lookup using ip-api.com (free tier: 45 req/min)
   */
  private async lookupIpApi(ip: string, includeSecurityInfo: boolean): Promise<GeoLocation> {
    const fields = [
      'status',
      'message',
      'country',
      'countryCode',
      'region',
      'regionName',
      'city',
      'zip',
      'lat',
      'lon',
      'timezone',
      'isp',
      'org',
      'as',
      'asname',
    ];

    if (includeSecurityInfo) {
      fields.push('proxy', 'hosting');
    }

    const url = `http://ip-api.com/json/${ip}?fields=${fields.join(',')}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      const data = (await response.json()) as IpApiResponse;

      if (data.status === 'fail') {
        throw new Error(data.message ?? 'IP-API lookup failed');
      }

      return {
        ip,
        country: data.countryCode ?? 'XX',
        countryName: data.country ?? 'Unknown',
        region: data.region,
        regionName: data.regionName,
        city: data.city,
        postalCode: data.zip,
        timezone: data.timezone,
        coordinates:
          data.lat && data.lon
            ? {
                latitude: data.lat,
                longitude: data.lon,
                accuracy: 50, // ip-api doesn't provide accuracy
              }
            : undefined,
        isp: data.isp,
        organization: data.org,
        asn: data.as ? parseInt(data.as.split(' ')[0]?.replace('AS', '') ?? '0', 10) : undefined,
        asnOrganization: data.asname,
        isProxy: data.proxy ?? false,
        isVpn: false, // ip-api free tier doesn't distinguish VPN
        isTor: false, // Not available in free tier
        isHosting: data.hosting ?? false,
        isBot: false, // Not available
        threatLevel: data.proxy || data.hosting ? 'low' : 'none',
        resolvedAt: new Date(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Batch lookup using ip-api.com batch endpoint (max 100 IPs)
   */
  private async batchLookupIpApi(
    ips: string[],
    _includeSecurityInfo?: boolean
  ): Promise<Map<string, GeoLocation>> {
    const results = new Map<string, GeoLocation>();

    // ip-api batch supports max 100 IPs per request
    const chunks = this.chunkArray(ips, 100);

    for (const chunk of chunks) {
      const fields =
        'status,message,query,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,proxy,hosting';
      const url = `http://ip-api.com/batch?fields=${fields}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(chunk),
          signal: controller.signal,
        });

        const dataArray = (await response.json()) as IpApiResponse[];

        for (const data of dataArray) {
          if (data.status === 'success' && data.query) {
            results.set(data.query, {
              ip: data.query,
              country: data.countryCode ?? 'XX',
              countryName: data.country ?? 'Unknown',
              region: data.region,
              regionName: data.regionName,
              city: data.city,
              postalCode: data.zip,
              timezone: data.timezone,
              coordinates:
                data.lat && data.lon
                  ? {
                      latitude: data.lat,
                      longitude: data.lon,
                      accuracy: 50,
                    }
                  : undefined,
              isp: data.isp,
              organization: data.org,
              asn: data.as
                ? parseInt(data.as.split(' ')[0]?.replace('AS', '') ?? '0', 10)
                : undefined,
              asnOrganization: data.asname,
              isProxy: data.proxy ?? false,
              isVpn: false,
              isTor: false,
              isHosting: data.hosting ?? false,
              isBot: false,
              threatLevel: data.proxy || data.hosting ? 'low' : 'none',
              resolvedAt: new Date(),
            });
          }
        }
      } finally {
        clearTimeout(timeoutId);
      }
    }

    return results;
  }

  /**
   * Lookup using ipstack.com (requires API key)
   */
  private async lookupIpStack(ip: string, includeSecurityInfo: boolean): Promise<GeoLocation> {
    if (!this.config.apiKey) {
      throw new Error('IPStack requires an API key');
    }

    let url = `http://api.ipstack.com/${ip}?access_key=${this.config.apiKey}`;
    if (includeSecurityInfo) {
      url += '&security=1';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, { signal: controller.signal });
      const data = (await response.json()) as IpStackResponse;

      if (data.error) {
        throw new Error(data.error.info ?? 'IPStack lookup failed');
      }

      return {
        ip,
        country: data.country_code ?? 'XX',
        countryName: data.country_name ?? 'Unknown',
        region: data.region_code,
        regionName: data.region_name,
        city: data.city,
        postalCode: data.zip,
        timezone: data.time_zone?.id,
        coordinates:
          data.latitude && data.longitude
            ? {
                latitude: data.latitude,
                longitude: data.longitude,
              }
            : undefined,
        isp: data.connection?.isp,
        organization: data.connection?.isp,
        asn: data.connection?.asn,
        isProxy: data.security?.is_proxy ?? false,
        isVpn: data.security?.is_vpn ?? false,
        isTor: data.security?.is_tor ?? false,
        isHosting: false,
        isBot: false,
        threatLevel: this.calculateThreatLevel(data.security),
        resolvedAt: new Date(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Lookup using ipinfo.io (requires API key for full features)
   */
  private async lookupIpInfo(ip: string): Promise<GeoLocation> {
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers.Authorization = `Bearer ${this.config.apiKey}`;
    }

    const url = `https://ipinfo.io/${ip}/json`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      const data = (await response.json()) as IpInfoResponse;

      if (data.error) {
        throw new Error(data.error.message ?? 'IPInfo lookup failed');
      }

      const [lat, lon] = (data.loc ?? '0,0').split(',').map(Number);

      return {
        ip,
        country: data.country ?? 'XX',
        countryName: data.country ?? 'Unknown', // IPInfo doesn't provide full name
        region: data.region,
        regionName: data.region,
        city: data.city,
        postalCode: data.postal,
        timezone: data.timezone,
        coordinates: {
          latitude: lat ?? 0,
          longitude: lon ?? 0,
        },
        organization: data.org,
        isProxy: false, // Requires Pro plan
        isVpn: false,
        isTor: false,
        isHosting: false,
        isBot: false,
        threatLevel: 'none',
        resolvedAt: new Date(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get mock location for testing
   */
  private getMockLocation(ip: string): GeoLocation {
    return {
      ip,
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
  }

  /**
   * Get location for private/reserved IPs
   */
  private getPrivateIPLocation(ip: string): GeoLocation {
    return {
      ip,
      country: 'XX',
      countryName: 'Private Network',
      city: 'Local',
      isProxy: false,
      isVpn: false,
      isTor: false,
      isHosting: false,
      isBot: false,
      threatLevel: 'none',
      resolvedAt: new Date(),
    };
  }

  /**
   * Check if IP is private/reserved
   */
  private isPrivateIP(ip: string): boolean {
    // Localhost
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.')) {
      return true;
    }

    // Private ranges
    const privateRanges = [
      '10.', // 10.0.0.0/8
      '192.168.', // 192.168.0.0/16
    ];

    if (privateRanges.some((range) => ip.startsWith(range))) {
      return true;
    }

    // 172.16.0.0/12
    if (ip.startsWith('172.')) {
      const second = parseInt(ip.split('.')[1] ?? '0', 10);
      if (second >= 16 && second <= 31) {
        return true;
      }
    }

    return false;
  }

  /**
   * Convert IPv4 address to number
   */
  private ipToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;

    let result = 0;
    for (let i = 0; i < 4; i++) {
      const part = parseInt(parts[i]!, 10);
      if (isNaN(part) || part < 0 || part > 255) return null;
      result = (result << 8) | part;
    }
    return result >>> 0;
  }

  /**
   * Cache a lookup result
   */
  private cacheResult(ip: string, location: GeoLocation): void {
    // Evict old entries if cache is full
    if (this.cache.size >= this.config.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(ip, {
      data: location,
      expiry: Date.now() + this.config.cacheTtlSeconds * 1000,
    });
  }

  /**
   * Calculate threat level from security data
   */
  private calculateThreatLevel(security?: IpStackSecurityData): GeoLocation['threatLevel'] {
    if (!security) return 'none';
    if (security.is_tor) return 'high';
    if (security.is_proxy || security.is_vpn) return 'medium';
    if (security.threat_level === 'high') return 'high';
    if (security.threat_level === 'medium') return 'medium';
    if (security.threat_level === 'low') return 'low';
    return 'none';
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

// ============================================================================
// RESPONSE TYPES (internal use)
// ============================================================================

interface IpApiResponse {
  status: 'success' | 'fail';
  message?: string;
  query?: string;
  country?: string;
  countryCode?: string;
  region?: string;
  regionName?: string;
  city?: string;
  zip?: string;
  lat?: number;
  lon?: number;
  timezone?: string;
  isp?: string;
  org?: string;
  as?: string;
  asname?: string;
  proxy?: boolean;
  hosting?: boolean;
}

interface IpStackResponse {
  ip?: string;
  country_code?: string;
  country_name?: string;
  region_code?: string;
  region_name?: string;
  city?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
  time_zone?: { id: string };
  connection?: {
    asn?: number;
    isp?: string;
  };
  security?: IpStackSecurityData;
  error?: {
    code: number;
    type: string;
    info?: string;
  };
}

interface IpStackSecurityData {
  is_proxy?: boolean;
  is_vpn?: boolean;
  is_tor?: boolean;
  is_crawler?: boolean;
  threat_level?: string;
}

interface IpInfoResponse {
  ip?: string;
  city?: string;
  region?: string;
  country?: string;
  loc?: string;
  postal?: string;
  timezone?: string;
  org?: string;
  error?: {
    title: string;
    message?: string;
  };
}

// ============================================================================
// FACTORY FUNCTIONS
// ============================================================================

/**
 * Create a GeoIP adapter with sensible defaults
 */
export function createGeoIPAdapter(config?: Partial<GeoIPServiceConfig>): GeoIPService {
  return new GeoIPAdapter({
    provider: 'ip-api',
    ...config,
  });
}

/**
 * Create a mock GeoIP adapter for testing
 */
export function createMockGeoIPAdapter(): GeoIPService {
  return new GeoIPAdapter({ provider: 'mock' });
}
