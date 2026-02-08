/**
 * Fix pending_reserved for users who cancelled PENDING payment requests
 *
 * Issue: When user cancelled a PENDING request, the code incorrectly
 * released balance (subtracted from pending_reserved) even though
 * balance was never reserved in the first place.
 *
 * Fix: Recalculate pending_reserved based on actual CONFIRMED (not paid/rejected) requests
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/database');

async function fixPendingReserved() {
  console.log('='.repeat(60));
  console.log('Fix pending_reserved Balance');
  console.log('='.repeat(60));

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Show current state
    console.log('\n📊 Current state:');

    const currentState = await client.query(`
      SELECT
        usb.user_id,
        u.email,
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) as available_balance,
        -- Correct pending_reserved = SUM of CONFIRMED requests (not paid/rejected/cancelled)
        COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests pr
          WHERE pr.user_id = usb.user_id
            AND pr.status = 'confirmed'
        ), 0) as correct_pending_reserved
      FROM user_system_balance usb
      LEFT JOIN users u ON usb.user_id = u.id
      WHERE usb.pending_reserved != COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = usb.user_id
          AND pr.status = 'confirmed'
      ), 0)
      ORDER BY ABS(usb.pending_reserved - COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = usb.user_id
          AND pr.status = 'confirmed'
      ), 0)) DESC
    `);

    if (currentState.rows.length === 0) {
      console.log('   ✅ All users have correct pending_reserved values');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`   Found ${currentState.rows.length} users with incorrect pending_reserved:\n`);

    currentState.rows.forEach((row, index) => {
      if (index < 10) {
        const diff = parseFloat(row.pending_reserved) - parseFloat(row.correct_pending_reserved);
        console.log(`   ${row.email}:`);
        console.log(`     - Current pending_reserved: ${parseFloat(row.pending_reserved).toLocaleString('vi-VN')}đ`);
        console.log(`     - Correct pending_reserved: ${parseFloat(row.correct_pending_reserved).toLocaleString('vi-VN')}đ`);
        console.log(`     - Difference: ${diff.toLocaleString('vi-VN')}đ`);
        console.log(`     - Current available: ${parseFloat(row.available_balance).toLocaleString('vi-VN')}đ`);
        const correctAvailable = parseFloat(row.total_earned) - parseFloat(row.total_withdrawn) - parseFloat(row.correct_pending_reserved);
        console.log(`     - Correct available: ${correctAvailable.toLocaleString('vi-VN')}đ`);
        console.log('');
      }
    });

    if (currentState.rows.length > 10) {
      console.log(`   ... and ${currentState.rows.length - 10} more users`);
    }

    // 2. Fix pending_reserved
    console.log('\n🔧 Fixing pending_reserved...');

    const fixResult = await client.query(`
      UPDATE user_system_balance usb
      SET
        pending_reserved = COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests pr
          WHERE pr.user_id = usb.user_id
            AND pr.status = 'confirmed'
        ), 0),
        updated_at = NOW()
      WHERE usb.pending_reserved != COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = usb.user_id
          AND pr.status = 'confirmed'
      ), 0)
      RETURNING user_id
    `);

    console.log(`   ✅ Fixed ${fixResult.rowCount} user balances`);

    // 3. Verify fix
    console.log('\n🔍 Verifying fix...');

    const verifyResult = await client.query(`
      SELECT
        usb.user_id,
        u.email,
        usb.pending_reserved,
        COALESCE((
          SELECT SUM(requested_amount)
          FROM payment_requests pr
          WHERE pr.user_id = usb.user_id
            AND pr.status = 'confirmed'
        ), 0) as correct_pending_reserved
      FROM user_system_balance usb
      LEFT JOIN users u ON usb.user_id = u.id
      WHERE usb.pending_reserved != COALESCE((
        SELECT SUM(requested_amount)
        FROM payment_requests pr
        WHERE pr.user_id = usb.user_id
          AND pr.status = 'confirmed'
      ), 0)
    `);

    if (verifyResult.rows.length === 0) {
      console.log('   ✅ All users now have correct pending_reserved values');
    } else {
      console.log(`   ⚠️  Warning: ${verifyResult.rows.length} users still have incorrect values`);
    }

    // 4. Show testuser@test.com balance
    console.log('\n📊 testuser@test.com balance after fix:');

    const testUserResult = await client.query(`
      SELECT
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_reserved,
        (usb.total_earned - usb.total_withdrawn - usb.pending_reserved) as available_balance
      FROM user_system_balance usb
      JOIN users u ON usb.user_id = u.id
      WHERE u.email = 'testuser@test.com'
    `);

    if (testUserResult.rows.length > 0) {
      const tu = testUserResult.rows[0];
      console.log(`   - total_earned: ${parseFloat(tu.total_earned).toLocaleString('vi-VN')}đ`);
      console.log(`   - total_withdrawn: ${parseFloat(tu.total_withdrawn).toLocaleString('vi-VN')}đ`);
      console.log(`   - pending_reserved: ${parseFloat(tu.pending_reserved).toLocaleString('vi-VN')}đ`);
      console.log(`   - available_balance: ${parseFloat(tu.available_balance).toLocaleString('vi-VN')}đ`);
    }

    await client.query('COMMIT');
    console.log('\n✅ Fix completed successfully!');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

fixPendingReserved().catch(console.error);
