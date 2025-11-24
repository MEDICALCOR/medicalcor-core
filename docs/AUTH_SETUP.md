# Authentication Setup Guide

**MedicalCor Core - Complete Authentication System**

This guide explains how to configure and use the authentication system built with NextAuth.js v5.

---

## 🎯 Overview

The authentication system provides:
- ✅ **Secure credential-based login** with bcrypt password hashing
- ✅ **Role-Based Access Control (RBAC)** - admin, doctor, receptionist, staff
- ✅ **Permission-based authorization** for granular access control
- ✅ **Dual authentication modes**: Database or Environment Variables
- ✅ **IDOR protection** with clinic-level access control
- ✅ **Audit logging** for login attempts and events
- ✅ **Session management** with JWT tokens (8-hour expiry)
- ✅ **Middleware protection** for all routes except public paths

---

## 🔐 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    User Browser                              │
│                  /login page                                 │
└────────────────────────┬────────────────────────────────────┘
                         │ POST /api/auth/signin
                         ▼
┌─────────────────────────────────────────────────────────────┐
│             NextAuth.js API Route                            │
│          /api/auth/[...nextauth]/route.ts                    │
└────────────────────────┬────────────────────────────────────┘
                         │ Credentials validation
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            Database Adapter                                  │
│       /lib/auth/database-adapter.ts                          │
├──────────────────────┬──────────────────────────────────────┤
│  Database Mode       │  Env Vars Mode (Fallback)            │
│  @medicalcor/core    │  Load from environment               │
│  AuthService         │  Validate with bcryptjs              │
└──────────────────────┴──────────────────────────────────────┘
                         │ User found + valid
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  JWT Token Created                           │
│            (includes role, clinicId)                         │
└────────────────────────┬────────────────────────────────────┘
                         │ Set session cookie
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Middleware.ts                               │
│        Validates JWT on every request                        │
│        Protects routes except /login, /offline               │
└──────────────────────────┬──────────────────────────────────┘
                           │ Authorized
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Server Actions                                  │
│     requirePermission('VIEW_PATIENTS')                       │
│     requirePatientAccess(patientId)                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### 1. Generate NEXTAUTH_SECRET

```bash
openssl rand -base64 32
```

Add to `.env`:
```env
NEXTAUTH_SECRET=your_generated_secret_here
NEXTAUTH_URL=http://localhost:3001
```

### 2. Generate Admin Password Hash

Using Node.js:
```bash
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('YourSecurePassword123!', 12).then(hash => console.log(hash));"
```

Or using the provided script:
```bash
pnpm run hash-password
# Enter password when prompted
```

### 3. Configure Admin User

Add to `.env`:
```env
AUTH_ADMIN_EMAIL=admin@medicalcor.com
AUTH_ADMIN_PASSWORD_HASH=$2a$12$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AUTH_ADMIN_NAME=Administrator
```

### 4. Start the Application

```bash
pnpm dev
```

Navigate to `http://localhost:3001/login` and sign in with your admin credentials.

---

## 👥 User Roles & Permissions

### Role Hierarchy

```
admin (Level 4)
  └─ Full system access
  └─ User management
  └─ Settings management
  └─ All data access

doctor (Level 3)
  └─ View/edit medical records
  └─ View/manage appointments
  └─ View analytics
  └─ Clinic-scoped access

receptionist (Level 2)
  └─ View patients (clinic-scoped)
  └─ Manage appointments
  └─ Send messages
  └─ Limited data access

staff (Level 1)
  └─ View appointments only
  └─ Minimal access
```

### Permission Matrix

| Permission | Admin | Doctor | Receptionist | Staff |
|------------|-------|--------|--------------|-------|
| **VIEW_PATIENTS** | ✅ | ✅ | ✅ | ❌ |
| **EDIT_PATIENTS** | ✅ | ✅ | ❌ | ❌ |
| **DELETE_PATIENTS** | ✅ | ❌ | ❌ | ❌ |
| **VIEW_MEDICAL_RECORDS** | ✅ | ✅ | ❌ | ❌ |
| **EDIT_MEDICAL_RECORDS** | ❌ | ✅ | ❌ | ❌ |
| **VIEW_APPOINTMENTS** | ✅ | ✅ | ✅ | ✅ |
| **MANAGE_APPOINTMENTS** | ✅ | ✅ | ✅ | ❌ |
| **VIEW_ANALYTICS** | ✅ | ✅ | ❌ | ❌ |
| **MANAGE_SETTINGS** | ✅ | ❌ | ❌ | ❌ |
| **MANAGE_USERS** | ✅ | ❌ | ❌ | ❌ |
| **VIEW_MESSAGES** | ✅ | ✅ | ✅ | ❌ |
| **SEND_MESSAGES** | ✅ | ✅ | ✅ | ❌ |

---

## 📚 Configuration Modes

### Mode 1: Environment Variables (Recommended for Development)

**Pros:** Simple setup, no database required
**Cons:** Limited to 20 users, no user management UI

Configure up to 20 users in `.env`:

```env
# User 1
AUTH_USER_1_EMAIL=doctor@clinic.com
AUTH_USER_1_PASSWORD_HASH=$2a$12$xxxxxxxxxxxxxxxxxxxxx
AUTH_USER_1_NAME=Dr. Maria Popescu
AUTH_USER_1_ROLE=doctor
AUTH_USER_1_CLINIC_ID=clinic_bucuresti

# User 2
AUTH_USER_2_EMAIL=reception@clinic.com
AUTH_USER_2_PASSWORD_HASH=$2a$12$yyyyyyyyyyyyyyyyyyyyy
AUTH_USER_2_NAME=Ana Ionescu
AUTH_USER_2_ROLE=receptionist
AUTH_USER_2_CLINIC_ID=clinic_bucuresti
```

### Mode 2: Database (Recommended for Production)

**Pros:** Unlimited users, user management API, audit logging
**Cons:** Requires PostgreSQL database

1. Configure `DATABASE_URL` in `.env`:
```env
DATABASE_URL=postgresql://user:password@host:5432/medicalcor
```

2. Run database migrations:
```bash
cd packages/core
pnpm run migrate
```

3. Create users via database:
```sql
INSERT INTO users (id, email, name, password_hash, role, clinic_id, status)
VALUES (
  gen_random_uuid(),
  'doctor@clinic.com',
  'Dr. Maria Popescu',
  '$2a$12$xxxxxxxxxxxxxxxxxxxxx',
  'doctor',
  'clinic_bucuresti',
  'active'
);
```

---

## 🔒 Security Features

### 1. Password Security

- **bcrypt hashing** with cost factor 12+ (recommended 14 for production)
- **Constant-time comparison** to prevent timing attacks
- **Minimum length**: 8 characters (enforced by Zod schema)
- **No password reuse** (when using database mode with history tracking)

### 2. IDOR Protection

Non-admin users can only access patients in their clinic:

```typescript
// Automatically checked in server actions
export async function getPatientByIdAction(patientId: string) {
  await requirePermission('VIEW_PATIENTS');
  await requirePatientAccess(patientId); // ✅ IDOR protection

  const hubspot = getHubSpotClient();
  return await hubspot.getContact(patientId);
}
```

### 3. Session Security

- **JWT tokens** stored in HTTP-only cookies
- **8-hour expiry** (configurable in `config.ts`)
- **Automatic refresh** on page navigation
- **Secure flag** in production (HTTPS only)

### 4. Audit Logging

All authentication events are logged:
- Login success/failure
- Logout events
- IP address tracking
- User agent logging

Query audit log (database mode):
```sql
SELECT * FROM auth_events
WHERE user_id = 'xxx'
ORDER BY created_at DESC
LIMIT 50;
```

---

## 🛠️ Usage in Server Actions

### Basic Authentication

```typescript
import { requireAuth } from '@/lib/auth/server-action-auth';

export async function myAction() {
  const session = await requireAuth(); // Throws if not authenticated
  console.log(session.user.email, session.user.role);
}
```

### Role-Based Authorization

```typescript
import { requireRole } from '@/lib/auth/server-action-auth';

export async function adminOnlyAction() {
  await requireRole(['admin']); // Throws if not admin
  // Only admins reach here
}
```

### Permission-Based Authorization

```typescript
import { requirePermission } from '@/lib/auth/server-action-auth';

export async function getPatientsAction() {
  await requirePermission('VIEW_PATIENTS'); // Checks RBAC
  // Doctors, receptionists, and admins can proceed
}
```

### Patient Access Control (IDOR Protection)

```typescript
import { requirePatientAccess } from '@/lib/auth/server-action-auth';

export async function getPatientDetails(patientId: string) {
  await requirePermission('VIEW_PATIENTS');
  await requirePatientAccess(patientId); // Verifies clinic membership

  // User can only access patients in their clinic
}
```

### Optional Authentication

```typescript
import { getCurrentUser } from '@/lib/auth/server-action-auth';

export async function publicAction() {
  const user = await getCurrentUser(); // Returns null if not authenticated

  if (user) {
    // Personalized experience
  } else {
    // Public experience
  }
}
```

---

## 🧪 Testing

### Test Admin Login

1. Start the dev server: `pnpm dev`
2. Navigate to `http://localhost:3001/login`
3. Enter admin credentials
4. Should redirect to dashboard (`/`)

### Test Authorization

```typescript
// Test permission check
import { requirePermission } from '@/lib/auth/server-action-auth';

try {
  await requirePermission('MANAGE_USERS');
  console.log('✅ User has admin access');
} catch (error) {
  console.error('❌ Permission denied:', error.message);
}
```

### Test IDOR Protection

```typescript
import { requirePatientAccess } from '@/lib/auth/server-action-auth';

try {
  await requirePatientAccess('patient_other_clinic');
  console.log('❌ IDOR vulnerability! User accessed other clinic patient');
} catch (error) {
  console.log('✅ IDOR protection working:', error.message);
}
```

---

## 🔧 Troubleshooting

### "Invalid email or password"

**Cause:** Wrong credentials or password hash
**Fix:**
1. Verify `AUTH_ADMIN_EMAIL` matches login email exactly
2. Regenerate password hash: `pnpm run hash-password`
3. Check for extra spaces in `.env` file

### "NEXTAUTH_SECRET is not set"

**Cause:** Missing `NEXTAUTH_SECRET` environment variable
**Fix:**
```bash
openssl rand -base64 32 >> .env
```
Add result as `NEXTAUTH_SECRET=xxx`

### Redirect loop at `/login`

**Cause:** Session cookie not being set
**Fix:**
1. Verify `NEXTAUTH_URL` matches your dev URL exactly
2. Clear browser cookies for `localhost:3001`
3. Check browser console for errors

### "Authentication required" on server actions

**Cause:** Session expired or invalid
**Fix:**
1. Refresh page to trigger middleware
2. Re-login if session expired (8 hours)
3. Check JWT token in browser DevTools → Application → Cookies

### Database connection errors

**Cause:** Invalid `DATABASE_URL` or database not running
**Fix:**
1. Verify PostgreSQL is running
2. Check connection string format
3. System will fallback to env vars mode automatically

---

## 📖 API Reference

### Server Action Helpers

#### `requireAuth()`
Throws if user is not authenticated.

**Returns:** `Promise<Session>`

#### `requireRole(roles: UserRole[])`
Throws if user doesn't have one of the required roles.

**Example:**
```typescript
await requireRole(['admin', 'doctor']);
```

#### `requirePermission(permission: string)`
Throws if user doesn't have the required permission.

**Example:**
```typescript
await requirePermission('VIEW_PATIENTS');
```

#### `requirePatientAccess(patientId: string)`
Throws if user cannot access the specific patient (IDOR protection).

**Example:**
```typescript
await requirePatientAccess('123456');
```

#### `getCurrentUser()`
Returns current user or null (non-throwing).

**Returns:** `Promise<AuthUser | null>`

### Client-Side Hooks (React)

#### `useSession()` - from next-auth/react
```typescript
import { useSession } from 'next-auth/react';

function MyComponent() {
  const { data: session, status } = useSession();

  if (status === 'loading') return <Spinner />;
  if (status === 'unauthenticated') return <Login />;

  return <div>Welcome {session.user.name}!</div>;
}
```

#### `signIn()` - from next-auth/react
```typescript
import { signIn } from 'next-auth/react';

await signIn('credentials', {
  email: 'admin@medicalcor.com',
  password: 'password123',
  redirect: false,
});
```

#### `signOut()` - from next-auth/react
```typescript
import { signOut } from 'next-auth/react';

await signOut({ redirect: true, callbackUrl: '/login' });
```

---

## 🎓 Best Practices

### ✅ DO

- Use strong passwords (12+ characters, mixed case, numbers, symbols)
- Generate password hashes with bcrypt cost factor 14 for production
- Always use `requirePermission()` in server actions
- Enable database mode for production
- Rotate `NEXTAUTH_SECRET` periodically
- Use HTTPS in production
- Monitor auth event logs for suspicious activity
- Implement password reset flow (via email)

### ❌ DON'T

- Hardcode credentials in code
- Store plain-text passwords
- Share `NEXTAUTH_SECRET` publicly
- Skip authorization checks in server actions
- Use low bcrypt cost factors (< 12)
- Allow weak passwords
- Expose user IDs in client-side code
- Trust client-side authorization alone

---

## 📝 Environment Variable Reference

```env
# Required
NEXTAUTH_SECRET=<32+ random characters>
NEXTAUTH_URL=http://localhost:3001

# Admin User (Required)
AUTH_ADMIN_EMAIL=admin@medicalcor.com
AUTH_ADMIN_PASSWORD_HASH=$2a$12$xxxxxxxxxxxxxxxxxxxxx
AUTH_ADMIN_NAME=Administrator

# Database (Optional - enables full auth features)
DATABASE_URL=postgresql://user:password@host:5432/medicalcor

# Additional Users (Optional - max 20)
AUTH_USER_1_EMAIL=user@example.com
AUTH_USER_1_PASSWORD_HASH=$2a$12$yyyyyyyyyyyyyyyyyyyyy
AUTH_USER_1_NAME=User Name
AUTH_USER_1_ROLE=doctor|receptionist|staff|admin
AUTH_USER_1_CLINIC_ID=clinic_id (optional)
```

---

## 🆘 Support

For issues or questions:
1. Check this documentation
2. Review [NextAuth.js docs](https://next-auth.js.org/)
3. Check `packages/core/src/auth/` implementation
4. Open an issue on GitHub

---

**Last Updated:** November 24, 2025
**Version:** 1.0.0
**Status:** ✅ Production Ready
