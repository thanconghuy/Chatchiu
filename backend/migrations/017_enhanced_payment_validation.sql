-- ============================================
-- Enhanced Payment Validation
-- Version: 1.0.0
-- Date: 2025-11-23
-- Description: Add database-level validation for payment balance
-- ============================================

-- ============================================
-- Function: Get and Lock Available Items (prevents race conditions)
-- Uses SELECT FOR UPDATE to lock rows
-- ============================================

CREATE OR REPLACE FUNCTION get_and_lock_available_items_for_payment(
    p_user_id UUID,
    p_requested_amount DECIMAL(15,2)
)
RETURNS TABLE (
    item_id UUID,
    system_reconciliation_id UUID,
    conversion_id UUID,
    cashback_amount DECIMAL(15,2),
    merchant_name VARCHAR(255),
    order_time TIMESTAMPTZ,
    reconciliation_period_label VARCHAR(50)
) AS $$
DECLARE
    v_current_total DECIMAL(15,2) := 0;
BEGIN
    -- Return items in FIFO order (oldest first)
    -- Lock them to prevent concurrent modifications
    RETURN QUERY
    SELECT
        sri.id,
        sri.system_reconciliation_id,
        sri.conversion_id,
        sri.cashback_amount,
        sri.merchant_name,
        sri.order_time,
        sr.period_label
    FROM system_reconciliation_items sri
    INNER JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
    WHERE sri.user_id = p_user_id
      AND sr.status IN ('finalized', 'paid')
      AND sri.conversion_status = 'approved'
      AND NOT EXISTS (
          SELECT 1 FROM payment_system_reconciliation_mapping psrm
          WHERE psrm.system_reconciliation_item_id = sri.id
      )
    ORDER BY sri.order_time ASC
    FOR UPDATE OF sri SKIP LOCKED; -- Lock selected items, skip already locked ones
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_and_lock_available_items_for_payment IS 'Get and lock available items for payment (prevents race conditions with SELECT FOR UPDATE)';

-- ============================================
-- Function: Validate Payment Request Creation
-- Returns detailed validation result
-- ============================================

CREATE OR REPLACE FUNCTION validate_payment_request_creation(
    p_user_id UUID,
    p_requested_amount DECIMAL(15,2)
)
RETURNS TABLE (
    is_valid BOOLEAN,
    error_code VARCHAR(50),
    error_message TEXT,
    available_balance DECIMAL(15,2),
    has_pending_request BOOLEAN,
    min_amount DECIMAL(15,2)
) AS $$
DECLARE
    v_available_balance DECIMAL(15,2);
    v_pending_count INTEGER;
    v_min_amount DECIMAL(15,2) := 100000; -- 100,000 VND
BEGIN
    -- Calculate available balance
    v_available_balance := calculate_user_available_balance_from_system_recon(p_user_id);

    -- Check pending requests
    SELECT COUNT(*) INTO v_pending_count
    FROM payment_requests
    WHERE user_id = p_user_id
      AND status = 'pending';

    -- Validation: Has pending request
    IF v_pending_count > 0 THEN
        RETURN QUERY SELECT
            FALSE,
            'HAS_PENDING_REQUEST'::VARCHAR(50),
            'Bạn đã có yêu cầu thanh toán đang chờ xử lý'::TEXT,
            v_available_balance,
            TRUE,
            v_min_amount;
        RETURN;
    END IF;

    -- Validation: Below minimum amount
    IF p_requested_amount < v_min_amount THEN
        RETURN QUERY SELECT
            FALSE,
            'BELOW_MIN_AMOUNT'::VARCHAR(50),
            format('Số tiền tối thiểu là %s VND', v_min_amount::TEXT)::TEXT,
            v_available_balance,
            FALSE,
            v_min_amount;
        RETURN;
    END IF;

    -- Validation: Insufficient balance
    IF v_available_balance < p_requested_amount THEN
        RETURN QUERY SELECT
            FALSE,
            'INSUFFICIENT_BALANCE'::VARCHAR(50),
            format('Số dư khả dụng: %s VND, Yêu cầu: %s VND',
                   v_available_balance::TEXT,
                   p_requested_amount::TEXT)::TEXT,
            v_available_balance,
            FALSE,
            v_min_amount;
        RETURN;
    END IF;

    -- All validations passed
    RETURN QUERY SELECT
        TRUE,
        NULL::VARCHAR(50),
        NULL::TEXT,
        v_available_balance,
        FALSE,
        v_min_amount;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_payment_request_creation IS 'Validates payment request before creation with detailed error codes';

-- ============================================
-- Function: Verify Items Still Available (double-check before linking)
-- ============================================

CREATE OR REPLACE FUNCTION verify_items_still_available(
    p_item_ids UUID[]
)
RETURNS TABLE (
    all_available BOOLEAN,
    unavailable_items UUID[],
    error_message TEXT
) AS $$
DECLARE
    v_unavailable_items UUID[];
BEGIN
    -- Find items that are already linked
    SELECT ARRAY_AGG(psrm.system_reconciliation_item_id)
    INTO v_unavailable_items
    FROM payment_system_reconciliation_mapping psrm
    WHERE psrm.system_reconciliation_item_id = ANY(p_item_ids);

    -- Check if any items are unavailable
    IF v_unavailable_items IS NOT NULL AND array_length(v_unavailable_items, 1) > 0 THEN
        RETURN QUERY SELECT
            FALSE,
            v_unavailable_items,
            format('Có %s item đã được thanh toán bởi request khác',
                   array_length(v_unavailable_items, 1)::TEXT)::TEXT;
        RETURN;
    END IF;

    -- All items available
    RETURN QUERY SELECT
        TRUE,
        NULL::UUID[],
        NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION verify_items_still_available IS 'Double-check items are still available before linking (race condition protection)';

-- ============================================
-- Table: Payment Validation Audit Log
-- Track all validation attempts for debugging and security
-- ============================================

CREATE TABLE IF NOT EXISTS payment_validation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Request info
    user_id UUID NOT NULL REFERENCES users(id),
    requested_amount DECIMAL(15,2) NOT NULL,

    -- Validation result
    validation_passed BOOLEAN NOT NULL,
    error_code VARCHAR(50),
    error_message TEXT,

    -- Context
    available_balance DECIMAL(15,2),
    selected_items_count INTEGER,
    selected_items_total DECIMAL(15,2),

    -- Payment request (if created)
    payment_request_id UUID REFERENCES payment_requests(id),

    -- Metadata
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_payment_validation_audit_user ON payment_validation_audit_log(user_id);
CREATE INDEX idx_payment_validation_audit_created ON payment_validation_audit_log(created_at DESC);
CREATE INDEX idx_payment_validation_audit_passed ON payment_validation_audit_log(validation_passed);
CREATE INDEX idx_payment_validation_audit_error_code ON payment_validation_audit_log(error_code);

COMMENT ON TABLE payment_validation_audit_log IS 'Audit log for all payment validation attempts';

-- ============================================
-- Trigger: Log validation attempts
-- ============================================

CREATE OR REPLACE FUNCTION log_payment_validation()
RETURNS TRIGGER AS $$
BEGIN
    -- Log to audit table (basic info)
    -- Detailed logging will be done in application layer
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Detailed audit logging will be implemented in the service layer
-- to include more context (IP, user agent, selected items details)
