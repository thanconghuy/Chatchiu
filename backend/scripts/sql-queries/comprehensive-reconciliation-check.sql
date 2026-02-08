-- =====================================================
-- KIỂM TRA TOÀN DIỆN HỆ THỐNG ĐỐI SOÁT VÀ SỐ DƯ
-- Chạy trực tiếp trên Neon SQL Editor
-- =====================================================

-- =====================================================
-- PHẦN 1: TỔNG QUAN CÁC KỲ ĐỐI SOÁT
-- =====================================================

SELECT '=== PHẦN 1: TỔNG QUAN CÁC KỲ ĐỐI SOÁT ===' as section;

-- Xem tất cả kỳ đối soát với so sánh recorded vs actual
SELECT
    sr.id,
    sr.period_label,
    sr.status,
    sr.total_orders as recorded_orders,
    COUNT(sri.id) as actual_orders,
    CASE WHEN sr.total_orders = COUNT(sri.id) THEN '✅' ELSE '❌' END as match,
    sr.total_cashback as recorded_cashback,
    COALESCE(SUM(sri.cashback_amount), 0) as actual_cashback,
    sr.created_at
FROM system_reconciliations sr
LEFT JOIN system_reconciliation_items sri ON sr.id = sri.system_reconciliation_id
GROUP BY sr.id
ORDER BY sr.created_at DESC;

-- =====================================================
-- PHẦN 2: KIỂM TRA TRẠNG THÁI ĐỐI SOÁT
-- =====================================================

SELECT '=== PHẦN 2: VẤN ĐỀ TRẠNG THÁI ĐỐI SOÁT ===' as section;

-- 2a. Items với NULL system_conversion_id (orphan records)
SELECT 'Orphan items (NULL conversion_id)' as issue, COUNT(*) as count
FROM system_reconciliation_items
WHERE system_conversion_id IS NULL;

-- 2b. Items cho đơn đã thanh toán (không nên có)
SELECT 'Items cho đơn đã thanh toán' as issue, COUNT(*) as count
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid';

-- 2c. Conversions trong items nhưng chưa cập nhật system_reconciliation_status
SELECT 'Conversions chưa cập nhật trạng thái reconciled' as issue, COUNT(*) as count
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled';

-- 2d. Conversions trong items nhưng system_reconciliation_id không khớp
SELECT 'Conversions có recon_id không khớp' as issue, COUNT(*) as count
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.system_reconciliation_id IS DISTINCT FROM sri.system_reconciliation_id;

-- 2e. Chi tiết các conversions chưa cập nhật trạng thái
SELECT
    sc.id,
    sc.order_code,
    sc.merchant_name,
    sc.cashback_amount,
    sc.system_reconciliation_status as conv_status,
    sc.system_reconciliation_id as conv_recon_id,
    sri.system_reconciliation_id as item_recon_id,
    sr.period_label
FROM system_conversions sc
JOIN system_reconciliation_items sri ON sc.id = sri.system_conversion_id
JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled'
   OR sc.system_reconciliation_id IS DISTINCT FROM sri.system_reconciliation_id
LIMIT 20;

-- =====================================================
-- PHẦN 3: KIỂM TRA SỐ DƯ USERS
-- =====================================================

SELECT '=== PHẦN 3: KIỂM TRA SỐ DƯ USERS ===' as section;

-- 3a. Users có pending_reserved âm
SELECT 'Users có pending_reserved âm' as issue, COUNT(*) as count
FROM user_system_balance
WHERE pending_reserved < 0;

-- 3b. Chi tiết users có pending_reserved âm
SELECT
    u.email,
    usb.total_earned,
    usb.total_withdrawn,
    usb.pending_reserved,
    usb.available_balance
FROM user_system_balance usb
JOIN users u ON usb.user_id = u.id
WHERE usb.pending_reserved < 0;

-- 3c. So sánh balance với tính toán thực tế cho TẤT CẢ users có balance
SELECT
    u.email,
    u.full_name,
    usb.total_earned as db_total_earned,
    COALESCE(calc.calc_total_earned, 0) as calc_total_earned,
    CASE WHEN ABS(usb.total_earned - COALESCE(calc.calc_total_earned, 0)) < 0.01 THEN '✅' ELSE '❌' END as earned_match,
    usb.total_withdrawn as db_total_withdrawn,
    COALESCE(pr.calc_total_withdrawn, 0) as calc_total_withdrawn,
    CASE WHEN ABS(usb.total_withdrawn - COALESCE(pr.calc_total_withdrawn, 0)) < 0.01 THEN '✅' ELSE '❌' END as withdrawn_match,
    usb.pending_reserved as db_pending,
    COALESCE(pend.calc_pending, 0) as calc_pending,
    CASE WHEN ABS(usb.pending_reserved - COALESCE(pend.calc_pending, 0)) < 0.01 THEN '✅' ELSE '❌' END as pending_match,
    usb.available_balance as db_available
FROM user_system_balance usb
JOIN users u ON usb.user_id = u.id
LEFT JOIN (
    -- Calculate total_earned from reconciled conversions
    SELECT
        user_id,
        SUM(CASE
            WHEN system_reconciliation_status = 'reconciled' AND status = 'approved'
            THEN cashback_amount ELSE 0
        END) as calc_total_earned
    FROM system_conversions
    GROUP BY user_id
) calc ON usb.user_id = calc.user_id
LEFT JOIN (
    -- Calculate total_withdrawn from paid payment_requests
    SELECT
        user_id,
        SUM(requested_amount) as calc_total_withdrawn
    FROM payment_requests
    WHERE status = 'paid'
    GROUP BY user_id
) pr ON usb.user_id = pr.user_id
LEFT JOIN (
    -- Calculate pending_reserved from confirmed payment_requests
    SELECT
        user_id,
        SUM(requested_amount) as calc_pending
    FROM payment_requests
    WHERE status = 'confirmed'
    GROUP BY user_id
) pend ON usb.user_id = pend.user_id
WHERE usb.total_earned > 0
ORDER BY usb.total_earned DESC;

-- =====================================================
-- PHẦN 4: KIỂM TRA CHI TIẾT THEO USER CỤ THỂ
-- =====================================================

SELECT '=== PHẦN 4: CHI TIẾT USER CÓ ĐƠN ĐỐI SOÁT ===' as section;

-- Xem chi tiết đơn của một user (thay email vào đây)
-- SELECT
--     sc.order_code,
--     sc.merchant_name,
--     sc.cashback_amount,
--     sc.status,
--     sc.system_reconciliation_status,
--     sc.payment_status,
--     sr.period_label
-- FROM system_conversions sc
-- LEFT JOIN system_reconciliations sr ON sc.system_reconciliation_id = sr.id
-- WHERE sc.user_id = (SELECT id FROM users WHERE email = 'user@example.com')
-- ORDER BY sc.order_time DESC;

-- =====================================================
-- PHẦN 5: TÓM TẮT VẤN ĐỀ
-- =====================================================

SELECT '=== PHẦN 5: TÓM TẮT VẤN ĐỀ ===' as section;

SELECT 'Orphan items' as issue_type, COUNT(*) as count
FROM system_reconciliation_items WHERE system_conversion_id IS NULL

UNION ALL

SELECT 'Items for paid orders', COUNT(*)
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid'

UNION ALL

SELECT 'Conversions not marked reconciled', COUNT(*)
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled'

UNION ALL

SELECT 'Recon totals mismatch', COUNT(*)
FROM system_reconciliations sr
WHERE sr.total_orders != (
    SELECT COUNT(*) FROM system_reconciliation_items sri WHERE sri.system_reconciliation_id = sr.id
)

UNION ALL

SELECT 'Users with negative pending', COUNT(*)
FROM user_system_balance WHERE pending_reserved < 0;

-- =====================================================
-- FIX: CẬP NHẬT TRẠNG THÁI ĐỐI SOÁT CHO CONVERSIONS
-- (Chạy sau khi đã kiểm tra)
-- =====================================================

-- Uncomment để chạy fix:
/*
UPDATE system_conversions sc
SET
    system_reconciliation_id = sri.system_reconciliation_id,
    system_reconciliation_status = 'reconciled',
    updated_at = NOW()
FROM system_reconciliation_items sri
WHERE sc.id = sri.system_conversion_id
  AND (sc.system_reconciliation_status IS DISTINCT FROM 'reconciled'
       OR sc.system_reconciliation_id IS DISTINCT FROM sri.system_reconciliation_id);
*/
