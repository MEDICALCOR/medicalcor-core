-- Migration: User Preferences Table
-- Description: Store user preferences including dark mode setting
-- Date: 2025-12-06

-- ============================================================================
-- USER PREFERENCES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Theme preferences
  theme VARCHAR(20) NOT NULL DEFAULT 'system' CHECK (theme IN ('light', 'dark', 'system')),

  -- Additional preferences (extensible via JSONB)
  preferences JSONB NOT NULL DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Unique constraint on user_id
  CONSTRAINT user_preferences_user_id_unique UNIQUE (user_id)
);

-- Index for user lookup
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON user_preferences(user_id);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_preferences_updated_at
  BEFORE UPDATE ON user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_preferences_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

-- Users can only read their own preferences
CREATE POLICY user_preferences_select_own ON user_preferences
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- Users can only update their own preferences
CREATE POLICY user_preferences_update_own ON user_preferences
  FOR UPDATE
  USING (user_id = current_setting('app.current_user_id', true)::UUID);

-- Users can insert their own preferences
CREATE POLICY user_preferences_insert_own ON user_preferences
  FOR INSERT
  WITH CHECK (user_id = current_setting('app.current_user_id', true)::UUID);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE user_preferences IS 'Stores user-specific preferences including theme settings';
COMMENT ON COLUMN user_preferences.theme IS 'User theme preference: light, dark, or system';
COMMENT ON COLUMN user_preferences.preferences IS 'Additional extensible preferences stored as JSONB';
