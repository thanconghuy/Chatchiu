-- Migration 039: Fix add_eligible_conversions_to_waiting_list to use system_conversion_id
-- After migration 038, waiting list supports both conversion_id and system_conversion_id
-- This migration updates the function to INSERT using system_conversion_id for system_conversions

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
  -- Using system_conversion_id instead of conversion_id
  -- Filter out any that already exist in waiting list
  WITH eligible AS (
    SELECT * FROM get_eligible_conversions_for_waiting_list()
  ),
  inserted AS (
    INSERT INTO reconciliation_waiting_list (
      system_conversion_id,  -- Changed from conversion_id
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
      e.conversion_id,  -- This is actually sc.id from system_conversions
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
    WHERE NOT EXISTS (
      SELECT 1 FROM reconciliation_waiting_list rwl
      WHERE rwl.system_conversion_id = e.conversion_id
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
'Add eligible system_conversions to waiting list for System Reconciliation. Uses system_conversion_id column after migration 038.';
