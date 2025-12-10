/**
 * Edge-Compatible NextAuth.js Configuration
 *
 * This configuration is designed to run in Edge Runtime (middleware).
 * It contains ONLY the parts needed for route authorization.
 *
 * IMPORTANT: Do NOT import from @medicalcor/core or any Node.js-only packages here.
 * Those imports trigger webpack to bundle Node.js modules (crypto, fs, etc.)
 * which are not available in Edge Runtime.
 *
 * The full auth config (config.ts) extends this with the Credentials provider
 * and database adapter for actual authentication.
 */

import type { NextAuthConfig } from 'next-auth';

// User roles for RBAC (duplicated here to avoid importing from config.ts)
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
 * Edge-compatible auth configuration
 * Contains only route authorization logic - no database/crypto operations
 */
export const authConfigEdge: NextAuthConfig = {
  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    /**
     * Authorization callback - determines access to routes
     * Uses explicit public paths allowlist for Platinum security standard
     *
     * This runs in Edge Runtime for every request matching the middleware pattern.
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
      // Runtime guard: defensive check for edge cases
      const sessionUser = session.user as typeof session.user | undefined;
      if (sessionUser && token.sub) {
        sessionUser.id = token.id as string;
        sessionUser.role = token.role as UserRole;
        sessionUser.clinicId = token.clinicId as string | undefined;
      }
      return session;
    },
  },

  // Providers are added in the full config (config.ts)
  // Empty array here - Edge Runtime only needs callbacks for authorization
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
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
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
   */
  trustHost: process.env.NODE_ENV === 'production' ? !!process.env.TRUSTED_PROXY : true,
};
