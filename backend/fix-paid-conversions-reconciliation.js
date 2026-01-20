require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== FIX: Conversions đã thanh toán nhưng chưa đối soát ===\n');

    // 1. Kiểm tra trước khi fix
    const beforeResult = await pool.query(`
      SELECT
        sc.id,
        sc.order_code,
        sc.cashback_amount,
        sc.status,
        sc.system_reconciliation_status,
        sc.payment_status,
        u.email
      FROM system_conversions sc
      JOIN users u ON u.id = sc.user_id
      WHERE sc.payment_status = 'paid'
        AND (sc.system_reconciliation_status IS NULL OR sc.system_reconciliation_status != 'reconciled')
      ORDER BY sc.created_at DESC
    `);

    const count = beforeResult.rows.length;
    console.log(`📊 Tìm thấy ${count} conversions cần fix:\n`);

    if (count > 0) {
      console.log('Chi tiết:');
      beforeResult.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.order_code} - ${parseFloat(row.cashback_amount).toLocaleString('vi-VN')} đ`);
        console.log(`   User: ${row.email}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Reconciliation: ${row.system_reconciliation_status || 'NULL'} ❌`);
        console.log(`   Payment: ${row.payment_status} ✅`);
        console.log('');
      });

      console.log('\n🔧 Bắt đầu fix...\n');

      // 2. Update status
      const fixResult = await pool.query(`
        UPDATE system_conversions
        SET
          system_reconciliation_status = 'reconciled',
          system_reconciled_at = COALESCE(system_reconciled_at, NOW())
        WHERE payment_status = 'paid'
          AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
      `);

      console.log(`✅ Đã fix ${fixResult.rowCount} conversions!\n`);

      // 3. Verify
      const verifyResult = await pool.query(`
        SELECT COUNT(*) as count
        FROM system_conversions
        WHERE payment_status = 'paid'
          AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
      `);

      const remaining = parseInt(verifyResult.rows[0].count);
      console.log('📊 KẾT QUẢ:');
      console.log(`  - Đã fix: ${fixResult.rowCount} conversions`);
      console.log(`  - Còn lại: ${remaining} conversions ${remaining === 0 ? '✅' : '❌'}`);

      if (remaining === 0) {
        console.log('\n✅ TẤT CẢ conversions đã thanh toán đều có trạng thái đối soát!');
      }
    } else {
      console.log('✅ Không có conversions nào cần fix!');
    }

    await pool.end();
    console.log('\n✅ Hoàn tất!\n');
  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
