/**
 * NextAuth.js Configuration
 * Provides authentication for the MedicalCor Cortex web application
 *
 * SECURITY: This file requires proper database connection.
 * Mock users have been REMOVED - authentication will fail until database is configured.
 */

import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';

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

// Database user type (includes hashed password)
interface DatabaseUser extends AuthUser {
  hashedPassword: string;
}

// Credentials validation schema
const CredentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Validate user credentials against database
 * SECURITY: Uses bcrypt for password comparison
 */
async function validateCredentials(email: string, password: string): Promise<AuthUser | null> {
  // Get user from database
  const user = await getUserByEmail(email);

  if (!user) {
    return null;
  }

  // Verify password with bcrypt
  const isValid = await verifyPassword(password, user.hashedPassword);

  if (!isValid) {
    return null;
  }

  // Return user without password
  const { hashedPassword: _, ...authUser } = user;
  return authUser;
}

/**
 * Get user from database by email
 * CRITICAL: This must query the actual database
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function getUserByEmail(email: string): Promise<DatabaseUser | null> {
  // TODO: Implement actual database query
  // Example with Prisma:
  // return await prisma.user.findUnique({
  //   where: { email },
  //   select: {
  //     id: true,
  //     email: true,
  //     name: true,
  //     role: true,
  //     clinicId: true,
  //     hashedPassword: true,
  //   },
  // });

  // Check if database URL is configured
  if (!process.env.DATABASE_URL) {
    console.error('[AUTH] DATABASE_URL not configured - authentication disabled');
    return null;
  }

  // SECURITY: No mock users - database integration required
  console.error(
    `[AUTH] Database query not implemented for user: ${email}. Authentication disabled until database integration is complete.`
  );
  return null;
}

/**
 * Verify password against bcrypt hash
 * CRITICAL: Must use proper bcrypt comparison
 */
// eslint-disable-next-line @typescript-eslint/require-await
async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  // TODO: Implement with bcrypt
  // import bcrypt from 'bcrypt';
  // return await bcrypt.compare(password, hashedPassword);

  // SECURITY: No plain-text comparison - bcrypt required
  console.error('[AUTH] bcrypt password verification not implemented');
  void password;
  void hashedPassword;
  return false;
}

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
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;
        const user = await validateCredentials(email, password);

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
