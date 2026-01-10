/**
 * Fix missing conversion_id in system_reconciliation_items
 * Match items with system_conversions based on user_id, merchant_name, cashback_amount, and order_time
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { pool } = require('../config/database');

async function fixMissingConversionIds() {
  const client = await pool.connect();

  try {
    console.log('🔧 Fixing missing conversion_id in system_reconciliation_items...\n');

    await client.query('BEGIN');

    // Drop constraints temporarily
    console.log('1. Dropping constraints temporarily...');
    await client.query('ALTER TABLE system_reconciliation_items DROP CONSTRAINT IF EXISTS check_at_least_one_conversion_id');
    await client.query('ALTER TABLE system_reconciliation_items DROP CONSTRAINT IF EXISTS unique_conversion_per_reconciliation');

    // Update system_conversion_id by matching with system_conversions
    // conversion_id references old API conversions table, system_conversion_id references new system_conversions
    console.log('2. Updating system_conversion_id for testuser...');
    const testUserId = 'f7721918-7f35-41a8-90dd-df47deb13d4e';
    const updateQuery = `
      UPDATE system_reconciliation_items sri
      SET system_conversion_id = sc.id
      FROM system_conversions sc
      WHERE sri.user_id = sc.user_id
        AND sri.user_id = $1
        AND sri.merchant_name = sc.merchant_name
        AND sri.cashback_amount = sc.cashback_amount
        AND DATE_TRUNC('second', sri.order_time) = DATE_TRUNC('second', sc.order_time)
        AND sri.system_conversion_id IS NULL
      RETURNING sri.id, sri.conversion_id, sri.system_conversion_id, sri.merchant_name, sri.cashback_amount
    `;

    const result = await client.query(updateQuery, [testUserId]);

    // Re-add constraints
    console.log('3. Re-adding constraints...');
    await client.query(`
      ALTER TABLE system_reconciliation_items
      ADD CONSTRAINT check_at_least_one_conversion_id
      CHECK (conversion_id IS NOT NULL OR system_conversion_id IS NOT NULL)
    `);
    await client.query(`
      ALTER TABLE system_reconciliation_items
      ADD CONSTRAINT unique_conversion_per_reconciliation
      UNIQUE (system_reconciliation_id, conversion_id)
    `);

    await client.query('COMMIT');

    console.log(`\n✅ Updated ${result.rows.length} items with conversion_id:\n`);

    result.rows.forEach((row, i) => {
      console.log(`${i + 1}. Item: ${row.id}`);
      console.log(`   Conversion ID: ${row.conversion_id}`);
      console.log(`   System Conversion ID: ${row.system_conversion_id}`);
      console.log(`   Merchant: ${row.merchant_name}`);
      console.log(`   Cashback: ${row.cashback_amount} VND`);
      console.log('');
    });

    // Verify no NULL conversion_ids remain
    const checkQuery = `
      SELECT COUNT(*) as count
      FROM system_reconciliation_items sri
      INNER JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
      WHERE sri.conversion_id IS NULL
        AND sr.status IN ('finalized', 'paid')
    `;
    const checkResult = await client.query(checkQuery);

    if (checkResult.rows[0].count > 0) {
      console.log(`⚠️  Still ${checkResult.rows[0].count} items with NULL conversion_id`);
    } else {
      console.log('✅ All items now have conversion_id!');
    }

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error fixing conversion_ids:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixMissingConversionIds();
