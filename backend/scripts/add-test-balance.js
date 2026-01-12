const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');

const TEST_USER_ID = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

async function addTestBalance() {
  const client = await pool.connect();

  try {
    console.log('🔧 Adding test balance to user...\n');

    await client.query('BEGIN');

    // Get current balance
    const currentResult = await client.query(`
      SELECT * FROM user_system_balance WHERE user_id = $1 FOR UPDATE
    `, [TEST_USER_ID]);

    const current = currentResult.rows[0];
    console.log('Current Balance:');
    console.log('  Available:', parseFloat(current.available_balance).toLocaleString('vi-VN') + 'đ');
    console.log('  Total Earned:', parseFloat(current.total_earned).toLocaleString('vi-VN') + 'đ');
    console.log('  Total Withdrawn:', parseFloat(current.total_withdrawn).toLocaleString('vi-VN') + 'đ');
    console.log('');

    // Add 100,000đ to test
    const addAmount = 100000;

    await client.query(`
      UPDATE user_system_balance
      SET available_balance = available_balance + $2,
          total_earned = total_earned + $2,
          updated_at = NOW()
      WHERE user_id = $1
    `, [TEST_USER_ID, addAmount]);

    console.log(`✅ Added ${addAmount.toLocaleString('vi-VN')}đ to balance\n`);

    await client.query('COMMIT');

    // Get new balance
    const newResult = await client.query(`
      SELECT * FROM user_system_balance WHERE user_id = $1
    `, [TEST_USER_ID]);

    const newBalance = newResult.rows[0];
    console.log('New Balance:');
    console.log('  Available:', parseFloat(newBalance.available_balance).toLocaleString('vi-VN') + 'đ');
    console.log('  Total Earned:', parseFloat(newBalance.total_earned).toLocaleString('vi-VN') + 'đ');
    console.log('  Total Withdrawn:', parseFloat(newBalance.total_withdrawn).toLocaleString('vi-VN') + 'đ');

    console.log('\n✅ Test balance added successfully!');
    process.exit(0);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    client.release();
  }
}

addTestBalance();
