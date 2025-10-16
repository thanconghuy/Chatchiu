-- Fix aff_sid constraint to allow NULL temporarily during click creation
-- This allows us to create the click record first, then update with aff_sid

-- Step 1: Make aff_sid nullable and affiliate_url nullable
ALTER TABLE clicks
  ALTER COLUMN aff_sid DROP NOT NULL,
  ALTER COLUMN affiliate_url DROP NOT NULL;

-- Verify the change
\d clicks
