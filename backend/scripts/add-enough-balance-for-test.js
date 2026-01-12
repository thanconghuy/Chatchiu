const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('💰 Thêm conversions để đủ test từ UI\n');

    // Get template
    const templateResult = await client.query(
      `SELECT click_id FROM system_conversions WHERE user_id = $1 LIMIT 1`,
      [userId]
    );
    const template = templateResult.rows[0];

    // Need at least 7,000đ to make balance >= 50,000đ
    // Add 10,000đ to be safe
    const newConv = { merchant: 'Test Merchant', amount: 10000, order_amount: 200000 };

    // Create conversion
    const convInsert = await client.query(
      `INSERT INTO conversions (
        user_id, click_id, merchant_name, order_amount, cashback_amount,
        status, order_time, approval_time, confirmed_time, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, 'approved', NOW(), NOW(), NOW(), NOW(), NOW())
      RETURNING id`,
      [userId, template.click_id, newConv.merchant, newConv.order_amount, newConv.amount]
    );

    // Create system_conversion
    await client.query(
      `INSERT INTO system_conversions (
        user_id, click_id, at_conversion_id, merchant_name,
        order_amount, cashback_amount, status,
        order_time, approval_time, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'approved', NOW(), NOW(), NOW(), NOW())`,
      [userId, template.click_id, convInsert.rows[0].id, newConv.merchant,
       newConv.order_amount, newConv.amount]
    );

    await client.query('COMMIT');

    // Check new balance
    const balanceResult = await client.query(
      `SELECT
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved,
        COALESCE((SELECT SUM(requested_amount) FROM payment_requests WHERE user_id = $1 AND status NOT IN ('rejected', 'cancelled')), 0) as total_requested
       FROM system_conversions WHERE user_id = $1`,
      [userId]
    );

    const totalApproved = parseFloat(balanceResult.rows[0].total_approved);
    const totalRequested = parseFloat(balanceResult.rows[0].total_requested);
    const available = totalApproved - totalRequested;

    console.log('✅ Đã thêm ' + newConv.amount.toLocaleString('vi-VN') + 'đ');
    console.log('');
    console.log('📊 Số dư mới:');
    console.log('   Tổng approved: ' + totalApproved.toLocaleString('vi-VN') + 'đ');
    console.log('   Tổng requested: ' + totalRequested.toLocaleString('vi-VN') + 'đ');
    console.log('   Khả dụng: ' + available.toLocaleString('vi-VN') + 'đ');
    console.log('');
    console.log('💡 Bây giờ bạn có thể test với số tiền: 50.000đ');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
