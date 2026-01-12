-- Migration 037: Fix system_reconciliation_items to support system_conversions
-- Issue: conversion_id references conversions table (AccessTrade), but System Reconciliation
--        should work with system_conversions table (Cashback System orders)
-- Solution: Add system_conversion_id column and make conversion_id nullable

-- Step 1: Add new column for system_conversions (Cashback System orders)
ALTER TABLE system_reconciliation_items
ADD COLUMN IF NOT EXISTS system_conversion_id UUID REFERENCES system_conversions(id) ON DELETE CASCADE;

-- Step 2: Make conversion_id nullable (allow either conversion_id OR system_conversion_id)
ALTER TABLE system_reconciliation_items
ALTER COLUMN conversion_id DROP NOT NULL;

-- Step 3: Add check constraint to ensure at least one of the IDs is present
ALTER TABLE system_reconciliation_items
ADD CONSTRAINT check_at_least_one_conversion_id
CHECK (
  (conversion_id IS NOT NULL AND system_conversion_id IS NULL) OR
  (conversion_id IS NULL AND system_conversion_id IS NOT NULL)
);

-- Step 4: Add index for faster lookups on system_conversion_id
CREATE INDEX IF NOT EXISTS idx_system_reconciliation_items_system_conversion_id
ON system_reconciliation_items(system_conversion_id);

-- Step 5: Add comments
COMMENT ON COLUMN system_reconciliation_items.system_conversion_id IS
'Reference to system_conversions table (Cashback System orders). Either this OR conversion_id must be set.';

COMMENT ON COLUMN system_reconciliation_items.conversion_id IS
'Reference to conversions table (AccessTrade orders). Either this OR system_conversion_id must be set. Made nullable in migration 037.';
