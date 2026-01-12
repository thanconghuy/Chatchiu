-- Migration 062: Create trigger to auto-log balance changes
-- Date: 2026-01-10
-- Purpose: Automatically log balance changes to balance_transactions

BEGIN;

-- Function to log balance changes
CREATE OR REPLACE FUNCTION log_balance_change()
RETURNS TRIGGER AS $$
DECLARE
  change_type VARCHAR(50);
  amount_change DECIMAL(15,2);
BEGIN
  -- Calculate amount change
  amount_change := NEW.available_balance - OLD.available_balance;

  -- Skip if no change
  IF ABS(amount_change) < 0.01 THEN
    RETURN NEW;
  END IF;

  -- Determine transaction type based on what changed
  IF amount_change < 0 THEN
    -- Balance decreased
    IF NEW.total_withdrawn > OLD.total_withdrawn THEN
      -- This shouldn't happen anymore with new logic
      -- total_withdrawn increases but available should stay same
      change_type := 'payment_withdrawn';
    ELSE
      -- Likely a payment reserve
      change_type := 'payment_reserved';
    END IF;
  ELSE
    -- Balance increased
    IF NEW.total_earned > OLD.total_earned THEN
      change_type := 'reconciliation_earned';
    ELSE
      -- Likely a payment release (cancel)
      change_type := 'payment_released';
    END IF;
  END IF;

  -- Log the transaction
  INSERT INTO balance_transactions (
    user_id,
    transaction_type,
    amount,
    balance_before,
    balance_after,
    description,
    created_at
  ) VALUES (
    NEW.user_id,
    change_type,
    amount_change,
    OLD.available_balance,
    NEW.available_balance,
    'Auto-logged balance change',
    NOW()
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trigger_log_balance_changes ON user_system_balance;

CREATE TRIGGER trigger_log_balance_changes
AFTER UPDATE ON user_system_balance
FOR EACH ROW
WHEN (
  OLD.available_balance IS DISTINCT FROM NEW.available_balance
  OR OLD.total_withdrawn IS DISTINCT FROM NEW.total_withdrawn
  OR OLD.total_earned IS DISTINCT FROM NEW.total_earned
)
EXECUTE FUNCTION log_balance_change();

COMMENT ON FUNCTION log_balance_change() IS 'Auto-log all balance changes to balance_transactions table';

COMMIT;
