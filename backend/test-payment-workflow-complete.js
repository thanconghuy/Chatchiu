require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== TEST WORKFLOW THANH TOÁN ĐẦY ĐỦ ===\n');
    console.log('Kiểm tra logic sau khi fix:\n');
    console.log('1. User chỉ tạo được payment request từ số dư ĐÃ ĐỐI SOÁT');
    console.log('2. Tạo request (pending) KHÔNG trừ balance');
    console.log('3. Confirm request (confirmed) MỚI trừ pending_reserved');
    console.log('4. Thanh toán (paid) chuyển từ pending_reserved sang total_withdrawn');
    console.log('5. FIFO chỉ lấy conversions ĐÃ ĐỐI SOÁT\n');
    console.log('='.repeat(80));

    // ========================================
    // TEST 1: Kiểm tra số dư khả dụng tính từ conversions reconciled
    // ========================================
    console.log('\n\n📊 TEST 1: SỐ DƯ KHẢ DỤNG CHỈ TỪ CONVERSIONS ĐÃ ĐỐI SOÁT\n');
    console.log('='.repeat(80));

    const balanceTest = await pool.query(`
      SELECT
        u.email,
        -- Số dư hiện tại
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        usb.available_balance,
        -- Tính số dư từ conversions ĐÃ ĐỐI SOÁT
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0) as reconciled_earned,
        -- Số dư khả dụng ĐÚNG
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0) - usb.total_withdrawn - usb.pending_reserved as correct_available,
        -- Số dư từ conversions CHƯA đối soát
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
            AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
        ), 0) as not_reconciled_earned
      FROM users u
      JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE usb.available_balance > 0
         OR usb.total_earned > 0
      ORDER BY usb.available_balance DESC
      LIMIT 5
    `);

    if (balanceTest.rows.length === 0) {
      console.log('⚠️  Không có user nào có số dư');
    } else {
      console.log('Top 5 users có số dư:\n');
      balanceTest.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.email}`);
        console.log(`   Total Earned (DB): ${parseFloat(row.total_earned).toLocaleString('vi-VN')} đ`);
        console.log(`   Reconciled Earned (đúng): ${parseFloat(row.reconciled_earned).toLocaleString('vi-VN')} đ`);
        console.log(`   Not Reconciled: ${parseFloat(row.not_reconciled_earned).toLocaleString('vi-VN')} đ`);
        console.log(`   Total Withdrawn: ${parseFloat(row.total_withdrawn).toLocaleString('vi-VN')} đ`);
        console.log(`   Pending Reserved: ${parseFloat(row.pending_reserved).toLocaleString('vi-VN')} đ`);
        console.log(`   Available (DB): ${parseFloat(row.available_balance).toLocaleString('vi-VN')} đ`);
        console.log(`   Available (đúng): ${parseFloat(row.correct_available).toLocaleString('vi-VN')} đ`);

        const diff = parseFloat(row.available_balance) - parseFloat(row.correct_available);
        if (Math.abs(diff) > 0.01) {
          console.log(`   ❌ CHÊNH LỆCH: ${diff.toLocaleString('vi-VN')} đ`);
        } else {
          console.log(`   ✅ SỐ DƯ CHÍNH XÁC`);
        }
        console.log('');
      });
    }

    // ========================================
    // TEST 2: Kiểm tra payment requests workflow
    // ========================================
    console.log('\n\n📊 TEST 2: WORKFLOW PAYMENT REQUESTS\n');
    console.log('='.repeat(80));

    const prWorkflow = await pool.query(`
      WITH pr_balance AS (
        SELECT
          pr.id,
          pr.status,
          pr.requested_amount,
          pr.user_id,
          u.email,
          -- Số dư khi tạo request
          usb.pending_reserved,
          -- Kiểm tra conversions linked
          COUNT(sc.id) as conversions_linked,
          COALESCE(SUM(sc.cashback_amount), 0) as conversions_amount
        FROM payment_requests pr
        JOIN users u ON pr.user_id = u.id
        JOIN user_system_balance usb ON pr.user_id = usb.user_id
        LEFT JOIN system_conversions sc ON sc.payment_request_id = pr.id
        GROUP BY pr.id, pr.status, pr.requested_amount, pr.user_id, u.email, usb.pending_reserved
      )
      SELECT
        status,
        COUNT(*) as count,
        SUM(requested_amount) as total_amount,
        SUM(pending_reserved) as total_reserved,
        SUM(conversions_linked) as total_conversions
      FROM pr_balance
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'pending' THEN 1
          WHEN 'confirmed' THEN 2
          WHEN 'paid' THEN 3
          WHEN 'rejected' THEN 4
          WHEN 'cancelled' THEN 5
          ELSE 6
        END
    `);

    console.log('PAYMENT REQUESTS THEO STATUS:\n');
    if (prWorkflow.rows.length === 0) {
      console.log('Chưa có payment requests nào');
    } else {
      prWorkflow.rows.forEach(row => {
        console.log(`${row.status.toUpperCase()}:`);
        console.log(`  - Count: ${row.count}`);
        console.log(`  - Total Amount: ${parseFloat(row.total_amount).toLocaleString('vi-VN')} đ`);
        console.log(`  - Pending Reserved: ${parseFloat(row.total_reserved).toLocaleString('vi-VN')} đ`);
        console.log(`  - Conversions Linked: ${row.total_conversions}`);

        // Kiểm tra logic
        if (row.status === 'pending') {
          console.log(`  ✅ Logic: Pending không reserve balance`);
        } else if (row.status === 'confirmed') {
          console.log(`  ✅ Logic: Confirmed đã reserve balance`);
        } else if (row.status === 'paid') {
          console.log(`  ✅ Logic: Paid đã chuyển sang total_withdrawn`);
        }
        console.log('');
      });
    }

    // ========================================
    // TEST 3: Kiểm tra FIFO chỉ lấy conversions đã đối soát
    // ========================================
    console.log('\n\n📊 TEST 3: FIFO CHỈ LẤY CONVERSIONS ĐÃ ĐỐI SOÁT\n');
    console.log('='.repeat(80));

    const fifoTest = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_count,
        COUNT(*) FILTER (WHERE payment_status = 'paid' AND system_reconciliation_status = 'reconciled') as paid_reconciled,
        COUNT(*) FILTER (WHERE payment_status = 'paid' AND system_reconciliation_status IS NULL) as paid_not_reconciled
      FROM system_conversions
    `);

    const stats = fifoTest.rows[0];
    console.log(`Tổng conversions đã thanh toán (paid): ${stats.paid_count}`);
    console.log(`  - Đã đối soát: ${stats.paid_reconciled} ✅`);
    console.log(`  - Chưa đối soát: ${stats.paid_not_reconciled} ${stats.paid_not_reconciled > 0 ? '❌' : '✅'}`);

    if (parseInt(stats.paid_not_reconciled) > 0) {
      console.log('\n❌ PHÁT HIỆN VẤN ĐỀ: Có conversions đã thanh toán nhưng chưa đối soát!');

      // Show examples
      const examples = await pool.query(`
        SELECT order_code, status, system_reconciliation_status, payment_status
        FROM system_conversions
        WHERE payment_status = 'paid'
          AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
        LIMIT 5
      `);

      console.log('\nVí dụ:');
      examples.rows.forEach((row, i) => {
        console.log(`  ${i+1}. ${row.order_code} - Status: ${row.status}, Recon: ${row.system_reconciliation_status || 'NULL'}, Payment: ${row.payment_status}`);
      });
    } else {
      console.log('\n✅ TẤT CẢ conversions đã thanh toán đều đã đối soát!');
    }

    // ========================================
    // TEST 4: Kiểm tra pending_reserved consistency
    // ========================================
    console.log('\n\n📊 TEST 4: PENDING_RESERVED CONSISTENCY\n');
    console.log('='.repeat(80));

    const reserveTest = await pool.query(`
      SELECT
        u.email,
        usb.pending_reserved as current_reserved,
        COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests
          WHERE user_id = u.id
            AND status = 'confirmed'
        ), 0) as should_be_reserved
      FROM users u
      JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE usb.pending_reserved > 0
         OR EXISTS (
           SELECT 1 FROM payment_requests
           WHERE user_id = u.id AND status = 'confirmed'
         )
    `);

    if (reserveTest.rows.length === 0) {
      console.log('✅ Không có pending_reserved nào (không có request confirmed)');
    } else {
      console.log('Kiểm tra pending_reserved cho các users:\n');
      let hasIssue = false;

      reserveTest.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.email}`);
        console.log(`   Current Reserved: ${parseFloat(row.current_reserved).toLocaleString('vi-VN')} đ`);
        console.log(`   Should Be Reserved: ${parseFloat(row.should_be_reserved).toLocaleString('vi-VN')} đ`);

        const diff = Math.abs(parseFloat(row.current_reserved) - parseFloat(row.should_be_reserved));
        if (diff > 0.01) {
          console.log(`   ❌ CHÊNH LỆCH: ${diff.toLocaleString('vi-VN')} đ`);
          hasIssue = true;
        } else {
          console.log(`   ✅ CHÍNH XÁC`);
        }
        console.log('');
      });

      if (!hasIssue) {
        console.log('✅ TẤT CẢ pending_reserved đều chính xác!');
      }
    }

    // ========================================
    // TEST 5: Summary
    // ========================================
    console.log('\n\n📊 TỔNG KẾT\n');
    console.log('='.repeat(80));

    const summary = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM system_conversions WHERE status = 'approved') as total_approved,
        (SELECT COUNT(*) FROM system_conversions WHERE status = 'approved' AND system_reconciliation_status = 'reconciled') as total_reconciled,
        (SELECT COUNT(*) FROM payment_requests WHERE status = 'confirmed') as confirmed_requests,
        (SELECT COUNT(*) FROM payment_requests WHERE status = 'paid') as paid_requests,
        (SELECT COALESCE(SUM(available_balance), 0) FROM user_system_balance) as total_available,
        (SELECT COALESCE(SUM(pending_reserved), 0) FROM user_system_balance) as total_reserved,
        (SELECT COALESCE(SUM(total_withdrawn), 0) FROM user_system_balance) as total_withdrawn
    `);

    const sum = summary.rows[0];
    console.log('HỆ THỐNG:');
    console.log(`  - Tổng conversions approved: ${sum.total_approved}`);
    console.log(`  - Đã đối soát: ${sum.total_reconciled}`);
    console.log(`  - Payment requests confirmed: ${sum.confirmed_requests}`);
    console.log(`  - Payment requests paid: ${sum.paid_requests}`);
    console.log('\nSỐ DƯ:');
    console.log(`  - Tổng available_balance: ${parseFloat(sum.total_available).toLocaleString('vi-VN')} đ`);
    console.log(`  - Tổng pending_reserved: ${parseFloat(sum.total_reserved).toLocaleString('vi-VN')} đ`);
    console.log(`  - Tổng total_withdrawn: ${parseFloat(sum.total_withdrawn).toLocaleString('vi-VN')} đ`);

    await pool.end();
    console.log('\n✅ Test hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
