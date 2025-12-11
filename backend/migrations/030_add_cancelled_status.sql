-- Migration: Add 'cancelled' to valid payment request statuses
-- Date: 2025-12-11

BEGIN;

-- Drop old constraint
ALTER TABLE payment_requests
DROP CONSTRAINT IF EXISTS valid_status;

-- Add new constraint with 'cancelled' status
ALTER TABLE payment_requests
ADD CONSTRAINT valid_status CHECK (
  status IN ('pending', 'confirmed', 'paid', 'rejected', 'cancelled')
);

-- Update existing cancelled requests to have correct status
UPDATE payment_requests
SET status = 'cancelled'
WHERE cancelled_at IS NOT NULL
  AND status != 'cancelled';

COMMIT;
