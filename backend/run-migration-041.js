/**
 * Run Migration 041: Fix eligible conversions check
 *
 * This migration fixes the get_eligible_conversions_for_waiting_list() function
 * to also check system_reconciliation_items table, preventing orders that are
 * already in a reconciliation from appearing as eligible.
 *
 * Also cleans up any existing waiting list entries that are already reconciled.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('./config/database');

async function runMigration() {
  console.log('='.repeat(60));
  console.log('Migration 041: Fix Eligible Conversions Check');
  console.log('='.repeat(60));

  // Test connection first
  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Read and execute migration SQL
    console.log('\n📄 Reading migration file...');
    const migrationPath = path.join(__dirname, 'migrations', '041_fix_eligible_check_reconciliation_items.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('🔧 Executing migration...');
    await client.query(migrationSQL);
    console.log('✅ Migration functions updated');

    // 2. Clean up waiting list - remove entries that are already reconciled
    console.log('\n🧹 Cleaning up waiting list...');

    // Find entries in waiting list that are already in reconciliation items
    const duplicatesQuery = `
      SELECT rwl.id, rwl.system_conversion_id, rwl.order_code, sri.system_reconciliation_id
      FROM reconciliation_waiting_list rwl
      INNER JOIN system_reconciliation_items sri ON rwl.system_conversion_id = sri.system_conversion_id
    `;
    const duplicates = await client.query(duplicatesQuery);
    console.log(`   Found ${duplicates.rows.length} entries in waiting list that are already reconciled`);

    if (duplicates.rows.length > 0) {
      // Log them
      console.log('\n   Orders to be removed from waiting list:');
      duplicates.rows.forEach((row, index) => {
        if (index < 10) {
          console.log(`     - ${row.order_code || 'N/A'} (reconciliation: ${row.system_reconciliation_id})`);
        }
      });
      if (duplicates.rows.length > 10) {
        console.log(`     ... and ${duplicates.rows.length - 10} more`);
      }

      // Delete them
      const deleteQuery = `
        DELETE FROM reconciliation_waiting_list rwl
        WHERE EXISTS (
          SELECT 1 FROM system_reconciliation_items sri
          WHERE sri.system_conversion_id = rwl.system_conversion_id
        )
      `;
      const deleteResult = await client.query(deleteQuery);
      console.log(`   ✅ Removed ${deleteResult.rowCount} duplicate entries from waiting list`);
    }

    // 3. Also remove entries where system_conversions.system_reconciliation_id is set
    const secondCleanupQuery = `
      DELETE FROM reconciliation_waiting_list rwl
      WHERE EXISTS (
        SELECT 1 FROM system_conversions sc
        WHERE sc.id = rwl.system_conversion_id
          AND sc.system_reconciliation_id IS NOT NULL
      )
    `;
    const secondCleanup = await client.query(secondCleanupQuery);
    if (secondCleanup.rowCount > 0) {
      console.log(`   ✅ Removed ${secondCleanup.rowCount} more entries (system_reconciliation_id was set)`);
    }

    // 4. Verify the fix
    console.log('\n🔍 Verifying fix...');
    const verifyQuery = `
      SELECT COUNT(*) as count
      FROM get_eligible_conversions_for_waiting_list() e
      WHERE EXISTS (
        SELECT 1 FROM system_reconciliation_items sri
        WHERE sri.system_conversion_id = e.conversion_id
      )
    `;
    const verify = await client.query(verifyQuery);
    const stillDuplicate = parseInt(verify.rows[0].count);

    if (stillDuplicate > 0) {
      console.log(`   ⚠️  Warning: Still found ${stillDuplicate} eligible orders that are in reconciliation items`);
    } else {
      console.log('   ✅ No duplicate eligible orders found');
    }

    // 5. Show current stats
    console.log('\n📊 Current Stats:');

    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM reconciliation_waiting_list) as waiting_list_count,
        (SELECT COUNT(*) FROM system_reconciliation_items) as reconciliation_items_count,
        (SELECT COUNT(*) FROM get_eligible_conversions_for_waiting_list()) as eligible_count,
        (SELECT COUNT(*) FROM system_conversions WHERE status = 'approved' AND system_reconciliation_id IS NULL) as unreconciled_approved
    `;
    const stats = await client.query(statsQuery);
    const s = stats.rows[0];
    console.log(`   - Waiting list entries: ${s.waiting_list_count}`);
    console.log(`   - Reconciliation items: ${s.reconciliation_items_count}`);
    console.log(`   - Eligible for waiting list: ${s.eligible_count}`);
    console.log(`   - Unreconciled approved orders: ${s.unreconciled_approved}`);

    await client.query('COMMIT');
    console.log('\n✅ Migration 041 completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the migration
runMigration().catch(console.error);
