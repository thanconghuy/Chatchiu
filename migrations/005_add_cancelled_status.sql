-- =====================================================
-- Migration 005: Add Cancelled Status (Soft Delete)
-- Purpose: Support soft delete for payment requests
-- Created: 2025-12-11
-- =====================================================

-- Add columns for cancelled status tracking
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Create index for performance (filter cancelled requests)
CREATE INDEX IF NOT EXISTS idx_payment_requests_status
ON payment_requests(status) WHERE status != 'rejected';

CREATE INDEX IF NOT EXISTS idx_payment_requests_cancelled_at
ON payment_requests(cancelled_at) WHERE cancelled_at IS NOT NULL;

-- Add comments
COMMENT ON COLUMN payment_requests.cancelled_at IS 'Timestamp when request was cancelled (soft delete)';
COMMENT ON COLUMN payment_requests.cancelled_by IS 'User ID who cancelled the request (user or admin)';
COMMENT ON COLUMN payment_requests.cancellation_reason IS 'Optional reason for cancellation';

-- Note: Status enum already supports 'pending', 'confirmed', 'paid', 'rejected'
-- We will use 'rejected' for cancelled requests temporarily, or add 'cancelled' to enum if needed
-- For now, we track cancelled state via cancelled_at IS NOT NULL
