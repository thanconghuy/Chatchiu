require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== TEST FIX WORKFLOW ĐỐI SOÁT ===\n');

    // 1. Kiểm tra các đơn hàng đã đối soát
    const reconResult = await pool.query(`
      SELECT
        sc.id,
        sc.order_code,
        sc.status,
        sc.system_reconciliation_id,
        sc.system_reconciliation_status,
        sc.system_reconciled_at,
        sr.period_label,
        sr.status as recon_status
      FROM system_conversions sc
      LEFT JOIN system_reconciliations sr ON sc.system_reconciliation_id = sr.id
      WHERE sc.system_reconciliation_id IS NOT NULL
      ORDER BY sc.system_reconciled_at DESC NULLS LAST
      LIMIT 10
    `);

    console.log('📊 CÁC ĐƠN HÀNG ĐÃ ĐƯỢC DUYỆT KỲ ĐỐI SOÁT:');
    console.log('='.repeat(80));

    if (reconResult.rows.length === 0) {
      console.log('Chưa có đơn hàng nào được duyệt kỳ đối soát.');
    } else {
      reconResult.rows.forEach((row, i) => {
        console.log(`\n${i + 1}. ${row.order_code}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Reconciliation ID: ${row.system_reconciliation_id}`);
        console.log(`   Reconciliation Status: ${row.system_reconciliation_status || 'NULL'} ${row.system_reconciliation_status === 'reconciled' ? '✅' : '❌'}`);
        console.log(`   Reconciled At: ${row.system_reconciled_at || 'NULL'}`);
        console.log(`   Kỳ đối soát: ${row.period_label || 'N/A'} (${row.recon_status || 'N/A'})`);
      });
    }

    // 2. Kiểm tra các đơn có reconciliation_id nhưng KHÔNG có status
    console.log('\n\n⚠️  KIỂM TRA VẤN ĐỀ (Có ID nhưng không có STATUS):');
    console.log('='.repeat(80));

    const issueResult = await pool.query(`
      SELECT
        COUNT(*) as count,
        ARRAY_AGG(order_code ORDER BY created_at DESC) as sample_orders
      FROM system_conversions
      WHERE system_reconciliation_id IS NOT NULL
        AND system_reconciliation_status IS NULL
    `);

    const issueCount = parseInt(issueResult.rows[0].count);
    if (issueCount > 0) {
      console.log(`❌ Tìm thấy ${issueCount} đơn có vấn đề!`);
      console.log('Ví dụ:', issueResult.rows[0].sample_orders.slice(0, 5).join(', '));
      console.log('\n💡 Đây là các đơn được duyệt kỳ đối soát TRƯỚC KHI fix!');
      console.log('   Cần chạy migration để fix dữ liệu cũ.');
    } else {
      console.log('✅ Không có đơn nào bị thiếu status!');
    }

    // 3. Thống kê
    console.log('\n\n📈 THỐNG KÊ TỔNG QUAN:');
    console.log('='.repeat(80));

    const statsResult = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE system_reconciliation_status = 'reconciled') as reconciled_count,
        COUNT(*) FILTER (WHERE system_reconciliation_id IS NOT NULL AND system_reconciliation_status IS NULL) as missing_status_count,
        COUNT(*) FILTER (WHERE status = 'approved' AND system_reconciliation_status IS NULL) as approved_not_reconciled,
        COUNT(*) as total_conversions
      FROM system_conversions
    `);

    const stats = statsResult.rows[0];
    console.log(`Tổng số conversions: ${stats.total_conversions}`);
    console.log(`Đã đối soát (status = 'reconciled'): ${stats.reconciled_count}`);
    console.log(`Có ID nhưng thiếu status: ${stats.missing_status_count} ${stats.missing_status_count > 0 ? '❌' : '✅'}`);
    console.log(`Đã duyệt chưa đối soát: ${stats.approved_not_reconciled}`);

    await pool.end();
    console.log('\n✅ Test hoàn tất!\n');
  } catch (error) {
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
