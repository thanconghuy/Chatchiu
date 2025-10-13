require('dotenv').config();
const { pool } = require('../config/database');

/**
 * Set user as admin by email or username
 * Usage: node backend/migrations/set-admin.js <email_or_username>
 */
async function setAdmin() {
  try {
    const identifier = process.argv[2];

    if (!identifier) {
      console.error('Usage: node backend/migrations/set-admin.js <email_or_username>');
      process.exit(1);
    }

    console.log(`Setting admin for: ${identifier}`);

    // Try to find user by email or username
    const result = await pool.query(`
      UPDATE users
      SET is_admin = true
      WHERE email = $1 OR username = $1
      RETURNING id, email, username, is_admin;
    `, [identifier]);

    if (result.rows.length > 0) {
      console.log('✅ User updated to admin:');
      console.log(result.rows[0]);
    } else {
      console.log('❌ User not found:', identifier);
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

setAdmin();
