const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 Kiểm tra balance leak issue\n');

    // 1. Check system_conversions total
    const conversionsResult = await client.query(
      `SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved
       FROM system_conversions WHERE user_id = $1`,
      [userId]
    );
    const totalApproved = parseFloat(conversionsResult.rows[0].total_approved);
    console.log('📦 Total approved cashback:', totalApproved.toLocaleString('vi-VN') + 'đ\n');

    // 2. Check payment_requests
    const paymentsResult = await client.query(
      `SELECT id, requested_amount, status FROM payment_requests WHERE user_id = $1 AND status = 'paid'`,
      [userId]
    );

    console.log('💳 Paid payments:\n');
    let totalRequested = 0;
    let totalActualLinked = 0;

    for (const payment of paymentsResult.rows) {
      const requested = parseFloat(payment.requested_amount);
      const linkedResult = await client.query(
        `SELECT COALESCE(SUM(cashback_amount), 0) as total_linked
         FROM payment_system_reconciliation_mapping WHERE payment_request_id = $1`,
        [payment.id]
      );
      const linked = parseFloat(linkedResult.rows[0].total_linked);

      totalRequested += requested;
      totalActualLinked += linked;

      console.log(`  Payment ${payment.id.substring(0, 13)}...`);
      console.log(`    Requested (deducted): ${requested.toLocaleString('vi-VN')}đ`);
      console.log(`    Actual linked items: ${linked.toLocaleString('vi-VN')}đ`);
      console.log(`    Leak: ${(requested - linked).toLocaleString('vi-VN')}đ`);
      console.log('');
    }

    console.log('📊 Summary:');
    console.log(`  Total approved: ${totalApproved.toLocaleString('vi-VN')}đ`);
    console.log(`  Total deducted (requested): ${totalRequested.toLocaleString('vi-VN')}đ`);
    console.log(`  Total should deduct (linked): ${totalActualLinked.toLocaleString('vi-VN')}đ`);
    console.log(`  Balance leak: ${(totalRequested - totalActualLinked).toLocaleString('vi-VN')}đ`);
    console.log('');
    console.log(`  Current available (wrong): ${(totalApproved - totalRequested).toLocaleString('vi-VN')}đ`);
    console.log(`  Should be available (correct): ${(totalApproved - totalActualLinked).toLocaleString('vi-VN')}đ`);

  } finally {
    client.release();
    await pool.end();
  }
})();
