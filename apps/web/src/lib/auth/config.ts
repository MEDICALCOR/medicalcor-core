/**
 * NextAuth.js Configuration
 * Provides authentication for the MedicalCor Cortex web application
 *
 * SECURITY NOTE: Authentication is configured via environment variables
 * or database (when DATABASE_URL is set). No hardcoded credentials allowed.
 */

import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { validateCredentials, logAuthEvent } from './database-adapter';

// User roles for RBAC
export type UserRole = 'admin' | 'doctor' | 'receptionist' | 'staff';

// Extended user type with role
export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clinicId?: string;
}

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

// Auth configuration uses database if DATABASE_URL is set, otherwise environment variables

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    /**
     * Authorization callback - determines access to routes
     * Uses explicit public paths allowlist for Platinum security standard
     */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;

      // Explicit public paths allowlist (Platinum Standard: fail-closed with clear allowlist)
      const publicPaths = [
        '/login',
        '/offline',
        '/api/auth',
        '/privacy',
        '/terms',
        '/health',
        '/robots.txt',
        '/sitemap.xml',
        '/favicon.ico',
        '/campanii', // Campaign landing pages (public)
      ];

      const pathname = nextUrl.pathname;
      const isPublicPath = publicPaths.some(
        (path) => pathname === path || pathname.startsWith(`${path}/`)
      );

      // Allow access to all public paths
      if (isPublicPath) {
        return true;
      }

      // All non-public paths require authentication (fail-closed)
      if (!isLoggedIn) {
        return false; // Redirect to login
      }

      // Logged-in users on login page should redirect to dashboard
      if (pathname === '/login') {
        return Response.redirect(new URL('/', nextUrl));
      }

      return true;
    },

    /**
     * JWT callback - extends token with user data
     *
     * NOTE: The `user` check is required at runtime despite TypeScript types.
     * NextAuth only passes `user` on initial sign-in (when JWT is created),
     * not on subsequent token refreshes. The types don't reflect this behavior.
     */
    jwt({ token, user }) {
      // Runtime guard: user is only defined during sign-in, not on subsequent requests
      // Type assertion to handle NextAuth's runtime behavior where user may be undefined
      const authUser = user as AuthUser | undefined;
      if (authUser) {
        token.id = authUser.id;
        token.role = authUser.role;
        token.clinicId = authUser.clinicId;
      }
      return token;
    },

    /**
     * Session callback - extends session with token data
     *
     * NOTE: The `session.user && token.sub` check is a defensive guard.
     * While types suggest these are always present, we verify at runtime
     * for additional safety in a medical/HIPAA context.
     */
    session({ session, token }) {
      // Runtime guard: defensive check for edge cases where session.user may be undefined
      // Type assertions to handle potential undefined values at runtime (HIPAA safety)
      const sessionUser = session.user as typeof session.user | undefined;
      if (sessionUser && token.sub) {
        sessionUser.id = token.id as string;
        sessionUser.role = token.role as UserRole;
        sessionUser.clinicId = token.clinicId as string | undefined;
      }
      return session;
    },
  },

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

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },

  /**
   * SECURITY FIX: Cookie configuration for session security
   * These flags protect against XSS, CSRF, and session hijacking
   */
  cookies: {
    sessionToken: {
      name: `__Secure-next-auth.session-token`,
      options: {
        httpOnly: true, // Prevents JavaScript access (XSS protection)
        sameSite: 'lax', // CSRF protection while allowing OAuth redirects
        path: '/',
        secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      },
    },
    callbackUrl: {
      name: `__Secure-next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: `__Host-next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  /**
   * SECURITY FIX: Only trust host header in production if behind a trusted proxy
   * This prevents host header injection attacks
   */
  trustHost: process.env.NODE_ENV === 'production' ? !!process.env.TRUSTED_PROXY : true,
};
