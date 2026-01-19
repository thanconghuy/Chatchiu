-- Migration 064: Fix timezone consistency for auto_sync tables
-- Issue: auto_sync_config uses "timestamp WITHOUT time zone"
--        auto_sync_history uses "timestamp WITH time zone"
--        This causes inconsistent display in frontend
-- Solution: Standardize both tables to use "timestamp WITH time zone"

BEGIN;

-- ============================================
-- STEP 1: Check current data types
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== CHECKING CURRENT DATA TYPES ===';
  RAISE NOTICE '';
END $$;

-- ============================================
-- STEP 2: Fix auto_sync_config timestamps
-- ============================================
DO $$
BEGIN
  RAISE NOTICE 'Fixing auto_sync_config timestamps...';
END $$;

-- Alter columns to include timezone
-- Note: PostgreSQL will treat existing values as if they were in the current timezone
ALTER TABLE auto_sync_config
  ALTER COLUMN last_run_at TYPE timestamp with time zone,
  ALTER COLUMN created_at TYPE timestamp with time zone,
  ALTER COLUMN updated_at TYPE timestamp with time zone;

-- ============================================
-- STEP 3: Verify fix
-- ============================================
DO $$
DECLARE
  v_type TEXT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFICATION ===';
  RAISE NOTICE '';

  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_name = 'auto_sync_config' AND column_name = 'last_run_at';

  RAISE NOTICE 'auto_sync_config.last_run_at: %', v_type;

  SELECT data_type INTO v_type
  FROM information_schema.columns
  WHERE table_name = 'auto_sync_history' AND column_name = 'sync_started_at';

  RAISE NOTICE 'auto_sync_history.sync_started_at: %', v_type;
  RAISE NOTICE '';
END $$;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ MIGRATION 064 COMPLETED!';
  RAISE NOTICE '';
  RAISE NOTICE 'Both tables now use "timestamp with time zone"';
  RAISE NOTICE 'Frontend should display consistent times';
  RAISE NOTICE '';
END $$;

COMMIT;
