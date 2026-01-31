require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    const userId = 'b4e22487-bdfc-41de-8696-53398ec4342a'; // bachanhtivi@gmail.com

    console.log('=== BREAKDOWN OF BALANCE FOR bachanhtivi@gmail.com ===\n');

    // Total cashback
    const total = await pool.query(`
      SELECT COALESCE(SUM(cashback_amount), 0) as amount
      FROM system_conversions
      WHERE user_id = $1
    `, [userId]);
    console.log('Total cashback (all):', parseFloat(total.rows[0].amount).toLocaleString('vi-VN'), 'đ');

    // Reconciled only
    const reconciled = await pool.query(`
      SELECT COALESCE(SUM(cashback_amount), 0) as amount
      FROM system_conversions
      WHERE user_id = $1
        AND status = 'approved'
        AND system_reconciliation_status = 'reconciled'
    `, [userId]);
    console.log('Reconciled cashback:', parseFloat(reconciled.rows[0].amount).toLocaleString('vi-VN'), 'đ');

    // Not reconciled
    const notReconciled = await pool.query(`
      SELECT COALESCE(SUM(cashback_amount), 0) as amount
      FROM system_conversions
      WHERE user_id = $1
        AND status = 'approved'
        AND (system_reconciliation_status IS NULL OR system_reconciliation_status != 'reconciled')
    `, [userId]);
    console.log('NOT reconciled yet:', parseFloat(notReconciled.rows[0].amount).toLocaleString('vi-VN'), 'đ');

    // Check reconciliation status breakdown
    console.log('\n=== RECONCILIATION STATUS BREAKDOWN ===');
    const breakdown = await pool.query(`
      SELECT
        system_reconciliation_status,
        COUNT(*) as count,
        SUM(cashback_amount) as amount
      FROM system_conversions
      WHERE user_id = $1
      GROUP BY system_reconciliation_status
    `, [userId]);
    breakdown.rows.forEach(row => {
      console.log(`  ${row.system_reconciliation_status || 'NULL'}: ${row.count} đơn - ${parseFloat(row.amount).toLocaleString('vi-VN')} đ`);
    });

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
})();
