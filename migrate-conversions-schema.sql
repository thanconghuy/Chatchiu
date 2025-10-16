-- Migration script to update conversions table schema
-- This script renames and adds columns to match the new schema
-- Run this if you have an existing database

BEGIN;

-- Step 1: Rename accesstrade_conversion_id to accesstrade_id (if exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'conversions' AND column_name = 'accesstrade_conversion_id'
    ) THEN
        ALTER TABLE conversions RENAME COLUMN accesstrade_conversion_id TO accesstrade_id;
        RAISE NOTICE 'Renamed accesstrade_conversion_id to accesstrade_id';
    ELSE
        RAISE NOTICE 'Column accesstrade_conversion_id does not exist, skipping rename';
    END IF;
END $$;

-- Step 2: Add accesstrade_id if it doesn't exist
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS accesstrade_id VARCHAR(100);

-- Step 3: Add/rename other columns to match schema
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS order_code VARCHAR(100);
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS order_amount DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS commission DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS cashback_amount DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS order_time TIMESTAMP;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS approval_time TIMESTAMP;

-- Step 4: Migrate data from old columns to new columns (if they exist)
DO $$
BEGIN
    -- order_id -> order_code
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'order_id') THEN
        UPDATE conversions SET order_code = order_id WHERE order_code IS NULL;
    END IF;

    -- order_value -> order_amount
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'order_value') THEN
        UPDATE conversions SET order_amount = order_value WHERE order_amount IS NULL OR order_amount = 0;
    END IF;

    -- commission_amount -> commission
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'commission_amount') THEN
        UPDATE conversions SET commission = commission_amount WHERE commission IS NULL OR commission = 0;
    END IF;

    -- user_cashback -> cashback_amount
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'user_cashback') THEN
        UPDATE conversions SET cashback_amount = user_cashback WHERE cashback_amount IS NULL OR cashback_amount = 0;
    END IF;

    -- ordered_at -> order_time
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'ordered_at') THEN
        UPDATE conversions SET order_time = ordered_at WHERE order_time IS NULL;
    END IF;

    -- approved_at -> approval_time
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'approved_at') THEN
        UPDATE conversions SET approval_time = approved_at WHERE approval_time IS NULL;
    END IF;
END $$;

-- Step 5: Make user_id nullable (allow conversions without matching clicks)
ALTER TABLE conversions ALTER COLUMN user_id DROP NOT NULL;

-- Step 6: Create or recreate indexes
CREATE INDEX IF NOT EXISTS idx_conversions_accesstrade_id ON conversions(accesstrade_id);
CREATE INDEX IF NOT EXISTS idx_conversions_order_time ON conversions(order_time DESC);

-- Step 7: Add unique constraint if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'conversions_accesstrade_id_key'
    ) THEN
        ALTER TABLE conversions ADD CONSTRAINT conversions_accesstrade_id_key UNIQUE (accesstrade_id);
    END IF;
END $$;

COMMIT;

-- Verify the changes
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'conversions'
ORDER BY ordinal_position;

RAISE NOTICE 'Migration completed successfully!';
