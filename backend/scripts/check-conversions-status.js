const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 Checking conversions payment_status\n');

    const result = await pool.query(`
      SELECT
        status,
        payment_status,
        COUNT(*) as count,
        COALESCE(SUM(cashback_amount), 0) as total
      FROM system_conversions
      WHERE user_id = $1
      GROUP BY status, payment_status
      ORDER BY status, payment_status
    `, [userId]);

    console.log('Conversions breakdown:');
    result.rows.forEach(r => {
      console.log('  status=' + r.status + ', payment_status=' + (r.payment_status || 'NULL') + ': ' + r.count + ' items, ' + parseFloat(r.total).toLocaleString('vi-VN') + 'đ');
    });
    console.log('');

    // Check which conversions can be marked as paid
    const unpaidResult = await pool.query(`
      SELECT id, cashback_amount, order_time, payment_status
      FROM system_conversions
      WHERE user_id = $1
        AND status = 'approved'
        AND (payment_status IS NULL OR payment_status = 'unpaid')
      ORDER BY order_time ASC
      LIMIT 5
    `, [userId]);

    console.log('First 5 unpaid conversions (FIFO order):');
    if (unpaidResult.rows.length === 0) {
      console.log('  None found!');
    } else {
      unpaidResult.rows.forEach((r, i) => {
        console.log('  ' + (i + 1) + '. ' + parseFloat(r.cashback_amount).toLocaleString('vi-VN') + 'đ, payment_status=' + (r.payment_status || 'NULL') + ', order_time=' + r.order_time);
      });
    }
  } finally {
    await pool.end();
  }
})();
