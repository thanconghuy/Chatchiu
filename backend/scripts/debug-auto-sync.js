/**
 * Debug script to check why orders are not appearing in Auto-Sync
 * Run: node backend/scripts/debug-auto-sync.js
 */

require('dotenv').config();
const { pool } = require('../config/database');

async function debugAutoSync() {
  console.log('='.repeat(80));
  console.log('DEBUG: Auto-Sync Eligible Orders');
  console.log('='.repeat(80));

  try {
    // 1. Count all approved orders in system_conversions
    console.log('\n📊 1. Tổng số đơn hàng approved trong system_conversions:');
    const totalApproved = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN approval_time IS NOT NULL THEN 1 END) as with_approval_time,
        COUNT(CASE WHEN approval_time IS NULL THEN 1 END) as without_approval_time
      FROM system_conversions
      WHERE status = 'approved'
    `);
    console.log('   Total approved:', totalApproved.rows[0].total);
    console.log('   With approval_time:', totalApproved.rows[0].with_approval_time);
    console.log('   Without approval_time (NULL):', totalApproved.rows[0].without_approval_time);

    // 2. Check orders by month
    console.log('\n📅 2. Đơn hàng approved theo tháng (dựa trên order_time):');
    const byMonth = await pool.query(`
      SELECT
        DATE_TRUNC('month', order_time)::DATE as month,
        COUNT(*) as total,
        COUNT(CASE WHEN approval_time IS NOT NULL THEN 1 END) as with_approval_time,
        COUNT(CASE WHEN approval_time IS NULL THEN 1 END) as without_approval_time,
        COALESCE(SUM(cashback_amount), 0) as total_cashback
      FROM system_conversions
      WHERE status = 'approved'
      GROUP BY DATE_TRUNC('month', order_time)
      ORDER BY month DESC
      LIMIT 10
    `);
    byMonth.rows.forEach(row => {
      const monthLabel = new Date(row.month).toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
      console.log(`   ${monthLabel}: ${row.total} orders (${row.with_approval_time} with approval_time, ${row.without_approval_time} without)`);
    });

    // 3. Check waiting list
    console.log('\n📋 3. Đơn hàng trong waiting list:');
    const waitingList = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'waiting' THEN 1 END) as waiting,
        COUNT(CASE WHEN status = 'reconciled' THEN 1 END) as reconciled
      FROM reconciliation_waiting_list
    `);
    console.log('   Total in waiting list:', waitingList.rows[0].total);
    console.log('   Status = waiting:', waitingList.rows[0].waiting);
    console.log('   Status = reconciled:', waitingList.rows[0].reconciled);

    // 4. Check orders already in reconciliation items
    console.log('\n🔗 4. Đơn hàng đã có trong system_reconciliation_items:');
    const inItems = await pool.query(`
      SELECT COUNT(*) as total
      FROM system_reconciliation_items
      WHERE system_conversion_id IS NOT NULL
    `);
    console.log('   Total:', inItems.rows[0].total);

    // 5. Check orders with system_reconciliation_id set
    console.log('\n🏷️ 5. Đơn hàng có system_reconciliation_id (đã trong kỳ đối soát):');
    const hasReconId = await pool.query(`
      SELECT COUNT(*) as total
      FROM system_conversions
      WHERE system_reconciliation_id IS NOT NULL
    `);
    console.log('   Total:', hasReconId.rows[0].total);

    // 6. Check why orders not eligible - breakdown
    console.log('\n🔍 6. Chi tiết lý do đơn hàng tháng 10-12/2025 không eligible:');
    const breakdown = await pool.query(`
      SELECT
        CASE
          WHEN sc.status != 'approved' THEN 'not_approved'
          WHEN sc.approval_time IS NULL THEN 'approval_time_is_null'
          WHEN sc.approval_time + INTERVAL '15 days' > NOW() THEN 'not_15_days_yet'
          WHEN EXISTS (SELECT 1 FROM reconciliation_waiting_list rwl WHERE rwl.system_conversion_id = sc.id) THEN 'already_in_waiting_list'
          WHEN sc.system_reconciliation_id IS NOT NULL THEN 'has_reconciliation_id'
          WHEN EXISTS (SELECT 1 FROM system_reconciliation_items sri WHERE sri.system_conversion_id = sc.id) THEN 'in_reconciliation_items'
          WHEN sc.payment_status = 'paid' THEN 'already_paid'
          ELSE 'eligible'
        END as reason,
        COUNT(*) as count
      FROM system_conversions sc
      WHERE sc.order_time >= '2025-10-01' AND sc.order_time < '2026-01-01'
      GROUP BY 1
      ORDER BY count DESC
    `);
    breakdown.rows.forEach(row => {
      console.log(`   ${row.reason}: ${row.count}`);
    });

    // 7. Sample orders without approval_time
    console.log('\n📝 7. Mẫu đơn hàng tháng 10-12/2025 không có approval_time:');
    const sampleNoApproval = await pool.query(`
      SELECT
        id,
        order_code,
        merchant_name,
        status,
        order_time,
        approval_time,
        cashback_amount
      FROM system_conversions
      WHERE status = 'approved'
        AND order_time >= '2025-10-01' AND order_time < '2026-01-01'
        AND approval_time IS NULL
      LIMIT 5
    `);
    if (sampleNoApproval.rows.length === 0) {
      console.log('   Không có đơn hàng nào thiếu approval_time');
    } else {
      sampleNoApproval.rows.forEach(row => {
        console.log(`   - ${row.order_code || row.id}: ${row.merchant_name}, cashback: ${row.cashback_amount}, approval_time: ${row.approval_time}`);
      });
    }

    // 8. Sample orders already in waiting list
    console.log('\n📝 8. Mẫu đơn hàng tháng 10-12/2025 đã trong waiting list:');
    const sampleInWaiting = await pool.query(`
      SELECT
        sc.id,
        sc.order_code,
        sc.merchant_name,
        sc.cashback_amount,
        rwl.status as waiting_status,
        rwl.added_to_waiting_at
      FROM system_conversions sc
      INNER JOIN reconciliation_waiting_list rwl ON rwl.system_conversion_id = sc.id
      WHERE sc.order_time >= '2025-10-01' AND sc.order_time < '2026-01-01'
      LIMIT 5
    `);
    if (sampleInWaiting.rows.length === 0) {
      console.log('   Không có đơn hàng nào trong waiting list');
    } else {
      sampleInWaiting.rows.forEach(row => {
        console.log(`   - ${row.order_code || row.id}: ${row.merchant_name}, cashback: ${row.cashback_amount}, waiting_status: ${row.waiting_status}`);
      });
    }

    // 9. Run the actual eligible function
    console.log('\n✅ 9. Kết quả từ get_eligible_conversions_for_waiting_list():');
    const eligible = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(cashback_amount), 0) as total_cashback
      FROM get_eligible_conversions_for_waiting_list()
    `);
    console.log('   Total eligible:', eligible.rows[0].total);
    console.log('   Total cashback:', eligible.rows[0].total_cashback);

    console.log('\n' + '='.repeat(80));
    console.log('DEBUG COMPLETE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

debugAutoSync();
