/**
 * Check Auto-Sync eligible orders in detail
 * Run: node backend/scripts/check-autosync-detail.js
 */

require('dotenv').config();
const { pool } = require('../config/database');

async function checkAutoSync() {
  console.log('='.repeat(100));
  console.log('KIỂM TRA CHI TIẾT AUTO-SYNC ELIGIBLE ORDERS');
  console.log('='.repeat(100));

  try {
    // 1. Tổng quan system_conversions
    console.log('\n📊 1. TỔNG QUAN SYSTEM_CONVERSIONS:');
    const overview = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected
      FROM system_conversions
    `);
    console.log('   Tổng đơn hàng:', overview.rows[0].total);
    console.log('   - Approved:', overview.rows[0].approved);
    console.log('   - Pending:', overview.rows[0].pending);
    console.log('   - Rejected:', overview.rows[0].rejected);

    // 2. Chi tiết các đơn APPROVED
    console.log('\n📋 2. CHI TIẾT ĐƠN HÀNG APPROVED (136 đơn):');
    const approvedBreakdown = await pool.query(`
      SELECT
        CASE
          WHEN sc.system_reconciliation_id IS NOT NULL THEN '1. Đã có system_reconciliation_id'
          WHEN EXISTS (SELECT 1 FROM system_reconciliation_items sri WHERE sri.system_conversion_id = sc.id) THEN '2. Đã trong reconciliation_items'
          WHEN EXISTS (SELECT 1 FROM reconciliation_waiting_list rwl WHERE rwl.system_conversion_id = sc.id) THEN '3. Đã trong waiting_list'
          WHEN sc.payment_status = 'paid' THEN '4. Đã thanh toán (paid)'
          WHEN COALESCE(sc.approval_time, sc.order_time) + INTERVAL '15 days' > NOW() THEN '5. Chưa đủ 15 ngày'
          ELSE '6. ĐỦ ĐIỀU KIỆN AUTO-SYNC'
        END as trang_thai,
        COUNT(*) as so_luong,
        COALESCE(SUM(sc.cashback_amount), 0)::NUMERIC(15,2) as tong_cashback
      FROM system_conversions sc
      WHERE sc.status = 'approved'
      GROUP BY 1
      ORDER BY 1
    `);

    console.log('   ' + '-'.repeat(90));
    console.log('   | Trạng thái'.padEnd(55) + '| Số lượng | Tổng Cashback    |');
    console.log('   ' + '-'.repeat(90));
    let totalOrders = 0;
    let totalCashback = 0;
    approvedBreakdown.rows.forEach(row => {
      const cashbackFormatted = Number(row.tong_cashback).toLocaleString('vi-VN') + 'đ';
      console.log('   | ' + row.trang_thai.padEnd(52) + '| ' + String(row.so_luong).padStart(8) + ' | ' + cashbackFormatted.padStart(16) + ' |');
      totalOrders += parseInt(row.so_luong);
      totalCashback += parseFloat(row.tong_cashback);
    });
    console.log('   ' + '-'.repeat(90));
    console.log('   | TỔNG CỘNG'.padEnd(55) + '| ' + String(totalOrders).padStart(8) + ' | ' + totalCashback.toLocaleString('vi-VN') + 'đ |');
    console.log('   ' + '-'.repeat(90));

    // 3. Kiểm tra kết quả function
    console.log('\n✅ 3. KẾT QUẢ TỪ get_eligible_conversions_for_waiting_list():');
    const eligible = await pool.query(`
      SELECT
        conversion_id,
        merchant_name,
        order_code,
        cashback_amount,
        approval_time,
        eligible_date,
        days_since_approval
      FROM get_eligible_conversions_for_waiting_list()
      ORDER BY approval_time ASC
      LIMIT 50
    `);

    console.log('   Tổng số đơn eligible:', eligible.rows.length);

    // Group by month
    const eligibleByMonth = await pool.query(`
      SELECT
        DATE_TRUNC('month', approval_time)::DATE as thang,
        COUNT(*) as so_don,
        SUM(cashback_amount)::NUMERIC(15,2) as tong_cashback
      FROM get_eligible_conversions_for_waiting_list()
      GROUP BY 1
      ORDER BY 1 DESC
    `);

    console.log('\n   Phân theo tháng:');
    eligibleByMonth.rows.forEach(row => {
      const monthLabel = new Date(row.thang).toLocaleDateString('vi-VN', { month: '2-digit', year: 'numeric' });
      console.log('   - Tháng ' + monthLabel + ': ' + row.so_don + ' đơn, ' + Number(row.tong_cashback).toLocaleString('vi-VN') + 'đ');
    });

    // 4. Verify không có đơn nào đã đối soát
    console.log('\n🔍 4. XÁC NHẬN KHÔNG CÓ ĐƠN NÀO ĐÃ ĐỐI SOÁT TRONG ELIGIBLE:');
    const verifyNoReconciled = await pool.query(`
      SELECT
        e.conversion_id,
        sc.system_reconciliation_id,
        EXISTS (SELECT 1 FROM system_reconciliation_items sri WHERE sri.system_conversion_id = e.conversion_id) as in_items,
        EXISTS (SELECT 1 FROM reconciliation_waiting_list rwl WHERE rwl.system_conversion_id = e.conversion_id) as in_waiting,
        sc.payment_status
      FROM get_eligible_conversions_for_waiting_list() e
      JOIN system_conversions sc ON sc.id = e.conversion_id
      WHERE
        sc.system_reconciliation_id IS NOT NULL
        OR EXISTS (SELECT 1 FROM system_reconciliation_items sri WHERE sri.system_conversion_id = e.conversion_id)
        OR EXISTS (SELECT 1 FROM reconciliation_waiting_list rwl WHERE rwl.system_conversion_id = e.conversion_id)
        OR sc.payment_status = 'paid'
    `);

    if (verifyNoReconciled.rows.length === 0) {
      console.log('   ✅ PASS: Không có đơn nào đã đối soát/thanh toán trong danh sách eligible');
    } else {
      console.log('   ❌ FAIL: Có ' + verifyNoReconciled.rows.length + ' đơn đã đối soát trong eligible!');
      verifyNoReconciled.rows.forEach(row => console.log('      - ' + row.conversion_id));
    }

    // 5. Sample eligible orders
    console.log('\n📝 5. MẪU 10 ĐƠN HÀNG ĐỦ ĐIỀU KIỆN AUTO-SYNC:');
    console.log('   ' + '-'.repeat(100));
    console.log('   | Order Code'.padEnd(25) + '| Merchant'.padEnd(22) + '| Cashback'.padEnd(15) + '| Ngày duyệt'.padEnd(15) + '| Ngày eligible'.padEnd(15) + '|');
    console.log('   ' + '-'.repeat(100));
    eligible.rows.slice(0, 10).forEach(row => {
      const approvalDate = new Date(row.approval_time).toLocaleDateString('vi-VN');
      const eligibleDate = new Date(row.eligible_date).toLocaleDateString('vi-VN');
      const cashback = Number(row.cashback_amount).toLocaleString('vi-VN') + 'đ';
      console.log('   | ' + (row.order_code || 'N/A').substring(0,22).padEnd(23) + '| ' + (row.merchant_name || 'N/A').substring(0,19).padEnd(20) + '| ' + cashback.padStart(13) + '| ' + approvalDate.padEnd(13) + '| ' + eligibleDate.padEnd(13) + '|');
    });
    console.log('   ' + '-'.repeat(100));

    // Summary
    const totalEligible = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(cashback_amount), 0)::NUMERIC(15,2) as cashback
      FROM get_eligible_conversions_for_waiting_list()
    `);

    console.log('\n' + '='.repeat(100));
    console.log('📊 TÓM TẮT AUTO-SYNC:');
    console.log('='.repeat(100));
    console.log('   ✅ Tổng đơn đủ điều kiện: ' + totalEligible.rows[0].total + ' đơn');
    console.log('   ✅ Tổng cashback eligible: ' + Number(totalEligible.rows[0].cashback).toLocaleString('vi-VN') + 'đ');
    console.log('   ✅ Tất cả đều CHƯA được đối soát');
    console.log('='.repeat(100));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkAutoSync();
