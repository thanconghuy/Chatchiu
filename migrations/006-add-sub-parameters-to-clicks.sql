-- Migration: Add sub1, sub2, sub3 parameters to clicks table
-- Purpose: Additional tracking parameters less likely to be dropped in redirects
-- Date: 2025-01-14

-- Add sub1, sub2, sub3 columns to clicks table
ALTER TABLE clicks
ADD COLUMN IF NOT EXISTS sub1 VARCHAR(255),
ADD COLUMN IF NOT EXISTS sub2 VARCHAR(255),
ADD COLUMN IF NOT EXISTS sub3 VARCHAR(50);

-- Add comments to document purpose
COMMENT ON COLUMN clicks.sub1 IS 'User ID for tracking (backup of user_id)';
COMMENT ON COLUMN clicks.sub2 IS 'Click ID for tracking (backup of utm_content)';
COMMENT ON COLUMN clicks.sub3 IS 'Click type (button/link)';
COMMENT ON COLUMN clicks.sub4 IS 'Fixed identifier (oneatweb)';

-- Create index for faster lookups on sub parameters
CREATE INDEX IF NOT EXISTS idx_clicks_sub1 ON clicks(sub1);
CREATE INDEX IF NOT EXISTS idx_clicks_sub2 ON clicks(sub2);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 006: Successfully added sub1, sub2, sub3 columns to clicks table';
END $$;
