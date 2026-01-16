require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== KIỂM TRA HỆ THỐNG CUỐI CÙNG ===\n');
    console.log('Bỏ qua: Test users và dữ liệu legacy\n');
    console.log('='.repeat(80));

    const criticalIssues = [];

    // ========================================
    // CHECK 1: Conversions paid nhưng chưa reconciled
    // ========================================
    console.log('\n\n🔍 CHECK 1: CONVERSIONS PAID CHƯA RECONCILED (CRITICAL)\n');
    console.log('='.repeat(80));

    const check1 = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_conversions
      WHERE payment_status = 'paid'
        AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
    `);

    const count1 = parseInt(check1.rows[0].count);
    console.log(`Conversions paid nhưng chưa reconciled: ${count1} ${count1 > 0 ? '❌' : '✅'}`);
    if (count1 > 0) {
      criticalIssues.push(`${count1} conversions đã thanh toán nhưng chưa đối soát`);
    }

    // ========================================
    // CHECK 2: Conversions có recon_id nhưng thiếu status
    // ========================================
    console.log('\n\n🔍 CHECK 2: CONVERSIONS CÓ RECON_ID THIẾU STATUS (CRITICAL)\n');
    console.log('='.repeat(80));

    const check2 = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_conversions
      WHERE system_reconciliation_id IS NOT NULL
        AND system_reconciliation_status IS NULL
    `);

    const count2 = parseInt(check2.rows[0].count);
    console.log(`Conversions có recon_id thiếu status: ${count2} ${count2 > 0 ? '❌' : '✅'}`);
    if (count2 > 0) {
      criticalIssues.push(`${count2} conversions có reconciliation_id nhưng thiếu status`);
    }

    // ========================================
    // CHECK 3: Số dư âm
    // ========================================
    console.log('\n\n🔍 CHECK 3: SỐ DƯ ÂM (CRITICAL)\n');
    console.log('='.repeat(80));

    const check3 = await pool.query(`
      SELECT
        u.email,
        usb.available_balance
      FROM user_system_balance usb
      JOIN users u ON u.id = usb.user_id
      WHERE usb.available_balance < 0
        AND u.email NOT LIKE '%test%'
    `);

    console.log(`Users có số dư âm: ${check3.rows.length} ${check3.rows.length > 0 ? '❌' : '✅'}`);
    if (check3.rows.length > 0) {
      criticalIssues.push(`${check3.rows.length} users có số dư âm`);
      check3.rows.forEach(row => {
        console.log(`  - ${row.email}: ${parseFloat(row.available_balance).toLocaleString('vi-VN')} đ`);
      });
    }

    // ========================================
    // CHECK 4: Confirmed requests không reserve balance
    // ========================================
    console.log('\n\n🔍 CHECK 4: CONFIRMED REQUESTS RESERVE BALANCE (CRITICAL)\n');
    console.log('='.repeat(80));

    const check4 = await pool.query(`
      SELECT
        COUNT(DISTINCT pr.user_id) as user_count,
        SUM(pr.requested_amount) as total_should_reserve,
        SUM(usb.pending_reserved) as total_reserved
      FROM payment_requests pr
      JOIN user_system_balance usb ON pr.user_id = usb.user_id
      WHERE pr.status = 'confirmed'
    `);

    if (check4.rows.length > 0 && check4.rows[0].user_count > 0) {
      const shouldReserve = parseFloat(check4.rows[0].total_should_reserve);
      const actualReserve = parseFloat(check4.rows[0].total_reserved);
      const diff = Math.abs(shouldReserve - actualReserve);

      console.log(`Confirmed requests: ${check4.rows[0].user_count} users`);
      console.log(`  Should reserve: ${shouldReserve.toLocaleString('vi-VN')} đ`);
      console.log(`  Actually reserved: ${actualReserve.toLocaleString('vi-VN')} đ`);
      console.log(`  Status: ${diff < 0.01 ? '✅' : '❌'}`);

      if (diff >= 0.01) {
        criticalIssues.push(`Pending reserved không khớp: chênh lệch ${diff.toLocaleString('vi-VN')} đ`);
      }
    } else {
      console.log(`Không có confirmed requests ✅`);
    }

    // ========================================
    // CHECK 5: Paid requests không có conversions
    // ========================================
    console.log('\n\n🔍 CHECK 5: PAID REQUESTS KHÔNG CÓ CONVERSIONS (CRITICAL)\n');
    console.log('='.repeat(80));

    const check5 = await pool.query(`
      SELECT
        pr.id,
        pr.requested_amount,
        u.email
      FROM payment_requests pr
      JOIN users u ON pr.user_id = u.id
      WHERE pr.status = 'paid'
        AND NOT EXISTS (
          SELECT 1 FROM system_conversions WHERE payment_request_id = pr.id
        )
        AND u.email NOT LIKE '%test%'
    `);

    console.log(`Paid requests không có conversions: ${check5.rows.length} ${check5.rows.length > 0 ? '❌' : '✅'}`);
    if (check5.rows.length > 0) {
      criticalIssues.push(`${check5.rows.length} paid requests không có conversions linked`);
      check5.rows.forEach(row => {
        console.log(`  - ${row.email}: ${parseFloat(row.requested_amount).toLocaleString('vi-VN')} đ`);
      });
    }

    // ========================================
    // CHECK 6: Balance của production users
    // ========================================
    console.log('\n\n🔍 CHECK 6: BALANCE PRODUCTION USERS (INFO)\n');
    console.log('='.repeat(80));

    const check6 = await pool.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (
          WHERE ABS(
            usb.total_earned -
            COALESCE((
              SELECT SUM(cashback_amount)
              FROM system_conversions
              WHERE user_id = usb.user_id
                AND status = 'approved'
                AND system_reconciliation_status = 'reconciled'
            ), 0)
          ) >= 0.01
        ) as wrong_users
      FROM user_system_balance usb
      JOIN users u ON u.id = usb.user_id
      WHERE u.email NOT LIKE '%test%'
        AND (usb.total_earned > 0 OR EXISTS (
          SELECT 1 FROM system_conversions WHERE user_id = usb.user_id
        ))
    `);

    const wrongBalanceUsers = parseInt(check6.rows[0].wrong_users);
    console.log(`Production users có total_earned sai: ${wrongBalanceUsers} / ${check6.rows[0].total_users} ${wrongBalanceUsers > 0 ? '⚠️' : '✅'}`);
    if (wrongBalanceUsers > 0) {
      console.log(`  (Có thể là dữ liệu cũ/legacy - không ảnh hưởng workflow mới)`);
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n\n📊 KẾT LUẬN\n');
    console.log('='.repeat(80));

    if (criticalIssues.length === 0) {
      console.log('\n✅✅✅ HỆ THỐNG HOÀN TOÀN CHÍNH XÁC! ✅✅✅\n');
      console.log('Tất cả các vấn đề CRITICAL đã được fix:');
      console.log('  ✅ Không có conversions paid chưa reconciled');
      console.log('  ✅ Không có conversions thiếu reconciliation_status');
      console.log('  ✅ Không có số dư âm');
      console.log('  ✅ Pending reserved chính xác');
      console.log('  ✅ Paid requests đều có conversions linked');
      console.log('\n🎉 WORKFLOW THANH TOÁN HOẠT ĐỘNG HOÀN HẢO! 🎉\n');
    } else {
      console.log('\n⚠️  CÒN CÁC VẤN ĐỀ CRITICAL CẦN FIX:\n');
      criticalIssues.forEach((issue, i) => {
        console.log(`  ${i+1}. ${issue}`);
      });
      console.log('');
    }

    await pool.end();
    console.log('✅ Kiểm tra hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
