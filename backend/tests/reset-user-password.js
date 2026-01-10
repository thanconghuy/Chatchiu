const bcrypt = require('bcrypt');
const db = require('../config/database');

async function resetPassword() {
  try {
    const hash = await bcrypt.hash('Test123456', 10);

    const result = await db.pool.query(`
      UPDATE users
      SET password_hash = $1
      WHERE email = 'exccbuy@gmail.com'
      RETURNING email, full_name
    `, [hash]);

    if (result.rows.length === 0) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    console.log('\n✅ Password reset successfully!\n');
    console.log('User:', result.rows[0].full_name);
    console.log('Email: exccbuy@gmail.com');
    console.log('New Password: Test123456');
    console.log('\nLogin at: http://localhost:3007/login\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

resetPassword();
