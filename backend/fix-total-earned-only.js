require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  const client = await pool.connect();

  try {
    console.log('=== FIX: total_earned không chính xác ===\n');

    await client.query('BEGIN');

    // Show users cần fix
    const wrongUsers = await client.query(`
      SELECT
        u.email,
        usb.total_earned as current_earned,
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0) as correct_earned
      FROM user_system_balance usb
      JOIN users u ON u.id = usb.user_id
      WHERE ABS(
        usb.total_earned -
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0)
      ) >= 0.01
    `);

    if (wrongUsers.rows.length === 0) {
      console.log('✅ total_earned đã chính xác cho tất cả users!\n');
      await client.query('COMMIT');
      await pool.end();
      return;
    }

    console.log(`Tìm thấy ${wrongUsers.rows.length} users cần fix:\n`);
    wrongUsers.rows.forEach((row, i) => {
      console.log(`${i+1}. ${row.email}`);
      console.log(`   Current: ${parseFloat(row.current_earned).toLocaleString('vi-VN')} đ`);
      console.log(`   Correct: ${parseFloat(row.correct_earned).toLocaleString('vi-VN')} đ`);
      console.log(`   Diff: ${(parseFloat(row.current_earned) - parseFloat(row.correct_earned)).toLocaleString('vi-VN')} đ`);
      console.log('');
    });

    console.log('🔧 Đang fix...\n');

    // Fix
    const result = await client.query(`
      WITH correct_balances AS (
        SELECT
          user_id,
          COALESCE(SUM(cashback_amount), 0) as correct_total_earned
        FROM system_conversions
        WHERE status = 'approved'
          AND system_reconciliation_status = 'reconciled'
        GROUP BY user_id
      )
      UPDATE user_system_balance usb
      SET
        total_earned = COALESCE(cb.correct_total_earned, 0),
        updated_at = NOW()
      FROM correct_balances cb
      WHERE usb.user_id = cb.user_id
        AND ABS(usb.total_earned - cb.correct_total_earned) >= 0.01
    `);

    console.log(`✅ Đã fix ${result.rowCount} users!\n`);

    // Verify
    const verify = await client.query(`
      SELECT COUNT(*) as count
      FROM user_system_balance usb
      WHERE ABS(
        usb.total_earned -
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0)
      ) >= 0.01
    `);

    const remaining = parseInt(verify.rows[0].count);
    console.log(`📊 Còn lại: ${remaining} users ${remaining === 0 ? '✅' : '❌'}\n`);

    await client.query('COMMIT');
    console.log('✅ Hoàn tất!\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Lỗi:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
})();
