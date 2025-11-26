-- Migration: Create user_payment_details table
-- Purpose: Track detailed payment breakdown by conversion for each payment period
-- Author: System
-- Date: 2025-11-25

-- Create user_payment_details table
CREATE TABLE IF NOT EXISTS user_payment_details (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to payment history
    payment_history_id UUID NOT NULL REFERENCES user_payment_history(id) ON DELETE CASCADE,

    -- Foreign key to conversion
    conversion_id UUID NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,

    -- Merchant information (denormalized for historical record)
    merchant_name VARCHAR(255) NOT NULL,

    -- Order code from conversion
    order_code VARCHAR(255),

    -- Cashback amount for this conversion
    cashback_amount DECIMAL(15,2) NOT NULL DEFAULT 0,

    -- Reconciliation month (YYYY-MM format)
    reconciliation_month VARCHAR(7),

    -- Payment month (YYYY-MM format)
    payment_month VARCHAR(7),

    -- Status: 'approved', 'rejected', 'pending', 'paid'
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- Additional metadata (JSON format)
    -- Example: {"commission_rate": 5.5, "original_amount": 1000000, "notes": "..."}
    metadata JSONB,

    -- Metadata
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_user_payment_details_payment_history_id ON user_payment_details(payment_history_id);
CREATE INDEX idx_user_payment_details_conversion_id ON user_payment_details(conversion_id);
CREATE INDEX idx_user_payment_details_merchant_name ON user_payment_details(merchant_name);
CREATE INDEX idx_user_payment_details_order_code ON user_payment_details(order_code);
CREATE INDEX idx_user_payment_details_status ON user_payment_details(status);
CREATE INDEX idx_user_payment_details_reconciliation_month ON user_payment_details(reconciliation_month);
CREATE INDEX idx_user_payment_details_payment_month ON user_payment_details(payment_month);

-- Create composite index for common queries
CREATE INDEX idx_user_payment_details_history_status ON user_payment_details(payment_history_id, status);

-- Create unique constraint: one detail record per conversion per payment history
CREATE UNIQUE INDEX idx_unique_payment_detail_conversion ON user_payment_details(payment_history_id, conversion_id);

-- Add comments for documentation
COMMENT ON TABLE user_payment_details IS 'Chi tiết thanh toán theo từng conversion trong mỗi kỳ';
COMMENT ON COLUMN user_payment_details.payment_history_id IS 'Tham chiếu đến user_payment_history';
COMMENT ON COLUMN user_payment_details.conversion_id IS 'Tham chiếu đến conversion';
COMMENT ON COLUMN user_payment_details.merchant_name IS 'Tên merchant (lưu lại để giữ lịch sử)';
COMMENT ON COLUMN user_payment_details.order_code IS 'Mã đơn hàng';
COMMENT ON COLUMN user_payment_details.cashback_amount IS 'Số tiền cashback cho conversion này';
COMMENT ON COLUMN user_payment_details.reconciliation_month IS 'Tháng đối soát (YYYY-MM)';
COMMENT ON COLUMN user_payment_details.payment_month IS 'Tháng thanh toán (YYYY-MM)';
COMMENT ON COLUMN user_payment_details.status IS 'Trạng thái: approved, rejected, pending, paid';
COMMENT ON COLUMN user_payment_details.metadata IS 'Metadata bổ sung (JSON)';
