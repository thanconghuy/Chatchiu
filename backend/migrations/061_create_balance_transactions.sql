-- Migration 061: Create balance_transactions audit trail
-- Date: 2026-01-10
-- Purpose: Complete audit trail for all balance changes

BEGIN;

-- Create balance_transactions table
CREATE TABLE IF NOT EXISTS balance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),

  -- Transaction type
  transaction_type VARCHAR(50) NOT NULL,

  -- Amount (positive = credit/increase, negative = debit/decrease)
  amount DECIMAL(15,2) NOT NULL,

  -- Balance before and after
  balance_before DECIMAL(15,2) NOT NULL,
  balance_after DECIMAL(15,2) NOT NULL,

  -- Reference to what caused this transaction
  reference_type VARCHAR(50), -- 'payment_request', 'reconciliation', 'manual_adjustment'
  reference_id UUID,
  payment_request_id UUID REFERENCES payment_requests(id),

  -- Description
  description TEXT,

  -- Who performed this action
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),

  -- Additional metadata (JSON)
  metadata JSONB,

  -- Constraints
  CONSTRAINT check_transaction_type CHECK (
    transaction_type IN (
      'reconciliation_earned',    -- When finalize reconciliation (credit)
      'payment_reserved',         -- When create payment request (debit)
      'payment_released',         -- When cancel payment request (credit)
      'payment_withdrawn',        -- When mark as paid (no balance change, just log)
      'payment_refunded',         -- If admin refunds a paid request (credit)
      'manual_adjustment'         -- Admin manual correction
    )
  )
);

-- Indexes for fast queries
CREATE INDEX idx_balance_transactions_user_date
ON balance_transactions(user_id, created_at DESC);

CREATE INDEX idx_balance_transactions_payment
ON balance_transactions(payment_request_id);

CREATE INDEX idx_balance_transactions_type
ON balance_transactions(transaction_type);

CREATE INDEX idx_balance_transactions_reference
ON balance_transactions(reference_type, reference_id);

-- Add comments
COMMENT ON TABLE balance_transactions IS 'Audit trail for all user balance changes';
COMMENT ON COLUMN balance_transactions.amount IS 'Positive = credit (increase), Negative = debit (decrease)';
COMMENT ON COLUMN balance_transactions.transaction_type IS 'Type of transaction that caused balance change';

COMMIT;
