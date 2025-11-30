/**
 * @module architecture/security/authentication
 *
 * Authentication Infrastructure
 * =============================
 *
 * Handles identity verification and session management.
 */

import type { Result } from '../../types/result.js';
import { Ok, Err } from '../../types/result.js';

// ============================================================================
// AUTHENTICATION TYPES
// ============================================================================

/**
 * Authenticated identity
 */
export interface Identity {
  readonly id: string;
  readonly type: IdentityType;
  readonly email?: string;
  readonly name?: string;
  readonly tenantId?: string;
  readonly roles: string[];
  readonly permissions: string[];
  readonly metadata: Record<string, unknown>;
  readonly authenticatedAt: Date;
  readonly expiresAt?: Date;
}

export type IdentityType = 'user' | 'service' | 'api_key' | 'anonymous';

/**
 * Authentication result
 */
export interface AuthenticationResult {
  readonly success: boolean;
  readonly identity?: Identity;
  readonly accessToken?: string;
  readonly refreshToken?: string;
  readonly expiresIn?: number;
  readonly error?: AuthenticationError;
}

export interface AuthenticationError {
  readonly code: string;
  readonly message: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Authentication credentials
 */
export type Credentials =
  | UsernamePasswordCredentials
  | TokenCredentials
  | ApiKeyCredentials
  | OAuth2Credentials
  | ServiceAccountCredentials;

export interface UsernamePasswordCredentials {
  readonly type: 'username_password';
  readonly username: string;
  readonly password: string;
  readonly mfaCode?: string;
}

export interface TokenCredentials {
  readonly type: 'token';
  readonly token: string;
  readonly tokenType: 'bearer' | 'jwt' | 'opaque';
}

export interface ApiKeyCredentials {
  readonly type: 'api_key';
  readonly apiKey: string;
  readonly apiSecret?: string;
}

export interface OAuth2Credentials {
  readonly type: 'oauth2';
  readonly provider: string;
  readonly authorizationCode?: string;
  readonly accessToken?: string;
  readonly idToken?: string;
}

export interface ServiceAccountCredentials {
  readonly type: 'service_account';
  readonly serviceId: string;
  readonly privateKey: string;
}

// ============================================================================
// AUTHENTICATION SERVICE INTERFACE
// ============================================================================

/**
 * Authentication service interface
 */
export interface AuthenticationService {
  /**
   * Authenticate with credentials
   */
  authenticate(
    credentials: Credentials
  ): Promise<Result<AuthenticationResult, AuthenticationError>>;

  /**
   * Validate a token
   */
  validateToken(token: string): Promise<Result<Identity, AuthenticationError>>;

  /**
   * Refresh an access token
   */
  refreshToken(refreshToken: string): Promise<Result<AuthenticationResult, AuthenticationError>>;

  /**
   * Revoke a token
   */
  revokeToken(token: string): Promise<void>;

  /**
   * Log out (revoke all tokens for identity)
   */
  logout(identityId: string): Promise<void>;
}

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

/**
 * Session data
 */
export interface Session {
  readonly sessionId: string;
  readonly identityId: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly lastActivityAt: Date;
  readonly ipAddress?: string;
  readonly userAgent?: string;
  readonly metadata: Record<string, unknown>;
}

/**
 * Session store interface
 */
export interface SessionStore {
  create(session: Session): Promise<void>;
  get(sessionId: string): Promise<Session | null>;
  update(sessionId: string, updates: Partial<Session>): Promise<void>;
  delete(sessionId: string): Promise<void>;
  deleteAllForIdentity(identityId: string): Promise<void>;
  getActiveSessionsForIdentity(identityId: string): Promise<Session[]>;
}

// ============================================================================
// MFA (MULTI-FACTOR AUTHENTICATION)
// ============================================================================

/**
 * MFA provider interface
 */
export interface MFAProvider {
  readonly providerName: string;
  readonly providerType: MFAType;

  /**
   * Enroll user in MFA
   */
  enroll(identityId: string): Promise<MFAEnrollmentResult>;

  /**
   * Verify MFA code
   */
  verify(identityId: string, code: string): Promise<Result<boolean, MFAError>>;

  /**
   * Generate recovery codes
   */
  generateRecoveryCodes(identityId: string): Promise<string[]>;

  /**
   * Verify recovery code
   */
  verifyRecoveryCode(identityId: string, code: string): Promise<Result<boolean, MFAError>>;

  /**
   * Disable MFA for user
   */
  disable(identityId: string): Promise<void>;
}

export type MFAType = 'totp' | 'sms' | 'email' | 'hardware_key' | 'push';

export interface MFAEnrollmentResult {
  readonly enrolled: boolean;
  readonly secret?: string;
  readonly qrCodeUrl?: string;
  readonly recoveryCodes?: string[];
}

export interface MFAError {
  readonly code: string;
  readonly message: string;
}

// ============================================================================
// PASSWORD POLICY
// ============================================================================

/**
 * Password policy configuration
 */
export interface PasswordPolicy {
  readonly minLength: number;
  readonly maxLength: number;
  readonly requireUppercase: boolean;
  readonly requireLowercase: boolean;
  readonly requireNumbers: boolean;
  readonly requireSpecialChars: boolean;
  readonly specialChars: string;
  readonly preventCommonPasswords: boolean;
  readonly preventUserInfoInPassword: boolean;
  readonly passwordHistoryCount: number;
  readonly maxAgeDays: number;
}

/**
 * Validate password against policy
 */
export function validatePassword(
  password: string,
  policy: PasswordPolicy,
  userInfo?: { username?: string; email?: string }
): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < policy.minLength) {
    errors.push(`Password must be at least ${policy.minLength} characters`);
  }

  if (password.length > policy.maxLength) {
    errors.push(`Password must be at most ${policy.maxLength} characters`);
  }

  if (policy.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (policy.requireLowercase && !/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (policy.requireNumbers && !/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (policy.requireSpecialChars) {
    const specialRegex = new RegExp(
      `[${policy.specialChars.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}]`
    );
    if (!specialRegex.test(password)) {
      errors.push(`Password must contain at least one special character (${policy.specialChars})`);
    }
  }

  if (policy.preventUserInfoInPassword && userInfo) {
    const lowerPassword = password.toLowerCase();
    if (userInfo.username && lowerPassword.includes(userInfo.username.toLowerCase())) {
      errors.push('Password cannot contain your username');
    }
    if (userInfo.email) {
      const emailLocal = userInfo.email.split('@')[0]?.toLowerCase() ?? '';
      if (lowerPassword.includes(emailLocal)) {
        errors.push('Password cannot contain your email');
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    strength: calculatePasswordStrength(password),
  };
}

export interface PasswordValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
  readonly strength: PasswordStrength;
}

export type PasswordStrength = 'very_weak' | 'weak' | 'fair' | 'strong' | 'very_strong';

function calculatePasswordStrength(password: string): PasswordStrength {
  let score = 0;

  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;

  if (score <= 1) return 'very_weak';
  if (score <= 2) return 'weak';
  if (score <= 3) return 'fair';
  if (score <= 4) return 'strong';
  return 'very_strong';
}

// ============================================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================================

/**
 * Authentication context for requests
 */
export interface AuthContext {
  readonly identity: Identity | null;
  readonly isAuthenticated: boolean;
  readonly sessionId?: string;
  readonly tokenType?: string;
}

/**
 * Create an unauthenticated context
 */
export function createAnonymousContext(): AuthContext {
  return {
    identity: null,
    isAuthenticated: false,
  };
}

/**
 * Create an authenticated context
 */
export function createAuthenticatedContext(
  identity: Identity,
  sessionId?: string,
  tokenType?: string
): AuthContext {
  return {
    identity,
    isAuthenticated: true,
    sessionId,
    tokenType,
  };
}

// ============================================================================
// DEFAULT PASSWORD POLICY
// ============================================================================

export const defaultPasswordPolicy: PasswordPolicy = {
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumbers: true,
  requireSpecialChars: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?',
  preventCommonPasswords: true,
  preventUserInfoInPassword: true,
  passwordHistoryCount: 5,
  maxAgeDays: 90,
};
