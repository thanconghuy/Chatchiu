/**
 * Clear Test User Data Script
 *
 * Xóa toàn bộ dữ liệu test của user testuser@test.com
 * Bao gồm: conversions, reconciliation items, waiting list, balance, payment requests
 */

require('dotenv').config();
const { pool, testConnection } = require('../config/database');

const TEST_USER_EMAIL = 'testuser@test.com';

async function clearTestUserData() {
  console.log('='.repeat(60));
  console.log('Clear Test User Data');
  console.log('='.repeat(60));

  const connected = await testConnection();
  if (!connected) {
    console.error('Failed to connect to database');
    process.exit(1);
  }

  const client = await pool.connect();

  try {
    // Get test user ID
    const userResult = await client.query(
      'SELECT id, email, full_name FROM users WHERE email = $1',
      [TEST_USER_EMAIL]
    );

    if (userResult.rows.length === 0) {
      console.log(`User ${TEST_USER_EMAIL} không tồn tại`);
      return;
    }

    const testUser = userResult.rows[0];
    console.log(`\nFound user: ${testUser.full_name} (${testUser.email})`);
    console.log(`User ID: ${testUser.id}`);

    await client.query('BEGIN');

    // 1. Get stats before cleanup
    console.log('\n📊 Thống kê trước khi xóa:');

    const statsQuery = `
      SELECT
        (SELECT COUNT(*) FROM system_conversions WHERE user_id = $1) as conversions_count,
        (SELECT COALESCE(SUM(cashback_amount), 0) FROM system_conversions WHERE user_id = $1) as total_cashback,
        (SELECT COUNT(*) FROM system_reconciliation_items WHERE user_id = $1) as recon_items_count,
        (SELECT COUNT(*) FROM reconciliation_waiting_list WHERE user_id = $1) as waiting_list_count,
        (SELECT COUNT(*) FROM payment_requests WHERE user_id = $1) as payment_requests_count,
        (SELECT total_earned FROM user_system_balance WHERE user_id = $1) as balance_total_earned
    `;
    const stats = await client.query(statsQuery, [testUser.id]);
    const s = stats.rows[0];

    console.log(`   - System Conversions: ${s.conversions_count}`);
    console.log(`   - Total Cashback: ${parseFloat(s.total_cashback || 0).toLocaleString('vi-VN')}đ`);
    console.log(`   - Reconciliation Items: ${s.recon_items_count}`);
    console.log(`   - Waiting List: ${s.waiting_list_count}`);
    console.log(`   - Payment Requests: ${s.payment_requests_count}`);
    console.log(`   - Balance Total Earned: ${parseFloat(s.balance_total_earned || 0).toLocaleString('vi-VN')}đ`);

    // 2. Delete payment request mappings first (foreign key)
    console.log('\n🗑️  Xóa dữ liệu...');

    const deletePaymentMappings = await client.query(`
      DELETE FROM payment_reconciliation_mapping
      WHERE payment_request_id IN (
        SELECT id FROM payment_requests WHERE user_id = $1
      )
    `, [testUser.id]);
    console.log(`   - Payment mappings: ${deletePaymentMappings.rowCount} deleted`);

    // 3. Delete payment requests
    const deletePaymentRequests = await client.query(
      'DELETE FROM payment_requests WHERE user_id = $1',
      [testUser.id]
    );
    console.log(`   - Payment requests: ${deletePaymentRequests.rowCount} deleted`);

    // 4. Delete from waiting list
    const deleteWaitingList = await client.query(
      'DELETE FROM reconciliation_waiting_list WHERE user_id = $1',
      [testUser.id]
    );
    console.log(`   - Waiting list: ${deleteWaitingList.rowCount} deleted`);

    // 5. Delete reconciliation items for this user
    const deleteReconItems = await client.query(
      'DELETE FROM system_reconciliation_items WHERE user_id = $1',
      [testUser.id]
    );
    console.log(`   - Reconciliation items: ${deleteReconItems.rowCount} deleted`);

    // 6. Delete system conversions
    const deleteConversions = await client.query(
      'DELETE FROM system_conversions WHERE user_id = $1',
      [testUser.id]
    );
    console.log(`   - System conversions: ${deleteConversions.rowCount} deleted`);

    // 7. Reset user balance
    const resetBalance = await client.query(`
      UPDATE user_system_balance
      SET
        total_earned = 0,
        total_withdrawn = 0,
        pending_reserved = 0,
        debt_balance = 0,
        last_reconciliation_date = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1
    `, [testUser.id]);
    console.log(`   - User balance: ${resetBalance.rowCount} reset`);

    // 8. Clean up empty reconciliations (no items left)
    const cleanupRecons = await client.query(`
      DELETE FROM system_reconciliations sr
      WHERE NOT EXISTS (
        SELECT 1 FROM system_reconciliation_items sri
        WHERE sri.system_reconciliation_id = sr.id
      )
    `);
    console.log(`   - Empty reconciliations: ${cleanupRecons.rowCount} deleted`);

    await client.query('COMMIT');

    console.log('\n✅ Xóa dữ liệu test thành công!');

    // Verify
    console.log('\n📊 Thống kê sau khi xóa:');
    const verifyStats = await client.query(statsQuery, [testUser.id]);
    const v = verifyStats.rows[0];
    console.log(`   - System Conversions: ${v.conversions_count}`);
    console.log(`   - Reconciliation Items: ${v.recon_items_count}`);
    console.log(`   - Waiting List: ${v.waiting_list_count}`);
    console.log(`   - Payment Requests: ${v.payment_requests_count}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

clearTestUserData().catch(console.error);
