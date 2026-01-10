const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testEligibilityAPI() {
  try {
    console.log('🧪 Testing Eligibility API...\n');

    // You need to get a valid token first
    // For now, we'll test the service directly
    const paymentRequestService = require('../services/paymentRequestService');
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    const eligibility = await paymentRequestService.checkEligibility(userId);

    console.log('📋 Eligibility Result:');
    console.log('   isEligible:', eligibility.isEligible);
    console.log('   availableBalance:', eligibility.availableBalance?.toLocaleString('vi-VN') + 'đ');
    console.log('   totalConfirmedCashback:', eligibility.totalConfirmedCashback?.toLocaleString('vi-VN') + 'đ');
    console.log('   totalRequested:', eligibility.totalRequested?.toLocaleString('vi-VN') + 'đ');
    console.log('   hasPendingRequest:', eligibility.hasPendingRequest);
    console.log('   minAmount:', eligibility.minAmount?.toLocaleString('vi-VN') + 'đ');
    console.log('');

    if (eligibility.isEligible) {
      console.log('✅ User is ELIGIBLE to create payment request!');
    } else {
      console.log('❌ User is NOT eligible:');
      eligibility.reasons?.forEach(reason => console.log('   -', reason));
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testEligibilityAPI();
