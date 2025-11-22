/**
 * Find all admin users
 */

require('dotenv').config();
const pool = require('./config/database');

async function findAdmins() {
  try {
    // Find all admin users
    const result = await pool.query(`
      SELECT id, email, full_name, is_admin, created_at
      FROM users
      WHERE is_admin = true
      ORDER BY created_at DESC
    `);

    console.log('\n👥 Admin users found:', result.rows.length);
    console.log('==================================================');

    if (result.rows.length === 0) {
      console.log('❌ No admin users found!');
      console.log('\nLet\'s check all users:');

      const allResult = await pool.query(`
        SELECT id, email, full_name, is_admin
        FROM users
        ORDER BY created_at DESC
        LIMIT 10
      `);

      console.log('\n📋 All users (latest 10):');
      allResult.rows.forEach((user, i) => {
        console.log(`${i + 1}. ${user.email} - is_admin: ${user.is_admin}`);
      });
    } else {
      result.rows.forEach((user, i) => {
        console.log(`${i + 1}. Email: ${user.email}`);
        console.log(`   Name: ${user.full_name}`);
        console.log(`   ID: ${user.id}`);
        console.log(`   Created: ${user.created_at}`);
        console.log();
      });
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

findAdmins();
