-- Migration: Add timestamp tracking columns to clicks table
-- Purpose: Track link lifecycle for retry mechanism and analytics
-- Date: 2025-01-14

-- Add timestamp columns to clicks table
ALTER TABLE clicks
ADD COLUMN IF NOT EXISTS link_clicked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS link_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP;

-- Update link_clicked_at for existing records to use clicked_at value
UPDATE clicks
SET link_clicked_at = clicked_at
WHERE link_clicked_at IS NULL;

-- Set expiration to 30 days from click for existing records
UPDATE clicks
SET link_expires_at = clicked_at + INTERVAL '30 days'
WHERE link_expires_at IS NULL;

-- Add comments to document purpose
COMMENT ON COLUMN clicks.link_clicked_at IS 'Timestamp when user clicked the affiliate link (for tracking)';
COMMENT ON COLUMN clicks.link_expires_at IS 'Timestamp when link expires for conversion attribution (30 days default)';
COMMENT ON COLUMN clicks.last_checked_at IS 'Last time this click was checked for conversion matching';

-- Create index for faster queries on timestamp columns
CREATE INDEX IF NOT EXISTS idx_clicks_link_expires_at ON clicks(link_expires_at);
CREATE INDEX IF NOT EXISTS idx_clicks_last_checked_at ON clicks(last_checked_at);

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Migration 007: Successfully added timestamp tracking columns to clicks table';
END $$;
