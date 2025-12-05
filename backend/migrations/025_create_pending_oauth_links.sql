-- Migration 025: Create pending_oauth_links table
-- Purpose: Manage OAuth account linking confirmations
-- Author: Claude Code
-- Date: 2025-11-29

CREATE TABLE IF NOT EXISTS pending_oauth_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  profile_data JSONB,
  token VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pending_oauth_token ON pending_oauth_links(token);
CREATE INDEX IF NOT EXISTS idx_pending_oauth_expires ON pending_oauth_links(expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_oauth_user ON pending_oauth_links(user_id);

-- Auto cleanup expired links (runs daily)
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_links()
RETURNS void AS $$
BEGIN
  DELETE FROM pending_oauth_links WHERE expires_at <= NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE pending_oauth_links IS 'Temporary OAuth linking requests awaiting user confirmation';
COMMENT ON COLUMN pending_oauth_links.token IS 'Secure token for confirmation link';
COMMENT ON COLUMN pending_oauth_links.expires_at IS 'Link expires after 15 minutes';
