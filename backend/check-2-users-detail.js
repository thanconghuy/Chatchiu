require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== KIỂM TRA 2 USERS CHI TIẾT ===\n');

    const users = await pool.query(`
      SELECT
        u.id,
        u.email,
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        usb.available_balance
      FROM user_system_balance usb
      JOIN users u ON u.id = usb.user_id
      WHERE u.email IN ('thanhphan991@gmail.com', 'th421891@gmail.com')
    `);

    for (const user of users.rows) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`USER: ${user.email}`);
      console.log('='.repeat(80));

      console.log('\n📊 BALANCE:');
      console.log(`  total_earned: ${parseFloat(user.total_earned).toLocaleString('vi-VN')} đ`);
      console.log(`  total_withdrawn: ${parseFloat(user.total_withdrawn).toLocaleString('vi-VN')} đ`);
      console.log(`  pending_reserved: ${parseFloat(user.pending_reserved).toLocaleString('vi-VN')} đ`);
      console.log(`  available_balance: ${parseFloat(user.available_balance).toLocaleString('vi-VN')} đ`);

      // Check conversions
      const conversions = await pool.query(`
        SELECT
          order_code,
          cashback_amount,
          status,
          system_reconciliation_status,
          payment_status,
          created_at
        FROM system_conversions
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 10
      `, [user.id]);

      console.log(`\n📦 CONVERSIONS: (${conversions.rows.length} total)`);
      if (conversions.rows.length === 0) {
        console.log('  Không có conversions nào!');
      } else {
        conversions.rows.forEach((conv, i) => {
          console.log(`  ${i+1}. ${conv.order_code} - ${parseFloat(conv.cashback_amount).toLocaleString('vi-VN')} đ`);
          console.log(`     Status: ${conv.status}`);
          console.log(`     Reconciliation: ${conv.system_reconciliation_status || 'NULL'}`);
          console.log(`     Payment: ${conv.payment_status || 'NULL'}`);
        });
      }

      // Count by status
      const statusCount = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'approved') as approved_count,
          COUNT(*) FILTER (WHERE system_reconciliation_status = 'reconciled') as reconciled_count,
          COUNT(*) FILTER (WHERE payment_status = 'paid') as paid_count,
          COALESCE(SUM(cashback_amount) FILTER (WHERE status = 'approved'), 0) as approved_amount,
          COALESCE(SUM(cashback_amount) FILTER (WHERE system_reconciliation_status = 'reconciled'), 0) as reconciled_amount,
          COALESCE(SUM(cashback_amount) FILTER (WHERE payment_status = 'paid'), 0) as paid_amount
        FROM system_conversions
        WHERE user_id = $1
      `, [user.id]);

      const stats = statusCount.rows[0];
      console.log(`\n📈 THỐNG KÊ:`);
      console.log(`  Approved: ${stats.approved_count} conversions = ${parseFloat(stats.approved_amount).toLocaleString('vi-VN')} đ`);
      console.log(`  Reconciled: ${stats.reconciled_count} conversions = ${parseFloat(stats.reconciled_amount).toLocaleString('vi-VN')} đ`);
      console.log(`  Paid: ${stats.paid_count} conversions = ${parseFloat(stats.paid_amount).toLocaleString('vi-VN')} đ`);

      console.log(`\n💡 PHÂN TÍCH:`);
      if (parseFloat(user.total_earned) > 0 && stats.reconciled_count === 0) {
        console.log(`  ⚠️  User có total_earned = ${parseFloat(user.total_earned).toLocaleString('vi-VN')} đ`);
        console.log(`      NHƯNG không có conversions reconciled nào!`);
        console.log(`      → Có thể là dữ liệu test cũ hoặc đã bị xóa`);
        console.log(`      → NÊN set total_earned = 0`);
      }
    }

    await pool.end();
    console.log('\n\n✅ Kiểm tra hoàn tất!\n');

  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
