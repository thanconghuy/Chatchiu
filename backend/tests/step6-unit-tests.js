/**
 * BƯỚC 6: Test từng function riêng lẻ
 *
 * Test suite for individual functions modified in payment fix
 * Run: node backend/tests/step6-unit-tests.js
 */

const db = require('../config/database');
const logger = require('../utils/logger');
const paymentRequestService = require('../services/paymentRequestService');
const BalanceManagementService = require('../services/systemReconciliation/BalanceManagementService');

// Test utilities
const assert = (condition, message) => {
  if (!condition) {
    throw new Error(`❌ ASSERTION FAILED: ${message}`);
  }
  console.log(`✅ ${message}`);
};

const assertEqual = (actual, expected, message) => {
  if (actual !== expected) {
    throw new Error(`❌ ASSERTION FAILED: ${message}\n   Expected: ${expected}\n   Actual: ${actual}`);
  }
  console.log(`✅ ${message}`);
};

// Test data cleanup (restore balance, delete test data, but keep user)
async function cleanupTestData(userId, paymentRequestId, originalBalance = null) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Delete test transactions
    await client.query('DELETE FROM user_balance_transactions WHERE payment_request_id = $1', [paymentRequestId]);
    await client.query('DELETE FROM payment_reconciliation_mapping WHERE payment_request_id = $1', [paymentRequestId]);
    await client.query('DELETE FROM payment_requests WHERE id = $1', [paymentRequestId]);

    // Restore original balance if provided
    if (originalBalance !== null) {
      await client.query(
        'UPDATE user_system_balance SET available_balance = $1, total_withdrawn = 0 WHERE user_id = $2',
        [originalBalance, userId]
      );
    }

    await client.query('COMMIT');
    console.log('🧹 Cleanup completed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Cleanup failed:', error.message);
  } finally {
    client.release();
  }
}

// Get an existing user from database for testing
async function getExistingTestUser() {
  const client = await db.pool.connect();
  try {
    // Get any existing user (preferably one with minimal activity)
    const query = `
      SELECT u.id, u.email, u.full_name
      FROM users u
      WHERE u.id NOT IN (
        SELECT DISTINCT user_id FROM payment_requests WHERE status IN ('pending', 'confirmed')
      )
      LIMIT 1
    `;
    const result = await client.query(query);

    if (result.rows.length === 0) {
      throw new Error('No suitable test user found. Please create a user in the system first.');
    }

    return result.rows[0];
  } finally {
    client.release();
  }
}

// Setup test user with initial balance
async function setupTestUser(userId, initialBalance = 100000) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    // Insert or update user_system_balance
    const balanceQuery = `
      INSERT INTO user_system_balance (user_id, available_balance, pending_balance, reserved_balance, debt_balance, total_earned, total_withdrawn, updated_at)
      VALUES ($1, $2, 0, 0, 0, $2, 0, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id)
      DO UPDATE SET
        available_balance = $2,
        total_withdrawn = 0,
        total_earned = $2,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await client.query(balanceQuery, [userId, initialBalance]);
    await client.query('COMMIT');

    console.log(`✅ Test user setup: ${userId} with balance ${initialBalance}đ`);
    return result.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Create test payment request
async function createTestPaymentRequest(userId, amount, status = 'confirmed') {
  const client = await db.pool.connect();
  try {
    const query = `
      INSERT INTO payment_requests (
        id, user_id, requested_amount, status,
        bank_name, bank_account_number, bank_account_name,
        created_at
      )
      VALUES ($1, $2, $3, $4, 'Test Bank', '1234567890', 'Test User', CURRENT_TIMESTAMP)
      RETURNING *
    `;

    const paymentRequestId = require('crypto').randomUUID();
    const result = await client.query(query, [paymentRequestId, userId, amount, status]);

    console.log(`✅ Test payment request created: ${paymentRequestId} - ${amount}đ`);
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Get current balance
async function getUserBalance(userId) {
  const client = await db.pool.connect();
  try {
    const query = 'SELECT * FROM user_system_balance WHERE user_id = $1';
    const result = await client.query(query, [userId]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

//========================================
// TEST 1: BalanceManagementService.deductBalance()
//========================================
async function test1_deductBalance_normal() {
  console.log('\n📋 TEST 1.1: deductBalance() - Normal deduction');

  const initialBalance = 100000;
  const deductAmount = 50000;

  try {
    // Get existing user
    const testUser = await getExistingTestUser();
    const testUserId = testUser.id;

    console.log(`   Using test user: ${testUser.email}`);

    // Setup
    await setupTestUser(testUserId, initialBalance);

    // Execute
    await BalanceManagementService.deductBalance(testUserId, deductAmount, null);

    // Verify
    const balance = await getUserBalance(testUserId);

    assertEqual(parseFloat(balance.available_balance), 50000, 'Available balance = 50,000đ');
    assertEqual(parseFloat(balance.total_withdrawn), 50000, 'Total withdrawn = 50,000đ');

    // Verify transaction log
    const logQuery = `
      SELECT * FROM user_balance_transactions
      WHERE user_id = $1 AND transaction_type = 'payment_deducted'
      ORDER BY created_at DESC LIMIT 1
    `;
    const logResult = await db.pool.query(logQuery, [testUserId]);

    assert(logResult.rows.length > 0, 'Transaction logged automatically by trigger');
    assertEqual(parseFloat(logResult.rows[0].amount), -50000, 'Log amount = -50,000đ');
    assertEqual(parseFloat(logResult.rows[0].balance_before), 100000, 'Log balance_before = 100,000đ');
    assertEqual(parseFloat(logResult.rows[0].balance_after), 50000, 'Log balance_after = 50,000đ');

    console.log('✅ TEST 1.1 PASSED\n');
  } catch (error) {
    console.error('❌ TEST 1.1 FAILED:', error.message);
    throw error;
  }
}

async function test2_deductBalance_insufficient() {
  console.log('\n📋 TEST 1.2: deductBalance() - Insufficient balance (should throw error)');

  const testUserId = require('crypto').randomUUID();
  const initialBalance = 10000;
  const deductAmount = 50000;

  try {
    // Setup
    await setupTestUser(testUserId, initialBalance);

    // Execute - should throw error
    let errorThrown = false;
    try {
      await BalanceManagementService.deductBalance(testUserId, deductAmount, null);
    } catch (error) {
      errorThrown = true;
      assert(error.message.includes('Insufficient balance'), 'Error message contains "Insufficient balance"');
    }

    assert(errorThrown, 'Error thrown for insufficient balance');

    // Verify balance unchanged
    const balance = await getUserBalance(testUserId);
    assertEqual(parseFloat(balance.available_balance), 10000, 'Balance unchanged = 10,000đ');
    assertEqual(parseFloat(balance.total_withdrawn), 0, 'Total withdrawn unchanged = 0đ');

    console.log('✅ TEST 1.2 PASSED\n');
  } catch (error) {
    console.error('❌ TEST 1.2 FAILED:', error.message);
    throw error;
  } finally {
    await cleanupTestData(testUserId, null);
  }
}

//========================================
// TEST 2: markAsPaid()
//========================================
async function test3_markAsPaid_happyPath() {
  console.log('\n📋 TEST 2.1: markAsPaid() - Happy path');

  const testUserId = require('crypto').randomUUID();
  const initialBalance = 100000;
  const paymentAmount = 50000;

  try {
    // Setup
    await setupTestUser(testUserId, initialBalance);
    const paymentRequest = await createTestPaymentRequest(testUserId, paymentAmount, 'confirmed');

    // Execute
    const adminInfo = { id: 'test-admin', name: 'Test Admin' };
    const result = await paymentRequestService.markAsPaid(
      paymentRequest.id,
      adminInfo,
      'TEST-REF-123',
      'Test payment'
    );

    // Verify payment request updated
    assertEqual(result.status, 'paid', 'Payment request status = paid');
    assert(result.paid_at !== null, 'paid_at timestamp set');
    assertEqual(result.transaction_reference, 'TEST-REF-123', 'Transaction reference set');

    // Verify balance deducted
    const balance = await getUserBalance(testUserId);
    assertEqual(parseFloat(balance.available_balance), 50000, 'Balance deducted: 100,000 - 50,000 = 50,000đ');
    assertEqual(parseFloat(balance.total_withdrawn), 50000, 'Total withdrawn = 50,000đ');

    // Verify transaction log
    const logQuery = `
      SELECT * FROM user_balance_transactions
      WHERE user_id = $1 AND payment_request_id = $2
    `;
    const logResult = await db.pool.query(logQuery, [testUserId, paymentRequest.id]);
    assert(logResult.rows.length > 0, 'Transaction logged with payment_request_id');

    console.log('✅ TEST 2.1 PASSED\n');
  } catch (error) {
    console.error('❌ TEST 2.1 FAILED:', error.message);
    throw error;
  } finally {
    // Note: cleanup will be done after we verify
  }
}

async function test4_markAsPaid_rollback() {
  console.log('\n📋 TEST 2.2: markAsPaid() - Rollback on error (insufficient balance)');

  const testUserId = require('crypto').randomUUID();
  const initialBalance = 10000;
  const paymentAmount = 50000; // More than balance

  try {
    // Setup
    await setupTestUser(testUserId, initialBalance);
    const paymentRequest = await createTestPaymentRequest(testUserId, paymentAmount, 'confirmed');

    // Execute - should rollback
    const adminInfo = { id: 'test-admin', name: 'Test Admin' };

    let errorThrown = false;
    try {
      await paymentRequestService.markAsPaid(
        paymentRequest.id,
        adminInfo,
        'TEST-REF-ROLLBACK',
        'Test rollback'
      );
    } catch (error) {
      errorThrown = true;
      console.log('   Expected error caught:', error.message);
    }

    assert(errorThrown, 'Error thrown due to insufficient balance');

    // Verify ROLLBACK: status unchanged
    const checkQuery = 'SELECT * FROM payment_requests WHERE id = $1';
    const checkResult = await db.pool.query(checkQuery, [paymentRequest.id]);
    assertEqual(checkResult.rows[0].status, 'confirmed', 'Status unchanged after rollback');
    assert(checkResult.rows[0].paid_at === null, 'paid_at still null after rollback');

    // Verify balance unchanged
    const balance = await getUserBalance(testUserId);
    assertEqual(parseFloat(balance.available_balance), 10000, 'Balance unchanged = 10,000đ');
    assertEqual(parseFloat(balance.total_withdrawn), 0, 'Total withdrawn unchanged = 0đ');

    console.log('✅ TEST 2.2 PASSED - Rollback worked correctly\n');
  } catch (error) {
    console.error('❌ TEST 2.2 FAILED:', error.message);
    throw error;
  } finally {
    // Cleanup
  }
}

//========================================
// TEST 3: checkEligibility()
//========================================
async function test5_checkEligibility_sufficient() {
  console.log('\n📋 TEST 3.1: checkEligibility() - Sufficient balance');

  const testUserId = require('crypto').randomUUID();
  const initialBalance = 100000;

  try {
    await setupTestUser(testUserId, initialBalance);

    const result = await paymentRequestService.checkEligibility(testUserId);

    assert(result.isEligible === true, 'User is eligible');
    assertEqual(parseFloat(result.availableBalance), 100000, 'Available balance = 100,000đ');
    assertEqual(result.reasons.length, 0, 'No blocking reasons');

    console.log('✅ TEST 3.1 PASSED\n');
  } catch (error) {
    console.error('❌ TEST 3.1 FAILED:', error.message);
    throw error;
  } finally {
    await cleanupTestData(testUserId, null);
  }
}

async function test6_checkEligibility_insufficient() {
  console.log('\n📋 TEST 3.2: checkEligibility() - Insufficient balance');

  const testUserId = require('crypto').randomUUID();
  const initialBalance = 5000; // Less than minAmount (10,000)

  try {
    await setupTestUser(testUserId, initialBalance);

    const result = await paymentRequestService.checkEligibility(testUserId);

    assert(result.isEligible === false, 'User is not eligible');
    assertEqual(parseFloat(result.availableBalance), 5000, 'Available balance = 5,000đ');
    assert(result.reasons.length > 0, 'Has blocking reasons');
    assert(result.reasons.some(r => r.includes('10,000')), 'Reason mentions minimum amount');

    console.log('✅ TEST 3.2 PASSED\n');
  } catch (error) {
    console.error('❌ TEST 3.2 FAILED:', error.message);
    throw error;
  } finally {
    await cleanupTestData(testUserId, null);
  }
}

async function test7_checkEligibility_zero() {
  console.log('\n📋 TEST 3.3: checkEligibility() - Zero balance');

  const testUserId = require('crypto').randomUUID();
  const initialBalance = 0;

  try {
    await setupTestUser(testUserId, initialBalance);

    const result = await paymentRequestService.checkEligibility(testUserId);

    assert(result.isEligible === false, 'User is not eligible');
    assertEqual(parseFloat(result.availableBalance), 0, 'Available balance = 0đ');
    assert(result.reasons.some(r => r.includes('không đủ')), 'Reason mentions insufficient balance');

    console.log('✅ TEST 3.3 PASSED\n');
  } catch (error) {
    console.error('❌ TEST 3.3 FAILED:', error.message);
    throw error;
  } finally {
    await cleanupTestData(testUserId, null);
  }
}

async function test8_checkEligibility_pendingRequest() {
  console.log('\n📋 TEST 3.4: checkEligibility() - Has pending request');

  const testUserId = require('crypto').randomUUID();
  const initialBalance = 100000;

  try {
    await setupTestUser(testUserId, initialBalance);

    // Create a pending payment request
    await createTestPaymentRequest(testUserId, 50000, 'pending');

    const result = await paymentRequestService.checkEligibility(testUserId);

    assert(result.isEligible === false, 'User is not eligible');
    assert(result.reasons.some(r => r.includes('đang chờ xử lý')), 'Reason mentions pending request');

    console.log('✅ TEST 3.4 PASSED\n');
  } catch (error) {
    console.error('❌ TEST 3.4 FAILED:', error.message);
    throw error;
  } finally {
    // Cleanup will handle payment request deletion
  }
}

//========================================
// MAIN TEST RUNNER
//========================================
async function runAllTests() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🧪 BƯỚC 6: Test từng function riêng lẻ');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const tests = [
    { name: 'deductBalance() - Normal', fn: test1_deductBalance_normal },
    { name: 'deductBalance() - Insufficient', fn: test2_deductBalance_insufficient },
    { name: 'markAsPaid() - Happy path', fn: test3_markAsPaid_happyPath },
    { name: 'markAsPaid() - Rollback', fn: test4_markAsPaid_rollback },
    { name: 'checkEligibility() - Sufficient', fn: test5_checkEligibility_sufficient },
    { name: 'checkEligibility() - Insufficient', fn: test6_checkEligibility_insufficient },
    { name: 'checkEligibility() - Zero', fn: test7_checkEligibility_zero },
    { name: 'checkEligibility() - Pending', fn: test8_checkEligibility_pendingRequest }
  ];

  let passed = 0;
  let failed = 0;
  const failedTests = [];

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (error) {
      failed++;
      failedTests.push({ name: test.name, error: error.message });
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 TEST RESULTS');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Passed: ${passed}/${tests.length}`);
  console.log(`❌ Failed: ${failed}/${tests.length}`);

  if (failedTests.length > 0) {
    console.log('\n❌ FAILED TESTS:');
    failedTests.forEach(t => {
      console.log(`   - ${t.name}: ${t.error}`);
    });
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED! Ready for BƯỚC 7 (End-to-end testing)\n');
  } else {
    console.log('⚠️  Some tests failed. Please review and fix before proceeding.\n');
    process.exit(1);
  }
}

// Run tests
runAllTests()
  .then(() => {
    console.log('✅ Test suite completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('💥 Test suite crashed:', error);
    process.exit(1);
  });
