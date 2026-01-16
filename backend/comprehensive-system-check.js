require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== KIỂM TRA TOÀN BỘ HỆ THỐNG ===\n');
    console.log('Tìm kiếm các vấn đề còn tồn đọng...\n');
    console.log('='.repeat(80));

    const issues = [];

    // ========================================
    // CHECK 1: Conversions có status không hợp lý
    // ========================================
    console.log('\n\n🔍 CHECK 1: CONVERSIONS VỚI STATUS KHÔNG HỢP LÝ\n');
    console.log('='.repeat(80));

    // 1.1: Conversions approved nhưng chưa có reconciliation_status
    const check1_1 = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_conversions
      WHERE status = 'approved'
        AND system_reconciliation_status IS NULL
        AND system_reconciliation_id IS NULL
    `);

    const count1_1 = parseInt(check1_1.rows[0].count);
    console.log(`1.1. Approved nhưng chưa đối soát: ${count1_1} ${count1_1 > 0 ? '⚠️' : '✅'}`);
    if (count1_1 > 0) {
      issues.push({
        type: 'Conversions chưa đối soát',
        count: count1_1,
        severity: 'INFO',
        note: 'Đây là conversions đã duyệt nhưng chưa đến kỳ đối soát (< 15 ngày)'
      });
    }

    // 1.2: Conversions có reconciliation_id nhưng không có status
    const check1_2 = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_conversions
      WHERE system_reconciliation_id IS NOT NULL
        AND system_reconciliation_status IS NULL
    `);

    const count1_2 = parseInt(check1_2.rows[0].count);
    console.log(`1.2. Có recon_id nhưng thiếu status: ${count1_2} ${count1_2 > 0 ? '❌' : '✅'}`);
    if (count1_2 > 0) {
      issues.push({
        type: 'Thiếu reconciliation_status',
        count: count1_2,
        severity: 'CRITICAL',
        note: 'Cần chạy migration 041 để fix'
      });
    }

    // 1.3: Conversions paid nhưng chưa reconciled
    const check1_3 = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_conversions
      WHERE payment_status = 'paid'
        AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
    `);

    const count1_3 = parseInt(check1_3.rows[0].count);
    console.log(`1.3. Paid nhưng chưa reconciled: ${count1_3} ${count1_3 > 0 ? '❌' : '✅'}`);
    if (count1_3 > 0) {
      issues.push({
        type: 'Paid conversions chưa reconciled',
        count: count1_3,
        severity: 'CRITICAL',
        note: 'Không thể thanh toán conversions chưa đối soát'
      });
    }

    // ========================================
    // CHECK 2: Payment Requests với conversions không khớp
    // ========================================
    console.log('\n\n🔍 CHECK 2: PAYMENT REQUESTS CONSISTENCY\n');
    console.log('='.repeat(80));

    // 2.1: Paid requests nhưng không có conversions linked
    const check2_1 = await pool.query(`
      SELECT
        pr.id,
        pr.requested_amount,
        u.email,
        COUNT(sc.id) as conversions_count,
        COALESCE(SUM(sc.cashback_amount), 0) as conversions_amount
      FROM payment_requests pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN system_conversions sc ON sc.payment_request_id = pr.id
      WHERE pr.status = 'paid'
      GROUP BY pr.id, pr.requested_amount, u.email
      HAVING COUNT(sc.id) = 0
    `);

    console.log(`2.1. Paid requests không có conversions linked: ${check2_1.rows.length} ${check2_1.rows.length > 0 ? '❌' : '✅'}`);
    if (check2_1.rows.length > 0) {
      issues.push({
        type: 'Paid requests không có conversions',
        count: check2_1.rows.length,
        severity: 'CRITICAL',
        note: 'Payment request đã thanh toán nhưng không có conversions nào được mark'
      });
      check2_1.rows.slice(0, 3).forEach(row => {
        console.log(`   - ${row.email}: ${parseFloat(row.requested_amount).toLocaleString('vi-VN')} đ`);
      });
    }

    // 2.2: Paid requests với số tiền conversions không khớp
    const check2_2 = await pool.query(`
      SELECT
        pr.id,
        pr.requested_amount,
        u.email,
        COUNT(sc.id) as conversions_count,
        COALESCE(SUM(sc.cashback_amount), 0) as conversions_amount
      FROM payment_requests pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN system_conversions sc ON sc.payment_request_id = pr.id
      WHERE pr.status = 'paid'
      GROUP BY pr.id, pr.requested_amount, u.email
      HAVING ABS(pr.requested_amount - COALESCE(SUM(sc.cashback_amount), 0)) > 0.01
    `);

    console.log(`2.2. Paid requests với số tiền không khớp: ${check2_2.rows.length} ${check2_2.rows.length > 0 ? '⚠️' : '✅'}`);
    if (check2_2.rows.length > 0) {
      issues.push({
        type: 'Paid requests số tiền không khớp',
        count: check2_2.rows.length,
        severity: 'WARNING',
        note: 'Requested amount khác với tổng conversions linked'
      });
      check2_2.rows.slice(0, 3).forEach(row => {
        console.log(`   - ${row.email}: Request ${parseFloat(row.requested_amount).toLocaleString('vi-VN')} đ vs Conversions ${parseFloat(row.conversions_amount).toLocaleString('vi-VN')} đ`);
      });
    }

    // 2.3: Confirmed requests có reserve balance không?
    const check2_3 = await pool.query(`
      SELECT
        COUNT(DISTINCT pr.user_id) as user_count,
        SUM(pr.requested_amount) as total_should_reserve,
        SUM(usb.pending_reserved) as total_reserved
      FROM payment_requests pr
      JOIN user_system_balance usb ON pr.user_id = usb.user_id
      WHERE pr.status = 'confirmed'
    `);

    if (check2_3.rows.length > 0 && check2_3.rows[0].user_count > 0) {
      const shouldReserve = parseFloat(check2_3.rows[0].total_should_reserve);
      const actualReserve = parseFloat(check2_3.rows[0].total_reserved);
      const diff = Math.abs(shouldReserve - actualReserve);

      console.log(`2.3. Confirmed requests reserve balance: ${diff < 0.01 ? '✅' : '❌'}`);
      console.log(`   - Should reserve: ${shouldReserve.toLocaleString('vi-VN')} đ`);
      console.log(`   - Actually reserved: ${actualReserve.toLocaleString('vi-VN')} đ`);

      if (diff >= 0.01) {
        issues.push({
          type: 'Pending reserved không khớp',
          count: check2_3.rows[0].user_count,
          severity: 'CRITICAL',
          note: `Chênh lệch ${diff.toLocaleString('vi-VN')} đ`
        });
      }
    } else {
      console.log(`2.3. Confirmed requests reserve balance: ✅ (không có confirmed requests)`);
    }

    // ========================================
    // CHECK 3: Balance Consistency
    // ========================================
    console.log('\n\n🔍 CHECK 3: BALANCE CONSISTENCY\n');
    console.log('='.repeat(80));

    // 3.1: total_earned khớp với SUM(reconciled conversions)?
    const check3_1 = await pool.query(`
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
      WHERE usb.total_earned > 0 OR EXISTS (
        SELECT 1 FROM system_conversions WHERE user_id = usb.user_id
      )
    `);

    const wrongBalanceUsers = parseInt(check3_1.rows[0].wrong_users);
    console.log(`3.1. Users có total_earned sai: ${wrongBalanceUsers} / ${check3_1.rows[0].total_users} ${wrongBalanceUsers > 0 ? '❌' : '✅'}`);
    if (wrongBalanceUsers > 0) {
      issues.push({
        type: 'total_earned không chính xác',
        count: wrongBalanceUsers,
        severity: 'CRITICAL',
        note: 'Cần chạy migration 063 để fix trigger và re-sync'
      });
    }

    // 3.2: total_withdrawn khớp với SUM(paid conversions)?
    const check3_2 = await pool.query(`
      SELECT
        COUNT(*) as total_users,
        COUNT(*) FILTER (
          WHERE ABS(
            usb.total_withdrawn -
            COALESCE((
              SELECT SUM(cashback_amount)
              FROM system_conversions
              WHERE user_id = usb.user_id
                AND payment_status = 'paid'
            ), 0)
          ) >= 0.01
        ) as wrong_users
      FROM user_system_balance usb
      WHERE usb.total_withdrawn > 0 OR EXISTS (
        SELECT 1 FROM system_conversions WHERE user_id = usb.user_id AND payment_status = 'paid'
      )
    `);

    const wrongWithdrawnUsers = parseInt(check3_2.rows[0].wrong_users);
    console.log(`3.2. Users có total_withdrawn sai: ${wrongWithdrawnUsers} / ${check3_2.rows[0].total_users} ${wrongWithdrawnUsers > 0 ? '❌' : '✅'}`);
    if (wrongWithdrawnUsers > 0) {
      issues.push({
        type: 'total_withdrawn không chính xác',
        count: wrongWithdrawnUsers,
        severity: 'CRITICAL',
        note: 'Cần sync lại từ paid conversions'
      });

      // Show examples
      const examples = await pool.query(`
        SELECT
          u.email,
          usb.total_withdrawn as db_withdrawn,
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = usb.user_id
              AND payment_status = 'paid'
          ), 0) as correct_withdrawn
        FROM user_system_balance usb
        JOIN users u ON u.id = usb.user_id
        WHERE ABS(
          usb.total_withdrawn -
          COALESCE((
            SELECT SUM(cashback_amount)
            FROM system_conversions
            WHERE user_id = usb.user_id
              AND payment_status = 'paid'
          ), 0)
        ) >= 0.01
        LIMIT 3
      `);

      examples.rows.forEach(row => {
        console.log(`   - ${row.email}: DB ${parseFloat(row.db_withdrawn).toLocaleString('vi-VN')} đ vs Correct ${parseFloat(row.correct_withdrawn).toLocaleString('vi-VN')} đ`);
      });
    }

    // 3.3: Số dư âm
    const check3_3 = await pool.query(`
      SELECT
        u.email,
        usb.available_balance
      FROM user_system_balance usb
      JOIN users u ON u.id = usb.user_id
      WHERE usb.available_balance < 0
    `);

    console.log(`3.3. Users có số dư âm: ${check3_3.rows.length} ${check3_3.rows.length > 0 ? '❌' : '✅'}`);
    if (check3_3.rows.length > 0) {
      issues.push({
        type: 'Số dư âm',
        count: check3_3.rows.length,
        severity: 'CRITICAL',
        note: 'User có available_balance < 0 - KHÔNG BAO GIỜ được phép xảy ra'
      });
      check3_3.rows.forEach(row => {
        console.log(`   - ${row.email}: ${parseFloat(row.available_balance).toLocaleString('vi-VN')} đ`);
      });
    }

    // ========================================
    // CHECK 4: Orphaned Data
    // ========================================
    console.log('\n\n🔍 CHECK 4: ORPHANED DATA\n');
    console.log('='.repeat(80));

    // 4.1: Conversions linked to non-existent payment requests
    const check4_1 = await pool.query(`
      SELECT COUNT(*) as count
      FROM system_conversions sc
      WHERE sc.payment_request_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM payment_requests WHERE id = sc.payment_request_id
        )
    `);

    const orphanedConversions = parseInt(check4_1.rows[0].count);
    console.log(`4.1. Conversions linked tới PR không tồn tại: ${orphanedConversions} ${orphanedConversions > 0 ? '❌' : '✅'}`);
    if (orphanedConversions > 0) {
      issues.push({
        type: 'Orphaned conversions',
        count: orphanedConversions,
        severity: 'WARNING',
        note: 'Conversions trỏ đến payment_request đã bị xóa'
      });
    }

    // 4.2: Payment requests linked to non-existent users
    const check4_2 = await pool.query(`
      SELECT COUNT(*) as count
      FROM payment_requests pr
      WHERE NOT EXISTS (
        SELECT 1 FROM users WHERE id = pr.user_id
      )
    `);

    const orphanedPRs = parseInt(check4_2.rows[0].count);
    console.log(`4.2. Payment requests của user không tồn tại: ${orphanedPRs} ${orphanedPRs > 0 ? '❌' : '✅'}`);
    if (orphanedPRs > 0) {
      issues.push({
        type: 'Orphaned payment requests',
        count: orphanedPRs,
        severity: 'WARNING',
        note: 'Payment requests của user đã bị xóa'
      });
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n\n📊 TÓM TẮT\n');
    console.log('='.repeat(80));

    if (issues.length === 0) {
      console.log('\n✅ KHÔNG CÓ VẤN ĐỀ NÀO!');
      console.log('\nHệ thống hoạt động hoàn hảo:');
      console.log('  ✅ Tất cả conversions có status hợp lý');
      console.log('  ✅ Payment requests nhất quán');
      console.log('  ✅ Balance chính xác');
      console.log('  ✅ Không có dữ liệu mồ côi');
    } else {
      console.log(`\n⚠️  TÌM THẤY ${issues.length} VẤN ĐỀ:\n`);

      const critical = issues.filter(i => i.severity === 'CRITICAL');
      const warning = issues.filter(i => i.severity === 'WARNING');
      const info = issues.filter(i => i.severity === 'INFO');

      if (critical.length > 0) {
        console.log('🔴 CRITICAL (cần fix ngay):');
        critical.forEach((issue, i) => {
          console.log(`  ${i+1}. ${issue.type}: ${issue.count} records`);
          console.log(`     → ${issue.note}`);
        });
        console.log('');
      }

      if (warning.length > 0) {
        console.log('🟡 WARNING (nên fix):');
        warning.forEach((issue, i) => {
          console.log(`  ${i+1}. ${issue.type}: ${issue.count} records`);
          console.log(`     → ${issue.note}`);
        });
        console.log('');
      }

      if (info.length > 0) {
        console.log('🔵 INFO (bình thường):');
        info.forEach((issue, i) => {
          console.log(`  ${i+1}. ${issue.type}: ${issue.count} records`);
          console.log(`     → ${issue.note}`);
        });
        console.log('');
      }
    }

    await pool.end();
    console.log('\n✅ Kiểm tra hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
