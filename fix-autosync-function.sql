-- Fix auto-sync function type mismatch

CREATE OR REPLACE FUNCTION get_eligible_conversions_for_waiting_list()
RETURNS TABLE (
  conversion_id UUID,
  user_id UUID,
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
    c.id::UUID as conversion_id,
    c.user_id::UUID,
    c.merchant_id::VARCHAR(50),
    COALESCE(c.merchant_name, 'Unknown')::VARCHAR(255) as merchant_name,
    COALESCE(c.order_code, 'N/A')::VARCHAR(255) as order_code,
    COALESCE(c.order_amount, 0)::DECIMAL(15,2) as order_amount,
    COALESCE(c.commission, 0)::DECIMAL(15,2) as commission,
    COALESCE(c.cashback_amount, 0)::DECIMAL(15,2) as cashback_amount,
    c.order_time::TIMESTAMPTZ,
    c.approval_time::TIMESTAMPTZ,

    -- Calculate eligible date (approval_time + 15 days)
    (c.approval_time::TIMESTAMPTZ + INTERVAL '15 days')::DATE as eligible_date,

    -- Get first day of approval month for grouping
    DATE_TRUNC('month', c.approval_time::TIMESTAMPTZ)::DATE as approval_month,

    -- Days since approval
    EXTRACT(DAY FROM (NOW() - c.approval_time::TIMESTAMPTZ))::INTEGER as days_since_approval

  FROM conversions c

  WHERE
    -- 1. Order must be approved
    c.status = 'approved'

    -- 2. Must have approval_time
    AND c.approval_time IS NOT NULL

    -- 3. Must meet 15-day eligibility (approval_time + 15 days <= NOW)
    AND c.approval_time::TIMESTAMPTZ + INTERVAL '15 days' <= NOW()

    -- 4. Not already in waiting list
    AND NOT EXISTS (
      SELECT 1 FROM reconciliation_waiting_list rwl
      WHERE rwl.conversion_id = c.id
    )

    -- 5. Not already reconciled in system_reconciliation
    AND (c.system_reconciliation_status IS NULL
         OR c.system_reconciliation_status NOT IN ('reconciled', 'paid'))

  ORDER BY c.approval_time ASC;
END;
$$ LANGUAGE plpgsql;
