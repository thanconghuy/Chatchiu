-- Migration 040: Fix get_eligible_conversions_for_waiting_list() to check system_conversion_id
-- Issue: After migration 038, waiting list uses system_conversion_id instead of conversion_id
--        But function still checks rwl.conversion_id, causing already-added orders to appear as eligible
-- Fix: Update the NOT EXISTS check to use rwl.system_conversion_id

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
    sc.approval_time,

    -- Calculate eligible date (approval_time + 15 days)
    (sc.approval_time + INTERVAL '15 days')::DATE as eligible_date,

    -- Get first day of approval month for grouping
    DATE_TRUNC('month', sc.approval_time)::DATE as approval_month,

    -- Days since approval
    EXTRACT(DAY FROM (NOW() - sc.approval_time))::INTEGER as days_since_approval

  FROM system_conversions sc

  WHERE
    -- 1. Order must be approved
    sc.status = 'approved'

    -- 2. Must have approval_time
    AND sc.approval_time IS NOT NULL

    -- 3. Must meet 15-day eligibility (approval_time + 15 days <= NOW)
    AND sc.approval_time + INTERVAL '15 days' <= NOW()

    -- 4. Not already in waiting list (FIXED: use system_conversion_id after migration 038)
    AND NOT EXISTS (
      SELECT 1 FROM reconciliation_waiting_list rwl
      WHERE rwl.system_conversion_id = sc.id
    )

    -- 5. Not already in any reconciliation
    AND sc.system_reconciliation_id IS NULL

  ORDER BY sc.approval_time ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_eligible_conversions_for_waiting_list() IS
'Returns approved conversions from ChatChiu system (system_conversions) eligible for reconciliation (approval_time + 15 days <= NOW), excluding orders already in reconciliations or waiting list. Fixed in migration 040 to check system_conversion_id.';
