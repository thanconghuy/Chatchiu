const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function restoreOrphanedConversions() {
  try {
    console.log('\n🔄 Bắt đầu restore các đơn hàng bị orphaned...\n');

    // Step 1: Tìm và đếm số đơn hàng cần restore
    const countQuery = `
      SELECT COUNT(*) as count
      FROM conversions c
      WHERE c.system_reconciliation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliations sr
          WHERE sr.id = c.system_reconciliation_id
        )
    `;

    const countResult = await pool.query(countQuery);
    const orphanedCount = parseInt(countResult.rows[0].count);

    if (orphanedCount === 0) {
      console.log('✅ Không có đơn hàng nào cần restore.\n');
      await pool.end();
      return;
    }

    console.log(`📊 Tìm thấy ${orphanedCount} đơn hàng bị orphaned\n`);

    // Step 2: Get details before restore
    const detailsQuery = `
      SELECT
        c.id,
        c.order_code,
        c.merchant_name,
        c.cashback_amount,
        c.system_reconciliation_id
      FROM conversions c
      WHERE c.system_reconciliation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliations sr
          WHERE sr.id = c.system_reconciliation_id
        )
    `;

    const detailsResult = await pool.query(detailsQuery);
    const totalCashback = detailsResult.rows.reduce(
      (sum, row) => sum + parseFloat(row.cashback_amount || 0),
      0
    );

    console.log('Danh sách đơn hàng sẽ được restore:');
    detailsResult.rows.forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.order_code} - ${row.merchant_name} - ${row.cashback_amount} VNĐ`);
    });
    console.log(`\n💰 Tổng cashback: ${totalCashback.toLocaleString('vi-VN')} VNĐ\n`);

    // Step 3: Restore conversions
    const restoreQuery = `
      UPDATE conversions
      SET
        system_reconciliation_status = NULL,
        system_reconciliation_id = NULL,
        updated_at = NOW()
      WHERE system_reconciliation_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM system_reconciliations sr
          WHERE sr.id = conversions.system_reconciliation_id
        )
      RETURNING id, order_code
    `;

    const restoreResult = await pool.query(restoreQuery);

    console.log(`✅ Đã restore thành công ${restoreResult.rows.length} đơn hàng!\n`);
    console.log('Các đơn hàng này đã được trả về trạng thái chờ đối soát.');
    console.log('Bây giờ bạn có thể:');
    console.log('  1. Tạo kỳ đối soát mới và thêm các đơn này vào');
    console.log('  2. Chờ auto-sync thêm vào danh sách chờ (nếu đã đủ điều kiện)\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Lỗi khi restore:', error.message);
    await pool.end();
    process.exit(1);
  }
}

restoreOrphanedConversions();
