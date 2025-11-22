/**
 * Test Auth - Check current token and user info
 *
 * Usage: node backend/test-auth.js <token>
 */

require('dotenv').config();
const jwt = require('jsonwebtoken');
const pool = require('./config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-key';

async function testAuth() {
  const token = process.argv[2];

  if (!token) {
    console.log('Usage: node backend/test-auth.js <token>');
    console.log('\nYou can get token from:');
    console.log('1. Browser localStorage: localStorage.getItem("cashback_token")');
    console.log('2. Or login and copy from Network tab');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('🔐 Testing Authentication');
  console.log('='.repeat(60));
  console.log();

  try {
    // Decode token
    console.log('📋 Decoding token...');
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token is valid');
    console.log();
    console.log('Decoded payload:');
    console.log(JSON.stringify(decoded, null, 2));
    console.log();

    // Check user in database
    console.log('👤 Checking user in database...');
    const userQuery = 'SELECT id, email, role, full_name, created_at FROM users WHERE id = $1';
    const result = await pool.query(userQuery, [decoded.userId]);

    if (result.rows.length === 0) {
      console.log('❌ User not found in database');
      process.exit(1);
    }

    const user = result.rows[0];
    console.log('✅ User found:');
    console.log(JSON.stringify(user, null, 2));
    console.log();

    // Check role
    if (user.role === 'admin') {
      console.log('✅ User has ADMIN role - Can access system reconciliation');
    } else {
      console.log('❌ User role is:', user.role);
      console.log('⚠️  Need ADMIN role to access system reconciliation');
    }

    console.log();
    console.log('='.repeat(60));
    console.log('✅ Auth test completed');
    console.log('='.repeat(60));

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      console.log('❌ Invalid token:', error.message);
    } else if (error.name === 'TokenExpiredError') {
      console.log('❌ Token expired at:', error.expiredAt);
    } else {
      console.log('❌ Error:', error.message);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testAuth();
