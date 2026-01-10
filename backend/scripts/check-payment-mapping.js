const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 Kiểm tra payment_system_reconciliation_mapping chi tiết\n');

    // Get all payment requests
    const paymentsResult = await client.query(
      `SELECT id, requested_amount, status, created_at, paid_at
       FROM payment_requests
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    console.log('📋 Payment Requests:\n');

    for (const payment of paymentsResult.rows) {
      console.log(`Payment: ${payment.id.substring(0, 13)}...`);
      console.log(`  Requested: ${parseFloat(payment.requested_amount).toLocaleString('vi-VN')}đ`);
      console.log(`  Status: ${payment.status}`);
      console.log(`  Created: ${payment.created_at}`);
      if (payment.paid_at) console.log(`  Paid: ${payment.paid_at}`);

      // Get linked items
      const mappingResult = await client.query(
        `SELECT
          psrm.id as mapping_id,
          psrm.cashback_amount,
          sri.merchant_name,
          sri.order_value
        FROM payment_system_reconciliation_mapping psrm
        INNER JOIN system_reconciliation_items sri ON sri.id = psrm.system_reconciliation_item_id
        WHERE psrm.payment_request_id = $1
        ORDER BY sri.order_time ASC`,
        [payment.id]
      );

      const totalLinked = mappingResult.rows.reduce((sum, item) => sum + parseFloat(item.cashback_amount), 0);

      console.log(`  Linked items: ${mappingResult.rows.length}`);
      console.log(`  Total linked: ${totalLinked.toLocaleString('vi-VN')}đ`);

      if (mappingResult.rows.length > 0) {
        console.log(`  Items detail:`);
        mappingResult.rows.forEach((item, i) => {
          console.log(`    ${i + 1}. ${parseFloat(item.cashback_amount).toLocaleString('vi-VN')}đ - ${item.merchant_name}`);
        });
      }

      const discrepancy = totalLinked - parseFloat(payment.requested_amount);
      if (Math.abs(discrepancy) > 0.01) {
        console.log(`  ⚠️  CHÊNH LỆCH: ${discrepancy.toLocaleString('vi-VN')}đ`);
        console.log(`  → Linked nhiều hơn requested!`);
      } else {
        console.log(`  ✅ Khớp chính xác`);
      }

      console.log('');
    }

  } finally {
    client.release();
    await pool.end();
  }
})();
