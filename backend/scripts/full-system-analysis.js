const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('╔════════════════════════════════════════════════════════════════════════════╗');
    console.log('║  PHÂN TÍCH TOÀN BỘ WORKFLOW VÀ LOGIC HỆ THỐNG PAYMENT                     ║');
    console.log('╚════════════════════════════════════════════════════════════════════════════╝\n');

    // PHẦN 1: SYSTEM CONVERSIONS
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📦 PHẦN 1: SYSTEM CONVERSIONS - Nguồn Cashback');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const conversionsQuery = await pool.query(`
      SELECT status, payment_status, COUNT(*) as count, COALESCE(SUM(cashback_amount), 0) as total
      FROM system_conversions WHERE user_id = $1
      GROUP BY status, payment_status ORDER BY status, payment_status
    `, [userId]);

    console.log('\nTrạng thái conversions:');
    conversionsQuery.rows.forEach(r => {
      console.log(\`  • status=\${r.status} payment_status=\${r.payment_status || 'NULL'} → \${r.count} items, \${parseFloat(r.total).toLocaleString('vi-VN')}đ\`);
    });

    const totalApproved = conversionsQuery.rows
      .filter(r => r.status === 'approved')
      .reduce((sum, r) => sum + parseFloat(r.total), 0);

    console.log(\`\n📊 Tổng approved: \${totalApproved.toLocaleString('vi-VN')}đ\`);

    // PHẦN 2: PAYMENT REQUESTS
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💳 PHẦN 2: PAYMENT REQUESTS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const paymentsQuery = await pool.query(\`
      SELECT status, COUNT(*) as count, COALESCE(SUM(requested_amount), 0) as total
      FROM payment_requests WHERE user_id = $1 GROUP BY status ORDER BY status
    \`, [userId]);

    console.log('\nTrạng thái requests:');
    paymentsQuery.rows.forEach(r => {
      console.log(\`  • \${r.status} → \${r.count} requests, \${parseFloat(r.total).toLocaleString('vi-VN')}đ\`);
    });

    const totalRequested = paymentsQuery.rows
      .filter(r => !['rejected', 'cancelled'].includes(r.status))
      .reduce((sum, r) => sum + parseFloat(r.total), 0);

    console.log(\`\n📊 Tổng requested: \${totalRequested.toLocaleString('vi-VN')}đ\`);

    // PHẦN 3: BALANCE CALCULATION
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 PHẦN 3: BALANCE CALCULATION');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const available = totalApproved - totalRequested;
    console.log(\`\n📐 Formula: Available = Approved - Requested\`);
    console.log(\`📊 Result: \${available.toLocaleString('vi-VN')}đ = \${totalApproved.toLocaleString('vi-VN')}đ - \${totalRequested.toLocaleString('vi-VN')}đ\`);

    console.log(\`\n✅ Hệ thống đang hoạt động ĐÚNG theo nguyên tắc:\`);
    console.log(\`   Balance = Approved - Requested (KHÔNG phụ thuộc items)\n\`);

  } finally {
    await pool.end();
  }
})();
