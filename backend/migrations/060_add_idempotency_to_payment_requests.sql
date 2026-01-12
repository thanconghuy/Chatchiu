-- Migration 060: Add idempotency support to payment_requests
-- Date: 2026-01-10
-- Purpose: Add idempotency_key and balance tracking columns

BEGIN;

-- Add idempotency_key column (allow NULL initially for existing records)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);

-- Generate UUIDs for existing records that don't have one
UPDATE payment_requests
SET idempotency_key = gen_random_uuid()::text
WHERE idempotency_key IS NULL;

-- Make it NOT NULL and UNIQUE
ALTER TABLE payment_requests
ALTER COLUMN idempotency_key SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_requests_idempotency
ON payment_requests(idempotency_key);

-- Add tracking columns for when balance was reserved/released
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS reserve_balance_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS release_balance_at TIMESTAMP;

-- Add comment
COMMENT ON COLUMN payment_requests.idempotency_key IS 'UUID v4 from client to prevent duplicate requests';
COMMENT ON COLUMN payment_requests.reserve_balance_at IS 'When balance was reserved (on create)';
COMMENT ON COLUMN payment_requests.release_balance_at IS 'When balance was released (on cancel)';

COMMIT;
