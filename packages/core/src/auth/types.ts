/**
 * Authentication Types
 * Type definitions for the authentication system
 */

/** User roles for role-based access control */
export type UserRole = 'admin' | 'doctor' | 'receptionist' | 'staff';

/** User account status */
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'pending_verification';

/** Auth event types for audit logging */
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
  | 'suspicious_activity';

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
  clinicId?: string;
  status: UserStatus;
  emailVerified: boolean;
  emailVerifiedAt?: Date;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  passwordChangedAt?: Date;
  mustChangePassword: boolean;
  lastLoginAt?: Date;
  lastLoginIp?: string;
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
  clinicId?: string;
  status: UserStatus;
  emailVerified: boolean;
  lastLoginAt?: Date;
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
  clinicId?: string;
  status?: UserStatus;
  emailVerified?: boolean;
}

/**
 * User update data
 */
export interface UpdateUserData {
  email?: string;
  name?: string;
  role?: UserRole;
  clinicId?: string | null;
  status?: UserStatus;
  emailVerified?: boolean;
  mustChangePassword?: boolean;
}

/**
 * Session entity from database
 */
export interface Session {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: Record<string, unknown>;
  expiresAt: Date;
  revokedAt?: Date;
  revokedReason?: string;
  lastActivityAt: Date;
  createdAt: Date;
}

/**
 * Session creation data
 */
export interface CreateSessionData {
  userId: string;
  tokenHash: string;
  ipAddress?: string;
  userAgent?: string;
  deviceInfo?: Record<string, unknown>;
  expiresAt: Date;
}

/**
 * Auth event entity from database
 */
export interface AuthEvent {
  id: string;
  userId?: string;
  email?: string;
  eventType: AuthEventType;
  result: AuthEventResult;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

/**
 * Auth event creation data
 */
export interface CreateAuthEventData {
  userId?: string;
  email?: string;
  eventType: AuthEventType;
  result: AuthEventResult;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  details?: Record<string, unknown>;
}

/**
 * Login attempt entity from database
 */
export interface LoginAttempt {
  id: string;
  email: string;
  ipAddress: string;
  success: boolean;
  failureReason?: string;
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
  usedAt?: Date;
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
  revokedAt?: Date;
  createdAt: Date;
}

/**
 * Rate limit check result
 */
export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  resetAt?: Date;
  reason?: string;
}

/**
 * Authentication context for requests
 */
export interface AuthContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

/**
 * Login result
 */
export interface LoginResult {
  success: boolean;
  user?: SafeUser;
  session?: Session;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  lockedUntil?: Date;
}

/**
 * Password validation result
 */
export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}
