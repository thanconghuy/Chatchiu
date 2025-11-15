-- Migration: Add link_source column to clicks table
-- This tracks whether the link was generated using AccessTrade API or DIY method

-- Add link_source column
ALTER TABLE clicks
ADD COLUMN IF NOT EXISTS link_source VARCHAR(20) DEFAULT 'diy';

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_clicks_link_source ON clicks(link_source);

-- Add comment
COMMENT ON COLUMN clicks.link_source IS 'Link generation method: api, diy, or diy-fallback';

-- Update existing records based on affiliate_url pattern (best effort)
-- This is a one-time migration for historical data
UPDATE clicks
SET link_source = CASE
  WHEN affiliate_url LIKE '%click.accesstrade.vn%' THEN 'api'
  ELSE 'diy'
END
WHERE link_source IS NULL OR link_source = 'diy';
