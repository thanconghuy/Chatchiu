-- Migration: Fix balance sync trigger - remove created_at column reference
-- Date: 2026-01-31
-- Purpose: Fix error "column 'created_at' of relation 'user_system_balance' does not exist"

-- ============================================
-- FIX: Update trigger function to not use created_at
-- ============================================
CREATE OR REPLACE FUNCTION sync_user_balance_on_conversion()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_old_amount DECIMAL(15, 2);
  v_new_amount DECIMAL(15, 2);
BEGIN
  -- Determine user_id based on operation
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
    v_old_amount := COALESCE(OLD.cashback_amount, 0);
    v_new_amount := 0;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := NEW.user_id;
    v_old_amount := COALESCE(OLD.cashback_amount, 0);
    v_new_amount := COALESCE(NEW.cashback_amount, 0);
  ELSE -- INSERT
    v_user_id := NEW.user_id;
    v_old_amount := 0;
    v_new_amount := COALESCE(NEW.cashback_amount, 0);
  END IF;

  -- Ensure user_system_balance record exists (without created_at - column doesn't exist)
  INSERT INTO user_system_balance (user_id, total_earned, total_withdrawn, pending_reserved, updated_at)
  VALUES (v_user_id, 0, 0, 0, NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- Update total_earned
  UPDATE user_system_balance
  SET
    total_earned = total_earned - v_old_amount + v_new_amount,
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

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ TRIGGER FUNCTION FIXED!';
  RAISE NOTICE 'Removed created_at column reference from INSERT statement';
  RAISE NOTICE '';
END $$;
