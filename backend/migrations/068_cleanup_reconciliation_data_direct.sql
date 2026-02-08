-- =====================================================
-- Migration 068: Cleanup Reconciliation Data (Direct SQL for Neon)
-- Run this directly in Neon SQL Editor
-- =====================================================

-- =====================================================
-- STEP 1: CHECK CURRENT STATE (Run this first to see issues)
-- =====================================================

-- Check orphan items
SELECT 'Orphan items (NULL conversion_id)' as issue, COUNT(*) as count
FROM system_reconciliation_items
WHERE system_conversion_id IS NULL;

-- Check paid items still in reconciliation
SELECT 'Paid items still in reconciliation' as issue, COUNT(*) as count
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid';

-- Check duplicates
SELECT 'Duplicate items' as issue, COUNT(*) as count
FROM (
    SELECT system_conversion_id
    FROM system_reconciliation_items
    WHERE system_conversion_id IS NOT NULL
    GROUP BY system_conversion_id
    HAVING COUNT(*) > 1
) dups;

-- Check reconciliations with total mismatch
SELECT 'Reconciliations with mismatch' as issue, COUNT(*) as count
FROM system_reconciliations sr
WHERE sr.total_orders != (
    SELECT COUNT(*)
    FROM system_reconciliation_items sri
    WHERE sri.system_reconciliation_id = sr.id
);

-- =====================================================
-- STEP 2: CREATE BACKUP TABLES
-- =====================================================

-- Backup orphan items
DROP TABLE IF EXISTS _backup_orphan_reconciliation_items_068;
CREATE TABLE _backup_orphan_reconciliation_items_068 AS
SELECT * FROM system_reconciliation_items
WHERE system_conversion_id IS NULL;

-- Backup paid items
DROP TABLE IF EXISTS _backup_paid_reconciliation_items_068;
CREATE TABLE _backup_paid_reconciliation_items_068 AS
SELECT sri.*, sc.payment_status
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid';

-- Backup duplicates
DROP TABLE IF EXISTS _backup_duplicate_reconciliation_items_068;
CREATE TABLE _backup_duplicate_reconciliation_items_068 AS
SELECT sri.*
FROM system_reconciliation_items sri
WHERE sri.system_conversion_id IN (
    SELECT system_conversion_id
    FROM system_reconciliation_items
    WHERE system_conversion_id IS NOT NULL
    GROUP BY system_conversion_id
    HAVING COUNT(*) > 1
);

-- =====================================================
-- STEP 3: DELETE ORPHAN ITEMS (NULL system_conversion_id)
-- =====================================================

DELETE FROM system_reconciliation_items
WHERE system_conversion_id IS NULL;

-- =====================================================
-- STEP 4: DELETE ITEMS FOR ALREADY-PAID ORDERS
-- =====================================================

DELETE FROM system_reconciliation_items sri
USING system_conversions sc
WHERE sri.system_conversion_id = sc.id
  AND sc.payment_status = 'paid';

-- =====================================================
-- STEP 5: DELETE DUPLICATE ITEMS (keep most recent by created_at)
-- =====================================================

-- Delete duplicates, keeping only the one created most recently
DELETE FROM system_reconciliation_items sri
WHERE EXISTS (
    SELECT 1
    FROM system_reconciliation_items sri2
    WHERE sri2.system_conversion_id = sri.system_conversion_id
      AND sri2.system_conversion_id IS NOT NULL
      AND (
          sri2.created_at > sri.created_at
          OR (sri2.created_at = sri.created_at AND sri2.id::text > sri.id::text)
      )
);

-- =====================================================
-- STEP 6: UPDATE RECONCILIATION TOTALS
-- =====================================================

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

-- =====================================================
-- STEP 7: CLEANUP WAITING LIST
-- =====================================================

-- Remove items already in reconciliation
DELETE FROM reconciliation_waiting_list rwl
WHERE EXISTS (
    SELECT 1 FROM system_reconciliation_items sri
    WHERE sri.system_conversion_id = rwl.system_conversion_id
);

-- Remove items for paid conversions
DELETE FROM reconciliation_waiting_list rwl
WHERE EXISTS (
    SELECT 1 FROM system_conversions sc
    WHERE sc.id = rwl.system_conversion_id
      AND sc.payment_status = 'paid'
);

-- =====================================================
-- STEP 8: SYNC system_reconciliation_id IN system_conversions
-- =====================================================

UPDATE system_conversions sc
SET
    system_reconciliation_id = sri.system_reconciliation_id,
    system_reconciliation_status = 'reconciled',
    updated_at = NOW()
FROM system_reconciliation_items sri
WHERE sc.id = sri.system_conversion_id
  AND (sc.system_reconciliation_id IS NULL OR sc.system_reconciliation_id != sri.system_reconciliation_id);

-- =====================================================
-- STEP 9: VERIFY CLEANUP (Run this to confirm)
-- =====================================================

SELECT 'AFTER CLEANUP' as status;

SELECT 'Orphan items' as check_type, COUNT(*) as remaining
FROM system_reconciliation_items
WHERE system_conversion_id IS NULL

UNION ALL

SELECT 'Paid items in reconciliation', COUNT(*)
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid'

UNION ALL

SELECT 'Duplicate items', COUNT(*)
FROM (
    SELECT system_conversion_id
    FROM system_reconciliation_items
    WHERE system_conversion_id IS NOT NULL
    GROUP BY system_conversion_id
    HAVING COUNT(*) > 1
) dups

UNION ALL

SELECT 'Reconciliations with mismatch', COUNT(*)
FROM system_reconciliations sr
WHERE sr.total_orders != (
    SELECT COUNT(*)
    FROM system_reconciliation_items sri
    WHERE sri.system_reconciliation_id = sr.id
);

-- =====================================================
-- STEP 10: SHOW BACKUP COUNTS
-- =====================================================

SELECT 'Backup: orphan items' as backup_table, COUNT(*) as rows FROM _backup_orphan_reconciliation_items_068
UNION ALL
SELECT 'Backup: paid items', COUNT(*) FROM _backup_paid_reconciliation_items_068
UNION ALL
SELECT 'Backup: duplicate items', COUNT(*) FROM _backup_duplicate_reconciliation_items_068;
