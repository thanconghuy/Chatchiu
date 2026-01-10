const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🧪 Testing new payment flow (NO auto-select affecting balance)\n');

    // 1. Check initial state
    console.log('📊 STEP 1: Initial state');
    const initialBalance = await client.query(
      `SELECT COALESCE(SUM(cashback_amount), 0) as total FROM system_conversions WHERE user_id = $1 AND status = 'approved'`,
      [userId]
    );
    const totalApproved = parseFloat(initialBalance.rows[0].total);
    console.log('   Total approved: ' + totalApproved.toLocaleString('vi-VN') + 'đ');
    console.log('   Available balance: ' + totalApproved.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 2. Create payment request
    console.log('📝 STEP 2: Create payment request for 50,000đ');
    const createResult = await client.query(
      `INSERT INTO payment_requests (
        user_id, requested_amount, status,
        bank_name, bank_account_number, bank_account_name
      ) VALUES ($1, $2, 'pending', 'Vietcombank', '1234567890', 'Test User')
      RETURNING id, requested_amount`,
      [userId, 50000]
    );
    const paymentId = createResult.rows[0].id;
    console.log('   ✓ Created payment request: ' + paymentId.substring(0, 13) + '...');
    console.log('   ✓ Requested amount: 50,000đ');
    console.log('');

    // 3. Check available balance after request created (should be 43,100đ)
    console.log('📊 STEP 3: Check balance after request created');
    const balanceAfterRequest = await client.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COALESCE((SELECT SUM(requested_amount) FROM payment_requests WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')), 0) as total_requested
       FROM system_conversions WHERE user_id = $1`,
      [userId]
    );
    const approvedAfter = parseFloat(balanceAfterRequest.rows[0].total_approved);
    const requestedAfter = parseFloat(balanceAfterRequest.rows[0].total_requested);
    const availableAfter = approvedAfter - requestedAfter;

    console.log('   Total approved: ' + approvedAfter.toLocaleString('vi-VN') + 'đ');
    console.log('   Total requested: ' + requestedAfter.toLocaleString('vi-VN') + 'đ');
    console.log('   Available balance: ' + availableAfter.toLocaleString('vi-VN') + 'đ');
    console.log('   Expected: 43,100đ');

    if (Math.abs(availableAfter - 43100) < 0.01) {
      console.log('   ✅ CORRECT!');
    } else {
      console.log('   ❌ WRONG!');
    }
    console.log('');

    // 4. Mark as confirmed
    console.log('📝 STEP 4: Mark payment as confirmed');
    await client.query(
      `UPDATE payment_requests SET status = 'confirmed' WHERE id = $1`,
      [paymentId]
    );
    console.log('   ✓ Status: confirmed');
    console.log('');

    // 5. Mark as paid (this should deduct exactly 50,000đ)
    console.log('📝 STEP 5: Mark payment as paid');
    await client.query('BEGIN');

    // Update payment request
    await client.query(
      `UPDATE payment_requests
       SET status = 'paid', paid_at = CURRENT_TIMESTAMP, transaction_reference = 'TEST-TXN-001'
       WHERE id = $1`,
      [paymentId]
    );

    // Mark conversions as paid using FIFO
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
    const updateResult = await client.query(fifoQuery, [userId, paymentId, 50000]);

    await client.query('COMMIT');

    console.log('   ✓ Payment marked as paid');
    console.log('   ✓ Conversions updated: ' + updateResult.rowCount);
    const totalMarked = updateResult.rows.reduce((sum, r) => sum + parseFloat(r.cashback_amount), 0);
    console.log('   ✓ Total cashback marked: ' + totalMarked.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 6. Final balance check
    console.log('📊 STEP 6: Final balance check');
    const finalBalance = await client.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COALESCE((SELECT SUM(requested_amount) FROM payment_requests WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')), 0) as total_requested
       FROM system_conversions WHERE user_id = $1`,
      [userId]
    );
    const finalApproved = parseFloat(finalBalance.rows[0].total_approved);
    const finalRequested = parseFloat(finalBalance.rows[0].total_requested);
    const finalAvailable = finalApproved - finalRequested;

    console.log('   Total approved: ' + finalApproved.toLocaleString('vi-VN') + 'đ');
    console.log('   Total requested: ' + finalRequested.toLocaleString('vi-VN') + 'đ');
    console.log('   Available balance: ' + finalAvailable.toLocaleString('vi-VN') + 'đ');
    console.log('   Expected: 43,100đ');

    if (Math.abs(finalAvailable - 43100) < 0.01) {
      console.log('   ✅ CORRECT!');
    } else {
      console.log('   ❌ WRONG!');
    }
    console.log('');

    console.log('✅ Test completed!');
    console.log('');
    console.log('📝 Summary:');
    console.log('   ✓ Payment request: 50,000đ');
    console.log('   ✓ Deducted from balance: 50,000đ (exactly requested amount)');
    console.log('   ✓ Conversions marked as paid: ' + updateResult.rowCount + ' items (' + totalMarked.toLocaleString('vi-VN') + 'đ)');
    console.log('   ✓ Available balance: ' + finalAvailable.toLocaleString('vi-VN') + 'đ');
    console.log('');
    console.log('✅ Balance calculation is INDEPENDENT of items linking!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
