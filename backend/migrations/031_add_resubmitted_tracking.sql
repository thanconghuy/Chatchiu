-- Migration: Add resubmitted_at tracking column
-- Purpose: Track when a cancelled payment request was resubmitted
-- This helps distinguish between:
--   - Cancelled requests that haven't been resubmitted yet (show as "Đã hủy")
--   - Cancelled requests that were resubmitted (show as resubmitted status)

ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS resubmitted_at TIMESTAMPTZ;

COMMENT ON COLUMN payment_requests.resubmitted_at IS 'Timestamp when this cancelled request was resubmitted (undeleted and reactivated)';
