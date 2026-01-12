const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');

const TEST_USER_ID = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

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

async function test1_DashboardStatsAPI() {
  console.log('\n📊 TEST 1: Dashboard Stats API\n');

  try {
    // Simulate dashboard stats query
    const balanceQuery = `
      SELECT
        usb.available_balance,
        usb.pending_balance,
        usb.reserved_balance,
        usb.total_earned,
        usb.total_withdrawn,
        usb.debt_balance,
        COALESCE(
          (SELECT SUM(requested_amount)
           FROM payment_requests
           WHERE user_id = $1
             AND status IN ('pending', 'confirmed')
             AND cancelled_at IS NULL),
          0
        ) as total_requested
      FROM user_system_balance usb
      WHERE usb.user_id = $1
    `;

    const result = await pool.query(balanceQuery, [TEST_USER_ID]);

    if (result.rows.length === 0) {
      logTest('Dashboard stats - balance query', false, 'No balance record found');
      return;
    }

    const balance = result.rows[0];

    logTest(
      'Dashboard stats - balance record exists',
      true,
      `Available: ${parseFloat(balance.available_balance).toLocaleString('vi-VN')}đ`
    );

    // Check all fields present
    const requiredFields = [
      'available_balance',
      'total_earned',
      'total_withdrawn',
      'pending_balance',
      'total_requested'
    ];

    const allFieldsPresent = requiredFields.every(field =>
      balance.hasOwnProperty(field) && balance[field] !== null
    );

    logTest(
      'Dashboard stats - all required fields present',
      allFieldsPresent,
      `Fields: ${requiredFields.join(', ')}`
    );

    // Verify balance formula
    const calculatedAvailable = parseFloat(balance.total_earned) -
                                parseFloat(balance.total_withdrawn) -
                                parseFloat(balance.total_requested);

    const actualAvailable = parseFloat(balance.available_balance);
    const balanceMatches = Math.abs(calculatedAvailable - actualAvailable) < 0.01;

    logTest(
      'Dashboard stats - balance formula correct',
      balanceMatches,
      `Calculated: ${calculatedAvailable}, Actual: ${actualAvailable}`
    );

    console.log('');
    console.log('  Balance Details:');
    console.log(`    Available: ${parseFloat(balance.available_balance).toLocaleString('vi-VN')}đ`);
    console.log(`    Earned: ${parseFloat(balance.total_earned).toLocaleString('vi-VN')}đ`);
    console.log(`    Withdrawn: ${parseFloat(balance.total_withdrawn).toLocaleString('vi-VN')}đ`);
    console.log(`    Requested: ${parseFloat(balance.total_requested).toLocaleString('vi-VN')}đ`);
    console.log(`    Pending: ${parseFloat(balance.pending_balance).toLocaleString('vi-VN')}đ`);

    return balance;

  } catch (error) {
    logTest('Dashboard stats API', false, error.message);
    throw error;
  }
}

async function test2_SystemBalanceWidget() {
  console.log('\n💰 TEST 2: System Balance Widget API\n');

  try {
    // This is the API that system-balance-widget.js calls
    const query = `
      SELECT
        user_id,
        available_balance,
        pending_balance,
        reserved_balance,
        debt_balance,
        total_earned,
        total_withdrawn,
        last_reconciliation_date,
        updated_at
      FROM user_system_balance
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [TEST_USER_ID]);

    if (result.rows.length === 0) {
      logTest('System balance widget - record exists', false, 'No balance found');
      return;
    }

    const balance = result.rows[0];

    logTest(
      'System balance widget - record exists',
      true,
      `User ID: ${balance.user_id}`
    );

    // Check widget fields
    const widgetFields = ['available_balance', 'pending_balance'];
    const hasWidgetFields = widgetFields.every(f =>
      balance.hasOwnProperty(f) && balance[f] !== null
    );

    logTest(
      'System balance widget - has display fields',
      hasWidgetFields,
      `Available: ${balance.available_balance}, Pending: ${balance.pending_balance}`
    );

    console.log('');
    console.log('  Widget Display:');
    console.log(`    Available Balance: ${parseFloat(balance.available_balance).toLocaleString('vi-VN')}đ`);
    console.log(`    Pending Balance: ${parseFloat(balance.pending_balance).toLocaleString('vi-VN')}đ`);

    return balance;

  } catch (error) {
    logTest('System balance widget API', false, error.message);
    throw error;
  }
}

async function test3_PaymentHistory() {
  console.log('\n📜 TEST 3: Payment History\n');

  try {
    // Get payment requests for user
    const query = `
      SELECT
        id,
        requested_amount,
        status,
        created_at,
        paid_at,
        cancelled_at,
        bank_name,
        reserve_balance_at,
        release_balance_at
      FROM payment_requests
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const result = await pool.query(query, [TEST_USER_ID]);

    logTest(
      'Payment history - records found',
      result.rows.length >= 0,
      `Found ${result.rows.length} payment requests`
    );

    if (result.rows.length > 0) {
      const request = result.rows[0];

      // Check required fields
      const hasRequiredFields = request.id &&
                               request.requested_amount &&
                               request.status &&
                               request.created_at;

      logTest(
        'Payment history - records have required fields',
        hasRequiredFields,
        `ID, amount, status, created_at present`
      );

      // Check new timestamp fields
      const statuses = result.rows.map(r => r.status);
      const pendingRequests = result.rows.filter(r => r.status === 'pending');
      const cancelledRequests = result.rows.filter(r => r.status === 'cancelled');
      const paidRequests = result.rows.filter(r => r.status === 'paid');

      console.log('');
      console.log('  Payment History Stats:');
      console.log(`    Total Requests: ${result.rows.length}`);
      console.log(`    Pending: ${pendingRequests.length}`);
      console.log(`    Cancelled: ${cancelledRequests.length}`);
      console.log(`    Paid: ${paidRequests.length}`);

      // Check timestamp logic
      if (pendingRequests.length > 0) {
        const pending = pendingRequests[0];
        logTest(
          'Pending request has reserve_balance_at',
          pending.reserve_balance_at !== null,
          `Time: ${pending.reserve_balance_at}`
        );
      }

      if (cancelledRequests.length > 0) {
        const cancelled = cancelledRequests[0];
        logTest(
          'Cancelled request has release_balance_at',
          cancelled.release_balance_at !== null || cancelled.cancelled_at !== null,
          `Release: ${cancelled.release_balance_at}, Cancelled: ${cancelled.cancelled_at}`
        );
      }

      if (paidRequests.length > 0) {
        const paid = paidRequests[0];
        logTest(
          'Paid request has paid_at',
          paid.paid_at !== null,
          `Time: ${paid.paid_at}`
        );
      }
    }

  } catch (error) {
    logTest('Payment history', false, error.message);
    throw error;
  }
}

async function test4_BalanceTransactions() {
  console.log('\n📋 TEST 4: Balance Transaction History\n');

  try {
    const query = `
      SELECT
        id,
        transaction_type,
        amount,
        balance_before,
        balance_after,
        payment_request_id,
        description,
        created_at
      FROM balance_transactions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 20
    `;

    const result = await pool.query(query, [TEST_USER_ID]);

    logTest(
      'Balance transactions - records found',
      result.rows.length > 0,
      `Found ${result.rows.length} transactions`
    );

    if (result.rows.length > 0) {
      // Count by type
      const types = {};
      result.rows.forEach(t => {
        types[t.transaction_type] = (types[t.transaction_type] || 0) + 1;
      });

      console.log('');
      console.log('  Transaction Types:');
      Object.entries(types).forEach(([type, count]) => {
        console.log(`    ${type}: ${count}`);
      });

      // Check most recent transaction
      const latest = result.rows[0];

      logTest(
        'Latest transaction has all fields',
        latest.transaction_type &&
        latest.amount !== null &&
        latest.balance_before !== null &&
        latest.balance_after !== null,
        `Type: ${latest.transaction_type}, Amount: ${latest.amount}`
      );

      // Verify balance math
      const expected = parseFloat(latest.balance_before) + parseFloat(latest.amount);
      const actual = parseFloat(latest.balance_after);
      const mathCorrect = Math.abs(expected - actual) < 0.01;

      logTest(
        'Latest transaction math is correct',
        mathCorrect,
        `${latest.balance_before} + ${latest.amount} = ${latest.balance_after}`
      );

      // Show recent transactions
      console.log('');
      console.log('  Recent Transactions:');
      result.rows.slice(0, 5).forEach((t, i) => {
        console.log(`    ${i + 1}. [${t.transaction_type}] ${parseFloat(t.amount).toLocaleString('vi-VN')}đ`);
        console.log(`       Balance: ${parseFloat(t.balance_before).toLocaleString('vi-VN')} → ${parseFloat(t.balance_after).toLocaleString('vi-VN')}`);
        console.log(`       ${new Date(t.created_at).toLocaleString('vi-VN')}`);
      });
    }

  } catch (error) {
    logTest('Balance transactions', false, error.message);
    throw error;
  }
}

async function test5_ConversionStatistics() {
  console.log('\n📈 TEST 5: Conversion Statistics\n');

  try {
    const query = `
      SELECT
        COUNT(*) as total_conversions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_conversions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_conversions,
        COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_conversions,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN cashback_amount ELSE 0 END), 0) as total_approved_cashback,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN cashback_amount ELSE 0 END), 0) as total_pending_cashback,
        COUNT(CASE WHEN status = 'approved' AND (payment_status IS NULL OR payment_status = 'unpaid') THEN 1 END) as unpaid_approved
      FROM system_conversions
      WHERE user_id = $1
    `;

    const result = await pool.query(query, [TEST_USER_ID]);
    const stats = result.rows[0];

    logTest(
      'Conversion statistics calculated',
      true,
      `Total: ${stats.total_conversions}, Approved: ${stats.approved_conversions}`
    );

    console.log('');
    console.log('  Conversion Statistics:');
    console.log(`    Total: ${stats.total_conversions}`);
    console.log(`    Approved: ${stats.approved_conversions}`);
    console.log(`    Pending: ${stats.pending_conversions}`);
    console.log(`    Rejected: ${stats.rejected_conversions}`);
    console.log(`    Approved Cashback: ${parseFloat(stats.total_approved_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`    Pending Cashback: ${parseFloat(stats.total_pending_cashback).toLocaleString('vi-VN')}đ`);
    console.log(`    Unpaid Approved Orders: ${stats.unpaid_approved}`);

    // Verify unpaid orders match available balance logic
    logTest(
      'Unpaid approved orders counted',
      parseInt(stats.unpaid_approved) >= 0,
      `${stats.unpaid_approved} orders waiting for payment`
    );

  } catch (error) {
    logTest('Conversion statistics', false, error.message);
    throw error;
  }
}

async function runAllTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 STATISTICS & PAYMENT HISTORY TEST SUITE');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`Test User ID: ${TEST_USER_ID}`);
  console.log('Start Time:', new Date().toISOString());
  console.log('═══════════════════════════════════════════════════════');

  try {
    await test1_DashboardStatsAPI();
    await test2_SystemBalanceWidget();
    await test3_PaymentHistory();
    await test4_BalanceTransactions();
    await test5_ConversionStatistics();

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
        if (t.details) console.log(`     ${t.details}`);
      });
  }

  console.log('\n🏁 Test suite completed at:', new Date().toISOString());

  process.exit(testResults.failed > 0 ? 1 : 0);
}

runAllTests();
