const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');

async function checkTestUser() {
  try {
    console.log('🔍 Checking test user balance...\n');

    // Find test user
    const userResult = await pool.query(`
      SELECT id, email, full_name FROM users
      WHERE email = 'testuser@test.com'
      LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      console.log('❌ Test user not found!');
      console.log('Please create user with email: testuser@test.com');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log('✅ Found user:', user);
    console.log('   User ID:', user.id);
    console.log('   Email:', user.email);
    console.log('   Name:', user.full_name);
    console.log('');

    // Check balance record
    const balanceResult = await pool.query(`
      SELECT * FROM user_system_balance
      WHERE user_id = $1
    `, [user.id]);

    if (balanceResult.rows.length === 0) {
      console.log('❌ No balance record found!');
      console.log('Creating balance record...');

      await pool.query(`
        INSERT INTO user_system_balance (
          user_id,
          available_balance,
          total_earned,
          total_withdrawn,
          pending_balance,
          reserved_balance,
          debt_balance
        ) VALUES ($1, 0, 0, 0, 0, 0, 0)
      `, [user.id]);

      console.log('✅ Balance record created with 0 balance');
    } else {
      const balance = balanceResult.rows[0];
      console.log('✅ Balance record found:');
      console.log('   Available:', balance.available_balance);
      console.log('   Total Earned:', balance.total_earned);
      console.log('   Total Withdrawn:', balance.total_withdrawn);
      console.log('   Pending:', balance.pending_balance);
      console.log('   Reserved:', balance.reserved_balance);
      console.log('   Debt:', balance.debt_balance);
    }

    console.log('\n✅ Check complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkTestUser();
