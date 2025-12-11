-- Migration: Create payment_accounts table
-- Description: Store user payment account information for receiving cashback payouts
-- Created: 2025-12-11

-- Create payment_accounts table
CREATE TABLE IF NOT EXISTS payment_accounts (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('bank', 'momo', 'zalopay', 'other')),
  account_holder_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(50) NOT NULL,
  bank_name VARCHAR(255), -- For bank transfers
  bank_branch VARCHAR(255), -- For bank transfers
  is_default BOOLEAN DEFAULT false,
  is_verified BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX idx_payment_accounts_user_id ON payment_accounts(user_id);
CREATE INDEX idx_payment_accounts_is_default ON payment_accounts(user_id, is_default);

-- Add constraint: Each user can only have one default payment account
CREATE UNIQUE INDEX idx_payment_accounts_user_default
ON payment_accounts(user_id)
WHERE is_default = true;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_account_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_payment_account_timestamp
BEFORE UPDATE ON payment_accounts
FOR EACH ROW
EXECUTE FUNCTION update_payment_account_updated_at();

-- Add comments for documentation
COMMENT ON TABLE payment_accounts IS 'User payment account information for receiving cashback payouts';
COMMENT ON COLUMN payment_accounts.account_type IS 'Type of payment account: bank, momo, zalopay, other';
COMMENT ON COLUMN payment_accounts.is_default IS 'Whether this is the default payment account for the user';
COMMENT ON COLUMN payment_accounts.is_verified IS 'Whether the payment account has been verified by admin';
