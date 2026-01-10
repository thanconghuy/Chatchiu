const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
    const paymentId = 'eddd5086-2824-4a6f-a21b-3dfb18d94399';

    console.log('🔧 Fixing balance discrepancy for payment', paymentId.substring(0, 13) + '...\n');

    // Get actual linked amount
    const linkedResult = await client.query(
      `SELECT COALESCE(SUM(cashback_amount), 0) as total_linked
       FROM payment_system_reconciliation_mapping WHERE payment_request_id = $1`,
      [paymentId]
    );
    const actualLinked = parseFloat(linkedResult.rows[0].total_linked);

    // Get requested amount
    const paymentResult = await client.query(
      `SELECT requested_amount FROM payment_requests WHERE id = $1`,
      [paymentId]
    );
    const requested = parseFloat(paymentResult.rows[0].requested_amount);

    const discrepancy = actualLinked - requested;

    console.log('📊 Payment details:');
    console.log('  Requested amount:', requested.toLocaleString('vi-VN') + 'đ');
    console.log('  Actual linked:', actualLinked.toLocaleString('vi-VN') + 'đ');
    console.log('  Discrepancy:', discrepancy.toLocaleString('vi-VN') + 'đ');
    console.log('');

    if (Math.abs(discrepancy) < 0.01) {
      console.log('✅ No discrepancy found');
      await client.query('ROLLBACK');
      return;
    }

    // Deduct the additional amount from user_system_balance
    console.log('💰 Adjusting user_system_balance...');
    const updateBalanceResult = await client.query(
      `UPDATE user_system_balance
       SET
         available_balance = available_balance - $1,
         total_withdrawn = total_withdrawn + $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING available_balance, total_withdrawn`,
      [discrepancy, userId]
    );

    if (updateBalanceResult.rows.length === 0) {
      throw new Error('user_system_balance not found');
    }

    const newBalance = updateBalanceResult.rows[0];
    console.log('  New available_balance:', parseFloat(newBalance.available_balance).toLocaleString('vi-VN') + 'đ');
    console.log('  New total_withdrawn:', parseFloat(newBalance.total_withdrawn).toLocaleString('vi-VN') + 'đ');
    console.log('');

    // Log the adjustment in user_balance_transactions
    console.log('📝 Logging balance transaction...');
    const balanceBefore = parseFloat(newBalance.available_balance) + discrepancy;
    await client.query(
      `INSERT INTO user_balance_transactions
       (user_id, transaction_type, amount, balance_before, balance_after, description, payment_request_id, created_at)
       VALUES ($1, 'withdrawal_adjustment', $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
      [
        userId,
        discrepancy,
        balanceBefore,
        parseFloat(newBalance.available_balance),
        'Điều chỉnh số dư do sai lệch giữa requested amount và actual linked items',
        paymentId
      ]
    );

    await client.query('COMMIT');

    console.log('✅ Balance discrepancy fixed successfully!');
    console.log('');
    console.log('📊 Final summary:');
    console.log('  Total approved: 93,100đ');
    console.log('  Total withdrawn:', (50000 + discrepancy).toLocaleString('vi-VN') + 'đ');
    console.log('  Available balance:', parseFloat(newBalance.available_balance).toLocaleString('vi-VN') + 'đ');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
