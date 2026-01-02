-- =====================================================
-- Payment Module Database Optimization - Indexes
-- Created: 2026-01-02
-- Purpose: Add performance indexes for payment module
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

-- =====================================================
-- 2. PAYMENT RECONCILIATION MAPPING INDEXES
-- =====================================================

-- Index for payment to items lookup (most frequent)
CREATE INDEX IF NOT EXISTS idx_payment_recon_mapping_payment
ON payment_reconciliation_mapping(payment_request_id);

-- Index for reconciliation item to payment lookup
CREATE INDEX IF NOT EXISTS idx_payment_recon_mapping_item
ON payment_reconciliation_mapping(reconciliation_item_id);

-- Composite for amount aggregation queries
CREATE INDEX IF NOT EXISTS idx_payment_recon_mapping_amount
ON payment_reconciliation_mapping(payment_request_id, cashback_amount);

-- =====================================================
-- 3. PAYMENT SYSTEM RECONCILIATION MAPPING INDEXES
-- =====================================================

-- Index for payment to system items lookup
CREATE INDEX IF NOT EXISTS idx_payment_system_recon_mapping_payment
ON payment_system_reconciliation_mapping(payment_request_id);

-- Index for system reconciliation item lookup
CREATE INDEX IF NOT EXISTS idx_payment_system_recon_mapping_item
ON payment_system_reconciliation_mapping(system_reconciliation_item_id);

-- Index for user's linked items
CREATE INDEX IF NOT EXISTS idx_payment_system_recon_mapping_user
ON payment_system_reconciliation_mapping(user_id, payment_request_id);

-- Composite for amount aggregation
CREATE INDEX IF NOT EXISTS idx_payment_system_recon_mapping_amount
ON payment_system_reconciliation_mapping(payment_request_id, cashback_amount);

-- Index for conversion tracking
CREATE INDEX IF NOT EXISTS idx_payment_system_recon_mapping_conversion
ON payment_system_reconciliation_mapping(conversion_id);

-- =====================================================
-- 4. SYSTEM RECONCILIATION ITEMS INDEXES
-- =====================================================

-- Index for available items lookup (FIFO selection)
CREATE INDEX IF NOT EXISTS idx_system_recon_items_available
ON system_reconciliation_items(user_id, order_time ASC)
WHERE payment_status = 'finalized' AND linked_to_payment_request = false;

-- Index for user's items by status
CREATE INDEX IF NOT EXISTS idx_system_recon_items_user_status
ON system_reconciliation_items(user_id, payment_status);

-- Index for payment request linked items
CREATE INDEX IF NOT EXISTS idx_system_recon_items_payment_request
ON system_reconciliation_items(linked_payment_request_id)
WHERE linked_payment_request_id IS NOT NULL;

-- Composite for reconciliation period lookup
CREATE INDEX IF NOT EXISTS idx_system_recon_items_period
ON system_reconciliation_items(system_reconciliation_id, user_id);

-- =====================================================
-- 5. PAYMENT VALIDATION AUDIT LOG INDEXES
-- =====================================================

-- Index for user validation history
CREATE INDEX IF NOT EXISTS idx_payment_validation_audit_user
ON payment_validation_audit_log(user_id, created_at DESC);

-- Index for payment request validation lookup
CREATE INDEX IF NOT EXISTS idx_payment_validation_audit_payment
ON payment_validation_audit_log(payment_request_id)
WHERE payment_request_id IS NOT NULL;

-- Index for failed validations analysis
CREATE INDEX IF NOT EXISTS idx_payment_validation_audit_failed
ON payment_validation_audit_log(validation_passed, created_at DESC)
WHERE validation_passed = false;

-- =====================================================
-- 6. PAYMENT REQUEST LOGS INDEXES
-- =====================================================

-- Index for payment request log lookup
CREATE INDEX IF NOT EXISTS idx_payment_request_logs_payment
ON payment_request_logs(payment_request_id, created_at DESC);

-- Index for admin action tracking
CREATE INDEX IF NOT EXISTS idx_payment_request_logs_performed_by
ON payment_request_logs(performed_by, created_at DESC);

-- =====================================================
-- 7. SYSTEM CONVERSIONS INDEXES (Payment related)
-- =====================================================

-- Index for payment status lookup in conversions
CREATE INDEX IF NOT EXISTS idx_system_conversions_payment_status
ON system_conversions(user_id, payment_status, order_time DESC);

-- Index for linked payment tracking
CREATE INDEX IF NOT EXISTS idx_system_conversions_payment_request
ON system_conversions(linked_payment_request_id)
WHERE linked_payment_request_id IS NOT NULL;

-- =====================================================
-- 8. USER PAYMENT HISTORY INDEXES
-- =====================================================

-- Index for user payment history lookup
CREATE INDEX IF NOT EXISTS idx_user_payment_history_user
ON user_payment_history(user_id, payment_date DESC);

-- Index for payment request to history lookup
CREATE INDEX IF NOT EXISTS idx_user_payment_history_payment_request
ON user_payment_history(payment_request_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_user_payment_history_status
ON user_payment_history(status, payment_date DESC);

-- =====================================================
-- 9. USER PAYMENT DETAILS INDEXES
-- =====================================================

-- Index for history to details lookup
CREATE INDEX IF NOT EXISTS idx_user_payment_details_history
ON user_payment_details(payment_history_id);

-- Index for conversion tracking in details
CREATE INDEX IF NOT EXISTS idx_user_payment_details_conversion
ON user_payment_details(conversion_id);

-- =====================================================
-- ANALYZE TABLES FOR QUERY PLANNER
-- =====================================================

ANALYZE payment_requests;
ANALYZE payment_reconciliation_mapping;
ANALYZE payment_system_reconciliation_mapping;
ANALYZE system_reconciliation_items;
ANALYZE payment_validation_audit_log;
ANALYZE payment_request_logs;
ANALYZE system_conversions;
ANALYZE user_payment_history;
ANALYZE user_payment_details;

-- =====================================================
-- INDEX USAGE STATISTICS QUERY (For monitoring)
-- =====================================================

-- Run this query to check index usage after deployment:
--
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan as index_scans,
--   idx_tup_read as tuples_read,
--   idx_tup_fetch as tuples_fetched
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
--   AND (tablename LIKE '%payment%' OR tablename LIKE '%reconciliation%')
-- ORDER BY idx_scan DESC;

-- =====================================================
-- NOTES:
-- =====================================================
-- 1. All indexes use IF NOT EXISTS to allow safe re-runs
-- 2. Partial indexes (WHERE clause) reduce index size and improve performance
-- 3. Composite indexes are ordered by selectivity (most selective first)
-- 4. DESC ordering for timestamp fields supports common "recent first" queries
-- 5. Run ANALYZE after creating indexes to update query planner statistics
-- 6. Monitor index usage and remove unused indexes to reduce write overhead
