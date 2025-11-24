/**
 * Next.js Middleware for Authentication
 * Protects routes and redirects unauthenticated users to login
 */

import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth/config';

export default NextAuth(authConfig).auth;

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
