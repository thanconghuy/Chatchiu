const { pool } = require('./backend/config/database');

async function debugQuery() {
  try {
    const userId = 'eb06669c-03c7-497d-a139-1e89c2a9df58';

    console.log('=== Testing Reconciliation Query ===');
    console.log('User ID:', userId);
    console.log('');

    // The query from systemReconciliationUser.js line 47-64
    const reconciliationsQuery = `
      SELECT
        sr.id,
        sr.period_label,
        sr.period_start,
        sr.period_end,
        sr.reconciliation_date,
        sr.status,
        sr.created_at,
        sr.finalized_at,
        COUNT(sri.id) as item_count,
        SUM(sri.cashback_amount) as total_cashback
      FROM system_reconciliations sr
      JOIN system_reconciliation_items sri ON sri.system_reconciliation_id = sr.id
      WHERE sri.user_id = $1
      GROUP BY sr.id, sr.period_label, sr.period_start, sr.period_end, sr.reconciliation_date, sr.status, sr.created_at, sr.finalized_at
      ORDER BY sr.created_at DESC
      LIMIT 20 OFFSET 0
    `;

    console.log('Running query...');
    const result = await pool.query(reconciliationsQuery, [userId]);

    console.log('Result rows:', result.rows.length);
    console.log(JSON.stringify(result.rows, null, 2));
    console.log('');

    // Check what's in system_reconciliation_items for this user
    console.log('=== Checking system_reconciliation_items ===');
    const itemsResult = await pool.query(`
      SELECT * FROM system_reconciliation_items WHERE user_id = $1
    `, [userId]);

    console.log('Items found:', itemsResult.rows.length);
    console.log(JSON.stringify(itemsResult.rows, null, 2));

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugQuery();
