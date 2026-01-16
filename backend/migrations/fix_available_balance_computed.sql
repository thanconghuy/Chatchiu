-- Migration: Fix available_balance to be a computed column
-- Purpose: Ensure available_balance is always calculated correctly and cannot be out of sync
-- Date: 2026-01-16
-- Issue: available_balance is a stored column that gets out of sync with actual calculation

-- Step 1: Drop dependent views first
DROP VIEW IF EXISTS v_user_system_balance_summary CASCADE;
DROP VIEW IF EXISTS v_user_available_balances CASCADE;
DROP VIEW IF EXISTS v_user_balance_summary CASCADE;

-- Step 2: Drop triggers if any
DROP TRIGGER IF EXISTS trigger_log_balance_changes ON user_system_balance;

-- Step 3: Drop the existing available_balance column
ALTER TABLE user_system_balance
DROP COLUMN IF EXISTS available_balance;

-- Step 4: Add available_balance as a GENERATED ALWAYS column
-- This ensures it's always calculated as: total_earned - total_withdrawn - pending_reserved
ALTER TABLE user_system_balance
ADD COLUMN available_balance DECIMAL(15, 2)
GENERATED ALWAYS AS (total_earned - total_withdrawn - pending_reserved) STORED;

-- Step 5: Recreate views (simplified versions)
CREATE OR REPLACE VIEW v_user_balance_summary AS
SELECT
  usb.user_id,
  u.full_name,
  u.email,
  usb.total_earned,
  usb.total_withdrawn,
  usb.pending_reserved,
  usb.available_balance,
  usb.updated_at
FROM user_system_balance usb
LEFT JOIN users u ON usb.user_id = u.id;

CREATE OR REPLACE VIEW v_user_available_balances AS
SELECT
  user_id,
  available_balance
FROM user_system_balance
WHERE available_balance > 0;

-- Step 3: Add comment
COMMENT ON COLUMN user_system_balance.available_balance IS 'Auto-calculated: total_earned - total_withdrawn - pending_reserved';

-- Step 4: Verify the fix
-- The following query should show that available_balance is now a generated column
DO $$
DECLARE
  rec RECORD;
BEGIN
  -- Check if column is generated
  SELECT attname, attgenerated
  INTO rec
  FROM pg_attribute
  WHERE attrelid = 'user_system_balance'::regclass
    AND attname = 'available_balance'
    AND NOT attisdropped;

  IF rec.attgenerated = 's' THEN
    RAISE NOTICE '✅ available_balance is now a GENERATED STORED column';
  ELSE
    RAISE WARNING '⚠️  available_balance is NOT a generated column';
  END IF;
END $$;

-- Step 5: Show sample data to verify
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '📊 Sample data after migration:';
  RAISE NOTICE '====================================';

  FOR rec IN
    SELECT
      user_id,
      total_earned,
      total_withdrawn,
      pending_reserved,
      available_balance
    FROM user_system_balance
    LIMIT 5
  LOOP
    RAISE NOTICE 'User: % | Earned: % | Withdrawn: % | Pending: % | Available: %',
      rec.user_id,
      rec.total_earned,
      rec.total_withdrawn,
      rec.pending_reserved,
      rec.available_balance;
  END LOOP;

  RAISE NOTICE '====================================';
  RAISE NOTICE '';
END $$;
