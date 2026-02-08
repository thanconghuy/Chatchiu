/**
 * Verify User Metrics Script
 *
 * Kiểm tra và so sánh tất cả số liệu của một user
 * theo định nghĩa trong METRICS_DEFINITIONS.md
 *
 * Usage: node scripts/verify-user-metrics.js [email]
 * Default: ks.vinhle@gmail.com
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/database');

const TEST_USER_EMAIL = process.argv[2] || 'ks.vinhle@gmail.com';

async function verifyUserMetrics() {
  console.log('='.repeat(80));
  console.log('VERIFY USER METRICS');
  console.log('Theo định nghĩa trong METRICS_DEFINITIONS.md');
  console.log('='.repeat(80));
  console.log(`\nUser: ${TEST_USER_EMAIL}\n`);

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    // Get user info
    const userResult = await pool.query(`
      SELECT id, email, full_name, username FROM users WHERE email = $1
    `, [TEST_USER_EMAIL]);

    if (userResult.rows.length === 0) {
      console.log('User not found!');
      return;
    }

    const user = userResult.rows[0];
    console.log(`Name: ${user.full_name || user.username || 'N/A'}`);
    console.log(`ID: ${user.id}`);

    // =====================================================
    // 1. CONVERSION METRICS
    // =====================================================
    console.log('\n' + '='.repeat(80));
    console.log('1. CONVERSION METRICS (từ system_conversions)');
    console.log('='.repeat(80));

    const conversionResult = await pool.query(`
      SELECT
        -- Total ALL orders (for Tổng Cashback)
        COUNT(*) as total_count,
        COALESCE(SUM(cashback_amount), 0) as total_all_cashback,

        -- By status
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'pending'), 0) as pending_cashback,

        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'approved'), 0) as total_approved_cashback,

        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'rejected'), 0) as rejected_cashback,

        -- Approved breakdown
        COUNT(*) FILTER (WHERE status = 'approved' AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')) as unreconciled_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'approved' AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')), 0) as unreconciled_cashback,

        COUNT(*) FILTER (WHERE status = 'approved' AND system_reconciliation_status = 'reconciled') as reconciled_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'approved' AND system_reconciliation_status = 'reconciled'), 0) as reconciled_cashback,

        -- Payment status
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_conversions_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE payment_status = 'paid'), 0) as paid_conversions_cashback,

        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'approved' AND system_reconciliation_status = 'reconciled' AND (payment_status IS NULL OR payment_status = 'unpaid')), 0) as reconciled_unpaid_cashback

      FROM system_conversions
      WHERE user_id = $1
    `, [user.id]);

    const conv = conversionResult.rows[0];

    console.log('\n  TỔNG TẤT CẢ ĐƠN HÀNG:');
    console.log(`  TỔNG CASHBACK:              ${conv.total_count} đơn | ${parseFloat(conv.total_all_cashback).toLocaleString('vi-VN')}đ`);

    console.log('\n  STATUS BREAKDOWN:');
    console.log(`  ├─ Chờ duyệt (pending):     ${conv.pending_count} đơn | ${parseFloat(conv.pending_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`  ├─ Đã duyệt (approved):     ${conv.approved_count} đơn | ${parseFloat(conv.total_approved_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`  │   ├─ Chưa đối soát:       ${conv.unreconciled_count} đơn | ${parseFloat(conv.unreconciled_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`  │   └─ Đã đối soát:         ${conv.reconciled_count} đơn | ${parseFloat(conv.reconciled_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`  └─ Đã hủy (rejected):       ${conv.rejected_count} đơn | ${parseFloat(conv.rejected_cashback).toLocaleString('vi-VN')}đ`);

    console.log('\n  PAYMENT STATUS (conversions):');
    console.log(`  ├─ Đã TT (paid):            ${conv.paid_conversions_count} đơn | ${parseFloat(conv.paid_conversions_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`  └─ Đã đối soát, chưa TT:    ${parseFloat(conv.reconciled_unpaid_cashback).toLocaleString('vi-VN')}đ`);

    // =====================================================
    // 2. PAYMENT REQUEST METRICS
    // =====================================================
    console.log('\n' + '='.repeat(80));
    console.log('2. PAYMENT REQUEST METRICS (từ payment_requests)');
    console.log('='.repeat(80));

    const paymentResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,

        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'confirmed'), 0) as confirmed_amount,

        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,

        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'rejected'), 0) as rejected_amount,

        COUNT(*) FILTER (WHERE cancelled_at IS NOT NULL) as cancelled_count
      FROM payment_requests
      WHERE user_id = $1
    `, [user.id]);

    const pay = paymentResult.rows[0];

    console.log('\n  STATUS BREAKDOWN:');
    console.log(`  ├─ Chờ xử lý (pending):     ${pay.pending_count} | ${parseFloat(pay.pending_amount).toLocaleString('vi-VN')}đ`);
    console.log(`  ├─ Đã xác nhận (confirmed): ${pay.confirmed_count} | ${parseFloat(pay.confirmed_amount).toLocaleString('vi-VN')}đ`);
    console.log(`  ├─ Đã thanh toán (paid):    ${pay.paid_count} | ${parseFloat(pay.paid_amount).toLocaleString('vi-VN')}đ`);
    console.log(`  ├─ Từ chối (rejected):      ${pay.rejected_count} | ${parseFloat(pay.rejected_amount).toLocaleString('vi-VN')}đ`);
    console.log(`  └─ Đã hủy (cancelled):      ${pay.cancelled_count}`);

    // =====================================================
    // 3. USER_SYSTEM_BALANCE METRICS
    // =====================================================
    console.log('\n' + '='.repeat(80));
    console.log('3. USER_SYSTEM_BALANCE (giá trị trong DB)');
    console.log('='.repeat(80));

    const balanceResult = await pool.query(`
      SELECT * FROM user_system_balance WHERE user_id = $1
    `, [user.id]);

    if (balanceResult.rows.length > 0) {
      const bal = balanceResult.rows[0];
      console.log(`\n  total_earned:      ${parseFloat(bal.total_earned).toLocaleString('vi-VN')}đ`);
      console.log(`  total_withdrawn:   ${parseFloat(bal.total_withdrawn).toLocaleString('vi-VN')}đ`);
      console.log(`  pending_reserved:  ${parseFloat(bal.pending_reserved).toLocaleString('vi-VN')}đ`);
      console.log(`  debt_balance:      ${parseFloat(bal.debt_balance || 0).toLocaleString('vi-VN')}đ`);
    } else {
      console.log('\n  (No balance record)');
    }

    // =====================================================
    // 4. CALCULATED METRICS
    // =====================================================
    console.log('\n' + '='.repeat(80));
    console.log('4. CALCULATED METRICS (công thức theo METRICS_DEFINITIONS.md)');
    console.log('='.repeat(80));

    const totalWithdrawn = parseFloat(pay.paid_amount);
    const pendingReserved = parseFloat(pay.confirmed_amount);
    const reconciledUnpaid = parseFloat(conv.reconciled_unpaid_cashback);
    const availableBalance = Math.max(0, reconciledUnpaid - totalWithdrawn - pendingReserved);

    console.log('\n  CÔNG THỨC:');
    console.log(`  available_balance = reconciled_unpaid - total_withdrawn - pending_reserved`);
    console.log(`                    = ${reconciledUnpaid.toLocaleString('vi-VN')} - ${totalWithdrawn.toLocaleString('vi-VN')} - ${pendingReserved.toLocaleString('vi-VN')}`);
    console.log(`                    = ${availableBalance.toLocaleString('vi-VN')}đ`);

    const minAmount = 50000;
    const maxPayable = Math.floor(availableBalance / minAmount) * minAmount;

    console.log(`\n  max_payable = floor(${availableBalance.toLocaleString('vi-VN')} / ${minAmount.toLocaleString('vi-VN')}) * ${minAmount.toLocaleString('vi-VN')}`);
    console.log(`             = ${maxPayable.toLocaleString('vi-VN')}đ`);

    // =====================================================
    // 5. CASHBACK STATS PAGE VALUES
    // =====================================================
    console.log('\n' + '='.repeat(80));
    console.log('5. GIÁ TRỊ HIỂN THỊ TRÊN CASHBACK STATS PAGE (sau khi sửa)');
    console.log('='.repeat(80));

    console.log('\n  | Column              | Value                          |');
    console.log('  |---------------------|--------------------------------|');
    console.log(`  | Tổng Cashback       | ${parseFloat(conv.total_all_cashback).toLocaleString('vi-VN').padStart(25)}đ |`);
    console.log(`  | Chờ Duyệt           | ${parseFloat(conv.pending_cashback).toLocaleString('vi-VN').padStart(25)}đ |`);
    console.log(`  | Đã Duyệt (tất cả)   | ${parseFloat(conv.total_approved_cashback).toLocaleString('vi-VN').padStart(25)}đ |`);
    console.log(`  | Đã Hủy              | ${parseFloat(conv.rejected_cashback).toLocaleString('vi-VN').padStart(25)}đ |`);
    console.log(`  | Đã Thanh Toán       | ${totalWithdrawn.toLocaleString('vi-VN').padStart(25)}đ |`);
    console.log(`  | Số Dư Còn Lại       | ${availableBalance.toLocaleString('vi-VN').padStart(25)}đ |`);

    // Verify: Tổng = Chờ Duyệt + Đã Duyệt + Đã Hủy
    const calculatedTotal = parseFloat(conv.pending_cashback) + parseFloat(conv.total_approved_cashback) + parseFloat(conv.rejected_cashback);
    const actualTotal = parseFloat(conv.total_all_cashback);
    const sumMatches = Math.abs(calculatedTotal - actualTotal) < 0.01;
    console.log(`\n  VERIFICATION: Tổng = Chờ Duyệt + Đã Duyệt + Đã Hủy`);
    console.log(`  ${actualTotal.toLocaleString('vi-VN')} = ${parseFloat(conv.pending_cashback).toLocaleString('vi-VN')} + ${parseFloat(conv.total_approved_cashback).toLocaleString('vi-VN')} + ${parseFloat(conv.rejected_cashback).toLocaleString('vi-VN')}`);
    console.log(`  ${sumMatches ? '✅ PASS' : '❌ FAIL'}`);

    // =====================================================
    // 6. VERIFICATION
    // =====================================================
    console.log('\n' + '='.repeat(80));
    console.log('6. VERIFICATION (kiểm tra logic)');
    console.log('='.repeat(80));

    // Check 1: total_approved = unreconciled + reconciled
    const check1 = Math.abs(
      parseFloat(conv.total_approved_cashback) -
      (parseFloat(conv.unreconciled_cashback) + parseFloat(conv.reconciled_cashback))
    ) < 0.01;

    console.log(`\n  ✓ approved = unreconciled + reconciled: ${check1 ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`    ${parseFloat(conv.total_approved_cashback).toLocaleString('vi-VN')} = ${parseFloat(conv.unreconciled_cashback).toLocaleString('vi-VN')} + ${parseFloat(conv.reconciled_cashback).toLocaleString('vi-VN')}`);

    // Check 2: DB values match calculated
    if (balanceResult.rows.length > 0) {
      const bal = balanceResult.rows[0];
      const dbTotalEarned = parseFloat(bal.total_earned);
      const dbTotalWithdrawn = parseFloat(bal.total_withdrawn);
      const dbPendingReserved = parseFloat(bal.pending_reserved);

      const check2a = Math.abs(dbTotalEarned - parseFloat(conv.reconciled_cashback)) < 0.01;
      const check2b = Math.abs(dbTotalWithdrawn - totalWithdrawn) < 0.01;
      const check2c = Math.abs(dbPendingReserved - pendingReserved) < 0.01;

      console.log(`\n  ✓ DB total_earned = reconciled_cashback: ${check2a ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`    DB: ${dbTotalEarned.toLocaleString('vi-VN')} | Calc: ${parseFloat(conv.reconciled_cashback).toLocaleString('vi-VN')}`);

      console.log(`\n  ✓ DB total_withdrawn = paid_requests: ${check2b ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`    DB: ${dbTotalWithdrawn.toLocaleString('vi-VN')} | Calc: ${totalWithdrawn.toLocaleString('vi-VN')}`);

      console.log(`\n  ✓ DB pending_reserved = confirmed_requests: ${check2c ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`    DB: ${dbPendingReserved.toLocaleString('vi-VN')} | Calc: ${pendingReserved.toLocaleString('vi-VN')}`);
    }

    // Check 3: Tổng cashback >= Đã duyệt (should always be true after fix)
    const check3 = parseFloat(conv.total_approved_cashback) >= parseFloat(conv.unreconciled_cashback);
    console.log(`\n  ✓ Tổng Cashback >= Đã Duyệt (chưa đ/s): ${check3 ? '✅ PASS' : '❌ FAIL'}`);

    console.log('\n' + '='.repeat(80));
    console.log('DONE');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

verifyUserMetrics().catch(console.error);
