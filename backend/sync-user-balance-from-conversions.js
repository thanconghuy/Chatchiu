/**
 * Sync user_system_balance.total_earned from system_conversions
 *
 * Purpose: Fix mismatch between user_system_balance.total_earned and
 *          actual SUM of cashback from system_conversions
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { pool } = require('./config/database');

(async () => {
  try {
    console.log('=== SYNC USER_SYSTEM_BALANCE FROM SYSTEM_CONVERSIONS ===\n');

    // Step 1: Find all users with mismatch
    console.log('1. Finding users with balance mismatch...\n');

    const mismatchQuery = `
      SELECT
        u.id as user_id,
        u.email,
        COALESCE(usb.total_earned, 0) as current_total_earned,
        COALESCE(sc_sum.total_cashback, 0) as actual_total_cashback,
        COALESCE(sc_sum.total_cashback, 0) - COALESCE(usb.total_earned, 0) as difference
      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      LEFT JOIN (
        SELECT user_id, SUM(cashback_amount) as total_cashback
        FROM system_conversions
        GROUP BY user_id
      ) sc_sum ON u.id = sc_sum.user_id
      WHERE ABS(COALESCE(sc_sum.total_cashback, 0) - COALESCE(usb.total_earned, 0)) > 0.01
      ORDER BY ABS(COALESCE(sc_sum.total_cashback, 0) - COALESCE(usb.total_earned, 0)) DESC
    `;

    const mismatchResult = await pool.query(mismatchQuery);
    console.log(`Found ${mismatchResult.rows.length} users with balance mismatch\n`);

    if (mismatchResult.rows.length === 0) {
      console.log('✅ All balances are in sync!');
      await pool.end();
      return;
    }

    // Show top 10 mismatches
    console.log('Top mismatches:');
    mismatchResult.rows.slice(0, 10).forEach((row, i) => {
      console.log(`  ${i+1}. ${row.email}`);
      console.log(`     Current: ${parseFloat(row.current_total_earned).toLocaleString('vi-VN')} đ`);
      console.log(`     Actual:  ${parseFloat(row.actual_total_cashback).toLocaleString('vi-VN')} đ`);
      console.log(`     Diff:    ${parseFloat(row.difference).toLocaleString('vi-VN')} đ`);
      console.log('');
    });

    // Step 2: Fix all mismatches
    console.log('\n2. Fixing all mismatches...\n');

    let fixedCount = 0;
    for (const row of mismatchResult.rows) {
      try {
        // Ensure user_system_balance record exists
        await pool.query(`
          INSERT INTO user_system_balance (user_id, total_earned, total_withdrawn, pending_reserved, updated_at)
          VALUES ($1, 0, 0, 0, NOW())
          ON CONFLICT (user_id) DO NOTHING
        `, [row.user_id]);

        // Update total_earned to match system_conversions
        await pool.query(`
          UPDATE user_system_balance
          SET total_earned = $1, updated_at = NOW()
          WHERE user_id = $2
        `, [row.actual_total_cashback, row.user_id]);

        fixedCount++;
      } catch (err) {
        console.error(`Failed to fix ${row.email}:`, err.message);
      }
    }

    console.log(`✅ Fixed ${fixedCount}/${mismatchResult.rows.length} users\n`);

    // Step 3: Verify fix
    console.log('3. Verifying fix...\n');

    const verifyResult = await pool.query(mismatchQuery);
    if (verifyResult.rows.length === 0) {
      console.log('✅ All balances are now in sync!');
    } else {
      console.log(`⚠️ Still ${verifyResult.rows.length} users with mismatch after fix`);
    }

    await pool.end();
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
