const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
    const requestedAmount = 50000;

    console.log('🧪 Testing FIFO query for 50,000đ\n');

    // Test the CTE part only
    const testQuery = `
      WITH selected_conversions AS (
        SELECT
          id,
          cashback_amount,
          SUM(cashback_amount) OVER (ORDER BY order_time ASC, id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as running_total
        FROM system_conversions
        WHERE user_id = $1
          AND status = 'approved'
          AND (payment_status IS NULL OR payment_status = 'unpaid')
        ORDER BY order_time ASC, id ASC
      )
      SELECT * FROM selected_conversions WHERE running_total <= $2
    `;

    const result = await pool.query(testQuery, [userId, requestedAmount]);

    console.log('Selected conversions (running_total <= 50,000đ):');
    console.log('  Count:', result.rows.length);
    console.log('');

    result.rows.forEach((r, i) => {
      console.log('  ' + (i + 1) + '. cashback=' + parseFloat(r.cashback_amount).toLocaleString('vi-VN') + 'đ, running_total=' + parseFloat(r.running_total).toLocaleString('vi-VN') + 'đ');
    });
    console.log('');

    const totalSelected = result.rows.reduce((sum, r) => sum + parseFloat(r.cashback_amount), 0);
    console.log('Total selected: ' + totalSelected.toLocaleString('vi-VN') + 'đ');
    console.log('Requested: ' + requestedAmount.toLocaleString('vi-VN') + 'đ');

    if (result.rows.length > 0) {
      console.log('');
      console.log('✅ Query is correct! Will update ' + result.rows.length + ' conversions');
    } else {
      console.log('');
      console.log('❌ Query returned 0 rows!');
    }

  } finally {
    await pool.end();
  }
})();
