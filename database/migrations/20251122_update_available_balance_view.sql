/**
 * Migration: Update v_user_available_balances view to include System Reconciliation balance
 *
 * Purpose:
 * - Cộng dồn số dư từ System Reconciliation (đối soát nội bộ) vào số dư khả dụng
 * - User có thể rút tiền từ cả 2 nguồn: API reconciliation + System reconciliation
 *
 * Logic:
 * - API Reconciliation: reconciliation_items (status='confirmed')
 * - System Reconciliation: user_system_balance.available_balance
 * - Số dư khả dụng = (API confirmed cashback - API requested) + System available balance
 */

-- Drop existing view
DROP VIEW IF EXISTS v_user_available_balances;

-- Recreate view with system reconciliation balance included
CREATE OR REPLACE VIEW v_user_available_balances AS
SELECT
  u.id AS user_id,

  -- Total confirmed cashback from API reconciliation
  COALESCE((
    SELECT SUM(ri.cashback_amount)
    FROM reconciliation_items ri
    JOIN reconciliations r ON ri.reconciliation_id = r.id
    JOIN conversions c ON ri.conversion_id = c.id
    WHERE c.user_id = u.id
      AND r.status = 'confirmed'
  ), 0) AS total_confirmed_cashback,

  -- Total already requested in payment requests
  COALESCE((
    SELECT SUM(pr.requested_amount)
    FROM payment_requests pr
    WHERE pr.user_id = u.id
      AND pr.status IN ('pending', 'confirmed', 'paid')
  ), 0) AS total_requested,

  -- System reconciliation available balance
  COALESCE((
    SELECT available_balance
    FROM user_system_balance
    WHERE user_id = u.id
  ), 0) AS system_available_balance,

  -- System reconciliation debt
  COALESCE((
    SELECT debt_balance
    FROM user_system_balance
    WHERE user_id = u.id
  ), 0) AS system_debt_balance,

  -- AVAILABLE BALANCE = (API confirmed - API requested) + System available - System debt
  (
    COALESCE((
      SELECT SUM(ri.cashback_amount)
      FROM reconciliation_items ri
      JOIN reconciliations r ON ri.reconciliation_id = r.id
      JOIN conversions c ON ri.conversion_id = c.id
      WHERE c.user_id = u.id
        AND r.status = 'confirmed'
    ), 0)
    -
    COALESCE((
      SELECT SUM(pr.requested_amount)
      FROM payment_requests pr
      WHERE pr.user_id = u.id
        AND pr.status IN ('pending', 'confirmed', 'paid')
    ), 0)
    +
    COALESCE((
      SELECT available_balance
      FROM user_system_balance
      WHERE user_id = u.id
    ), 0)
    -
    COALESCE((
      SELECT debt_balance
      FROM user_system_balance
      WHERE user_id = u.id
    ), 0)
  ) AS available_balance,

  -- Has pending payment request
  EXISTS(
    SELECT 1
    FROM payment_requests pr
    WHERE pr.user_id = u.id
      AND pr.status = 'pending'
  ) AS has_pending_request,

  -- Has debt (from system reconciliation)
  COALESCE((
    SELECT debt_balance
    FROM user_system_balance
    WHERE user_id = u.id
  ), 0) > 0 AS has_debt,

  -- Is eligible for payment (balance >= 100k AND no pending request AND no debt)
  (
    (
      COALESCE((
        SELECT SUM(ri.cashback_amount)
        FROM reconciliation_items ri
        JOIN reconciliations r ON ri.reconciliation_id = r.id
        JOIN conversions c ON ri.conversion_id = c.id
        WHERE c.user_id = u.id
          AND r.status = 'confirmed'
      ), 0)
      -
      COALESCE((
        SELECT SUM(pr.requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = u.id
          AND pr.status IN ('pending', 'confirmed', 'paid')
      ), 0)
      +
      COALESCE((
        SELECT available_balance
        FROM user_system_balance
        WHERE user_id = u.id
      ), 0)
      -
      COALESCE((
        SELECT debt_balance
        FROM user_system_balance
        WHERE user_id = u.id
      ), 0)
    ) >= 100000
    AND NOT EXISTS(
      SELECT 1
      FROM payment_requests pr
      WHERE pr.user_id = u.id
        AND pr.status = 'pending'
    )
    AND COALESCE((
      SELECT debt_balance
      FROM user_system_balance
      WHERE user_id = u.id
    ), 0) = 0
  ) AS is_eligible

FROM users u;

-- Add comment
COMMENT ON VIEW v_user_available_balances IS 'User available balance for payment requests - includes both API reconciliation and System reconciliation';

-- Test the view
SELECT
  user_id,
  total_confirmed_cashback,
  system_available_balance,
  system_debt_balance,
  total_requested,
  available_balance,
  has_pending_request,
  has_debt,
  is_eligible
FROM v_user_available_balances
LIMIT 5;
