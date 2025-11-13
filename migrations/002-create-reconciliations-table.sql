-- Migration: Create reconciliations table
-- Description: Tạo bảng quản lý các kỳ đối soát
-- Date: 2025-11-11
-- Author: Reconciliation Module Implementation

-- Create reconciliations table
CREATE TABLE IF NOT EXISTS reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,

  -- Period information (flexible: by month, quarter, or custom range)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  period_label VARCHAR(100),

  -- Statistics
  total_orders INTEGER DEFAULT 0,
  total_order_amount DECIMAL(15,2) DEFAULT 0.00,
  total_cashback DECIMAL(15,2) DEFAULT 0.00,

  -- Status workflow: draft → confirmed → paid
  status VARCHAR(20) DEFAULT 'draft',

  -- Versioning for re-run capability
  version INTEGER DEFAULT 1,
  parent_reconciliation_id UUID REFERENCES reconciliations(id) ON DELETE SET NULL,
  is_latest BOOLEAN DEFAULT true,

  -- Metadata
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP,
  paid_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  notes TEXT,

  -- Constraints
  CONSTRAINT check_period CHECK (period_end >= period_start),
  CONSTRAINT check_status CHECK (status IN ('draft', 'confirmed', 'paid', 'cancelled'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reconciliations_user_id ON reconciliations(user_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_period ON reconciliations(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_reconciliations_created_at ON reconciliations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliations_is_latest ON reconciliations(is_latest) WHERE is_latest = true;

-- Unique constraint: Only one latest reconciliation per user per period
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_latest_reconciliation
  ON reconciliations(COALESCE(user_id::text, 'all'), period_start, period_end, is_latest)
  WHERE is_latest = true;

-- Add comments
COMMENT ON TABLE reconciliations IS 'Bảng quản lý các kỳ đối soát cashback';
COMMENT ON COLUMN reconciliations.user_id IS 'ID user được đối soát (NULL = tất cả users)';
COMMENT ON COLUMN reconciliations.period_start IS 'Ngày bắt đầu kỳ đối soát';
COMMENT ON COLUMN reconciliations.period_end IS 'Ngày kết thúc kỳ đối soát';
COMMENT ON COLUMN reconciliations.period_label IS 'Nhãn hiển thị: "Tháng 11/2025", "Q4/2025", etc.';
COMMENT ON COLUMN reconciliations.status IS 'Trạng thái: draft, confirmed, paid, cancelled';
COMMENT ON COLUMN reconciliations.version IS 'Phiên bản đối soát (tăng khi re-run)';
COMMENT ON COLUMN reconciliations.parent_reconciliation_id IS 'ID của kỳ đối soát cha (khi re-run)';
COMMENT ON COLUMN reconciliations.is_latest IS 'Đánh dấu phiên bản mới nhất';

-- Trigger to update parent's is_latest when creating new version
CREATE OR REPLACE FUNCTION update_parent_reconciliation_latest()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_reconciliation_id IS NOT NULL THEN
    UPDATE reconciliations
    SET is_latest = false
    WHERE id = NEW.parent_reconciliation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_parent_reconciliation_latest
  AFTER INSERT ON reconciliations
  FOR EACH ROW
  WHEN (NEW.parent_reconciliation_id IS NOT NULL)
  EXECUTE FUNCTION update_parent_reconciliation_latest();
