-- Migration 022: Add link_source column to clicks table
-- Purpose: Track whether link was generated via API or DIY deeplink
-- Author: Claude Code
-- Date: 2025-11-29

-- Add link_source column to clicks table
ALTER TABLE clicks
ADD COLUMN IF NOT EXISTS link_source VARCHAR(50) DEFAULT 'diy';

-- Add comment to column
COMMENT ON COLUMN clicks.link_source IS 'Source of link generation: api, diy, deeplink, tiktok-api, api-fallback, deeplink-fallback';

-- Create index for analytics queries
CREATE INDEX IF NOT EXISTS idx_clicks_link_source ON clicks(link_source);

-- Update existing rows to have default value
UPDATE clicks
SET link_source = 'diy'
WHERE link_source IS NULL;
