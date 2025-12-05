-- Migration 026: Add password reset token columns to users table
-- Purpose: Support password reset functionality
-- Author: Claude Code
-- Date: 2025-12-05

-- Add reset token columns
ALTER TABLE users
ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255),
ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMPTZ;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token);

-- Add comments
COMMENT ON COLUMN users.reset_token IS 'Password reset token (64 character hex string)';
COMMENT ON COLUMN users.reset_token_expiry IS 'Reset token expiration time (1 hour from creation)';

-- Auto cleanup function for expired tokens (optional, runs on demand)
CREATE OR REPLACE FUNCTION cleanup_expired_reset_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  UPDATE users
  SET reset_token = NULL, reset_token_expiry = NULL
  WHERE reset_token IS NOT NULL AND reset_token_expiry < NOW();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_reset_tokens() IS 'Clean up expired reset tokens. Returns count of cleared tokens.';
