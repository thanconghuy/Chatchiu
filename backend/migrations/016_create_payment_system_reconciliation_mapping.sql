-- ============================================
-- Payment System Reconciliation Mapping
-- Version: 1.0.0
-- Date: 2025-11-23
-- Description: Maps payment requests to system reconciliation items
-- ============================================

-- ============================================
-- Create payment_system_reconciliation_mapping table
-- ============================================

CREATE TABLE IF NOT EXISTS payment_system_reconciliation_mapping (
    -- Primary Key
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign Keys
    payment_request_id UUID NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
    system_reconciliation_id UUID NOT NULL REFERENCES system_reconciliations(id) ON DELETE RESTRICT,
    system_reconciliation_item_id UUID NOT NULL REFERENCES system_reconciliation_items(id) ON DELETE RESTRICT,
    conversion_id UUID NOT NULL REFERENCES conversions(id) ON DELETE RESTRICT,

    -- User (denormalized for quick lookup)
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Cashback Amount from this specific item
    cashback_amount DECIMAL(15,2) NOT NULL CHECK (cashback_amount > 0),

    -- Order details (snapshot for reference)
    merchant_name VARCHAR(255),
    order_time TIMESTAMPTZ,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Constraints: Each system_reconciliation_item can only be paid once
    CONSTRAINT unique_system_reconciliation_item UNIQUE(system_reconciliation_item_id)
);

-- Indexes for payment_system_reconciliation_mapping
CREATE INDEX idx_psrm_payment_request ON payment_system_reconciliation_mapping(payment_request_id);
CREATE INDEX idx_psrm_system_reconciliation ON payment_system_reconciliation_mapping(system_reconciliation_id);
CREATE INDEX idx_psrm_system_reconciliation_item ON payment_system_reconciliation_mapping(system_reconciliation_item_id);
CREATE INDEX idx_psrm_conversion ON payment_system_reconciliation_mapping(conversion_id);
CREATE INDEX idx_psrm_user ON payment_system_reconciliation_mapping(user_id);
CREATE INDEX idx_psrm_created_at ON payment_system_reconciliation_mapping(created_at DESC);

-- Comment on table
COMMENT ON TABLE payment_system_reconciliation_mapping IS 'Maps which system reconciliation items have been paid through which payment requests';
COMMENT ON CONSTRAINT unique_system_reconciliation_item ON payment_system_reconciliation_mapping IS 'Ensures each system reconciliation item is only paid once';

-- ============================================
-- Create view for payment details with items
-- ============================================

CREATE OR REPLACE VIEW v_payment_requests_with_items AS
SELECT
    pr.id as payment_request_id,
    pr.user_id,
    u.username,
    u.email,
    u.full_name,
    pr.requested_amount,
    pr.bank_name,
    pr.bank_account_number,
    pr.bank_account_name,
    pr.status,
    pr.created_at,
    pr.confirmed_at,
    pr.paid_at,
    pr.rejected_at,

    -- Aggregated items info
    COUNT(psrm.id) as items_count,
    COALESCE(SUM(psrm.cashback_amount), 0) as total_items_cashback,

    -- Items details (JSON array)
    COALESCE(
        json_agg(
            json_build_object(
                'item_id', psrm.id,
                'conversion_id', psrm.conversion_id,
                'cashback_amount', psrm.cashback_amount,
                'merchant_name', psrm.merchant_name,
                'order_time', psrm.order_time
            ) ORDER BY psrm.order_time DESC
        ) FILTER (WHERE psrm.id IS NOT NULL),
        '[]'::json
    ) as items

FROM payment_requests pr
LEFT JOIN users u ON pr.user_id = u.id
LEFT JOIN payment_system_reconciliation_mapping psrm ON pr.id = psrm.payment_request_id
GROUP BY pr.id, u.username, u.email, u.full_name;

COMMENT ON VIEW v_payment_requests_with_items IS 'Payment requests with aggregated items information';

-- ============================================
-- Function: Get available system reconciliation items for user
-- Returns items that have been finalized but not yet paid
-- ============================================

CREATE OR REPLACE FUNCTION get_available_system_recon_items_for_user(p_user_id UUID)
RETURNS TABLE (
    item_id UUID,
    system_reconciliation_id UUID,
    conversion_id UUID,
    cashback_amount DECIMAL(15,2),
    merchant_name VARCHAR(255),
    order_time TIMESTAMPTZ,
    reconciliation_period_label VARCHAR(50),
    reconciliation_status VARCHAR(30)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sri.id,
        sri.system_reconciliation_id,
        sri.conversion_id,
        sri.cashback_amount,
        sri.merchant_name,
        sri.order_time,
        sr.period_label,
        sr.status
    FROM system_reconciliation_items sri
    INNER JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
    WHERE sri.user_id = p_user_id
      -- Only finalized or paid reconciliations
      AND sr.status IN ('finalized', 'paid')
      -- Only approved conversions
      AND sri.conversion_status = 'approved'
      -- Not yet paid (not in payment mapping)
      AND NOT EXISTS (
          SELECT 1 FROM payment_system_reconciliation_mapping psrm
          WHERE psrm.system_reconciliation_item_id = sri.id
      )
    ORDER BY sri.order_time DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_available_system_recon_items_for_user IS 'Returns unpaid system reconciliation items available for payment request';

-- ============================================
-- Function: Calculate available balance for user from system reconciliation
-- ============================================

CREATE OR REPLACE FUNCTION calculate_user_available_balance_from_system_recon(p_user_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    v_total_available DECIMAL(15,2);
BEGIN
    SELECT COALESCE(SUM(sri.cashback_amount), 0)
    INTO v_total_available
    FROM system_reconciliation_items sri
    INNER JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
    WHERE sri.user_id = p_user_id
      AND sr.status IN ('finalized', 'paid')
      AND sri.conversion_status = 'approved'
      AND NOT EXISTS (
          SELECT 1 FROM payment_system_reconciliation_mapping psrm
          WHERE psrm.system_reconciliation_item_id = sri.id
      );

    RETURN COALESCE(v_total_available, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_user_available_balance_from_system_recon IS 'Calculates user available balance from unpaid finalized system reconciliation items';
