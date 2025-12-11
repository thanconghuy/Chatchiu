const { pool } = require('../backend/config/database');

async function check() {
  try {
    // Check payment requests
    const requests = await pool.query(`
      SELECT id, requested_amount, status, cancelled_at, created_at
      FROM payment_requests
      WHERE user_id = (SELECT id FROM users WHERE email = 'mtkonline2018@gmail.com')
      ORDER BY created_at DESC
      LIMIT 10
    `);

    console.log('\n=== Payment Requests ===');
    requests.rows.forEach(r => {
      console.log(`ID: ${r.id.substring(0,8)}... | Amount: ${r.requested_amount} | Status: ${r.status} | Cancelled: ${r.cancelled_at ? 'YES' : 'NO'}`);
    });

    // Check mappings
    const mappings = await pool.query(`
      SELECT psrm.payment_request_id, COUNT(*) as item_count, SUM(sri.cashback_amount) as total_amount
      FROM payment_system_reconciliation_mapping psrm
      JOIN system_reconciliation_items sri ON psrm.system_reconciliation_item_id = sri.id
      WHERE sri.user_id = (SELECT id FROM users WHERE email = 'mtkonline2018@gmail.com')
      GROUP BY psrm.payment_request_id
    `);

    console.log('\n=== Payment Mappings ===');
    mappings.rows.forEach(m => {
      console.log(`Request: ${m.payment_request_id.substring(0,8)}... | Items: ${m.item_count} | Total: ${m.total_amount}`);
    });

    // Check which requests have mappings
    console.log('\n=== Cross Check ===');
    for (const req of requests.rows) {
      const hasMapping = mappings.rows.find(m => m.payment_request_id === req.id);
      const status = hasMapping ? `MAPPED (${hasMapping.total_amount})` : 'NO MAPPING';
      console.log(`${req.id.substring(0,8)}... [${req.cancelled_at ? 'CANCELLED' : req.status}] -> ${status}`);
    }

    // Check available balance
    const balance = await pool.query(`
      SELECT calculate_user_available_balance_from_system_recon(
        (SELECT id FROM users WHERE email = 'mtkonline2018@gmail.com')
      ) as available_balance
    `);

    console.log('\n=== Calculated Balance ===');
    console.log(`Available: ${balance.rows[0].available_balance}`);

    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

check();
