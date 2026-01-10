const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🧪 Testing payment with larger balance\n');

    // 1. Check current state
    console.log('📊 STEP 1: Current state');
    const currentState = await client.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COALESCE((SELECT SUM(requested_amount) FROM payment_requests WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')), 0) as total_requested
       FROM system_conversions WHERE user_id = $1`,
      [userId]
    );
    const totalApproved = parseFloat(currentState.rows[0].total_approved);
    const totalRequested = parseFloat(currentState.rows[0].total_requested);
    const available = totalApproved - totalRequested;

    console.log('   Total approved: ' + totalApproved.toLocaleString('vi-VN') + 'đ');
    console.log('   Total requested: ' + totalRequested.toLocaleString('vi-VN') + 'đ');
    console.log('   Available balance: ' + available.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 2. Create a large payment request (100,000đ)
    const requestAmount = 100000;
    console.log('📝 STEP 2: Create payment request for ' + requestAmount.toLocaleString('vi-VN') + 'đ');

    await client.query('BEGIN');

    const createResult = await client.query(
      `INSERT INTO payment_requests (
        user_id, requested_amount, status,
        bank_name, bank_account_number, bank_account_name
      ) VALUES ($1, $2, 'confirmed', 'Vietcombank', '1234567890', 'Test User')
      RETURNING id, requested_amount`,
      [userId, requestAmount]
    );
    const paymentId = createResult.rows[0].id;
    console.log('   ✓ Created payment request: ' + paymentId.substring(0, 13) + '...');
    console.log('   ✓ Requested amount: ' + requestAmount.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 3. Mark as paid
    console.log('📝 STEP 3: Mark as paid');
    await client.query(
      `UPDATE payment_requests
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, transaction_reference = 'TEST-TXN-100K'
       WHERE id = $1`,
      [paymentId]
    );

    // Mark conversions using FIFO
    const fifoQuery = `
      WITH selected_conversions AS (
        SELECT
          id,
          cashback_amount,
          SUM(cashback_amount) OVER (
            ORDER BY order_time ASC, id ASC
            ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
          ) as running_total
        FROM system_conversions
        WHERE user_id = $1
          AND status = 'approved'
          AND (payment_status IS NULL OR payment_status = 'unpaid')
      )
      UPDATE system_conversions
      SET
        payment_status = 'paid',
        payment_request_id = $2,
        payment_linked_at = CURRENT_TIMESTAMP
      WHERE id IN (
        SELECT id FROM selected_conversions WHERE running_total <= $3
      )
      RETURNING id, cashback_amount
    `;
    const updateResult = await client.query(fifoQuery, [userId, paymentId, requestAmount]);

    await client.query('COMMIT');

    const totalMarked = updateResult.rows.reduce((sum, r) => sum + parseFloat(r.cashback_amount), 0);
    console.log('   ✓ Payment marked as paid');
    console.log('   ✓ Conversions updated: ' + updateResult.rowCount);
    console.log('   ✓ Total cashback marked: ' + totalMarked.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 4. Final balance
    console.log('📊 STEP 4: Final balance');
    const finalState = await client.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COALESCE((SELECT SUM(requested_amount) FROM payment_requests WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')), 0) as total_requested
       FROM system_conversions WHERE user_id = $1`,
      [userId]
    );
    const finalApproved = parseFloat(finalState.rows[0].total_approved);
    const finalRequested = parseFloat(finalState.rows[0].total_requested);
    const finalAvailable = finalApproved - finalRequested;

    console.log('   Total approved: ' + finalApproved.toLocaleString('vi-VN') + 'đ');
    console.log('   Total requested: ' + finalRequested.toLocaleString('vi-VN') + 'đ');
    console.log('   Available balance: ' + finalAvailable.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 5. Summary
    console.log('✅ Test completed!');
    console.log('');
    console.log('📝 Summary:');
    console.log('   Initial available: ' + available.toLocaleString('vi-VN') + 'đ');
    console.log('   Payment requested: ' + requestAmount.toLocaleString('vi-VN') + 'đ');
    console.log('   Final available: ' + finalAvailable.toLocaleString('vi-VN') + 'đ');
    console.log('   Difference: ' + (available - finalAvailable).toLocaleString('vi-VN') + 'đ');
    console.log('');
    console.log('   Conversions marked: ' + updateResult.rowCount + ' items (' + totalMarked.toLocaleString('vi-VN') + 'đ)');
    console.log('');

    if (Math.abs((available - finalAvailable) - requestAmount) < 0.01) {
      console.log('✅ Balance calculation CORRECT! Deducted exactly ' + requestAmount.toLocaleString('vi-VN') + 'đ');
    } else {
      console.log('❌ Balance calculation WRONG!');
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
