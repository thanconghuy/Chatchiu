-- =====================================================
-- Migration 028: Create Reconciliation Waiting List
-- Purpose: Auto-sync approved orders into waiting list for manual reconciliation creation
-- Date: 2025-12-06
-- =====================================================

-- =====================================================
-- 1. CREATE WAITING LIST TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS reconciliation_waiting_list (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Conversion reference
  conversion_id UUID NOT NULL UNIQUE REFERENCES conversions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Order information (denormalized for quick access)
  merchant_id VARCHAR(50),
  merchant_name VARCHAR(255),
  order_code VARCHAR(255),
  order_amount DECIMAL(15,2) DEFAULT 0,
  commission DECIMAL(15,2) DEFAULT 0,
  cashback_amount DECIMAL(15,2) DEFAULT 0,

  -- Time information
  order_time TIMESTAMPTZ NOT NULL,
  approval_time TIMESTAMPTZ NOT NULL,
  eligible_date DATE NOT NULL,  -- approval_time + 15 days
  approval_month DATE NOT NULL, -- First day of approval month for grouping

  -- Status tracking
  status VARCHAR(30) DEFAULT 'waiting',  -- waiting, selected, reconciled
  selected_for_reconciliation_id UUID REFERENCES system_reconciliations(id) ON DELETE SET NULL,

  -- Auto-sync metadata
  added_to_waiting_at TIMESTAMPTZ DEFAULT NOW(),
  added_by VARCHAR(50) DEFAULT 'auto-sync',  -- 'auto-sync' | 'admin' | user_id

  -- Risk assessment (copied from conversion for quick filtering)
  risk_score DECIMAL(5,2),
  is_high_risk BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 2. CREATE INDEXES
-- =====================================================

CREATE INDEX idx_waiting_list_conversion_id ON reconciliation_waiting_list(conversion_id);
CREATE INDEX idx_waiting_list_user_id ON reconciliation_waiting_list(user_id);
CREATE INDEX idx_waiting_list_status ON reconciliation_waiting_list(status);
CREATE INDEX idx_waiting_list_approval_month ON reconciliation_waiting_list(approval_month);
CREATE INDEX idx_waiting_list_eligible_date ON reconciliation_waiting_list(eligible_date);
CREATE INDEX idx_waiting_list_approval_time ON reconciliation_waiting_list(approval_time DESC);

-- Composite index for common queries
CREATE INDEX idx_waiting_list_status_month ON reconciliation_waiting_list(status, approval_month);

-- =====================================================
-- 3. CREATE TRIGGER FOR UPDATED_AT
-- =====================================================

CREATE OR REPLACE FUNCTION update_waiting_list_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_waiting_list_timestamp
BEFORE UPDATE ON reconciliation_waiting_list
FOR EACH ROW
EXECUTE FUNCTION update_waiting_list_timestamp();

-- =====================================================
-- 4. FUNCTION: Get eligible conversions for waiting list
-- Returns approved conversions that meet the 15-day criteria
-- =====================================================

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
    c.id as conversion_id,
    c.user_id,
    c.merchant_id,
    COALESCE(c.merchant_name, 'Unknown')::VARCHAR(255) as merchant_name,
    COALESCE(c.order_code, 'N/A')::VARCHAR(255) as order_code,
    COALESCE(c.order_amount, 0) as order_amount,
    COALESCE(c.commission, 0) as commission,
    COALESCE(c.cashback_amount, 0) as cashback_amount,
    c.order_time,
    c.approval_time,

    -- Calculate eligible date (approval_time + 15 days)
    (c.approval_time + INTERVAL '15 days')::DATE as eligible_date,

    -- Get first day of approval month for grouping
    DATE_TRUNC('month', c.approval_time)::DATE as approval_month,

    -- Days since approval
    EXTRACT(DAY FROM (NOW() - c.approval_time))::INTEGER as days_since_approval

  FROM conversions c

  WHERE
    -- 1. Order must be approved
    c.status = 'approved'

    -- 2. Must have approval_time
    AND c.approval_time IS NOT NULL

    -- 3. Must meet 15-day eligibility (approval_time + 15 days <= NOW)
    AND c.approval_time + INTERVAL '15 days' <= NOW()

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

-- =====================================================
-- 5. FUNCTION: Add eligible conversions to waiting list
-- Returns count of added conversions
-- =====================================================

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
  WITH inserted AS (
    INSERT INTO reconciliation_waiting_list (
      conversion_id,
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
      conversion_id,
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
      p_added_by,
      'waiting'
    FROM get_eligible_conversions_for_waiting_list()
    ON CONFLICT (conversion_id) DO NOTHING
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

-- =====================================================
-- 6. FUNCTION: Get waiting list summary by month
-- =====================================================

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
  GROUP BY rwl.approval_month
  ORDER BY rwl.approval_month DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. FUNCTION: Move orders from waiting list to reconciliation
-- Called when admin creates reconciliation from waiting list
-- =====================================================

CREATE OR REPLACE FUNCTION move_from_waiting_to_reconciliation(
  p_reconciliation_id UUID,
  p_conversion_ids UUID[]
)
RETURNS INTEGER AS $$
DECLARE
  v_updated_count INTEGER;
BEGIN
  -- Update waiting list status to 'reconciled'
  UPDATE reconciliation_waiting_list
  SET
    status = 'reconciled',
    selected_for_reconciliation_id = p_reconciliation_id,
    updated_at = NOW()
  WHERE conversion_id = ANY(p_conversion_ids)
    AND status = 'waiting';

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  RETURN v_updated_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 8. COMMENTS
-- =====================================================

COMMENT ON TABLE reconciliation_waiting_list IS
  'Waiting list for approved orders eligible for reconciliation (approval_time + 15 days)';

COMMENT ON COLUMN reconciliation_waiting_list.eligible_date IS
  'Date when order becomes eligible for reconciliation (approval_time + 15 days)';

COMMENT ON COLUMN reconciliation_waiting_list.approval_month IS
  'First day of approval month - used for grouping orders by period';

COMMENT ON COLUMN reconciliation_waiting_list.status IS
  'waiting: In waiting list | selected: Admin selected for draft | reconciled: Moved to reconciliation';

COMMENT ON FUNCTION get_eligible_conversions_for_waiting_list() IS
  'Returns approved conversions eligible for reconciliation (approval_time + 15 days <= NOW)';

COMMENT ON FUNCTION add_eligible_conversions_to_waiting_list(VARCHAR) IS
  'Auto-sync: Add all eligible conversions to waiting list. Returns count and total cashback.';

COMMENT ON FUNCTION get_waiting_list_summary() IS
  'Get summary of waiting list grouped by approval month';

COMMENT ON FUNCTION move_from_waiting_to_reconciliation(UUID, UUID[]) IS
  'Move selected orders from waiting list to reconciliation. Called after reconciliation creation.';

-- =====================================================
-- 9. SAMPLE QUERIES FOR TESTING
-- =====================================================

-- Get eligible conversions not yet in waiting list
-- SELECT * FROM get_eligible_conversions_for_waiting_list() LIMIT 10;

-- Add eligible conversions to waiting list
-- SELECT * FROM add_eligible_conversions_to_waiting_list('admin');

-- Get waiting list summary by month
-- SELECT * FROM get_waiting_list_summary();

-- Get all waiting orders for a specific month
-- SELECT * FROM reconciliation_waiting_list
-- WHERE approval_month = '2025-11-01' AND status = 'waiting'
-- ORDER BY approval_time ASC;

-- Move orders to reconciliation
-- SELECT move_from_waiting_to_reconciliation(
--   'reconciliation-uuid',
--   ARRAY['conv-uuid-1', 'conv-uuid-2']::UUID[]
-- );
