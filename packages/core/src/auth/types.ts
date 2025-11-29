/**
 * Authentication Types
 * Type definitions for the authentication system
 */

/** User roles for role-based access control */
export type UserRole = 'admin' | 'doctor' | 'receptionist' | 'staff';

/** User account status */
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification';

/**
 * Auth event types for audit logging
 * SECURITY FIX: Added comprehensive audit event types for HIPAA/GDPR compliance
 */
export type AuthEventType =
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'session_revoked'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'account_locked'
  | 'account_unlocked'
  | 'email_verified'
  | 'user_created'
  | 'user_updated'
  | 'user_deleted'
  | 'permission_denied'
  | 'suspicious_activity'
  // SECURITY FIX: Additional audit events for comprehensive logging
  | 'permission_changed'      // Role/permission modifications
  | 'api_key_created'         // API key generation
  | 'api_key_rotated'         // API key rotation
  | 'api_key_revoked'         // API key revocation
  | 'data_export_requested'   // GDPR data export
  | 'data_deletion_requested' // GDPR right to be forgotten
  | 'sensitive_data_accessed' // PHI/PII access logging
  | 'mfa_enabled'             // MFA setup
  | 'mfa_disabled'            // MFA disabled
  | 'settings_changed';       // Security settings modifications

/** Auth event result */
export type AuthEventResult = 'success' | 'failure' | 'blocked';

/**
 * User entity from database
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: UserRole;
  clinicId?: string | undefined;
  status: UserStatus;
  emailVerified: boolean;
  emailVerifiedAt?: Date | undefined;
  failedLoginAttempts: number;
  lockedUntil?: Date | undefined;
  passwordChangedAt?: Date | undefined;
  mustChangePassword: boolean;
  lastLoginAt?: Date | undefined;
  lastLoginIp?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User without sensitive data (for API responses)
 */
export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  clinicId?: string | undefined;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt?: Date | undefined;
  createdAt: Date;
}

/**
 * User creation data
 */
export interface CreateUserData {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  clinicId?: string | undefined;
  status?: UserStatus | undefined;
  emailVerified?: boolean | undefined;
}

/**
 * User update data
 */
export interface UpdateUserData {
  email?: string | undefined;
  name?: string | undefined;
  role?: UserRole | undefined;
  clinicId?: string | null | undefined;
  status?: UserStatus | undefined;
  emailVerified?: boolean | undefined;
  mustChangePassword?: boolean | undefined;
}

/**
 * Session entity from database
 */
export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  deviceInfo?: Record<string, unknown> | undefined;
  expiresAt: Date;
  revokedAt?: Date | undefined;
  revokedReason?: string | undefined;
  lastActivityAt: Date;
  createdAt: Date;
}

/**
 * Session creation data
 */
export interface CreateSessionData {
  userId: string;
  tokenHash: string;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  deviceInfo?: Record<string, unknown> | undefined;
  expiresAt: Date;
}

/**
 * Auth event entity from database
 */
export interface AuthEvent {
  id: string;
  userId?: string | undefined;
  email?: string | undefined;
  eventType: AuthEventType;
  result: AuthEventResult;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  sessionId?: string | undefined;
  details?: Record<string, unknown> | undefined;
  createdAt: Date;
}

/**
 * Auth event creation data
 */
export interface CreateAuthEventData {
  userId?: string | undefined;
  email?: string | undefined;
  eventType: AuthEventType;
  result: AuthEventResult;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  sessionId?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

/**
 * Login attempt entity from database
 */
export interface LoginAttempt {
  id: string;
  email: string;
  ipAddress: string;
  success: boolean;
  failureReason?: string | undefined;
  createdAt: Date;
}

/**
 * Password reset token entity
 */
export interface PasswordResetToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | undefined;
  createdAt: Date;
}

/**
 * Refresh token entity
 */
export interface RefreshToken {
  id: string;
  userId: string;
  sessionId: string;
  tokenHash: string;
  familyId: string;
  generation: number;
  expiresAt: Date;
  revokedAt?: Date | undefined;
  createdAt: Date;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetAt?: Date | undefined;
  reason?: string | undefined;
}

/**
 * Authentication context for requests
 */
export interface AuthContext {
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  sessionId?: string | undefined;
}

/**
 * Login result
 */
export interface LoginResult {
  success: boolean;
  user?: SafeUser | undefined;
  session?: Session | undefined;
  accessToken?: string | undefined;
  refreshToken?: string | undefined;
  error?: string | undefined;
  lockedUntil?: Date | undefined;
}

/**
 * Password validation result
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}
