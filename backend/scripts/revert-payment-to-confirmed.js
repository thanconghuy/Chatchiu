/**
 * Revert Payment Request to Confirmed Status
 *
 * This script reverts a paid payment request back to confirmed status
 * so it can be tested again with the new payment logic.
 *
 * Steps:
 * 1. Update payment_requests: status = 'confirmed', paid_at = NULL
 * 2. Restore user balance (add back the amount)
 * 3. Update system_conversions: payment_status = 'pending'
 * 4. Delete payment history records
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.NEON_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }
});

async function revertPaymentToConfirmed(paymentRequestId) {
  const client = await pool.connect();

  try {
    console.log(`🔧 Reverting payment request ${paymentRequestId} to confirmed status...\n`);

    await client.query('BEGIN');

    // 1. Get payment request details
    const prQuery = `
      SELECT * FROM payment_requests
      WHERE id = $1
    `;
    const prResult = await client.query(prQuery, [paymentRequestId]);

    if (prResult.rows.length === 0) {
      throw new Error(`Payment request ${paymentRequestId} not found`);
    }

    const pr = prResult.rows[0];
    console.log(`📋 Payment Request Info:`);
    console.log(`   - ID: ${pr.id}`);
    console.log(`   - User: ${pr.user_id}`);
    console.log(`   - Amount: ${pr.requested_amount}`);
    console.log(`   - Status: ${pr.status}`);
    console.log(`   - Paid At: ${pr.paid_at}`);

    if (pr.status !== 'paid') {
      console.log(`\n⚠️  Payment request is not in 'paid' status. Current status: ${pr.status}`);
      console.log(`   Continuing anyway...\n`);
    }

    // 2. Restore user balance
    console.log(`\n💰 Restoring user balance...`);
    const restoreBalanceQuery = `
      UPDATE user_system_balance
      SET
        available_balance = available_balance + $1,
        total_withdrawn = total_withdrawn - $1,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $2
      RETURNING available_balance, total_withdrawn
    `;
    const balanceResult = await client.query(restoreBalanceQuery, [pr.requested_amount, pr.user_id]);

    if (balanceResult.rows.length > 0) {
      const balance = balanceResult.rows[0];
      console.log(`   ✅ Balance restored:`);
      console.log(`      - New available balance: ${balance.available_balance}`);
      console.log(`      - New total withdrawn: ${balance.total_withdrawn}`);
    }

    // 3. Update payment request status
    console.log(`\n📝 Updating payment request status...`);
    const updatePRQuery = `
      UPDATE payment_requests
      SET
        status = 'confirmed',
        paid_at = NULL,
        transaction_reference = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    await client.query(updatePRQuery, [paymentRequestId]);
    console.log(`   ✅ Payment request status set to 'confirmed'`);

    // 4. Update system_conversions payment_status back to pending
    console.log(`\n🔄 Updating system_conversions payment_status...`);
    const updateConversionsQuery = `
      UPDATE system_conversions
      SET
        payment_status = 'pending',
        payment_request_id = NULL,
        payment_linked_at = NULL
      WHERE payment_request_id = $1
      RETURNING id
    `;
    const conversionsResult = await client.query(updateConversionsQuery, [paymentRequestId]);
    console.log(`   ✅ Updated ${conversionsResult.rowCount} conversions to 'pending' payment status`);

    // 5. Delete payment history records
    console.log(`\n🗑️  Deleting payment history records...`);

    // Delete payment history details first
    const deleteDetailsQuery = `
      DELETE FROM payment_history_details
      WHERE payment_history_id IN (
        SELECT id FROM payment_history
        WHERE payment_request_id = $1
      )
    `;
    const detailsResult = await client.query(deleteDetailsQuery, [paymentRequestId]);
    console.log(`   ✅ Deleted ${detailsResult.rowCount} payment history details`);

    // Delete payment history
    const deleteHistoryQuery = `
      DELETE FROM payment_history
      WHERE payment_request_id = $1
      RETURNING id
    `;
    const historyResult = await client.query(deleteHistoryQuery, [paymentRequestId]);
    console.log(`   ✅ Deleted ${historyResult.rowCount} payment history records`);

    await client.query('COMMIT');

    console.log(`\n✅ Successfully reverted payment request to confirmed status!`);
    console.log(`\n📊 Summary:`);
    console.log(`   - Payment request: ${paymentRequestId} → status = 'confirmed'`);
    console.log(`   - User balance restored: +${pr.requested_amount}`);
    console.log(`   - Conversions updated: ${conversionsResult.rowCount} → payment_status = 'pending'`);
    console.log(`   - Payment history deleted: ${historyResult.rowCount} records`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error reverting payment request:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Get payment request ID from command line
const paymentRequestId = process.argv[2] || 'eddd5886'; // Default to the test payment

console.log(`\n${'='.repeat(60)}`);
console.log(`  REVERT PAYMENT REQUEST TO CONFIRMED`);
console.log(`${'='.repeat(60)}\n`);

revertPaymentToConfirmed(paymentRequestId)
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  });
