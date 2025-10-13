require('dotenv').config();
const { pool } = require('../config/database');

/**
 * Migration: Add is_admin field to users table
 */
async function addAdminField() {
  try {
    console.log('Adding is_admin field to users table...');

    // Add is_admin column
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
    `);

    console.log('✅ is_admin field added successfully');

    // Update testuser to be admin
    const result = await pool.query(`
      UPDATE users
      SET is_admin = true
      WHERE email = 'test@example.com'
      RETURNING email, username, is_admin;
    `);

    if (result.rows.length > 0) {
      console.log('✅ Updated test user to admin:', result.rows[0]);
    } else {
      console.log('⚠️  Test user not found');
    }

    await pool.end();
    console.log('✅ Migration completed');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

addAdminField();
