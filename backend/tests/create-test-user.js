const bcrypt = require('bcrypt');
const db = require('../config/database');
const crypto = require('crypto');

async function createTestUser() {
  const client = await db.pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Create test user
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('Test123456', 10);

    const userResult = await client.query(`
      INSERT INTO users (id, email, username, password_hash, full_name, is_admin, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        username = EXCLUDED.username
      RETURNING id, email, full_name
    `, [userId, 'testuser@test.com', 'testuser_e2e', hash, 'Test User E2E']);

    const user = userResult.rows[0];

    // 2. Create user_system_balance with 100,000đ
    await client.query(`
      INSERT INTO user_system_balance (
        user_id,
        available_balance,
        pending_balance,
        reserved_balance,
        debt_balance,
        total_earned,
        total_withdrawn,
        updated_at
      )
      VALUES ($1, 100000, 0, 0, 0, 100000, 0, NOW())
      ON CONFLICT (user_id)
      DO UPDATE SET
        available_balance = 100000,
        total_earned = 100000,
        total_withdrawn = 0,
        updated_at = NOW()
    `, [user.id]);

    // Note: Không tạo test conversions vì schema phức tạp với nhiều required fields
    // Thay vào đó, user này sẽ test với existing reconciliation data hoặc manual payment

    await client.query('COMMIT');

    console.log('\n✅ Test user created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 TEST USER CREDENTIALS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('User ID:', user.id);
    console.log('Name:', user.full_name);
    console.log('Email: testuser@test.com');
    console.log('Password: Test123456');
    console.log('\nBalance: 100,000đ (test balance)');
    console.log('Note: Test user - không ảnh hưởng dữ liệu thực');
    console.log('\nLogin at: http://localhost:3007/login\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('💡 Next steps for BƯỚC 7:');
    console.log('1. Login as testuser@test.com / Test123456');
    console.log('2. Create payment request: 50,000đ');
    console.log('3. Admin login: admin@test.com / Admin123456');
    console.log('4. Admin confirm & mark as paid');
    console.log('5. Verify: node backend/tests/step7-e2e-verify.js <payment-id>\n');

    process.exit(0);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error:', error.message);
    console.error('\nIf user already exists, that\'s OK - credentials are updated.');
    process.exit(1);
  } finally {
    client.release();
  }
}

createTestUser();
