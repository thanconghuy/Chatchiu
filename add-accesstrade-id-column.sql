-- Add accesstrade_id column to conversions table if it doesn't exist
-- Run this SQL script in your PostgreSQL database

-- Option 1: Simple approach (PostgreSQL 9.6+)
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS accesstrade_id VARCHAR(255);

-- Add unique constraint (skip if already exists)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'conversions_accesstrade_id_key'
    ) THEN
        ALTER TABLE conversions ADD CONSTRAINT conversions_accesstrade_id_key UNIQUE (accesstrade_id);
    END IF;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversions_accesstrade_id ON conversions(accesstrade_id);

-- Verify the changes
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'conversions' AND column_name = 'accesstrade_id';
