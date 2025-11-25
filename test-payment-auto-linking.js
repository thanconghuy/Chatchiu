const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const jwtSecret = process.env.JWT_SECRET || 'SUPER_SECRET_KEY_1234567890_CHANGE_ME_IN_PRODUCTION';
const API_URL = 'http://localhost:3007/api';

// Test user (manhthuy)
const testUserId = 'a73b55e7-a176-4299-b4aa-387c5ee4488c';

console.log('🧪 Testing Payment Auto-Linking Functionality\n');
console.log('='.repeat(60));

async function testAutoLinking() {
  try {
    // Generate token
    const token = jwt.sign({ userId: testUserId }, jwtSecret, { expiresIn: '1h' });

    console.log('\n📝 Step 1: Check eligibility');
    console.log('-'.repeat(60));

    const eligibilityRes = await fetch(`${API_URL}/payment-requests/eligibility`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const eligibility = await eligibilityRes.json();

    if (eligibility.success) {
      console.log('✅ Eligibility check successful:');
      console.log(`   - Is Eligible: ${eligibility.data.isEligible}`);
      console.log(`   - Available Balance: ${eligibility.data.availableBalance.toLocaleString('vi-VN')} VND`);
      console.log(`   - Has Pending Request: ${eligibility.data.hasPendingRequest}`);
      console.log(`   - Min Amount: ${eligibility.data.minAmount.toLocaleString('vi-VN')} VND`);

      if (!eligibility.data.isEligible) {
        console.log(`\n❌ Not eligible. Reasons:`);
        eligibility.data.reasons.forEach(reason => console.log(`   - ${reason}`));
        return;
      }
    } else {
      console.log('❌ Eligibility check failed:', eligibility.message);
      return;
    }

    console.log('\n📝 Step 2: Create payment request with auto-linking');
    console.log('-'.repeat(60));

    const requestedAmount = 150000; // 150,000 VND

    const createRes = await fetch(`${API_URL}/payment-requests`, {
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
        notes: 'Test payment auto-linking'
      })
    });

    const createResult = await createRes.json();

    if (createResult.success) {
      console.log('✅ Payment request created successfully:');
      console.log(`   - ID: ${createResult.data.id}`);
      console.log(`   - Requested Amount: ${createResult.data.requested_amount?.toLocaleString('vi-VN')} VND`);
      console.log(`   - Status: ${createResult.data.status}`);

      if (createResult.data.linkedItems) {
        console.log(`\n   📦 Linked Items (${createResult.data.linkedItemsCount}):`);
        createResult.data.linkedItems.forEach((item, idx) => {
          console.log(`   ${idx + 1}. Cashback: ${parseFloat(item.cashback_amount).toLocaleString('vi-VN')} VND`);
          console.log(`      Merchant: ${item.merchant_name}`);
          console.log(`      Period: ${item.period_label}`);
          console.log(`      Order Time: ${new Date(item.order_time).toLocaleDateString('vi-VN')}`);
        });
        console.log(`\n   💰 Total Linked Amount: ${createResult.data.totalLinkedAmount?.toLocaleString('vi-VN')} VND`);
      }

      const paymentRequestId = createResult.data.id;

      console.log('\n📝 Step 3: Get linked items');
      console.log('-'.repeat(60));

      const itemsRes = await fetch(`${API_URL}/payment-requests/${paymentRequestId}/items`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const itemsResult = await itemsRes.json();

      if (itemsResult.success) {
        console.log('✅ Retrieved linked items:');
        console.log(`   - Items Count: ${itemsResult.data.itemsCount}`);
        console.log(`   - Total Amount: ${itemsResult.data.totalAmount.toLocaleString('vi-VN')} VND`);
      } else {
        console.log('❌ Get items failed:', itemsResult.message);
      }

      console.log('\n📝 Step 4: Cancel payment request (should unlink items)');
      console.log('-'.repeat(60));

      const deleteRes = await fetch(`${API_URL}/payment-requests/${paymentRequestId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const deleteResult = await deleteRes.json();

      if (deleteResult.success) {
        console.log('✅ Payment request cancelled successfully');
        console.log('   Items should be unlinked and available again');
      } else {
        console.log('❌ Cancel failed:', deleteResult.message);
      }

    } else {
      console.log('❌ Payment request creation failed:', createResult.message);
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Test completed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

testAutoLinking();
