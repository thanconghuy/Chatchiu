-- =====================================================
-- Payment Module Database Optimization - Indexes (MINIMAL VERSION)
-- Created: 2026-01-02
-- Purpose: Minimal safe indexes for payment optimization
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

-- Index for user_id lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_user_id
ON payment_requests(user_id);

-- Index for created_at sorting
CREATE INDEX IF NOT EXISTS idx_payment_requests_created_at
ON payment_requests(created_at DESC);

-- =====================================================
-- 2. SYSTEM CONVERSIONS INDEXES
-- =====================================================

-- Index for user conversions
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_id
ON system_conversions(user_id);

-- Index for user and order time
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_order
ON system_conversions(user_id, order_time DESC);

-- =====================================================
-- 3. SYSTEM RECONCILIATION ITEMS INDEXES
-- =====================================================

-- Index for user's items
CREATE INDEX IF NOT EXISTS idx_system_recon_items_user_id
ON system_reconciliation_items(user_id);

-- Index for user's items by order time (FIFO)
CREATE INDEX IF NOT EXISTS idx_system_recon_items_user_order
ON system_reconciliation_items(user_id, order_time ASC);

-- =====================================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- =====================================================

ANALYZE payment_requests;
ANALYZE system_conversions;
ANALYZE system_reconciliation_items;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

-- If you see this, indexes were created successfully!
SELECT 'Payment optimization indexes created successfully!' as status;
