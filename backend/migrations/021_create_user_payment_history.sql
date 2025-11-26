-- Migration: Create user_payment_history table
-- Purpose: Track payment history for users by reconciliation period
-- Author: System
-- Date: 2025-11-25

-- Create user_payment_history table
CREATE TABLE IF NOT EXISTS user_payment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Payment period (YYYY-MM format, e.g., "2024-11")
    payment_period VARCHAR(7) NOT NULL,

    -- Total cashback for this period
    total_cashback DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Thời gian đối soát (Reconciliation date)
    reconciliation_date TIMESTAMP,

    -- Thời gian thanh toán (Payment date)
    payment_date TIMESTAMP,

    -- Trạng thái thanh toán: 'pending', 'processing', 'paid', 'cancelled'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Payment method: 'bank_transfer', 'momo', 'zalopay', etc.
    payment_method VARCHAR(50),

    -- Additional payment details (JSON format)
    -- Example: {"bank_name": "Vietcombank", "account_number": "123456", "transaction_id": "TXN123"}
    payment_details JSONB,

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_user_payment_history_user_id ON user_payment_history(user_id);
CREATE INDEX idx_user_payment_history_payment_period ON user_payment_history(payment_period);
CREATE INDEX idx_user_payment_history_status ON user_payment_history(status);
CREATE INDEX idx_user_payment_history_user_period ON user_payment_history(user_id, payment_period);
CREATE INDEX idx_user_payment_history_reconciliation_date ON user_payment_history(reconciliation_date);
CREATE INDEX idx_user_payment_history_payment_date ON user_payment_history(payment_date);

-- Create unique constraint: one payment record per user per period
CREATE UNIQUE INDEX idx_unique_user_payment_period ON user_payment_history(user_id, payment_period);

-- Add trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_payment_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_payment_history_updated_at
    BEFORE UPDATE ON user_payment_history
    FOR EACH ROW
    EXECUTE FUNCTION update_user_payment_history_updated_at();

-- Add comments for documentation
COMMENT ON TABLE user_payment_history IS 'Lịch sử thanh toán của user theo kỳ đối soát';
COMMENT ON COLUMN user_payment_history.payment_period IS 'Kỳ đối soát (YYYY-MM format)';
COMMENT ON COLUMN user_payment_history.total_cashback IS 'Tổng cashback trong kỳ';
COMMENT ON COLUMN user_payment_history.reconciliation_date IS 'Thời gian đối soát';
COMMENT ON COLUMN user_payment_history.payment_date IS 'Thời gian thanh toán';
COMMENT ON COLUMN user_payment_history.status IS 'Trạng thái: pending, processing, paid, cancelled';
COMMENT ON COLUMN user_payment_history.payment_method IS 'Phương thức thanh toán';
COMMENT ON COLUMN user_payment_history.payment_details IS 'Chi tiết thanh toán (JSON)';
