require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    // Kiểm tra các conversions có vấn đề về trạng thái
    const result = await pool.query(`
      SELECT
        sc.id,
        sc.order_code,
        sc.status as conversion_status,
        sc.payment_status,
        sc.cashback_amount,
        u.email,
        sc.created_at
      FROM system_conversions sc
      JOIN users u ON u.id = sc.user_id
      WHERE sc.user_id = (SELECT id FROM users WHERE email = 'exccbuy@gmail.com')
      ORDER BY sc.created_at DESC
      LIMIT 20
    `);

    console.log('=== CONVERSIONS CỦA USER exccbuy@gmail.com ===');
    console.log('Tổng:', result.rows.length, 'conversions\n');

    result.rows.forEach((row, i) => {
      console.log(`${i+1}. ${row.order_code}`);
      console.log(`   Conversion Status: ${row.conversion_status}`);
      console.log(`   Payment Status: ${row.payment_status || 'NULL'}`);
      console.log(`   Cashback: ${parseFloat(row.cashback_amount).toLocaleString('vi-VN')} đ`);
      console.log(`   Created: ${row.created_at}`);
      console.log('');
    });

    // Kiểm tra logic: payment_status = 'paid' nhưng reconciliation_status khác
    console.log('\n=== KIỂM TRA LOGIC PAYMENT VS RECONCILIATION ===');
    const checkResult = await pool.query(`
      SELECT
        order_code,
        status,
        payment_status,
        created_at
      FROM system_conversions
      WHERE payment_status = 'paid'
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (checkResult.rows.length > 0) {
      console.log('Có', checkResult.rows.length, 'conversions với payment_status = paid:\n');
      checkResult.rows.forEach((row, i) => {
        console.log(`${i+1}. ${row.order_code}`);
        console.log(`   Status: ${row.status}`);
        console.log(`   Payment Status: ${row.payment_status}`);
        console.log(`   Created: ${row.created_at}`);
        console.log('');
      });
    } else {
      console.log('✅ Không có conversion nào có payment_status = paid');
    }

    // Kiểm tra các cột có trong bảng
    console.log('\n=== CẤU TRÚC BẢNG system_conversions ===');
    const columnsResult = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'system_conversions'
      ORDER BY ordinal_position
    `);

    console.log('Các cột hiện có:');
    columnsResult.rows.forEach(col => {
      console.log(`  - ${col.column_name} (${col.data_type})`);
    });

    await pool.end();
  } catch (error) {
    console.error('Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
