-- Migration 024: Add OAuth fields to users table
-- Purpose: Support Google OAuth login and future OAuth providers
-- Author: Claude Code
-- Date: 2025-11-29

-- Add Google OAuth field
ALTER TABLE users
ADD COLUMN IF NOT EXISTS google_id VARCHAR(255) UNIQUE;

-- Add generic OAuth fields for future providers (Facebook, Apple, etc.)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS oauth_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS profile_picture TEXT,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Add comments
COMMENT ON COLUMN users.google_id IS 'Google OAuth user ID';
COMMENT ON COLUMN users.oauth_provider IS 'OAuth provider name (google, facebook, apple, etc.)';
COMMENT ON COLUMN users.oauth_id IS 'Generic OAuth user ID for non-Google providers';
COMMENT ON COLUMN users.profile_picture IS 'User profile picture URL from OAuth provider';
COMMENT ON COLUMN users.email_verified IS 'Whether email has been verified (auto true for OAuth)';

-- Create indexes for OAuth lookups
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id) WHERE google_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- Make password_hash nullable for OAuth users (they don't have password)
ALTER TABLE users
ALTER COLUMN password_hash DROP NOT NULL;

-- Update existing OAuth users (if any) to have email_verified = true
UPDATE users
SET email_verified = true
WHERE google_id IS NOT NULL OR oauth_provider IS NOT NULL;

-- Add constraint: Either password or OAuth must be present
ALTER TABLE users
ADD CONSTRAINT users_auth_method_check
CHECK (
  password_hash IS NOT NULL OR
  google_id IS NOT NULL OR
  oauth_id IS NOT NULL
);

COMMENT ON CONSTRAINT users_auth_method_check ON users IS 'Ensure user has at least one authentication method';
