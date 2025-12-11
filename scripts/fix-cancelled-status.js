const { pool } = require('../backend/config/database');

async function fixCancelledStatus() {
  try {
    console.log('\n🔧 Fixing cancelled payment request statuses...\n');

    // Find all requests that are cancelled but still have status='pending'
    const findQuery = `
      SELECT id, requested_amount, status, cancelled_at
      FROM payment_requests
      WHERE cancelled_at IS NOT NULL
        AND status != 'cancelled'
    `;

    const result = await pool.query(findQuery);

    console.log(`Found ${result.rows.length} payment requests to fix:`);
    result.rows.forEach(r => {
      console.log(`  - ID: ${r.id.substring(0,8)}... | Amount: ${r.requested_amount} | Current Status: ${r.status}`);
    });

    if (result.rows.length === 0) {
      console.log('\n✅ No records to fix!');
      await pool.end();
      return;
    }

    // Update their status to 'cancelled'
    const updateQuery = `
      UPDATE payment_requests
      SET status = 'cancelled'
      WHERE cancelled_at IS NOT NULL
        AND status != 'cancelled'
      RETURNING id, requested_amount, status
    `;

    const updateResult = await pool.query(updateQuery);

    console.log(`\n✅ Updated ${updateResult.rows.length} records:`);
    updateResult.rows.forEach(r => {
      console.log(`  - ID: ${r.id.substring(0,8)}... | Status: ${r.status}`);
    });

    await pool.end();
    console.log('\n✅ Fix completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

fixCancelledStatus();
