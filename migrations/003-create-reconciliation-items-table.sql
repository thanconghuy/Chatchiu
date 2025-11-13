-- Migration: Create reconciliation_items table
-- Description: Tạo bảng chi tiết các đơn hàng trong kỳ đối soát
-- Date: 2025-11-11
-- Author: Reconciliation Module Implementation

-- Create reconciliation_items table
CREATE TABLE IF NOT EXISTS reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  conversion_id UUID NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  click_id UUID NOT NULL REFERENCES clicks(id) ON DELETE CASCADE,

  -- Snapshot data (lưu giá trị tại thời điểm đối soát để tránh thay đổi sau này)
  order_code VARCHAR(100),
  merchant_name VARCHAR(255),
  order_amount DECIMAL(15,2) DEFAULT 0.00,
  commission DECIMAL(15,2) DEFAULT 0.00,
  cashback_amount DECIMAL(15,2) DEFAULT 0.00,
  order_time TIMESTAMP,
  confirmed_time TIMESTAMP,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraint: 1 conversion chỉ có thể thuộc 1 reconciliation duy nhất
  -- (Tránh trường hợp đối soát trùng)
  CONSTRAINT unique_conversion_in_reconciliation UNIQUE(conversion_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_reconciliation_id
  ON reconciliation_items(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_user_id
  ON reconciliation_items(user_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_conversion_id
  ON reconciliation_items(conversion_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_created_at
  ON reconciliation_items(created_at DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_user_reconciliation
  ON reconciliation_items(user_id, reconciliation_id);

-- Add comments
COMMENT ON TABLE reconciliation_items IS 'Bảng chi tiết các đơn hàng trong kỳ đối soát';
COMMENT ON COLUMN reconciliation_items.reconciliation_id IS 'ID kỳ đối soát';
COMMENT ON COLUMN reconciliation_items.conversion_id IS 'ID conversion (đơn hàng)';
COMMENT ON COLUMN reconciliation_items.order_code IS 'Mã đơn hàng (snapshot)';
COMMENT ON COLUMN reconciliation_items.cashback_amount IS 'Số tiền cashback (snapshot tại thời điểm đối soát)';
COMMENT ON COLUMN reconciliation_items.confirmed_time IS 'Thời gian AccessTrade xác nhận đối soát';

-- Trigger to update reconciliation stats when items are added/removed
CREATE OR REPLACE FUNCTION update_reconciliation_stats()
RETURNS TRIGGER AS $$
DECLARE
  rec_id UUID;
  item_count INTEGER;
  total_amount DECIMAL(15,2);
  total_cash DECIMAL(15,2);
BEGIN
  -- Get reconciliation_id from NEW or OLD record
  rec_id := COALESCE(NEW.reconciliation_id, OLD.reconciliation_id);

  -- Calculate statistics from reconciliation_items
  SELECT
    COUNT(*),
    COALESCE(SUM(order_amount), 0),
    COALESCE(SUM(cashback_amount), 0)
  INTO item_count, total_amount, total_cash
  FROM reconciliation_items
  WHERE reconciliation_id = rec_id;

  -- Update reconciliations table
  UPDATE reconciliations
  SET
    total_orders = item_count,
    total_order_amount = total_amount,
    total_cashback = total_cash
  WHERE id = rec_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_reconciliation_stats_on_insert
  AFTER INSERT ON reconciliation_items
  FOR EACH ROW
  EXECUTE FUNCTION update_reconciliation_stats();

CREATE TRIGGER trigger_update_reconciliation_stats_on_delete
  AFTER DELETE ON reconciliation_items
  FOR EACH ROW
  EXECUTE FUNCTION update_reconciliation_stats();
