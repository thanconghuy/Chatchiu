-- Migration: Create system reconciliation tables
-- Description: Internal reconciliation system for faster cashback payout
-- Date: 2025-11-21
-- Strategy: Month + 15 days reconciliation vs API 65-105 days reconciliation

-- =====================================================
-- 1. SYSTEM RECONCILIATIONS TABLE
-- Tracks internal reconciliation periods (faster than API)
-- =====================================================
CREATE TABLE IF NOT EXISTS system_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Period info
  period_label VARCHAR(50) NOT NULL,           -- e.g., "Tháng 10/2025"
  period_start DATE NOT NULL,                   -- Start of order month
  period_end DATE NOT NULL,                     -- End of order month
  reconciliation_date DATE NOT NULL,            -- Period end + 15 days

  -- Stats
  total_orders INTEGER DEFAULT 0,               -- Total approved orders in period
  total_users INTEGER DEFAULT 0,                -- Number of users with approved orders
  total_cashback DECIMAL(15,2) DEFAULT 0,       -- Total cashback to be paid
  approved_orders INTEGER DEFAULT 0,            -- Orders approved by AccessTrade
  pending_orders INTEGER DEFAULT 0,             -- Orders still pending in API
  rejected_orders INTEGER DEFAULT 0,            -- Orders rejected by API

  -- Risk management
  estimated_approval_rate DECIMAL(5,2),         -- Historical approval rate (e.g., 85.5%)
  reserved_amount DECIMAL(15,2),                -- Amount reserved for potential rejections

  -- Status
  status VARCHAR(30) NOT NULL DEFAULT 'draft',  -- draft, finalized, paid, cancelled

  -- Metadata
  created_by UUID REFERENCES users(id),
  performed_by UUID REFERENCES users(id),
  notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  finalized_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_period CHECK (period_end >= period_start),
  CONSTRAINT valid_reconciliation_date CHECK (reconciliation_date > period_end),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'finalized', 'paid', 'cancelled'))
);

-- =====================================================
-- 2. SYSTEM RECONCILIATION ITEMS TABLE
-- Links conversions to system reconciliation periods
-- =====================================================
CREATE TABLE IF NOT EXISTS system_reconciliation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Relationships
  system_reconciliation_id UUID NOT NULL REFERENCES system_reconciliations(id) ON DELETE CASCADE,
  conversion_id UUID NOT NULL REFERENCES conversions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),

  -- Order details (snapshot from conversion)
  merchant_id VARCHAR(50) NOT NULL,
  merchant_name VARCHAR(255),
  order_time TIMESTAMPTZ NOT NULL,
  approval_time TIMESTAMPTZ,

  -- Financial
  order_value DECIMAL(15,2),
  commission_amount DECIMAL(15,2) NOT NULL,
  cashback_amount DECIMAL(15,2) NOT NULL,      -- Amount user will receive

  -- Status tracking
  conversion_status VARCHAR(50) NOT NULL,       -- approved, pending, rejected
  api_reconciled BOOLEAN DEFAULT FALSE,         -- Has API confirmed this?
  api_reconciliation_id UUID REFERENCES reconciliations(id),

  -- Risk flags
  is_high_risk BOOLEAN DEFAULT FALSE,           -- Flag suspicious orders
  risk_score DECIMAL(5,2),                      -- 0-100 risk score
  risk_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  reconciled_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT unique_conversion_per_reconciliation UNIQUE(system_reconciliation_id, conversion_id)
);

-- =====================================================
-- 3. SYSTEM RECONCILIATION LOGS TABLE
-- Audit trail for reconciliation actions
-- =====================================================
CREATE TABLE IF NOT EXISTS system_reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  system_reconciliation_id UUID NOT NULL REFERENCES system_reconciliations(id) ON DELETE CASCADE,

  action VARCHAR(50) NOT NULL,                  -- created, finalized, paid, adjusted, cancelled
  performed_by UUID REFERENCES users(id),

  -- Change details
  old_status VARCHAR(30),
  new_status VARCHAR(30),
  old_total_cashback DECIMAL(15,2),
  new_total_cashback DECIMAL(15,2),

  reason TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 4. USER SYSTEM BALANCE TABLE
-- Tracks user balance from system reconciliation (separate from API balance)
-- =====================================================
CREATE TABLE IF NOT EXISTS user_system_balance (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Balance tracking
  available_balance DECIMAL(15,2) DEFAULT 0,    -- Can be withdrawn
  pending_balance DECIMAL(15,2) DEFAULT 0,      -- In current reconciliation period
  reserved_balance DECIMAL(15,2) DEFAULT 0,     -- Reserved for risk

  -- Stats
  total_earned DECIMAL(15,2) DEFAULT 0,         -- Lifetime earnings
  total_withdrawn DECIMAL(15,2) DEFAULT 0,      -- Lifetime withdrawals

  -- Timestamps
  last_reconciliation_date DATE,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

  -- Constraints
  CONSTRAINT non_negative_available CHECK (available_balance >= 0),
  CONSTRAINT non_negative_pending CHECK (pending_balance >= 0)
);

-- =====================================================
-- INDEXES
-- =====================================================

-- System Reconciliations
CREATE INDEX idx_system_reconciliations_period ON system_reconciliations(period_start, period_end);
CREATE INDEX idx_system_reconciliations_status ON system_reconciliations(status);
CREATE INDEX idx_system_reconciliations_reconciliation_date ON system_reconciliations(reconciliation_date);

-- System Reconciliation Items
CREATE INDEX idx_system_recon_items_reconciliation ON system_reconciliation_items(system_reconciliation_id);
CREATE INDEX idx_system_recon_items_user ON system_reconciliation_items(user_id);
CREATE INDEX idx_system_recon_items_conversion ON system_reconciliation_items(conversion_id);
CREATE INDEX idx_system_recon_items_status ON system_reconciliation_items(conversion_status);
CREATE INDEX idx_system_recon_items_api_reconciled ON system_reconciliation_items(api_reconciled);
CREATE INDEX idx_system_recon_items_order_time ON system_reconciliation_items(order_time);

-- System Reconciliation Logs
CREATE INDEX idx_system_recon_logs_reconciliation ON system_reconciliation_logs(system_reconciliation_id);
CREATE INDEX idx_system_recon_logs_action ON system_reconciliation_logs(action);
CREATE INDEX idx_system_recon_logs_created ON system_reconciliation_logs(created_at DESC);

-- User System Balance
CREATE INDEX idx_user_system_balance_available ON user_system_balance(available_balance);
CREATE INDEX idx_user_system_balance_last_recon ON user_system_balance(last_reconciliation_date);

-- =====================================================
-- VIEWS
-- =====================================================

-- View: Detailed reconciliation items with user info
CREATE OR REPLACE VIEW v_system_reconciliation_items_detailed AS
SELECT
  sri.id,
  sri.system_reconciliation_id,
  sri.conversion_id,
  sri.user_id,
  u.full_name as user_name,
  u.email as user_email,
  sri.merchant_id,
  sri.merchant_name,
  sri.order_time,
  sri.approval_time,
  sri.order_value,
  sri.commission_amount,
  sri.cashback_amount,
  sri.conversion_status,
  sri.api_reconciled,
  sri.api_reconciliation_id,
  sri.is_high_risk,
  sri.risk_score,
  sr.period_label,
  sr.period_start,
  sr.period_end,
  sr.status as reconciliation_status,
  sri.created_at,
  sri.reconciled_at
FROM system_reconciliation_items sri
LEFT JOIN users u ON sri.user_id = u.id
LEFT JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id;

-- View: User balance summary
CREATE OR REPLACE VIEW v_user_system_balance_summary AS
SELECT
  usb.user_id,
  u.full_name,
  u.email,
  u.username,
  usb.available_balance,
  usb.pending_balance,
  usb.reserved_balance,
  usb.total_earned,
  usb.total_withdrawn,
  (usb.total_earned - usb.total_withdrawn) as net_balance,
  usb.last_reconciliation_date,
  usb.updated_at,
  -- Count stats
  (SELECT COUNT(*) FROM system_reconciliation_items WHERE user_id = usb.user_id AND conversion_status = 'approved') as total_approved_orders,
  (SELECT COUNT(*) FROM system_reconciliation_items WHERE user_id = usb.user_id AND conversion_status = 'pending') as total_pending_orders
FROM user_system_balance usb
LEFT JOIN users u ON usb.user_id = u.id;

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function: Calculate user's eligible balance for withdrawal
CREATE OR REPLACE FUNCTION get_user_withdrawable_balance(p_user_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
  v_balance DECIMAL(15,2);
BEGIN
  SELECT COALESCE(available_balance, 0)
  INTO v_balance
  FROM user_system_balance
  WHERE user_id = p_user_id;

  RETURN COALESCE(v_balance, 0);
END;
$$ LANGUAGE plpgsql;

-- Function: Get reconciliation summary
CREATE OR REPLACE FUNCTION get_system_reconciliation_summary(p_reconciliation_id UUID)
RETURNS TABLE (
  total_users BIGINT,
  total_orders BIGINT,
  total_cashback DECIMAL(15,2),
  approved_count BIGINT,
  pending_count BIGINT,
  rejected_count BIGINT,
  high_risk_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT user_id)::BIGINT,
    COUNT(*)::BIGINT,
    COALESCE(SUM(cashback_amount), 0),
    COUNT(CASE WHEN conversion_status = 'approved' THEN 1 END)::BIGINT,
    COUNT(CASE WHEN conversion_status = 'pending' THEN 1 END)::BIGINT,
    COUNT(CASE WHEN conversion_status = 'rejected' THEN 1 END)::BIGINT,
    COUNT(CASE WHEN is_high_risk = TRUE THEN 1 END)::BIGINT
  FROM system_reconciliation_items
  WHERE system_reconciliation_id = p_reconciliation_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Auto-update user_system_balance.updated_at
CREATE OR REPLACE FUNCTION update_user_system_balance_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_system_balance_timestamp
BEFORE UPDATE ON user_system_balance
FOR EACH ROW
EXECUTE FUNCTION update_user_system_balance_timestamp();

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON TABLE system_reconciliations IS 'Internal reconciliation periods - faster than API (month + 15 days vs 65-105 days)';
COMMENT ON TABLE system_reconciliation_items IS 'Orders included in each system reconciliation period';
COMMENT ON TABLE system_reconciliation_logs IS 'Audit trail for reconciliation actions';
COMMENT ON TABLE user_system_balance IS 'User balance from system reconciliation (separate from API balance)';

COMMENT ON COLUMN system_reconciliations.reconciliation_date IS 'Date when reconciliation is performed (period_end + 15 days)';
COMMENT ON COLUMN system_reconciliations.estimated_approval_rate IS 'Historical approval rate to estimate risk';
COMMENT ON COLUMN system_reconciliations.reserved_amount IS 'Amount reserved based on risk calculation';
COMMENT ON COLUMN system_reconciliation_items.api_reconciled IS 'TRUE if confirmed by API reconciliation later';
COMMENT ON COLUMN system_reconciliation_items.is_high_risk IS 'Flag for suspicious orders (new user, high value, etc.)';
