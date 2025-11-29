-- migrate:up
-- =============================================================================
-- Authentication Database Schema for MedicalCor Cortex
-- This migration MUST run before other migrations that reference users table
-- Created: 2024-11-26
-- =============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- USERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(60) NOT NULL,  -- bcrypt hash (60 chars)
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'doctor', 'receptionist', 'staff')),
  clinic_id UUID,  -- FK added in later migration after clinics table exists

  -- Account status
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'pending_verification')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  email_verified_at TIMESTAMPTZ,

  -- Brute force protection
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,

  -- Password management
  password_changed_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,

  -- Session tracking
  last_login_at TIMESTAMPTZ,
  last_login_ip INET,

  -- Soft delete for GDPR compliance
  deleted_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for email lookups (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status) WHERE deleted_at IS NULL;

-- Index for clinic filtering
CREATE INDEX IF NOT EXISTS idx_users_clinic_id ON users (clinic_id) WHERE clinic_id IS NOT NULL AND deleted_at IS NULL;

-- Index for soft delete
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- SESSIONS TABLE (for session management and revocation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token identification (hash of JWT jti)
  token_hash VARCHAR(64) NOT NULL,

  -- Session metadata
  ip_address INET,
  user_agent TEXT,
  device_info JSONB,

  -- Session lifecycle
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(100),

  -- Activity tracking
  last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for user's active sessions
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);

-- Index for token lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);

-- Index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- =============================================================================
-- AUTH EVENTS TABLE (audit trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- User reference (nullable for failed login attempts with unknown email)
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255),  -- Store email for failed attempts

  -- Event details
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'login_success',
    'login_failure',
    'logout',
    'session_revoked',
    'password_changed',
    'password_reset_requested',
    'password_reset_completed',
    'account_locked',
    'account_unlocked',
    'email_verified',
    'user_created',
    'user_updated',
    'user_deleted',
    'permission_denied',
    'suspicious_activity'
  )),

  -- Result
  result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failure', 'blocked')),

  -- Context
  ip_address INET,
  user_agent TEXT,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,

  -- Additional details
  details JSONB,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for user event history
CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON auth_events (user_id);

-- Index for event type filtering
CREATE INDEX IF NOT EXISTS idx_auth_events_event_type ON auth_events (event_type);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON auth_events (created_at DESC);

-- Index for IP-based analysis
CREATE INDEX IF NOT EXISTS idx_auth_events_ip ON auth_events (ip_address);

-- =============================================================================
-- LOGIN ATTEMPTS TABLE (brute force tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Attempt identification
  email VARCHAR(255) NOT NULL,
  ip_address INET NOT NULL,

  -- Result
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(100),

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for rate limiting by email
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email, created_at DESC);

-- Index for rate limiting by IP
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip_address, created_at DESC);

-- Combined index for email + IP analysis
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_ip ON login_attempts (email, ip_address, created_at DESC);

-- Partial index for failed attempts only
CREATE INDEX IF NOT EXISTS idx_login_attempts_failed ON login_attempts (email, created_at DESC) WHERE success = FALSE;

-- =============================================================================
-- PASSWORD RESET TOKENS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Token (hashed for security)
  token_hash VARCHAR(64) NOT NULL,

  -- Lifecycle
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for token lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);

-- Index for user's tokens
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);

-- =============================================================================
-- REFRESH TOKENS TABLE (for token rotation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,

  -- Token (hashed for security)
  token_hash VARCHAR(64) NOT NULL,

  -- Token chain for rotation detection
  family_id UUID NOT NULL,  -- All tokens in a rotation chain share this
  generation INT NOT NULL DEFAULT 1,

  -- Lifecycle
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for token lookup
CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);

-- Index for family lookup (rotation detection)
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id);

-- Index for user's tokens
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);

-- =============================================================================
-- TRIGGER: Update updated_at on users table
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- CLEANUP FUNCTION: Remove expired data
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
RETURNS void AS $$
BEGIN
  -- Remove expired sessions
  DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';

  -- Remove old login attempts (keep 30 days)
  DELETE FROM login_attempts WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';

  -- Remove used/expired password reset tokens
  DELETE FROM password_reset_tokens
  WHERE used_at IS NOT NULL OR expires_at < CURRENT_TIMESTAMP;

  -- Remove expired refresh tokens
  DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;

-- migrate:down
DROP FUNCTION IF EXISTS cleanup_expired_auth_data();
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP TABLE IF EXISTS refresh_tokens;
DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS login_attempts;
DROP TABLE IF EXISTS auth_events;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
