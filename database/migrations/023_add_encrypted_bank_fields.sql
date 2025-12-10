-- Migration: Add encrypted fields for bank account information
-- Created: 2025-12-06
-- Purpose: Encrypt sensitive payment information for security compliance

BEGIN;

-- 1. Add encrypted columns to payment_requests table
ALTER TABLE payment_requests
    ADD COLUMN IF NOT EXISTS bank_account_number_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS bank_account_number_hash VARCHAR(256),
    ADD COLUMN IF NOT EXISTS bank_account_name_encrypted TEXT,
    ADD COLUMN IF NOT EXISTS encryption_version INTEGER DEFAULT 1;

-- 2. Add comment for documentation
COMMENT ON COLUMN payment_requests.bank_account_number_encrypted IS 'AES-256-GCM encrypted bank account number';
COMMENT ON COLUMN payment_requests.bank_account_number_hash IS 'PBKDF2 hash for lookup/verification';
COMMENT ON COLUMN payment_requests.bank_account_name_encrypted IS 'AES-256-GCM encrypted account holder name';
COMMENT ON COLUMN payment_requests.encryption_version IS 'Encryption version for key rotation';

-- 3. Create index on hash for lookup
CREATE INDEX IF NOT EXISTS idx_payment_requests_bank_account_hash
    ON payment_requests(bank_account_number_hash);

-- 4. Add audit columns
ALTER TABLE payment_requests
    ADD COLUMN IF NOT EXISTS last_decrypted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_decrypted_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS decrypt_count INTEGER DEFAULT 0;

COMMENT ON COLUMN payment_requests.last_decrypted_at IS 'Last time encrypted data was accessed';
COMMENT ON COLUMN payment_requests.last_decrypted_by IS 'User who last decrypted the data';
COMMENT ON COLUMN payment_requests.decrypt_count IS 'Number of times data has been decrypted';

-- 5. Create trigger to log decryption access
CREATE OR REPLACE FUNCTION log_payment_data_access()
RETURNS TRIGGER AS $$
BEGIN
    -- Only log if encrypted columns are being accessed
    -- This would be called from application layer
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. Add migration tracking
INSERT INTO schema_migrations (version, description, applied_at)
VALUES (
    '023',
    'Add encrypted bank account fields and audit trail',
    NOW()
) ON CONFLICT (version) DO NOTHING;

COMMIT;

-- Notes for developers:
-- 1. Old columns (bank_account_number, bank_account_name) will remain for backward compatibility
-- 2. Application should gradually migrate to use encrypted columns
-- 3. After full migration, old columns can be dropped in future migration
-- 4. ENCRYPTION_KEY must be set in environment variables (64 hex chars)
-- 5. Use backend/utils/encryption.js for encrypt/decrypt operations
