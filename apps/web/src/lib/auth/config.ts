/**
 * NextAuth.js Configuration
 * Provides authentication for the MedicalCor Cortex web application
 *
 * SECURITY NOTE: Authentication is configured via environment variables
 * or database (when DATABASE_URL is set). No hardcoded credentials allowed.
 *
 * NOTE: This file contains the edge-safe auth config (no Node.js dependencies).
 * The full config with providers is in auth.ts for server-side use only.
 */

import type { NextAuthConfig } from 'next-auth';

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

/**
 * Edge-safe auth configuration
 * This config is safe to use in middleware (Edge Runtime)
 * Does not include providers that require Node.js dependencies
 */
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
      const pathname = nextUrl.pathname;

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
      ];

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

      // Redirect logged-in users away from login page to dashboard
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- user may be undefined at runtime
      if (user) {
        const authUser = user as AuthUser;
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime safety
      if (session.user && token.sub) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
        session.user.clinicId = token.clinicId as string | undefined;
      }
      return session;
    },
  },

  // Providers are added in auth.ts (server-side only) to avoid Edge Runtime issues
  providers: [],

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
