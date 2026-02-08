-- Migration 067: Fix approval_time NULL issue for Auto-Sync
-- Problem: 112/136 approved orders have approval_time = NULL
-- Root cause: trackingService.js uses new Date() instead of confirmed_time from API
-- This migration:
--   1. Updates existing data: Set approval_time = COALESCE(confirmed_time, order_time) for approved orders
--   2. Updates get_eligible_conversions_for_waiting_list() to use COALESCE for robustness

-- =====================================================
-- PART 1: Fix existing data
-- =====================================================

-- Update system_conversions: Set approval_time for approved orders that have NULL
UPDATE system_conversions
SET
  approval_time = COALESCE(
    -- Try to get from linked conversions table first (confirmed_time)
    (SELECT c.confirmed_time FROM conversions c WHERE c.id = system_conversions.at_conversion_id AND c.confirmed_time IS NOT NULL),
    -- Fall back to order_time
    order_time
  ),
  updated_at = NOW()
WHERE status = 'approved'
  AND approval_time IS NULL;

-- Also update conversions table for consistency
UPDATE conversions
SET
  approval_time = COALESCE(confirmed_time, order_time)
WHERE status = 'approved'
  AND approval_time IS NULL;

-- =====================================================
-- PART 2: Update get_eligible_conversions_for_waiting_list() function
-- Make it more robust by using COALESCE for approval_time calculations
-- =====================================================

DROP FUNCTION IF EXISTS get_eligible_conversions_for_waiting_list() CASCADE;

CREATE OR REPLACE FUNCTION get_eligible_conversions_for_waiting_list()
RETURNS TABLE (
  conversion_id UUID,
  user_id UUID,
  merchant_id VARCHAR(50),
  merchant_name VARCHAR(255),
  order_code VARCHAR(100),
  order_amount NUMERIC(15,2),
  commission NUMERIC(15,2),
  cashback_amount NUMERIC(15,2),
  order_time TIMESTAMP,
  approval_time TIMESTAMP,
  eligible_date DATE,
  approval_month DATE,
  days_since_approval INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id as conversion_id,
    sc.user_id,
    sc.merchant_id,
    COALESCE(sc.merchant_name, 'Unknown')::VARCHAR(255) as merchant_name,
    COALESCE(sc.order_code, 'N/A')::VARCHAR(100) as order_code,
    COALESCE(sc.order_amount, 0) as order_amount,
    COALESCE(sc.commission, 0) as commission,
    COALESCE(sc.cashback_amount, 0) as cashback_amount,
    sc.order_time,
    -- Return the effective approval_time (fallback to order_time if NULL)
    COALESCE(sc.approval_time, sc.order_time) as approval_time,

    -- Calculate eligible date using effective approval_time
    (COALESCE(sc.approval_time, sc.order_time) + INTERVAL '15 days')::DATE as eligible_date,

    -- Get first day of approval month for grouping (using effective approval_time)
    DATE_TRUNC('month', COALESCE(sc.approval_time, sc.order_time))::DATE as approval_month,

    -- Days since approval (using effective approval_time)
    EXTRACT(DAY FROM (NOW() - COALESCE(sc.approval_time, sc.order_time)))::INTEGER as days_since_approval

  FROM system_conversions sc

  WHERE
    -- 1. Order must be approved
    sc.status = 'approved'

    -- 2. Must meet 15-day eligibility using COALESCE(approval_time, order_time)
    -- This handles cases where approval_time is NULL
    AND COALESCE(sc.approval_time, sc.order_time) + INTERVAL '15 days' <= NOW()

    -- 3. Not already in waiting list
    AND NOT EXISTS (
      SELECT 1 FROM reconciliation_waiting_list rwl
      WHERE rwl.system_conversion_id = sc.id
    )

    -- 4. Not already in any reconciliation (check system_reconciliation_id)
    AND sc.system_reconciliation_id IS NULL

    -- 5. Not already in system_reconciliation_items (double-check)
    AND NOT EXISTS (
      SELECT 1 FROM system_reconciliation_items sri
      WHERE sri.system_conversion_id = sc.id
    )

    -- 6. Order hasn't been paid yet
    AND (sc.payment_status IS NULL OR sc.payment_status != 'paid')

  ORDER BY COALESCE(sc.approval_time, sc.order_time) ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_eligible_conversions_for_waiting_list() IS
'Returns approved conversions from system_conversions eligible for reconciliation.
Conditions:
- status = approved
- COALESCE(approval_time, order_time) + 15 days <= NOW  (uses order_time as fallback)
- Not in waiting list (reconciliation_waiting_list)
- Not in any reconciliation (system_reconciliation_id IS NULL AND not in system_reconciliation_items)
- Not paid yet
Fixed in migration 067 to use COALESCE for approval_time calculations.';

-- =====================================================
-- PART 3: Update add_eligible_conversions_to_waiting_list() to be consistent
-- =====================================================

DROP FUNCTION IF EXISTS add_eligible_conversions_to_waiting_list(VARCHAR) CASCADE;

CREATE OR REPLACE FUNCTION add_eligible_conversions_to_waiting_list(
  p_added_by VARCHAR(50) DEFAULT 'auto-sync'
)
RETURNS TABLE (
  added_count INTEGER,
  total_cashback DECIMAL(15,2)
) AS $$
DECLARE
  v_added_count INTEGER := 0;
  v_total_cashback DECIMAL(15,2) := 0;
BEGIN
  -- Insert eligible conversions into waiting list
  WITH eligible AS (
    SELECT * FROM get_eligible_conversions_for_waiting_list()
  ),
  inserted AS (
    INSERT INTO reconciliation_waiting_list (
      system_conversion_id,
      user_id,
      merchant_id,
      merchant_name,
      order_code,
      order_amount,
      commission,
      cashback_amount,
      order_time,
      approval_time,
      eligible_date,
      approval_month,
      added_by,
      status
    )
    SELECT
      e.conversion_id,
      e.user_id,
      e.merchant_id,
      e.merchant_name,
      e.order_code,
      e.order_amount,
      e.commission,
      e.cashback_amount,
      e.order_time,
      e.approval_time,
      e.eligible_date,
      e.approval_month,
      p_added_by,
      'waiting'
    FROM eligible e
    -- Double-check not in waiting list (in case of race condition)
    WHERE NOT EXISTS (
      SELECT 1 FROM reconciliation_waiting_list rwl
      WHERE rwl.system_conversion_id = e.conversion_id
    )
    -- Double-check not in reconciliation items
    AND NOT EXISTS (
      SELECT 1 FROM system_reconciliation_items sri
      WHERE sri.system_conversion_id = e.conversion_id
    )
    RETURNING cashback_amount
  )
  SELECT
    COUNT(*)::INTEGER,
    COALESCE(SUM(cashback_amount), 0)
  INTO v_added_count, v_total_cashback
  FROM inserted;

  RETURN QUERY SELECT v_added_count, v_total_cashback;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION add_eligible_conversions_to_waiting_list IS
'Add eligible system_conversions to waiting list for System Reconciliation.
Uses get_eligible_conversions_for_waiting_list() which handles NULL approval_time.
Fixed in migration 067 to work with orders that have NULL approval_time.';

-- =====================================================
-- PART 4: Update get_waiting_list_summary() to use COALESCE
-- =====================================================

DROP FUNCTION IF EXISTS get_waiting_list_summary() CASCADE;

CREATE OR REPLACE FUNCTION get_waiting_list_summary()
RETURNS TABLE (
  approval_month DATE,
  month_label VARCHAR(50),
  order_count BIGINT,
  total_cashback DECIMAL(15,2),
  user_count BIGINT,
  eligible_since DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rwl.approval_month,
    ('Tháng ' || EXTRACT(MONTH FROM rwl.approval_month) || '/' || EXTRACT(YEAR FROM rwl.approval_month))::VARCHAR(50) as month_label,
    COUNT(*)::BIGINT as order_count,
    COALESCE(SUM(rwl.cashback_amount), 0) as total_cashback,
    COUNT(DISTINCT rwl.user_id)::BIGINT as user_count,
    MIN(rwl.eligible_date) as eligible_since
  FROM reconciliation_waiting_list rwl
  WHERE rwl.status = 'waiting'
    -- Exclude items already in reconciliation
    AND NOT EXISTS (
      SELECT 1 FROM system_reconciliation_items sri
      WHERE sri.system_conversion_id = rwl.system_conversion_id
    )
  GROUP BY rwl.approval_month
  ORDER BY rwl.approval_month DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_waiting_list_summary() IS
'Get summary of waiting list grouped by approval month.
Fixed in migration 067 for consistency.';
