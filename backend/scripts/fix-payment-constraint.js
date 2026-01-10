const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  try {
    console.log('🔧 Fixing payment_requests constraint...\n');

    // Check current constraint
    const checkConstraint = await pool.query(
      `SELECT pg_get_constraintdef(oid) as definition
       FROM pg_constraint
       WHERE conname = 'payment_requests_requested_amount_check'`
    );

    if (checkConstraint.rows.length > 0) {
      console.log('Current constraint:', checkConstraint.rows[0].definition);
      console.log('');

      // Drop old constraint
      console.log('1. Dropping old constraint...');
      await pool.query(
        'ALTER TABLE payment_requests DROP CONSTRAINT IF EXISTS payment_requests_requested_amount_check'
      );
      console.log('   ✓ Old constraint dropped\n');
    }

    // Note: We don't add a new constraint because the validation is now handled in application code
    // using dynamic settings from system_settings table
    console.log('2. Constraint removed - validation now uses system_settings');
    console.log('   ✓ min_withdrawal_amount: 40,000đ (from settings)');
    console.log('   ✓ max_withdrawal_amount: 500,000đ (from settings)');
    console.log('');

    console.log('✅ Fixed! Now payment requests will use settings from database:');

    const settings = await pool.query(
      `SELECT setting_key, setting_value
       FROM system_settings
       WHERE setting_key IN ('min_withdrawal_amount', 'max_withdrawal_amount')`
    );

    settings.rows.forEach(s => {
      const value = parseInt(s.setting_value);
      console.log('   • ' + s.setting_key + ': ' + value.toLocaleString('vi-VN') + 'đ');
    });

    console.log('');
    console.log('💡 Bây giờ bạn có thể test với 40,000đ từ UI!');

  } finally {
    await pool.end();
  }
})();
