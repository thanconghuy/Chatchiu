const { pool, testConnection, query, closePool } = require('./config/database');

/**
 * Test Database Connection and Display Table Info
 *
 * Usage: node backend/test-db.js
 * Or: npm run test-db
 */

async function displayTableInfo() {
  console.log('\n📊 Database Tables Information:\n');

  const tables = ['users', 'merchants', 'clicks', 'conversions'];

  for (const table of tables) {
    try {
      const result = await query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`  ✓ ${table.padEnd(15)} | ${result.rows[0].count} rows`);
    } catch (error) {
      console.log(`  ✗ ${table.padEnd(15)} | Table not found or error`);
    }
  }

  console.log('');
}

async function displayMerchants() {
  console.log('🏪 Available Merchants:\n');

  try {
    const result = await query(`
      SELECT id, name, commission_rate, is_active, campaign_id
      FROM merchants
      ORDER BY name
    `);

    if (result.rows.length === 0) {
      console.log('  No merchants found. Run "npm run init-db" to seed data.\n');
      return;
    }

    result.rows.forEach((merchant, index) => {
      const active = merchant.is_active ? '✅' : '❌';
      console.log(`  ${index + 1}. ${active} ${merchant.name.padEnd(15)} | ${merchant.commission_rate.padEnd(8)} | Campaign: ${merchant.campaign_id}`);
    });

    console.log('');
  } catch (error) {
    console.log('  ⚠️  Merchants table not found. Run "npm run init-db" first.\n');
  }
}

async function displaySampleUser() {
  console.log('👤 Sample Users:\n');

  try {
    const result = await query(`
      SELECT username, email, full_name, available_balance, pending_balance, total_cashback
      FROM users
      LIMIT 5
    `);

    if (result.rows.length === 0) {
      console.log('  No users found.\n');
      return;
    }

    result.rows.forEach((user, index) => {
      console.log(`  ${index + 1}. @${user.username.padEnd(15)} | ${user.email.padEnd(25)} | Balance: ${user.available_balance} VNĐ`);
    });

    console.log('');
  } catch (error) {
    console.log('  ⚠️  Users table not found. Run "npm run init-db" first.\n');
  }
}

async function testQueries() {
  console.log('🔍 Testing Sample Queries:\n');

  try {
    // Test 1: Get database version
    const versionResult = await query('SELECT version()');
    console.log('  ✓ PostgreSQL Version:', versionResult.rows[0].version.split(' ')[1]);

    // Test 2: Get current database name
    const dbResult = await query('SELECT current_database()');
    console.log('  ✓ Current Database:', dbResult.rows[0].current_database);

    // Test 3: List all tables
    const tablesResult = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    console.log('  ✓ Tables in database:', tablesResult.rows.map(r => r.table_name).join(', '));

    console.log('');
  } catch (error) {
    console.log('  ✗ Error testing queries:', error.message);
  }
}

async function main() {
  console.log('\n🔧 Database Connection Test\n');
  console.log('='.repeat(60));

  try {
    // Test connection
    const connected = await testConnection();

    if (!connected) {
      console.log('\n❌ Cannot connect to database. Please check your DATABASE_URL in .env file\n');
      return;
    }

    console.log('='.repeat(60));

    // Display information
    await testQueries();
    await displayTableInfo();
    await displayMerchants();
    await displaySampleUser();

    console.log('='.repeat(60));
    console.log('\n✅ All tests completed!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('\nTip: Make sure you have set DATABASE_URL in your .env file');
    console.error('Format: postgres://username:password@host/database?sslmode=require\n');
  } finally {
    await closePool();
  }
}

// Run if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { main };
