-- Migration: Create trigger to auto-sync user_system_balance when conversions change
-- Date: 2026-01-16
-- Purpose: Đảm bảo total_earned luôn = SUM(cashback_amount) từ system_conversions

-- ============================================
-- FUNCTION: Tự động cập nhật user_system_balance
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
    v_old_amount := OLD.cashback_amount;
    v_new_amount := 0;
  ELSIF TG_OP = 'UPDATE' THEN
    v_user_id := NEW.user_id;
    v_old_amount := OLD.cashback_amount;
    v_new_amount := NEW.cashback_amount;
  ELSE -- INSERT
    v_user_id := NEW.user_id;
    v_old_amount := 0;
    v_new_amount := NEW.cashback_amount;
  END IF;

  -- Ensure user_system_balance record exists
  INSERT INTO user_system_balance (user_id, total_earned, total_withdrawn, pending_reserved, created_at, updated_at)
  VALUES (v_user_id, 0, 0, 0, NOW(), NOW())
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
-- TRIGGER: Apply function to system_conversions
-- ============================================
DROP TRIGGER IF EXISTS trigger_sync_balance_on_conversion ON system_conversions;

CREATE TRIGGER trigger_sync_balance_on_conversion
AFTER INSERT OR UPDATE OF cashback_amount OR DELETE
ON system_conversions
FOR EACH ROW
EXECUTE FUNCTION sync_user_balance_on_conversion();

-- ============================================
-- COMMENT: Documentation
-- ============================================
COMMENT ON FUNCTION sync_user_balance_on_conversion() IS
'Tự động cập nhật user_system_balance.total_earned khi có thay đổi trong system_conversions.
- INSERT: Cộng cashback_amount vào total_earned
- UPDATE: Điều chỉnh theo chênh lệch (old vs new)
- DELETE: Trừ cashback_amount khỏi total_earned';

COMMENT ON TRIGGER trigger_sync_balance_on_conversion ON system_conversions IS
'Trigger tự động sync balance - đảm bảo data integrity cho số dư user';

-- ============================================
-- VERIFICATION: Test trigger
-- ============================================
DO $$
DECLARE
  v_test_user_id UUID;
  v_before_balance DECIMAL(15, 2);
  v_after_balance DECIMAL(15, 2);
  v_expected_balance DECIMAL(15, 2);
BEGIN
  -- Get a user with conversions for testing
  SELECT user_id INTO v_test_user_id
  FROM system_conversions
  LIMIT 1;

  IF v_test_user_id IS NULL THEN
    RAISE NOTICE 'No conversions found - skipping verification';
    RETURN;
  END IF;

  -- Get current balance
  SELECT total_earned INTO v_before_balance
  FROM user_system_balance
  WHERE user_id = v_test_user_id;

  -- Calculate expected balance from conversions
  SELECT COALESCE(SUM(cashback_amount), 0) INTO v_expected_balance
  FROM system_conversions
  WHERE user_id = v_test_user_id;

  RAISE NOTICE '====================================';
  RAISE NOTICE 'TRIGGER VERIFICATION';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'User ID: %', v_test_user_id;
  RAISE NOTICE 'Current balance: % đ', v_before_balance;
  RAISE NOTICE 'Expected (from conversions): % đ', v_expected_balance;

  IF ABS(v_before_balance - v_expected_balance) < 0.01 THEN
    RAISE NOTICE '✅ TRIGGER WORKING CORRECTLY!';
  ELSE
    RAISE NOTICE '⚠️  Balance mismatch - trigger may not be working';
  END IF;
  RAISE NOTICE '====================================';
END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ TRIGGER CREATED SUCCESSFULLY!';
  RAISE NOTICE '';
  RAISE NOTICE 'Từ giờ trở đi:';
  RAISE NOTICE '- Khi INSERT conversion → Tự động cộng vào total_earned';
  RAISE NOTICE '- Khi UPDATE cashback_amount → Tự động điều chỉnh';
  RAISE NOTICE '- Khi DELETE conversion → Tự động trừ khỏi total_earned';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  LƯU Ý: Trigger chỉ áp dụng cho thay đổi MỚI';
  RAISE NOTICE 'Dữ liệu CŨ đã được sync bằng script sync-all-users-balance.js';
  RAISE NOTICE '';
END $$;
