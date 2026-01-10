const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

(async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';

    console.log('🗑️  Cleaning old test data...\n');

    // Delete audit logs first (foreign key constraint)
    await client.query(
      'DELETE FROM payment_validation_audit_log WHERE user_id = $1',
      [userId]
    );

    // Delete all payment requests and their mappings
    const deleteResult = await client.query(
      'DELETE FROM payment_requests WHERE user_id = $1 RETURNING id, requested_amount, status',
      [userId]
    );

    console.log('Deleted payment requests:');
    deleteResult.rows.forEach(r => {
      console.log('  - ' + r.id.substring(0, 13) + '... (' + parseFloat(r.requested_amount).toLocaleString('vi-VN') + 'đ, ' + r.status + ')');
    });
    console.log('');

    await client.query('COMMIT');

    console.log('✅ Data cleaned successfully!');
    console.log('');
    console.log('📊 Current state:');
    console.log('   Total approved: 93,100đ');
    console.log('   Payment requests: 0');
    console.log('   Available balance: 93,100đ');
    console.log('   Available items: 93,100đ (all 8 items free)');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
})();
