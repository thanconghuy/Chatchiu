const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.NEON_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }
});

async function checkPaymentStatus() {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 Checking payment requests and balance...\n');

    // 1. Check user_system_balance
    const balanceResult = await client.query(
      'SELECT * FROM user_system_balance WHERE user_id = $1',
      [userId]
    );
    console.log('📊 user_system_balance:');
    console.log('   available_balance:', balanceResult.rows[0]?.available_balance);
    console.log('   total_earned:', balanceResult.rows[0]?.total_earned);
    console.log('   total_withdrawn:', balanceResult.rows[0]?.total_withdrawn);
    console.log('');

    // 2. Check total approved cashback
    const cashbackResult = await client.query(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(cashback_amount), 0) as total
      FROM system_conversions
      WHERE user_id = $1 AND status = 'approved'`,
      [userId]
    );
    console.log('💰 Total Approved Cashback:');
    console.log('   Count:', cashbackResult.rows[0].count);
    console.log('   Total:', cashbackResult.rows[0].total);
    console.log('');

    // 3. Check all payment requests
    const paymentsResult = await client.query(
      `SELECT
        id,
        requested_amount,
        status,
        created_at,
        confirmed_at,
        paid_at,
        cancelled_at
      FROM payment_requests
      WHERE user_id = $1
      ORDER BY created_at DESC`,
      [userId]
    );

    console.log('💳 Payment Requests:');
    paymentsResult.rows.forEach(pr => {
      console.log(`   - ${pr.id.substring(0, 8)}: ${pr.requested_amount}đ - ${pr.status}`);
      console.log(`     Created: ${pr.created_at}`);
      if (pr.confirmed_at) console.log(`     Confirmed: ${pr.confirmed_at}`);
      if (pr.paid_at) console.log(`     Paid: ${pr.paid_at}`);
      if (pr.cancelled_at) console.log(`     Cancelled: ${pr.cancelled_at}`);
    });
    console.log('');

    // 4. Calculate what balance SHOULD be
    const totalApproved = parseFloat(cashbackResult.rows[0].total);
    const actualBalance = parseFloat(balanceResult.rows[0]?.available_balance || 0);
    const totalWithdrawn = parseFloat(balanceResult.rows[0]?.total_withdrawn || 0);

    console.log('🧮 Analysis:');
    console.log('   Total Approved Cashback:', totalApproved);
    console.log('   Total Withdrawn (from user_system_balance):', totalWithdrawn);
    console.log('   Expected Available Balance:', totalApproved - totalWithdrawn);
    console.log('   Actual Available Balance:', actualBalance);
    console.log('   Discrepancy:', actualBalance - (totalApproved - totalWithdrawn));

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

checkPaymentStatus();
