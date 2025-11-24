/**
 * NextAuth.js Configuration
 * Provides authentication for the MedicalCor Cortex web application
 *
 * SECURITY NOTE: Authentication is configured via environment variables.
 * No hardcoded credentials are allowed in this file.
 */

import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

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
 * User configuration from environment variables
 * Each user is configured via env vars in the format:
 * AUTH_USER_<ID>_EMAIL, AUTH_USER_<ID>_PASSWORD_HASH, AUTH_USER_<ID>_NAME, AUTH_USER_<ID>_ROLE, AUTH_USER_<ID>_CLINIC_ID
 *
 * Password hashes should be generated with bcrypt (cost factor 12+)
 * Example: npx bcryptjs hash "yourpassword" 12
 */
interface EnvUser {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  clinicId?: string;
}

/**
 * Load users from environment variables
 * SECURITY: Users are defined via environment variables, not hardcoded
 */
function loadUsersFromEnv(): EnvUser[] {
  const users: EnvUser[] = [];

  // Load primary admin user from dedicated env vars
  const adminEmail = process.env.AUTH_ADMIN_EMAIL;
  const adminPasswordHash = process.env.AUTH_ADMIN_PASSWORD_HASH;
  const adminName = process.env.AUTH_ADMIN_NAME ?? 'Administrator';

  if (adminEmail && adminPasswordHash) {
    users.push({
      id: 'admin_primary',
      email: adminEmail,
      passwordHash: adminPasswordHash,
      name: adminName,
      role: 'admin',
    });
  }

  // Load additional users from numbered env vars (AUTH_USER_1_*, AUTH_USER_2_*, etc.)
  for (let i = 1; i <= 20; i++) {
    const prefix = `AUTH_USER_${i}_`;
    const email = process.env[`${prefix}EMAIL`];
    const passwordHash = process.env[`${prefix}PASSWORD_HASH`];
    const name = process.env[`${prefix}NAME`];
    const role = process.env[`${prefix}ROLE`] as UserRole | undefined;
    const clinicId = process.env[`${prefix}CLINIC_ID`];

    if (email && passwordHash && name && role) {
      users.push({
        id: `user_${i}`,
        email,
        passwordHash,
        name,
        role,
        clinicId: clinicId || undefined,
      });
    }
  }

  return users;
}

// Load users once at startup
const configuredUsers = loadUsersFromEnv();

// Log warning if no users are configured (but don't log user details for security)
if (configuredUsers.length === 0) {
  console.warn(
    '[Auth] WARNING: No users configured. Set AUTH_ADMIN_EMAIL and AUTH_ADMIN_PASSWORD_HASH environment variables.'
  );
} else {
  console.log(`[Auth] Loaded ${configuredUsers.length} user(s) from environment configuration`);
}

/**
 * Validate user credentials against environment-configured users
 * Uses bcrypt for secure password comparison
 */
async function validateCredentials(email: string, password: string): Promise<AuthUser | null> {
  const user = configuredUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());

  if (!user) {
    // Use constant-time comparison to prevent timing attacks
    // Hash a dummy password to maintain consistent timing
    await bcrypt.compare(password, '$2a$12$dummy.hash.for.timing.attack.prevention');
    return null;
  }

  // Securely compare password with stored hash
  const isValid = await bcrypt.compare(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  // Return user without password hash
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    clinicId: user.clinicId,
  };
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
