-- Migration: Add encryption columns to payment_accounts
-- Purpose: Encrypt sensitive bank account information in payment_accounts table

-- Add encryption columns
ALTER TABLE payment_accounts
ADD COLUMN IF NOT EXISTS account_number_encrypted TEXT,
ADD COLUMN IF NOT EXISTS account_number_hash TEXT,
ADD COLUMN IF NOT EXISTS account_holder_name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS last_decrypted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_decrypted_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS decrypt_count INTEGER DEFAULT 0;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_accounts_account_hash
ON payment_accounts(account_number_hash);

CREATE INDEX IF NOT EXISTS idx_payment_accounts_last_decrypted_by
ON payment_accounts(last_decrypted_by);

-- Add comments
COMMENT ON COLUMN payment_accounts.account_number_encrypted IS 'Encrypted account number using AES-256-GCM';
COMMENT ON COLUMN payment_accounts.account_number_hash IS 'SHA-256 hash of account number for lookup/verification';
COMMENT ON COLUMN payment_accounts.account_holder_name_encrypted IS 'Encrypted account holder name';
COMMENT ON COLUMN payment_accounts.encryption_version IS 'Version of encryption algorithm used';
COMMENT ON COLUMN payment_accounts.last_decrypted_at IS 'Timestamp of last decryption (for audit)';
COMMENT ON COLUMN payment_accounts.last_decrypted_by IS 'User ID who last decrypted this data (for audit)';
COMMENT ON COLUMN payment_accounts.decrypt_count IS 'Number of times this data has been decrypted (for audit)';
