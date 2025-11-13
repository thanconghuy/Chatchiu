-- ============================================================
-- RECONCILIATION MODULE - ALL-IN-ONE MIGRATION SCRIPT
-- ============================================================
-- Description: Tạo toàn bộ schema cho module đối soát cashback
-- Date: 2025-11-11
-- Author: Reconciliation Module Implementation
--
-- Hướng dẫn chạy:
-- 1. Mở Neon Dashboard → SQL Editor
-- 2. Copy toàn bộ nội dung file này
-- 3. Paste vào SQL Editor và Execute
-- 4. Kiểm tra kết quả
-- ============================================================

-- ============================================================
-- PREREQUISITE: Tạo function update_updated_at_column nếu chưa có
-- (Function này được sử dụng bởi trigger của bảng payments)
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- MIGRATION 1: Update bảng conversions
-- Thêm các trường is_confirmed, confirmed_time và order status
-- ============================================================

-- Add reconciliation-related columns
ALTER TABLE conversions
  ADD COLUMN IF NOT EXISTS is_confirmed SMALLINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_time TIMESTAMP,
  ADD COLUMN IF NOT EXISTS order_approved INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_pending INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS order_reject INTEGER DEFAULT 0;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_conversions_is_confirmed ON conversions(is_confirmed);
CREATE INDEX IF NOT EXISTS idx_conversions_confirmed_time ON conversions(confirmed_time);
CREATE INDEX IF NOT EXISTS idx_conversions_is_confirmed_time ON conversions(is_confirmed, confirmed_time);

-- Add comments for documentation
COMMENT ON COLUMN conversions.is_confirmed IS 'Trạng thái đối soát từ AccessTrade API: 0 = chưa duyệt, 1 = đã duyệt';
COMMENT ON COLUMN conversions.confirmed_time IS 'Thời gian xác nhận đối soát từ AccessTrade';
COMMENT ON COLUMN conversions.order_approved IS 'Tổng số lượng item ở trạng thái approved trong đơn hàng';
COMMENT ON COLUMN conversions.order_pending IS 'Tổng số lượng item ở trạng thái pending trong đơn hàng';
COMMENT ON COLUMN conversions.order_reject IS 'Tổng số lượng item ở trạng thái rejected trong đơn hàng';


-- ============================================================
-- MIGRATION 2: Tạo bảng reconciliations
-- Quản lý các kỳ đối soát
-- ============================================================

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
COMMENT ON COLUMN reconciliations.status IS 'Trạng thái: draft, confirmed, paid, cancelled';
COMMENT ON COLUMN reconciliations.version IS 'Phiên bản đối soát (tăng khi re-run)';
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


-- ============================================================
-- MIGRATION 3: Tạo bảng reconciliation_items
-- Chi tiết các đơn hàng trong kỳ đối soát
-- ============================================================

-- Create reconciliation_items table
CREATE TABLE IF NOT EXISTS reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,
  conversion_id UUID NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  click_id UUID NOT NULL REFERENCES clicks(id) ON DELETE CASCADE,

  -- Snapshot data (lưu giá trị tại thời điểm đối soát)
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
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_user_reconciliation
  ON reconciliation_items(user_id, reconciliation_id);

-- Add comments
COMMENT ON TABLE reconciliation_items IS 'Bảng chi tiết các đơn hàng trong kỳ đối soát';

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


-- ============================================================
-- MIGRATION 4: Tạo bảng reconciliation_logs
-- Audit trail cho các thao tác trên kỳ đối soát
-- ============================================================

-- Create reconciliation_logs table
CREATE TABLE IF NOT EXISTS reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID REFERENCES reconciliations(id) ON DELETE CASCADE,

  -- Action information
  action VARCHAR(50) NOT NULL,
  performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Additional context
  notes TEXT,
  metadata JSONB,

  -- Constraints
  CONSTRAINT check_action CHECK (action IN (
    'created',
    'confirmed',
    'paid',
    'cancelled',
    'rerun',
    'status_changed',
    'notes_updated'
  ))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_reconciliation_id
  ON reconciliation_logs(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_performed_by
  ON reconciliation_logs(performed_by);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_performed_at
  ON reconciliation_logs(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_action
  ON reconciliation_logs(action);
CREATE INDEX IF NOT EXISTS idx_reconciliation_logs_metadata
  ON reconciliation_logs USING GIN (metadata);

-- Add comments
COMMENT ON TABLE reconciliation_logs IS 'Bảng lưu lịch sử các thao tác trên kỳ đối soát (audit trail)';

-- Function to automatically log reconciliation actions
CREATE OR REPLACE FUNCTION log_reconciliation_action()
RETURNS TRIGGER AS $$
DECLARE
  action_type VARCHAR(50);
  admin_id UUID;
  meta JSONB;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_type := 'created';
    admin_id := NEW.created_by;
    meta := jsonb_build_object(
      'status', NEW.status,
      'period_start', NEW.period_start,
      'period_end', NEW.period_end,
      'period_label', NEW.period_label,
      'version', NEW.version
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
      action_type := 'status_changed';
      meta := jsonb_build_object(
        'old_status', OLD.status,
        'new_status', NEW.status
      );

      IF NEW.status = 'confirmed' THEN
        action_type := 'confirmed';
      ELSIF NEW.status = 'paid' THEN
        action_type := 'paid';
      ELSIF NEW.status = 'cancelled' THEN
        action_type := 'cancelled';
      END IF;
    ELSIF OLD.notes IS DISTINCT FROM NEW.notes THEN
      action_type := 'notes_updated';
      meta := jsonb_build_object(
        'old_notes', OLD.notes,
        'new_notes', NEW.notes
      );
    ELSE
      RETURN NEW;
    END IF;

    admin_id := NEW.created_by;
  END IF;

  INSERT INTO reconciliation_logs (
    reconciliation_id,
    action,
    performed_by,
    metadata
  ) VALUES (
    NEW.id,
    action_type,
    admin_id,
    meta
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_reconciliation_action
  AFTER INSERT OR UPDATE ON reconciliations
  FOR EACH ROW
  EXECUTE FUNCTION log_reconciliation_action();


-- ============================================================
-- MIGRATION 5: Tạo bảng payments (Schema Only)
-- Quản lý thanh toán cashback
-- ============================================================

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID REFERENCES reconciliations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Payment amount
  amount DECIMAL(15,2) NOT NULL,

  -- Payment method details
  payment_method VARCHAR(50),
  bank_name VARCHAR(100),
  bank_account_number VARCHAR(50),
  bank_account_name VARCHAR(255),

  -- Status workflow
  status VARCHAR(20) DEFAULT 'pending',

  -- Timeline
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processing_at TIMESTAMP,
  completed_at TIMESTAMP,
  failed_at TIMESTAMP,

  -- Transaction reference
  transaction_ref VARCHAR(100),
  notes TEXT,

  -- Metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT check_amount CHECK (amount > 0),
  CONSTRAINT check_payment_status CHECK (status IN (
    'pending',
    'processing',
    'completed',
    'failed',
    'cancelled'
  ))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_reconciliation_id ON payments(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_requested_at ON payments(requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_ref ON payments(transaction_ref);

-- Add comments
COMMENT ON TABLE payments IS 'Bảng quản lý thanh toán cashback (schema only - chưa implement logic)';

-- Trigger for updated_at
CREATE TRIGGER trigger_update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- ============================================================
-- MIGRATION COMPLETED
-- ============================================================

-- Verify tables were created
DO $$
DECLARE
  table_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO table_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
  AND table_name IN ('reconciliations', 'reconciliation_items', 'reconciliation_logs', 'payments');

  RAISE NOTICE '✅ Migration completed successfully!';
  RAISE NOTICE '📊 Created % new tables', table_count;
  RAISE NOTICE '📝 Updated conversions table with reconciliation fields';
END $$;
