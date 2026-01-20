-- Migration 041: Fix missing system_reconciliation_status for old reconciled conversions
-- Issue: 21 conversions have system_reconciliation_id but system_reconciliation_status is NULL
-- Root Cause: Old code didn't set status when finalizing reconciliation
-- Fix: Update all conversions that have reconciliation_id to have status = 'reconciled'

-- Step 1: Show current state
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM system_conversions
  WHERE system_reconciliation_id IS NOT NULL
    AND system_reconciliation_status IS NULL;

  RAISE NOTICE '';
  RAISE NOTICE '=== MIGRATION 041: Fix Missing Reconciliation Status ===';
  RAISE NOTICE 'Found % conversions with ID but no status', v_count;
  RAISE NOTICE '';
END $$;

-- Step 2: Update missing statuses
UPDATE system_conversions
SET
  system_reconciliation_status = 'reconciled',
  system_reconciled_at = COALESCE(system_reconciled_at, NOW())
WHERE system_reconciliation_id IS NOT NULL
  AND system_reconciliation_status IS NULL;

-- Step 3: Verify fix
DO $$
DECLARE
  v_before_count INTEGER;
  v_after_count INTEGER;
  v_fixed_count INTEGER;
BEGIN
  -- Count before (should be 0 now)
  SELECT COUNT(*) INTO v_after_count
  FROM system_conversions
  WHERE system_reconciliation_id IS NOT NULL
    AND system_reconciliation_status IS NULL;

  -- Count total reconciled
  SELECT COUNT(*) INTO v_before_count
  FROM system_conversions
  WHERE system_reconciliation_status = 'reconciled';

  v_fixed_count := v_before_count;

  RAISE NOTICE '';
  RAISE NOTICE '✅ MIGRATION COMPLETED';
  RAISE NOTICE '  - Fixed conversions: %', v_fixed_count;
  RAISE NOTICE '  - Remaining issues: % (should be 0)', v_after_count;
  RAISE NOTICE '';

  IF v_after_count > 0 THEN
    RAISE WARNING 'Still have % conversions with missing status!', v_after_count;
  END IF;
END $$;

-- Step 4: Show sample of fixed data
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '📊 Sample of fixed conversions:';
  RAISE NOTICE '='.repeat(80);

  FOR rec IN
    SELECT
      order_code,
      system_reconciliation_status,
      system_reconciled_at
    FROM system_conversions
    WHERE system_reconciliation_status = 'reconciled'
    ORDER BY system_reconciled_at DESC
    LIMIT 5
  LOOP
    RAISE NOTICE '  % | Status: % | Reconciled: %',
      rec.order_code,
      rec.system_reconciliation_status,
      rec.system_reconciled_at;
  END LOOP;

  RAISE NOTICE '';
END $$;

COMMENT ON TABLE system_conversions IS 'System conversions table - Migration 041: Fixed missing reconciliation statuses';
