require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkConversionStatus() {
  try {
    // Check recent system reconciliations
    const reconResult = await pool.query(`
      SELECT id, period_label, status, total_orders, total_cashback, created_at
      FROM system_reconciliations
      ORDER BY created_at DESC
      LIMIT 3
    `);

    console.log('=== RECENT SYSTEM RECONCILIATIONS ===');
    console.log(JSON.stringify(reconResult.rows, null, 2));

    if (reconResult.rows.length > 0) {
      const reconId = reconResult.rows[0].id;

      // Check items in latest reconciliation
      const itemsResult = await pool.query(`
        SELECT
          sri.id,
          sri.conversion_id,
          sri.cashback_amount,
          c.order_code,
          c.status,
          c.system_reconciliation_status,
          c.system_reconciliation_id,
          c.user_id
        FROM system_reconciliation_items sri
        JOIN conversions c ON sri.conversion_id = c.id
        WHERE sri.system_reconciliation_id = $1
        LIMIT 10
      `, [reconId]);

      console.log('\n=== ITEMS IN LATEST RECONCILIATION ===');
      console.log(JSON.stringify(itemsResult.rows, null, 2));

      // Check one specific conversion status
      if (itemsResult.rows.length > 0) {
        const convId = itemsResult.rows[0].conversion_id;

        const sysConvResult = await pool.query(`
          SELECT
            at_conversion_id,
            order_code,
            status,
            system_reconciliation_status,
            system_reconciliation_id,
            payment_status
          FROM system_conversions
          WHERE at_conversion_id = $1
        `, [convId]);

        console.log('\n=== SYSTEM_CONVERSIONS STATUS ===');
        console.log(JSON.stringify(sysConvResult.rows, null, 2));
      }
    }

    // Also check conversion in conversions table
    const convResult = await pool.query(`
      SELECT
        id,
        order_code,
        status,
        system_reconciliation_status,
        system_reconciliation_id,
        system_reconciled_at,
        user_id,
        cashback_amount
      FROM conversions
      WHERE order_code LIKE $1
      ORDER BY created_at DESC
      LIMIT 5
    `, ['%251I12JXVP4G7Y%']);

    console.log('\n=== SPECIFIC CONVERSION (251I12JXVP4G7Y) ===');
    console.log(JSON.stringify(convResult.rows, null, 2));

    if (convResult.rows.length > 0) {
      const convId = convResult.rows[0].id;

      // Check in system_conversions
      const sysConvResult = await pool.query(`
        SELECT
          at_conversion_id,
          order_code,
          status,
          system_reconciliation_status,
          system_reconciliation_id,
          system_reconciled_at,
          payment_status,
          payment_request_id
        FROM system_conversions
        WHERE at_conversion_id = $1
      `, [convId]);

      console.log('\n=== SYSTEM_CONVERSIONS TABLE ===');
      console.log(JSON.stringify(sysConvResult.rows, null, 2));

      // Check in system_reconciliation_items
      const itemsResult = await pool.query(`
        SELECT
          sri.id,
          sri.system_reconciliation_id,
          sri.conversion_id,
          sri.cashback_amount,
          sr.period_label,
          sr.status as recon_status
        FROM system_reconciliation_items sri
        JOIN system_reconciliations sr ON sri.system_reconciliation_id = sr.id
        WHERE sri.conversion_id = $1
      `, [convId]);

      console.log('\n=== SYSTEM_RECONCILIATION_ITEMS ===');
      console.log(JSON.stringify(itemsResult.rows, null, 2));
    }

    await pool.end();
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

checkConversionStatus();
