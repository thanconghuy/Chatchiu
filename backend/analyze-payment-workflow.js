require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== PHÂN TÍCH WORKFLOW THANH TOÁN HIỆN TẠI ===\n');

    // 1. Kiểm tra payment requests theo status
    const prResult = await pool.query(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(requested_amount) as total_amount
      FROM payment_requests
      GROUP BY status
      ORDER BY
        CASE status
          WHEN 'pending' THEN 1
          WHEN 'confirmed' THEN 2
          WHEN 'paid' THEN 3
          WHEN 'rejected' THEN 4
          ELSE 5
        END
    `);

    console.log('📊 PAYMENT REQUESTS THEO STATUS:');
    console.log('='.repeat(70));
    prResult.rows.forEach(row => {
      console.log(`  ${row.status.padEnd(15)} | Count: ${String(row.count).padStart(3)} | Total: ${parseFloat(row.total_amount).toLocaleString('vi-VN')} đ`);
    });

    // 2. Kiểm tra logic số dư
    console.log('\n\n💰 KIỂM TRA LOGIC SỐ DƯ:');
    console.log('='.repeat(70));

    const balanceResult = await pool.query(`
      SELECT
        u.email,
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
        ), 0) as reconciled_cashback,
        -- Tính số dư available theo logic ĐÚNG
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = u.id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0) - usb.total_withdrawn - usb.pending_reserved as correct_available
      FROM users u
      JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE usb.available_balance > 0
      ORDER BY usb.available_balance DESC
      LIMIT 5
    `);

    console.log('Top 5 users có số dư:\n');
    balanceResult.rows.forEach((row, i) => {
      console.log(`${i+1}. ${row.email}`);
      console.log(`   Total Earned (hiện tại): ${parseFloat(row.total_earned).toLocaleString('vi-VN')} đ`);
      console.log(`   Reconciled Cashback (đúng): ${parseFloat(row.reconciled_cashback).toLocaleString('vi-VN')} đ`);
      console.log(`   Available (hiện tại): ${parseFloat(row.available_balance).toLocaleString('vi-VN')} đ`);
      console.log(`   Available (đúng): ${parseFloat(row.correct_available).toLocaleString('vi-VN')} đ`);
      const diff = parseFloat(row.available_balance) - parseFloat(row.correct_available);
      if (Math.abs(diff) > 0.01) {
        console.log(`   ⚠️  CHÊNH LỆCH: ${diff.toLocaleString('vi-VN')} đ`);
      }
      console.log('');
    });

    // 3. Kiểm tra conversions có payment_status nhưng chưa đối soát
    console.log('\n❌ VẤN ĐỀ: CONVERSIONS ĐÃ THANH TOÁN NHƯNG CHƯA ĐỐI SOÁT:');
    console.log('='.repeat(70));

    const issueResult = await pool.query(`
      SELECT
        COUNT(*) as count,
        SUM(cashback_amount) as total_amount
      FROM system_conversions
      WHERE payment_status = 'paid'
        AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
    `);

    const issueCount = parseInt(issueResult.rows[0].count);
    if (issueCount > 0) {
      console.log(`❌ Tìm thấy ${issueCount} conversions đã thanh toán nhưng chưa đối soát!`);
      console.log(`   Tổng số tiền: ${parseFloat(issueResult.rows[0].total_amount).toLocaleString('vi-VN')} đ`);
      console.log('\n   Đây là KHÔNG HỢP LÝ vì theo workflow:');
      console.log('   1. Đơn phải được duyệt (status = approved)');
      console.log('   2. Đơn phải đối soát (system_reconciliation_status = reconciled)');
      console.log('   3. Mới được tạo payment request');
      console.log('   4. Admin confirm → reserve balance');
      console.log('   5. Admin thanh toán → payment_status = paid');
    } else {
      console.log('✅ Tất cả conversions đã thanh toán đều đã đối soát!');
    }

    await pool.end();
    console.log('\n✅ Phân tích hoàn tất!\n');
  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
