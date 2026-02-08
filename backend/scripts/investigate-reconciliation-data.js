/**
 * Investigate reconciliation data inconsistencies
 * Run: node backend/scripts/investigate-reconciliation-data.js
 */

require('dotenv').config();
const { pool } = require('../config/database');

async function investigate() {
  console.log('='.repeat(100));
  console.log('RÀ SOÁT DỮ LIỆU ĐỐI SOÁT - TẤT CẢ KỲ ĐỐI SOÁT');
  console.log('='.repeat(100));

  try {
    // 1. Get user info for andytt19@gmail.com
    const userResult = await pool.query("SELECT id, email, full_name FROM users WHERE email = 'andytt19@gmail.com'");
    if (userResult.rows.length === 0) {
      console.log('User andytt19@gmail.com not found');
    } else {
      const user = userResult.rows[0];
      console.log('\n📧 User:', user.email, '- ID:', user.id);

      // Get their orders
      const userOrdersResult = await pool.query(`
        SELECT
          id,
          order_code,
          merchant_name,
          cashback_amount,
          status,
          order_time,
          approval_time,
          system_reconciliation_id,
          system_reconciliation_status
        FROM system_conversions
        WHERE user_id = $1
        ORDER BY order_time DESC
      `, [user.id]);

      console.log('\n📊 Đơn hàng của user này trong system_conversions:', userOrdersResult.rows.length);

      // Show their orders by month
      const byMonth = {};
      userOrdersResult.rows.forEach(o => {
        const month = new Date(o.order_time).toISOString().substring(0, 7);
        if (!byMonth[month]) byMonth[month] = { total: 0, approved: 0, reconciled: 0 };
        byMonth[month].total++;
        if (o.status === 'approved') byMonth[month].approved++;
        if (o.system_reconciliation_id) byMonth[month].reconciled++;
      });

      console.log('   Theo tháng:');
      Object.keys(byMonth).sort().reverse().forEach(month => {
        const m = byMonth[month];
        console.log(`      ${month}: ${m.total} đơn (${m.approved} approved, ${m.reconciled} đã đối soát)`);
      });
    }

    // 2. List all reconciliation periods with details
    console.log('\n' + '='.repeat(100));
    console.log('📅 TẤT CẢ KỲ ĐỐI SOÁT:');
    console.log('='.repeat(100));

    const reconsResult = await pool.query(`
      SELECT
        sr.id,
        sr.period_label,
        sr.status,
        sr.total_orders,
        sr.total_cashback,
        sr.created_at,
        COUNT(sri.id) as actual_items,
        COALESCE(SUM(sri.cashback_amount), 0) as actual_cashback
      FROM system_reconciliations sr
      LEFT JOIN system_reconciliation_items sri ON sr.id = sri.system_reconciliation_id
      GROUP BY sr.id
      ORDER BY sr.created_at DESC
    `);

    console.log('\n   ' + '-'.repeat(95));
    console.log('   | Kỳ đối soát'.padEnd(35) + '| Status'.padEnd(12) + '| Orders (DB/Actual)'.padEnd(22) + '| Cashback'.padEnd(20) + '|');
    console.log('   ' + '-'.repeat(95));

    let hasIssues = false;
    reconsResult.rows.forEach(r => {
      const orderMismatch = parseInt(r.total_orders) !== parseInt(r.actual_items);
      const marker = orderMismatch ? ' ❌' : ' ✓';
      const orders = `${r.total_orders}/${r.actual_items}${marker}`;
      const cashback = parseFloat(r.total_cashback).toLocaleString('vi-VN') + 'đ';
      console.log('   | ' + r.period_label.padEnd(33) + '| ' + r.status.padEnd(10) + '| ' + orders.padEnd(20) + '| ' + cashback.padEnd(18) + '|');
      if (orderMismatch) hasIssues = true;
    });
    console.log('   ' + '-'.repeat(95));

    // 3. Check for orders that should NOT be in reconciliation
    console.log('\n' + '='.repeat(100));
    console.log('⚠️ KIỂM TRA ĐƠN HÀNG KHÔNG HỢP LỆ TRONG CÁC KỲ ĐỐI SOÁT:');
    console.log('='.repeat(100));

    // 3a. Orders with status != approved
    const notApproved = await pool.query(`
      SELECT
        sri.id as item_id,
        sc.order_code,
        sc.merchant_name,
        sc.cashback_amount,
        sc.status as conversion_status,
        sr.period_label
      FROM system_reconciliation_items sri
      JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      WHERE sc.status != 'approved'
    `);

    console.log('\n   1. Đơn hàng CHƯA APPROVED nhưng đã trong đối soát:', notApproved.rows.length);
    if (notApproved.rows.length > 0) {
      notApproved.rows.forEach(i => {
        console.log(`      ❌ ${i.order_code || 'N/A'} | ${i.merchant_name} | status: ${i.conversion_status} | kỳ: ${i.period_label}`);
      });
    }

    // 3b. Orders with NULL approval_time
    const nullApproval = await pool.query(`
      SELECT
        sri.id as item_id,
        sc.order_code,
        sc.merchant_name,
        sc.cashback_amount,
        sc.approval_time,
        sr.period_label
      FROM system_reconciliation_items sri
      JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      WHERE sc.approval_time IS NULL
    `);

    console.log('\n   2. Đơn hàng có approval_time = NULL:', nullApproval.rows.length);
    if (nullApproval.rows.length > 0) {
      nullApproval.rows.slice(0, 10).forEach(i => {
        console.log(`      ⚠️ ${i.order_code || 'N/A'} | ${i.merchant_name} | kỳ: ${i.period_label}`);
      });
    }

    // 3c. Orders already paid
    const alreadyPaid = await pool.query(`
      SELECT
        sri.id as item_id,
        sc.order_code,
        sc.merchant_name,
        sc.cashback_amount,
        sc.payment_status,
        sr.period_label
      FROM system_reconciliation_items sri
      JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      WHERE sc.payment_status = 'paid'
    `);

    console.log('\n   3. Đơn hàng ĐÃ THANH TOÁN nhưng vẫn trong đối soát:', alreadyPaid.rows.length);
    if (alreadyPaid.rows.length > 0) {
      alreadyPaid.rows.forEach(i => {
        console.log(`      ⚠️ ${i.order_code || 'N/A'} | ${i.merchant_name} | kỳ: ${i.period_label}`);
      });
    }

    // 4. Check for duplicate entries
    console.log('\n' + '='.repeat(100));
    console.log('🔄 KIỂM TRA TRÙNG LẶP:');
    console.log('='.repeat(100));

    const duplicates = await pool.query(`
      SELECT
        system_conversion_id,
        COUNT(*) as count,
        ARRAY_AGG(system_reconciliation_id) as recon_ids
      FROM system_reconciliation_items
      GROUP BY system_conversion_id
      HAVING COUNT(*) > 1
    `);

    console.log('\n   Đơn hàng xuất hiện trong NHIỀU kỳ đối soát:', duplicates.rows.length);
    if (duplicates.rows.length > 0) {
      duplicates.rows.forEach(d => {
        console.log(`      ❌ conversion_id: ${d.system_conversion_id} | xuất hiện ${d.count} lần`);
      });
    }

    // 5. Check reconciliation_items without matching system_conversions
    const orphanItems = await pool.query(`
      SELECT sri.id, sri.system_conversion_id, sri.merchant_name, sri.cashback_amount
      FROM system_reconciliation_items sri
      LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      WHERE sc.id IS NULL
    `);

    console.log('\n   Items không có system_conversion tương ứng:', orphanItems.rows.length);
    if (orphanItems.rows.length > 0) {
      orphanItems.rows.forEach(i => {
        console.log(`      ❌ item_id: ${i.id} | conversion_id: ${i.system_conversion_id}`);
      });
    }

    // 6. Summary of eligible vs reconciled
    console.log('\n' + '='.repeat(100));
    console.log('📊 SO SÁNH ELIGIBLE VS RECONCILED:');
    console.log('='.repeat(100));

    const eligibleCount = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(cashback_amount), 0) as cashback
      FROM get_eligible_conversions_for_waiting_list()
    `);

    const reconciledCount = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(sri.cashback_amount), 0) as cashback
      FROM system_reconciliation_items sri
      JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      WHERE sr.status != 'cancelled'
    `);

    const approvedNotReconciled = await pool.query(`
      SELECT COUNT(*) as total, COALESCE(SUM(cashback_amount), 0) as cashback
      FROM system_conversions
      WHERE status = 'approved'
        AND system_reconciliation_id IS NULL
        AND (payment_status IS NULL OR payment_status != 'paid')
    `);

    console.log('\n   Đơn hàng đủ điều kiện Auto-Sync (eligible):', eligibleCount.rows[0].total);
    console.log('   Đơn hàng đã trong kỳ đối soát:', reconciledCount.rows[0].total);
    console.log('   Đơn hàng approved chưa đối soát:', approvedNotReconciled.rows[0].total);

    console.log('\n' + '='.repeat(100));
    console.log('KẾT THÚC RÀ SOÁT');
    console.log('='.repeat(100));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

investigate();
