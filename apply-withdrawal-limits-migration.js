/**
 * Apply migration: Update withdrawal limits
 * Updates max_withdrawal_amount from 50,000,000 to 500,000 VND
 */

require('dotenv').config();
const { pool } = require('./backend/config/database');

async function applyMigration() {
  console.log('\n========================================');
  console.log('📊 Applying Withdrawal Limits Migration');
  console.log('========================================\n');

  try {
    // Check current value
    console.log('1. Checking current max_withdrawal_amount...');
    const currentResult = await pool.query(`
      SELECT setting_key, setting_value, description
      FROM system_settings
      WHERE setting_key = 'max_withdrawal_amount'
    `);

    if (currentResult.rows.length === 0) {
      console.log('❌ Setting not found in database!');
      console.log('   Creating setting...');

      await pool.query(`
        INSERT INTO system_settings (setting_key, setting_value, setting_type, description, category, is_editable)
        VALUES ('max_withdrawal_amount', '500000', 'number', 'Hạn mức rút tiền tối đa (VNĐ)', 'payment', true)
      `);

      console.log('✅ Setting created with value: 500,000 VND');
    } else {
      const current = currentResult.rows[0];
      console.log('   Current value:', parseInt(current.setting_value).toLocaleString('vi-VN'), 'VND');

      if (current.setting_value === '500000') {
        console.log('✅ Already up to date! No migration needed.');
        return;
      }

      // Update to 500,000
      console.log('\n2. Updating to 500,000 VND...');
      await pool.query(`
        UPDATE system_settings
        SET setting_value = '500000',
            description = 'Hạn mức rút tiền tối đa (VNĐ)',
            updated_at = CURRENT_TIMESTAMP
        WHERE setting_key = 'max_withdrawal_amount'
      `);

      console.log('✅ Updated successfully!');
    }

    // Verify the change
    console.log('\n3. Verifying update...');
    const verifyResult = await pool.query(`
      SELECT setting_key, setting_value, description, updated_at
      FROM system_settings
      WHERE setting_key = 'max_withdrawal_amount'
    `);

    const updated = verifyResult.rows[0];
    console.log('   New value:', parseInt(updated.setting_value).toLocaleString('vi-VN'), 'VND');
    console.log('   Updated at:', new Date(updated.updated_at).toLocaleString('vi-VN'));

    // Show all payment settings
    console.log('\n4. All payment settings:');
    const allSettings = await pool.query(`
      SELECT setting_key, setting_value, description
      FROM system_settings
      WHERE category = 'payment'
      ORDER BY setting_key
    `);

    console.log('');
    allSettings.rows.forEach(row => {
      const value = row.setting_type === 'number'
        ? parseInt(row.setting_value).toLocaleString('vi-VN') + ' VND'
        : row.setting_value;

      console.log(`   • ${row.description}`);
      console.log(`     ${row.setting_key}: ${value}`);
      console.log('');
    });

    console.log('========================================');
    console.log('✅ Migration completed successfully!');
    console.log('========================================\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run migration
applyMigration();
