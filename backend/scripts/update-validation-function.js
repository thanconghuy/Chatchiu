/**
 * Fix calculate_user_available_balance_from_system_recon function
 * to calculate correct available balance
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

async function updateFunction() {
  const client = await pool.connect();

  try {
    console.log('🔧 Fixing calculate_user_available_balance_from_system_recon function...\n');

    console.log('📝 Current logic (WRONG):');
    console.log('   Available Balance = SUM(unpaid reconciliation items)');
    console.log('   → Does NOT subtract paid payment requests!');
    console.log('');

    console.log('📝 New logic (CORRECT):');
    console.log('   Available Balance = Total Approved Cashback - Total Requested Amount');
    console.log('   User chỉ quan tâm số tiền họ REQUEST, không quan tâm auto-select link bao nhiêu items');
    console.log('');

    const sql = `
-- Fix: Calculate available balance correctly
-- Available Balance = Total Approved Cashback - Total Requested Amount

CREATE OR REPLACE FUNCTION calculate_user_available_balance_from_system_recon(p_user_id UUID)
RETURNS DECIMAL(15,2) AS $$
DECLARE
    v_total_approved DECIMAL(15,2);
    v_total_requested DECIMAL(15,2);
    v_available_balance DECIMAL(15,2);
BEGIN
    -- Get total approved cashback from system_conversions
    SELECT COALESCE(SUM(cashback_amount), 0)
    INTO v_total_approved
    FROM system_conversions
    WHERE user_id = p_user_id
      AND status = 'approved';

    -- Get total REQUESTED amount (what user asked for, not what was linked)
    SELECT COALESCE(SUM(requested_amount), 0)
    INTO v_total_requested
    FROM payment_requests
    WHERE user_id = p_user_id
      AND status NOT IN ('rejected', 'cancelled');

    -- Calculate available balance
    v_available_balance := v_total_approved - v_total_requested;

    RETURN COALESCE(v_available_balance, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_user_available_balance_from_system_recon IS 'Calculates available balance = Total Approved - Total Requested (not linked items)';
    `;

    console.log('1. Updating function...');
    await client.query(sql);
    console.log('   ✓ Function updated\n');

    // Test the function
    console.log('2. Testing function...');
    const testUserId = await client.query(`SELECT id FROM users WHERE email = 'testuser@test.com' OR email = 'testuser+e2e@test.com' LIMIT 1`);

    if (testUserId.rows.length === 0) {
      console.log('   ⚠ Test user not found, skipping test');
    } else {
      const userId = testUserId.rows[0].id;

      // Get details
      const cashbackResult = await client.query(
        `SELECT COALESCE(SUM(cashback_amount), 0) as total FROM system_conversions WHERE user_id = $1 AND status = 'approved'`,
        [userId]
      );

      const paymentsResult = await client.query(
        `SELECT COALESCE(SUM(requested_amount), 0) as total
         FROM payment_requests
         WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')`,
        [userId]
      );

      const balanceResult = await client.query(
        `SELECT calculate_user_available_balance_from_system_recon($1) as balance`,
        [userId]
      );

      const totalApproved = parseFloat(cashbackResult.rows[0].total);
      const totalRequested = parseFloat(paymentsResult.rows[0].total);
      const availableBalance = parseFloat(balanceResult.rows[0].balance);

      console.log('   Test Results:');
      console.log('   - Total Approved:', totalApproved.toLocaleString('vi-VN'), 'VND');
      console.log('   - Total Requested:', totalRequested.toLocaleString('vi-VN'), 'VND');
      console.log('   - Available Balance:', availableBalance.toLocaleString('vi-VN'), 'VND');
      console.log('   - Calculation Check:', (totalApproved - totalRequested).toLocaleString('vi-VN'), 'VND');

      if (Math.abs(availableBalance - (totalApproved - totalRequested)) < 0.01) {
        console.log('   ✅ Calculation is CORRECT!');
      } else {
        console.log('   ❌ Calculation is WRONG!');
      }
    }

    console.log('\n✅ Function fix completed successfully!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateFunction().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
