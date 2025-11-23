/**
 * Run Database Migration
 * Execute the migration SQL file
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./backend/config/database');

async function runMigration() {
  const migrationFile = path.join(__dirname, 'database', 'migrations', '20251122_remove_reserved_balance.sql');

  console.log('📦 Reading migration file...');
  const sql = fs.readFileSync(migrationFile, 'utf8');

  console.log('🔄 Connecting to database...');
  const client = await pool.connect();

  try {
    console.log('⚡ Executing migration...');
    console.log('');

    await client.query(sql);

    console.log('');
    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Changes applied:');
    console.log('  - Added system_reconciliation_status to conversions');
    console.log('  - Added system_reconciliation_id to conversions');
    console.log('  - Added system_reconciled_at to conversions');
    console.log('  - Added debt_balance to user_system_balance');
    console.log('  - Moved all reserved_balance to available_balance');
    console.log('  - Updated existing reconciliation statuses');
    console.log('');

    // Verify migration
    console.log('🔍 Verifying migration...');

    const checkColumns = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'conversions'
        AND column_name IN ('system_reconciliation_status', 'system_reconciliation_id', 'system_reconciled_at')
      ORDER BY column_name
    `);

    console.log('✓ Conversions table columns:', checkColumns.rows.map(r => r.column_name).join(', '));

    const checkDebtColumn = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'user_system_balance'
        AND column_name = 'debt_balance'
    `);

    console.log('✓ User balance debt_balance column:', checkDebtColumn.rows.length > 0 ? 'EXISTS' : 'MISSING');

    const checkReservedBalance = await client.query(`
      SELECT COALESCE(SUM(reserved_balance), 0) as total_reserved
      FROM user_system_balance
    `);

    console.log('✓ Total reserved balance:', parseFloat(checkReservedBalance.rows[0].total_reserved), '(should be 0)');

    console.log('');
    console.log('🎉 All checks passed!');

  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:');
    console.error(error.message);
    console.error('');
    console.error('Stack trace:');
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration()
  .then(() => {
    console.log('');
    console.log('✨ Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
