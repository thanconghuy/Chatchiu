-- Fix Auto-Sync to use system_conversions instead of conversions
-- Add aff_sid column to the function output
-- Migration: 030_fix_autosync_system_conversions.sql

-- Drop existing function first (required when changing return type)
DROP FUNCTION IF EXISTS get_eligible_conversions_for_waiting_list();

-- Create new function querying system_conversions only (cashback orders)
CREATE OR REPLACE FUNCTION get_eligible_conversions_for_waiting_list()
RETURNS TABLE (
  conversion_id UUID,
  user_id UUID,
  user_email VARCHAR(255),
  user_full_name VARCHAR(255),
  aff_sid VARCHAR(255),
  merchant_id VARCHAR(50),
  merchant_name VARCHAR(255),
  order_code VARCHAR(255),
  order_amount DECIMAL(15,2),
  commission DECIMAL(15,2),
  cashback_amount DECIMAL(15,2),
  order_time TIMESTAMPTZ,
  approval_time TIMESTAMPTZ,
  eligible_date DATE,
  approval_month DATE,
  days_since_approval INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.at_conversion_id::UUID as conversion_id,
    sc.user_id::UUID,
    u.email::VARCHAR(255) as user_email,
    u.full_name::VARCHAR(255) as user_full_name,
    COALESCE(cl.aff_sid, 'N/A')::VARCHAR(255) as aff_sid,
    sc.merchant_id::VARCHAR(50),
    COALESCE(sc.merchant_name, 'Unknown')::VARCHAR(255) as merchant_name,
    COALESCE(sc.order_code, 'N/A')::VARCHAR(255) as order_code,
    COALESCE(sc.order_amount, 0)::DECIMAL(15,2) as order_amount,
    COALESCE(sc.commission, 0)::DECIMAL(15,2) as commission,
    COALESCE(sc.cashback_amount, 0)::DECIMAL(15,2) as cashback_amount,
    sc.order_time::TIMESTAMPTZ,
    sc.approval_time::TIMESTAMPTZ,

    -- Calculate eligible date (approval_time + 15 days)
    (sc.approval_time::TIMESTAMPTZ + INTERVAL '15 days')::DATE as eligible_date,

    -- Get first day of approval month for grouping
    DATE_TRUNC('month', sc.approval_time::TIMESTAMPTZ)::DATE as approval_month,

    -- Days since approval
    EXTRACT(DAY FROM (NOW() - sc.approval_time::TIMESTAMPTZ))::INTEGER as days_since_approval

  FROM system_conversions sc
  LEFT JOIN users u ON sc.user_id = u.id
  LEFT JOIN clicks cl ON sc.click_id = cl.id

  WHERE
    -- 1. Order must be approved
    sc.status = 'approved'

    -- 2. Must have approval_time
    AND sc.approval_time IS NOT NULL

    -- 3. Must meet 15-day eligibility (approval_time + 15 days <= NOW)
    AND sc.approval_time::TIMESTAMPTZ + INTERVAL '15 days' <= NOW()

    -- 4. Not already in waiting list
    AND NOT EXISTS (
      SELECT 1 FROM reconciliation_waiting_list rwl
      WHERE rwl.conversion_id = sc.at_conversion_id
    )

    -- 5. Not already reconciled in system_reconciliation
    AND (sc.system_reconciliation_status IS NULL
         OR sc.system_reconciliation_status NOT IN ('reconciled', 'paid'))

  ORDER BY sc.approval_time ASC;
END;
$$ LANGUAGE plpgsql;
