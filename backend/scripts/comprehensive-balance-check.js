/**
 * Comprehensive Balance Check Script
 *
 * Kiểm tra toàn bộ dữ liệu và công thức tính toán cho user
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/database');

const TEST_USER_EMAIL = 'testuser@test.com';

async function comprehensiveCheck() {
  console.log('='.repeat(70));
  console.log('COMPREHENSIVE BALANCE CHECK');
  console.log('='.repeat(70));

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    // 1. Get user info
    console.log('\n' + '='.repeat(70));
    console.log('1. USER INFO');
    console.log('='.repeat(70));

    const userResult = await pool.query(`
      SELECT id, email, full_name FROM users WHERE email = $1
    `, [TEST_USER_EMAIL]);

    if (userResult.rows.length === 0) {
      console.log('User not found!');
      return;
    }

    const user = userResult.rows[0];
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.full_name}`);
    console.log(`ID: ${user.id}`);

    // 2. Get ALL conversions
    console.log('\n' + '='.repeat(70));
    console.log('2. SYSTEM_CONVERSIONS (Đơn hàng)');
    console.log('='.repeat(70));

    const conversionsResult = await pool.query(`
      SELECT
        id,
        order_code,
        status,
        cashback_amount,
        system_reconciliation_id,
        system_reconciliation_status,
        payment_status,
        order_time,
        approval_time
      FROM system_conversions
      WHERE user_id = $1
      ORDER BY order_time ASC
    `, [user.id]);

    console.log(`\nTổng số đơn hàng: ${conversionsResult.rows.length}\n`);

    let totalAll = 0;
    let totalApproved = 0;
    let totalReconciled = 0;
    let totalPaid = 0;
    let totalPending = 0;

    console.log('Chi tiết từng đơn:');
    console.log('-'.repeat(120));
    console.log('Order Code        | Status   | Cashback    | Recon ID                              | Recon Status | Payment');
    console.log('-'.repeat(120));

    conversionsResult.rows.forEach(c => {
      const amount = parseFloat(c.cashback_amount);
      totalAll += amount;

      if (c.status === 'approved') {
        totalApproved += amount;
        if (c.system_reconciliation_status === 'reconciled') {
          totalReconciled += amount;
          if (c.payment_status === 'paid') {
            totalPaid += amount;
          }
        }
      }
      if (c.status === 'pending') {
        totalPending += amount;
      }

      console.log(
        `${(c.order_code || 'N/A').padEnd(17)} | ` +
        `${c.status.padEnd(8)} | ` +
        `${amount.toLocaleString('vi-VN').padStart(11)}đ | ` +
        `${(c.system_reconciliation_id || 'NULL').toString().substring(0, 36).padEnd(36)} | ` +
        `${(c.system_reconciliation_status || 'NULL').padEnd(12)} | ` +
        `${c.payment_status || 'NULL'}`
      );
    });

    console.log('-'.repeat(120));
    console.log(`\nTỔNG KẾT CONVERSIONS:`);
    console.log(`  - Tổng tất cả đơn: ${totalAll.toLocaleString('vi-VN')}đ`);
    console.log(`  - Tổng approved: ${totalApproved.toLocaleString('vi-VN')}đ`);
    console.log(`  - Tổng reconciled: ${totalReconciled.toLocaleString('vi-VN')}đ`);
    console.log(`  - Tổng paid: ${totalPaid.toLocaleString('vi-VN')}đ`);
    console.log(`  - Tổng pending: ${totalPending.toLocaleString('vi-VN')}đ`);

    // 3. Check reconciliation items
    console.log('\n' + '='.repeat(70));
    console.log('3. SYSTEM_RECONCILIATION_ITEMS (Đơn đã vào kỳ đối soát)');
    console.log('='.repeat(70));

    const reconItemsResult = await pool.query(`
      SELECT
        sri.id,
        sri.system_conversion_id,
        sri.cashback_amount,
        sri.system_reconciliation_id,
        sr.period_label,
        sr.status as recon_status
      FROM system_reconciliation_items sri
      LEFT JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      WHERE sri.user_id = $1
      ORDER BY sri.created_at ASC
    `, [user.id]);

    console.log(`\nTổng số items: ${reconItemsResult.rows.length}\n`);

    let totalInReconItems = 0;
    reconItemsResult.rows.forEach(item => {
      const amount = parseFloat(item.cashback_amount);
      totalInReconItems += amount;
      console.log(`  - ${amount.toLocaleString('vi-VN')}đ | ${item.period_label} | Status: ${item.recon_status}`);
    });

    console.log(`\nTổng trong reconciliation_items: ${totalInReconItems.toLocaleString('vi-VN')}đ`);

    // 4. Check payment requests
    console.log('\n' + '='.repeat(70));
    console.log('4. PAYMENT_REQUESTS (Yêu cầu thanh toán)');
    console.log('='.repeat(70));

    const paymentResult = await pool.query(`
      SELECT
        id,
        requested_amount,
        status,
        created_at,
        paid_at
      FROM payment_requests
      WHERE user_id = $1
      ORDER BY created_at ASC
    `, [user.id]);

    console.log(`\nTổng số requests: ${paymentResult.rows.length}\n`);

    let totalPaidRequests = 0;
    let totalPendingRequests = 0;
    let totalConfirmedRequests = 0;

    paymentResult.rows.forEach(pr => {
      const amount = parseFloat(pr.requested_amount);
      console.log(`  - ${amount.toLocaleString('vi-VN')}đ | Status: ${pr.status} | ${pr.created_at}`);

      if (pr.status === 'paid') totalPaidRequests += amount;
      if (pr.status === 'pending') totalPendingRequests += amount;
      if (pr.status === 'confirmed') totalConfirmedRequests += amount;
    });

    console.log(`\nTỔNG KẾT PAYMENT REQUESTS:`);
    console.log(`  - Đã thanh toán (paid): ${totalPaidRequests.toLocaleString('vi-VN')}đ`);
    console.log(`  - Chờ xác nhận (pending): ${totalPendingRequests.toLocaleString('vi-VN')}đ`);
    console.log(`  - Đã xác nhận (confirmed): ${totalConfirmedRequests.toLocaleString('vi-VN')}đ`);

    // 5. Check user_system_balance
    console.log('\n' + '='.repeat(70));
    console.log('5. USER_SYSTEM_BALANCE (Số dư trong DB)');
    console.log('='.repeat(70));

    const balanceResult = await pool.query(`
      SELECT * FROM user_system_balance WHERE user_id = $1
    `, [user.id]);

    if (balanceResult.rows.length > 0) {
      const b = balanceResult.rows[0];
      console.log(`\n  - total_earned: ${parseFloat(b.total_earned).toLocaleString('vi-VN')}đ`);
      console.log(`  - total_withdrawn: ${parseFloat(b.total_withdrawn).toLocaleString('vi-VN')}đ`);
      console.log(`  - pending_reserved: ${parseFloat(b.pending_reserved).toLocaleString('vi-VN')}đ`);
      console.log(`  - available_balance (computed): ${parseFloat(b.available_balance || 0).toLocaleString('vi-VN')}đ`);
    }

    // 6. EXPECTED VALUES
    console.log('\n' + '='.repeat(70));
    console.log('6. CÔNG THỨC TÍNH TOÁN ĐÚNG');
    console.log('='.repeat(70));

    // total_earned = SUM(cashback) WHERE reconciled
    const expectedTotalEarned = totalReconciled;

    // total_withdrawn = SUM(paid payment requests)
    const expectedTotalWithdrawn = totalPaidRequests;

    // pending_reserved = SUM(confirmed payment requests)
    const expectedPendingReserved = totalConfirmedRequests;

    // available_balance = total_earned - total_withdrawn - pending_reserved
    const expectedAvailable = expectedTotalEarned - expectedTotalWithdrawn - expectedPendingReserved;

    console.log(`\nGIÁ TRỊ ĐÚNG (Expected):`);
    console.log(`  - total_earned = SUM(reconciled) = ${expectedTotalEarned.toLocaleString('vi-VN')}đ`);
    console.log(`  - total_withdrawn = SUM(paid requests) = ${expectedTotalWithdrawn.toLocaleString('vi-VN')}đ`);
    console.log(`  - pending_reserved = SUM(confirmed requests) = ${expectedPendingReserved.toLocaleString('vi-VN')}đ`);
    console.log(`  - available_balance = ${expectedTotalEarned.toLocaleString('vi-VN')} - ${expectedTotalWithdrawn.toLocaleString('vi-VN')} - ${expectedPendingReserved.toLocaleString('vi-VN')} = ${expectedAvailable.toLocaleString('vi-VN')}đ`);

    // 7. COMPARE
    console.log('\n' + '='.repeat(70));
    console.log('7. SO SÁNH VÀ PHÁT HIỆN LỖI');
    console.log('='.repeat(70));

    if (balanceResult.rows.length > 0) {
      const b = balanceResult.rows[0];
      const dbTotalEarned = parseFloat(b.total_earned);
      const dbTotalWithdrawn = parseFloat(b.total_withdrawn);
      const dbPendingReserved = parseFloat(b.pending_reserved);

      console.log('\n');

      if (Math.abs(dbTotalEarned - expectedTotalEarned) > 0.01) {
        console.log(`❌ total_earned SAI: DB=${dbTotalEarned.toLocaleString('vi-VN')}đ, Expected=${expectedTotalEarned.toLocaleString('vi-VN')}đ`);
      } else {
        console.log(`✅ total_earned ĐÚNG: ${dbTotalEarned.toLocaleString('vi-VN')}đ`);
      }

      if (Math.abs(dbTotalWithdrawn - expectedTotalWithdrawn) > 0.01) {
        console.log(`❌ total_withdrawn SAI: DB=${dbTotalWithdrawn.toLocaleString('vi-VN')}đ, Expected=${expectedTotalWithdrawn.toLocaleString('vi-VN')}đ`);
      } else {
        console.log(`✅ total_withdrawn ĐÚNG: ${dbTotalWithdrawn.toLocaleString('vi-VN')}đ`);
      }

      if (Math.abs(dbPendingReserved - expectedPendingReserved) > 0.01) {
        console.log(`❌ pending_reserved SAI: DB=${dbPendingReserved.toLocaleString('vi-VN')}đ, Expected=${expectedPendingReserved.toLocaleString('vi-VN')}đ`);
      } else {
        console.log(`✅ pending_reserved ĐÚNG: ${dbPendingReserved.toLocaleString('vi-VN')}đ`);
      }
    }

    // 8. Dashboard values
    console.log('\n' + '='.repeat(70));
    console.log('8. GIÁ TRỊ HIỂN THỊ TRÊN UI');
    console.log('='.repeat(70));

    console.log(`\n  Theo ảnh chụp màn hình:`);
    console.log(`  - "Số dư hệ thống - Tổng cashback": 133.100đ (Ghi chú: bao gồm chưa đối soát)`);
    console.log(`  - "Số dư từ đơn hàng": 211.200đ`);
    console.log(`  - "Đã duyệt": 203.100đ`);
    console.log(`  - "Chờ duyệt": 0đ`);

    console.log(`\n  Giá trị ĐÚNG từ dữ liệu:`);
    console.log(`  - Tổng cashback (tất cả approved): ${totalApproved.toLocaleString('vi-VN')}đ`);
    console.log(`  - Tổng đã đối soát (reconciled): ${totalReconciled.toLocaleString('vi-VN')}đ`);
    console.log(`  - Số dư khả dụng: ${expectedAvailable.toLocaleString('vi-VN')}đ`);

    console.log('\n' + '='.repeat(70));
    console.log('DONE');
    console.log('='.repeat(70));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

comprehensiveCheck().catch(console.error);
