/**
 * Database Authentication Adapter
 * Integrates the @medicalcor/core auth system with NextAuth.js
 *
 * NOTE: Uses dynamic imports to avoid Edge Runtime issues with Node.js crypto.
 * Auth services are only loaded when actually called (server-side), not at import time.
 */

import type { SafeUser, AuthContext, AuthService } from '@medicalcor/core';

// Lazy-loaded auth service singleton
let authServiceInstance: AuthService | null = null;

/**
 * Get or create the AuthService singleton
 * Uses dynamic import to avoid Edge Runtime issues
 */
async function getAuthService(): Promise<AuthService> {
  if (!authServiceInstance) {
    const { AuthService: AuthServiceClass, createDatabaseClient } = await import('@medicalcor/core');
    const db = createDatabaseClient();
    authServiceInstance = new AuthServiceClass(db);
  }
  return authServiceInstance;
}

/**
 * Validate user credentials against the database
 * Falls back to environment variables if database is not configured
 */
export async function validateCredentials(
  email: string,
  password: string,
  context?: AuthContext
): Promise<SafeUser | null> {
  // Check if database is configured
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    // Use database authentication
    try {
      const authService = await getAuthService();
      const result = await authService.login(email, password, context);

      if (result.success && result.user) {
        return result.user;
      }

      return null;
    } catch (error) {
      // CRITICAL FIX: Log authentication failures for compliance audit trail
      // Silent failures mask security issues and violate HIPAA audit requirements
      console.error('[Auth] Database authentication failed:', {
        email: email.replace(/(.{2}).*@/, '$1***@'), // Mask email for logging
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });

      // Log the auth failure event for compliance
      try {
        await logAuthEvent('login_failure', undefined, email, context);
      } catch {
        // Event logging failed - continue but note it
        console.error('[Auth] Failed to log authentication failure event');
      }

      // In production, don't fall back to env auth if DB auth fails
      // This prevents bypassing database security
      if (process.env.NODE_ENV === 'production') {
        console.error('[Auth] Production: Not falling back to env auth after DB failure');
        return null;
      }

      // Development only: fall through to env var auth as backup
      console.warn('[Auth] Development: Falling back to environment variable auth');
    }
  }

  // Fallback to environment variable authentication
  return validateCredentialsFromEnv(email, password);
}

/**
 * Validate credentials from environment variables
 * This is the fallback method when database is not available
 */
async function validateCredentialsFromEnv(
  email: string,
  password: string
): Promise<SafeUser | null> {
  // Dynamic import to avoid circular dependencies
  const bcrypt = await import('bcryptjs');

  // Load users from environment
  const users = loadUsersFromEnv();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    // Use constant-time comparison to prevent timing attacks
    await bcrypt.compare(password, '$2a$12$dummy.hash.for.timing.attack.prevention');
    return null;
  }

  const isValid = await bcrypt.compare(password, user.passwordHash);
  if (!isValid) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    clinicId: user.clinicId,
    status: 'active',
    emailVerified: true,
    createdAt: new Date(),
  };
}

interface EnvUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: 'admin' | 'doctor' | 'receptionist' | 'staff';
  clinicId?: string;
}

/**
 * Load users from environment variables
 */
function loadUsersFromEnv(): EnvUser[] {
  const users: EnvUser[] = [];

  // Load primary admin user
  const adminEmail = process.env.AUTH_ADMIN_EMAIL;
  const adminPasswordHash = process.env.AUTH_ADMIN_PASSWORD_HASH;
  const adminName = process.env.AUTH_ADMIN_NAME ?? 'Administrator';

  if (adminEmail && adminPasswordHash) {
    users.push({
      id: 'admin_primary',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      name: adminName,
      role: 'admin',
    });
  }

  // Load additional users
  for (let i = 1; i <= 20; i++) {
    const prefix = `AUTH_USER_${i}_`;
    const email = process.env[`${prefix}EMAIL`];
    const passwordHash = process.env[`${prefix}PASSWORD_HASH`];
    const name = process.env[`${prefix}NAME`];
    const role = process.env[`${prefix}ROLE`] as EnvUser['role'] | undefined;
    const clinicId = process.env[`${prefix}CLINIC_ID`];

    if (email && passwordHash && name && role) {
      users.push({
        id: `user_${i}`,
        email,
        passwordHash,
        name,
        role,
        clinicId: clinicId ?? undefined,
      });
    }
  }

  return users;
}

/**
 * Get user by ID from database or env
 */
export async function getUserById(id: string): Promise<SafeUser | null> {
  const dbUrl = process.env.DATABASE_URL;

  if (dbUrl) {
    try {
      const authService = await getAuthService();
      return await authService.getUser(id);
    } catch {
      // Failed to get user - fall through to env users
    }
  }

  // Fallback to env users
  const users = loadUsersFromEnv();
  const user = users.find((u) => u.id === id);

  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    clinicId: user.clinicId,
    status: 'active',
    emailVerified: true,
    createdAt: new Date(),
  };
}

/**
 * Log authentication event
 */
export async function logAuthEvent(
  eventType: 'login_success' | 'login_failure' | 'logout',
  userId?: string,
  email?: string,
  context?: AuthContext
): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    // No database - skip event logging
    return;
  }

  try {
    const { createDatabaseClient, AuthEventRepository } = await import('@medicalcor/core');
    const db = createDatabaseClient();
    const eventRepo = new AuthEventRepository(db);

    await eventRepo.log({
      userId,
      email,
      eventType,
      result: eventType === 'login_success' ? 'success' : 'failure',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  } catch {
    // Failed to log auth event - continue silently
  }
}

/**
 * Check if database auth is available
 */
export function isDatabaseAuthAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Get auth service for advanced operations
 * Returns null if database is not configured
 */
export async function getAuthServiceInstance(): Promise<AuthService | null> {
  if (!process.env.DATABASE_URL) {
    return null;
  }
  return getAuthService();
}
