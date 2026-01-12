const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');

async function checkData() {
  try {
    // Get a sample reconciliation ID
    const reconResult = await pool.query(`
      SELECT id, period_label
      FROM system_reconciliations
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (reconResult.rows.length === 0) {
      console.log('No reconciliation records found');
      process.exit(0);
    }

    const recon = reconResult.rows[0];
    console.log('Latest Reconciliation:');
    console.log(`  ID: ${recon.id}`);
    console.log(`  Period: ${recon.period_label}`);
    console.log('');

    // Check items for this reconciliation
    const itemsResult = await pool.query(`
      SELECT
        sri.id,
        sri.system_conversion_id,
        sri.conversion_id,
        sc.order_code as system_order_code,
        c.order_code as access_order_code
      FROM system_reconciliation_items sri
      LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      LEFT JOIN conversions c ON sri.conversion_id = c.id
      WHERE sri.system_reconciliation_id = $1
      LIMIT 5
    `, [recon.id]);

    console.log(`Found ${itemsResult.rows.length} sample items:`);
    itemsResult.rows.forEach((item, i) => {
      console.log(`  ${i + 1}. Item ID: ${item.id}`);
      console.log(`     system_conversion_id: ${item.system_conversion_id || 'NULL'}`);
      console.log(`     conversion_id: ${item.conversion_id || 'NULL'}`);
      console.log(`     system_order_code: ${item.system_order_code || 'NULL'}`);
      console.log(`     access_order_code: ${item.access_order_code || 'NULL'}`);
      console.log('');
    });

    // Check a random system_conversion to see if it has order_code
    const scResult = await pool.query(`
      SELECT id, order_code, merchant_name
      FROM system_conversions
      WHERE order_code IS NOT NULL
      LIMIT 3
    `);

    console.log('\nSample system_conversions with order_code:');
    scResult.rows.forEach((sc, i) => {
      console.log(`  ${i + 1}. ID: ${sc.id}`);
      console.log(`     order_code: ${sc.order_code}`);
      console.log(`     merchant: ${sc.merchant_name}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkData();
