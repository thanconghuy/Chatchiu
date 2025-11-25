-- Migration: Add reconciliation and payment status to system_conversions
-- Description: Denormalize status fields for better query performance in Conversions Management
-- Date: 2025-11-24
-- Reason: Frontend needs to display TT ĐỐI SOÁT HỆ THỐNG and TRẠNG THÁI THANH TOÁN without complex JOINs

-- =====================================================
-- 1. ADD COLUMNS TO system_conversions
-- =====================================================

-- System Reconciliation Status
-- NULL/'pending' = Chưa đối soát (not in any reconciliation)
-- 'processing' = Đang xử lý (in draft reconciliation)
-- 'reconciled' = Đã đối soát (reconciliation finalized)
-- 'paid' = Đã thanh toán (user withdrawn)
ALTER TABLE system_conversions
ADD COLUMN IF NOT EXISTS system_reconciliation_status VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS system_reconciliation_id UUID REFERENCES system_reconciliations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS system_reconciled_at TIMESTAMPTZ DEFAULT NULL;

-- Payment Request Status
-- NULL = Chưa tạo yêu cầu thanh toán
-- 'pending' = Đang xử lý (payment request created)
-- 'confirmed' = Đã xác nhận (admin confirmed)
-- 'paid' = Đã thanh toán (payment completed)
-- 'rejected' = Hủy (payment rejected)
ALTER TABLE system_conversions
ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS payment_request_id UUID REFERENCES payment_requests(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS payment_linked_at TIMESTAMPTZ DEFAULT NULL;

-- =====================================================
-- 2. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_system_conversions_recon_status
ON system_conversions(system_reconciliation_status);

CREATE INDEX IF NOT EXISTS idx_system_conversions_recon_id
ON system_conversions(system_reconciliation_id);

CREATE INDEX IF NOT EXISTS idx_system_conversions_payment_status
ON system_conversions(payment_status);

CREATE INDEX IF NOT EXISTS idx_system_conversions_payment_request_id
ON system_conversions(payment_request_id);

-- Composite index for filtering by user + statuses
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_statuses
ON system_conversions(user_id, system_reconciliation_status, payment_status);

-- =====================================================
-- 3. CHECK CONSTRAINT FOR VALID STATUS VALUES
-- =====================================================

-- Drop existing constraint if exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_system_conversions_recon_status') THEN
    ALTER TABLE system_conversions DROP CONSTRAINT check_system_conversions_recon_status;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_system_conversions_payment_status') THEN
    ALTER TABLE system_conversions DROP CONSTRAINT check_system_conversions_payment_status;
  END IF;
END $$;

-- Add constraints
ALTER TABLE system_conversions
ADD CONSTRAINT check_system_conversions_recon_status
  CHECK (system_reconciliation_status IS NULL OR
         system_reconciliation_status IN ('pending', 'processing', 'reconciled', 'paid'));

ALTER TABLE system_conversions
ADD CONSTRAINT check_system_conversions_payment_status
  CHECK (payment_status IS NULL OR
         payment_status IN ('pending', 'confirmed', 'paid', 'rejected'));

-- =====================================================
-- 4. SYNC EXISTING DATA FROM conversions
-- =====================================================

-- Sync system_reconciliation_status from conversions table
UPDATE system_conversions sc
SET
  system_reconciliation_status = c.system_reconciliation_status,
  system_reconciliation_id = c.system_reconciliation_id,
  system_reconciled_at = c.system_reconciled_at
FROM conversions c
WHERE sc.at_conversion_id = c.id
  AND c.system_reconciliation_status IS NOT NULL
  AND sc.system_reconciliation_status IS NULL;

-- =====================================================
-- 5. AUTO-SYNC TRIGGER FROM conversions → system_conversions
-- =====================================================

-- Function to sync reconciliation status
CREATE OR REPLACE FUNCTION sync_reconciliation_status_to_system_conversions()
RETURNS TRIGGER AS $$
BEGIN
  -- Update system_conversions when conversions.system_reconciliation_status changes
  UPDATE system_conversions
  SET
    system_reconciliation_status = NEW.system_reconciliation_status,
    system_reconciliation_id = NEW.system_reconciliation_id,
    system_reconciled_at = NEW.system_reconciled_at,
    updated_at = NOW()
  WHERE at_conversion_id = NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on conversions table
DROP TRIGGER IF EXISTS trigger_sync_reconciliation_status ON conversions;
CREATE TRIGGER trigger_sync_reconciliation_status
AFTER UPDATE OF system_reconciliation_status, system_reconciliation_id, system_reconciled_at
ON conversions
FOR EACH ROW
WHEN (NEW.system_reconciliation_status IS DISTINCT FROM OLD.system_reconciliation_status)
EXECUTE FUNCTION sync_reconciliation_status_to_system_conversions();

-- =====================================================
-- 6. FUNCTION TO UPDATE PAYMENT STATUS
-- =====================================================

-- Function to update payment status in system_conversions
-- Called when payment_system_reconciliation_mapping is created/updated
CREATE OR REPLACE FUNCTION update_payment_status_in_system_conversions(
  p_conversion_id UUID,
  p_payment_request_id UUID,
  p_payment_status VARCHAR(50)
)
RETURNS VOID AS $$
BEGIN
  UPDATE system_conversions
  SET
    payment_status = p_payment_status,
    payment_request_id = p_payment_request_id,
    payment_linked_at = CASE
      WHEN payment_linked_at IS NULL THEN CURRENT_TIMESTAMP
      ELSE payment_linked_at
    END,
    updated_at = NOW()
  WHERE at_conversion_id = p_conversion_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 7. BATCH UPDATE PAYMENT STATUS FROM EXISTING MAPPINGS
-- =====================================================

-- Update payment_status for conversions already linked to payment requests
UPDATE system_conversions sc
SET
  payment_status = pr.status,
  payment_request_id = pr.id,
  payment_linked_at = psrm.created_at
FROM payment_system_reconciliation_mapping psrm
INNER JOIN payment_requests pr ON psrm.payment_request_id = pr.id
INNER JOIN conversions c ON psrm.conversion_id = c.id
WHERE sc.at_conversion_id = c.id
  AND sc.payment_status IS NULL;

-- =====================================================
-- 8. VIEW FOR FRONTEND DISPLAY
-- =====================================================

CREATE OR REPLACE VIEW v_system_conversions_with_status AS
SELECT
  sc.id,
  sc.at_conversion_id,
  sc.user_id,
  sc.click_id,
  sc.merchant_id,
  sc.merchant_name,
  sc.order_code,
  sc.order_amount,
  sc.commission,
  sc.cashback_amount,
  sc.status as conversion_status,
  sc.order_time,
  sc.approval_time,
  sc.matched_at,
  sc.created_at,
  sc.updated_at,

  -- System Reconciliation Status (for "TT ĐỐI SOÁT HỆ THỐNG" column)
  sc.system_reconciliation_status,
  sc.system_reconciliation_id,
  sc.system_reconciled_at,
  CASE
    WHEN sc.system_reconciliation_status IS NULL THEN 'Chưa đối soát'
    WHEN sc.system_reconciliation_status = 'processing' THEN 'Đang xử lý'
    WHEN sc.system_reconciliation_status IN ('reconciled', 'paid') THEN 'Đã đối soát'
    ELSE 'Chưa đối soát'
  END as reconciliation_status_label,

  -- Payment Status (for "TRẠNG THÁI THANH TOÁN" column)
  sc.payment_status,
  sc.payment_request_id,
  sc.payment_linked_at,
  CASE
    WHEN sc.payment_status IS NULL THEN 'Chưa tạo yêu cầu'
    WHEN sc.payment_status = 'pending' THEN 'Đang xử lý'
    WHEN sc.payment_status = 'confirmed' THEN 'Đang xử lý'
    WHEN sc.payment_status = 'paid' THEN 'Đã thanh toán'
    WHEN sc.payment_status = 'rejected' THEN 'Hủy'
    ELSE 'Chưa tạo yêu cầu'
  END as payment_status_label,

  -- User info
  u.username,
  u.email,
  u.full_name,

  -- Merchant info
  m.logo_url as merchant_logo,

  -- System reconciliation info
  sr.period_label,
  sr.status as reconciliation_period_status

FROM system_conversions sc
LEFT JOIN users u ON sc.user_id = u.id
LEFT JOIN merchants m ON sc.merchant_id = m.id
LEFT JOIN system_reconciliations sr ON sc.system_reconciliation_id = sr.id;

-- =====================================================
-- 9. COMMENTS
-- =====================================================

COMMENT ON COLUMN system_conversions.system_reconciliation_status IS 'Trạng thái đối soát hệ thống: NULL/pending=Chưa đối soát, processing=Đang xử lý, reconciled=Đã đối soát, paid=Đã thanh toán';
COMMENT ON COLUMN system_conversions.payment_status IS 'Trạng thái thanh toán: NULL=Chưa tạo yêu cầu, pending=Đang xử lý, confirmed=Đã xác nhận, paid=Đã thanh toán, rejected=Hủy';
COMMENT ON COLUMN system_conversions.system_reconciliation_id IS 'Reference to system_reconciliations table';
COMMENT ON COLUMN system_conversions.payment_request_id IS 'Reference to payment_requests table';

COMMENT ON VIEW v_system_conversions_with_status IS 'View for Conversions Management frontend - includes all status labels in Vietnamese';

-- =====================================================
-- 10. HELPER FUNCTION: Get reconciliation status summary
-- =====================================================

CREATE OR REPLACE FUNCTION get_system_conversions_status_summary(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  total_conversions BIGINT,
  not_reconciled BIGINT,
  processing BIGINT,
  reconciled BIGINT,
  no_payment_request BIGINT,
  payment_pending BIGINT,
  payment_paid BIGINT,
  payment_rejected BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*) as total_conversions,
    COUNT(CASE WHEN system_reconciliation_status IS NULL THEN 1 END) as not_reconciled,
    COUNT(CASE WHEN system_reconciliation_status = 'processing' THEN 1 END) as processing,
    COUNT(CASE WHEN system_reconciliation_status IN ('reconciled', 'paid') THEN 1 END) as reconciled,
    COUNT(CASE WHEN payment_status IS NULL THEN 1 END) as no_payment_request,
    COUNT(CASE WHEN payment_status IN ('pending', 'confirmed') THEN 1 END) as payment_pending,
    COUNT(CASE WHEN payment_status = 'paid' THEN 1 END) as payment_paid,
    COUNT(CASE WHEN payment_status = 'rejected' THEN 1 END) as payment_rejected
  FROM system_conversions
  WHERE (p_user_id IS NULL OR user_id = p_user_id);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Check column existence
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'system_conversions'
  AND column_name IN ('system_reconciliation_status', 'payment_status', 'system_reconciliation_id', 'payment_request_id')
ORDER BY ordinal_position;

-- Check synced data
SELECT
  COUNT(*) as total,
  COUNT(CASE WHEN system_reconciliation_status IS NOT NULL THEN 1 END) as with_recon_status,
  COUNT(CASE WHEN payment_status IS NOT NULL THEN 1 END) as with_payment_status
FROM system_conversions;
