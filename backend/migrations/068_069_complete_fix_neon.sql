-- =====================================================
-- MIGRATION 068 + 069: Complete Fix for Neon
-- Combines cleanup and status fix
-- =====================================================

-- =====================================================
-- PHẦN A: KIỂM TRA TRƯỚC KHI FIX
-- =====================================================

SELECT '=== KIỂM TRA TRƯỚC KHI FIX ===' as section;

-- A1. Orphan items
SELECT 'Orphan items (NULL conversion_id)' as issue, COUNT(*) as count
FROM system_reconciliation_items WHERE system_conversion_id IS NULL;

-- A2. Paid items still in reconciliation
SELECT 'Items cho đơn đã thanh toán' as issue, COUNT(*) as count
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid';

-- A3. Conversions not marked as reconciled (BUG!)
SELECT 'Conversions CHƯA được mark reconciled (BUG)' as issue, COUNT(*) as count
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled';

-- A4. Reconciliation totals mismatch
SELECT 'Kỳ đối soát có total không khớp' as issue, COUNT(*) as count
FROM system_reconciliations sr
WHERE sr.total_orders != (
    SELECT COUNT(*) FROM system_reconciliation_items sri WHERE sri.system_reconciliation_id = sr.id
);

-- =====================================================
-- PHẦN B: TẠO BACKUP TABLES
-- =====================================================

SELECT '=== TẠO BACKUP ===' as section;

DROP TABLE IF EXISTS _backup_orphan_items_068_069;
CREATE TABLE _backup_orphan_items_068_069 AS
SELECT * FROM system_reconciliation_items WHERE system_conversion_id IS NULL;

DROP TABLE IF EXISTS _backup_paid_items_068_069;
CREATE TABLE _backup_paid_items_068_069 AS
SELECT sri.*, sc.payment_status
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid';

DROP TABLE IF EXISTS _backup_not_reconciled_068_069;
CREATE TABLE _backup_not_reconciled_068_069 AS
SELECT sc.id, sc.system_reconciliation_status, sc.system_reconciliation_id, sri.system_reconciliation_id as item_recon_id
FROM system_conversions sc
JOIN system_reconciliation_items sri ON sc.id = sri.system_conversion_id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled';

-- =====================================================
-- PHẦN C: CLEANUP (Migration 068)
-- =====================================================

SELECT '=== CLEANUP MIGRATION 068 ===' as section;

-- C1. Delete orphan items
DELETE FROM system_reconciliation_items WHERE system_conversion_id IS NULL;

-- C2. Delete items for paid orders
DELETE FROM system_reconciliation_items sri
USING system_conversions sc
WHERE sri.system_conversion_id = sc.id AND sc.payment_status = 'paid';

-- C3. Delete duplicates (keep most recent by created_at)
DELETE FROM system_reconciliation_items sri
WHERE EXISTS (
    SELECT 1 FROM system_reconciliation_items sri2
    WHERE sri2.system_conversion_id = sri.system_conversion_id
      AND sri2.system_conversion_id IS NOT NULL
      AND (sri2.created_at > sri.created_at
           OR (sri2.created_at = sri.created_at AND sri2.id::text > sri.id::text))
);

-- C4. Update reconciliation totals
UPDATE system_reconciliations sr
SET
    total_orders = sub.actual_count,
    total_cashback = sub.actual_cashback,
    updated_at = NOW()
FROM (
    SELECT
        system_reconciliation_id,
        COUNT(*) as actual_count,
        COALESCE(SUM(cashback_amount), 0) as actual_cashback
    FROM system_reconciliation_items
    GROUP BY system_reconciliation_id
) sub
WHERE sr.id = sub.system_reconciliation_id;

-- C5. Cleanup waiting list
DELETE FROM reconciliation_waiting_list rwl
WHERE EXISTS (
    SELECT 1 FROM system_reconciliation_items sri
    WHERE sri.system_conversion_id = rwl.system_conversion_id
);

DELETE FROM reconciliation_waiting_list rwl
WHERE EXISTS (
    SELECT 1 FROM system_conversions sc
    WHERE sc.id = rwl.system_conversion_id AND sc.payment_status = 'paid'
);

-- =====================================================
-- PHẦN D: FIX RECONCILIATION STATUS (Migration 069)
-- =====================================================

SELECT '=== FIX RECONCILIATION STATUS (MIGRATION 069) ===' as section;

-- D1. Fix system_reconciliation_status for all items
UPDATE system_conversions sc
SET
    system_reconciliation_id = sri.system_reconciliation_id,
    system_reconciliation_status = 'reconciled',
    system_reconciled_at = COALESCE(sc.system_reconciled_at, sr.finalized_at, NOW()),
    updated_at = NOW()
FROM system_reconciliation_items sri
JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
WHERE sc.id = sri.system_conversion_id
  AND (sc.system_reconciliation_status IS DISTINCT FROM 'reconciled'
       OR sc.system_reconciliation_id IS DISTINCT FROM sri.system_reconciliation_id);

-- =====================================================
-- PHẦN E: FIX USER BALANCES
-- =====================================================

SELECT '=== FIX USER BALANCES ===' as section;

-- E1. Recalculate total_earned from reconciled conversions
UPDATE user_system_balance usb
SET
    total_earned = COALESCE(calc.expected_total_earned, 0),
    updated_at = NOW()
FROM (
    SELECT
        user_id,
        SUM(cashback_amount) as expected_total_earned
    FROM system_conversions
    WHERE system_reconciliation_status = 'reconciled'
      AND status = 'approved'
    GROUP BY user_id
) calc
WHERE usb.user_id = calc.user_id
  AND ABS(usb.total_earned - calc.expected_total_earned) >= 0.01;

-- E2. Fix pending_reserved to match confirmed payment_requests
UPDATE user_system_balance usb
SET
    pending_reserved = COALESCE(pr.calc_pending, 0),
    updated_at = NOW()
FROM (
    SELECT
        user_id,
        SUM(requested_amount) as calc_pending
    FROM payment_requests
    WHERE status = 'confirmed'
    GROUP BY user_id
) pr
WHERE usb.user_id = pr.user_id
  AND ABS(usb.pending_reserved - pr.calc_pending) >= 0.01;

-- E3. Reset negative pending_reserved to 0
UPDATE user_system_balance
SET
    pending_reserved = 0,
    updated_at = NOW()
WHERE pending_reserved < 0;

-- =====================================================
-- PHẦN F: VERIFY RESULTS
-- =====================================================

SELECT '=== KẾT QUẢ SAU KHI FIX ===' as section;

SELECT 'Orphan items' as check_type, COUNT(*) as remaining
FROM system_reconciliation_items WHERE system_conversion_id IS NULL

UNION ALL

SELECT 'Items cho đơn đã thanh toán', COUNT(*)
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid'

UNION ALL

SELECT 'Conversions chưa reconciled', COUNT(*)
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled'

UNION ALL

SELECT 'Kỳ đối soát total không khớp', COUNT(*)
FROM system_reconciliations sr
WHERE sr.total_orders != (
    SELECT COUNT(*) FROM system_reconciliation_items sri WHERE sri.system_reconciliation_id = sr.id
)

UNION ALL

SELECT 'Users có pending_reserved âm', COUNT(*)
FROM user_system_balance WHERE pending_reserved < 0;

-- =====================================================
-- PHẦN G: KIỂM TRA SỐ DƯ CHI TIẾT
-- =====================================================

SELECT '=== KIỂM TRA SỐ DƯ USERS ===' as section;

SELECT
    u.email,
    usb.total_earned as db_earned,
    COALESCE(calc.expected, 0) as calc_earned,
    CASE WHEN ABS(usb.total_earned - COALESCE(calc.expected, 0)) < 0.01 THEN '✅' ELSE '❌' END as earned_ok,
    usb.total_withdrawn as db_withdrawn,
    COALESCE(pr_paid.total, 0) as calc_withdrawn,
    CASE WHEN ABS(usb.total_withdrawn - COALESCE(pr_paid.total, 0)) < 0.01 THEN '✅' ELSE '❌' END as withdrawn_ok,
    usb.pending_reserved as db_pending,
    COALESCE(pr_conf.total, 0) as calc_pending,
    CASE WHEN ABS(usb.pending_reserved - COALESCE(pr_conf.total, 0)) < 0.01 THEN '✅' ELSE '❌' END as pending_ok,
    usb.available_balance
FROM user_system_balance usb
JOIN users u ON usb.user_id = u.id
LEFT JOIN (
    SELECT user_id, SUM(cashback_amount) as expected
    FROM system_conversions
    WHERE system_reconciliation_status = 'reconciled' AND status = 'approved'
    GROUP BY user_id
) calc ON usb.user_id = calc.user_id
LEFT JOIN (
    SELECT user_id, SUM(requested_amount) as total
    FROM payment_requests WHERE status = 'paid'
    GROUP BY user_id
) pr_paid ON usb.user_id = pr_paid.user_id
LEFT JOIN (
    SELECT user_id, SUM(requested_amount) as total
    FROM payment_requests WHERE status = 'confirmed'
    GROUP BY user_id
) pr_conf ON usb.user_id = pr_conf.user_id
WHERE usb.total_earned > 0
ORDER BY usb.total_earned DESC;

-- =====================================================
-- PHẦN H: BACKUP COUNTS
-- =====================================================

SELECT '=== BACKUP COUNTS ===' as section;

SELECT 'Backup orphan items' as table_name, COUNT(*) as rows FROM _backup_orphan_items_068_069
UNION ALL
SELECT 'Backup paid items', COUNT(*) FROM _backup_paid_items_068_069
UNION ALL
SELECT 'Backup not reconciled', COUNT(*) FROM _backup_not_reconciled_068_069;
