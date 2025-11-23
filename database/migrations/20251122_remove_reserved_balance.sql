-- ============================================================================
-- Migration: Remove Reserved Balance & Add System Reconciliation Status
-- Date: 2025-11-22
-- Purpose: Simplify reconciliation by paying 100% cashback immediately
--          Add tracking fields for better order status visibility
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Add new columns to conversions table
-- ============================================================================

-- Add system reconciliation status tracking
ALTER TABLE conversions
ADD COLUMN IF NOT EXISTS system_reconciliation_status VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS system_reconciliation_id UUID,
ADD COLUMN IF NOT EXISTS system_reconciled_at TIMESTAMP;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_conversions_system_recon_status
ON conversions(system_reconciliation_status);

CREATE INDEX IF NOT EXISTS idx_conversions_system_recon_id
ON conversions(system_reconciliation_id);

-- ============================================================================
-- STEP 2: Add debt_balance to user_system_balance
-- ============================================================================

ALTER TABLE user_system_balance
ADD COLUMN IF NOT EXISTS debt_balance NUMERIC(12,2) DEFAULT 0;

-- Add check constraint: debt_balance must be >= 0
ALTER TABLE user_system_balance
ADD CONSTRAINT chk_debt_balance_non_negative
CHECK (debt_balance >= 0);

-- ============================================================================
-- STEP 3: Migrate existing reserved balance to available balance
-- ============================================================================

-- Move all reserved balance to available balance
-- This gives users immediate access to previously held funds
UPDATE user_system_balance
SET available_balance = available_balance + COALESCE(reserved_balance, 0),
    reserved_balance = 0
WHERE reserved_balance > 0;

-- ============================================================================
-- STEP 4: Update existing reconciliation items with status
-- ============================================================================

-- Mark all conversions that are already in finalized reconciliations
UPDATE conversions c
SET system_reconciliation_status = 'reconciled',
    system_reconciliation_id = sri.system_reconciliation_id,
    system_reconciled_at = sr.finalized_at
FROM system_reconciliation_items sri
JOIN system_reconciliations sr ON sr.id = sri.system_reconciliation_id
WHERE c.id = sri.conversion_id
  AND sr.status = 'finalized'
  AND c.system_reconciliation_status IS NULL;

-- Mark API confirmed items
UPDATE conversions c
SET system_reconciliation_status = 'api_confirmed'
FROM system_reconciliation_items sri
WHERE c.id = sri.conversion_id
  AND sri.api_reconciled = TRUE
  AND c.system_reconciliation_status = 'reconciled';

-- ============================================================================
-- STEP 5: Add helpful comments to columns
-- ============================================================================

COMMENT ON COLUMN conversions.system_reconciliation_status IS 'Status: NULL (not reconciled), reconciled (finalized), api_confirmed (verified), api_rejected (rejected after reconciliation)';
COMMENT ON COLUMN conversions.system_reconciliation_id IS 'References the system_reconciliations.id that this order was included in';
COMMENT ON COLUMN conversions.system_reconciled_at IS 'Timestamp when this order was finalized in system reconciliation';
COMMENT ON COLUMN user_system_balance.debt_balance IS 'Amount user owes if orders were rejected after payout';

-- ============================================================================
-- STEP 6: Create view for easy reconciliation status reporting
-- ============================================================================

CREATE OR REPLACE VIEW v_reconciliation_status_summary AS
SELECT
  system_reconciliation_status,
  COUNT(*) as order_count,
  COUNT(DISTINCT user_id) as user_count,
  SUM(cashback_amount) as total_cashback,
  SUM(order_amount) as total_order_value
FROM conversions
WHERE status = 'approved'
GROUP BY system_reconciliation_status;

COMMENT ON VIEW v_reconciliation_status_summary IS 'Summary of orders by reconciliation status for reporting';

-- ============================================================================
-- STEP 7: Verify migration
-- ============================================================================

-- Check that all reserved balances are now 0
DO $$
DECLARE
  remaining_reserved NUMERIC;
BEGIN
  SELECT COALESCE(SUM(reserved_balance), 0) INTO remaining_reserved
  FROM user_system_balance;

  IF remaining_reserved > 0 THEN
    RAISE EXCEPTION 'Migration failed: Still have reserved balance of %', remaining_reserved;
  END IF;

  RAISE NOTICE 'Migration successful: All reserved balances moved to available';
END $$;

COMMIT;

-- ============================================================================
-- Rollback Script (Run manually if needed)
-- ============================================================================

/*
BEGIN;

-- Remove new columns
ALTER TABLE conversions
DROP COLUMN IF EXISTS system_reconciliation_status,
DROP COLUMN IF EXISTS system_reconciliation_id,
DROP COLUMN IF EXISTS system_reconciled_at;

ALTER TABLE user_system_balance
DROP COLUMN IF EXISTS debt_balance;

-- Drop indexes
DROP INDEX IF EXISTS idx_conversions_system_recon_status;
DROP INDEX IF EXISTS idx_conversions_system_recon_id;

-- Drop view
DROP VIEW IF EXISTS v_reconciliation_status_summary;

COMMIT;
*/
