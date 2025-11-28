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
import { validateCredentials } from './database-adapter';

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
      const isOnDashboard = !nextUrl.pathname.startsWith('/login');
      const isPublicPath =
        nextUrl.pathname === '/login' ||
        nextUrl.pathname === '/offline' ||
        nextUrl.pathname.startsWith('/api/auth');

      if (isPublicPath) {
        return true;
      }

      if (isOnDashboard) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to login
      } else if (isLoggedIn) {
        return Response.redirect(new URL('/', nextUrl));
      }

      return true;
    },

    jwt({ token, user }) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (user) {
        // Add custom fields to JWT token
        token.id = user.id;
        token.role = (user as AuthUser).role;
        token.clinicId = (user as AuthUser).clinicId;
      }
      return token;
    },

    session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (session.user) {
        // Add custom fields to session
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

        // Extract request context for audit logging
        const context = {
          ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
                     request.headers.get('x-real-ip') ??
                     'unknown',
          userAgent: request.headers.get('user-agent') ?? undefined,
        };

        const user = await validateCredentials(email, password, context);

        return user;
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60, // 8 hours
  },

  trustHost: true,
};
