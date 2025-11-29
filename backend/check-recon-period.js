const { pool } = require('./config/database');

async function checkReconPeriod() {
  try {
    const result = await pool.query(`
      SELECT
        id,
        period_label,
        period_start,
        period_end,
        status,
        created_at
      FROM system_reconciliations
      WHERE period_label LIKE '%Tháng 11/2025%'
      ORDER BY created_at DESC
    `);

    console.log('Reconciliation Periods:');
    console.log(JSON.stringify(result.rows, null, 2));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await pool.end();
  }
}

checkReconPeriod();
