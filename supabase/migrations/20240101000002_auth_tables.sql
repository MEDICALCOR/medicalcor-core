-- ============================================================================
-- MedicalCor Core - Authentication Database Schema
-- ============================================================================
-- This migration MUST run before other migrations that reference users table
-- Source: db/migrations/20241126000001_create_auth_tables.sql
-- ============================================================================

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
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_clinic_id ON users (clinic_id) WHERE clinic_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NOT NULL;

-- =============================================================================
-- SESSIONS TABLE (for session management and revocation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  device_info JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_reason VARCHAR(100),
  last_activity_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions (expires_at);

-- =============================================================================
-- AUTH EVENTS TABLE (audit trail)
-- =============================================================================
CREATE TABLE IF NOT EXISTS auth_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  email VARCHAR(255),
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN (
    'login_success', 'login_failure', 'logout', 'session_revoked',
    'password_changed', 'password_reset_requested', 'password_reset_completed',
    'account_locked', 'account_unlocked', 'email_verified',
    'user_created', 'user_updated', 'user_deleted',
    'permission_denied', 'suspicious_activity'
  )),
  result VARCHAR(20) NOT NULL CHECK (result IN ('success', 'failure', 'blocked')),
  ip_address INET,
  user_agent TEXT,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_events_user_id ON auth_events (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_events_event_type ON auth_events (event_type);
CREATE INDEX IF NOT EXISTS idx_auth_events_created_at ON auth_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_events_ip ON auth_events (ip_address);

-- =============================================================================
-- LOGIN ATTEMPTS TABLE (brute force tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) NOT NULL,
  ip_address INET NOT NULL,
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts (email, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts (ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_ip ON login_attempts (email, ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_failed ON login_attempts (email, created_at DESC) WHERE success = FALSE;

-- =============================================================================
-- PASSWORD RESET TOKENS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens (user_id);

-- =============================================================================
-- REFRESH TOKENS TABLE (for token rotation)
-- =============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  family_id UUID NOT NULL,
  generation INT NOT NULL DEFAULT 1,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens (family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);

-- =============================================================================
-- TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- CLEANUP FUNCTION
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired_auth_data()
RETURNS void AS $$
BEGIN
  DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
  DELETE FROM login_attempts WHERE created_at < CURRENT_TIMESTAMP - INTERVAL '30 days';
  DELETE FROM password_reset_tokens WHERE used_at IS NOT NULL OR expires_at < CURRENT_TIMESTAMP;
  DELETE FROM refresh_tokens WHERE expires_at < CURRENT_TIMESTAMP - INTERVAL '7 days';
END;
$$ LANGUAGE plpgsql;
