/**
 * Run migration 068: Cleanup reconciliation data inconsistencies
 * This migration:
 *   1. Removes orphan items (NULL system_conversion_id)
 *   2. Removes items for already-paid orders
 *   3. Removes duplicate items (same conversion in multiple reconciliations)
 *   4. Updates reconciliation totals
 *   5. Syncs system_reconciliation_id in system_conversions
 *
 * Run: node backend/run-migration-068.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');

async function runMigration() {
  console.log('='.repeat(80));
  console.log('Running Migration 068: Cleanup Reconciliation Data');
  console.log('='.repeat(80));

  try {
    // Check current state before migration
    console.log('\n📊 BEFORE CLEANUP:');

    // Count orphan items
    const orphanBefore = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_reconciliation_items
      WHERE system_conversion_id IS NULL
    `);
    console.log(`   Orphan items (NULL conversion_id): ${orphanBefore.rows[0].count}`);

    // Count paid items still in reconciliation
    const paidBefore = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_reconciliation_items sri
      JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      WHERE sc.payment_status = 'paid'
    `);
    console.log(`   Paid items still in reconciliation: ${paidBefore.rows[0].count}`);

    // Count duplicates
    const dupBefore = await pool.query(`
      SELECT COUNT(*) as count
      FROM (
        SELECT system_conversion_id
        FROM system_reconciliation_items
        WHERE system_conversion_id IS NOT NULL
        GROUP BY system_conversion_id
        HAVING COUNT(*) > 1
      ) dups
    `);
    console.log(`   Duplicate items: ${dupBefore.rows[0].count}`);

    // Count reconciliations with total mismatch
    const mismatchBefore = await pool.query(`
      SELECT
        sr.id,
        sr.period_label,
        sr.total_orders as recorded_total,
        COUNT(sri.id) as actual_total
      FROM system_reconciliations sr
      LEFT JOIN system_reconciliation_items sri ON sr.id = sri.system_reconciliation_id
      GROUP BY sr.id, sr.period_label, sr.total_orders
      HAVING sr.total_orders != COUNT(sri.id)
    `);
    console.log(`   Reconciliations with total mismatch: ${mismatchBefore.rows.length}`);
    mismatchBefore.rows.forEach(r => {
      console.log(`      - ${r.period_label}: recorded=${r.recorded_total}, actual=${r.actual_total}`);
    });

    // Read and execute migration SQL
    console.log('\n🔄 Running cleanup SQL...');
    const migrationPath = path.join(__dirname, 'migrations', '068_cleanup_reconciliation_data.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(migrationSQL);
    console.log('   ✅ Cleanup SQL executed successfully');

    // Check state after migration
    console.log('\n📊 AFTER CLEANUP:');

    // Count orphan items
    const orphanAfter = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_reconciliation_items
      WHERE system_conversion_id IS NULL
    `);
    console.log(`   Orphan items: ${orphanAfter.rows[0].count}`);

    // Count paid items still in reconciliation
    const paidAfter = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_reconciliation_items sri
      JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      WHERE sc.payment_status = 'paid'
    `);
    console.log(`   Paid items: ${paidAfter.rows[0].count}`);

    // Count duplicates
    const dupAfter = await pool.query(`
      SELECT COUNT(*) as count
      FROM (
        SELECT system_conversion_id
        FROM system_reconciliation_items
        WHERE system_conversion_id IS NOT NULL
        GROUP BY system_conversion_id
        HAVING COUNT(*) > 1
      ) dups
    `);
    console.log(`   Duplicate items: ${dupAfter.rows[0].count}`);

    // Count reconciliations with total mismatch
    const mismatchAfter = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_reconciliations sr
      WHERE sr.total_orders != (
        SELECT COUNT(*)
        FROM system_reconciliation_items sri
        WHERE sri.system_reconciliation_id = sr.id
      )
    `);
    console.log(`   Reconciliations with total mismatch: ${mismatchAfter.rows[0].count}`);

    // Show backup info
    console.log('\n📦 BACKUP TABLES CREATED:');
    const backupTables = await pool.query(`
      SELECT tablename, (
        SELECT COUNT(*) FROM _backup_orphan_reconciliation_items_068
      ) as orphan_backup,
      (
        SELECT COUNT(*) FROM _backup_paid_reconciliation_items_068
      ) as paid_backup,
      (
        SELECT COUNT(*) FROM _backup_duplicate_reconciliation_items_068
      ) as dup_backup
      FROM pg_tables
      WHERE tablename LIKE '_backup%068'
      LIMIT 1
    `);

    if (backupTables.rows.length > 0) {
      console.log(`   _backup_orphan_reconciliation_items_068: ${backupTables.rows[0].orphan_backup} rows`);
      console.log(`   _backup_paid_reconciliation_items_068: ${backupTables.rows[0].paid_backup} rows`);
      console.log(`   _backup_duplicate_reconciliation_items_068: ${backupTables.rows[0].dup_backup} rows`);
    }

    // Show summary
    console.log('\n✅ CLEANUP SUMMARY:');
    console.log(`   Orphan items removed: ${parseInt(orphanBefore.rows[0].count) - parseInt(orphanAfter.rows[0].count)}`);
    console.log(`   Paid items removed: ${parseInt(paidBefore.rows[0].count) - parseInt(paidAfter.rows[0].count)}`);
    console.log(`   Duplicate items fixed: ${parseInt(dupBefore.rows[0].count) - parseInt(dupAfter.rows[0].count)}`);
    console.log(`   Totals synced: ${mismatchBefore.rows.length - parseInt(mismatchAfter.rows[0].count)}`);

    // Verify all clean
    const allClean = parseInt(orphanAfter.rows[0].count) === 0 &&
                     parseInt(paidAfter.rows[0].count) === 0 &&
                     parseInt(dupAfter.rows[0].count) === 0 &&
                     parseInt(mismatchAfter.rows[0].count) === 0;

    if (allClean) {
      console.log('\n🎉 All data inconsistencies have been fixed!');
    } else {
      console.log('\n⚠️ Some issues may remain - please review');
    }

    console.log('\n' + '='.repeat(80));
    console.log('Migration 068 completed!');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
