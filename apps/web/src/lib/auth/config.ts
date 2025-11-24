/**
 * NextAuth.js Configuration
 * Provides authentication for the MedicalCor Cortex web application
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

// Credentials validation schema
const CredentialsSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

/**
 * Mock user database for development
 * In production, replace with actual database lookup
 */
const MOCK_USERS: Record<string, AuthUser & { password: string }> = {
  'admin@medicalcor.ro': {
    id: 'user_admin_001',
    email: 'admin@medicalcor.ro',
    name: 'Admin User',
    role: 'admin',
    password: 'admin123456', // In production, use hashed passwords
  },
  'doctor@medicalcor.ro': {
    id: 'user_doctor_001',
    email: 'doctor@medicalcor.ro',
    name: 'Dr. Elena Popescu',
    role: 'doctor',
    clinicId: 'clinic_001',
    password: 'doctor123456',
  },
  'reception@medicalcor.ro': {
    id: 'user_reception_001',
    email: 'reception@medicalcor.ro',
    name: 'Ana Receptionist',
    role: 'receptionist',
    clinicId: 'clinic_001',
    password: 'reception123456',
  },
};

/**
 * Validate user credentials
 * In production, replace with database lookup and bcrypt comparison
 */
function validateCredentials(email: string, password: string): AuthUser | null {
  const user = MOCK_USERS[email];

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!user) {
    return null;
  }

  // In production: use bcrypt.compare(password, user.hashedPassword)
  if (user.password !== password) {
    return null;
  }

  // Return user without password
  const { password: _, ...authUser } = user;
  return authUser;
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
      authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);

        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;
        const user = validateCredentials(email, password);

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
