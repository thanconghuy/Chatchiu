const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');

async function checkDecemberRecon() {
  try {
    // Find December 2025 reconciliation
    const reconResult = await pool.query(`
      SELECT id, period_label, status
      FROM system_reconciliations
      WHERE period_label LIKE '%12/2025%' OR period_label LIKE '%Tháng 12%'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    if (reconResult.rows.length === 0) {
      console.log('No December 2025 reconciliation found');
      console.log('\nAll available reconciliations:');
      const allRecon = await pool.query(`
        SELECT id, period_label, created_at
        FROM system_reconciliations
        ORDER BY created_at DESC
        LIMIT 10
      `);
      allRecon.rows.forEach(r => {
        console.log(`  - ${r.period_label} (${r.id})`);
      });
      process.exit(0);
    }

    const recon = reconResult.rows[0];
    console.log('Found December 2025 Reconciliation:');
    console.log(`  ID: ${recon.id}`);
    console.log(`  Period: ${recon.period_label}`);
    console.log(`  Status: ${recon.status}`);
    console.log('');

    // Get items for this reconciliation
    const itemsResult = await pool.query(`
      SELECT
        sri.*,
        sc.order_code as system_order_code,
        c.order_code as access_order_code
      FROM system_reconciliation_items sri
      LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      LEFT JOIN conversions c ON sri.conversion_id = c.id
      WHERE sri.system_reconciliation_id = $1
      LIMIT 5
    `, [recon.id]);

    console.log(`Found ${itemsResult.rows.length} sample items for December:`);
    console.log('');

    itemsResult.rows.forEach((item, i) => {
      console.log(`Item ${i + 1}:`);
      console.log(`  ID: ${item.id}`);
      console.log(`  system_conversion_id: ${item.system_conversion_id || 'NULL'}`);
      console.log(`  conversion_id: ${item.conversion_id || 'NULL'}`);
      console.log(`  system_order_code: ${item.system_order_code || 'NULL'}`);
      console.log(`  access_order_code: ${item.access_order_code || 'NULL'}`);
      console.log(`  merchant_name: ${item.merchant_name}`);
      console.log('');
    });

    // Now test the exact API query
    console.log('\nTesting exact API query:');
    const page = 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const params = [recon.id];
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

    const apiResult = await pool.query(itemsQuery, params);

    console.log(`API Query returned ${apiResult.rows.length} items`);
    console.log('');

    apiResult.rows.slice(0, 3).forEach((item, i) => {
      console.log(`API Item ${i + 1}:`);
      console.log(`  order_code field: "${item.order_code}"`);
      console.log(`  conversion_id: ${item.conversion_id || 'NULL'}`);
      console.log(`  merchant_name: ${item.merchant_name}`);
      console.log('');
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkDecemberRecon();
