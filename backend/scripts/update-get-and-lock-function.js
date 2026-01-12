/**
 * Update get_and_lock_available_items_for_payment function to use system_conversion_id
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

async function updateFunction() {
  const client = await pool.connect();

  try {
    console.log('🔄 Updating get_and_lock_available_items_for_payment function...\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, '../migrations/017_enhanced_payment_validation.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // Extract the function definition
    const functionMatch = sql.match(/CREATE OR REPLACE FUNCTION get_and_lock_available_items_for_payment[\s\S]*?END;\s*\$\$ LANGUAGE plpgsql;/);

    if (!functionMatch) {
      throw new Error('Could not find function definition in migration file');
    }

    console.log('1. Dropping old function...');
    await client.query('DROP FUNCTION IF EXISTS get_and_lock_available_items_for_payment(UUID, DECIMAL);');
    console.log('   ✓ Old function dropped\n');

    console.log('2. Creating updated function...');
    await client.query(functionMatch[0]);
    console.log('   ✓ Function created with system_conversion_id support\n');

    // Test the function
    console.log('3. Testing function...');
    const testUserId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
    const testResult = await client.query(
      `SELECT * FROM get_and_lock_available_items_for_payment($1, $2) LIMIT 3`,
      [testUserId, 50000]
    );

    console.log(`   Found ${testResult.rows.length} available items:`);
    testResult.rows.forEach((row, i) => {
      console.log(`   ${i + 1}. Conversion ID: ${row.conversion_id || 'NULL'}`);
      console.log(`      Cashback: ${row.cashback_amount} VND`);
    });

    console.log('\n✅ Function update completed successfully!');
    console.log('   The function now returns system_conversion_id (or conversion_id as fallback)');

  } catch (error) {
    console.error('❌ Error updating function:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

updateFunction().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
