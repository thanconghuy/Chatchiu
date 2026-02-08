-- Migration 066: Fix balance sync trigger - Restore reconciled check
-- Date: 2026-02-02
-- Issue: Migration 065 removed reconciled check, causing total_earned to include non-reconciled conversions
-- Fix: Restore logic from migration 063 to only sync RECONCILED conversions

BEGIN;

-- ============================================
-- FIX: Update trigger function to only sync RECONCILED conversions
-- ============================================
CREATE OR REPLACE FUNCTION sync_user_balance_on_conversion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_old_amount DECIMAL(15, 2);
  v_new_amount DECIMAL(15, 2);
  v_old_reconciled BOOLEAN;
  v_new_reconciled BOOLEAN;
BEGIN
  -- Determine user_id and amounts based on operation
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_old_amount := COALESCE(OLD.cashback_amount, 0);
    v_new_amount := 0;
    -- Check if old record was reconciled
    v_old_reconciled := (OLD.status = 'approved' AND OLD.system_reconciliation_status = 'reconciled');
    v_new_reconciled := FALSE;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := NEW.user_id;
    v_old_amount := COALESCE(OLD.cashback_amount, 0);
    v_new_amount := COALESCE(NEW.cashback_amount, 0);
    -- Check reconciled status for both old and new
    v_old_reconciled := (OLD.status = 'approved' AND OLD.system_reconciliation_status = 'reconciled');
    v_new_reconciled := (NEW.status = 'approved' AND NEW.system_reconciliation_status = 'reconciled');
  ELSE -- INSERT
    v_user_id := NEW.user_id;
    v_old_amount := 0;
    v_new_amount := COALESCE(NEW.cashback_amount, 0);
    v_old_reconciled := FALSE;
    -- Check if new record is reconciled (usually FALSE on insert)
    v_new_reconciled := (NEW.status = 'approved' AND NEW.system_reconciliation_status = 'reconciled');
  END IF;

  -- Ensure user_system_balance record exists
  INSERT INTO user_system_balance (user_id, total_earned, total_withdrawn, pending_reserved, updated_at)
  VALUES (v_user_id, 0, 0, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- CRITICAL: Only update total_earned for RECONCILED conversions
  -- Logic:
  -- - If old was reconciled: subtract old_amount from total_earned
  -- - If new is reconciled: add new_amount to total_earned
  -- - If neither reconciled: no change to total_earned
  UPDATE user_system_balance
  SET
    total_earned = total_earned
      - CASE WHEN v_old_reconciled THEN v_old_amount ELSE 0 END
      + CASE WHEN v_new_reconciled THEN v_new_amount ELSE 0 END,
    updated_at = NOW()
  WHERE user_id = v_user_id;

  -- Return appropriate value
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION sync_user_balance_on_conversion() IS
'Tự động cập nhật user_system_balance.total_earned CHỈ từ conversions ĐÃ ĐỐI SOÁT (reconciled).
- INSERT reconciled: Cộng cashback_amount vào total_earned
- UPDATE to/from reconciled: Điều chỉnh theo trạng thái đối soát
- DELETE reconciled: Trừ cashback_amount khỏi total_earned
- NOT reconciled: KHÔNG ảnh hưởng đến total_earned
Fixed in migration 066.';

-- ============================================
-- Re-sync ALL existing user balances to correct values
-- ============================================
DO $$
DECLARE
  v_affected_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== RE-SYNCING ALL USER BALANCES ===';
  RAISE NOTICE '';

  -- Update all user balances to correct values (only from RECONCILED conversions)
  WITH correct_balances AS (
    SELECT
      user_id,
      COALESCE(SUM(cashback_amount), 0) as correct_total_earned
    FROM system_conversions
    WHERE status = 'approved'
      AND system_reconciliation_status = 'reconciled'
    GROUP BY user_id
  )
  UPDATE user_system_balance usb
  SET
    total_earned = COALESCE(cb.correct_total_earned, 0),
    updated_at = NOW()
  FROM correct_balances cb
  WHERE usb.user_id = cb.user_id
    AND ABS(usb.total_earned - cb.correct_total_earned) > 0.01;

  GET DIAGNOSTICS v_affected_count = ROW_COUNT;

  RAISE NOTICE '✅ Updated % user balances', v_affected_count;
  RAISE NOTICE '';
END $$;

-- ============================================
-- Also reset balances for users with NO reconciled conversions
-- ============================================
DO $$
DECLARE
  v_reset_count INTEGER;
BEGIN
  UPDATE user_system_balance usb
  SET
    total_earned = 0,
    updated_at = NOW()
  WHERE usb.total_earned > 0
    AND NOT EXISTS (
      SELECT 1 FROM system_conversions sc
      WHERE sc.user_id = usb.user_id
        AND sc.status = 'approved'
        AND sc.system_reconciliation_status = 'reconciled'
    );

  GET DIAGNOSTICS v_reset_count = ROW_COUNT;

  IF v_reset_count > 0 THEN
    RAISE NOTICE '⚠️  Reset % user balances (no reconciled conversions)', v_reset_count;
  END IF;
END $$;

-- ============================================
-- Verification
-- ============================================
DO $$
DECLARE
  v_total_users INTEGER;
  v_correct_users INTEGER;
  v_wrong_users INTEGER;
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICATION ===';
  RAISE NOTICE '';

  -- Count users with correct vs wrong balances
  SELECT
    COUNT(*) as total,
    COUNT(*) FILTER (
      WHERE ABS(
        usb.total_earned -
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0)
      ) < 0.01
    ) as correct,
    COUNT(*) FILTER (
      WHERE ABS(
        usb.total_earned -
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0)
      ) >= 0.01
    ) as wrong
  INTO v_total_users, v_correct_users, v_wrong_users
  FROM user_system_balance usb
  WHERE usb.total_earned > 0 OR EXISTS (
    SELECT 1 FROM system_conversions WHERE user_id = usb.user_id
  );

  RAISE NOTICE 'Total users checked: %', v_total_users;
  RAISE NOTICE 'Correct balances: % ✅', v_correct_users;
  RAISE NOTICE 'Wrong balances: % %', v_wrong_users, CASE WHEN v_wrong_users = 0 THEN '✅' ELSE '❌' END;
  RAISE NOTICE '';

  IF v_wrong_users > 0 THEN
    RAISE NOTICE '⚠️  Sample of wrong balances:';
    FOR rec IN
      SELECT
        u.email,
        usb.total_earned as db_balance,
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0) as correct_balance
      FROM user_system_balance usb
      JOIN users u ON u.id = usb.user_id
      WHERE ABS(
        usb.total_earned -
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0)
      ) >= 0.01
      LIMIT 5
    LOOP
      RAISE NOTICE '  % | DB: % | Correct: % | Diff: %',
        rec.email,
        rec.db_balance,
        rec.correct_balance,
        rec.db_balance - rec.correct_balance;
    END LOOP;
  END IF;
END $$;

-- ============================================
-- Success message
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ MIGRATION 066 COMPLETED!';
  RAISE NOTICE '';
  RAISE NOTICE 'CHANGES:';
  RAISE NOTICE '1. Trigger now correctly syncs ONLY reconciled conversions';
  RAISE NOTICE '2. All existing balances re-synced';
  RAISE NOTICE '3. available_balance now correctly shows only reconciled cashback';
  RAISE NOTICE '';
  RAISE NOTICE 'FORMULA:';
  RAISE NOTICE '  total_earned = SUM(cashback) WHERE reconciled';
  RAISE NOTICE '  available_balance = total_earned - total_withdrawn - pending_reserved';
  RAISE NOTICE '';
END $$;

COMMIT;
