-- Migration Script: Remove offer_id column and update UTM defaults
-- Run this script to update existing database schema

-- 1. Remove offer_id column from merchants table
ALTER TABLE merchants DROP COLUMN IF EXISTS offer_id;

-- 2. Update default values for clicks table UTM parameters
ALTER TABLE clicks ALTER COLUMN utm_source SET DEFAULT 'chatchiu';
ALTER TABLE clicks ALTER COLUMN utm_campaign SET DEFAULT 'cashback';

-- 3. Update existing clicks with old default values (optional - update only if needed)
-- UPDATE clicks SET utm_source = 'chatchiu' WHERE utm_source = 'cashback';
-- UPDATE clicks SET utm_campaign = 'cashback' WHERE utm_campaign = 'lammmo';

-- Migration completed
SELECT 'Migration completed successfully!' as message;
