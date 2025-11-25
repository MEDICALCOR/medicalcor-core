/**
 * API Authentication Plugin with Role-Based Access Control (RBAC)
 * Provides API key authentication and role-based authorization for protected endpoints
 *
 * SECURITY AUDIT: This plugin now supports RBAC with multiple roles:
 * - admin: Full access to all endpoints
 * - doctor: Access to patient data, appointments, and clinical operations
 * - receptionist: Access to scheduling and basic patient info
 * - system: Internal service-to-service communication
 */

import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';

/**
 * User roles supported by the RBAC system
 */
export type UserRole = 'admin' | 'doctor' | 'receptionist' | 'system';

/**
 * Route permission configuration
 */
export interface RoutePermission {
  /** Path prefix to match */
  path: string;
  /** HTTP methods this permission applies to (empty = all methods) */
  methods?: ('GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')[];
  /** Roles allowed to access this route */
  allowedRoles: UserRole[];
}

/**
 * API key configuration with associated role
 */
export interface ApiKeyConfig {
  /** The API key value */
  key: string;
  /** Role associated with this key */
  role: UserRole;
  /** Optional description/name for audit logging */
  name?: string;
}

export interface ApiAuthConfig {
  /**
   * API keys that are allowed to access protected endpoints
   * In production, these should come from a database or secrets manager
   * @deprecated Use apiKeyConfigs instead for RBAC support
   */
  apiKeys?: string[];

  /**
   * API keys with role assignments for RBAC
   * Each key is associated with a specific role
   */
  apiKeyConfigs?: ApiKeyConfig[];

  /**
   * Header name for the API key
   * @default 'x-api-key'
   */
  headerName?: string;

  /**
   * Paths that should be protected
   * @default ['/workflows']
   */
  protectedPaths?: string[];

  /**
   * Route permissions for RBAC
   * If not specified, defaults to allowing all authenticated users
   */
  routePermissions?: RoutePermission[];
}

/**
 * Default route permissions for medical CRM
 * These define what roles can access which endpoints
 */
const DEFAULT_ROUTE_PERMISSIONS: RoutePermission[] = [
  // Admin has access to everything
  { path: '/', allowedRoles: ['admin'] },

  // Workflows - system and admin only
  { path: '/workflows', allowedRoles: ['admin', 'system'] },

  // Patient data - doctors and admin
  {
    path: '/api/patients',
    methods: ['GET', 'POST', 'PUT', 'PATCH'],
    allowedRoles: ['admin', 'doctor'],
  },
  { path: '/api/patients', methods: ['DELETE'], allowedRoles: ['admin'] },

  // Appointments - all authenticated staff
  {
    path: '/api/appointments',
    methods: ['GET'],
    allowedRoles: ['admin', 'doctor', 'receptionist'],
  },
  {
    path: '/api/appointments',
    methods: ['POST', 'PUT', 'PATCH'],
    allowedRoles: ['admin', 'doctor', 'receptionist'],
  },
  { path: '/api/appointments', methods: ['DELETE'], allowedRoles: ['admin', 'doctor'] },

  // Scheduling/slots - all authenticated staff
  { path: '/api/slots', allowedRoles: ['admin', 'doctor', 'receptionist'] },
  { path: '/api/scheduling', allowedRoles: ['admin', 'doctor', 'receptionist'] },

  // Consent - doctors and admin (GDPR sensitive)
  { path: '/api/consent', allowedRoles: ['admin', 'doctor'] },

  // Analytics - admin and doctors
  { path: '/api/analytics', allowedRoles: ['admin', 'doctor'] },

  // Lead management - admin, doctors, and receptionists
  { path: '/api/leads', methods: ['GET'], allowedRoles: ['admin', 'doctor', 'receptionist'] },
  {
    path: '/api/leads',
    methods: ['POST', 'PUT', 'PATCH'],
    allowedRoles: ['admin', 'doctor', 'receptionist'],
  },

  // Communications - admin, doctors, and receptionists
  { path: '/api/messages', allowedRoles: ['admin', 'doctor', 'receptionist'] },
  { path: '/api/whatsapp', allowedRoles: ['admin', 'doctor', 'receptionist', 'system'] },

  // AI functions - system and admin
  { path: '/api/ai', allowedRoles: ['admin', 'system'] },

  // Admin-only operations
  { path: '/api/users', allowedRoles: ['admin'] },
  { path: '/api/audit', allowedRoles: ['admin'] },
  { path: '/api/settings', allowedRoles: ['admin'] },
];

/**
 * Timing-safe API key comparison that returns the matched key config
 */
function verifyApiKeyWithRole(
  providedKey: string,
  keyConfigs: ApiKeyConfig[]
): ApiKeyConfig | null {
  for (const keyConfig of keyConfigs) {
    try {
      if (
        providedKey.length === keyConfig.key.length &&
        crypto.timingSafeEqual(Buffer.from(providedKey), Buffer.from(keyConfig.key))
      ) {
        return keyConfig;
      }
    } catch {
      // Length mismatch or other error - continue to next key
      continue;
    }
  }
  return null;
}

/**
 * Check if a role has permission to access a route
 */
function checkRoutePermission(
  url: string,
  method: string,
  role: UserRole,
  permissions: RoutePermission[]
): boolean {
  // Admin always has access
  if (role === 'admin') {
    return true;
  }

  // Find matching permission rules (most specific first)
  const matchingPermissions = permissions
    .filter((p) => url.startsWith(p.path))
    .sort((a, b) => b.path.length - a.path.length); // Sort by specificity (longer paths first)

  for (const permission of matchingPermissions) {
    // Check if method matches (if specified)
    if (permission.methods && permission.methods.length > 0) {
      if (!permission.methods.includes(method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE')) {
        continue; // Method doesn't match, try next rule
      }
    }

    // Check if role is allowed
    return permission.allowedRoles.includes(role);
  }

  // No matching permission found - deny by default (principle of least privilege)
  return false;
}

/**
 * Extend FastifyRequest to include auth context
 */
declare module 'fastify' {
  interface FastifyRequest {
    authContext?: {
      role: UserRole;
      keyName?: string;
      authenticated: boolean;
    };
  }
}

/**
 * API Authentication Plugin with RBAC
 * Adds API key authentication and role-based authorization to protected routes
 */
export const apiAuthPlugin: FastifyPluginAsync<ApiAuthConfig> = async (fastify, options) => {
  const headerName = options.headerName ?? 'x-api-key';
  const protectedPaths = options.protectedPaths ?? ['/workflows'];
  const routePermissions = options.routePermissions ?? DEFAULT_ROUTE_PERMISSIONS;

  // Build API key configs from various sources
  let apiKeyConfigs: ApiKeyConfig[] = options.apiKeyConfigs ?? [];

  // Support legacy apiKeys array (backwards compatibility)
  if (options.apiKeys && options.apiKeys.length > 0) {
    fastify.log.warn(
      'Using deprecated apiKeys config. Please migrate to apiKeyConfigs for RBAC support.'
    );
    // Legacy keys default to 'system' role for backwards compatibility
    const legacyConfigs = options.apiKeys.map((key) => ({
      key,
      role: 'system' as UserRole,
      name: 'legacy-key',
    }));
    apiKeyConfigs = [...apiKeyConfigs, ...legacyConfigs];
  }

  // Support environment variable keys with role prefix
  // Format: API_SECRET_KEY_ADMIN, API_SECRET_KEY_DOCTOR, API_SECRET_KEY_RECEPTIONIST, API_SECRET_KEY_SYSTEM
  const roleEnvKeys: { envVar: string; role: UserRole }[] = [
    { envVar: 'API_SECRET_KEY_ADMIN', role: 'admin' },
    { envVar: 'API_SECRET_KEY_DOCTOR', role: 'doctor' },
    { envVar: 'API_SECRET_KEY_RECEPTIONIST', role: 'receptionist' },
    { envVar: 'API_SECRET_KEY_SYSTEM', role: 'system' },
  ];

  for (const { envVar, role } of roleEnvKeys) {
    const key = process.env[envVar];
    if (key) {
      apiKeyConfigs.push({ key, role, name: `env-${role}` });
    }
  }

  // Fallback to generic API_SECRET_KEY (system role for backwards compatibility)
  if (apiKeyConfigs.length === 0) {
    const envKey = process.env.API_SECRET_KEY;
    if (envKey) {
      apiKeyConfigs.push({ key: envKey, role: 'system', name: 'env-default' });
    }
  }

  // Error if no API keys configured (REQUIRED in all environments)
  if (apiKeyConfigs.length === 0) {
    fastify.log.error(
      'CRITICAL: No API keys configured - workflow endpoints will reject all requests! ' +
        'Set API_SECRET_KEY or API_SECRET_KEY_<ROLE> environment variables.'
    );
  } else {
    const roles = [...new Set(apiKeyConfigs.map((k) => k.role))];
    fastify.log.info(
      { keyCount: apiKeyConfigs.length, roles },
      'API authentication initialized with RBAC'
    );
  }

  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check if this path should be protected
    const isProtected = protectedPaths.some((path) => request.url.startsWith(path));

    if (!isProtected) {
      return; // Not a protected path, allow through
    }

    // API key is REQUIRED in all environments - no bypass allowed
    if (apiKeyConfigs.length === 0) {
      fastify.log.error(
        { url: request.url },
        'CRITICAL: No API keys configured - rejecting request'
      );
      return reply.status(500).send({ error: 'Server configuration error' });
    }

    // Get API key from header
    const providedKey = request.headers[headerName];

    if (!providedKey || typeof providedKey !== 'string') {
      fastify.log.warn({ url: request.url }, 'Missing API key');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'API key required',
      });
    }

    // Verify API key and get associated role
    const matchedKey = verifyApiKeyWithRole(providedKey, apiKeyConfigs);

    if (!matchedKey) {
      fastify.log.warn({ url: request.url }, 'Invalid API key');
      return reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid API key',
      });
    }

    // Set auth context on request for downstream handlers
    // Note: Only include keyName if it's defined (for exactOptionalPropertyTypes compatibility)
    request.authContext = matchedKey.name
      ? {
          role: matchedKey.role,
          keyName: matchedKey.name,
          authenticated: true,
        }
      : {
          role: matchedKey.role,
          authenticated: true,
        };

    // Check RBAC permission for this route
    const hasPermission = checkRoutePermission(
      request.url,
      request.method,
      matchedKey.role,
      routePermissions
    );

    if (!hasPermission) {
      fastify.log.warn(
        { url: request.url, method: request.method, role: matchedKey.role },
        'Access denied - insufficient permissions'
      );
      return reply.status(403).send({
        error: 'Forbidden',
        message: `Role '${matchedKey.role}' does not have permission to access this resource`,
      });
    }

    // API key and role are valid - request will proceed
    fastify.log.debug(
      { url: request.url, role: matchedKey.role, keyName: matchedKey.name },
      'Request authorized'
    );
  });

  return Promise.resolve();
};

export default apiAuthPlugin;

// Export types and utilities for external use
export { DEFAULT_ROUTE_PERMISSIONS, checkRoutePermission, verifyApiKeyWithRole };
