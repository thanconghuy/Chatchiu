require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  const client = await pool.connect();

  try {
    console.log('=== FIX BALANCE CONSISTENCY ===\n');

    await client.query('BEGIN');

    // ========================================
    // FIX 1: Re-sync total_earned từ RECONCILED conversions
    // ========================================
    console.log('🔧 FIX 1: Re-sync total_earned từ conversions đã đối soát\n');

    const earnedBefore = await client.query(`
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

    if (earnedBefore.rows.length > 0) {
      console.log('Users cần fix total_earned:');
      earnedBefore.rows.forEach((row, i) => {
        console.log(`  ${i+1}. ${row.email}`);
        console.log(`     Current: ${parseFloat(row.current_earned).toLocaleString('vi-VN')} đ`);
        console.log(`     Correct: ${parseFloat(row.correct_earned).toLocaleString('vi-VN')} đ`);
        console.log(`     Diff: ${(parseFloat(row.current_earned) - parseFloat(row.correct_earned)).toLocaleString('vi-VN')} đ`);
      });
      console.log('');

      // Fix all users
      const fixEarned = await client.query(`
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
        RETURNING usb.user_id
      `);

      console.log(`✅ Đã fix ${fixEarned.rowCount} users\n`);
    } else {
      console.log('✅ total_earned đã chính xác!\n');
    }

    // ========================================
    // FIX 2: Re-sync total_withdrawn từ PAID conversions
    // ========================================
    console.log('\n🔧 FIX 2: Re-sync total_withdrawn từ conversions đã thanh toán\n');

    const withdrawnBefore = await client.query(`
      SELECT
        u.email,
        usb.total_withdrawn as current_withdrawn,
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND payment_status = 'paid'
        ), 0) as correct_withdrawn
      FROM user_system_balance usb
      JOIN users u ON u.id = usb.user_id
      WHERE ABS(
        usb.total_withdrawn -
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND payment_status = 'paid'
        ), 0)
      ) >= 0.01
    `);

    if (withdrawnBefore.rows.length > 0) {
      console.log('Users cần fix total_withdrawn:');
      withdrawnBefore.rows.forEach((row, i) => {
        console.log(`  ${i+1}. ${row.email}`);
        console.log(`     Current: ${parseFloat(row.current_withdrawn).toLocaleString('vi-VN')} đ`);
        console.log(`     Correct: ${parseFloat(row.correct_withdrawn).toLocaleString('vi-VN')} đ`);
        console.log(`     Diff: ${(parseFloat(row.current_withdrawn) - parseFloat(row.correct_withdrawn)).toLocaleString('vi-VN')} đ`);
      });
      console.log('');

      // Fix all users
      const fixWithdrawn = await client.query(`
        WITH correct_withdrawn AS (
          SELECT
            user_id,
            COALESCE(SUM(cashback_amount), 0) as correct_total_withdrawn
          FROM system_conversions
          WHERE payment_status = 'paid'
          GROUP BY user_id
        )
        UPDATE user_system_balance usb
        SET
          total_withdrawn = COALESCE(cw.correct_total_withdrawn, 0),
          updated_at = NOW()
        FROM correct_withdrawn cw
        WHERE usb.user_id = cw.user_id
          AND ABS(usb.total_withdrawn - cw.correct_total_withdrawn) >= 0.01
        RETURNING usb.user_id
      `);

      console.log(`✅ Đã fix ${fixWithdrawn.rowCount} users\n`);
    } else {
      console.log('✅ total_withdrawn đã chính xác!\n');
    }

    // ========================================
    // VERIFY
    // ========================================
    console.log('\n📊 VERIFY KẾT QUẢ\n');
    console.log('='.repeat(80));

    // Check total_earned
    const verifyEarned = await client.query(`
      SELECT
        COUNT(*) FILTER (
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
        ) as wrong_count
      FROM user_system_balance usb
    `);

    const wrongEarned = parseInt(verifyEarned.rows[0].wrong_count);
    console.log(`total_earned: ${wrongEarned === 0 ? '✅ CHÍNH XÁC' : `❌ Còn ${wrongEarned} users sai`}`);

    // Check total_withdrawn
    const verifyWithdrawn = await client.query(`
      SELECT
        COUNT(*) FILTER (
          WHERE ABS(
            usb.total_withdrawn -
            COALESCE((
              SELECT SUM(cashback_amount)
              FROM system_conversions
              WHERE user_id = usb.user_id
                AND payment_status = 'paid'
            ), 0)
          ) >= 0.01
        ) as wrong_count
      FROM user_system_balance usb
    `);

    const wrongWithdrawn = parseInt(verifyWithdrawn.rows[0].wrong_count);
    console.log(`total_withdrawn: ${wrongWithdrawn === 0 ? '✅ CHÍNH XÁC' : `❌ Còn ${wrongWithdrawn} users sai`}`);

    // Check negative balance
    const verifyNegative = await client.query(`
      SELECT COUNT(*) as count
      FROM user_system_balance
      WHERE available_balance < 0
    `);

    const negativeCount = parseInt(verifyNegative.rows[0].count);
    console.log(`available_balance: ${negativeCount === 0 ? '✅ KHÔNG CÓ SỐ DƯ ÂM' : `❌ Có ${negativeCount} users số dư âm`}`);

    await client.query('COMMIT');

    console.log('\n✅ Hoàn tất!\n');

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
