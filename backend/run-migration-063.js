require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await pool.connect();

  try {
    console.log('=== RUNNING MIGRATION 063 ===\n');
    console.log('Fix: Balance sync to only count RECONCILED conversions\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '063_fix_balance_sync_only_reconciled.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📁 Loaded migration file');
    console.log('🚀 Executing migration...\n');

    // Execute migration
    await client.query(migrationSQL);

    console.log('\n✅ Migration 063 completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
