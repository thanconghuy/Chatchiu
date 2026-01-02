require('dotenv').config();
const { pool } = require('./backend/config/database');

async function checkAllPayments() {
  try {
    console.log('🔍 Checking all payment requests...\n');

    const query = `
      SELECT
        pr.*,
        u.full_name,
        u.email,
        (SELECT COUNT(*) FROM payment_reconciliation_mapping WHERE payment_request_id = pr.id) as items_count,
        (SELECT COALESCE(SUM(cashback_amount), 0) FROM payment_reconciliation_mapping WHERE payment_request_id = pr.id) as total_from_items
      FROM payment_requests pr
      LEFT JOIN users u ON u.id = pr.user_id
      ORDER BY pr.created_at DESC
      LIMIT 20
    `;

    const result = await pool.query(query);
    console.log(`Found ${result.rows.length} payment requests:\n`);

    for (const pr of result.rows) {
      console.log(`ID: ${pr.id}`);
      console.log(`  User: ${pr.full_name} (${pr.email})`);
      console.log(`  Amount: ${pr.requested_amount} VNĐ`);
      console.log(`  Status: ${pr.status}`);
      console.log(`  Items count: ${pr.items_count}`);
      console.log(`  Total from items: ${pr.total_from_items} VNĐ`);
      console.log(`  Cancelled: ${pr.cancelled_at ? 'Yes' : 'No'}`);
      console.log(`  Created: ${pr.created_at}`);
      console.log('');
    }

    // Check payment_reconciliation_mapping table
    console.log('\n🔍 Checking payment_reconciliation_mapping table...\n');

    const mappingQuery = `
      SELECT COUNT(*) as total FROM payment_reconciliation_mapping
    `;
    const mappingResult = await pool.query(mappingQuery);
    console.log(`Total records in payment_reconciliation_mapping: ${mappingResult.rows[0].total}`);

    if (mappingResult.rows[0].total > 0) {
      const sampleQuery = `
        SELECT
          prm.*,
          pr.status as payment_status,
          sri.merchant_name
        FROM payment_reconciliation_mapping prm
        LEFT JOIN payment_requests pr ON pr.id = prm.payment_request_id
        LEFT JOIN system_reconciliation_items sri ON sri.id = prm.reconciliation_item_id
        LIMIT 10
      `;

      const sampleResult = await pool.query(sampleQuery);
      console.log(`\nSample records from payment_reconciliation_mapping:\n`);

      for (const record of sampleResult.rows) {
        console.log(`  Payment Request ID: ${record.payment_request_id}`);
        console.log(`    Payment Status: ${record.payment_status}`);
        console.log(`    Merchant: ${record.merchant_name}`);
        console.log(`    Cashback: ${record.cashback_amount} VNĐ`);
        console.log('');
      }
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkAllPayments();
