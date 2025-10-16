-- Complete fix for conversions table schema
-- Run this on your existing database

BEGIN;

-- Step 1: Rename old columns if they exist
DO $$
BEGIN
    -- Rename accesstrade_conversion_id to accesstrade_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'accesstrade_conversion_id') THEN
        ALTER TABLE conversions RENAME COLUMN accesstrade_conversion_id TO accesstrade_id;
        RAISE NOTICE '✓ Renamed accesstrade_conversion_id to accesstrade_id';
    END IF;

    -- Rename order_id to order_code
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'order_id') THEN
        ALTER TABLE conversions RENAME COLUMN order_id TO order_code;
        RAISE NOTICE '✓ Renamed order_id to order_code';
    END IF;

    -- Rename order_value to order_amount
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'order_value') THEN
        ALTER TABLE conversions RENAME COLUMN order_value TO order_amount;
        RAISE NOTICE '✓ Renamed order_value to order_amount';
    END IF;

    -- Rename commission_amount to commission
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'commission_amount') THEN
        ALTER TABLE conversions RENAME COLUMN commission_amount TO commission;
        RAISE NOTICE '✓ Renamed commission_amount to commission';
    END IF;

    -- Rename user_cashback to cashback_amount
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'user_cashback') THEN
        ALTER TABLE conversions RENAME COLUMN user_cashback TO cashback_amount;
        RAISE NOTICE '✓ Renamed user_cashback to cashback_amount';
    END IF;

    -- Rename ordered_at to order_time
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'ordered_at') THEN
        ALTER TABLE conversions RENAME COLUMN ordered_at TO order_time;
        RAISE NOTICE '✓ Renamed ordered_at to order_time';
    END IF;

    -- Rename approved_at to approval_time
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'approved_at') THEN
        ALTER TABLE conversions RENAME COLUMN approved_at TO approval_time;
        RAISE NOTICE '✓ Renamed approved_at to approval_time';
    END IF;
END $$;

-- Step 2: Add new columns if they don't exist
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS accesstrade_id VARCHAR(100);
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS merchant_name VARCHAR(255);
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS order_code VARCHAR(100);
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS order_amount DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS commission DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS cashback_amount DECIMAL(15, 2) DEFAULT 0.00;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS aff_sid VARCHAR(100);
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS order_time TIMESTAMP;
ALTER TABLE conversions ADD COLUMN IF NOT EXISTS approval_time TIMESTAMP;

-- Step 3: Make user_id nullable (allow conversions without user match)
ALTER TABLE conversions ALTER COLUMN user_id DROP NOT NULL;

-- Step 4: Drop old columns if they exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'platform_cut') THEN
        ALTER TABLE conversions DROP COLUMN platform_cut;
        RAISE NOTICE '✓ Dropped platform_cut column';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversions' AND column_name = 'rejected_at') THEN
        ALTER TABLE conversions DROP COLUMN rejected_at;
        RAISE NOTICE '✓ Dropped rejected_at column';
    END IF;
END $$;

-- Step 5: Create or recreate indexes
DROP INDEX IF EXISTS idx_conversions_accesstrade_conversion_id;
CREATE INDEX IF NOT EXISTS idx_conversions_accesstrade_id ON conversions(accesstrade_id);
CREATE INDEX IF NOT EXISTS idx_conversions_aff_sid ON conversions(aff_sid);
CREATE INDEX IF NOT EXISTS idx_conversions_order_time ON conversions(order_time DESC);

-- Step 6: Add unique constraint on accesstrade_id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'conversions_accesstrade_id_key'
    ) THEN
        ALTER TABLE conversions ADD CONSTRAINT conversions_accesstrade_id_key UNIQUE (accesstrade_id);
        RAISE NOTICE '✓ Added unique constraint on accesstrade_id';
    END IF;
END $$;

COMMIT;

-- Step 7: Verify the schema
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'conversions'
ORDER BY ordinal_position;

-- Display success message
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '✅ Schema migration completed successfully!';
    RAISE NOTICE '========================================';
END $$;
