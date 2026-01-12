const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🔍 Kiểm tra conversions chưa có kỳ đối soát\n');

    // 1. Tìm conversions không có trong system_reconciliation_items
    const orphanConversionsQuery = await client.query(
      `SELECT sc.*
       FROM system_conversions sc
       WHERE sc.user_id = $1
         AND sc.status = 'approved'
         AND NOT EXISTS (
           SELECT 1 FROM system_reconciliation_items sri
           WHERE sri.system_conversion_id = sc.id
         )
       ORDER BY sc.created_at ASC`,
      [userId]
    );

    console.log('📦 Conversions chưa có kỳ đối soát:', orphanConversionsQuery.rows.length);

    if (orphanConversionsQuery.rows.length === 0) {
      console.log('✅ Tất cả conversions đã có kỳ đối soát!');
      return;
    }

    orphanConversionsQuery.rows.forEach(c => {
      console.log('   - ' + c.id.substring(0, 8) + ': ' + parseFloat(c.cashback_amount).toLocaleString('vi-VN') + 'đ (' + c.merchant_name + ')');
    });
    console.log('');

    // 2. Tạo kỳ đối soát mới cho các conversions này
    console.log('📝 Tạo kỳ đối soát mới...\n');

    await client.query('BEGIN');

    // Create reconciliation period
    const periodLabel = 'Kỳ đối soát ' + new Date().toLocaleDateString('vi-VN');
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 7); // 7 days ago
    const periodEnd = new Date();

    const reconResult = await client.query(
      `INSERT INTO system_reconciliations (
        period_label,
        period_start,
        period_end,
        reconciliation_date,
        status,
        created_at,
        finalized_at
      ) VALUES ($1, $2, $3, $4, 'finalized', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      RETURNING id`,
      [periodLabel, periodStart, periodEnd, periodEnd]
    );

    const reconciliationId = reconResult.rows[0].id;
    console.log('✅ Tạo kỳ đối soát:', reconciliationId.substring(0, 8));
    console.log('   Period:', periodLabel);
    console.log('');

    // 3. Thêm các conversions vào reconciliation items
    let totalAdded = 0;
    let totalAmount = 0;

    for (const conversion of orphanConversionsQuery.rows) {
      await client.query(
        `INSERT INTO system_reconciliation_items (
          system_reconciliation_id,
          user_id,
          system_conversion_id,
          order_id,
          order_time,
          cashback_amount,
          merchant_name,
          order_value,
          commission_amount,
          conversion_status,
          is_high_risk,
          risk_score,
          api_reconciled,
          reconciled_at,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          reconciliationId,
          userId,
          conversion.id,
          conversion.order_id || 'N/A',
          conversion.order_time || new Date(),
          conversion.cashback_amount,
          conversion.merchant_name || 'Unknown',
          conversion.order_value || 0,
          conversion.commission_amount || 0,
          conversion.status,
          false, // is_high_risk
          0, // risk_score
          true // api_reconciled
        ]
      );

      totalAdded++;
      totalAmount += parseFloat(conversion.cashback_amount);
    }

    console.log('✅ Đã thêm', totalAdded, 'items vào kỳ đối soát');
    console.log('   Tổng số tiền:', totalAmount.toLocaleString('vi-VN') + 'đ');
    console.log('');

    // 4. Cập nhật user_system_balance
    console.log('💰 Cập nhật user_system_balance...\n');

    // Check current balance
    const currentBalanceResult = await client.query(
      'SELECT * FROM user_system_balance WHERE user_id = $1',
      [userId]
    );

    if (currentBalanceResult.rows.length === 0) {
      // Create new balance record
      await client.query(
        `INSERT INTO user_system_balance (
          user_id,
          available_balance,
          pending_balance,
          reserved_balance,
          debt_balance,
          total_earned,
          total_withdrawn,
          last_reconciliation_date,
          updated_at
        ) VALUES ($1, $2, 0, 0, 0, $2, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [userId, totalAmount]
      );
      console.log('✅ Tạo mới user_system_balance');
    } else {
      // Update existing balance
      await client.query(
        `UPDATE user_system_balance
         SET available_balance = available_balance + $2,
             total_earned = total_earned + $2,
             last_reconciliation_date = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [userId, totalAmount]
      );
      console.log('✅ Cập nhật user_system_balance');
    }

    // Get updated balance
    const updatedBalanceResult = await client.query(
      'SELECT * FROM user_system_balance WHERE user_id = $1',
      [userId]
    );

    const bal = updatedBalanceResult.rows[0];
    console.log('   available_balance:', parseFloat(bal.available_balance).toLocaleString('vi-VN') + 'đ');
    console.log('   total_earned:', parseFloat(bal.total_earned).toLocaleString('vi-VN') + 'đ');
    console.log('   total_withdrawn:', parseFloat(bal.total_withdrawn).toLocaleString('vi-VN') + 'đ');
    console.log('');

    await client.query('COMMIT');

    console.log('✅ HOÀN TẤT!');
    console.log('');
    console.log('📊 Bây giờ hãy kiểm tra lại dashboard:');
    console.log('   - "Số dư hệ thống" nên khớp với "Số dư từ đơn hàng"');
    console.log('');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Lỗi:', error);
  } finally {
    client.release();
    await pool.end();
  }
})();
