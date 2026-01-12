const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { pool } = require('../config/database');

async function testUpdatedQuery() {
  try {
    // Get December 2025 reconciliation
    const reconResult = await pool.query(`
      SELECT id, period_label
      FROM system_reconciliations
      WHERE period_label LIKE '%12/2025%'
      LIMIT 1
    `);

    const reconId = reconResult.rows[0].id;
    console.log(`Testing updated query for: ${reconResult.rows[0].period_label}`);
    console.log('');

    // Use the exact new query
    const page = 1;
    const limit = 50;
    const offset = (page - 1) * limit;
    const params = [reconId];
    const whereClause = 'sri.system_reconciliation_id = $1';
    let paramIndex = 2;

    params.push(limit, offset);
    const itemsQuery = `
      SELECT
        sri.id,
        sri.system_reconciliation_id,
        sri.conversion_id,
        sri.system_conversion_id,
        sri.user_id,
        sri.merchant_id,
        sri.merchant_name,
        sri.order_time,
        sri.approval_time,
        sri.order_value,
        sri.commission_amount,
        sri.cashback_amount,
        sri.conversion_status,
        sri.api_reconciled,
        sri.api_reconciliation_id,
        sri.is_high_risk,
        sri.risk_score,
        sri.risk_notes,
        sri.created_at,
        sri.reconciled_at,
        u.full_name as user_name,
        u.email as user_email,
        COALESCE(sc.order_code, c.order_code, 'N/A') as order_code
      FROM system_reconciliation_items sri
      LEFT JOIN users u ON sri.user_id = u.id
      LEFT JOIN system_conversions sc ON sri.system_conversion_id = sc.id
      LEFT JOIN conversions c ON sri.conversion_id = c.id
      WHERE ${whereClause}
      ORDER BY sri.order_time DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    const result = await pool.query(itemsQuery, params);

    console.log(`✅ Query successful! Returned ${result.rows.length} items`);
    console.log('');

    // Check first 5 items
    result.rows.slice(0, 5).forEach((item, i) => {
      console.log(`Item ${i + 1}:`);
      console.log(`  order_code: "${item.order_code}"`);
      console.log(`  merchant_name: ${item.merchant_name}`);
      console.log(`  cashback_amount: ${item.cashback_amount}`);
      console.log(`  user_name: ${item.user_name}`);
      console.log('');
    });

    // Verify no N/A values when there should be order codes
    const naCount = result.rows.filter(item => item.order_code === 'N/A').length;
    console.log(`Items with order_code = 'N/A': ${naCount} / ${result.rows.length}`);

    if (naCount === 0) {
      console.log('✅ All items have valid order codes!');
    } else {
      console.log('⚠️  Some items have N/A order codes');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testUpdatedQuery();
