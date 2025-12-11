-- =====================================================
-- Migration 004: Add payment_account_id to payment_requests
-- Purpose: Link payment requests to saved payment accounts
-- Created: 2025-12-11
-- =====================================================

-- Add payment_account_id column (nullable for backward compatibility)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS payment_account_id INTEGER REFERENCES payment_accounts(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_payment_requests_payment_account
ON payment_requests(payment_account_id);

-- Add comment
COMMENT ON COLUMN payment_requests.payment_account_id IS 'Reference to saved payment account (optional, for convenience)';
