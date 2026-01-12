const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const service = require('../services/paymentRequestService');

async function testEligibility() {
  const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

  try {
    console.log('🧪 Testing checkEligibility API...\n');
    console.log('User ID:', userId);
    console.log('');

    const result = await service.checkEligibility(userId);

    console.log('✅ Eligibility Result:');
    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testEligibility();
