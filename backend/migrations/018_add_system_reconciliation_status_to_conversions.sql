-- =====================================================
-- Migration 018: Add System Reconciliation Status to Conversions
-- Purpose: Track which conversions have been reconciled by System Reconciliation
-- Date: 2025-11-23
-- =====================================================

-- Add system reconciliation tracking columns to conversions table
ALTER TABLE conversions
ADD COLUMN IF NOT EXISTS system_reconciliation_status VARCHAR(30),
ADD COLUMN IF NOT EXISTS system_reconciliation_id UUID REFERENCES system_reconciliations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS system_reconciled_at TIMESTAMPTZ;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversions_system_recon_status
  ON conversions(system_reconciliation_status);

CREATE INDEX IF NOT EXISTS idx_conversions_system_recon_id
  ON conversions(system_reconciliation_id);

CREATE INDEX IF NOT EXISTS idx_conversions_system_reconciled_at
  ON conversions(system_reconciled_at DESC);

-- Add constraint for valid status values (drop if exists first)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_system_reconciliation_status'
  ) THEN
    ALTER TABLE conversions DROP CONSTRAINT check_system_reconciliation_status;
  END IF;
END $$;

ALTER TABLE conversions
ADD CONSTRAINT check_system_reconciliation_status
  CHECK (system_reconciliation_status IN ('pending', 'reconciled', 'paid'));

-- Comments
COMMENT ON COLUMN conversions.system_reconciliation_status IS
  'System reconciliation status: pending (added to draft), reconciled (finalized), paid (payment completed)';

COMMENT ON COLUMN conversions.system_reconciliation_id IS
  'Reference to the system reconciliation this conversion belongs to';

COMMENT ON COLUMN conversions.system_reconciled_at IS
  'Timestamp when this conversion was reconciled by System Reconciliation';

-- =====================================================
-- Update existing data
-- =====================================================

-- Mark conversions that are already in system_reconciliation_items as reconciled
UPDATE conversions c
SET
  system_reconciliation_status = CASE
    WHEN sr.status = 'finalized' THEN 'reconciled'
    WHEN sr.status = 'paid' THEN 'paid'
    ELSE 'pending'
  END,
  system_reconciliation_id = sri.system_reconciliation_id,
  system_reconciled_at = CASE
    WHEN sr.status IN ('finalized', 'paid') THEN sr.finalized_at
    ELSE NULL
  END
FROM system_reconciliation_items sri
INNER JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
WHERE c.id = sri.conversion_id;

-- =====================================================
-- Create view for conversion reconciliation status
-- =====================================================

CREATE OR REPLACE VIEW v_conversion_reconciliation_status AS
SELECT
  c.id as conversion_id,
  c.user_id,
  c.order_code,
  c.merchant_name,
  c.cashback_amount,
  c.status as conversion_status,

  -- System Reconciliation
  c.system_reconciliation_status,
  c.system_reconciliation_id,
  c.system_reconciled_at,
  sr.period_label as system_recon_period,
  sr.status as system_recon_status,

  -- API Reconciliation (existing)
  c.is_confirmed as api_confirmed,
  c.confirmed_time as api_confirmed_at,

  -- Combined Status
  CASE
    -- Fully reconciled (both system and API)
    WHEN c.system_reconciliation_status = 'paid' AND c.is_confirmed = 1
      THEN 'fully_reconciled'

    -- System reconciled, waiting API
    WHEN c.system_reconciliation_status IN ('reconciled', 'paid') AND c.is_confirmed = 0
      THEN 'system_reconciled_pending_api'

    -- API confirmed, waiting system
    WHEN c.is_confirmed = 1 AND c.system_reconciliation_status IS NULL
      THEN 'api_confirmed_pending_system'

    -- Added to system recon draft
    WHEN c.system_reconciliation_status = 'pending'
      THEN 'pending_system_reconciliation'

    -- Not reconciled at all
    ELSE 'not_reconciled'
  END as combined_status,

  c.order_time,
  c.created_at

FROM conversions c
LEFT JOIN system_reconciliations sr ON c.system_reconciliation_id = sr.id
WHERE c.status = 'approved';

COMMENT ON VIEW v_conversion_reconciliation_status IS
  'Shows reconciliation status for conversions across both System and API reconciliation';

-- =====================================================
-- Function: Get unreconciled conversions for period
-- Returns conversions eligible for System Reconciliation
-- =====================================================

CREATE OR REPLACE FUNCTION get_unreconciled_conversions_for_period(
  p_period_start DATE,
  p_period_end DATE,
  p_aff_sid VARCHAR(100) DEFAULT NULL
)
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
  is_api_confirmed BOOLEAN,
  api_confirmed_time TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.merchant_id,
    COALESCE(c.merchant_name, 'Unknown') as merchant_name,
    COALESCE(c.order_code, 'N/A') as order_code,
    COALESCE(c.order_amount, 0) as order_amount,
    COALESCE(c.commission, 0) as commission,
    COALESCE(c.cashback_amount, 0) as cashback_amount,
    c.order_time,
    (c.is_confirmed = 1) as is_api_confirmed,
    c.confirmed_time as api_confirmed_time
  FROM conversions c
  WHERE c.status = 'approved'
    AND c.order_time >= p_period_start
    AND c.order_time <= p_period_end
    -- Not yet reconciled by System Reconciliation
    AND (c.system_reconciliation_status IS NULL
         OR c.system_reconciliation_status NOT IN ('reconciled', 'paid'))
    -- Filter by aff_sid if provided
    AND (p_aff_sid IS NULL OR c.aff_sid = p_aff_sid)
  ORDER BY c.order_time ASC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_unreconciled_conversions_for_period IS
  'Returns approved conversions not yet reconciled by System Reconciliation for a given period';

-- =====================================================
-- Sample Queries
-- =====================================================

-- View all conversion reconciliation statuses
-- SELECT * FROM v_conversion_reconciliation_status ORDER BY order_time DESC LIMIT 100;

-- Get conversions reconciled by system but not confirmed by API
-- SELECT * FROM v_conversion_reconciliation_status
-- WHERE combined_status = 'system_reconciled_pending_api';

-- Get unreconciled conversions for November 2025
-- SELECT * FROM get_unreconciled_conversions_for_period('2025-11-01', '2025-11-30');

-- Count conversions by reconciliation status
-- SELECT
--   system_reconciliation_status,
--   COUNT(*) as count,
--   SUM(cashback_amount) as total_cashback
-- FROM conversions
-- WHERE status = 'approved'
-- GROUP BY system_reconciliation_status;
