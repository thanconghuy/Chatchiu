-- Migration: Add pending_reserved column to user_system_balance table
-- Purpose: Track the amount of money locked in pending payment requests
-- Date: 2026-01-16

-- Add pending_reserved column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'user_system_balance'
        AND column_name = 'pending_reserved'
    ) THEN
        ALTER TABLE user_system_balance
        ADD COLUMN pending_reserved DECIMAL(15, 2) DEFAULT 0 NOT NULL;

        RAISE NOTICE 'Column pending_reserved added successfully';
    ELSE
        RAISE NOTICE 'Column pending_reserved already exists';
    END IF;
END $$;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_user_system_balance_pending_reserved
ON user_system_balance(pending_reserved)
WHERE pending_reserved > 0;

-- Update existing records to set pending_reserved = 0 if NULL
UPDATE user_system_balance
SET pending_reserved = 0
WHERE pending_reserved IS NULL;

-- Add comment
COMMENT ON COLUMN user_system_balance.pending_reserved IS 'Amount of money locked in pending payment requests';
