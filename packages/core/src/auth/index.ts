/**
 * Authentication Module
 * Complete authentication, authorization, and session management for MedicalCor Cortex
 *
 * @module @medicalcor/core/auth
 */

// Types
export type {
  UserRole,
  UserStatus,
  AuthEventType,
  AuthEventResult,
  User,
  SafeUser,
  CreateUserData,
  UpdateUserData,
  Session,
  CreateSessionData,
  AuthEvent,
  CreateAuthEventData,
  LoginAttempt,
  PasswordResetToken,
  RefreshToken,
  RateLimitResult,
  AuthContext,
  LoginResult,
  PasswordValidationResult,
} from './types.js';

// Repositories
export { UserRepository, toSafeUser } from './user-repository.js';
export { SessionRepository } from './session-repository.js';
export { AuthEventRepository } from './auth-event-repository.js';
export { LoginAttemptRepository, RATE_LIMIT_CONFIG } from './login-attempt-repository.js';

// Services
export { AuthService, PASSWORD_POLICY, SESSION_CONFIG } from './auth-service.js';
export { PasswordResetService, PASSWORD_RESET_CONFIG } from './password-reset-service.js';
export {
  MfaService,
  MFA_CONFIG,
  type MfaMethod,
  type MfaStatus,
  type MfaSetupResult,
  type MfaVerifyResult,
} from './mfa-service.js';

// Re-export database client for convenience
export { createDatabaseClient } from '../database.js';
