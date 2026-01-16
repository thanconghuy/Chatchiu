const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

async function testCreatePaymentRequest() {
  const client = await pool.connect();

  try {
    console.log('Testing payment request creation...\n');

    // Get a user with balance
    const userResult = await client.query(`
      SELECT
        u.id as user_id,
        u.full_name,
        u.email,
        usb.available_balance,
        usb.total_earned,
        usb.total_withdrawn,
        usb.pending_balance
      FROM users u
      LEFT JOIN user_system_balance usb ON u.id = usb.user_id
      WHERE usb.available_balance > 50000
      ORDER BY usb.available_balance DESC
      LIMIT 1
    `);

    if (userResult.rows.length === 0) {
      console.log('❌ No user with sufficient balance found');
      process.exit(0);
    }

    const user = userResult.rows[0];
    console.log('User selected:');
    console.log(`  ID: ${user.user_id}`);
    console.log(`  Name: ${user.full_name}`);
    console.log(`  Email: ${user.email}`);
    console.log(`  Available Balance: ${parseFloat(user.available_balance).toLocaleString('vi-VN')}đ`);
    console.log(`  Total Earned: ${parseFloat(user.total_earned).toLocaleString('vi-VN')}đ`);
    console.log(`  Total Withdrawn: ${parseFloat(user.total_withdrawn).toLocaleString('vi-VN')}đ`);
    console.log(`  Pending Balance: ${parseFloat(user.pending_balance).toLocaleString('vi-VN')}đ`);
    console.log('');

    // Test data
    const requestedAmount = 130000;
    const idempotencyKey = uuidv4();

    console.log('Test Payment Request:');
    console.log(`  Amount: ${requestedAmount.toLocaleString('vi-VN')}đ`);
    console.log(`  Idempotency Key: ${idempotencyKey}`);
    console.log('');

    // Check min/max settings
    const settingsResult = await client.query(`
      SELECT setting_key, setting_value FROM system_settings
      WHERE setting_key IN ('min_withdrawal_amount', 'max_withdrawal_amount')
    `);

    console.log('System Settings:');
    settingsResult.rows.forEach(row => {
      console.log(`  ${row.setting_key}: ${row.setting_value}`);
    });
    console.log('');

    // Check if user has payment account
    const paymentAccountResult = await client.query(`
      SELECT * FROM payment_accounts
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `, [user.user_id]);

    let paymentAccountId = null;
    if (paymentAccountResult.rows.length > 0) {
      const pa = paymentAccountResult.rows[0];
      paymentAccountId = pa.id;
      console.log('Existing Payment Account:');
      console.log(`  ID: ${pa.id}`);
      console.log(`  Bank: ${pa.bank_name}`);
      console.log(`  Account: ${pa.account_number}`);
      console.log(`  Name: ${pa.account_name}`);
    } else {
      console.log('No existing payment account found');
    }
    console.log('');

    // Simulate the service call
    console.log('Simulating payment request creation...');
    console.log('');

    await client.query('BEGIN');
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');

    // Step 1: Check idempotency
    const existingCheck = await client.query(`
      SELECT * FROM payment_requests WHERE idempotency_key = $1
    `, [idempotencyKey]);

    console.log(`✅ Idempotency check: ${existingCheck.rows.length === 0 ? 'No duplicate' : 'Duplicate found'}`);

    // Step 2: Lock and check balance
    const balanceResult = await client.query(`
      SELECT available_balance, total_earned, total_withdrawn
      FROM user_system_balance
      WHERE user_id = $1
      FOR UPDATE
    `, [user.user_id]);

    if (balanceResult.rows.length === 0) {
      throw new Error('User balance not found');
    }

    const balance = balanceResult.rows[0];
    const availableBalance = parseFloat(balance.available_balance);

    console.log(`✅ Balance locked: ${availableBalance.toLocaleString('vi-VN')}đ`);

    if (requestedAmount > availableBalance) {
      throw new Error(`Insufficient balance: ${availableBalance} < ${requestedAmount}`);
    }

    console.log(`✅ Balance sufficient: ${requestedAmount.toLocaleString('vi-VN')}đ <= ${availableBalance.toLocaleString('vi-VN')}đ`);

    // Step 3: Create payment request
    const prResult = await client.query(`
      INSERT INTO payment_requests (
        user_id,
        requested_amount,
        bank_name,
        bank_account_number,
        bank_account_name,
        bank_branch,
        notes,
        payment_account_id,
        status,
        idempotency_key,
        reserve_balance_at,
        created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, NOW(), NOW())
      RETURNING *
    `, [
      user.user_id,
      requestedAmount,
      'ZaloPay',
      '0944941491',
      'LÊ TRỌNG MẠNH',
      null,
      'Test payment request',
      paymentAccountId,
      idempotencyKey
    ]);

    const paymentRequest = prResult.rows[0];
    console.log(`✅ Payment request created: ${paymentRequest.id}`);

    // Step 4: Reserve balance
    const newAvailable = availableBalance - requestedAmount;
    const newPending = parseFloat(balance.total_withdrawn) + requestedAmount;

    await client.query(`
      UPDATE user_system_balance
      SET
        available_balance = available_balance - $1,
        pending_balance = pending_balance + $1,
        updated_at = NOW()
      WHERE user_id = $2
    `, [requestedAmount, user.user_id]);

    console.log(`✅ Balance reserved:`);
    console.log(`   Available: ${availableBalance.toLocaleString('vi-VN')}đ → ${newAvailable.toLocaleString('vi-VN')}đ`);

    // Step 5: Log transaction
    await client.query(`
      INSERT INTO balance_transactions (
        user_id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        reference_type,
        reference_id,
        description
      ) VALUES ($1, 'payment_reserved', $2, $3, $4, 'payment_request', $5, $6)
    `, [
      user.user_id,
      requestedAmount,
      availableBalance,
      newAvailable,
      paymentRequest.id,
      `Reserved balance for payment request`
    ]);

    console.log(`✅ Transaction logged`);

    // Step 6: Log action
    await client.query(`
      INSERT INTO payment_request_logs (
        payment_request_id,
        action,
        old_status,
        new_status,
        performed_by,
        notes
      ) VALUES ($1, 'created', NULL, 'pending', $2, $3)
    `, [
      paymentRequest.id,
      user.user_id,
      `Tạo yêu cầu thanh toán ${requestedAmount.toLocaleString('vi-VN')}đ`
    ]);

    console.log(`✅ Action logged`);

    await client.query('COMMIT');
    console.log('');
    console.log('✅ ✅ ✅ Payment request created successfully!');
    console.log('');
    console.log('Payment Request Details:');
    console.log(`  ID: ${paymentRequest.id}`);
    console.log(`  Amount: ${parseFloat(paymentRequest.requested_amount).toLocaleString('vi-VN')}đ`);
    console.log(`  Status: ${paymentRequest.status}`);
    console.log(`  Bank: ${paymentRequest.bank_name}`);
    console.log(`  Account: ${paymentRequest.bank_account_number}`);
    console.log(`  Created: ${paymentRequest.created_at}`);

    process.exit(0);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('');
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  } finally {
    client.release();
  }
}

testCreatePaymentRequest();
