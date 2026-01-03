-- Migration 033: Update withdrawal limits
-- Purpose: Fix max_withdrawal_amount from 50M to 500K VND
-- Date: 2026-01-02

-- Update max withdrawal amount to 500,000 VND
UPDATE system_settings
SET setting_value = '500000',
    description = 'Hạn mức rút tiền tối đa (VNĐ)',
    updated_at = CURRENT_TIMESTAMP
WHERE setting_key = 'max_withdrawal_amount';

-- Verify the change
DO $$
DECLARE
    current_max TEXT;
BEGIN
    SELECT setting_value INTO current_max
    FROM system_settings
    WHERE setting_key = 'max_withdrawal_amount';

    IF current_max = '500000' THEN
        RAISE NOTICE 'Migration successful: max_withdrawal_amount = %', current_max;
    ELSE
        RAISE WARNING 'Migration may have failed: max_withdrawal_amount = %', current_max;
    END IF;
END $$;
