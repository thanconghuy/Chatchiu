const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixMissingApprovalTime() {
  try {
    console.log('\n🔍 Kiểm tra conversions có status=approved nhưng approval_time=NULL...\n');

    // Step 1: Đếm số đơn cần fix
    const countQuery = `
      SELECT COUNT(*) as count
      FROM conversions
      WHERE status = 'approved'
        AND approval_time IS NULL
    `;

    const countResult = await pool.query(countQuery);
    const missingCount = parseInt(countResult.rows[0].count);

    if (missingCount === 0) {
      console.log('✅ Không có đơn nào cần fix approval_time\n');
      await pool.end();
      return;
    }

    console.log(`📊 Tìm thấy ${missingCount} đơn có status=approved nhưng approval_time=NULL\n`);

    // Step 2: Hiển thị danh sách
    const listQuery = `
      SELECT
        id,
        order_code,
        merchant_name,
        status,
        cashback_amount,
        order_time,
        updated_at,
        created_at
      FROM conversions
      WHERE status = 'approved'
        AND approval_time IS NULL
      ORDER BY updated_at DESC
      LIMIT 20
    `;

    const listResult = await pool.query(listQuery);

    console.log('Danh sách đơn cần fix:\n');
    listResult.rows.forEach((row, idx) => {
      console.log(`${idx + 1}. ${row.order_code} - ${row.merchant_name}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   Cashback: ${row.cashback_amount}`);
      console.log(`   Order time: ${row.order_time}`);
      console.log(`   Updated at: ${row.updated_at}`);
      console.log('');
    });

    // Step 3: Fix bằng cách set approval_time = updated_at
    console.log('🔧 Đang fix approval_time = updated_at cho các đơn này...\n');

    const fixQuery = `
      UPDATE conversions
      SET
        approval_time = updated_at,
        updated_at = NOW()
      WHERE status = 'approved'
        AND approval_time IS NULL
      RETURNING id, order_code, approval_time
    `;

    const fixResult = await pool.query(fixQuery);

    console.log(`✅ Đã fix thành công ${fixResult.rows.length} đơn hàng!\n`);
    console.log('Các đơn này đã được set approval_time = updated_at');
    console.log('Bây giờ có thể chạy auto-sync để thêm vào waiting list.\n');

    // Step 4: Hiển thị kết quả
    console.log('📋 Kết quả:');
    fixResult.rows.slice(0, 10).forEach((row, idx) => {
      console.log(`  ${idx + 1}. ${row.order_code} - approval_time: ${row.approval_time}`);
    });

    if (fixResult.rows.length > 10) {
      console.log(`  ... và ${fixResult.rows.length - 10} đơn khác`);
    }

    console.log('\n💡 Bước tiếp theo:');
    console.log('Chạy auto-sync để thêm vào waiting list:');
    console.log('  SELECT * FROM add_eligible_conversions_to_waiting_list();');
    console.log('Hoặc chờ cron job tự động chạy.\n');

    await pool.end();
  } catch (error) {
    console.error('❌ Lỗi:', error.message);
    await pool.end();
    process.exit(1);
  }
}

fixMissingApprovalTime();
