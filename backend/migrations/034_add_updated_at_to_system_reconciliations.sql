-- Migration: Add updated_at column to system_reconciliations
-- Description: Add timestamp tracking for when reconciliation details are modified
-- Date: 2026-01-02
-- Issue: Missing updated_at column prevents tracking label changes

-- Add updated_at column
ALTER TABLE system_reconciliations
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Create trigger to auto-update updated_at on UPDATE
CREATE OR REPLACE FUNCTION update_system_reconciliation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_reconciliation_timestamp
BEFORE UPDATE ON system_reconciliations
FOR EACH ROW
EXECUTE FUNCTION update_system_reconciliation_timestamp();

-- Initialize existing records with created_at value
UPDATE system_reconciliations
SET updated_at = created_at
WHERE updated_at IS NULL;

-- Make column NOT NULL after initialization
ALTER TABLE system_reconciliations
ALTER COLUMN updated_at SET NOT NULL;

-- Add comment
COMMENT ON COLUMN system_reconciliations.updated_at IS 'Last update timestamp (auto-updated on any change)';

SELECT 'Migration 034: Added updated_at column to system_reconciliations' AS status;
