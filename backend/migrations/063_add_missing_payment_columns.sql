-- Migration 063: Add missing columns to payment_requests
-- These columns are needed for tracking who performed admin actions

-- Add confirmed_by column
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS confirmed_by UUID REFERENCES users(id);

-- Add confirmed_at column (if doesn't exist)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMP;

-- Add rejected_by column
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id);

-- Add rejected_at column (if doesn't exist)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

-- Add rejection_reason column (if doesn't exist)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add paid_by column
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES users(id);

-- Add paid_at column (if doesn't exist)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP;

-- Add cancelled_by column (if doesn't exist)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES users(id);

-- Add cancellation_reason column (if doesn't exist)
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Create index on confirmed_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_requests_confirmed_by
ON payment_requests(confirmed_by);

-- Create index on rejected_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_requests_rejected_by
ON payment_requests(rejected_by);

-- Create index on paid_by for faster lookups
CREATE INDEX IF NOT EXISTS idx_payment_requests_paid_by
ON payment_requests(paid_by);

COMMENT ON COLUMN payment_requests.confirmed_by IS 'Admin user who confirmed this request';
COMMENT ON COLUMN payment_requests.rejected_by IS 'Admin user who rejected this request';
COMMENT ON COLUMN payment_requests.paid_by IS 'Admin user who marked this as paid';
COMMENT ON COLUMN payment_requests.cancelled_by IS 'User who cancelled this request';
