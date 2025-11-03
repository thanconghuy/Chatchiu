/**
 * Script to create admin user
 * Run: node create-admin.js
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');
const bcrypt = require('bcrypt');

async function createAdmin() {
  try {
    console.log('🔧 Creating admin user...\n');

    // Admin credentials
    const email = 'admin@cashback.com';
    const password = 'admin123'; // Change this!
    const username = 'admin';
    const fullName = 'System Admin';

    // Check if admin exists
    const existingUser = await pool.query(
      'SELECT id, email, is_admin FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      const user = existingUser.rows[0];

      if (user.is_admin) {
        console.log('✅ Admin user already exists!');
        console.log(`   Email: ${user.email}`);
        console.log(`   Password: ${password} (if not changed)`);
        console.log('\n📌 Use these credentials to login at: http://localhost:3007/dev-login\n');
        return;
      }

      // Update existing user to admin
      await pool.query(
        'UPDATE users SET is_admin = true WHERE email = $1',
        [email]
      );
      console.log('✅ Updated existing user to admin!');
      console.log(`   Email: ${email}`);
      console.log(`   Use your existing password to login`);
      console.log('\n📌 Login at: http://localhost:3007/dev-login\n');
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create admin user
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, username, full_name, is_admin, available_balance, pending_balance, total_cashback)
       VALUES ($1, $2, $3, $4, true, 0, 0, 0)
       RETURNING id, email, username, full_name, is_admin`,
      [email, passwordHash, username, fullName]
    );

    const newUser = result.rows[0];

    console.log('✅ Admin user created successfully!\n');
    console.log('📝 Credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Username: ${username}`);
    console.log(`   Full Name: ${fullName}`);
    console.log('\n⚠️  IMPORTANT: Change the password after first login!\n');
    console.log('📌 Login at: http://localhost:3007/dev-login\n');

  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    console.error(error);
  } finally {
    await pool.end();
    process.exit();
  }
}

// Run the script
createAdmin();
