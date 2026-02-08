/**
 * Fix All Balance Data
 *
 * Sửa toàn bộ dữ liệu số dư dựa trên:
 * 1. total_earned = SUM(cashback) WHERE reconciled
 * 2. total_withdrawn = SUM(paid payment requests)
 * 3. pending_reserved = SUM(confirmed payment requests)
 * 4. available_balance = total_earned - total_withdrawn - pending_reserved
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/database');

async function fixAllBalanceData() {
  console.log('='.repeat(70));
  console.log('FIX ALL BALANCE DATA');
  console.log('='.repeat(70));

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Show current incorrect data
    console.log('\n📊 Current data BEFORE fix:');

    const beforeResult = await client.query(`
      SELECT
        u.email,
        usb.user_id,
        usb.total_earned as db_total_earned,
        usb.total_withdrawn as db_total_withdrawn,
        usb.pending_reserved as db_pending_reserved,
        -- Correct values
        COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0) as correct_total_earned,
        COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests
          WHERE user_id = usb.user_id
            AND status = 'paid'
        ), 0) as correct_total_withdrawn,
        COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests
          WHERE user_id = usb.user_id
            AND status = 'confirmed'
        ), 0) as correct_pending_reserved
      FROM user_system_balance usb
      LEFT JOIN users u ON usb.user_id = u.id
      WHERE
        ABS(usb.total_earned - COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions
          WHERE user_id = usb.user_id
            AND status = 'approved'
            AND system_reconciliation_status = 'reconciled'
        ), 0)) > 0.01
        OR
        ABS(usb.total_withdrawn - COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests
          WHERE user_id = usb.user_id
            AND status = 'paid'
        ), 0)) > 0.01
        OR
        ABS(usb.pending_reserved - COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests
          WHERE user_id = usb.user_id
            AND status = 'confirmed'
        ), 0)) > 0.01
      ORDER BY u.email
    `);

    if (beforeResult.rows.length === 0) {
      console.log('   ✅ All balances are already correct!');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`\n   Found ${beforeResult.rows.length} users with incorrect balances:\n`);

    beforeResult.rows.forEach(row => {
      console.log(`   ${row.email}:`);
      console.log(`     total_earned:     DB=${parseFloat(row.db_total_earned).toLocaleString('vi-VN')}đ | Correct=${parseFloat(row.correct_total_earned).toLocaleString('vi-VN')}đ`);
      console.log(`     total_withdrawn:  DB=${parseFloat(row.db_total_withdrawn).toLocaleString('vi-VN')}đ | Correct=${parseFloat(row.correct_total_withdrawn).toLocaleString('vi-VN')}đ`);
      console.log(`     pending_reserved: DB=${parseFloat(row.db_pending_reserved).toLocaleString('vi-VN')}đ | Correct=${parseFloat(row.correct_pending_reserved).toLocaleString('vi-VN')}đ`);

      const correctAvailable = parseFloat(row.correct_total_earned) - parseFloat(row.correct_total_withdrawn) - parseFloat(row.correct_pending_reserved);
      console.log(`     available_balance: ${correctAvailable.toLocaleString('vi-VN')}đ ${correctAvailable < 0 ? '(NỢ!)' : ''}`);
      console.log('');
    });

    // 2. Fix total_earned from reconciled conversions
    console.log('\n🔧 Step 1: Fix total_earned (from reconciled conversions)...');

    const fixEarnedResult = await client.query(`
      UPDATE user_system_balance usb
      SET
        total_earned = COALESCE((
          SELECT SUM(cashback_amount)
          FROM system_conversions sc
          WHERE sc.user_id = usb.user_id
            AND sc.status = 'approved'
            AND sc.system_reconciliation_status = 'reconciled'
        ), 0),
        updated_at = NOW()
      WHERE ABS(usb.total_earned - COALESCE((
        SELECT SUM(cashback_amount)
        FROM system_conversions sc
        WHERE sc.user_id = usb.user_id
          AND sc.status = 'approved'
          AND sc.system_reconciliation_status = 'reconciled'
      ), 0)) > 0.01
      RETURNING user_id
    `);

    console.log(`   ✅ Fixed total_earned for ${fixEarnedResult.rowCount} users`);

    // 3. Fix total_withdrawn from paid payment requests
    console.log('\n🔧 Step 2: Fix total_withdrawn (from paid payment requests)...');

    const fixWithdrawnResult = await client.query(`
      UPDATE user_system_balance usb
      SET
        total_withdrawn = COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests pr
          WHERE pr.user_id = usb.user_id
            AND pr.status = 'paid'
        ), 0),
        updated_at = NOW()
      WHERE ABS(usb.total_withdrawn - COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = usb.user_id
          AND pr.status = 'paid'
      ), 0)) > 0.01
      RETURNING user_id
    `);

    console.log(`   ✅ Fixed total_withdrawn for ${fixWithdrawnResult.rowCount} users`);

    // 4. Fix pending_reserved from confirmed payment requests
    console.log('\n🔧 Step 3: Fix pending_reserved (from confirmed payment requests)...');

    const fixReservedResult = await client.query(`
      UPDATE user_system_balance usb
      SET
        pending_reserved = COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests pr
          WHERE pr.user_id = usb.user_id
            AND pr.status = 'confirmed'
        ), 0),
        updated_at = NOW()
      WHERE ABS(usb.pending_reserved - COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = usb.user_id
          AND pr.status = 'confirmed'
      ), 0)) > 0.01
      RETURNING user_id
    `);

    console.log(`   ✅ Fixed pending_reserved for ${fixReservedResult.rowCount} users`);

    // 5. Check for users with negative balance (debt)
    console.log('\n🔍 Step 4: Check for users with debt (negative balance)...');

    const debtResult = await client.query(`
      SELECT
        u.email,
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) as available_balance
      FROM user_system_balance usb
      LEFT JOIN users u ON usb.user_id = u.id
      WHERE (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) < 0
    `);

    if (debtResult.rows.length > 0) {
      console.log(`\n   ⚠️  Found ${debtResult.rows.length} users with DEBT:\n`);
      debtResult.rows.forEach(row => {
        console.log(`   ${row.email}:`);
        console.log(`     total_earned: ${parseFloat(row.total_earned).toLocaleString('vi-VN')}đ`);
        console.log(`     total_withdrawn: ${parseFloat(row.total_withdrawn).toLocaleString('vi-VN')}đ`);
        console.log(`     available_balance: ${parseFloat(row.available_balance).toLocaleString('vi-VN')}đ (NỢ!)`);
        console.log('');
      });
    } else {
      console.log('   ✅ No users with debt');
    }

    // 6. Show final result
    console.log('\n📊 Data AFTER fix:');

    const afterResult = await client.query(`
      SELECT
        u.email,
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) as available_balance
      FROM user_system_balance usb
      LEFT JOIN users u ON usb.user_id = u.id
      WHERE u.email = 'testuser@test.com'
    `);

    if (afterResult.rows.length > 0) {
      const r = afterResult.rows[0];
      console.log(`\n   testuser@test.com:`);
      console.log(`     total_earned: ${parseFloat(r.total_earned).toLocaleString('vi-VN')}đ`);
      console.log(`     total_withdrawn: ${parseFloat(r.total_withdrawn).toLocaleString('vi-VN')}đ`);
      console.log(`     pending_reserved: ${parseFloat(r.pending_reserved).toLocaleString('vi-VN')}đ`);
      console.log(`     available_balance: ${parseFloat(r.available_balance).toLocaleString('vi-VN')}đ ${parseFloat(r.available_balance) < 0 ? '(NỢ!)' : ''}`);
    }

    await client.query('COMMIT');
    console.log('\n✅ All balance data fixed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

fixAllBalanceData().catch(console.error);
