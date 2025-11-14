/**
 * Quick test to check conversions data
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkData() {
  try {
    console.log('Checking conversions data...\n');

    const result = await pool.query(`
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

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkData();
