const { pool } = require('../backend/config/database');

(async () => {
  console.log('Checking payment requests...');
  const result = await pool.query('SELECT id, bank_account_number, bank_account_name, status FROM payment_requests ORDER BY created_at DESC');

  console.log('\n=== CURRENT PAYMENT REQUESTS ===');
  result.rows.forEach(row => {
    console.log(`ID: ${row.id.substring(0, 8)}... | Status: ${row.status} | Account: ${row.bank_account_number} | Name: ${row.bank_account_name}`);
  });

  console.log(`\nTotal: ${result.rows.length} payment requests`);

  await pool.end();
})();
