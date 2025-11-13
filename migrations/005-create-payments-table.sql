-- Migration: Create payments table (Schema Only)
-- Description: Tạo bảng thanh toán (chỉ schema, chưa implement logic)
-- Date: 2025-11-11
-- Author: Reconciliation Module Implementation
-- Note: Logic sẽ được phát triển trong phase tương lai

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID REFERENCES reconciliations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Payment amount
  amount DECIMAL(15,2) NOT NULL,

  -- Payment method details
  payment_method VARCHAR(50), -- bank_transfer, momo, zalopay, paypal, etc.
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
  transaction_ref VARCHAR(100), -- Mã giao dịch ngân hàng
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
COMMENT ON COLUMN payments.reconciliation_id IS 'ID kỳ đối soát liên quan (optional)';
COMMENT ON COLUMN payments.amount IS 'Số tiền thanh toán (VNĐ)';
COMMENT ON COLUMN payments.payment_method IS 'Phương thức thanh toán: bank_transfer, momo, zalopay, etc.';
COMMENT ON COLUMN payments.status IS 'Trạng thái: pending, processing, completed, failed, cancelled';
COMMENT ON COLUMN payments.transaction_ref IS 'Mã tham chiếu giao dịch từ ngân hàng/ví điện tử';

-- Trigger for updated_at
CREATE TRIGGER trigger_update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Note: Các triggers và functions xử lý business logic sẽ được thêm vào phase tương lai
-- Bao gồm:
-- - Trigger tự động tạo payment khi reconciliation chuyển sang status 'paid'
-- - Trigger cập nhật user balance khi payment completed
-- - Validation rules cho payment methods
-- - Integration với payment gateway APIs
