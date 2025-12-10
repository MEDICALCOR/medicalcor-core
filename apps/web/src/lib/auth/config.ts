/**
 * NextAuth.js Configuration (Full - Node.js Runtime)
 * Provides authentication for the MedicalCor Cortex web application
 *
 * This is the FULL auth config with Credentials provider and database adapter.
 * Use this in API routes and server components where Node.js runtime is available.
 *
 * For Edge Runtime (middleware), use config.edge.ts instead.
 *
 * SECURITY NOTE: Authentication is configured via environment variables
 * or database (when DATABASE_URL is set). No hardcoded credentials allowed.
 */

import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { validateCredentials, logAuthEvent } from './database-adapter';
import { authConfigEdge } from './config.edge';

// Re-export types from Edge config for backwards compatibility
export type { UserRole, AuthUser } from './config.edge';

// Import AuthUser as a type for use in this file
import type { AuthUser, UserRole } from './config.edge';

// Credentials validation schema
const CredentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Check if a value is a valid UserRole
 */
function isValidUserRole(value: unknown): value is UserRole {
  return (
    typeof value === 'string' &&
    (value === 'admin' || value === 'doctor' || value === 'receptionist' || value === 'staff')
  );
}

/**
 * Safely convert clinicId to string if present
 */
function convertClinicId(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
}

/**
 * Convert SafeUser from database to AuthUser for NextAuth
 * Includes type guard to ensure safe conversion
 */
function convertToAuthUser(userResult: unknown): AuthUser | null {
  // Type guard: verify userResult is a valid user object
  if (
    !userResult ||
    typeof userResult !== 'object' ||
    !('id' in userResult) ||
    !('email' in userResult) ||
    !('name' in userResult) ||
    !('role' in userResult)
  ) {
    return null;
  }

  const user = userResult as Record<string, unknown>;
  const role = user.role;

  // Verify role is a valid UserRole
  if (!isValidUserRole(role)) {
    return null;
  }

  return {
    id: String(user.id),
    email: String(user.email),
    name: String(user.name),
    role,
    clinicId: convertClinicId(user.clinicId),
  };
}

// Auth configuration extends Edge config with Credentials provider
// Database authentication is used if DATABASE_URL is set, otherwise environment variables

export const authConfig: NextAuthConfig = {
  // Spread all settings from Edge config (pages, callbacks, session, cookies, trustHost)
  ...authConfigEdge,

  // Add Credentials provider (requires Node.js runtime - not available in Edge)
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        const parsed = CredentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        // Extract request context for audit logging (HIPAA/GDPR compliance)
        const context = {
          ipAddress:
            request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
            request.headers.get('x-real-ip') ??
            'unknown',
          userAgent: request.headers.get('user-agent') ?? undefined,
        };

        // Validate credentials and convert to AuthUser format
        let user: AuthUser | null = null;

        try {
          const userResult: unknown = await validateCredentials(email, password, context);
          user = convertToAuthUser(userResult);
        } catch (error) {
          // Authentication failed - user remains null
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[Auth] Credential validation error:', errorMessage);
        }

        // PLATINUM STANDARD: Log all login attempts for medical compliance auditing
        // This is mandatory for HIPAA and GDPR audit trails
        try {
          const userId = user?.id;
          await logAuthEvent(user ? 'login_success' : 'login_failure', userId, email, context);
        } catch {
          // Event logging should never block authentication
          // But note: in production, failed logging should trigger alerts
          console.error('[Auth] Failed to log authentication event', {
            email: email.replace(/(.{2}).*@/, '$1***@'),
            success: !!user,
          });
        }

        return user;
      },
    }),
  ],
  // session, cookies, and trustHost are inherited from authConfigEdge
};
