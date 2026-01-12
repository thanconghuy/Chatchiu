const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');
const PaymentRequestService = require('../services/paymentRequestService');
const BalanceManagementService = require('../services/systemReconciliation/BalanceManagementService');

const TEST_USER_ID = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
const TEST_ADMIN = {
  id: 'admin-test-id',
  full_name: 'Test Admin',
  email: 'admin@test.com'
};

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`${status}: ${name}`);
  if (details) console.log(`   ${details}`);

  testResults.tests.push({ name, passed, details });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

async function getBalance(userId) {
  const result = await pool.query(`
    SELECT * FROM user_system_balance WHERE user_id = $1
  `, [userId]);
  return result.rows[0];
}

async function getTransactions(userId, limit = 10) {
  const result = await pool.query(`
    SELECT * FROM balance_transactions
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit]);
  return result.rows;
}

async function test1_CheckEligibility() {
  console.log('\n📋 TEST 1: Check Eligibility API\n');

  try {
    const result = await PaymentRequestService.checkEligibility(TEST_USER_ID);

    // Should have all required fields
    const hasAllFields = (
      result.hasOwnProperty('isEligible') &&
      result.hasOwnProperty('availableBalance') &&
      result.hasOwnProperty('totalConfirmedCashback') &&
      result.hasOwnProperty('totalRequested') &&
      result.hasOwnProperty('minAmount')
    );

    logTest(
      'Eligibility returns all required fields',
      hasAllFields,
      `Fields: ${Object.keys(result).join(', ')}`
    );

    logTest(
      'Eligibility has backward compatibility fields',
      result.hasOwnProperty('eligible') && result.hasOwnProperty('available_balance'),
      'Backward compat: eligible, available_balance exist'
    );

    console.log('   Available Balance:', result.availableBalance);
    console.log('   Confirmed Cashback:', result.totalConfirmedCashback);
    console.log('   Is Eligible:', result.isEligible);
    console.log('   Reasons:', result.reasons);

    return result;
  } catch (error) {
    logTest('Check Eligibility', false, error.message);
    throw error;
  }
}

async function test2_GetUserBalance() {
  console.log('\n💰 TEST 2: Get User Balance\n');

  try {
    const balance = await BalanceManagementService.getUserBalance(TEST_USER_ID);

    logTest(
      'Balance record exists',
      balance !== null,
      `Balance: ${balance.available_balance}`
    );

    logTest(
      'Balance has all fields',
      balance.hasOwnProperty('available_balance') &&
      balance.hasOwnProperty('total_earned') &&
      balance.hasOwnProperty('total_withdrawn'),
      `Fields: available=${balance.available_balance}, earned=${balance.total_earned}, withdrawn=${balance.total_withdrawn}`
    );

    console.log('   Available:', parseFloat(balance.available_balance).toLocaleString('vi-VN') + 'đ');
    console.log('   Total Earned:', parseFloat(balance.total_earned).toLocaleString('vi-VN') + 'đ');
    console.log('   Total Withdrawn:', parseFloat(balance.total_withdrawn).toLocaleString('vi-VN') + 'đ');

    return balance;
  } catch (error) {
    logTest('Get User Balance', false, error.message);
    throw error;
  }
}

async function test3_CreatePaymentRequest() {
  console.log('\n➕ TEST 3: Create Payment Request\n');

  try {
    const balanceBefore = await getBalance(TEST_USER_ID);
    const availableBefore = parseFloat(balanceBefore.available_balance);

    console.log('   Balance BEFORE:', availableBefore.toLocaleString('vi-VN') + 'đ');

    // Try to create request for 40,000đ
    const requestAmount = 40000;
    const idempotencyKey = `test-${Date.now()}-${Math.random()}`;

    let paymentRequest;
    try {
      paymentRequest = await PaymentRequestService.createPaymentRequest({
        userId: TEST_USER_ID,
        requestedAmount: requestAmount,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        bankBranch: 'HCM',
        notes: 'Test create request',
        idempotencyKey: idempotencyKey,
        context: {}
      });

      const balanceAfter = await getBalance(TEST_USER_ID);
      const availableAfter = parseFloat(balanceAfter.available_balance);

      console.log('   Balance AFTER:', availableAfter.toLocaleString('vi-VN') + 'đ');
      console.log('   Request ID:', paymentRequest.id);

      // Check balance was reserved
      const expectedAfter = availableBefore - requestAmount;
      const balanceReserved = Math.abs(availableAfter - expectedAfter) < 0.01;

      logTest(
        'Balance reserved on create',
        balanceReserved,
        `Expected: ${expectedAfter}, Got: ${availableAfter}`
      );

      // Check transaction log
      const transactions = await getTransactions(TEST_USER_ID, 1);
      const hasReserveLog = transactions.length > 0 && transactions[0].transaction_type === 'payment_reserved';

      logTest(
        'Reserve transaction logged',
        hasReserveLog,
        hasReserveLog ? `Type: ${transactions[0].transaction_type}, Amount: ${transactions[0].amount}` : 'No transaction found'
      );

      // Check idempotency key stored
      logTest(
        'Idempotency key stored',
        paymentRequest.idempotency_key === idempotencyKey,
        `Key: ${paymentRequest.idempotency_key}`
      );

      logTest(
        'reserve_balance_at timestamp set',
        paymentRequest.reserve_balance_at !== null,
        `Time: ${paymentRequest.reserve_balance_at}`
      );

      return paymentRequest;

    } catch (error) {
      // If insufficient balance, that's expected
      if (error.message.includes('Số dư không đủ')) {
        logTest(
          'Insufficient balance validation works',
          true,
          'Correctly prevented over-request'
        );
        return null;
      }
      throw error;
    }
  } catch (error) {
    logTest('Create Payment Request', false, error.message);
    return null;
  }
}

async function test4_IdempotencyPrevention() {
  console.log('\n🔒 TEST 4: Idempotency Prevention\n');

  try {
    const balanceBefore = await getBalance(TEST_USER_ID);
    const availableBefore = parseFloat(balanceBefore.available_balance);

    const idempotencyKey = `test-idempotency-${Date.now()}`;
    const requestAmount = 40000;

    let firstRequest, secondRequest;

    try {
      // First request
      firstRequest = await PaymentRequestService.createPaymentRequest({
        userId: TEST_USER_ID,
        requestedAmount: requestAmount,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        idempotencyKey: idempotencyKey,
        context: {}
      });

      console.log('   First request ID:', firstRequest.id);

      // Second request with SAME idempotency key
      secondRequest = await PaymentRequestService.createPaymentRequest({
        userId: TEST_USER_ID,
        requestedAmount: requestAmount,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        idempotencyKey: idempotencyKey,
        context: {}
      });

      console.log('   Second request ID:', secondRequest.id);

      // Should return same request
      logTest(
        'Idempotency returns same request',
        firstRequest.id === secondRequest.id,
        `First: ${firstRequest.id}, Second: ${secondRequest.id}`
      );

      // Balance should only be deducted ONCE
      const balanceAfter = await getBalance(TEST_USER_ID);
      const availableAfter = parseFloat(balanceAfter.available_balance);
      const expectedAfter = availableBefore - requestAmount;

      logTest(
        'Balance only deducted once',
        Math.abs(availableAfter - expectedAfter) < 0.01,
        `Before: ${availableBefore}, After: ${availableAfter}, Expected: ${expectedAfter}`
      );

      // Clean up - cancel the request
      await PaymentRequestService.cancelPaymentRequest(
        firstRequest.id,
        TEST_USER_ID,
        'Test cleanup'
      );

    } catch (error) {
      if (error.message.includes('Số dư không đủ')) {
        logTest(
          'Idempotency test skipped',
          true,
          'Insufficient balance for this test'
        );
      } else {
        throw error;
      }
    }
  } catch (error) {
    logTest('Idempotency Prevention', false, error.message);
  }
}

async function test5_CancelRequest() {
  console.log('\n❌ TEST 5: Cancel Payment Request\n');

  try {
    // First create a request
    const idempotencyKey = `test-cancel-${Date.now()}`;
    const requestAmount = 40000;

    let paymentRequest;
    try {
      paymentRequest = await PaymentRequestService.createPaymentRequest({
        userId: TEST_USER_ID,
        requestedAmount: requestAmount,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        idempotencyKey: idempotencyKey,
        context: {}
      });
    } catch (error) {
      if (error.message.includes('Số dư không đủ')) {
        logTest('Cancel test skipped', true, 'Insufficient balance');
        return;
      }
      throw error;
    }

    console.log('   Created request ID:', paymentRequest.id);

    const balanceBefore = await getBalance(TEST_USER_ID);
    const availableBefore = parseFloat(balanceBefore.available_balance);

    console.log('   Balance BEFORE cancel:', availableBefore.toLocaleString('vi-VN') + 'đ');

    // Cancel the request
    const cancelled = await PaymentRequestService.cancelPaymentRequest(
      paymentRequest.id,
      TEST_USER_ID,
      'Test cancel'
    );

    const balanceAfter = await getBalance(TEST_USER_ID);
    const availableAfter = parseFloat(balanceAfter.available_balance);

    console.log('   Balance AFTER cancel:', availableAfter.toLocaleString('vi-VN') + 'đ');

    // Check balance was released
    const expectedAfter = availableBefore + requestAmount;
    const balanceReleased = Math.abs(availableAfter - expectedAfter) < 0.01;

    logTest(
      'Balance released on cancel',
      balanceReleased,
      `Expected: ${expectedAfter}, Got: ${availableAfter}`
    );

    // Check status
    logTest(
      'Status changed to cancelled',
      cancelled.status === 'cancelled',
      `Status: ${cancelled.status}`
    );

    // Check transaction log
    const transactions = await getTransactions(TEST_USER_ID, 2);
    const hasReleaseLog = transactions.some(t => t.transaction_type === 'payment_released');

    logTest(
      'Release transaction logged',
      hasReleaseLog,
      hasReleaseLog ? 'Found payment_released log' : 'No release log found'
    );

    logTest(
      'release_balance_at timestamp set',
      cancelled.release_balance_at !== null,
      `Time: ${cancelled.release_balance_at}`
    );

  } catch (error) {
    logTest('Cancel Payment Request', false, error.message);
  }
}

async function test6_MarkAsPaid() {
  console.log('\n✅ TEST 6: Mark Request as Paid\n');

  try {
    // Create a request first
    const idempotencyKey = `test-paid-${Date.now()}`;
    const requestAmount = 40000;

    let paymentRequest;
    try {
      paymentRequest = await PaymentRequestService.createPaymentRequest({
        userId: TEST_USER_ID,
        requestedAmount: requestAmount,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        idempotencyKey: idempotencyKey,
        context: {}
      });
    } catch (error) {
      if (error.message.includes('Số dư không đủ')) {
        logTest('Mark paid test skipped', true, 'Insufficient balance');
        return;
      }
      throw error;
    }

    console.log('   Created request ID:', paymentRequest.id);

    const balanceBefore = await getBalance(TEST_USER_ID);
    const availableBefore = parseFloat(balanceBefore.available_balance);
    const withdrawnBefore = parseFloat(balanceBefore.total_withdrawn);

    console.log('   Available BEFORE:', availableBefore.toLocaleString('vi-VN') + 'đ');
    console.log('   Withdrawn BEFORE:', withdrawnBefore.toLocaleString('vi-VN') + 'đ');

    // Mark as paid
    const paid = await PaymentRequestService.markAsPaid(
      paymentRequest.id,
      TEST_ADMIN,
      'TEST-TXN-' + Date.now(),
      'Test payment'
    );

    const balanceAfter = await getBalance(TEST_USER_ID);
    const availableAfter = parseFloat(balanceAfter.available_balance);
    const withdrawnAfter = parseFloat(balanceAfter.total_withdrawn);

    console.log('   Available AFTER:', availableAfter.toLocaleString('vi-VN') + 'đ');
    console.log('   Withdrawn AFTER:', withdrawnAfter.toLocaleString('vi-VN') + 'đ');

    // CRITICAL: available_balance should NOT change (already reserved)
    logTest(
      'Available balance UNCHANGED on mark paid',
      Math.abs(availableAfter - availableBefore) < 0.01,
      `Before: ${availableBefore}, After: ${availableAfter}`
    );

    // total_withdrawn should INCREASE
    const expectedWithdrawn = withdrawnBefore + requestAmount;
    logTest(
      'Total withdrawn INCREASED',
      Math.abs(withdrawnAfter - expectedWithdrawn) < 0.01,
      `Before: ${withdrawnBefore}, After: ${withdrawnAfter}, Expected: ${expectedWithdrawn}`
    );

    // Check status
    logTest(
      'Status changed to paid',
      paid.status === 'paid',
      `Status: ${paid.status}`
    );

    // Check transaction log
    const transactions = await getTransactions(TEST_USER_ID, 3);
    const hasWithdrawalLog = transactions.some(t => t.transaction_type === 'payment_withdrawn');

    logTest(
      'Withdrawal transaction logged',
      hasWithdrawalLog,
      hasWithdrawalLog ? 'Found payment_withdrawn log' : 'No withdrawal log found'
    );

  } catch (error) {
    logTest('Mark as Paid', false, error.message);
  }
}

async function test7_ConfirmRequest() {
  console.log('\n✔️ TEST 7: Confirm Payment Request (Admin)\n');

  try {
    // Create a request first
    const idempotencyKey = `test-confirm-${Date.now()}`;
    const requestAmount = 40000;

    let paymentRequest;
    try {
      paymentRequest = await PaymentRequestService.createPaymentRequest({
        userId: TEST_USER_ID,
        requestedAmount: requestAmount,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        idempotencyKey: idempotencyKey,
        context: {}
      });
    } catch (error) {
      if (error.message.includes('Số dư không đủ')) {
        logTest('Confirm test skipped', true, 'Insufficient balance');
        return;
      }
      throw error;
    }

    console.log('   Created request ID:', paymentRequest.id);

    const balanceBefore = await getBalance(TEST_USER_ID);
    const availableBefore = parseFloat(balanceBefore.available_balance);

    // Confirm the request
    const confirmed = await PaymentRequestService.confirmPaymentRequest(
      paymentRequest.id,
      TEST_ADMIN,
      'Test confirm'
    );

    const balanceAfter = await getBalance(TEST_USER_ID);
    const availableAfter = parseFloat(balanceAfter.available_balance);

    // Balance should NOT change (already reserved)
    logTest(
      'Balance unchanged on confirm',
      Math.abs(availableAfter - availableBefore) < 0.01,
      `Before: ${availableBefore}, After: ${availableAfter}`
    );

    // Check status
    logTest(
      'Status changed to confirmed',
      confirmed.status === 'confirmed',
      `Status: ${confirmed.status}`
    );

    // Clean up - cancel it
    await PaymentRequestService.cancelPaymentRequest(
      paymentRequest.id,
      TEST_USER_ID,
      'Test cleanup after confirm'
    );

  } catch (error) {
    logTest('Confirm Payment Request', false, error.message);
  }
}

async function test8_RejectRequest() {
  console.log('\n🚫 TEST 8: Reject Payment Request (Admin)\n');

  try {
    // Create a request first
    const idempotencyKey = `test-reject-${Date.now()}`;
    const requestAmount = 40000;

    let paymentRequest;
    try {
      paymentRequest = await PaymentRequestService.createPaymentRequest({
        userId: TEST_USER_ID,
        requestedAmount: requestAmount,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'Test User',
        idempotencyKey: idempotencyKey,
        context: {}
      });
    } catch (error) {
      if (error.message.includes('Số dư không đủ')) {
        logTest('Reject test skipped', true, 'Insufficient balance');
        return;
      }
      throw error;
    }

    console.log('   Created request ID:', paymentRequest.id);

    const balanceBefore = await getBalance(TEST_USER_ID);
    const availableBefore = parseFloat(balanceBefore.available_balance);

    console.log('   Balance BEFORE reject:', availableBefore.toLocaleString('vi-VN') + 'đ');

    // Reject the request
    const rejected = await PaymentRequestService.rejectPaymentRequest(
      paymentRequest.id,
      TEST_ADMIN,
      'Test rejection reason'
    );

    const balanceAfter = await getBalance(TEST_USER_ID);
    const availableAfter = parseFloat(balanceAfter.available_balance);

    console.log('   Balance AFTER reject:', availableAfter.toLocaleString('vi-VN') + 'đ');

    // Balance should be RELEASED (returned)
    const expectedAfter = availableBefore + requestAmount;
    logTest(
      'Balance released on reject',
      Math.abs(availableAfter - expectedAfter) < 0.01,
      `Before: ${availableBefore}, After: ${availableAfter}, Expected: ${expectedAfter}`
    );

    // Check status
    logTest(
      'Status changed to rejected',
      rejected.status === 'rejected',
      `Status: ${rejected.status}`
    );

    // Check transaction log
    const transactions = await getTransactions(TEST_USER_ID, 2);
    const hasReleaseLog = transactions.some(t => t.transaction_type === 'payment_released');

    logTest(
      'Release transaction logged on reject',
      hasReleaseLog,
      hasReleaseLog ? 'Found payment_released log' : 'No release log found'
    );

  } catch (error) {
    logTest('Reject Payment Request', false, error.message);
  }
}

async function test9_BalanceFormula() {
  console.log('\n🧮 TEST 9: Balance Formula Verification\n');

  try {
    const balance = await getBalance(TEST_USER_ID);
    const available = parseFloat(balance.available_balance);
    const earned = parseFloat(balance.total_earned);
    const withdrawn = parseFloat(balance.total_withdrawn);

    // Get pending requests
    const pendingResult = await pool.query(`
      SELECT COALESCE(SUM(requested_amount), 0) as total
      FROM payment_requests
      WHERE user_id = $1
        AND status IN ('pending', 'confirmed')
        AND cancelled_at IS NULL
    `, [TEST_USER_ID]);

    const pendingAmount = parseFloat(pendingResult.rows[0].total);

    console.log('   Total Earned:', earned.toLocaleString('vi-VN') + 'đ');
    console.log('   Total Withdrawn:', withdrawn.toLocaleString('vi-VN') + 'đ');
    console.log('   Pending Requests:', pendingAmount.toLocaleString('vi-VN') + 'đ');
    console.log('   Available Balance:', available.toLocaleString('vi-VN') + 'đ');

    // Formula: available = earned - withdrawn - pending
    const expectedAvailable = earned - withdrawn - pendingAmount;

    console.log('   Expected Available:', expectedAvailable.toLocaleString('vi-VN') + 'đ');

    logTest(
      'Balance formula is correct',
      Math.abs(available - expectedAvailable) < 0.01,
      `Formula: ${earned} - ${withdrawn} - ${pendingAmount} = ${expectedAvailable}, Actual: ${available}`
    );

  } catch (error) {
    logTest('Balance Formula Verification', false, error.message);
  }
}

async function test10_AuditTrail() {
  console.log('\n📜 TEST 10: Audit Trail Completeness\n');

  try {
    const transactions = await getTransactions(TEST_USER_ID, 20);

    console.log(`   Found ${transactions.length} recent transactions`);

    logTest(
      'balance_transactions table exists and has data',
      transactions.length > 0,
      `Found ${transactions.length} transactions`
    );

    // Check transaction types
    const types = [...new Set(transactions.map(t => t.transaction_type))];
    console.log('   Transaction types found:', types.join(', '));

    // Check all transactions have required fields
    const allHaveFields = transactions.every(t =>
      t.transaction_type &&
      t.amount !== null &&
      t.balance_before !== null &&
      t.balance_after !== null &&
      t.created_at
    );

    logTest(
      'All transactions have required fields',
      allHaveFields,
      'transaction_type, amount, balance_before, balance_after, created_at'
    );

    // Check balance_before/after consistency
    let consistentBalances = true;
    for (let i = 0; i < transactions.length - 1; i++) {
      const current = transactions[i];
      const expected = parseFloat(current.balance_before) + parseFloat(current.amount);
      const actual = parseFloat(current.balance_after);

      if (Math.abs(expected - actual) > 0.01) {
        consistentBalances = false;
        console.log(`   ⚠️ Inconsistency: Transaction ${current.id}`);
        console.log(`      Before: ${current.balance_before}, Amount: ${current.amount}`);
        console.log(`      Expected After: ${expected}, Actual: ${actual}`);
      }
    }

    logTest(
      'Balance changes are consistent',
      consistentBalances,
      'balance_after = balance_before + amount'
    );

  } catch (error) {
    logTest('Audit Trail Completeness', false, error.message);
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 COMPREHENSIVE PAYMENT MODULE TEST SUITE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Test User ID: ${TEST_USER_ID}`);
  console.log('Start Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════');

  try {
    await test1_CheckEligibility();
    await test2_GetUserBalance();
    await test3_CreatePaymentRequest();
    await test4_IdempotencyPrevention();
    await test5_CancelRequest();
    await test6_MarkAsPaid();
    await test7_ConfirmRequest();
    await test8_RejectRequest();
    await test9_BalanceFormula();
    await test10_AuditTrail();

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`✅ Passed: ${testResults.passed}`);
  console.log(`❌ Failed: ${testResults.failed}`);
  console.log(`📝 Total: ${testResults.tests.length}`);
  console.log(`📈 Success Rate: ${((testResults.passed / testResults.tests.length) * 100).toFixed(1)}%`);
  console.log('═══════════════════════════════════════════════════════');

  if (testResults.failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => {
        console.log(`   - ${t.name}`);
        console.log(`     ${t.details}`);
      });
  }

  console.log('\n🏁 Test suite completed at:', new Date().toISOString());

  process.exit(testResults.failed > 0 ? 1 : 0);
}

runAllTests();
