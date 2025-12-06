/**
 * Generate new JWT token for testing
 * Usage: node backend/generate-new-token.js
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('./config/database');

// SECURITY: JWT_SECRET is required
if (!process.env.JWT_SECRET) {
  console.error('❌ CRITICAL: JWT_SECRET environment variable is required');
  console.error('   Generate secure secret: openssl rand -base64 32');
  console.error('   Add to .env file: JWT_SECRET=<your-secret-here>');
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

async function generateToken() {
  try {
    // Find admin user
    const result = await pool.query(
      "SELECT id, email, role, full_name FROM users WHERE email = $1 AND role = 'admin'",
      ['test@gmail.com']
    );

    if (result.rows.length === 0) {
      console.log('❌ Admin user not found: test@gmail.com');
      process.exit(1);
    }

    const user = result.rows[0];
    console.log('\n✅ User found:');
    console.log('   Email:', user.email);
    console.log('   Role:', user.role);
    console.log('   Name:', user.full_name);
    console.log();

    // Generate token (valid for 1 year)
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role
      },
      JWT_SECRET,
      { expiresIn: '365d' }
    );

    console.log('🔑 New Token (valid for 1 year):');
    console.log('==================================================');
    console.log(token);
    console.log('==================================================');
    console.log();
    console.log('📋 To use this token:');
    console.log('1. Open browser DevTools (F12)');
    console.log('2. Go to Console tab');
    console.log('3. Run: localStorage.setItem("cashback_token", "' + token + '")');
    console.log('4. Refresh the page');
    console.log();

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

generateToken();
