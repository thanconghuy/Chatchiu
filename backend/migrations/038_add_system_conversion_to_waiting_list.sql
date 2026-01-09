-- Migration 038: Add system_conversion_id to reconciliation_waiting_list
-- Allow waiting list to support both conversions (AccessTrade) and system_conversions (Cashback System)

-- Step 1: Add system_conversion_id column
ALTER TABLE reconciliation_waiting_list
ADD COLUMN IF NOT EXISTS system_conversion_id UUID REFERENCES system_conversions(id) ON DELETE CASCADE;

-- Step 2: Make conversion_id nullable
ALTER TABLE reconciliation_waiting_list
ALTER COLUMN conversion_id DROP NOT NULL;

-- Step 3: Drop old UNIQUE constraint on conversion_id
ALTER TABLE reconciliation_waiting_list
DROP CONSTRAINT IF EXISTS reconciliation_waiting_list_conversion_id_key;

-- Step 4: Add check constraint to ensure at least one ID is present
ALTER TABLE reconciliation_waiting_list
ADD CONSTRAINT check_waiting_list_conversion_id
CHECK (
  (conversion_id IS NOT NULL AND system_conversion_id IS NULL) OR
  (conversion_id IS NULL AND system_conversion_id IS NOT NULL)
);

-- Step 5: Add unique constraint for system_conversion_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_waiting_list_system_conversion_id_unique
ON reconciliation_waiting_list(system_conversion_id)
WHERE system_conversion_id IS NOT NULL;

-- Step 6: Add unique constraint for conversion_id (since we dropped the old one)
CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_waiting_list_conversion_id_unique
ON reconciliation_waiting_list(conversion_id)
WHERE conversion_id IS NOT NULL;

-- Step 7: Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_reconciliation_waiting_list_system_conversion_id
ON reconciliation_waiting_list(system_conversion_id);

-- Step 8: Add comments
COMMENT ON COLUMN reconciliation_waiting_list.system_conversion_id IS
'Reference to system_conversions table (Cashback System orders). Either this OR conversion_id must be set.';

COMMENT ON COLUMN reconciliation_waiting_list.conversion_id IS
'Reference to conversions table (AccessTrade orders). Either this OR system_conversion_id must be set. Made nullable in migration 038.';
