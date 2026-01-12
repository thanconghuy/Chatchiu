const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');

async function testAPI() {
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

    const reconId = reconResult.rows[0].id;
    console.log('Testing API endpoint logic for reconciliation:');
    console.log(`  ID: ${reconId}`);
    console.log(`  Period: ${reconResult.rows[0].period_label}`);
    console.log('');

    // Simulate the exact query from systemReconciliationAdmin.js
    const page = 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const params = [reconId];
    const whereClause = 'sri.system_reconciliation_id = $1';
    let paramIndex = 2;

    params.push(limit, offset);
    const itemsQuery = `
      SELECT
        sri.*,
        u.full_name as user_name,
        u.email as user_email,
        COALESCE(sc.order_code, 'N/A') as order_code
      FROM system_reconciliation_items sri
      LEFT JOIN users u ON sri.user_id = u.id
      LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      WHERE ${whereClause}
      ORDER BY sri.order_time DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    console.log('Executing query:');
    console.log(itemsQuery);
    console.log('Params:', params);
    console.log('');

    const itemsResult = await pool.query(itemsQuery, params);

    console.log(`Found ${itemsResult.rows.length} items`);
    console.log('');

    // Show first 3 items
    itemsResult.rows.slice(0, 3).forEach((item, i) => {
      console.log(`Item ${i + 1}:`);
      console.log(`  ID: ${item.id}`);
      console.log(`  system_conversion_id: ${item.system_conversion_id}`);
      console.log(`  conversion_id: ${item.conversion_id}`);
      console.log(`  order_code: ${item.order_code}`);
      console.log(`  user_name: ${item.user_name}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testAPI();
