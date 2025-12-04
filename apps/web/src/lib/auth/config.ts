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

// Auth configuration uses database if DATABASE_URL is set, otherwise environment variables

export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const pathname = nextUrl.pathname;

      // Explicitly define public paths (allowlist approach for clarity)
      // This prevents accidental exposure of protected routes
      const publicPaths = ['/login', '/offline', '/privacy', '/terms', '/api/auth'];

      const isPublicPath =
        publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
        pathname.startsWith('/api/auth');

      // Allow access to all public paths
      if (isPublicPath) {
        return true;
      }

      // All non-public paths require authentication
      if (!isLoggedIn) {
        return false; // Redirect unauthenticated users to login
      }

      // Redirect logged-in users away from login page to dashboard
      // (at this point we know isLoggedIn is true since we returned false above)
      if (pathname === '/login') {
        return Response.redirect(new URL('/', nextUrl));
      }

      return true;
    },

    jwt({ token, user }) {
      // Runtime guard: user is only defined during sign-in, not on subsequent requests
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- user may be undefined at runtime
      if (user) {
        const authUser = user as AuthUser;
        token.id = authUser.id;
        token.role = authUser.role;
        token.clinicId = authUser.clinicId;
      }
      return token;
    },

    session({ session, token }) {
      // Runtime guard: defensive check for edge cases where session.user may be undefined
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
      if (session.user && token.sub) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.clinicId = token.clinicId as string | undefined;
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

        const user = await validateCredentials(email, password, context);

        // Log authentication attempt for compliance audit trail
        // Fire-and-forget: don't block auth flow on logging
        void logAuthEvent(user ? 'login_success' : 'login_failure', user?.id, email, context);

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
