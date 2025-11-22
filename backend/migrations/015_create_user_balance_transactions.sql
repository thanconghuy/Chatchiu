-- =====================================================
-- Migration 015: User Balance Transactions Table
-- Purpose: Track all balance changes for audit trail
-- Created: 2025-11-21
-- =====================================================

-- Create user_balance_transactions table
CREATE TABLE IF NOT EXISTS user_balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Transaction details
  transaction_type VARCHAR(50) NOT NULL, -- 'reconciliation_finalized', 'payment_deducted', 'payment_refunded', 'reserved_released', 'reserved_deducted', 'pending_added'
  amount DECIMAL(15,2) NOT NULL,

  -- Balance snapshots (before transaction)
  balance_before DECIMAL(15,2) NOT NULL DEFAULT 0,
  balance_after DECIMAL(15,2) NOT NULL DEFAULT 0,
  reserved_before DECIMAL(15,2) NOT NULL DEFAULT 0,
  reserved_after DECIMAL(15,2) NOT NULL DEFAULT 0,
  pending_before DECIMAL(15,2) NOT NULL DEFAULT 0,
  pending_after DECIMAL(15,2) NOT NULL DEFAULT 0,

  -- Reference IDs
  system_reconciliation_id UUID REFERENCES system_reconciliations(id) ON DELETE SET NULL,
  payment_request_id UUID REFERENCES payment_requests(id) ON DELETE SET NULL,
  conversion_id UUID REFERENCES conversions(id) ON DELETE SET NULL,

  -- Metadata
  description TEXT,
  metadata JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Indexes
  CONSTRAINT valid_amount CHECK (amount > 0)
);

-- Create indexes for performance
CREATE INDEX idx_balance_tx_user ON user_balance_transactions(user_id);
CREATE INDEX idx_balance_tx_type ON user_balance_transactions(transaction_type);
CREATE INDEX idx_balance_tx_created ON user_balance_transactions(created_at DESC);
CREATE INDEX idx_balance_tx_reconciliation ON user_balance_transactions(system_reconciliation_id);
CREATE INDEX idx_balance_tx_payment ON user_balance_transactions(payment_request_id);

-- =====================================================
-- TRIGGER: Auto-log balance changes
-- =====================================================

-- Function to log balance changes
CREATE OR REPLACE FUNCTION log_balance_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if balances actually changed
  IF (OLD.available_balance != NEW.available_balance) OR
     (OLD.reserved_balance != NEW.reserved_balance) OR
     (OLD.pending_balance != NEW.pending_balance) THEN

    -- Determine transaction type and amount based on what changed
    DECLARE
      tx_type VARCHAR(50);
      tx_amount DECIMAL(15,2);
      tx_description TEXT;
    BEGIN
      -- Available balance changed
      IF OLD.available_balance != NEW.available_balance THEN
        tx_amount := ABS(NEW.available_balance - OLD.available_balance);

        IF NEW.available_balance > OLD.available_balance THEN
          -- Available increased
          IF OLD.reserved_balance > NEW.reserved_balance THEN
            tx_type := 'reserved_released';
            tx_description := 'Giải phóng số dư dự trữ sang khả dụng';
          ELSIF OLD.pending_balance > NEW.pending_balance THEN
            tx_type := 'reconciliation_finalized';
            tx_description := 'Hoàn tất đối soát - chuyển từ chờ xử lý sang khả dụng';
          ELSE
            tx_type := 'balance_increased';
            tx_description := 'Tăng số dư khả dụng';
          END IF;
        ELSE
          -- Available decreased
          tx_type := 'payment_deducted';
          tx_description := 'Trừ số dư cho thanh toán';
        END IF;

      -- Reserved balance changed
      ELSIF OLD.reserved_balance != NEW.reserved_balance THEN
        tx_amount := ABS(NEW.reserved_balance - OLD.reserved_balance);

        IF NEW.reserved_balance > OLD.reserved_balance THEN
          tx_type := 'reconciliation_finalized';
          tx_description := 'Hoàn tất đối soát - chuyển một phần sang dự trữ';
        ELSE
          tx_type := 'reserved_deducted';
          tx_description := 'Trừ số dư dự trữ (đơn hàng bị từ chối)';
        END IF;

      -- Pending balance changed
      ELSIF OLD.pending_balance != NEW.pending_balance THEN
        tx_amount := ABS(NEW.pending_balance - OLD.pending_balance);

        IF NEW.pending_balance > OLD.pending_balance THEN
          tx_type := 'pending_added';
          tx_description := 'Thêm số dư chờ xử lý';
        ELSE
          tx_type := 'reconciliation_finalized';
          tx_description := 'Hoàn tất đối soát - xử lý số dư chờ';
        END IF;
      END IF;

      -- Insert transaction log
      INSERT INTO user_balance_transactions (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reserved_before,
        reserved_after,
        pending_before,
        pending_after,
        description
      ) VALUES (
        NEW.user_id,
        tx_type,
        tx_amount,
        OLD.available_balance,
        NEW.available_balance,
        OLD.reserved_balance,
        NEW.reserved_balance,
        OLD.pending_balance,
        NEW.pending_balance,
        tx_description
      );
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on user_system_balance
DROP TRIGGER IF EXISTS trigger_log_balance_changes ON user_system_balance;
CREATE TRIGGER trigger_log_balance_changes
  AFTER UPDATE ON user_system_balance
  FOR EACH ROW
  EXECUTE FUNCTION log_balance_transaction();

-- =====================================================
-- VIEWS
-- =====================================================

-- View: User balance transaction summary
CREATE OR REPLACE VIEW v_user_balance_summary AS
SELECT
  u.id as user_id,
  u.full_name,
  u.email,
  usb.available_balance,
  usb.reserved_balance,
  usb.pending_balance,
  usb.total_earned,
  usb.total_withdrawn,
  usb.last_reconciliation_date,
  COUNT(ubt.id) as total_transactions,
  COUNT(CASE WHEN ubt.transaction_type = 'reconciliation_finalized' THEN 1 END) as reconciliation_count,
  COUNT(CASE WHEN ubt.transaction_type = 'payment_deducted' THEN 1 END) as payment_count,
  MAX(ubt.created_at) as last_transaction_date
FROM users u
LEFT JOIN user_system_balance usb ON u.id = usb.user_id
LEFT JOIN user_balance_transactions ubt ON u.id = ubt.user_id
GROUP BY u.id, u.full_name, u.email, usb.available_balance, usb.reserved_balance,
         usb.pending_balance, usb.total_earned, usb.total_withdrawn, usb.last_reconciliation_date;

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE user_balance_transactions IS 'Audit trail for all user balance changes';
COMMENT ON COLUMN user_balance_transactions.transaction_type IS 'Type of balance change: reconciliation_finalized, payment_deducted, payment_refunded, reserved_released, reserved_deducted, pending_added';
COMMENT ON COLUMN user_balance_transactions.amount IS 'Amount that changed (always positive)';
COMMENT ON COLUMN user_balance_transactions.balance_before IS 'Available balance before transaction';
COMMENT ON COLUMN user_balance_transactions.balance_after IS 'Available balance after transaction';

-- =====================================================
-- SAMPLE QUERIES
-- =====================================================

-- Get user's transaction history
-- SELECT * FROM user_balance_transactions WHERE user_id = 'xxx' ORDER BY created_at DESC LIMIT 20;

-- Get reconciliation-related transactions
-- SELECT * FROM user_balance_transactions WHERE transaction_type LIKE '%reconciliation%';

-- Get user balance summary with transaction counts
-- SELECT * FROM v_user_balance_summary WHERE user_id = 'xxx';
