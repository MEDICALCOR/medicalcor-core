# Authentication Module

Complete authentication, authorization, and session management for MedicalCor Cortex.

## Features

- **Database-backed users** - PostgreSQL storage with bcrypt password hashing
- **Brute force protection** - Rate limiting and account lockout
- **Session management** - JWT tokens with revocation support
- **Audit logging** - HIPAA/GDPR compliant event tracking
- **Password reset** - Secure token-based password recovery
- **Role-based access** - Four roles: admin, doctor, receptionist, staff

## Quick Start

### 1. Run Database Migration

```bash
psql $DATABASE_URL < packages/core/src/auth/schema.sql
```

### 2. Create Admin User

```bash
# Interactive mode
cd packages/core && npx ts-node scripts/setup-admin.ts

# Or with environment variables
ADMIN_EMAIL=admin@clinic.com ADMIN_PASSWORD=SecurePass123 npx ts-node scripts/setup-admin.ts
```

### 3. Configure Environment

```env
# Required for database auth
DATABASE_URL=postgresql://user:pass@localhost:5432/medicalcor

# Optional: fallback to env-based auth if no DATABASE_URL
AUTH_ADMIN_EMAIL=admin@clinic.com
AUTH_ADMIN_PASSWORD_HASH=$2a$12$... # bcrypt hash
```

## Security Configuration

### Rate Limiting

| Setting | Default | Description |
|---------|---------|-------------|
| `maxFailedAttemptsPerEmail` | 5 | Max failed logins per email in window |
| `maxFailedAttemptsPerIp` | 20 | Max failed logins per IP in window |
| `windowMinutes` | 15 | Rate limit time window |
| `lockoutMinutes` | 30 | Account lockout duration |

### Password Policy

| Requirement | Default |
|------------|---------|
| Minimum length | 8 characters |
| Maximum length | 128 characters |
| Uppercase required | Yes |
| Lowercase required | Yes |
| Number required | Yes |
| Special character required | No |

### Session Configuration

| Setting | Default |
|---------|---------|
| Session duration | 8 hours |
| Max concurrent sessions | 5 per user |
| Token storage | JWT (HTTP-only cookie) |

## API Reference

### AuthService

```typescript
import { AuthService, createDatabaseClient } from '@medicalcor/core';

const db = createDatabaseClient();
const authService = new AuthService(db);

// Login
const result = await authService.login(email, password, {
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
});

if (result.success) {
  // result.user - SafeUser object
  // result.session - Session object
  // result.accessToken - JWT token
}

// Logout
await authService.logout(sessionId);

// Logout from all devices
await authService.logoutAll(userId);

// Validate session
const session = await authService.validateSession(token);

// Create user
const user = await authService.createUser({
  email: 'doctor@clinic.com',
  password: 'SecurePass123',
  name: 'Dr. Smith',
  role: 'doctor',
  clinicId: 'clinic-uuid'
});

// Change password
await authService.changePassword(userId, currentPassword, newPassword);

// Admin reset password
await authService.adminResetPassword(userId, newPassword);

// Unlock account
await authService.unlockAccount(userId);
```

### PasswordResetService

```typescript
import { PasswordResetService, createDatabaseClient } from '@medicalcor/core';

const db = createDatabaseClient();
const resetService = new PasswordResetService(db);

// Request reset (returns token - send via email in production)
const { success, token } = await resetService.requestReset(email);

// Validate token
const { valid, userId, email } = await resetService.validateToken(token);

// Complete reset
const result = await resetService.completeReset(token, newPassword);
```

## Database Schema

### Tables

- `users` - User accounts with roles and status
- `sessions` - Active sessions with revocation support
- `auth_events` - Audit log for all auth events
- `login_attempts` - Brute force tracking
- `password_reset_tokens` - Password recovery tokens
- `refresh_tokens` - Token rotation (future use)

### User Roles

| Role | Level | Description |
|------|-------|-------------|
| `admin` | 4 | Full system access |
| `doctor` | 3 | Medical records, patients |
| `receptionist` | 2 | Appointments, basic patient data |
| `staff` | 1 | View-only access |

### Auth Events

Tracked events for audit compliance:

- `login_success` / `login_failure`
- `logout`
- `session_revoked`
- `password_changed`
- `password_reset_requested` / `password_reset_completed`
- `account_locked` / `account_unlocked`
- `user_created` / `user_updated` / `user_deleted`
- `permission_denied`
- `suspicious_activity`

## NextAuth Integration

The module integrates with NextAuth.js via the database adapter:

```typescript
// apps/web/src/lib/auth/database-adapter.ts
import { validateCredentials } from './database-adapter';

// In NextAuth config
async authorize(credentials, request) {
  const context = {
    ipAddress: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  };
  return validateCredentials(email, password, context);
}
```

**Fallback behavior**: If `DATABASE_URL` is not set, authentication falls back to environment variables (`AUTH_ADMIN_EMAIL`, `AUTH_USER_*_EMAIL`, etc.).

## Maintenance

### Cleanup Expired Data

Run periodically (e.g., daily cron job):

```typescript
const authService = new AuthService(db);
const { expiredSessions, oldAttempts, oldEvents } = await authService.cleanup();
```

Or via SQL:

```sql
SELECT cleanup_expired_auth_data();
```

### Monitor Suspicious Activity

```typescript
// Get IPs with high failure rates
const suspicious = await authService.getSuspiciousActivity(24); // last 24 hours

// Get login statistics
const stats = await authService.getLoginStats(24);
```

## Testing

```bash
cd packages/core
npm test -- src/auth/__tests__/
```

## Migration from Env-Based Auth

1. Set `DATABASE_URL` environment variable
2. Run migration: `psql $DATABASE_URL < schema.sql`
3. Create admin: `npx ts-node scripts/setup-admin.ts`
4. Existing env-based users will still work as fallback
5. Gradually migrate users to database
6. Remove env-based user variables when ready
