const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    console.log('🔍 Phân tích toàn bộ flow và logic\n');

    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    // 1. Check system_conversions
    const conversions = await client.query(
      `SELECT
        status,
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(cashback_amount), 0) as total
      FROM system_conversions
      WHERE user_id = $1
      GROUP BY status, payment_status
      ORDER BY status, payment_status`,
      [userId]
    );

    console.log('📦 system_conversions breakdown:');
    conversions.rows.forEach(r => {
      console.log('   status=' + r.status + ', payment_status=' + (r.payment_status || 'NULL') + ': ' + r.count + ' items, ' + parseFloat(r.total).toLocaleString('vi-VN') + 'đ');
    });
    console.log('');

    // 2. Check system_reconciliation_items
    const items = await client.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(cashback_amount), 0) as total
      FROM system_reconciliation_items
      WHERE user_id = $1 AND conversion_status = 'approved'`,
      [userId]
    );

    console.log('🗂️  system_reconciliation_items:');
    console.log('   Total items: ' + items.rows[0].count + ', Total: ' + parseFloat(items.rows[0].total).toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 3. Check payment_system_reconciliation_mapping
    const mappings = await client.query(
      `SELECT COUNT(*) as count, COALESCE(SUM(cashback_amount), 0) as total
      FROM payment_system_reconciliation_mapping`
    );

    console.log('🔗 payment_system_reconciliation_mapping:');
    console.log('   Total mappings: ' + mappings.rows[0].count + ', Total: ' + parseFloat(mappings.rows[0].total).toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 4. Check payment_requests
    const payments = await client.query(
      `SELECT status, COUNT(*) as count, COALESCE(SUM(requested_amount), 0) as total
      FROM payment_requests
      WHERE user_id = $1
      GROUP BY status`,
      [userId]
    );

    console.log('💳 payment_requests:');
    if (payments.rows.length === 0) {
      console.log('   No payment requests');
    } else {
      payments.rows.forEach(r => {
        console.log('   status=' + r.status + ': ' + r.count + ' requests, ' + parseFloat(r.total).toLocaleString('vi-VN') + 'đ');
      });
    }
    console.log('');

    console.log('📝 PHÂN TÍCH LOGIC:');
    console.log('');
    console.log('❓ Câu hỏi 1: payment_system_reconciliation_mapping có cần thiết không?');
    console.log('   Hiện tại: ' + mappings.rows[0].count + ' mappings');
    console.log('   Mục đích: Link payment_requests với system_reconciliation_items');
    console.log('');
    console.log('❓ Câu hỏi 2: Balance calculation nên dựa vào gì?');
    console.log('   Option A: Total approved - Total requested (payment_requests)');
    console.log('   Option B: Total approved - Total đã payment_status=paid');
    console.log('   Option C: SUM(reconciliation_items chưa link với payment)');
    console.log('');
    console.log('❓ Câu hỏi 3: Khi tạo payment request, cần làm gì?');
    console.log('   Option A: Tạo mapping links (hiện tại đang làm)');
    console.log('   Option B: Chỉ update payment_status trong conversions');

  } finally {
    client.release();
    await pool.end();
  }
})();
