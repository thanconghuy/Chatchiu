const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';
const API_URL = 'http://localhost:3007/api';

// Test user (manhthuy)
const testUserId = 'a73b55e7-a176-4299-b4aa-387c5ee4488c';

console.log('🧪 Testing Payment Validation Balance Functionality\n');
console.log('='.repeat(70));

/**
 * Test Scenarios:
 * 1. ✅ Valid payment request with sufficient balance
 * 2. ❌ Payment request below minimum amount
 * 3. ❌ Payment request with insufficient balance
 * 4. ❌ Payment request with pending request already exists
 * 5. ⚡ Concurrent payment requests (race condition test)
 * 6. 🔄 Payment request then cancel (unlink items)
 */

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeRequest(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    return { response, data };
  } catch (error) {
    return { error: error.message };
  }
}

async function testScenario1_ValidPaymentRequest() {
  console.log('\n📝 Test 1: Valid Payment Request with Sufficient Balance');
  console.log('-'.repeat(70));

  const token = jwt.sign({ userId: testUserId }, jwtSecret, { expiresIn: '1h' });

  // Check eligibility first
  const { data: eligibility } = await makeRequest(`${API_URL}/payment-requests/eligibility`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  console.log('Eligibility:', {
    isEligible: eligibility.data.isEligible,
    availableBalance: eligibility.data.availableBalance?.toLocaleString('vi-VN') + ' VND',
    hasPendingRequest: eligibility.data.hasPendingRequest
  });

  if (!eligibility.data.isEligible) {
    console.log('⚠️ User is not eligible. Skipping test.');
    return;
  }

  // Create payment request
  const requestedAmount = Math.min(150000, eligibility.data.availableBalance);

  const { data: result } = await makeRequest(`${API_URL}/payment-requests`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requestedAmount,
      bankName: 'Vietcombank',
      bankAccountNumber: '1234567890',
      bankAccountName: 'NGUYEN VAN TEST',
      bankBranch: 'Ho Chi Minh',
      notes: 'Test validation - Valid request'
    })
  });

  if (result.success) {
    console.log('✅ Payment request created successfully');
    console.log(`   - ID: ${result.data.id}`);
    console.log(`   - Requested: ${requestedAmount.toLocaleString('vi-VN')} VND`);
    console.log(`   - Linked Items: ${result.data.linkedItemsCount}`);
    console.log(`   - Total Linked: ${result.data.totalLinkedAmount.toLocaleString('vi-VN')} VND`);

    // Store for cleanup
    return result.data.id;
  } else {
    console.log('❌ Failed:', result.message);
  }
}

async function testScenario2_BelowMinimumAmount() {
  console.log('\n📝 Test 2: Payment Request Below Minimum Amount');
  console.log('-'.repeat(70));

  const token = jwt.sign({ userId: testUserId }, jwtSecret, { expiresIn: '1h' });

  const { data: result } = await makeRequest(`${API_URL}/payment-requests`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requestedAmount: 50000, // Below 100,000 minimum
      bankName: 'Vietcombank',
      bankAccountNumber: '1234567890',
      bankAccountName: 'NGUYEN VAN TEST',
      notes: 'Test validation - Below minimum'
    })
  });

  if (!result.success) {
    console.log('✅ Correctly rejected:', result.message);
  } else {
    console.log('❌ Should have been rejected!');
  }
}

async function testScenario3_InsufficientBalance() {
  console.log('\n📝 Test 3: Payment Request with Insufficient Balance');
  console.log('-'.repeat(70));

  const token = jwt.sign({ userId: testUserId }, jwtSecret, { expiresIn: '1h' });

  // Check eligibility
  const { data: eligibility } = await makeRequest(`${API_URL}/payment-requests/eligibility`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const excessiveAmount = eligibility.data.availableBalance + 1000000; // 1M VND more

  const { data: result } = await makeRequest(`${API_URL}/payment-requests`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requestedAmount: excessiveAmount,
      bankName: 'Vietcombank',
      bankAccountNumber: '1234567890',
      bankAccountName: 'NGUYEN VAN TEST',
      notes: 'Test validation - Insufficient balance'
    })
  });

  if (!result.success) {
    console.log('✅ Correctly rejected:', result.message);
  } else {
    console.log('❌ Should have been rejected!');
  }
}

async function testScenario4_PendingRequestExists(existingPaymentId) {
  console.log('\n📝 Test 4: Payment Request When Pending Request Exists');
  console.log('-'.repeat(70));

  if (!existingPaymentId) {
    console.log('⚠️ No existing payment request. Skipping test.');
    return;
  }

  const token = jwt.sign({ userId: testUserId }, jwtSecret, { expiresIn: '1h' });

  // Try to create another request while one is pending
  const { data: result } = await makeRequest(`${API_URL}/payment-requests`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requestedAmount: 150000,
      bankName: 'Vietcombank',
      bankAccountNumber: '1234567890',
      bankAccountName: 'NGUYEN VAN TEST',
      notes: 'Test validation - Pending request exists'
    })
  });

  if (!result.success) {
    console.log('✅ Correctly rejected:', result.message);
  } else {
    console.log('❌ Should have been rejected!');
  }
}

async function testScenario5_ConcurrentRequests() {
  console.log('\n📝 Test 5: Concurrent Payment Requests (Race Condition Test)');
  console.log('-'.repeat(70));

  const token = jwt.sign({ userId: testUserId }, jwtSecret, { expiresIn: '1h' });

  // Check eligibility
  const { data: eligibility } = await makeRequest(`${API_URL}/payment-requests/eligibility`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (!eligibility.data.isEligible) {
    console.log('⚠️ User is not eligible. Skipping test.');
    return;
  }

  const requestedAmount = Math.min(200000, eligibility.data.availableBalance);

  console.log('Sending 3 concurrent requests...');

  // Send 3 requests simultaneously
  const requests = [1, 2, 3].map(i =>
    makeRequest(`${API_URL}/payment-requests`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requestedAmount,
        bankName: 'Vietcombank',
        bankAccountNumber: '1234567890',
        bankAccountName: 'NGUYEN VAN TEST',
        notes: `Test validation - Concurrent request ${i}`
      })
    })
  );

  const results = await Promise.all(requests);

  const succeeded = results.filter(r => r.data?.success).length;
  const failed = results.filter(r => !r.data?.success).length;

  console.log(`\n   ✅ Succeeded: ${succeeded}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (succeeded === 1) {
    console.log('✅ Race condition handled correctly - only 1 request succeeded');
    return results.find(r => r.data?.success)?.data?.data?.id;
  } else if (succeeded > 1) {
    console.log('❌ Race condition NOT handled - multiple requests succeeded!');
    return results.find(r => r.data?.success)?.data?.data?.id;
  } else {
    console.log('⚠️ All requests failed');
  }
}

async function testScenario6_CancelAndUnlink(paymentId) {
  console.log('\n📝 Test 6: Cancel Payment Request (Unlink Items)');
  console.log('-'.repeat(70));

  if (!paymentId) {
    console.log('⚠️ No payment ID to cancel. Skipping test.');
    return;
  }

  const token = jwt.sign({ userId: testUserId }, jwtSecret, { expiresIn: '1h' });

  // Get linked items before cancel
  const { data: itemsBefore } = await makeRequest(
    `${API_URL}/payment-requests/${paymentId}/items`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  console.log(`Items before cancel: ${itemsBefore.data?.itemsCount || 0}`);

  // Cancel the payment request
  const { data: cancelResult } = await makeRequest(
    `${API_URL}/payment-requests/${paymentId}`,
    {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    }
  );

  if (cancelResult.success) {
    console.log('✅ Payment request cancelled successfully');
    console.log('   Items should be unlinked and available again');

    // Verify items are available again by checking eligibility
    await sleep(500); // Small delay for database consistency

    const { data: eligibility } = await makeRequest(`${API_URL}/payment-requests/eligibility`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    console.log(`   Available balance after cancel: ${eligibility.data.availableBalance.toLocaleString('vi-VN')} VND`);
  } else {
    console.log('❌ Cancel failed:', cancelResult.message);
  }
}

async function runTests() {
  let paymentId = null;

  try {
    // Test 1: Valid request
    paymentId = await testScenario1_ValidPaymentRequest();
    await sleep(1000);

    // Test 2: Below minimum
    await testScenario2_BelowMinimumAmount();
    await sleep(1000);

    // Test 3: Insufficient balance
    await testScenario3_InsufficientBalance();
    await sleep(1000);

    // Test 4: Pending request exists
    await testScenario4_PendingRequestExists(paymentId);
    await sleep(1000);

    // Clean up before concurrent test
    if (paymentId) {
      const token = jwt.sign({ userId: testUserId }, jwtSecret, { expiresIn: '1h' });
      await makeRequest(`${API_URL}/payment-requests/${paymentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      await sleep(1000);
    }

    // Test 5: Concurrent requests (race condition)
    paymentId = await testScenario5_ConcurrentRequests();
    await sleep(1000);

    // Test 6: Cancel and unlink
    await testScenario6_CancelAndUnlink(paymentId);

    console.log('\n' + '='.repeat(70));
    console.log('✅ All tests completed!\n');

  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    console.error(error.stack);
  }
}

runTests().catch(console.error);
