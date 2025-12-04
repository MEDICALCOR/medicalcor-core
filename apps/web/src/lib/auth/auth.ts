/**
 * NextAuth.js Full Configuration with Providers
 *
 * This file contains the complete auth config including providers.
 * It should only be used in server-side code (not middleware/Edge Runtime).
 *
 * For middleware, use the edge-safe config from ./config.ts
 */

import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { authConfig, type AuthUser } from './config';
import { validateCredentials, logAuthEvent } from './database-adapter';

// Credentials validation schema
const CredentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Full auth configuration with providers
 * Only use this in server-side code (API routes, server actions)
 */
export const fullAuthConfig = {
  ...authConfig,
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

        // PLATINUM STANDARD: Log all login attempts for medical compliance auditing
        // This is mandatory for HIPAA and GDPR audit trails
        try {
          await logAuthEvent(user ? 'login_success' : 'login_failure', user?.id, email, context);
        } catch {
          // Event logging should never block authentication
          // But note: in production, failed logging should trigger alerts
          console.error('[Auth] Failed to log authentication event', {
            email: email.replace(/(.{2}).*@/, '$1***@'),
            success: !!user,
          });
        }

        return user as AuthUser | null;
      },
    }),
  ],
};

// Create NextAuth instance with full config (providers included)
export const { handlers, auth, signIn, signOut } = NextAuth(fullAuthConfig);
