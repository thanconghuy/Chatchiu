require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');
const fs = require('fs');
const path = require('path');

(async () => {
  const client = await pool.connect();

  try {
    console.log('=== RUNNING MIGRATION 064 ===\n');
    console.log('Fix: Timezone consistency for auto_sync tables\n');

    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '064_fix_timezone_consistency.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📁 Loaded migration file');
    console.log('🚀 Executing migration...\n');

    // Execute migration
    await client.query(migrationSQL);

    console.log('\n✅ Migration 064 completed successfully!\n');

    // Verify
    console.log('📊 Verifying data types:\n');
    const result = await client.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name IN ('auto_sync_config', 'auto_sync_history')
        AND column_name IN ('last_run_at', 'sync_started_at', 'sync_completed_at', 'created_at')
      ORDER BY table_name, column_name
    `);

    result.rows.forEach(row => {
      console.log(`${row.table_name}.${row.column_name}: ${row.data_type}`);
    });

    console.log('\n✅ Done!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
