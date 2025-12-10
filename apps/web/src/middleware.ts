/**
 * Next.js Middleware for Authentication
 * Protects routes and redirects unauthenticated users to login
 *
 * IMPORTANT: This middleware runs in Edge Runtime.
 * We use authConfigEdge which contains NO imports from @medicalcor/core
 * or other Node.js-only packages to avoid Edge Runtime compatibility issues.
 *
 * The full auth config (with database adapter) is used in API routes and
 * server components where Node.js runtime is available.
 */

import NextAuth from 'next-auth';
import { authConfigEdge } from '@/lib/auth/config.edge';

export default NextAuth(authConfigEdge).auth;

export const config = {
  // Match all routes except static files, api routes (except auth), and public assets
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (except /api/auth)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, icons, manifest.json (public assets)
     * - offline page
     */
    '/((?!api(?!/auth)|_next/static|_next/image|favicon.ico|icons|manifest.json|offline).*)',
  ],
};
