#!/usr/bin/env node

/**
 * Script to check registered users in database
 * Run: node check-users.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  connectionTimeoutMillis: 20000,
});

async function checkUsers() {
  try {
    console.log('🔍 Checking users in database...\n');

    // Get total users
    const countResult = await pool.query('SELECT COUNT(*) as total FROM users');
    const totalUsers = parseInt(countResult.rows[0].total);

    console.log(`📊 Total users: ${totalUsers}\n`);

    if (totalUsers === 0) {
      console.log('❌ No users found in database');
      console.log('💡 Try registering at: http://localhost:3000/register\n');
      process.exit(0);
    }

    // Get all users
    const usersResult = await pool.query(`
      SELECT
        id,
        email,
        username,
        full_name,
        phone,
        available_balance,
        pending_balance,
        total_cashback,
        is_admin,
        created_at,
        CASE WHEN neon_auth_id IS NOT NULL THEN 'Yes' ELSE 'No' END as has_neon_auth
      FROM users
      ORDER BY created_at DESC
    `);

    console.log('👥 Registered Users:\n');
    console.log('═'.repeat(100));

    usersResult.rows.forEach((user, index) => {
      console.log(`\n${index + 1}. ${user.full_name} (@${user.username})`);
      console.log(`   Email: ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Phone: ${user.phone || 'Not provided'}`);
      console.log(`   Admin: ${user.is_admin ? 'Yes' : 'No'}`);
      console.log(`   Neon Auth: ${user.has_neon_auth}`);
      console.log(`   Balance: ${user.available_balance} VND (Available), ${user.pending_balance} VND (Pending)`);
      console.log(`   Total Cashback: ${user.total_cashback} VND`);
      console.log(`   Created: ${new Date(user.created_at).toLocaleString('vi-VN')}`);
    });

    console.log('\n' + '═'.repeat(100));
    console.log(`\n✅ Found ${totalUsers} user(s)\n`);

    // Get latest user
    const latestUser = usersResult.rows[0];
    console.log('🆕 Latest registered user:');
    console.log(`   ${latestUser.full_name} (${latestUser.email})`);
    console.log(`   ${new Date(latestUser.created_at).toLocaleString('vi-VN')}\n`);

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Troubleshooting:');
    console.error('   1. Check .env file has correct DATABASE_URL');
    console.error('   2. Verify database is accessible');
    console.error('   3. Run: npm run init-db (to initialize tables)\n');

    await pool.end();
    process.exit(1);
  }
}

checkUsers();
