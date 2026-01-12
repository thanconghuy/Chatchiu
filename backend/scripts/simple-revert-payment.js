const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.NEON_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }
});

async function revert() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const paymentRequestId = 'eddd5886';

    // Get amount
    const pr = await client.query('SELECT * FROM payment_requests WHERE id = $1', [paymentRequestId]);
    if (pr.rows.length === 0) {
      throw new Error('Payment request not found');
    }
    const amount = pr.rows[0].requested_amount;
    const userId = pr.rows[0].user_id;

    console.log('Payment Request:', pr.rows[0]);
    console.log('Amount:', amount);
    console.log('User ID:', userId);

    // Restore balance
    await client.query(`
      UPDATE user_system_balance
      SET available_balance = available_balance + $1,
          total_withdrawn = total_withdrawn - $1
      WHERE user_id = $2
    `, [amount, userId]);
    console.log('Balance restored');

    // Update payment request
    await client.query(`
      UPDATE payment_requests
      SET status = 'confirmed',
          paid_at = NULL,
          transaction_reference = NULL
      WHERE id = $1
    `, [paymentRequestId]);
    console.log('Payment request updated to confirmed');

    // Update conversions
    const result = await client.query(`
      UPDATE system_conversions
      SET payment_status = 'pending',
          payment_request_id = NULL,
          payment_linked_at = NULL
      WHERE payment_request_id = $1
      RETURNING id
    `, [paymentRequestId]);
    console.log('Updated conversions:', result.rowCount);

    // Delete history
    await client.query('DELETE FROM payment_history_details WHERE payment_history_id IN (SELECT id FROM payment_history WHERE payment_request_id = $1)', [paymentRequestId]);
    await client.query('DELETE FROM payment_history WHERE payment_request_id = $1', [paymentRequestId]);
    console.log('Payment history deleted');

    await client.query('COMMIT');
    console.log('SUCCESS!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

revert().then(() => process.exit(0)).catch(() => process.exit(1));
