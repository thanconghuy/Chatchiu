-- =====================================================
-- Payment Module Database Optimization - Indexes (FINAL)
-- Created: 2026-01-02
-- Based on actual schema from database
-- =====================================================

-- =====================================================
-- 1. PAYMENT REQUESTS TABLE INDEXES
-- =====================================================

-- Index for user's payment requests lookup (most common query)
CREATE INDEX IF NOT EXISTS idx_payment_requests_user_status
ON payment_requests(user_id, status, created_at DESC)
WHERE cancelled_at IS NULL;

-- Index for admin list view with filters
CREATE INDEX IF NOT EXISTS idx_payment_requests_status_created
ON payment_requests(status, created_at DESC)
WHERE cancelled_at IS NULL;

-- Index for cancelled requests
CREATE INDEX IF NOT EXISTS idx_payment_requests_cancelled
ON payment_requests(cancelled_at DESC)
WHERE cancelled_at IS NOT NULL;

-- Index for admin assignment lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_admin
ON payment_requests(admin_id, status, created_at DESC);

-- Index for user_id lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_user_id
ON payment_requests(user_id);

-- Index for created_at sorting
CREATE INDEX IF NOT EXISTS idx_payment_requests_created_at
ON payment_requests(created_at DESC);

-- Index for transaction reference lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_transaction_ref
ON payment_requests(transaction_reference)
WHERE transaction_reference IS NOT NULL;

-- =====================================================
-- 2. SYSTEM CONVERSIONS INDEXES
-- =====================================================

-- Index for user conversions
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_id
ON system_conversions(user_id);

-- Index for user and order time (FIFO)
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_order
ON system_conversions(user_id, order_time DESC);

-- Index for payment status tracking
CREATE INDEX IF NOT EXISTS idx_system_conversions_payment_status
ON system_conversions(user_id, payment_status)
WHERE payment_status IS NOT NULL;

-- Index for payment request linking
CREATE INDEX IF NOT EXISTS idx_system_conversions_payment_request
ON system_conversions(payment_request_id)
WHERE payment_request_id IS NOT NULL;

-- Index for system reconciliation status
CREATE INDEX IF NOT EXISTS idx_system_conversions_recon_status
ON system_conversions(system_reconciliation_status, user_id);

-- Index for system reconciliation id
CREATE INDEX IF NOT EXISTS idx_system_conversions_recon_id
ON system_conversions(system_reconciliation_id)
WHERE system_reconciliation_id IS NOT NULL;

-- =====================================================
-- 3. SYSTEM RECONCILIATION ITEMS INDEXES
-- =====================================================

-- Index for user's items
CREATE INDEX IF NOT EXISTS idx_system_recon_items_user_id
ON system_reconciliation_items(user_id);

-- Index for user's items by order time (FIFO selection)
CREATE INDEX IF NOT EXISTS idx_system_recon_items_user_order
ON system_reconciliation_items(user_id, order_time ASC);

-- Index for reconciliation period lookup
CREATE INDEX IF NOT EXISTS idx_system_recon_items_recon_id
ON system_reconciliation_items(system_reconciliation_id, user_id);

-- Index for conversion lookup
CREATE INDEX IF NOT EXISTS idx_system_recon_items_conversion
ON system_reconciliation_items(conversion_id);

-- Index for API reconciliation
CREATE INDEX IF NOT EXISTS idx_system_recon_items_api_recon
ON system_reconciliation_items(api_reconciliation_id)
WHERE api_reconciliation_id IS NOT NULL;

-- Index for high risk items
CREATE INDEX IF NOT EXISTS idx_system_recon_items_high_risk
ON system_reconciliation_items(is_high_risk, user_id)
WHERE is_high_risk = true;

-- =====================================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- =====================================================

ANALYZE payment_requests;
ANALYZE system_conversions;
ANALYZE system_reconciliation_items;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================

-- Count indexes created
SELECT COUNT(*) as total_indexes_created
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexname LIKE 'idx_payment%' OR indexname LIKE 'idx_system%');

-- Success message
SELECT '✅ Payment optimization indexes created successfully!' as status;
