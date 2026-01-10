const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.NEON_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }
});

async function checkBalanceDiscrepancy() {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e'; // Test User E2E

    console.log('🔍 Investigating balance discrepancy...\n');

    // 1. Check current balance in user_system_balance
    const balanceResult = await client.query(
      'SELECT * FROM user_system_balance WHERE user_id = $1',
      [userId]
    );
    console.log('📊 Current balance in DB:');
    console.log('   available_balance:', balanceResult.rows[0]?.available_balance);
    console.log('   total_earned:', balanceResult.rows[0]?.total_earned);
    console.log('   total_withdrawn:', balanceResult.rows[0]?.total_withdrawn);
    console.log('');

    // 2. Calculate total approved cashback
    const conversionsResult = await client.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count
      FROM system_conversions
      WHERE user_id = $1`,
      [userId]
    );
    const totalApproved = parseFloat(conversionsResult.rows[0].total_approved);
    console.log('💰 Total approved cashback:', totalApproved);
    console.log('   Approved conversions count:', conversionsResult.rows[0].approved_count);
    console.log('');

    // 3. Calculate total requested payments
    const paymentsResult = await client.query(
      `SELECT
        id,
        status,
        requested_amount,
        created_at
      FROM payment_requests
      WHERE user_id = $1
        AND status NOT IN ('rejected', 'cancelled')
      ORDER BY created_at DESC`,
      [userId]
    );
    console.log('💳 Payment requests (not rejected/cancelled):');
    let totalRequested = 0;
    paymentsResult.rows.forEach(pr => {
      const amount = parseFloat(pr.requested_amount);
      totalRequested += amount;
      console.log(`   - ${pr.id}: ${pr.status} - ${amount}đ`);
    });
    console.log('   Total requested:', totalRequested);
    console.log('');

    // 4. Calculate expected balance
    const expectedBalance = totalApproved - totalRequested;
    const actualBalance = parseFloat(balanceResult.rows[0]?.available_balance || 0);
    const discrepancy = actualBalance - expectedBalance;

    console.log('🧮 Balance Calculation:');
    console.log('   Expected: ' + totalApproved + ' - ' + totalRequested + ' = ' + expectedBalance);
    console.log('   Actual in DB:', actualBalance);
    console.log('   Discrepancy:', discrepancy);
    console.log('');

    if (Math.abs(discrepancy) > 0.01) {
      console.log('⚠️  BALANCE MISMATCH DETECTED!');
      console.log('   Need to sync balance to:', expectedBalance);
      console.log('');

      // Ask if should fix
      console.log('Do you want to fix this? (Run fix-balance-sync.js)');
    } else {
      console.log('✅ Balance is correct!');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkBalanceDiscrepancy();
