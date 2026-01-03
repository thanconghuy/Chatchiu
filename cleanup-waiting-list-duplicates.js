/**
 * Cleanup script: Remove duplicates from reconciliation_waiting_list
 *
 * Problem: Orders that are already in system_reconciliations are still in waiting list
 * Solution: Delete from waiting list if conversion_id exists in system_reconciliation_items
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');

async function cleanupWaitingListDuplicates() {
  console.log('\n========================================');
  console.log('🧹 Cleanup Waiting List Duplicates');
  console.log('========================================\n');

  try {
    // 1. Find duplicates
    console.log('1. Finding duplicates...');
    const findDuplicates = await pool.query(`
      SELECT
        rwl.id as waiting_list_id,
        rwl.conversion_id,
        rwl.approval_month,
        rwl.status as waiting_status,
        sr.id as reconciliation_id,
        sr.period_label,
        sr.status as recon_status
      FROM reconciliation_waiting_list rwl
      INNER JOIN system_reconciliation_items sri ON rwl.conversion_id = sri.conversion_id
      INNER JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      ORDER BY sr.period_label, rwl.conversion_id
    `);

    const duplicates = findDuplicates.rows;
    console.log(`   Found ${duplicates.length} duplicate orders in waiting list\n`);

    if (duplicates.length === 0) {
      console.log('✅ No duplicates found. Waiting list is clean!\n');
      await pool.end();
      return;
    }

    // 2. Display duplicates by reconciliation
    console.log('2. Duplicates by reconciliation period:');
    const byPeriod = {};
    duplicates.forEach(dup => {
      if (!byPeriod[dup.period_label]) {
        byPeriod[dup.period_label] = {
          reconciliation_id: dup.reconciliation_id,
          status: dup.recon_status,
          count: 0,
          conversion_ids: []
        };
      }
      byPeriod[dup.period_label].count++;
      byPeriod[dup.period_label].conversion_ids.push(dup.conversion_id);
    });

    Object.entries(byPeriod).forEach(([label, data]) => {
      console.log(`   • ${label} (${data.status}): ${data.count} orders`);
    });
    console.log();

    // 3. Delete duplicates
    console.log('3. Deleting duplicates from waiting list...');
    const deleteResult = await pool.query(`
      DELETE FROM reconciliation_waiting_list
      WHERE conversion_id IN (
        SELECT sri.conversion_id
        FROM system_reconciliation_items sri
      )
      RETURNING id, conversion_id
    `);

    const deletedCount = deleteResult.rowCount;
    console.log(`   ✅ Deleted ${deletedCount} duplicate records\n`);

    // 4. Verify cleanup
    console.log('4. Verifying cleanup...');
    const verifyResult = await pool.query(`
      SELECT COUNT(*) as remaining_duplicates
      FROM reconciliation_waiting_list rwl
      INNER JOIN system_reconciliation_items sri ON rwl.conversion_id = sri.conversion_id
    `);

    const remaining = parseInt(verifyResult.rows[0].remaining_duplicates);
    if (remaining === 0) {
      console.log('   ✅ All duplicates removed successfully\n');
    } else {
      console.log(`   ⚠️  Warning: ${remaining} duplicates still remain\n`);
    }

    // 5. Show current waiting list summary
    console.log('5. Current waiting list summary:');
    const summaryResult = await pool.query(`
      SELECT
        COUNT(*) as total_waiting,
        COUNT(DISTINCT approval_month) as month_count,
        SUM(cashback_amount) as total_cashback
      FROM reconciliation_waiting_list
      WHERE status = 'waiting'
    `);

    const summary = summaryResult.rows[0];
    console.log(`   Total waiting orders: ${summary.total_waiting}`);
    console.log(`   Months: ${summary.month_count}`);
    console.log(`   Total cashback: ${parseFloat(summary.total_cashback || 0).toLocaleString('vi-VN')} VNĐ\n`);

    console.log('========================================');
    console.log('✅ Cleanup Completed Successfully');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

cleanupWaitingListDuplicates();
