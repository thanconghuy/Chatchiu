/**
 * Generate new JWT token for admin user
 * Usage: node backend/generate-admin-token.js [email]
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('./config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

async function generateToken() {
  try {
    // Get email from args or use default
    const email = process.argv[2] || 'admin@cashback.com';

    // Find admin user
    const result = await pool.query(
      `SELECT id, email, is_admin, full_name, username FROM users WHERE email = $1 AND is_admin = true`,
      [email]
    );

    if (result.rows.length === 0) {
      console.log(`❌ Admin user not found: ${email}`);
      console.log('\nAvailable admin users:');

      const adminsResult = await pool.query(
        `SELECT email FROM users WHERE is_admin = true`
      );

      adminsResult.rows.forEach((user, i) => {
        console.log(`  ${i + 1}. ${user.email}`);
      });

      process.exit(1);
    }

    const user = result.rows[0];
    console.log('\n✅ User found:');
    console.log('   Email:', user.email);
    console.log('   Is Admin:', user.is_admin);
    console.log('   Name:', user.full_name);
    console.log();

    // Generate token (valid for 1 year)
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    console.log('🔑 New Token (valid for 1 year):');
    console.log('==================================================');
    console.log(token);
    console.log('==================================================');
    console.log();
    console.log('📋 To use this token in browser:');
    console.log('1. Open DevTools (F12) → Console tab');
    console.log('2. Run:');
    console.log(`   localStorage.setItem("cashback_token", "${token}")`);
    console.log('3. Refresh the page');
    console.log();
    console.log('🧪 Test with curl:');
    console.log(`curl -X GET "http://localhost:3007/api/admin/system-reconciliation/stats" -H "Authorization: Bearer ${token}"`);
    console.log();

  } catch (error) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

generateToken();
