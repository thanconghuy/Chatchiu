/**
 * SQL Test - Complete User Statistics
 *
 * Chạy các query SQL thực tế để kiểm tra số liệu cho testuser@test.com
 * So sánh với UI hiển thị
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/database');

const TEST_USER_EMAIL = 'testuser@test.com';

async function runSQLTests() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║           SQL TEST - COMPLETE USER STATISTICS                         ║');
  console.log('║           User: testuser@test.com                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  try {
    // Get user ID first
    const userResult = await pool.query(`SELECT id, email, full_name FROM users WHERE email = $1`, [TEST_USER_EMAIL]);
    if (userResult.rows.length === 0) {
      console.log('User not found!');
      return;
    }
    const userId = userResult.rows[0].id;
    console.log(`\n👤 User: ${userResult.rows[0].full_name} (${userResult.rows[0].email})`);
    console.log(`   ID: ${userId}\n`);

    // ================================================================
    // SECTION 1: SYSTEM_CONVERSIONS (Đơn hàng)
    // ================================================================
    console.log('┌──────────────────────────────────────────────────────────────────────┐');
    console.log('│ 1. SYSTEM_CONVERSIONS (Nguồn dữ liệu đơn hàng)                       │');
    console.log('└──────────────────────────────────────────────────────────────────────┘');

    const q1 = `
      SELECT
        -- Tổng số đơn
        COUNT(*) as total_orders,

        -- Theo trạng thái duyệt
        COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,

        -- Tổng cashback theo trạng thái
        COALESCE(SUM(cashback_amount), 0) as total_cashback,
        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'approved'), 0) as approved_cashback,
        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'pending'), 0) as pending_cashback,

        -- Theo trạng thái đối soát
        COUNT(*) FILTER (WHERE system_reconciliation_status = 'reconciled') as reconciled_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE system_reconciliation_status = 'reconciled'), 0) as reconciled_cashback,

        -- Chưa đối soát (approved nhưng chưa reconciled)
        COUNT(*) FILTER (WHERE status = 'approved' AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')) as not_reconciled_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'approved' AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')), 0) as not_reconciled_cashback,

        -- Theo trạng thái thanh toán
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE payment_status = 'paid'), 0) as paid_cashback,

        -- Đã đối soát nhưng chưa thanh toán (có thể rút)
        COUNT(*) FILTER (WHERE system_reconciliation_status = 'reconciled' AND (payment_status IS NULL OR payment_status = 'unpaid')) as withdrawable_count,
        COALESCE(SUM(cashback_amount) FILTER (WHERE system_reconciliation_status = 'reconciled' AND (payment_status IS NULL OR payment_status = 'unpaid')), 0) as withdrawable_cashback

      FROM system_conversions
      WHERE user_id = $1
    `;

    const r1 = await pool.query(q1, [userId]);
    const s1 = r1.rows[0];

    console.log('\n📊 THỐNG KÊ ĐƠN HÀNG:');
    console.log('─'.repeat(50));
    console.log(`   Tổng số đơn:                    ${s1.total_orders}`);
    console.log(`   ├─ Đã duyệt (approved):         ${s1.approved_count} (${parseFloat(s1.approved_cashback).toLocaleString('vi-VN')}đ)`);
    console.log(`   ├─ Chờ duyệt (pending):         ${s1.pending_count} (${parseFloat(s1.pending_cashback).toLocaleString('vi-VN')}đ)`);
    console.log(`   └─ Từ chối (rejected):          ${s1.rejected_count}`);
    console.log('');
    console.log('📋 TRẠNG THÁI ĐỐI SOÁT (trong số approved):');
    console.log('─'.repeat(50));
    console.log(`   Đã đối soát (reconciled):       ${s1.reconciled_count} (${parseFloat(s1.reconciled_cashback).toLocaleString('vi-VN')}đ)`);
    console.log(`   Chưa đối soát:                  ${s1.not_reconciled_count} (${parseFloat(s1.not_reconciled_cashback).toLocaleString('vi-VN')}đ)`);
    console.log('');
    console.log('💰 TRẠNG THÁI THANH TOÁN (trong số reconciled):');
    console.log('─'.repeat(50));
    console.log(`   Đã thanh toán (paid):           ${s1.paid_count} (${parseFloat(s1.paid_cashback).toLocaleString('vi-VN')}đ)`);
    console.log(`   Có thể rút (reconciled, unpaid): ${s1.withdrawable_count} (${parseFloat(s1.withdrawable_cashback).toLocaleString('vi-VN')}đ)`);

    // ================================================================
    // SECTION 2: USER_SYSTEM_BALANCE
    // ================================================================
    console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
    console.log('│ 2. USER_SYSTEM_BALANCE (Bảng số dư)                                  │');
    console.log('└──────────────────────────────────────────────────────────────────────┘');

    const q2 = `
      SELECT
        total_earned,
        total_withdrawn,
        pending_reserved,
        debt_balance,
        (total_earned - total_withdrawn - pending_reserved) as computed_available,
        GREATEST(0, total_earned - total_withdrawn - pending_reserved) as display_available
      FROM user_system_balance
      WHERE user_id = $1
    `;

    const r2 = await pool.query(q2, [userId]);

    if (r2.rows.length > 0) {
      const s2 = r2.rows[0];
      console.log('\n💳 SỐ DƯ TRONG DATABASE:');
      console.log('─'.repeat(50));
      console.log(`   total_earned:       ${parseFloat(s2.total_earned).toLocaleString('vi-VN')}đ`);
      console.log(`   total_withdrawn:    ${parseFloat(s2.total_withdrawn).toLocaleString('vi-VN')}đ`);
      console.log(`   pending_reserved:   ${parseFloat(s2.pending_reserved).toLocaleString('vi-VN')}đ`);
      console.log(`   debt_balance:       ${parseFloat(s2.debt_balance || 0).toLocaleString('vi-VN')}đ`);
      console.log('─'.repeat(50));
      console.log(`   computed_available: ${parseFloat(s2.computed_available).toLocaleString('vi-VN')}đ`);
      console.log(`   display_available:  ${parseFloat(s2.display_available).toLocaleString('vi-VN')}đ (GREATEST(0, ...)`);

      if (parseFloat(s2.computed_available) < 0) {
        console.log(`\n   ⚠️  NỢ: ${Math.abs(parseFloat(s2.computed_available)).toLocaleString('vi-VN')}đ`);
      }
    }

    // ================================================================
    // SECTION 3: PAYMENT_REQUESTS
    // ================================================================
    console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
    console.log('│ 3. PAYMENT_REQUESTS (Yêu cầu thanh toán)                             │');
    console.log('└──────────────────────────────────────────────────────────────────────┘');

    const q3 = `
      SELECT
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_count,
        COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_count,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected_count,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'paid'), 0) as paid_amount,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'pending'), 0) as pending_amount,
        COALESCE(SUM(requested_amount) FILTER (WHERE status = 'confirmed'), 0) as confirmed_amount
      FROM payment_requests
      WHERE user_id = $1
    `;

    const r3 = await pool.query(q3, [userId]);
    const s3 = r3.rows[0];

    console.log('\n📝 THỐNG KÊ YÊU CẦU THANH TOÁN:');
    console.log('─'.repeat(50));
    console.log(`   Tổng số yêu cầu:   ${s3.total_requests}`);
    console.log(`   ├─ Đã thanh toán:  ${s3.paid_count} (${parseFloat(s3.paid_amount).toLocaleString('vi-VN')}đ)`);
    console.log(`   ├─ Đã xác nhận:    ${s3.confirmed_count} (${parseFloat(s3.confirmed_amount).toLocaleString('vi-VN')}đ)`);
    console.log(`   ├─ Chờ xử lý:      ${s3.pending_count} (${parseFloat(s3.pending_amount).toLocaleString('vi-VN')}đ)`);
    console.log(`   ├─ Đã hủy:         ${s3.cancelled_count}`);
    console.log(`   └─ Từ chối:        ${s3.rejected_count}`);

    // ================================================================
    // SECTION 4: COMPARISON & ANALYSIS
    // ================================================================
    console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
    console.log('│ 4. SO SÁNH VỚI UI & PHÂN TÍCH                                        │');
    console.log('└──────────────────────────────────────────────────────────────────────┘');

    console.log('\n📺 UI HIỂN THỊ (từ ảnh chụp):');
    console.log('─'.repeat(50));
    console.log('   [Statistics Page]');
    console.log('   - Số dư hệ thống - Tổng cashback: 133.100đ');
    console.log('   - Số dư từ đơn hàng: 0đ');
    console.log('   - Đã duyệt: 203.100đ');
    console.log('   - Chờ duyệt: 0đ');
    console.log('   - Tổng đơn: 14');
    console.log('');
    console.log('   [History Page]');
    console.log('   - Có đơn "Đã đối soát" và "Chưa đối soát"');

    console.log('\n📊 GIÁ TRỊ ĐÚNG TỪ SQL:');
    console.log('─'.repeat(50));
    console.log(`   - Tổng đơn:               ${s1.total_orders} ✅`);
    console.log(`   - Đã duyệt (approved):    ${parseFloat(s1.approved_cashback).toLocaleString('vi-VN')}đ ✅`);
    console.log(`   - Chờ duyệt (pending):    ${parseFloat(s1.pending_cashback).toLocaleString('vi-VN')}đ ✅`);
    console.log(`   - Đã đối soát:            ${parseFloat(s1.reconciled_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`   - Chưa đối soát:          ${parseFloat(s1.not_reconciled_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`   - Có thể rút:             ${parseFloat(s1.withdrawable_cashback).toLocaleString('vi-VN')}đ`);

    // ================================================================
    // SECTION 5: DETAILED ORDER LIST
    // ================================================================
    console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
    console.log('│ 5. CHI TIẾT TỪNG ĐƠN HÀNG                                            │');
    console.log('└──────────────────────────────────────────────────────────────────────┘');

    const q5 = `
      SELECT
        COALESCE(merchant_name, 'Unknown') as merchant,
        COALESCE(order_code, '-') as order_code,
        COALESCE(order_amount, 0) as order_value,
        COALESCE(cashback_amount, 0) as cashback,
        status,
        COALESCE(system_reconciliation_status, 'pending') as recon_status,
        COALESCE(payment_status, 'unpaid') as pay_status,
        order_time
      FROM system_conversions
      WHERE user_id = $1
      ORDER BY order_time DESC
    `;

    const r5 = await pool.query(q5, [userId]);

    console.log('\n');
    console.log('┌─────────────────┬────────────────────────┬────────────┬───────────┬──────────┬────────────┬─────────┐');
    console.log('│ Merchant        │ Order Code             │ Order Val  │ Cashback  │ Status   │ Recon      │ Paid    │');
    console.log('├─────────────────┼────────────────────────┼────────────┼───────────┼──────────┼────────────┼─────────┤');

    r5.rows.forEach(row => {
      const merchant = row.merchant.substring(0, 15).padEnd(15);
      const code = (row.order_code || '-').substring(0, 22).padEnd(22);
      const value = parseFloat(row.order_value).toLocaleString('vi-VN').padStart(10);
      const cb = parseFloat(row.cashback).toLocaleString('vi-VN').padStart(9);
      const status = row.status.padEnd(8);
      const recon = (row.recon_status === 'reconciled' ? '✓ Đã DS' : '○ Chưa DS').padEnd(10);
      const paid = (row.pay_status === 'paid' ? '✓' : '○').padEnd(7);

      console.log(`│ ${merchant} │ ${code} │ ${value} │ ${cb} │ ${status} │ ${recon} │ ${paid} │`);
    });

    console.log('└─────────────────┴────────────────────────┴────────────┴───────────┴──────────┴────────────┴─────────┘');

    // ================================================================
    // SECTION 6: RECOMMENDATIONS
    // ================================================================
    console.log('\n┌──────────────────────────────────────────────────────────────────────┐');
    console.log('│ 6. NHẬN XÉT & ĐỀ XUẤT                                                │');
    console.log('└──────────────────────────────────────────────────────────────────────┘');

    const totalApproved = parseFloat(s1.approved_cashback);
    const totalReconciled = parseFloat(s1.reconciled_cashback);
    const notReconciled = parseFloat(s1.not_reconciled_cashback);
    const withdrawable = parseFloat(s1.withdrawable_cashback);
    const paidAmount = parseFloat(s3.paid_amount);

    console.log('\n📝 PHÂN TÍCH:');
    console.log('─'.repeat(50));
    console.log(`   1. Tổng approved: ${totalApproved.toLocaleString('vi-VN')}đ`);
    console.log(`      - Đã đối soát: ${totalReconciled.toLocaleString('vi-VN')}đ`);
    console.log(`      - Chưa đối soát: ${notReconciled.toLocaleString('vi-VN')}đ`);
    console.log('');
    console.log(`   2. Đã rút: ${paidAmount.toLocaleString('vi-VN')}đ`);
    console.log(`   3. Có thể rút: ${withdrawable.toLocaleString('vi-VN')}đ`);

    if (paidAmount > totalReconciled) {
      const debt = paidAmount - totalReconciled;
      console.log('');
      console.log(`   ⚠️  VẤN ĐỀ: User đã rút ${paidAmount.toLocaleString('vi-VN')}đ`);
      console.log(`              nhưng chỉ có ${totalReconciled.toLocaleString('vi-VN')}đ đã đối soát`);
      console.log(`              → NỢ: ${debt.toLocaleString('vi-VN')}đ`);
    }

    if (notReconciled > 0) {
      console.log('');
      console.log(`   📌 CÒN ${notReconciled.toLocaleString('vi-VN')}đ CHƯA ĐỐI SOÁT`);
      console.log(`      (${s1.not_reconciled_count} đơn hàng cần được đối soát trước khi rút)`);
    }

    console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║                              DONE                                     ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');

  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

runSQLTests().catch(console.error);
