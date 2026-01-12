const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
    const adjustmentAmount = 8800; // Cộng lại 8,800đ

    console.log('🔄 Reverting incorrect balance adjustment...\n');

    // Add back the 8,800đ
    const updateResult = await client.query(
      `UPDATE user_system_balance
       SET
         available_balance = available_balance + $1,
         total_withdrawn = total_withdrawn - $1,
         updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $2
       RETURNING available_balance, total_withdrawn`,
      [adjustmentAmount, userId]
    );

    if (updateResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const newBalance = updateResult.rows[0];
    console.log('✅ Balance reverted:');
    console.log('   available_balance:', parseFloat(newBalance.available_balance).toLocaleString('vi-VN') + 'đ');
    console.log('   total_withdrawn:', parseFloat(newBalance.total_withdrawn).toLocaleString('vi-VN') + 'đ');
    console.log('');

    // Log the revert
    const balanceBefore = parseFloat(newBalance.available_balance) - adjustmentAmount;
    await client.query(
      `INSERT INTO user_balance_transactions
       (user_id, transaction_type, amount, balance_before, balance_after, description, created_at)
       VALUES ($1, 'adjustment_reversal', $2, $3, $4, $5, CURRENT_TIMESTAMP)`,
      [
        userId,
        -adjustmentAmount, // negative because we're reversing
        balanceBefore,
        parseFloat(newBalance.available_balance),
        'Revert: Adjustment sai - Balance = Approved - Requested (NOT linked items)'
      ]
    );

    await client.query('COMMIT');

    console.log('📊 Correct calculation:');
    console.log('   Total approved: 93,100đ');
    console.log('   Total requested: 50,000đ');
    console.log('   Available: 43,100đ ✓');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
