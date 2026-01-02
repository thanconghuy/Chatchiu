require('dotenv').config();
const { pool } = require('./backend/config/database');

async function checkPendingPayments() {
  try {
    console.log('🔍 Checking pending payment requests with linked items...\n');

    const query = `
      SELECT
        pr.*,
        u.full_name,
        u.email,
        (SELECT COUNT(*) FROM payment_reconciliation_mapping WHERE payment_request_id = pr.id) as items_count,
        (SELECT COALESCE(SUM(cashback_amount), 0) FROM payment_reconciliation_mapping WHERE payment_request_id = pr.id) as total_from_items
      FROM payment_requests pr
      LEFT JOIN users u ON u.id = pr.user_id
      WHERE pr.status = 'pending'
        AND pr.cancelled_at IS NULL
      ORDER BY pr.created_at DESC
      LIMIT 10
    `;

    const result = await pool.query(query);
    console.log(`Found ${result.rows.length} pending payment requests:\n`);

    for (const pr of result.rows) {
      console.log(`Payment Request ID: ${pr.id}`);
      console.log(`  User: ${pr.full_name} (${pr.email})`);
      console.log(`  Requested Amount: ${pr.requested_amount} VNĐ`);
      console.log(`  Status: ${pr.status}`);
      console.log(`  Items count: ${pr.items_count}`);
      console.log(`  Total from items: ${pr.total_from_items} VNĐ`);
      console.log(`  Created at: ${pr.created_at}`);

      // Show linked items if any
      if (pr.items_count > 0) {
        const itemsQuery = `
          SELECT
            prm.cashback_amount,
            sri.conversion_id,
            sri.merchant_name,
            sr.period_month,
            c.order_id
          FROM payment_reconciliation_mapping prm
          INNER JOIN system_reconciliation_items sri ON sri.id = prm.reconciliation_item_id
          INNER JOIN system_reconciliations sr ON sr.id = sri.system_reconciliation_id
          LEFT JOIN conversions c ON c.id = sri.conversion_id
          WHERE prm.payment_request_id = $1
          LIMIT 5
        `;

        const itemsResult = await pool.query(itemsQuery, [pr.id]);
        console.log(`\n  Linked items (showing ${Math.min(5, itemsResult.rows.length)} of ${pr.items_count}):`);

        for (const item of itemsResult.rows) {
          console.log(`    - Order ID: ${item.order_id || 'N/A'}`);
          console.log(`      Merchant: ${item.merchant_name}`);
          console.log(`      Cashback: ${item.cashback_amount} VNĐ`);
          console.log(`      Period: ${item.period_month}`);
        }
      }
      console.log('\n' + '='.repeat(80) + '\n');
    }

    await pool.end();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

checkPendingPayments();
