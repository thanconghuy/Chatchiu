/**
 * Generate fresh admin token
 * Run: node backend/scripts/generate-admin-token.js
 */

const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
require('dotenv').config();

async function generateAdminToken() {
  try {
    // Get admin user (you)
    const result = await pool.query(`
      SELECT id, email, username, full_name, is_admin
      FROM users
      WHERE is_admin = true
      ORDER BY created_at ASC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      console.error('❌ No admin user found!');
      process.exit(1);
    }

    const user = result.rows[0];

    // Generate new token (7 days expiry)
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        username: user.username,
        fullName: user.full_name
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('\n✅ NEW TOKEN GENERATED!\n');
    console.log('User:', user.email);
    console.log('Admin:', user.is_admin ? 'Yes' : 'No');
    console.log('\n🔑 Copy this token:\n');
    console.log(token);
    console.log('\n📋 Run this in Browser Console (F12):\n');
    console.log(`localStorage.setItem('token', '${token}');\nwindow.location.reload();`);
    console.log('\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

generateAdminToken();
