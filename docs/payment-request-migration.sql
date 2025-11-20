-- ============================================
-- Payment Request Module - Database Migration
-- Version: 1.0.0
-- Date: 2025-11-19
-- Description: Creates tables for payment request system
-- ============================================

-- ============================================
-- 1. Create payment_requests table
-- ============================================

CREATE TABLE IF NOT EXISTS payment_requests (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- User Information
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Payment Amount
    requested_amount DECIMAL(15,2) NOT NULL CHECK (requested_amount >= 100000),

    -- Bank Information
    bank_name VARCHAR(255) NOT NULL,
    bank_account_number VARCHAR(50) NOT NULL,
    bank_account_name VARCHAR(255) NOT NULL,
    bank_branch VARCHAR(255),

    -- Status Workflow: pending -> confirmed/rejected -> paid (if confirmed)
    status VARCHAR(20) NOT NULL DEFAULT 'pending',

    -- User Notes
    notes TEXT,

    -- Admin Handling
    admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
    admin_notes TEXT,

    -- Transaction Reference
    transaction_reference VARCHAR(255),

    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    paid_at TIMESTAMP,
    rejected_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('pending', 'confirmed', 'paid', 'rejected')),
    CONSTRAINT valid_bank_account CHECK (LENGTH(bank_account_number) >= 6),
    CONSTRAINT paid_requires_transaction CHECK (
        (status = 'paid' AND transaction_reference IS NOT NULL) OR status != 'paid'
    ),
    CONSTRAINT rejected_requires_notes CHECK (
        (status = 'rejected' AND admin_notes IS NOT NULL) OR status != 'rejected'
    )
);

-- Indexes for payment_requests
CREATE INDEX idx_payment_requests_user_id ON payment_requests(user_id);
CREATE INDEX idx_payment_requests_status ON payment_requests(status);
CREATE INDEX idx_payment_requests_created_at ON payment_requests(created_at DESC);
CREATE INDEX idx_payment_requests_admin_id ON payment_requests(admin_id);
CREATE INDEX idx_payment_requests_user_status ON payment_requests(user_id, status);

-- Comment on table
COMMENT ON TABLE payment_requests IS 'Stores payment requests from users for cashback withdrawals';
COMMENT ON COLUMN payment_requests.status IS 'pending: awaiting admin approval, confirmed: admin approved, paid: money transferred, rejected: denied by admin';
COMMENT ON COLUMN payment_requests.requested_amount IS 'Amount user wants to withdraw, minimum 100,000 VND';

-- ============================================
-- 2. Create payment_reconciliation_mapping table
-- ============================================

CREATE TABLE IF NOT EXISTS payment_reconciliation_mapping (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    payment_request_id UUID NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
    reconciliation_id UUID NOT NULL REFERENCES reconciliations(id) ON DELETE RESTRICT,
    reconciliation_item_id UUID NOT NULL REFERENCES reconciliation_items(id) ON DELETE RESTRICT,

    -- Cashback Amount from this specific item
    cashback_amount DECIMAL(15,2) NOT NULL CHECK (cashback_amount > 0),

    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW(),

    -- Constraints: Each reconciliation_item can only be paid once
    CONSTRAINT unique_reconciliation_item UNIQUE(reconciliation_item_id)
);

-- Indexes for payment_reconciliation_mapping
CREATE INDEX idx_prm_payment_request ON payment_reconciliation_mapping(payment_request_id);
CREATE INDEX idx_prm_reconciliation ON payment_reconciliation_mapping(reconciliation_id);
CREATE INDEX idx_prm_reconciliation_item ON payment_reconciliation_mapping(reconciliation_item_id);

-- Comment on table
COMMENT ON TABLE payment_reconciliation_mapping IS 'Maps which reconciliation items have been paid through which payment requests';
COMMENT ON CONSTRAINT unique_reconciliation_item ON payment_reconciliation_mapping IS 'Ensures each reconciliation item is only paid once';

-- ============================================
-- 3. Create payment_request_logs table (Optional - for audit trail)
-- ============================================

CREATE TABLE IF NOT EXISTS payment_request_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_request_id UUID NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,

    -- Action Details
    action VARCHAR(50) NOT NULL, -- 'created', 'confirmed', 'rejected', 'paid', 'cancelled'
    old_status VARCHAR(20),
    new_status VARCHAR(20),

    -- Performed By
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
    performed_by_name VARCHAR(255),
    performed_by_email VARCHAR(255),

    -- Additional Info
    notes TEXT,
    metadata JSONB, -- Additional data like IP address, etc.

    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for payment_request_logs
CREATE INDEX idx_prl_payment_request ON payment_request_logs(payment_request_id);
CREATE INDEX idx_prl_created_at ON payment_request_logs(created_at DESC);

COMMENT ON TABLE payment_request_logs IS 'Audit log for all payment request status changes';

-- ============================================
-- 4. Create trigger for auto-updating updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_payment_request_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_payment_request_timestamp
    BEFORE UPDATE ON payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_request_updated_at();

-- ============================================
-- 5. Create trigger for auto-logging status changes
-- ============================================

CREATE OR REPLACE FUNCTION log_payment_request_status_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if status changed
    IF (TG_OP = 'UPDATE' AND OLD.status != NEW.status) THEN
        INSERT INTO payment_request_logs (
            payment_request_id,
            action,
            old_status,
            new_status,
            performed_by,
            notes,
            metadata
        ) VALUES (
            NEW.id,
            CASE NEW.status
                WHEN 'confirmed' THEN 'confirmed'
                WHEN 'rejected' THEN 'rejected'
                WHEN 'paid' THEN 'paid'
                ELSE 'status_changed'
            END,
            OLD.status,
            NEW.status,
            NEW.admin_id,
            NEW.admin_notes,
            jsonb_build_object(
                'transaction_reference', NEW.transaction_reference,
                'timestamp', NOW()
            )
        );
    ELSIF (TG_OP = 'INSERT') THEN
        INSERT INTO payment_request_logs (
            payment_request_id,
            action,
            new_status,
            performed_by,
            notes
        ) VALUES (
            NEW.id,
            'created',
            'pending',
            NEW.user_id,
            NEW.notes
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_log_payment_request_changes
    AFTER INSERT OR UPDATE ON payment_requests
    FOR EACH ROW
    EXECUTE FUNCTION log_payment_request_status_change();

-- ============================================
-- 6. Add reconciliation_logs table if not exists
-- ============================================

CREATE TABLE IF NOT EXISTS reconciliation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reconciliation_id UUID NOT NULL REFERENCES reconciliations(id) ON DELETE CASCADE,

    -- Action Details
    action VARCHAR(50) NOT NULL, -- 'created', 'confirmed', 'paid', 'cancelled', 'add_late_items', etc.

    -- Performed By
    performed_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Notes
    notes TEXT,

    -- Metadata
    metadata JSONB,

    -- Timestamp
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for reconciliation_logs
CREATE INDEX IF NOT EXISTS idx_rec_logs_reconciliation ON reconciliation_logs(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_rec_logs_created_at ON reconciliation_logs(created_at DESC);

COMMENT ON TABLE reconciliation_logs IS 'Audit log for reconciliation actions including late item additions';

-- ============================================
-- 7. Create useful views
-- ============================================

-- View: Payment requests with user info
CREATE OR REPLACE VIEW v_payment_requests_with_users AS
SELECT
    pr.*,
    u.full_name as user_name,
    u.email as user_email,
    u.phone as user_phone,
    admin.full_name as admin_name,
    admin.email as admin_email,
    -- Count of reconciliation items
    (SELECT COUNT(*) FROM payment_reconciliation_mapping
     WHERE payment_request_id = pr.id) as items_count,
    -- Total from mapping (should match requested_amount)
    (SELECT COALESCE(SUM(cashback_amount), 0)
     FROM payment_reconciliation_mapping
     WHERE payment_request_id = pr.id) as total_from_items
FROM payment_requests pr
LEFT JOIN users u ON pr.user_id = u.id
LEFT JOIN users admin ON pr.admin_id = admin.id;

COMMENT ON VIEW v_payment_requests_with_users IS 'Payment requests joined with user information';

-- View: Late reconciliation items
CREATE OR REPLACE VIEW v_late_reconciliation_items AS
SELECT
    c.id,
    c.order_code,
    c.user_id,
    u.full_name as user_name,
    u.email as user_email,
    c.merchant_name,
    c.order_amount,
    c.commission,
    c.cashback_amount,
    c.order_time,
    c.confirmed_time,
    TO_CHAR(c.order_time, 'YYYY-MM') as original_period,
    EXTRACT(DAY FROM (c.confirmed_time - c.order_time))::INTEGER as days_late
FROM conversions c
LEFT JOIN users u ON c.user_id = u.id
LEFT JOIN reconciliation_items ri ON c.id = ri.conversion_id
WHERE c.status = 'approved'
    AND c.is_confirmed = 1
    AND ri.id IS NULL  -- Not in any reconciliation yet
ORDER BY c.confirmed_time DESC;

COMMENT ON VIEW v_late_reconciliation_items IS 'Conversions that are confirmed but not yet in any reconciliation';

-- View: User available balance for payments
CREATE OR REPLACE VIEW v_user_available_balances AS
SELECT
    u.id as user_id,
    u.full_name,
    u.email,
    -- Total confirmed cashback
    COALESCE(SUM(ri.cashback_amount), 0) as total_confirmed_cashback,
    -- Total requested (pending + confirmed + paid)
    COALESCE((
        SELECT SUM(pr.requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = u.id
            AND pr.status IN ('pending', 'confirmed', 'paid')
    ), 0) as total_requested,
    -- Available balance
    COALESCE(SUM(ri.cashback_amount), 0) - COALESCE((
        SELECT SUM(pr.requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = u.id
            AND pr.status IN ('pending', 'confirmed', 'paid')
    ), 0) as available_balance,
    -- Has pending request
    EXISTS(
        SELECT 1 FROM payment_requests pr
        WHERE pr.user_id = u.id AND pr.status = 'pending'
    ) as has_pending_request,
    -- Is eligible (balance >= 100,000)
    (COALESCE(SUM(ri.cashback_amount), 0) - COALESCE((
        SELECT SUM(pr.requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = u.id
            AND pr.status IN ('pending', 'confirmed', 'paid')
    ), 0)) >= 100000 as is_eligible
FROM users u
LEFT JOIN reconciliation_items ri ON ri.user_id = u.id
LEFT JOIN reconciliations r ON ri.reconciliation_id = r.id
    AND r.status = 'confirmed'
    AND r.is_latest = true
GROUP BY u.id, u.full_name, u.email;

COMMENT ON VIEW v_user_available_balances IS 'User available balances for payment requests';

-- ============================================
-- 8. Create useful functions
-- ============================================

-- Function: Get order payment status
CREATE OR REPLACE FUNCTION get_order_payment_status(p_reconciliation_item_id UUID)
RETURNS TABLE (
    status VARCHAR(30),
    label VARCHAR(100),
    color VARCHAR(20),
    payment_request_id UUID,
    paid_date TIMESTAMP
) AS $$
BEGIN
    -- Check if in payment_reconciliation_mapping
    RETURN QUERY
    SELECT
        CASE pr.status
            WHEN 'paid' THEN 'paid'::VARCHAR(30)
            WHEN 'confirmed' THEN 'payment_confirmed'::VARCHAR(30)
            WHEN 'pending' THEN 'payment_pending'::VARCHAR(30)
            WHEN 'rejected' THEN 'payment_rejected'::VARCHAR(30)
        END as status,
        CASE pr.status
            WHEN 'paid' THEN 'Đã thanh toán'::VARCHAR(100)
            WHEN 'confirmed' THEN 'Đang xử lý thanh toán'::VARCHAR(100)
            WHEN 'pending' THEN 'Chờ duyệt thanh toán'::VARCHAR(100)
            WHEN 'rejected' THEN 'Yêu cầu thanh toán bị từ chối'::VARCHAR(100)
        END as label,
        CASE pr.status
            WHEN 'paid' THEN 'green'::VARCHAR(20)
            WHEN 'confirmed' THEN 'blue'::VARCHAR(20)
            WHEN 'pending' THEN 'orange'::VARCHAR(20)
            WHEN 'rejected' THEN 'red'::VARCHAR(20)
        END as color,
        pr.id as payment_request_id,
        pr.paid_at as paid_date
    FROM payment_reconciliation_mapping prm
    JOIN payment_requests pr ON prm.payment_request_id = pr.id
    WHERE prm.reconciliation_item_id = p_reconciliation_item_id
    LIMIT 1;

    -- If not found in payment mapping, check reconciliation status
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            CASE
                WHEN r.status = 'confirmed' THEN 'reconciled'::VARCHAR(30)
                ELSE 'not_reconciled'::VARCHAR(30)
            END as status,
            CASE
                WHEN r.status = 'confirmed' THEN 'Đã đối soát - Chưa tạo yêu cầu thanh toán'::VARCHAR(100)
                ELSE 'Chưa đối soát'::VARCHAR(100)
            END as label,
            'gray'::VARCHAR(20) as color,
            NULL::UUID as payment_request_id,
            NULL::TIMESTAMP as paid_date
        FROM reconciliation_items ri
        LEFT JOIN reconciliations r ON ri.reconciliation_id = r.id
        WHERE ri.id = p_reconciliation_item_id
        LIMIT 1;
    END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_order_payment_status IS 'Returns payment status information for a reconciliation item';

-- ============================================
-- 9. Insert initial data (if needed)
-- ============================================

-- No initial data needed for this module

-- ============================================
-- 10. Grant permissions
-- ============================================

-- Grant permissions to application user (adjust username as needed)
-- GRANT SELECT, INSERT, UPDATE ON payment_requests TO your_app_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON payment_reconciliation_mapping TO your_app_user;
-- GRANT SELECT, INSERT ON payment_request_logs TO your_app_user;
-- GRANT SELECT ON v_payment_requests_with_users TO your_app_user;
-- GRANT SELECT ON v_late_reconciliation_items TO your_app_user;
-- GRANT SELECT ON v_user_available_balances TO your_app_user;

-- ============================================
-- Migration Complete
-- ============================================

-- Verification queries:
-- SELECT COUNT(*) FROM payment_requests;
-- SELECT COUNT(*) FROM payment_reconciliation_mapping;
-- SELECT * FROM v_late_reconciliation_items LIMIT 10;
-- SELECT * FROM v_user_available_balances WHERE available_balance >= 100000;
