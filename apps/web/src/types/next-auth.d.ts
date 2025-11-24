/**
 * NextAuth.js Type Declarations
 * Extends the default types with custom user properties
 */

import 'next-auth';
import type { UserRole } from '@/lib/auth';

declare module 'next-auth' {
  interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    clinicId?: string;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      clinicId?: string;
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string;
    role: UserRole;
    clinicId?: string;
  }
}
