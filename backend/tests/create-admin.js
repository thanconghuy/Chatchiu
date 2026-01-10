const bcrypt = require('bcrypt');
const db = require('../config/database');
const crypto = require('crypto');

async function createAdmin() {
  try {
    const userId = crypto.randomUUID();
    const hash = await bcrypt.hash('Admin123456', 10);

    const result = await db.pool.query(`
      INSERT INTO users (id, email, username, password_hash, full_name, is_admin, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
      ON CONFLICT (email)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        is_admin = true
      RETURNING id, email, full_name
    `, [userId, 'admin@test.com', 'admin_test', hash, 'Admin Test']);

    console.log('\n✅ Admin account ready!\n');
    console.log('Login at: http://localhost:3007/admin/login');
    console.log('Email: admin@test.com');
    console.log('Password: Admin123456');
    console.log('Name:', result.rows[0].full_name);
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

createAdmin();
