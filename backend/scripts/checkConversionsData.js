/**
 * Check conversions data to see status fields
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const db = require('../config/database');

async function checkData() {
  try {
    console.log('Checking conversions data...\n');

    const result = await db.query(`
      SELECT
        order_code,
        status,
        order_approved,
        products_count,
        order_pending,
        order_reject
      FROM conversions
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('Found', result.rows.length, 'conversions:\n');

    result.rows.forEach((row, index) => {
      console.log(`${index + 1}. Order: ${row.order_code || 'N/A'}`);
      console.log(`   Status: ${row.status}`);
      console.log(`   order_approved: ${row.order_approved}`);
      console.log(`   products_count: ${row.products_count}`);
      console.log(`   order_pending: ${row.order_pending}`);
      console.log(`   order_reject: ${row.order_reject}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkData();
