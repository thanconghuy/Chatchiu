-- Migration: Add Performance Indexes
-- Date: 2025-12-06
-- Purpose: Improve query performance for frequently accessed tables

-- ============================================
-- CONVERSIONS TABLE INDEXES
-- ============================================

-- Index on status for filtering approved/pending/rejected conversions
-- Used in: MonthlyReconciliation, PaymentHistory, Dashboard stats
CREATE INDEX IF NOT EXISTS idx_conversions_status
ON conversions(status);

-- Index on user_id for user-specific queries
-- Used in: User dashboard, User statistics
CREATE INDEX IF NOT EXISTS idx_conversions_user_id
ON conversions(user_id);

-- Index on approved_at for time-based queries
-- Used in: MonthlyReconciliation (find conversions in date range)
CREATE INDEX IF NOT EXISTS idx_conversions_approved_at
ON conversions(approved_at)
WHERE approved_at IS NOT NULL;

-- Composite index for common query pattern (user + status)
-- Used in: User conversion list filtering
CREATE INDEX IF NOT EXISTS idx_conversions_user_status
ON conversions(user_id, status);

-- ============================================
-- USER_PAYMENT_DETAILS TABLE INDEXES
-- ============================================

-- Index on payment_history_id for JOIN queries
-- Used in: Payment detail page (most critical)
CREATE INDEX IF NOT EXISTS idx_payment_details_history_id
ON user_payment_details(payment_history_id);

-- Index on conversion_id for lookups
-- Used in: Linking payment details to conversions
CREATE INDEX IF NOT EXISTS idx_payment_details_conversion_id
ON user_payment_details(conversion_id);

-- Index on status for filtering
-- Used in: Payment statistics, filtering paid/pending
CREATE INDEX IF NOT EXISTS idx_payment_details_status
ON user_payment_details(status);

-- ============================================
-- USER_PAYMENT_HISTORY TABLE INDEXES
-- ============================================

-- Index on user_id for user-specific payment history
-- Used in: User payment history page
CREATE INDEX IF NOT EXISTS idx_payment_history_user_id
ON user_payment_history(user_id);

-- Index on payment_period for filtering by month
-- Used in: Admin filtering, monthly reports
CREATE INDEX IF NOT EXISTS idx_payment_history_period
ON user_payment_history(payment_period);

-- Index on status for filtering pending/paid/cancelled
-- Used in: Admin dashboard, statistics
CREATE INDEX IF NOT EXISTS idx_payment_history_status
ON user_payment_history(status);

-- Composite index for common query pattern (user + period)
-- Used in: Check if payment exists for user in specific month
CREATE INDEX IF NOT EXISTS idx_payment_history_user_period
ON user_payment_history(user_id, payment_period);

-- ============================================
-- USERS TABLE INDEXES
-- ============================================

-- Index on is_admin for system admin queries
-- Used in: getSystemAdminId() - though now cached
CREATE INDEX IF NOT EXISTS idx_users_is_admin
ON users(is_admin)
WHERE is_admin = true;

-- Index on email for login queries (if not already unique)
-- This is usually covered by unique constraint, but explicit index helps
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- ============================================
-- USER_SYSTEM_BALANCE TABLE INDEXES
-- ============================================

-- Index on user_id for balance lookups
-- Used in: DebtManagement, balance updates
CREATE INDEX IF NOT EXISTS idx_user_balance_user_id
ON user_system_balance(user_id);

-- Index on debt_balance for finding users with debt
-- Used in: Debt management reports, alerts
CREATE INDEX IF NOT EXISTS idx_user_balance_debt
ON user_system_balance(debt_balance)
WHERE debt_balance > 0;

-- ============================================
-- ACTIVITY_LOGS TABLE INDEXES
-- ============================================

-- Index on activity_type for filtering specific activities
-- Used in: Activity reports, filtering by type
CREATE INDEX IF NOT EXISTS idx_activity_logs_type
ON activity_logs(activity_type);

-- Index on user_id for user-specific activity logs
-- Used in: User activity history
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id
ON activity_logs(user_id)
WHERE user_id IS NOT NULL;

-- Index on created_at for time-based queries
-- Used in: Recent activity, date range filters
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at
ON activity_logs(created_at DESC);

-- Composite index for common pattern (type + created_at)
-- Used in: Recent activities of specific type
CREATE INDEX IF NOT EXISTS idx_activity_logs_type_created
ON activity_logs(activity_type, created_at DESC);

-- ============================================
-- VERIFICATION
-- ============================================

-- Check if indexes were created successfully
SELECT
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN (
    'conversions',
    'user_payment_details',
    'user_payment_history',
    'users',
    'user_system_balance',
    'activity_logs'
)
ORDER BY tablename, indexname;

-- ============================================
-- NOTES
-- ============================================

-- Performance Impact:
-- - Faster JOIN operations (payment_history_id, conversion_id, user_id)
-- - Faster filtering (status, payment_period, activity_type)
-- - Faster sorting (approved_at, created_at)
-- - Partial indexes (WHERE clauses) save space and improve performance

-- Trade-offs:
-- - Slightly slower INSERT/UPDATE operations (need to update indexes)
-- - Additional disk space (~10-20% of table size per index)
-- - These are acceptable trade-offs for read-heavy workloads

-- Maintenance:
-- - PostgreSQL auto-maintains indexes
-- - Consider REINDEX if performance degrades over time
-- - Monitor index usage with pg_stat_user_indexes
