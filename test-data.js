require('dotenv').config();
const { pool } = require('./backend/config/database');

async function testData() {
  console.log('🔍 Checking database data...\n');

  try {
    // Check users
    const usersResult = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`👥 Users: ${usersResult.rows[0].count}`);

    // Check conversions
    const conversionsResult = await pool.query('SELECT COUNT(*) as count FROM conversions');
    console.log(`📦 Conversions: ${conversionsResult.rows[0].count}`);

    // Check clicks
    const clicksResult = await pool.query('SELECT COUNT(*) as count FROM clicks');
    console.log(`🖱️  Clicks: ${clicksResult.rows[0].count}`);

    // Check merchants
    const merchantsResult = await pool.query('SELECT COUNT(*) as count FROM merchants');
    console.log(`🏪 Merchants: ${merchantsResult.rows[0].count}`);

    // Show sample user
    const sampleUser = await pool.query('SELECT id, email, username, available_balance, pending_balance FROM users LIMIT 1');
    if (sampleUser.rows.length > 0) {
      console.log('\n📋 Sample user:');
      console.log(sampleUser.rows[0]);
    }

    // Show sample conversion
    const sampleConv = await pool.query('SELECT id, order_code, status, cashback_amount, order_time FROM conversions LIMIT 1');
    if (sampleConv.rows.length > 0) {
      console.log('\n📋 Sample conversion:');
      console.log(sampleConv.rows[0]);
    }

    // Check tables exist
    console.log('\n📊 Checking tables...');
    const tablesResult = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    console.log('Tables:', tablesResult.rows.map(r => r.tablename).join(', '));

    await pool.end();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

testData();
