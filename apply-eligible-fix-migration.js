/**
 * Apply migration 035: Fix eligible conversions query
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  console.log('\n========================================');
  console.log('📦 Applying Migration 035');
  console.log('========================================\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'backend', 'migrations', '035_fix_eligible_conversions_query.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('1. Running migration SQL...');
    await pool.query(sql);
    console.log('   ✅ Migration SQL executed\n');

    // Test the function
    console.log('2. Testing function...');
    const testResult = await pool.query(`
      SELECT COUNT(*) as eligible_count
      FROM get_eligible_conversions_for_waiting_list()
    `);

    const eligibleCount = parseInt(testResult.rows[0].eligible_count);
    console.log(`   ✅ Function returns ${eligibleCount} eligible orders\n`);

    // Check if any eligible orders have reconciliation_id
    console.log('3. Verifying exclusion logic...');
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as should_be_zero
      FROM get_eligible_conversions_for_waiting_list() e
      INNER JOIN conversions c ON e.conversion_id = c.id
      WHERE c.system_reconciliation_id IS NOT NULL
    `);

    const leaked = parseInt(verifyResult.rows[0].should_be_zero);
    if (leaked === 0) {
      console.log('   ✅ No reconciled orders in eligible list (correct!)\n');
    } else {
      console.log(`   ⚠️  Warning: ${leaked} reconciled orders still in eligible list\n`);
    }

    // Show summary
    console.log('4. Summary:');
    const summaryResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM conversions WHERE status = 'approved') as total_approved,
        (SELECT COUNT(*) FROM conversions WHERE system_reconciliation_id IS NOT NULL) as already_reconciled,
        (SELECT COUNT(*) FROM get_eligible_conversions_for_waiting_list()) as eligible,
        (SELECT COUNT(*) FROM reconciliation_waiting_list WHERE status = 'waiting') as in_waiting_list
    `);

    const summary = summaryResult.rows[0];
    console.log(`   Total approved orders: ${summary.total_approved}`);
    console.log(`   Already in reconciliation: ${summary.already_reconciled}`);
    console.log(`   Eligible for waiting list: ${summary.eligible}`);
    console.log(`   Currently in waiting list: ${summary.in_waiting_list}\n`);

    console.log('========================================');
    console.log('✅ Migration 035 Applied Successfully');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error applying migration:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

applyMigration();
