-- Migration 068: Cleanup reconciliation data inconsistencies
-- Issues found by investigate-reconciliation-data.js:
--   1. 54 items with system_conversion_id = NULL (orphan records)
--   2. 13 orders already PAID but still in reconciliation items
--   3. Duplicate items (same conversion in multiple reconciliations)
--
-- This migration cleans up these inconsistencies and updates reconciliation totals

-- =====================================================
-- PART 1: Backup before cleanup (for audit)
-- =====================================================

-- Create backup table for orphan items
CREATE TABLE IF NOT EXISTS _backup_orphan_reconciliation_items_068 AS
SELECT * FROM system_reconciliation_items
WHERE system_conversion_id IS NULL;

-- Create backup table for paid items still in reconciliation
CREATE TABLE IF NOT EXISTS _backup_paid_reconciliation_items_068 AS
SELECT sri.*, sc.payment_status
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.payment_status = 'paid';

-- =====================================================
-- PART 2: Remove orphan items (NULL system_conversion_id)
-- =====================================================

-- First, get the list of affected reconciliations
DO $$
DECLARE
    orphan_count INTEGER;
    affected_recons INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count
    FROM system_reconciliation_items
    WHERE system_conversion_id IS NULL;

    SELECT COUNT(DISTINCT system_reconciliation_id) INTO affected_recons
    FROM system_reconciliation_items
    WHERE system_conversion_id IS NULL;

    RAISE NOTICE 'Found % orphan items in % reconciliations', orphan_count, affected_recons;
END $$;

-- Delete orphan items
DELETE FROM system_reconciliation_items
WHERE system_conversion_id IS NULL;

-- =====================================================
-- PART 3: Remove items for orders that are already PAID
-- =====================================================

-- These orders should have been removed when marked as paid
-- but due to bugs they remain in reconciliation_items

DO $$
DECLARE
    paid_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO paid_count
    FROM system_reconciliation_items sri
    JOIN system_conversions sc ON sri.system_conversion_id = sc.id
    WHERE sc.payment_status = 'paid';

    RAISE NOTICE 'Found % items for already-paid orders', paid_count;
END $$;

-- Delete items for paid orders
DELETE FROM system_reconciliation_items sri
USING system_conversions sc
WHERE sri.system_conversion_id = sc.id
  AND sc.payment_status = 'paid';

-- =====================================================
-- PART 4: Handle duplicate items (same conversion in multiple reconciliations)
-- Keep only the most recent one (highest reconciliation_id)
-- =====================================================

DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT system_conversion_id
        FROM system_reconciliation_items
        WHERE system_conversion_id IS NOT NULL
        GROUP BY system_conversion_id
        HAVING COUNT(*) > 1
    ) dups;

    RAISE NOTICE 'Found % conversions appearing in multiple reconciliations', dup_count;
END $$;

-- Create backup of duplicates before removal
CREATE TABLE IF NOT EXISTS _backup_duplicate_reconciliation_items_068 AS
SELECT sri.*
FROM system_reconciliation_items sri
WHERE sri.system_conversion_id IN (
    SELECT system_conversion_id
    FROM system_reconciliation_items
    WHERE system_conversion_id IS NOT NULL
    GROUP BY system_conversion_id
    HAVING COUNT(*) > 1
);

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
-- PART 5: Update reconciliation totals after cleanup
-- =====================================================

-- Update total_orders and total_cashback for all reconciliations
UPDATE system_reconciliations sr
SET
    total_orders = (
        SELECT COUNT(*)
        FROM system_reconciliation_items sri
        WHERE sri.system_reconciliation_id = sr.id
    ),
    total_cashback = (
        SELECT COALESCE(SUM(cashback_amount), 0)
        FROM system_reconciliation_items sri
        WHERE sri.system_reconciliation_id = sr.id
    ),
    updated_at = NOW();

-- =====================================================
-- PART 6: Clean up waiting list - remove items already in reconciliation
-- =====================================================

DELETE FROM reconciliation_waiting_list rwl
WHERE EXISTS (
    SELECT 1 FROM system_reconciliation_items sri
    WHERE sri.system_conversion_id = rwl.system_conversion_id
);

-- Also remove items for already paid conversions
DELETE FROM reconciliation_waiting_list rwl
WHERE EXISTS (
    SELECT 1 FROM system_conversions sc
    WHERE sc.id = rwl.system_conversion_id
      AND sc.payment_status = 'paid'
);

-- =====================================================
-- PART 7: Sync system_reconciliation_id in system_conversions
-- =====================================================

-- Ensure system_conversions.system_reconciliation_id is set correctly
UPDATE system_conversions sc
SET
    system_reconciliation_id = sri.system_reconciliation_id,
    system_reconciliation_status = 'reconciled',
    updated_at = NOW()
FROM system_reconciliation_items sri
WHERE sc.id = sri.system_conversion_id
  AND (sc.system_reconciliation_id IS NULL OR sc.system_reconciliation_id != sri.system_reconciliation_id);

-- =====================================================
-- PART 8: Verify cleanup results
-- =====================================================

DO $$
DECLARE
    orphan_remaining INTEGER;
    paid_remaining INTEGER;
    dup_remaining INTEGER;
    mismatch_count INTEGER;
BEGIN
    -- Check orphan items
    SELECT COUNT(*) INTO orphan_remaining
    FROM system_reconciliation_items
    WHERE system_conversion_id IS NULL;

    -- Check paid items
    SELECT COUNT(*) INTO paid_remaining
    FROM system_reconciliation_items sri
    JOIN system_conversions sc ON sri.system_conversion_id = sc.id
    WHERE sc.payment_status = 'paid';

    -- Check duplicates
    SELECT COUNT(*) INTO dup_remaining
    FROM (
        SELECT system_conversion_id
        FROM system_reconciliation_items
        WHERE system_conversion_id IS NOT NULL
        GROUP BY system_conversion_id
        HAVING COUNT(*) > 1
    ) dups;

    -- Check total mismatch
    SELECT COUNT(*) INTO mismatch_count
    FROM system_reconciliations sr
    WHERE sr.total_orders != (
        SELECT COUNT(*)
        FROM system_reconciliation_items sri
        WHERE sri.system_reconciliation_id = sr.id
    );

    RAISE NOTICE '===== CLEANUP VERIFICATION =====';
    RAISE NOTICE 'Orphan items remaining: %', orphan_remaining;
    RAISE NOTICE 'Paid items remaining: %', paid_remaining;
    RAISE NOTICE 'Duplicate items remaining: %', dup_remaining;
    RAISE NOTICE 'Reconciliations with total mismatch: %', mismatch_count;

    IF orphan_remaining = 0 AND paid_remaining = 0 AND dup_remaining = 0 AND mismatch_count = 0 THEN
        RAISE NOTICE 'All cleanup verified successfully!';
    ELSE
        RAISE NOTICE 'Some issues may remain - please review';
    END IF;
END $$;
