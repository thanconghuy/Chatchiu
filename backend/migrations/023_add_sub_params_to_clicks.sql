-- Migration 023: Add sub1, sub2, sub3 tracking parameters to clicks table
-- Purpose: Complete tracking parameters for conversion matching
-- Author: Claude Code
-- Date: 2025-11-29

-- Add sub1, sub2, sub3 columns to clicks table
-- sub1: User ID (backup tracking)
-- sub2: Click ID (primary tracking for conversion matching)
-- sub3: Click type (button/link)

ALTER TABLE clicks
ADD COLUMN IF NOT EXISTS sub1 VARCHAR(100),
ADD COLUMN IF NOT EXISTS sub2 VARCHAR(100),
ADD COLUMN IF NOT EXISTS sub3 VARCHAR(100);

-- Add comments to columns
COMMENT ON COLUMN clicks.sub1 IS 'Sub parameter 1: User ID for backup tracking';
COMMENT ON COLUMN clicks.sub2 IS 'Sub parameter 2: Click ID (UUID) - PRIMARY for conversion matching';
COMMENT ON COLUMN clicks.sub3 IS 'Sub parameter 3: Click type (button/link)';

-- Create indexes for conversion matching (sub2 is the most important)
CREATE INDEX IF NOT EXISTS idx_clicks_sub2 ON clicks(sub2);
CREATE INDEX IF NOT EXISTS idx_clicks_sub1 ON clicks(sub1);

-- Note: sub2 contains click_id which is used to match conversions
-- When AccessTrade sends conversion data, we match using sub2 parameter
