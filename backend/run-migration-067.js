/**
 * Run migration 067: Fix approval_time for Auto-Sync
 * This migration:
 *   1. Updates existing data: Set approval_time for approved orders that have NULL
 *   2. Updates get_eligible_conversions_for_waiting_list() to use COALESCE
 *
 * Run: node backend/run-migration-067.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./config/database');

async function runMigration() {
  console.log('='.repeat(80));
  console.log('Running Migration 067: Fix approval_time for Auto-Sync');
  console.log('='.repeat(80));

  try {
    // Check current state before migration
    console.log('\n📊 BEFORE MIGRATION:');
    const beforeStats = await pool.query(`
      SELECT
        COUNT(*) as total_approved,
        COUNT(CASE WHEN approval_time IS NULL THEN 1 END) as null_approval_time,
        COUNT(CASE WHEN approval_time IS NOT NULL THEN 1 END) as has_approval_time
      FROM system_conversions
      WHERE status = 'approved'
    `);
    console.log(`   Total approved orders: ${beforeStats.rows[0].total_approved}`);
    console.log(`   With approval_time: ${beforeStats.rows[0].has_approval_time}`);
    console.log(`   Without approval_time (NULL): ${beforeStats.rows[0].null_approval_time}`);

    // Check current eligible count
    const beforeEligible = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(cashback_amount), 0) as total_cashback
      FROM get_eligible_conversions_for_waiting_list()
    `);
    console.log(`   Current eligible for Auto-Sync: ${beforeEligible.rows[0].total} orders, ${beforeEligible.rows[0].total_cashback}đ cashback`);

    // Read and execute migration SQL
    console.log('\n🔄 Running migration SQL...');
    const migrationPath = path.join(__dirname, 'migrations', '067_fix_approval_time_for_autosync.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    await pool.query(migrationSQL);
    console.log('   ✅ Migration SQL executed successfully');

    // Check state after migration
    console.log('\n📊 AFTER MIGRATION:');
    const afterStats = await pool.query(`
      SELECT
        COUNT(*) as total_approved,
        COUNT(CASE WHEN approval_time IS NULL THEN 1 END) as null_approval_time,
        COUNT(CASE WHEN approval_time IS NOT NULL THEN 1 END) as has_approval_time
      FROM system_conversions
      WHERE status = 'approved'
    `);
    console.log(`   Total approved orders: ${afterStats.rows[0].total_approved}`);
    console.log(`   With approval_time: ${afterStats.rows[0].has_approval_time}`);
    console.log(`   Without approval_time (NULL): ${afterStats.rows[0].null_approval_time}`);

    // Check new eligible count
    const afterEligible = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(cashback_amount), 0) as total_cashback
      FROM get_eligible_conversions_for_waiting_list()
    `);
    console.log(`   New eligible for Auto-Sync: ${afterEligible.rows[0].total} orders, ${afterEligible.rows[0].total_cashback}đ cashback`);

    // Show improvement
    const beforeCount = parseInt(beforeEligible.rows[0].total);
    const afterCount = parseInt(afterEligible.rows[0].total);
    const fixedCount = parseInt(beforeStats.rows[0].null_approval_time) - parseInt(afterStats.rows[0].null_approval_time);

    console.log('\n✅ SUMMARY:');
    console.log(`   Fixed ${fixedCount} orders with NULL approval_time`);
    console.log(`   Eligible orders: ${beforeCount} → ${afterCount} (${afterCount > beforeCount ? '+' : ''}${afterCount - beforeCount})`);

    console.log('\n' + '='.repeat(80));
    console.log('Migration 067 completed successfully!');
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
