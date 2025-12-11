-- Migration: Add encryption columns to payment_requests table
-- Description: Adds encrypted bank account data columns, hash columns, and audit fields
-- Date: 2025-12-11

BEGIN;

-- Add encrypted data columns
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS bank_account_number_encrypted TEXT,
ADD COLUMN IF NOT EXISTS bank_account_number_hash TEXT,
ADD COLUMN IF NOT EXISTS bank_account_name_encrypted TEXT,
ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1;

-- Add decryption audit columns
ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS last_decrypted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_decrypted_by UUID REFERENCES users(id),
ADD COLUMN IF NOT EXISTS decrypt_count INTEGER DEFAULT 0;

-- Create index on hash for faster lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_bank_account_hash
ON payment_requests(bank_account_number_hash)
WHERE bank_account_number_hash IS NOT NULL;

-- Create index on last_decrypted_by for audit queries
CREATE INDEX IF NOT EXISTS idx_payment_requests_last_decrypted_by
ON payment_requests(last_decrypted_by)
WHERE last_decrypted_by IS NOT NULL;

-- Add comment explaining encryption strategy
COMMENT ON COLUMN payment_requests.bank_account_number_encrypted IS
'AES-256-GCM encrypted bank account number. Plaintext stored in bank_account_number as masked (e.g., ***1234)';

COMMENT ON COLUMN payment_requests.bank_account_number_hash IS
'SHA-256 hash of bank account number for duplicate detection without decryption';

COMMENT ON COLUMN payment_requests.bank_account_name_encrypted IS
'AES-256-GCM encrypted account holder name. Plaintext stored in bank_account_name as masked';

COMMENT ON COLUMN payment_requests.encryption_version IS
'Encryption algorithm version. Allows for key rotation and algorithm upgrades';

COMMENT ON COLUMN payment_requests.last_decrypted_at IS
'Audit timestamp: when sensitive data was last decrypted';

COMMENT ON COLUMN payment_requests.last_decrypted_by IS
'Audit reference: which user last decrypted the sensitive data';

COMMENT ON COLUMN payment_requests.decrypt_count IS
'Audit counter: total number of times sensitive data has been decrypted';

COMMIT;
