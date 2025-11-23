const { pool } = require('./backend/config/database');

async function checkUserReconciliations() {
  try {
    const userId = 'eb06669c-03c7-497d-a139-1e89c2a9df58';

    // Check if user has any reconciliation items
    const result = await pool.query(`
      SELECT
        sri.*,
        sr.period_label,
        sr.status,
        c.order_code,
        c.cashback_amount
      FROM system_reconciliation_items sri
      JOIN system_reconciliations sr ON sr.id = sri.system_reconciliation_id
      JOIN conversions c ON c.id = sri.conversion_id
      JOIN clicks cl ON cl.id = c.click_id
      WHERE cl.user_id = $1
      ORDER BY sr.created_at DESC
    `, [userId]);

    console.log('User reconciliation items:', result.rows.length);
    console.log(JSON.stringify(result.rows, null, 2));

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUserReconciliations();
