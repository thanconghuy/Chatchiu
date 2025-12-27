-- =====================================================
-- Migration 035: Add Indexes for Payment Statistics
-- Purpose: Optimize queries for payment stats module
-- Date: 2025-12-27
-- =====================================================

-- Index for payment_requests filtering by user_id, status, and paid_at
-- This supports the main query in payment stats
CREATE INDEX IF NOT EXISTS idx_payment_requests_stats
  ON payment_requests(user_id, status, paid_at DESC)
  WHERE status = 'paid';

-- Index for payment_requests filtering by paid_at for period queries
CREATE INDEX IF NOT EXISTS idx_payment_requests_paid_at
  ON payment_requests(paid_at DESC)
  WHERE status = 'paid';

-- Composite index for user stats queries
CREATE INDEX IF NOT EXISTS idx_payment_requests_user_stats
  ON payment_requests(user_id, status, paid_at DESC, requested_amount)
  WHERE status = 'paid';

-- Comments
COMMENT ON INDEX idx_payment_requests_stats IS
  'Optimizes payment stats queries filtering by user, status and payment date';

COMMENT ON INDEX idx_payment_requests_paid_at IS
  'Optimizes queries filtering by payment date for period statistics';

COMMENT ON INDEX idx_payment_requests_user_stats IS
  'Composite index for comprehensive user payment statistics queries';

-- =====================================================
-- Verify indexes
-- =====================================================

-- You can verify indexes with:
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'payment_requests';
