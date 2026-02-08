-- =====================================================
-- Clear Test User Data (testuser@test.com)
-- Chạy script này trong database để xóa dữ liệu test
-- =====================================================

-- Bước 1: Xem thông tin user trước khi xóa
SELECT
  u.id as user_id,
  u.email,
  u.full_name,
  (SELECT COUNT(*) FROM system_conversions WHERE user_id = u.id) as conversions_count,
  (SELECT COALESCE(SUM(cashback_amount), 0) FROM system_conversions WHERE user_id = u.id) as total_cashback,
  (SELECT COUNT(*) FROM system_reconciliation_items WHERE user_id = u.id) as recon_items_count,
  (SELECT COUNT(*) FROM reconciliation_waiting_list WHERE user_id = u.id) as waiting_list_count,
  (SELECT COUNT(*) FROM payment_requests WHERE user_id = u.id) as payment_requests_count
FROM users u
WHERE u.email = 'testuser@test.com';

-- =====================================================
-- CHẠY CÁC LỆNH BÊN DƯỚI TRONG TRANSACTION
-- =====================================================

BEGIN;

-- Lấy user_id vào biến (PostgreSQL)
DO $$
DECLARE
  v_user_id UUID;
  v_deleted_count INT;
BEGIN
  -- Get user ID
  SELECT id INTO v_user_id FROM users WHERE email = 'testuser@test.com';

  IF v_user_id IS NULL THEN
    RAISE NOTICE 'User testuser@test.com không tồn tại';
    RETURN;
  END IF;

  RAISE NOTICE 'Found user ID: %', v_user_id;

  -- 1. Xóa payment mappings
  DELETE FROM payment_reconciliation_mapping
  WHERE payment_request_id IN (
    SELECT id FROM payment_requests WHERE user_id = v_user_id
  );
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % payment mappings', v_deleted_count;

  -- 2. Xóa payment requests
  DELETE FROM payment_requests WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % payment requests', v_deleted_count;

  -- 3. Xóa waiting list
  DELETE FROM reconciliation_waiting_list WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % waiting list entries', v_deleted_count;

  -- 4. Xóa reconciliation items
  DELETE FROM system_reconciliation_items WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % reconciliation items', v_deleted_count;

  -- 5. Xóa conversions
  DELETE FROM system_conversions WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % conversions', v_deleted_count;

  -- 6. Reset balance
  UPDATE user_system_balance
  SET
    total_earned = 0,
    total_withdrawn = 0,
    pending_reserved = 0,
    debt_balance = 0,
    last_reconciliation_date = NULL,
    updated_at = CURRENT_TIMESTAMP
  WHERE user_id = v_user_id;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Reset % user balance records', v_deleted_count;

  -- 7. Cleanup empty reconciliations (optional - xóa kỳ đối soát không còn items)
  DELETE FROM system_reconciliations sr
  WHERE NOT EXISTS (
    SELECT 1 FROM system_reconciliation_items sri
    WHERE sri.system_reconciliation_id = sr.id
  );
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % empty reconciliations', v_deleted_count;

  RAISE NOTICE '✅ Completed clearing data for user %', v_user_id;
END $$;

COMMIT;

-- =====================================================
-- Xác nhận kết quả sau khi xóa
-- =====================================================

SELECT
  u.id as user_id,
  u.email,
  (SELECT COUNT(*) FROM system_conversions WHERE user_id = u.id) as conversions_count,
  (SELECT COUNT(*) FROM system_reconciliation_items WHERE user_id = u.id) as recon_items_count,
  (SELECT COUNT(*) FROM reconciliation_waiting_list WHERE user_id = u.id) as waiting_list_count,
  (SELECT COUNT(*) FROM payment_requests WHERE user_id = u.id) as payment_requests_count,
  usb.total_earned,
  usb.total_withdrawn,
  usb.pending_reserved
FROM users u
LEFT JOIN user_system_balance usb ON usb.user_id = u.id
WHERE u.email = 'testuser@test.com';
