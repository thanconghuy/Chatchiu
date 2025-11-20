/**
 * Run Migration 012: Create user_activity_logs table
 *
 * Usage: node backend/run-migration-012.js
 */

const { pool, testConnection, closePool } = require('./config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  console.log('\n🚀 Running Migration 012: Create user_activity_logs table...\n');

  try {
    // Test connection
    const connected = await testConnection();
    if (!connected) {
      throw new Error('Cannot connect to database');
    }

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '012_create_user_activity_logs.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    // Execute migration
    console.log('📝 Creating user_activity_logs table...');
    await pool.query(migrationSQL);
    console.log('✅ user_activity_logs table created successfully');

    // Verify table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'user_activity_logs'
      );
    `);

    if (checkTable.rows[0].exists) {
      console.log('✅ Verified: user_activity_logs table exists');

      // Get column info
      const columns = await pool.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'user_activity_logs'
        ORDER BY ordinal_position;
      `);

      console.log('\n📊 Table structure:');
      columns.rows.forEach(col => {
        console.log(`  • ${col.column_name}: ${col.data_type}`);
      });
    }

    console.log('\n✅ Migration 012 completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    throw error;
  } finally {
    await closePool();
  }
}

// Run if called directly
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = runMigration;
