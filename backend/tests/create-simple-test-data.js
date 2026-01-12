/**
 * Tạo test data đơn giản nhất - chỉ cần đủ để test payment flow
 * Không tạo clicks/conversions phức tạp, chỉ tạo balance và reconciliation đơn giản
 */

const bcrypt = require('bcrypt');
const db = require('../config/database');
const crypto = require('crypto');

async function createSimpleTestData() {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔨 Tạo dữ liệu test đơn giản');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 1. Create/Update test user
    console.log('1️⃣ Tạo test user...');
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('Test123456', 10);

    await client.query(`
      INSERT INTO users (id, email, username, password_hash, full_name, is_admin, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        updated_at = NOW()
      RETURNING id
    `, [userId, 'testuser@test.com', 'testuser_e2e', hash, 'Test User E2E']);

    // Get actual user ID
    const userResult = await client.query(`SELECT id FROM users WHERE email = 'testuser@test.com'`);
    const actualUserId = userResult.rows[0].id;

    console.log('   ✅ User ID:', actualUserId);

    // 2. Set balance = 100,000đ (test balance)
    console.log('\n2️⃣ Tạo balance: 100,000đ...');

    await client.query(`
      INSERT INTO user_system_balance (
        user_id, available_balance, pending_balance,
        reserved_balance, debt_balance,
        total_earned, total_withdrawn,
        updated_at
      )
      VALUES ($1, 100000, 0, 0, 0, 100000, 0, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        available_balance = 100000,
        total_earned = 100000,
        total_withdrawn = 0,
        updated_at = NOW()
    `, [actualUserId]);

    console.log('   ✅ Balance: 100,000đ (test balance - không tính từ conversions thực)');

    // 3. Log initial balance transaction
    console.log('\n3️⃣ Ghi log balance...');

    // Delete old logs for this user
    await client.query(`DELETE FROM user_balance_transactions WHERE user_id = $1`, [actualUserId]);

    await client.query(`
      INSERT INTO user_balance_transactions (
        id, user_id, transaction_type, amount,
        balance_before, balance_after,
        description, created_at
      )
      VALUES ($1, $2, 'manual_adjustment', $3, 0, $3, 'Test data - initial balance', NOW())
    `, [crypto.randomUUID(), actualUserId, 100000]);

    console.log('   ✅ Transaction log created');

    await client.query('COMMIT');

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ TẠO DỮ LIỆU THÀNH CÔNG!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 THÔNG TIN TEST USER:\n');
    console.log('User ID:', actualUserId);
    console.log('Email: testuser@test.com');
    console.log('Password: Test123456');
    console.log('Balance: 100,000đ (test balance)');
    console.log('\nLogin at: http://localhost:3007/login\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 5 BƯỚC TEST:');
    console.log('1. Login: testuser@test.com / Test123456');
    console.log('2. Tạo payment request: 50,000đ');
    console.log('3. Get ID: node backend/tests/get-latest-payment.js');
    console.log('4. Admin (admin@test.com/Admin123456) mark as paid');
    console.log('5. Verify: node backend/tests/step7-e2e-verify.js <id>\n');

    console.log('📊 Expected results:');
    console.log('   ✅ Balance: 100,000 → 50,000đ');
    console.log('   ✅ total_withdrawn: 0 → 50,000đ');
    console.log('   ✅ Transaction log created');
    console.log('   ✅ Code mới hoạt động đúng!\n');

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

createSimpleTestData();
