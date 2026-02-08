-- =====================================================
-- Migration 069: Fix system_reconciliation_status
--
-- BUG FOUND: finalizeReconciliation() had condition
--   "AND sc.system_reconciliation_id IS NULL"
-- But createReconciliation() already sets system_reconciliation_id
-- So system_reconciliation_status was NEVER updated!
--
-- This migration fixes existing data
-- =====================================================

-- =====================================================
-- STEP 1: CHECK CURRENT STATE
-- =====================================================

-- Count conversions that should be 'reconciled' but aren't
SELECT 'Conversions cần fix system_reconciliation_status' as check_type, COUNT(*) as count
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled';

-- Detail
SELECT
    sr.period_label,
    COUNT(*) as items_to_fix
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled'
GROUP BY sr.period_label
ORDER BY sr.period_label;

-- =====================================================
-- STEP 2: FIX system_reconciliation_status
-- =====================================================

-- Update all conversions that are in reconciliation_items to have correct status
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
-- STEP 3: FIX user_system_balance total_earned
-- =====================================================

-- The trigger should have updated total_earned, but let's verify and fix if needed
-- Recalculate total_earned from reconciled conversions

-- First, let's see current state
SELECT
    u.email,
    usb.total_earned as current_total_earned,
    COALESCE(calc.expected_total_earned, 0) as expected_total_earned,
    CASE
        WHEN ABS(usb.total_earned - COALESCE(calc.expected_total_earned, 0)) < 0.01 THEN '✅'
        ELSE '❌'
    END as match
FROM user_system_balance usb
JOIN users u ON usb.user_id = u.id
LEFT JOIN (
    SELECT
        user_id,
        SUM(cashback_amount) as expected_total_earned
    FROM system_conversions
    WHERE system_reconciliation_status = 'reconciled'
      AND status = 'approved'
    GROUP BY user_id
) calc ON usb.user_id = calc.user_id
WHERE usb.total_earned > 0
   OR COALESCE(calc.expected_total_earned, 0) > 0
ORDER BY usb.total_earned DESC;

-- Fix total_earned if mismatch
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

-- =====================================================
-- STEP 4: VERIFY RESULTS
-- =====================================================

SELECT 'Conversions vẫn chưa reconciled' as check_type, COUNT(*) as count
FROM system_reconciliation_items sri
JOIN system_conversions sc ON sri.system_conversion_id = sc.id
WHERE sc.system_reconciliation_status IS DISTINCT FROM 'reconciled';

SELECT 'Users có total_earned sai lệch' as check_type, COUNT(*) as count
FROM user_system_balance usb
LEFT JOIN (
    SELECT
        user_id,
        SUM(cashback_amount) as expected
    FROM system_conversions
    WHERE system_reconciliation_status = 'reconciled'
      AND status = 'approved'
    GROUP BY user_id
) calc ON usb.user_id = calc.user_id
WHERE ABS(usb.total_earned - COALESCE(calc.expected, 0)) >= 0.01;
