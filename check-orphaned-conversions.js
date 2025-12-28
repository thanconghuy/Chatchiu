const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkOrphanedConversions() {
  try {
    // Tìm các conversions có system_reconciliation_id nhưng reconciliation không còn tồn tại
    const query = `
      SELECT
        c.id,
        c.order_code,
        c.merchant_name,
        c.cashback_amount,
        c.system_reconciliation_status,
        c.system_reconciliation_id,
        c.approval_time,
        sr.id as reconciliation_exists,
        sr.status as reconciliation_status
      FROM conversions c
      LEFT JOIN system_reconciliations sr ON sr.id = c.system_reconciliation_id
      WHERE c.system_reconciliation_id IS NOT NULL
        AND sr.id IS NULL
      ORDER BY c.approval_time DESC
      LIMIT 20
    `;

    const result = await pool.query(query);

    console.log('\n📊 Các đơn hàng bị orphaned (reconciliation đã bị xóa):');
    console.log('Tổng số:', result.rows.length);

    if (result.rows.length > 0) {
      console.log('\n⚠️ Danh sách đơn hàng bị orphaned:\n');
      result.rows.forEach((row, idx) => {
        console.log(`${idx + 1}. Order: ${row.order_code}`);
        console.log(`   Merchant: ${row.merchant_name}`);
        console.log(`   Cashback: ${row.cashback_amount}`);
        console.log(`   Status: ${row.system_reconciliation_status}`);
        console.log(`   Reconciliation ID: ${row.system_reconciliation_id}`);
        console.log(`   Approval: ${row.approval_time}`);
        console.log('');
      });

      // Tính tổng cashback bị mất
      const totalCashback = result.rows.reduce((sum, row) => sum + parseFloat(row.cashback_amount || 0), 0);
      console.log(`💰 Tổng cashback bị orphaned: ${totalCashback.toLocaleString('vi-VN')} VNĐ\n`);

      // Đưa ra giải pháp khôi phục
      console.log('🔧 GIẢI PHÁP KHÔI PHỤC:\n');
      console.log('1️⃣ Chạy query sau để restore các đơn hàng về trạng thái chờ đối soát:\n');
      console.log('UPDATE conversions');
      console.log('SET');
      console.log('  system_reconciliation_status = NULL,');
      console.log('  system_reconciliation_id = NULL,');
      console.log('  updated_at = NOW()');
      console.log('WHERE system_reconciliation_id IS NOT NULL');
      console.log('  AND NOT EXISTS (');
      console.log('    SELECT 1 FROM system_reconciliations sr');
      console.log('    WHERE sr.id = conversions.system_reconciliation_id');
      console.log('  );');
      console.log('\n2️⃣ Hoặc chạy script restore tự động:');
      console.log('   node restore-orphaned-conversions.js\n');
    } else {
      console.log('✅ Không có đơn hàng nào bị orphaned\n');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkOrphanedConversions();
