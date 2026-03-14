-- Migration 067: Resync toàn bộ user_system_balance
-- Date: 2026-03-14
-- Issue: total_earned, total_withdrawn, pending_reserved không đồng bộ với data thực tế
-- Root cause:
--   1. cashbackStats.js và checkEligibility() dùng công thức sai (reconciled_unpaid - total_withdrawn)
--   2. Một số user có available_balance = 0 dù thực tế còn số dư
-- Fix: Resync lại toàn bộ 3 cột từ nguồn dữ liệu chính xác

BEGIN;

-- ============================================
-- BƯỚC 1: Resync total_earned
-- Nguồn: system_conversions WHERE approved AND reconciled
-- ============================================
DO $$
DECLARE v_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== BƯỚC 1: RESYNC total_earned ===';

  WITH correct AS (
    SELECT user_id, COALESCE(SUM(cashback_amount), 0) as correct_earned
    FROM system_conversions
    WHERE status = 'approved' AND system_reconciliation_status = 'reconciled'
    GROUP BY user_id
  )
  UPDATE user_system_balance usb
  SET total_earned = c.correct_earned, updated_at = NOW()
  FROM correct c
  WHERE usb.user_id = c.user_id
    AND ABS(usb.total_earned - c.correct_earned) >= 1;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Đã cập nhật % user (total_earned)', v_count;

  -- Reset về 0 cho user không có conversion nào reconciled
  UPDATE user_system_balance usb
  SET total_earned = 0, updated_at = NOW()
  WHERE total_earned != 0
    AND NOT EXISTS (
      SELECT 1 FROM system_conversions sc
      WHERE sc.user_id = usb.user_id
        AND sc.status = 'approved'
        AND sc.system_reconciliation_status = 'reconciled'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE 'Reset % user về 0 (không có reconciled conversion)', v_count;
  END IF;
END $$;

-- ============================================
-- BƯỚC 2: Resync total_withdrawn
-- Nguồn: payment_requests WHERE status = 'paid'
-- ============================================
DO $$
DECLARE v_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== BƯỚC 2: RESYNC total_withdrawn ===';

  WITH correct AS (
    SELECT user_id, COALESCE(SUM(requested_amount), 0) as correct_withdrawn
    FROM payment_requests
    WHERE status = 'paid'
    GROUP BY user_id
  )
  UPDATE user_system_balance usb
  SET total_withdrawn = c.correct_withdrawn, updated_at = NOW()
  FROM correct c
  WHERE usb.user_id = c.user_id
    AND ABS(usb.total_withdrawn - c.correct_withdrawn) >= 1;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Đã cập nhật % user (total_withdrawn)', v_count;

  -- Reset về 0 cho user không có payment nào paid
  UPDATE user_system_balance usb
  SET total_withdrawn = 0, updated_at = NOW()
  WHERE total_withdrawn != 0
    AND NOT EXISTS (
      SELECT 1 FROM payment_requests pr
      WHERE pr.user_id = usb.user_id AND pr.status = 'paid'
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE 'Reset % user về 0 (không có payment paid)', v_count;
  END IF;
END $$;

-- ============================================
-- BƯỚC 3: Resync pending_reserved
-- Nguồn: payment_requests WHERE status = 'confirmed' AND cancelled_at IS NULL
-- NOTE: CHỈ 'confirmed' mới reserve balance, 'pending' chưa reserve
-- ============================================
DO $$
DECLARE v_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== BƯỚC 3: RESYNC pending_reserved ===';

  WITH correct AS (
    SELECT user_id, COALESCE(SUM(requested_amount), 0) as correct_reserved
    FROM payment_requests
    WHERE status = 'confirmed' AND cancelled_at IS NULL
    GROUP BY user_id
  )
  UPDATE user_system_balance usb
  SET pending_reserved = c.correct_reserved, updated_at = NOW()
  FROM correct c
  WHERE usb.user_id = c.user_id
    AND ABS(usb.pending_reserved - c.correct_reserved) >= 1;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'Đã cập nhật % user (pending_reserved)', v_count;

  -- Reset về 0 cho user không có confirmed request
  UPDATE user_system_balance usb
  SET pending_reserved = 0, updated_at = NOW()
  WHERE pending_reserved != 0
    AND NOT EXISTS (
      SELECT 1 FROM payment_requests pr
      WHERE pr.user_id = usb.user_id
        AND pr.status = 'confirmed'
        AND pr.cancelled_at IS NULL
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RAISE NOTICE 'Reset % user về 0 (không có confirmed request)', v_count;
  END IF;
END $$;

-- ============================================
-- BƯỚC 4: Kiểm tra kết quả
-- available_balance = GENERATED COLUMN → tự động cập nhật
-- ============================================
DO $$
DECLARE
  v_total INTEGER;
  v_wrong_earned INTEGER;
  v_wrong_withdrawn INTEGER;
  v_wrong_reserved INTEGER;
  v_negative_available INTEGER;
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== BƯỚC 4: KIỂM TRA KẾT QUẢ ===';

  SELECT COUNT(*) INTO v_total FROM user_system_balance;

  -- Kiểm tra total_earned sai
  SELECT COUNT(*) INTO v_wrong_earned
  FROM user_system_balance usb
  WHERE ABS(usb.total_earned - COALESCE((
    SELECT SUM(cashback_amount) FROM system_conversions
    WHERE user_id = usb.user_id AND status = 'approved' AND system_reconciliation_status = 'reconciled'
  ), 0)) >= 1;

  -- Kiểm tra total_withdrawn sai
  SELECT COUNT(*) INTO v_wrong_withdrawn
  FROM user_system_balance usb
  WHERE ABS(usb.total_withdrawn - COALESCE((
    SELECT SUM(requested_amount) FROM payment_requests
    WHERE user_id = usb.user_id AND status = 'paid'
  ), 0)) >= 1;

  -- Kiểm tra pending_reserved sai
  SELECT COUNT(*) INTO v_wrong_reserved
  FROM user_system_balance usb
  WHERE ABS(usb.pending_reserved - COALESCE((
    SELECT SUM(requested_amount) FROM payment_requests
    WHERE user_id = usb.user_id AND status = 'confirmed' AND cancelled_at IS NULL
  ), 0)) >= 1;

  -- Kiểm tra available_balance âm (không nên xảy ra)
  SELECT COUNT(*) INTO v_negative_available
  FROM user_system_balance
  WHERE (total_earned - total_withdrawn - pending_reserved) < -1;

  RAISE NOTICE 'Tổng số user: %', v_total;
  RAISE NOTICE 'total_earned sai: % %', v_wrong_earned, CASE WHEN v_wrong_earned = 0 THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'total_withdrawn sai: % %', v_wrong_withdrawn, CASE WHEN v_wrong_withdrawn = 0 THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'pending_reserved sai: % %', v_wrong_reserved, CASE WHEN v_wrong_reserved = 0 THEN '✅' ELSE '❌' END;
  RAISE NOTICE 'available_balance âm: % %', v_negative_available, CASE WHEN v_negative_available = 0 THEN '✅' ELSE '⚠️' END;

  IF v_negative_available > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  Danh sách user có available_balance âm (cần xem xét):';
    FOR rec IN
      SELECT u.email, usb.total_earned, usb.total_withdrawn, usb.pending_reserved,
             (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) as available
      FROM user_system_balance usb
      JOIN users u ON u.id = usb.user_id
      WHERE (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) < -1
      ORDER BY (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) ASC
      LIMIT 10
    LOOP
      RAISE NOTICE '  % | earned=% | withdrawn=% | reserved=% | available=%',
        rec.email, rec.total_earned, rec.total_withdrawn, rec.pending_reserved, rec.available;
    END LOOP;
  END IF;
END $$;

-- ============================================
-- BƯỚC 5: Tóm tắt tổng thể
-- ============================================
DO $$
DECLARE rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TỔNG HỢP SAU RESYNC ===';

  SELECT
    COUNT(*) as total_users,
    SUM(total_earned) as sum_earned,
    SUM(total_withdrawn) as sum_withdrawn,
    SUM(pending_reserved) as sum_reserved,
    SUM(GREATEST(0, total_earned - total_withdrawn - pending_reserved)) as sum_available
  INTO rec
  FROM user_system_balance;

  RAISE NOTICE 'Tổng users có balance: %', rec.total_users;
  RAISE NOTICE 'Tổng total_earned: %đ', rec.sum_earned;
  RAISE NOTICE 'Tổng total_withdrawn: %đ', rec.sum_withdrawn;
  RAISE NOTICE 'Tổng pending_reserved: %đ', rec.sum_reserved;
  RAISE NOTICE 'Tổng available_balance: %đ', rec.sum_available;
  RAISE NOTICE '';
  RAISE NOTICE '✅ MIGRATION 067 HOÀN THÀNH';
  RAISE NOTICE 'Tất cả user_system_balance đã được đồng bộ chính xác.';
  RAISE NOTICE '';
END $$;

COMMIT;
