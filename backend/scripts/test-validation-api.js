const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
    const requestedAmount = 40000;

    console.log('🧪 Testing validation function...\n');

    const result = await client.query(
      `SELECT * FROM validate_payment_request_creation($1::UUID, $2::DECIMAL)`,
      [userId, requestedAmount]
    );

    const validation = result.rows[0];

    console.log('📋 Validation Result:');
    console.log('   is_valid:', validation.is_valid);
    console.log('   available_balance:', validation.available_balance);
    console.log('   error_code:', validation.error_code);
    console.log('   error_message:', validation.error_message);
    console.log('   has_pending_request:', validation.has_pending_request);
    console.log('   min_amount:', validation.min_amount);
    console.log('');

    if (validation.is_valid) {
      console.log('✅ Validation PASSED!');
    } else {
      console.log('❌ Validation FAILED!');
      console.log('   Error:', validation.error_message);
    }

  } finally {
    client.release();
    await pool.end();
  }
})();
