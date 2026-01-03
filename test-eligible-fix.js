require('dotenv').config();
const { pool } = require('./backend/config/database');

async function testEligibleFix() {
  try {
    console.log('\n========================================');
    console.log('Testing Eligible Conversions Fix');
    console.log('========================================\n');

    // Test 1: Count eligible orders
    console.log('1. Counting eligible orders...');
    const countResult = await pool.query(`
      SELECT COUNT(*) as count
      FROM get_eligible_conversions_for_waiting_list()
    `);
    console.log(`   Eligible orders: ${countResult.rows[0].count}\n`);

    // Test 2: Check for reconciled orders in eligible list
    console.log('2. Checking for reconciled orders in eligible list...');
    const leakResult = await pool.query(`
      SELECT COUNT(*) as leaked
      FROM get_eligible_conversions_for_waiting_list() e
      INNER JOIN conversions c ON e.conversion_id = c.id
      WHERE c.system_reconciliation_id IS NOT NULL
    `);

    const leaked = parseInt(leakResult.rows[0].leaked);
    if (leaked === 0) {
      console.log('   ✅ No reconciled orders in eligible list (fix works!)\n');
    } else {
      console.log(`   ❌ ${leaked} reconciled orders still in eligible list\n`);
    }

    // Test 3: Summary
    console.log('3. Summary:');
    const summaryResult = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM conversions WHERE status = 'approved') as total_approved,
        (SELECT COUNT(*) FROM conversions WHERE system_reconciliation_id IS NOT NULL) as in_reconciliation,
        (SELECT COUNT(*) FROM get_eligible_conversions_for_waiting_list()) as eligible,
        (SELECT COUNT(*) FROM reconciliation_waiting_list WHERE status = 'waiting') as in_waiting_list
    `);

    const summary = summaryResult.rows[0];
    console.log(`   Total approved: ${summary.total_approved}`);
    console.log(`   In reconciliation: ${summary.in_reconciliation}`);
    console.log(`   Eligible: ${summary.eligible}`);
    console.log(`   In waiting list: ${summary.in_waiting_list}\n`);

    console.log('========================================');
    console.log('✅ Test Completed');
    console.log('========================================\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    await pool.end();
    process.exit(1);
  }
}

testEligibleFix();
