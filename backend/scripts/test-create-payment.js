const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

async function testCreatePayment() {
  try {
    console.log('🧪 Testing Create Payment Request API...\n');

    const paymentRequestService = require('../services/paymentRequestService');
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('1. Testing validation...');
    const PaymentSystemReconciliationService = require('../services/paymentSystemReconciliationService');

    const validation = await PaymentSystemReconciliationService.validatePaymentRequest(
      userId,
      40000
    );

    console.log('   Validation result:');
    console.log('   - is_valid:', validation.isValid);
    console.log('   - available_balance:', validation.availableBalance);
    console.log('   - error_code:', validation.errorCode);
    console.log('   - error_message:', validation.errorMessage);
    console.log('');

    if (!validation.isValid) {
      console.log('❌ Validation FAILED!');
      console.log('   Error:', validation.errorMessage);
      return;
    }

    console.log('✅ Validation PASSED!');
    console.log('');

    console.log('2. Testing auto-select items...');
    const autoSelectResult = await PaymentSystemReconciliationService.autoSelectItemsForPayment(
      userId,
      40000,
      true
    );

    console.log('   Auto-select result:');
    console.log('   - success:', autoSelectResult.success);
    console.log('   - selectedItems count:', autoSelectResult.selectedItems?.length || 0);
    console.log('   - totalAmount:', autoSelectResult.totalAmount);
    console.log('');

    if (!autoSelectResult.success) {
      console.log('❌ Auto-select FAILED!');
      console.log('   Error:', autoSelectResult.message);
      return;
    }

    console.log('✅ Auto-select PASSED!');
    console.log('');

    console.log('🎉 All pre-checks PASSED! Payment request can be created.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    process.exit(0);
  }
}

testCreatePayment();
