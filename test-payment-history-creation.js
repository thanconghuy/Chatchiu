require('dotenv').config();
const { pool } = require('./backend/config/database');

async function testPaymentHistoryCreation() {
  try {
    console.log('🔍 Checking paid payment requests...\n');

    // Get all paid payment requests
    const paidRequestsQuery = `
      SELECT
        pr.*,
        u.full_name,
        u.email,
        (SELECT COUNT(*) FROM payment_reconciliation_mapping WHERE payment_request_id = pr.id) as items_count
      FROM payment_requests pr
      LEFT JOIN users u ON u.id = pr.user_id
      WHERE pr.status = 'paid'
      ORDER BY pr.updated_at DESC
      LIMIT 5
    `;

    const paidResult = await pool.query(paidRequestsQuery);
    console.log(`Found ${paidResult.rows.length} paid payment requests:\n`);

    if (paidResult.rows.length === 0) {
      console.log('❌ No paid payment requests found. Need to mark a payment as paid first.');
      await pool.end();
      return;
    }

    for (const pr of paidResult.rows) {
      console.log(`Payment Request ID: ${pr.id}`);
      console.log(`  User: ${pr.full_name} (${pr.email})`);
      console.log(`  Amount: ${pr.requested_amount} VNĐ`);
      console.log(`  Status: ${pr.status}`);
      console.log(`  Items count: ${pr.items_count}`);
      console.log(`  Updated at: ${pr.updated_at}`);
      console.log('');

      // Get linked reconciliation items
      if (pr.items_count > 0) {
        const itemsQuery = `
          SELECT
            prm.*,
            sri.conversion_id,
            sri.merchant_name,
            sr.period_month
          FROM payment_reconciliation_mapping prm
          INNER JOIN system_reconciliation_items sri ON sri.id = prm.reconciliation_item_id
          INNER JOIN system_reconciliations sr ON sr.id = sri.system_reconciliation_id
          WHERE prm.payment_request_id = $1
          LIMIT 3
        `;

        const itemsResult = await pool.query(itemsQuery, [pr.id]);
        console.log(`  Linked items (showing ${Math.min(3, itemsResult.rows.length)} of ${pr.items_count}):`);

        for (const item of itemsResult.rows) {
          console.log(`    - Conversion ID: ${item.conversion_id}`);
          console.log(`      Merchant: ${item.merchant_name}`);
          console.log(`      Cashback: ${item.cashback_amount} VNĐ`);
          console.log(`      Period: ${item.period_month}`);
          console.log('');
        }
      }
    }

    // Check if payment history already exists for these payments
    console.log('\n🔍 Checking existing payment history...\n');

    const historyQuery = `
      SELECT
        uph.*,
        u.full_name,
        u.email,
        (SELECT COUNT(*) FROM user_payment_details WHERE payment_history_id = uph.id) as details_count
      FROM user_payment_history uph
      LEFT JOIN users u ON u.id = uph.user_id
      ORDER BY uph.created_at DESC
      LIMIT 5
    `;

    const historyResult = await pool.query(historyQuery);
    console.log(`Found ${historyResult.rows.length} payment history records:\n`);

    if (historyResult.rows.length === 0) {
      console.log('✅ No payment history exists yet - ready to test creation!');
    } else {
      for (const history of historyResult.rows) {
        console.log(`Payment History ID: ${history.id}`);
        console.log(`  User: ${history.full_name} (${history.email})`);
        console.log(`  Period: ${history.payment_period}`);
        console.log(`  Total Cashback: ${history.total_cashback} VNĐ`);
        console.log(`  Status: ${history.status}`);
        console.log(`  Details count: ${history.details_count}`);
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

testPaymentHistoryCreation();
