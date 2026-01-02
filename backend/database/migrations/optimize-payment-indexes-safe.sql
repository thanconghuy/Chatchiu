-- =====================================================
-- Payment Module Database Optimization - Indexes (SAFE VERSION)
-- Created: 2026-01-02
-- Purpose: Only create indexes for verified tables/columns
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

-- Composite index for date range queries with status
CREATE INDEX IF NOT EXISTS idx_payment_requests_created_status
ON payment_requests(created_at DESC, status)
WHERE cancelled_at IS NULL;

-- Index for transaction reference lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_transaction_ref
ON payment_requests(transaction_reference)
WHERE transaction_reference IS NOT NULL;

-- Index for user_id lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_user_id
ON payment_requests(user_id);

-- =====================================================
-- 2. SYSTEM CONVERSIONS INDEXES (Payment related)
-- =====================================================

-- Index for user conversions with order time
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_order
ON system_conversions(user_id, order_time DESC);

-- Index for user and conversion_id lookup
CREATE INDEX IF NOT EXISTS idx_system_conversions_user_conversion
ON system_conversions(user_id, conversion_id);

-- =====================================================
-- 3. SYSTEM RECONCILIATION ITEMS INDEXES
-- =====================================================

-- Index for user's items by order time (FIFO)
CREATE INDEX IF NOT EXISTS idx_system_recon_items_user_order
ON system_reconciliation_items(user_id, order_time ASC);

-- Composite for reconciliation period lookup
CREATE INDEX IF NOT EXISTS idx_system_recon_items_period_user
ON system_reconciliation_items(system_reconciliation_id, user_id);

-- =====================================================
-- 4. SYSTEM RECONCILIATIONS INDEXES
-- =====================================================

-- Index for period lookup
CREATE INDEX IF NOT EXISTS idx_system_reconciliations_period
ON system_reconciliations(period_start DESC, period_end DESC);

-- Index for status
CREATE INDEX IF NOT EXISTS idx_system_reconciliations_status
ON system_reconciliations(status);

-- =====================================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- =====================================================

ANALYZE payment_requests;
ANALYZE system_conversions;
ANALYZE system_reconciliation_items;
ANALYZE system_reconciliations;

-- =====================================================
-- VERIFICATION QUERY
-- =====================================================

-- Run this after to verify indexes were created:
-- SELECT
--   schemaname,
--   tablename,
--   indexname
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;
